import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageRole } from "@/lib/authz";
import { getBillWithItems } from "@/lib/data";
import { deriveStage } from "@/lib/derive";
import { PostToTallyForm } from "./PostToTallyForm";

export default async function PostToTallyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageRole("accounts");
  const { id } = await params;
  const data = await getBillWithItems(id);
  if (!data) notFound();

  const { bill } = data;
  if (bill.tallyVoucherNo || deriveStage(bill) !== "ready_for_accounts") {
    redirect(`/bills/${id}`);
  }

  return (
    <main>
      <Link href="/accounts" className="muted" style={{ textDecoration: "none" }}>
        ← Post to Tally
      </Link>
      <h1 style={{ marginTop: 8 }}>{bill.id}</h1>
      <p className="muted">
        {bill.vendorName} · {bill.billNo ?? "no vendor bill no."}
      </p>

      <PostToTallyForm billId={bill.id} />
    </main>
  );
}
