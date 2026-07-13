import Link from "next/link";
import { requirePageRole } from "@/lib/authz";
import { listVendorIssues, listPriceQueries } from "@/lib/data";
import { ShortageIssueCard, PriceQueryIssueCard } from "./IssueCards";

export default async function IssuesPage() {
  await requirePageRole("purchase");
  const [shortages, priceQueries] = await Promise.all([
    listVendorIssues(),
    listPriceQueries(),
  ]);

  return (
    <main>
      <Link href="/" className="muted" style={{ textDecoration: "none" }}>
        ← Home
      </Link>
      <h1 style={{ marginTop: 8 }}>Vendor Issues</h1>
      <p className="muted">
        {shortages.length + priceQueries.length} open issue
        {shortages.length + priceQueries.length === 1 ? "" : "s"}
      </p>

      <p style={{ fontWeight: 600, margin: "20px 0 4px" }}>
        Shortages ({shortages.length})
      </p>
      {shortages.length === 0 && (
        <p className="muted" style={{ fontSize: 14 }}>None right now.</p>
      )}
      {shortages.map((b) => (
        <ShortageIssueCard key={b.id} bill={b} />
      ))}

      <p style={{ fontWeight: 600, margin: "24px 0 4px" }}>
        Price queries ({priceQueries.length})
      </p>
      {priceQueries.length === 0 && (
        <p className="muted" style={{ fontSize: 14 }}>None right now.</p>
      )}
      {priceQueries.map((b) => (
        <PriceQueryIssueCard key={b.id} bill={b} />
      ))}
    </main>
  );
}
