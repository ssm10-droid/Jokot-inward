import { db } from "@/db";
import { derive } from "@/lib/derive";
import { toCsv, checkExportToken } from "@/lib/csv";

export async function GET(request: Request) {
  if (!checkExportToken(request)) {
    return new Response("Unauthorized. Add ?token=... to the URL.", { status: 401 });
  }

  const allBills = await db.query.bills.findMany();
  const allItems = await db.query.billItems.findMany();
  const itemsByBill = new Map<string, typeof allItems>();
  for (const it of allItems) {
    const list = itemsByBill.get(it.billId) ?? [];
    list.push(it);
    itemsByBill.set(it.billId, list);
  }

  const rows = allBills.map((b) => {
    const its = itemsByBill.get(b.id) ?? [];
    const d = derive(b, its);
    return {
      bill_id: b.id,
      vendor_name: b.vendorName,
      bill_no: b.billNo,
      bill_date: b.billDate,
      total_amount: d.totalAmount,
      items_count: d.itemsCount,
      stage: d.stage,
      waiting_on: d.waitingOn,
      grn_status: b.grnStatus,
      grn_no: b.grnNo,
      price_status: b.priceStatus,
      tally_voucher_no: b.tallyVoucherNo,
      gate_by: b.gateBy,
      gate_date: b.gateDate,
      grn_by: b.grnBy,
      grn_checked_date: b.grnCheckedDate,
      price_by: b.priceBy,
      price_date: b.priceDate,
      accounts_posted_by: b.accountsPostedBy,
      accounts_posted_date: b.accountsPostedDate,
    };
  });

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
