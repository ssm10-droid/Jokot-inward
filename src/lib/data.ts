import { eq, and, desc, asc, isNotNull, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  vendors,
  items,
  supplierItemMap,
  bills,
  billItems,
  auditLog,
  type Vendor,
  type Item,
  type Bill,
  type BillItem,
} from "@/db/schema";

export async function listVendors(): Promise<Vendor[]> {
  // Only active vendors appear in pickers; deactivated ones (removed from
  // the master sheet but referenced by old bills) stay out of daily work.
  return db.query.vendors.findMany({
    where: eq(vendors.active, true),
    orderBy: asc(vendors.name),
  });
}

export async function listAllItems(): Promise<Item[]> {
  return db.query.items.findMany({
    where: eq(items.active, true),
    orderBy: asc(items.name),
  });
}

/**
 * Items typically supplied by a vendor. Falls back to the full item list
 * when the map has no active rows for this vendor — supplier_item_map is
 * known-incomplete (~20% name overlap with vendors at last check), so an
 * empty result here must never mean an empty picker.
 */
export async function itemsForVendor(vendorName: string): Promise<Item[]> {
  const mapped = await db
    .select({ itemName: supplierItemMap.itemName })
    .from(supplierItemMap)
    .where(
      and(
        eq(supplierItemMap.supplierName, vendorName),
        eq(supplierItemMap.isActive, true)
      )
    );

  if (mapped.length === 0) {
    return listAllItems();
  }

  const names = new Set(mapped.map((m) => m.itemName));
  const all = await listAllItems();
  const filtered = all.filter((i) => names.has(i.name));
  // If the mapped names didn't actually resolve to real items (stale data),
  // fall back rather than showing an empty picker.
  return filtered.length > 0 ? filtered : all;
}

export async function getItem(name: string): Promise<Item | undefined> {
  return db.query.items.findFirst({ where: eq(items.name, name) });
}

export async function getVendor(name: string): Promise<Vendor | undefined> {
  return db.query.vendors.findFirst({ where: eq(vendors.name, name) });
}

/**
 * GST % and HSN code per item name — shown only on the accounts side.
 * Gate/Store/Purchase screens deal in basic (GST-exclusive) rates and never
 * surface these fields.
 */
export async function gstInfoForItems(
  names: string[]
): Promise<Map<string, { gstPct: string | null; hsnCode: string | null }>> {
  if (names.length === 0) return new Map();
  const rows = await db
    .select({ name: items.name, gstPct: items.gstPct, hsnCode: items.hsnCode })
    .from(items)
    .where(inArray(items.name, names));
  return new Map(rows.map((r) => [r.name, { gstPct: r.gstPct, hsnCode: r.hsnCode }]));
}

export interface BillWithItems {
  bill: Bill;
  items: BillItem[];
}

export async function getBillWithItems(
  billId: string
): Promise<BillWithItems | null> {
  const bill = await db.query.bills.findFirst({
    where: eq(bills.id, billId),
  });
  if (!bill) return null;
  const its = await db.query.billItems.findMany({
    where: eq(billItems.billId, billId),
    orderBy: asc(billItems.id),
  });
  return { bill, items: its };
}

export async function listGrnQueue(): Promise<Bill[]> {
  return db.query.bills.findMany({
    where: eq(bills.grnStatus, "pending"),
    orderBy: asc(bills.gateDate),
  });
}

export async function listVendorIssues(): Promise<Bill[]> {
  return db.query.bills.findMany({
    where: eq(bills.grnStatus, "short"),
    orderBy: asc(bills.grnCheckedDate),
  });
}

export async function listPriceQueries(): Promise<Bill[]> {
  return db.query.bills.findMany({
    where: eq(bills.priceStatus, "query"),
    orderBy: asc(bills.priceDate),
  });
}

export async function listPriceQueue(): Promise<Bill[]> {
  return db.query.bills.findMany({
    where: eq(bills.priceStatus, "pending"),
    orderBy: asc(bills.gateDate),
  });
}

export async function listReadyForAccounts(): Promise<Bill[]> {
  const rows = await db.query.bills.findMany({
    where: and(eq(bills.grnStatus, "ok"), eq(bills.priceStatus, "approved")),
    orderBy: asc(bills.gateDate),
  });
  return rows.filter((b) => !b.tallyVoucherNo);
}

export async function listInTally(limit = 30): Promise<Bill[]> {
  return db.query.bills.findMany({
    where: isNotNull(bills.tallyVoucherNo),
    orderBy: desc(bills.accountsPostedDate),
    limit,
  });
}

/** Every bill not yet posted to Tally — the pool Dashboard scans for stuck bills. */
export async function listActiveBills(): Promise<Bill[]> {
  return db.query.bills.findMany({
    where: isNull(bills.tallyVoucherNo),
    orderBy: asc(bills.updatedAt),
  });
}

export async function billAudit(billId: string) {
  return db.query.auditLog.findMany({
    where: eq(auditLog.billId, billId),
    orderBy: desc(auditLog.at),
  });
}

export async function recentBills(limit = 20): Promise<Bill[]> {
  return db.query.bills.findMany({
    orderBy: desc(bills.gateDate),
    limit,
  });
}
