"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bills } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { logAction } from "@/lib/audit";

export interface ActionState {
  ok: boolean;
  error?: string;
}

/**
 * Resolve a quantity shortage via debit note or replacement received.
 *
 * Judgment call (the build spec captures resolution_type as data but
 * deliberately leaves the accounting mechanics out of scope, and doesn't
 * define a fourth grn_status beyond pending/ok/short): once Purchase
 * records how a shortage was settled — credited or made good — the
 * shortfall is administratively closed, so grn_status moves to 'ok' here.
 * That's what lets the bill proceed toward Accounts once the price side
 * also clears. Without this, a bill with any shortage would be stuck at
 * "vendor_issue" forever, even after it's genuinely resolved.
 */
export async function resolveShortageAction(
  billId: string,
  resolutionType: "debit_note" | "replacement_received",
  notes: string
): Promise<ActionState> {
  const actor = await requireRole("purchase");

  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.grnStatus !== "short") {
    return { ok: false, error: "This issue is already resolved." };
  }

  const now = new Date();
  await db
    .update(bills)
    .set({
      grnStatus: "ok",
      resolutionType,
      resolutionNotes: notes.trim() || null,
      issueResolvedBy: actor.email,
      issueResolvedDate: now,
      updatedAt: now,
    })
    .where(eq(bills.id, billId));

  await logAction(billId, "vendor_issue_resolved", actor.email, {
    resolutionType,
  });

  return { ok: true };
}

/**
 * Resolve an open price query. Same judgment call as above: this is the
 * manual-override path for a bill-level issue that didn't go through the
 * per-item discrepancy flow, so there's no automatic "everything's
 * checked" gate to satisfy — Purchase's confirmation that it's sorted out
 * is what moves price_status to 'approved'.
 */
export async function resolvePriceQueryAction(
  billId: string,
  notes: string
): Promise<ActionState> {
  const actor = await requireRole("purchase");

  if (!notes.trim()) {
    return { ok: false, error: "Add a note on how this was resolved." };
  }

  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.priceStatus !== "query") {
    return { ok: false, error: "This query is already resolved." };
  }

  const now = new Date();
  await db
    .update(bills)
    .set({ priceStatus: "approved", priceBy: actor.email, priceDate: now, updatedAt: now })
    .where(eq(bills.id, billId));

  await logAction(billId, "price_query_resolved", actor.email, { notes });

  return { ok: true };
}
