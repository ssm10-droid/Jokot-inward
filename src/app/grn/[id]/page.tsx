import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageRole } from "@/lib/authz";
import { getBillWithItems } from "@/lib/data";
import { GrnChecker } from "./GrnChecker";

export default async function GrnCheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageRole("store");
  const { id } = await params;
  const data = await getBillWithItems(id);
  if (!data) notFound();

  if (data.bill.grnStatus !== "pending") {
    redirect(`/bills/${id}`);
  }

  return (
    <main>
      <Link href="/grn" className="muted" style={{ textDecoration: "none" }}>
        ← GRN Queue
      </Link>
      <h1 style={{ marginTop: 8 }}>{data.bill.id}</h1>
      <p className="muted">
        {data.bill.vendorName} · {data.bill.billNo ?? "no vendor bill no."}
      </p>

      <GrnChecker billId={data.bill.id} items={data.items} />
    </main>
  );
}
