import Link from "next/link";
import { requireUser } from "@/lib/authz";
import {
  listGrnQueue,
  listPriceQueue,
  listVendorIssues,
  listPriceQueries,
  listReadyForAccounts,
  listActiveBills,
} from "@/lib/data";
import { deriveStage } from "@/lib/derive";

const STUCK_THRESHOLD_MS = 48 * 60 * 60 * 1000;

const STAGE_LABEL: Record<string, string> = {
  under_review: "Under review",
  vendor_issue: "Vendor issue",
  ready_for_accounts: "Ready for accounts",
  in_tally: "Posted to Tally",
};

export default async function DashboardPage() {
  await requireUser();

  const [grnQueue, priceQueue, shortages, priceQueries, ready, active] =
    await Promise.all([
      listGrnQueue(),
      listPriceQueue(),
      listVendorIssues(),
      listPriceQueries(),
      listReadyForAccounts(),
      listActiveBills(),
    ]);

  const now = Date.now();
  const stuck = active
    .filter((b) => now - new Date(b.updatedAt).getTime() > STUCK_THRESHOLD_MS)
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  const counts = [
    { label: "GRN Queue", value: grnQueue.length, href: "/grn" },
    { label: "Price Approvals", value: priceQueue.length, href: "/price" },
    {
      label: "Vendor Issues",
      value: shortages.length + priceQueries.length,
      href: "/issues",
    },
    { label: "Ready for Accounts", value: ready.length, href: "/accounts" },
  ];

  return (
    <main>
      <Link href="/" className="muted" style={{ textDecoration: "none" }}>
        ← Home
      </Link>
      <h1 style={{ marginTop: 8 }}>Dashboard</h1>
      <p className="muted">Pipeline overview — read-only</p>

      <div className="grid">
        {counts.map((c) => (
          <Link key={c.label} href={c.href} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card countCard">
              <p className="countValue">{c.value}</p>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {c.label}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <p style={{ fontWeight: 600, margin: "24px 0 4px" }}>
        Stuck bills ({stuck.length})
      </p>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
        No progress in 48 hours or more, not yet posted to Tally.
      </p>

      {stuck.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nothing stuck right now.
          </p>
        </div>
      )}

      {stuck.map((b) => {
        const hours = Math.floor(
          (now - new Date(b.updatedAt).getTime()) / (60 * 60 * 1000)
        );
        return (
          <Link
            key={b.id}
            href={`/bills/${b.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="card" style={{ borderColor: "#b3261e", marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{b.id}</strong>
                <span style={{ color: "#b3261e", fontSize: 13 }}>
                  {hours}h stuck
                </span>
              </div>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {b.vendorName} · {STAGE_LABEL[deriveStage(b)]}
              </p>
            </div>
          </Link>
        );
      })}

      <style>{`
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 16px;
        }
        .countCard {
          text-align: center;
          padding: 20px 12px;
        }
        .countValue {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 4px;
          color: var(--accent);
        }
      `}</style>
    </main>
  );
}
