"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/db";
import { bills, billItems, type Bill } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { getBillWithItems } from "@/lib/data";
import { derive } from "@/lib/derive";
import { nextGrnNo } from "@/lib/ids";
import { logAction } from "@/lib/audit";
import { uploadBuffer } from "@/lib/blob";
import { GrnNoteDocument } from "@/lib/pdf/grn-note";
import { VendorShortageDocument } from "@/lib/pdf/vendor-shortage";
import { notifyAssigned } from "@/lib/notify";

export interface ActionState {
  ok: boolean;
  error?: string;
}

/**
 * Marks a single line's quantity check status. Deliberately does NOT
 * require actualQtyReceived/grnRemarks to be filled in to accept a "short"
 * mark — that requirement is enforced later, at Confirm GRN. Marking short
 * and writing the reason are separate user actions, seconds or minutes
 * apart; see the validation-timing note in the build spec.
 */
export async function markItemCheckAction(
  billId: string,
  itemId: string,
  status: "ok" | "short",
  actualQtyReceived: string | null,
  grnRemarks: string | null
): Promise<ActionState> {
  const actor = await requireRole("store");

  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) });
  if (!bill) return { ok: false, error: "Bill not found." };
  if (bill.grnStatus !== "pending") {
    return { ok: false, error: "This bill's GRN is already confirmed." };
  }

  await db
    .update(billItems)
    .set({
      checkStatus: status,
      actualQtyReceived: status === "short" ? actualQtyReceived : null,
      grnRemarks: status === "short" ? grnRemarks : null,
      updatedAt: new Date(),
    })
    .where(eq(billItems.id, itemId));

  await logAction(billId, "item_marked_" + status, actor.email, { itemId });

  return { ok: true };
}

/**
 * Confirm GRN: the forward action that enforces "every short line must
 * have qty + reason filled in" — not the status change itself. Generates
 * the GRN number, GRN Note PDF, and (if any line is short) the vendor
 * shortage message + Vendor Shortage Note PDF, all server-side.
 */
export async function confirmGrnAction(billId: string): Promise<ActionState> {
  const actor = await requireRole("store");

  const data = await getBillWithItems(billId);
  if (!data) return { ok: false, error: "Bill not found." };
  const { bill, items } = data;

  if (bill.grnStatus !== "pending") {
    return { ok: false, error: "This bill's GRN is already confirmed." };
  }

  const d = derive(bill, items);
  if (!d.allItemsChecked) {
    return { ok: false, error: "Mark every item OK or Short before confirming." };
  }
  if (!d.shortageDetailsFilled) {
    return {
      ok: false,
      error:
        "Every short item needs a received quantity and a reason before you can confirm.",
    };
  }

  const grnStatus: "ok" | "short" = d.shortLinesCount > 0 ? "short" : "ok";
  const grnNo = await nextGrnNo();
  const now = new Date();

  const vendorMessage =
    grnStatus === "short"
      ? buildVendorMessage(bill.vendorName, bill.billNo ?? bill.id, items)
      : null;

  // Merge the not-yet-persisted values for PDF rendering, so the note
  // reflects the confirmation that's about to happen.
  const billForPdf: Bill = {
    ...bill,
    grnNo,
    grnStatus,
    grnBy: actor.email,
    grnCheckedDate: now,
  };

  // PDF generation is best-effort: the GRN confirmation itself (the part
  // that unblocks the workflow) must succeed even if PDF rendering or
  // upload has a problem. A missing note can be regenerated later; a bill
  // stuck un-confirmed because of a PDF hiccup cannot.
  let grnNoteUrl: string | null = null;
  let vendorNoteUrl: string | null = null;
  try {
    const grnNoteBuf = await renderToBuffer(
      GrnNoteDocument({ bill: billForPdf, items })
    );
    grnNoteUrl = await uploadBuffer(
      `bills/${billId}/grn-note.pdf`,
      grnNoteBuf,
      "application/pdf"
    );

    if (grnStatus === "short") {
      const vendorNoteBuf = await renderToBuffer(
        VendorShortageDocument({ bill: billForPdf, items })
      );
      vendorNoteUrl = await uploadBuffer(
        `bills/${billId}/vendor-shortage.pdf`,
        vendorNoteBuf,
        "application/pdf"
      );
    }
  } catch (err) {
    console.error("GRN PDF generation/upload failed:", err);
    await logAction(billId, "grn_note_pdf_failed", actor.email, {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  await db
    .update(bills)
    .set({
      grnNo,
      grnStatus,
      grnBy: actor.email,
      grnCheckedDate: now,
      vendorMessage,
      grnNoteFileUrl: grnNoteUrl,
      vendorNoteFileUrl: vendorNoteUrl,
      updatedAt: now,
    })
    .where(eq(bills.id, billId));

  await logAction(billId, "grn_confirmed", actor.email, {
    grnStatus,
    shortLinesCount: d.shortLinesCount,
    grnNo,
  });

  // Best-effort stage-entry notifications
  if (grnStatus === "short") {
    await notifyAssigned(
      ["purchase"],
      billId,
      bill.vendorName,
      `vendor shortage resolution (${d.shortLinesCount} short line${d.shortLinesCount === 1 ? "" : "s"})`
    );
  } else if (bill.priceStatus === "approved") {
    await notifyAssigned(
      ["accounts"],
      billId,
      bill.vendorName,
      "post to Tally (both checks clear)"
    );
  }

  redirect(`/bills/${billId}`);
}

function buildVendorMessage(
  vendorName: string,
  billNo: string,
  items: { itemName: string; checkStatus: string }[]
): string {
  const shortNames = items
    .filter((i) => i.checkStatus === "short")
    .map((i) => i.itemName)
    .join(", ");
  return `Dear ${vendorName}, against bill ${billNo} the following lines were received short: ${shortNames}. Kindly arrange replacement or credit note. — Jokot International (Stores)`;
}
