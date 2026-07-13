import { db } from "@/db";
import { itemAmount } from "@/lib/derive";
import { toCsv, checkExportToken } from "@/lib/csv";

export async function GET(request: Request) {
  if (!checkExportToken(request)) {
    return new Response("Unauthorized. Add ?token=... to the URL.", { status: 401 });
  }

  const allItems = await db.query.billItems.findMany();

  const rows = allItems.map((it) => ({
    bill_item_id: it.id,
    bill_id: it.billId,
    item_name: it.itemName,
    qty_billed: it.qtyBilled,
    uom: it.uom,
    rate_billed: it.rateBilled,
    amount: itemAmount(it),
    check_status: it.checkStatus,
    actual_qty_received: it.actualQtyReceived,
    grn_remarks: it.grnRemarks,
    rate_status: it.rateStatus,
    correct_rate: it.correctRate,
    rate_remarks: it.rateRemarks,
  }));

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
