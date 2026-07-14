import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";
import { signOut } from "@/auth";
import { listGrnQueue, listPriceQueue, listVendorIssues, listPriceQueries, listReadyForAccounts, recentBills } from "@/lib/data";
import { deriveStage } from "@/lib/derive";

const STAGE_LABEL: Record<string, string> = {
  under_review: "Under review",
  vendor_issue: "Vendor issue",
  ready_for_accounts: "Ready for accounts",
  in_tally: "Posted to Tally",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }
  const params = await searchParams;
  const denied = typeof params.denied === "string" ? params.denied : null;

  const [grnQueue, priceQueue, shortages, priceQueries, readyList, recent] = await Promise.all([
    ["store", "partner"].includes(user.role) ? listGrnQueue() : Promise.resolve([]),
    ["purchase", "partner"].includes(user.role) ? listPriceQueue() : Promise.resolve([]),
    ["purchase", "partner"].includes(user.role) ? listVendorIssues() : Promise.resolve([]),
    ["purchase", "partner"].includes(user.role) ? listPriceQueries() : Promise.resolve([]),
    ["accounts", "partner"].includes(user.role) ? listReadyForAccounts() : Promise.resolve([]),
    ["partner", "accounts"].includes(user.role) ? recentBills(10) : Promise.resolve([]),
  ]);
  const readyCount = readyList.length;

  return (
    <main>
      <h1>Jokot Inward</h1>
      <p className="muted">
        Signed in as <strong>{user.name}</strong> ·{" "}
        <span className="role-chip">{user.role}</span>
      </p>
      {user.role !== "gate" && (
        <Link href="/dashboard" style={{ fontSize: 14 }}>
          📊 Dashboard
        </Link>
      )}

      {denied && (
        <div className="card" style={{ borderColor: "#b3261e" }}>
          <p style={{ margin: 0 }}>
            That page is for a different role — you're signed in as{" "}
            <strong>{denied}</strong>.
          </p>
        </div>
      )}

      {user.role === "gate" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            marginTop: 20,
          }}
        >
          <Link href="/bills/new" style={{ textDecoration: "none" }}>
            <div className="homeTile homeTilePrimary">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M12 11v6" />
                <path d="M9 14h6" />
              </svg>
              <span className="homeTileLabel">New Bill</span>
              <span className="homeTileSub">Enter an incoming bill</span>
            </div>
          </Link>
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <div className="homeTile">
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="12" width="4" height="9" rx="1" />
                <rect x="10" y="7" width="4" height="14" rx="1" />
                <rect x="17" y="3" width="4" height="18" rx="1" />
              </svg>
              <span className="homeTileLabel">Dashboard</span>
              <span className="homeTileSub">Queues &amp; stuck bills</span>
            </div>
          </Link>
        </div>
      )}

      {(user.role === "store" || user.role === "partner") && (
        <Link href="/grn" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>GRN Queue</strong>
              <span className="role-chip">{grnQueue.length}</span>
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Bills awaiting quantity check
            </p>
          </div>
        </Link>
      )}

      {(user.role === "purchase" || user.role === "partner") && (
        <Link href="/price" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>Price Approvals</strong>
              <span className="role-chip">{priceQueue.length}</span>
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Bills awaiting rate check
            </p>
          </div>
        </Link>
      )}

      {(user.role === "purchase" || user.role === "partner") && (
        <Link href="/issues" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>Vendor Issues</strong>
              <span className="role-chip">
                {shortages.length + priceQueries.length}
              </span>
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Shortages and price queries to resolve
            </p>
          </div>
        </Link>
      )}

      {(user.role === "accounts" || user.role === "partner") && (
        <Link href="/accounts" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>Post to Tally</strong>
              <span className="role-chip">{readyCount}</span>
            </div>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Bills ready for accounts
            </p>
          </div>
        </Link>
      )}

      {(user.role === "partner" || user.role === "accounts") && recent.length > 0 && (
        <div className="card">
          <p style={{ margin: "0 0 10px", fontWeight: 600 }}>Recent bills</p>
          {recent.map((b) => {
            const stage = deriveStage(b);
            return (
              <Link
                key={b.id}
                href={`/bills/${b.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="itemLine">
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{b.id}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {STAGE_LABEL[stage]}
                    </span>
                  </div>
                  <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                    {b.vendorName}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="card">
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="plain" type="submit">
            Sign out
          </button>
        </form>
      </div>

      <style>{`
        .itemLine { padding: 8px 0; border-bottom: 1px solid var(--line); }
        .itemLine:last-child { border-bottom: none; }
        .homeTile {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 26px 16px 22px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: var(--ink);
          text-align: center;
          min-height: 140px;
          justify-content: center;
        }
        .homeTile:active { transform: scale(0.98); }
        .homeTilePrimary {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }
        .homeTileLabel { font-size: 17px; font-weight: 600; }
        .homeTileSub { font-size: 12.5px; opacity: 0.75; }
      `}</style>
    </main>
  );
}
