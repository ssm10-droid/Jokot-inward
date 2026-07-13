"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bills } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { deriveStage } from "@/lib/derive";
import { logAction } from "@/lib/audit";

export interface ActionState {
  ok: boolean;
  error?: string;
}

/**
 * Post to Tally: deliberately dumb per the build spec — records the
 * voucher number Accounts typed in after posting the bill in Tally
 * themselves. No real Tally integration; that's explicitly out of scope
 * until the import/export contract is confirmed separately.
 */
export async function postToTallyAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireRole("accounts");

  const billId = String(formData.get("billId") ?? "");
  const voucherNo = String(formData.get("voucherNo") ?? "").trim();

  if (!voucherNo) {
    return { ok: false, error: "Enter the Tally voucher number." };
  }

  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.tallyVoucherNo) {
    return { ok: false, error: "This bill is already posted to Tally." };
  }
  if (deriveStage(bill) !== "ready_for_accounts") {
    return {
      ok: false,
      error: "This bill isn't ready for Accounts yet — both quantity and price checks must be clear first.",
    };
  }

  const now = new Date();
  await db
    .update(bills)
    .set({
      tallyVoucherNo: voucherNo,
      accountsPostedBy: actor.email,
      accountsPostedDate: now,
      updatedAt: now,
    })
    .where(eq(bills.id, billId));

  await logAction(billId, "posted_to_tally", actor.email, { voucherNo });

  redirect(`/bills/${billId}`);
}
