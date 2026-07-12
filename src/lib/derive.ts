import type { Bill, BillItem } from "@/db/schema";

/**
 * All computed fields from the spec live here, derived at read time from a
 * bill and its items. Nothing here is stored, so nothing can drift.
 *
 * Every screen and every transition precondition reads from this module —
 * never re-derive stage logic inline elsewhere.
 */

export type Stage =
  | "under_review"
  | "vendor_issue"
  | "ready_for_accounts"
  | "in_tally";

export interface DerivedBill {
  totalAmount: number;
  itemsCount: number;
  stage: Stage;
  waitingOn: string;
  shortLinesCount: number;
  allItemsChecked: boolean;
  shortageDetailsFilled: boolean;
  rateDiscrepancyCount: number;
  allItemsRateChecked: boolean;
  allDiscrepanciesExplained: boolean;
}

export function itemAmount(item: BillItem): number {
  return Number(item.qtyBilled) * Number(item.rateBilled);
}

export function derive(bill: Bill, billItemsList: BillItem[]): DerivedBill {
  const totalAmount = billItemsList.reduce((s, i) => s + itemAmount(i), 0);
  const itemsCount = billItemsList.length;

  const shortLines = billItemsList.filter((i) => i.checkStatus === "short");
  const shortLinesCount = shortLines.length;
  const allItemsChecked =
    itemsCount > 0 && billItemsList.every((i) => i.checkStatus !== "pending");
  const shortageDetailsFilled = shortLines.every(
    (i) =>
      i.actualQtyReceived !== null &&
      i.grnRemarks !== null &&
      i.grnRemarks.trim() !== ""
  );

  const discrepancyLines = billItemsList.filter(
    (i) => i.rateStatus === "discrepancy"
  );
  const rateDiscrepancyCount = discrepancyLines.length;
  const allItemsRateChecked =
    itemsCount > 0 && billItemsList.every((i) => i.rateStatus !== "pending");
  const allDiscrepanciesExplained = discrepancyLines.every(
    (i) => i.correctRate !== null
  );

  const stage = deriveStage(bill);
  const waitingOn = deriveWaitingOn(bill, {
    allItemsChecked,
    allItemsRateChecked,
  });

  return {
    totalAmount,
    itemsCount,
    stage,
    waitingOn,
    shortLinesCount,
    allItemsChecked,
    shortageDetailsFilled,
    rateDiscrepancyCount,
    allItemsRateChecked,
    allDiscrepanciesExplained,
  };
}

export function deriveStage(bill: Bill): Stage {
  if (bill.tallyVoucherNo) return "in_tally";
  if (bill.grnStatus === "ok" && bill.priceStatus === "approved")
    return "ready_for_accounts";
  if (bill.grnStatus === "short") return "vendor_issue";
  return "under_review";
}

function deriveWaitingOn(
  bill: Bill,
  flags: { allItemsChecked: boolean; allItemsRateChecked: boolean }
): string {
  const blockers: string[] = [];

  // Quantity side
  if (bill.grnStatus === "pending") {
    blockers.push(
      flags.allItemsChecked
        ? "Store: GRN confirmation"
        : "Store: quantity check"
    );
  } else if (bill.grnStatus === "short") {
    blockers.push("Purchase: vendor shortage resolution");
  }

  // Price side (independent of quantity side)
  if (bill.priceStatus === "pending") {
    blockers.push(
      flags.allItemsRateChecked
        ? "Purchase: rate approval"
        : "Purchase: rate check"
    );
  } else if (bill.priceStatus === "query") {
    blockers.push("Purchase: open price query");
  }

  if (blockers.length === 0) {
    return bill.tallyVoucherNo ? "Nothing — posted to Tally" : "Accounts: post to Tally";
  }
  return blockers.join(" · ");
}

/** Gate can edit the bill header only before either side has started. */
export function headerEditable(bill: Bill): boolean {
  return bill.grnStatus === "pending" && bill.priceStatus === "pending";
}
