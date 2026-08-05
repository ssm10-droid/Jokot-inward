"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bills, billItems } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { getBillWithItems } from "@/lib/data";
import { derive } from "@/lib/derive";
import { logAction } from "@/lib/audit";
import { notifyAssigned } from "@/lib/notify";

export interface ActionState {
  ok: boolean;
  error?: string;
}

/**
 * Marks a single line's rate status. Mirrors markItemCheckAction on the
 * quantity side — does NOT require correctRate to be filled in to accept
 * a "discrepancy" mark. That's enforced later, at Approve Rates, per the
 * same validation-timing rule used for shortages.
 */
export async function markItemRateAction(
  billId: string,
  itemId: string,
  status: "ok" | "discrepancy",
  correctRate: string | null,
  rateRemarks: string | null
): Promise<ActionState> {
  const actor = await requireRole("purchase");

  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.priceStatus !== "pending") {
    return { ok: false, error: "This bill's price check is already closed." };
  }

  await db
    .update(billItems)
    .set({
      rateStatus: status,
      correctRate: status === "discrepancy" ? correctRate : null,
      rateRemarks: status === "discrepancy" ? rateRemarks : null,
      updatedAt: new Date(),
    })
    .where(eq(billItems.id, itemId));

  await logAction(billId, "item_rate_marked_" + status, actor.email, { itemId });

  return { ok: true };
}

/**
 * Approve Rates: the forward action that enforces "every discrepancy line
 * must have a correct rate filled in" — not the status change itself.
 */
export async function approveRatesAction(billId: string): Promise<ActionState> {
  const actor = await requireRole("purchase");

  const data = await getBillWithItems(billId);
  if (!data) return { ok: false, error: "Bill not found." };
  const { bill, items } = data;

  if (bill.priceStatus !== "pending") {
    return { ok: false, error: "This bill's price check is already closed." };
  }

  const d = derive(bill, items);
  if (!d.allItemsRateChecked) {
    return { ok: false, error: "Mark every item OK or Discrepancy before approving." };
  }
  if (!d.allDiscrepanciesExplained) {
    return {
      ok: false,
      error: "Every discrepancy needs a correct rate before you can approve.",
    };
  }

  const now = new Date();
  await db
    .update(bills)
    .set({ priceStatus: "approved", priceBy: actor.email, priceDate: now, updatedAt: now })
    .where(eq(bills.id, billId));

  await logAction(billId, "rates_approved", actor.email, {
    discrepancyCount: d.rateDiscrepancyCount,
  });

  // Best-effort: if the quantity side is also clear, Accounts is next.
  if (bill.grnStatus === "ok") {
    await notifyAssigned(
      ["accounts"],
      billId,
      bill.vendorName,
      "post to Tally (both checks clear)"
    );
  }

  redirect(`/bills/${billId}`);
}

/**
 * Raise Query: an independent side-channel for a bill-level pricing issue
 * that isn't captured by per-item discrepancies (e.g. the invoice total
 * doesn't match the PO). Available any time price_status is still
 * 'pending' — it doesn't require or touch the per-item rate marks.
 */
export async function raiseQueryAction(
  billId: string,
  remark: string
): Promise<ActionState> {
  const actor = await requireRole("purchase");

  if (!remark.trim()) {
    return { ok: false, error: "Describe the query before raising it." };
  }

  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.priceStatus !== "pending") {
    return { ok: false, error: "This bill's price check is already closed." };
  }

  const now = new Date();
  await db
    .update(bills)
    .set({
      priceStatus: "query",
      priceBy: actor.email,
      priceDate: now,
      priceRemark: remark.trim(),
      updatedAt: now,
    })
    .where(eq(bills.id, billId));

  await logAction(billId, "price_query_raised", actor.email, { remark });

  redirect(`/bills/${billId}`);
}
