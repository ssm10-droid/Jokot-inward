import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { getBillWithItems, billAudit } from "@/lib/data";
import { derive, itemAmount } from "@/lib/derive";

const STAGE_LABEL: Record<string, string> = {
  under_review: "Under review",
  vendor_issue: "Vendor issue",
  ready_for_accounts: "Ready for accounts",
  in_tally: "Posted to Tally",
};

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const data = await getBillWithItems(id);
  if (!data) notFound();
  const { bill, items } = data;
  const d = derive(bill, items);
  const audit = await billAudit(bill.id);

  return (
    <main>
      <Link href="/" className="muted" style={{ textDecoration: "none" }}>
        ← Home
      </Link>
      <h1 style={{ marginTop: 8 }}>{bill.id}</h1>
      <p className="muted">
        {bill.vendorName} · {bill.billNo ?? "no vendor bill no."}
      </p>

      <div className="card">
        <div className="row">
          <span className="muted">Stage</span>
          <span className="role-chip">{STAGE_LABEL[d.stage]}</span>
        </div>
        <div className="row">
          <span className="muted">Waiting on</span>
          <span>{d.waitingOn}</span>
        </div>
        <div className="row">
          <span className="muted">Total</span>
          <span>
            ₹{d.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="row">
          <span className="muted">Bill date</span>
          <span>{bill.billDate ?? "—"}</span>
        </div>
        <div className="row">
          <span className="muted">Gate entry</span>
          <span>
            {bill.gateBy} · {new Date(bill.gateDate).toLocaleString("en-IN")}
          </span>
        </div>
        {bill.grnNo && (
          <div className="row">
            <span className="muted">GRN No.</span>
            <span>{bill.grnNo}</span>
          </div>
        )}
        {bill.billPhotoUrl && (
          <div className="row">
            <span className="muted">Bill photo</span>
            <a href={bill.billPhotoUrl} target="_blank" rel="noreferrer">
              View
            </a>
          </div>
        )}
        {bill.grnNoteFileUrl && (
          <div className="row">
            <span className="muted">GRN Note</span>
            <a href={bill.grnNoteFileUrl} target="_blank" rel="noreferrer">
              Download PDF
            </a>
          </div>
        )}
        {bill.vendorNoteFileUrl && (
          <div className="row">
            <span className="muted">Vendor Shortage Note</span>
            <a href={bill.vendorNoteFileUrl} target="_blank" rel="noreferrer">
              Download PDF
            </a>
          </div>
        )}
      </div>

      {user.role === "store" && bill.grnStatus === "pending" && (
        <Link href={`/grn/${bill.id}`}>
          <button className="primary" style={{ marginTop: 4, width: "100%" }}>
            Check quantity (GRN)
          </button>
        </Link>
      )}

      {user.role === "purchase" && bill.priceStatus === "pending" && (
        <Link href={`/price/${bill.id}`}>
          <button className="primary" style={{ marginTop: 4, width: "100%" }}>
            Check rates
          </button>
        </Link>
      )}

      {user.role === "purchase" &&
        (bill.grnStatus === "short" || bill.priceStatus === "query") && (
          <Link href="/issues">
            <button className="primary" style={{ marginTop: 4, width: "100%" }}>
              Resolve in Vendor Issues
            </button>
          </Link>
        )}

      <div className="card">
        <p style={{ margin: "0 0 10px", fontWeight: 600 }}>Items</p>
        {items.map((it) => (
          <div key={it.id} className="itemLine">
            <div className="itemLineTop">
              <span>{it.itemName}</span>
              <span>
                ₹{itemAmount(it).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
            </div>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              {it.qtyBilled} {it.uom ?? ""} × ₹{it.rateBilled}
              {it.checkStatus === "short" && (
                <span style={{ color: "#b3261e" }}>
                  {" "}
                  · short (recv. {it.actualQtyReceived ?? "—"})
                </span>
              )}
              {it.checkStatus === "ok" && <span> · qty OK</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="card">
        <p style={{ margin: "0 0 10px", fontWeight: 600 }}>Activity</p>
        {audit.length === 0 && <p className="muted">No activity yet.</p>}
        {audit.map((a) => (
          <div key={a.id} className="itemLine">
            <p style={{ margin: 0, fontSize: 14 }}>
              {a.action.replace(/_/g, " ")}
            </p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
              {a.actorEmail} · {new Date(a.at).toLocaleString("en-IN")}
            </p>
          </div>
        ))}
      </div>

      <style>{`
        .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
        .itemLine { padding: 8px 0; border-bottom: 1px solid var(--line); }
        .itemLine:last-child { border-bottom: none; }
        .itemLineTop { display: flex; justify-content: space-between; font-size: 14px; }
      `}</style>
    </main>
  );
}
