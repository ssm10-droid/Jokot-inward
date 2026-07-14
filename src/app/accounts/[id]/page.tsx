import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageRole } from "@/lib/authz";
import { getBillWithItems, gstInfoForItems } from "@/lib/data";
import { deriveStage } from "@/lib/derive";
import { PostToTallyForm } from "./PostToTallyForm";

const cell: React.CSSProperties = { padding: "8px 6px" };
const cellNum: React.CSSProperties = { padding: "8px 6px", textAlign: "right", whiteSpace: "nowrap" };

export default async function PostToTallyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageRole("accounts");
  const { id } = await params;
  const data = await getBillWithItems(id);
  if (!data) notFound();

  const { bill, items: lineItems } = data;
  if (bill.tallyVoucherNo || deriveStage(bill) !== "ready_for_accounts") {
    redirect(`/bills/${id}`);
  }

  // GST % and HSN are accounts-facing only — every other role works with
  // basic (GST-exclusive) rates and never sees these columns.
  const gstInfo = await gstInfoForItems(lineItems.map((li) => li.itemName));
  const basicTotal = lineItems.reduce(
    (sum, li) => sum + Number(li.qtyBilled) * Number(li.rateBilled),
    0
  );

  return (
    <main>
      <Link href="/accounts" className="muted" style={{ textDecoration: "none" }}>
        ← Post to Tally
      </Link>
      <h1 style={{ marginTop: 8 }}>{bill.id}</h1>
      <p className="muted">
        {bill.vendorName} · {bill.billNo ?? "no vendor bill no."}
      </p>

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr className="muted" style={{ textAlign: "left" }}>
              <th style={cell}>Item</th>
              <th style={cellNum}>Qty</th>
              <th style={cellNum}>Rate</th>
              <th style={cellNum}>Amount</th>
              <th style={cellNum}>GST %</th>
              <th style={cell}>HSN</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li) => {
              const info = gstInfo.get(li.itemName);
              return (
                <tr key={li.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={cell}>{li.itemName}</td>
                  <td style={cellNum}>
                    {Number(li.qtyBilled)} {li.uom ?? ""}
                  </td>
                  <td style={cellNum}>{Number(li.rateBilled).toFixed(2)}</td>
                  <td style={cellNum}>
                    {(Number(li.qtyBilled) * Number(li.rateBilled)).toFixed(2)}
                  </td>
                  <td style={cellNum}>{info?.gstPct ? `${Number(info.gstPct)}%` : "—"}</td>
                  <td style={cell}>{info?.hsnCode ?? "—"}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: "1px solid var(--line)", fontWeight: 600 }}>
              <td style={cell} colSpan={3}>
                Basic total (excl. GST)
              </td>
              <td style={cellNum}>{basicTotal.toFixed(2)}</td>
              <td style={cell} colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <PostToTallyForm billId={bill.id} />
    </main>
  );
}
