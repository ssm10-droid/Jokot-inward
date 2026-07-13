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
      <Link href="/dashboard" style={{ fontSize: 14 }}>
        📊 Dashboard
      </Link>

      {denied && (
        <div className="card" style={{ borderColor: "#b3261e" }}>
          <p style={{ margin: 0 }}>
            That page is for a different role — you're signed in as{" "}
            <strong>{denied}</strong>.
          </p>
        </div>
      )}

      {user.role === "gate" && (
        <Link href="/bills/new">
          <button className="primary" style={{ width: "100%", marginTop: 12 }}>
            + New Bill
          </button>
        </Link>
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
      `}</style>
    </main>
  );
}
