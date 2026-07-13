import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageRole } from "@/lib/authz";
import { getBillWithItems } from "@/lib/data";
import { PriceChecker } from "./PriceChecker";

export default async function PriceCheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageRole("purchase");
  const { id } = await params;
  const data = await getBillWithItems(id);
  if (!data) notFound();

  if (data.bill.priceStatus !== "pending") {
    redirect(`/bills/${id}`);
  }

  return (
    <main>
      <Link href="/price" className="muted" style={{ textDecoration: "none" }}>
        ← Price Approvals
      </Link>
      <h1 style={{ marginTop: 8 }}>{data.bill.id}</h1>
      <p className="muted">
        {data.bill.vendorName} · {data.bill.billNo ?? "no vendor bill no."}
      </p>

      <PriceChecker billId={data.bill.id} items={data.items} />
    </main>
  );
}
