"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bills, billItems } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { nextBillId } from "@/lib/ids";
import { getVendor, getItem, itemsForVendor } from "@/lib/data";
import { logAction } from "@/lib/audit";
import { uploadBuffer } from "@/lib/blob";

const LineItemInput = z.object({
  itemName: z.string().min(1),
  qtyBilled: z.number().positive(),
  rateBilled: z.number().nonnegative(),
});

const HeaderInput = z.object({
  vendorName: z.string().min(1, "Select a vendor."),
  securitySealDate: z.string().optional(),
  securitySerialNo: z.string().optional(),
  billDate: z.string().optional(),
  billNo: z.string().optional(),
  physicalFileLocation: z.string().optional(),
});

export interface CreateBillState {
  ok: boolean;
  error?: string;
  savedBillId?: string;
}

export async function createBillAction(
  _prev: CreateBillState,
  formData: FormData
): Promise<CreateBillState> {
  const actor = await requireRole("gate");

  const headerParsed = HeaderInput.safeParse({
    vendorName: String(formData.get("vendorName") ?? "").trim(),
    securitySealDate: optionalStr(formData.get("securitySealDate")),
    securitySerialNo: optionalStr(formData.get("securitySerialNo")),
    billDate: optionalStr(formData.get("billDate")),
    billNo: optionalStr(formData.get("billNo")),
    physicalFileLocation: optionalStr(formData.get("physicalFileLocation")),
  });
  if (!headerParsed.success) {
    return { ok: false, error: headerParsed.error.issues[0].message };
  }
  const header = headerParsed.data;

  const vendor = await getVendor(header.vendorName);
  if (!vendor) {
    return {
      ok: false,
      error: `"${header.vendorName}" isn't in the vendor list. Pick one from the suggestions, or ask a partner to add it via /setup.`,
    };
  }

  let lineItems: z.infer<typeof LineItemInput>[];
  try {
    const raw = JSON.parse(String(formData.get("itemsJson") ?? "[]"));
    const parsed = z.array(LineItemInput).min(1, "Add at least one item.").safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }
    lineItems = parsed.data;
  } catch {
    return { ok: false, error: "Could not read the item list. Try again." };
  }

  // Every item name must resolve to the item master, so tally_stock_item
  // and uom snapshots are meaningful (and the FK doesn't reject the insert).
  const validItems = await itemsForVendor(header.vendorName);
  const validNames = new Set(validItems.map((i) => i.name));
  for (const li of lineItems) {
    if (!validNames.has(li.itemName)) {
      const exists = await getItem(li.itemName);
      if (!exists) {
        return {
          ok: false,
          error: `"${li.itemName}" isn't in the item list. Pick from the suggestions.`,
        };
      }
    }
  }

  // Photo upload (optional — phone camera, gallery, or a scanned file)
  let billPhotoUrl: string | null = null;
  const photoCandidate = [formData.get("photo"), formData.get("photoCamera")].find(
    (p) => p instanceof File && p.size > 0
  );
  const photo = photoCandidate ?? null;
  if (photo instanceof File && photo.size > 0) {
    const buf = Buffer.from(await photo.arrayBuffer());
    const ext = photo.type === "image/png" ? "png" : "jpg";
    billPhotoUrl = await uploadBuffer(
      `bills/pending/${Date.now()}.${ext}`,
      buf,
      photo.type || "image/jpeg"
    );
  }

  const billId = await nextBillId();

  await db.insert(bills).values({
    id: billId,
    vendorName: header.vendorName,
    securitySealDate: header.securitySealDate || null,
    securitySerialNo: header.securitySerialNo || null,
    billDate: header.billDate || null,
    billNo: header.billNo || null,
    physicalFileLocation: header.physicalFileLocation || null,
    billPhotoUrl,
    gateBy: actor.email,
  });

  let n = 1;
  for (const li of lineItems) {
    const itemMaster = await getItem(li.itemName);
    await db.insert(billItems).values({
      id: `${billId}-${n}`,
      billId,
      itemName: li.itemName,
      tallyStockItem: itemMaster?.tallyStockItemName ?? null,
      uom: itemMaster?.uom ?? null,
      qtyBilled: String(li.qtyBilled),
      rateBilled: String(li.rateBilled),
    });
    n++;
  }

  await logAction(billId, "bill_created", actor.email, {
    vendorName: header.vendorName,
    itemCount: lineItems.length,
  });

  const saveMode = String(formData.get("saveMode") ?? "close");
  if (saveMode === "next") {
    // Stay on the entry form — the client resets it for the next bill.
    return { ok: true, savedBillId: billId };
  }
  redirect(`/?saved=${encodeURIComponent(billId)}`);
}

function optionalStr(v: FormDataEntryValue | null): string | undefined {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : undefined;
}

export interface ItemOption {
  name: string;
  uom: string | null;
}

export async function getItemOptionsAction(
  vendorName: string
): Promise<ItemOption[]> {
  await requireRole("gate");
  const list = await itemsForVendor(vendorName);
  return list.map((i) => ({ name: i.name, uom: i.uom }));
}
