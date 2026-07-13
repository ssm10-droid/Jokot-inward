import Link from "next/link";
import { requirePageRole } from "@/lib/authz";
import { listVendors, listAllItems } from "@/lib/data";
import { NewBillForm } from "./NewBillForm";

export default async function NewBillPage() {
  await requirePageRole("gate");
  const [vendors, items] = await Promise.all([listVendors(), listAllItems()]);

  return (
    <main>
      <Link href="/" className="muted" style={{ textDecoration: "none" }}>
        ← Home
      </Link>
      <h1 style={{ marginTop: 8 }}>New Bill</h1>
      <p className="muted">Gate entry</p>

      {vendors.length === 0 && (
        <div className="card" style={{ borderColor: "#b3261e" }}>
          <p style={{ margin: 0 }}>
            No vendors are set up yet. Ask a partner to add vendors before
            bills can be entered.
          </p>
        </div>
      )}

      <NewBillForm
        vendorNames={vendors.map((v) => v.name)}
        initialItems={items.map((i) => ({ name: i.name, uom: i.uom }))}
      />
    </main>
  );
}
