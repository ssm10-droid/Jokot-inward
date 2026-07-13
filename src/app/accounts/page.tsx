import Link from "next/link";
import { requirePageRole } from "@/lib/authz";
import { listReadyForAccounts, listInTally } from "@/lib/data";

export default async function AccountsPage() {
  await requirePageRole("accounts");
  const [ready, posted] = await Promise.all([
    listReadyForAccounts(),
    listInTally(10),
  ]);

  return (
    <main>
      <Link href="/" className="muted" style={{ textDecoration: "none" }}>
        ← Home
      </Link>
      <h1 style={{ marginTop: 8 }}>Post to Tally</h1>
      <p className="muted">
        {ready.length} bill{ready.length === 1 ? "" : "s"} ready
      </p>

      {ready.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nothing waiting. Bills show up here once both the quantity and
            price checks are clear.
          </p>
        </div>
      )}

      {ready.map((b) => (
        <Link
          key={b.id}
          href={`/accounts/${b.id}`}
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

      {posted.length > 0 && (
        <>
          <p style={{ fontWeight: 600, margin: "24px 0 4px" }}>
            Recently posted
          </p>
          {posted.map((b) => (
            <Link
              key={b.id}
              href={`/bills/${b.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="itemLine">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{b.id}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {b.tallyVoucherNo}
                  </span>
                </div>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                  {b.vendorName}
                </p>
              </div>
            </Link>
          ))}
        </>
      )}

      <style>{`
        .itemLine { padding: 8px 0; border-bottom: 1px solid var(--line); }
        .itemLine:last-child { border-bottom: none; }
      `}</style>
    </main>
  );
}
