import Link from "next/link";
import { requirePageRole } from "@/lib/authz";
import { listGrnQueue } from "@/lib/data";

export default async function GrnQueuePage() {
  await requirePageRole("store");
  const bills = await listGrnQueue();

  return (
    <main>
      <Link href="/" className="muted" style={{ textDecoration: "none" }}>
        ← Home
      </Link>
      <h1 style={{ marginTop: 8 }}>GRN Queue</h1>
      <p className="muted">
        {bills.length} bill{bills.length === 1 ? "" : "s"} awaiting quantity
        check
      </p>

      {bills.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nothing waiting. New bills from the gate will show up here.
          </p>
        </div>
      )}

      {bills.map((b) => (
        <Link
          key={b.id}
          href={`/grn/${b.id}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{b.id}</strong>
              <span className="muted" style={{ fontSize: 13 }}>
                {new Date(b.gateDate).toLocaleDateString("en-IN")}
              </span>
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {b.vendorName} · {b.billNo ?? "no vendor bill no."}
            </p>
          </div>
        </Link>
      ))}
    </main>
  );
}
