import { eq, and, desc, asc } from "drizzle-orm";
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
  return db.query.vendors.findMany({ orderBy: asc(vendors.name) });
}

export async function listAllItems(): Promise<Item[]> {
  return db.query.items.findMany({ orderBy: asc(items.name) });
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
