import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { vendors, items, supplierItemMap, bills, billItems } from "@/db/schema";

/**
 * Google-Sheets master-data sync.
 *
 * The sheet is the master: everything on the published tabs is loaded, and
 * DB rows that are no longer on the sheet are removed — deleted outright if
 * no bill has ever referenced them, deactivated (active = false) if one has,
 * because hard-deleting a referenced vendor/item would violate the FK and
 * corrupt bill history. Deactivated rows vanish from every picker and
 * suggestion list but old bills keep displaying correctly.
 *
 * Runs in two steps from /setup: Preview (computes the full plan, writes
 * nothing) and Apply (recomputes and executes). Preview is always safe to
 * run, including on a trial deployment that shares the production database.
 */

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180-ish: quoted fields, embedded commas/quotes/newlines)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip BOM
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty rows
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Fetching + row cleaning
// ---------------------------------------------------------------------------

const JUNK_NAMES = new Set(["", "0", "grand total", "total"]);

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function isJunk(name: string): boolean {
  return JUNK_NAMES.has(name.toLowerCase());
}

/** "12 %" -> "12", "" -> null; anything non-numeric -> null */
function parseGst(raw: string): string | null {
  const m = raw.replace(/%/g, "").trim();
  if (!m) return null;
  const n = Number(m);
  return Number.isFinite(n) ? String(n) : null;
}

async function fetchCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not fetch sheet (HTTP ${res.status}). Check the link is a published-to-web CSV link.`);
  }
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      "The link returned a web page, not CSV. Use the Publish-to-web link with output=csv."
    );
  }
  return parseCsv(text);
}

export interface SheetVendor {
  name: string;
  vendorGroup: string | null;
  state: string | null;
  gstRegType: string | null;
  gstin: string | null;
}

export interface SheetItem {
  name: string;
  itemGroup: string | null;
  uom: string | null;
  gstPct: string | null;
  hsnCode: string | null;
}

export interface SheetMapRow {
  supplierName: string;
  itemName: string;
  supplierItemCode: string | null;
}

/**
 * Header-based column lookup so a reordered sheet doesn't silently import
 * the wrong columns. Matching is fuzzy on a few known header spellings.
 */
function headerIndex(headers: string[], ...candidates: string[]): number {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  for (const c of candidates) {
    const idx = norm.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

export function rowsToVendors(rows: string[][]): SheetVendor[] {
  const [head, ...body] = rows;
  const iName = headerIndex(head, "nameofledger", "name", "vendorname");
  const iUnder = headerIndex(head, "under", "group");
  const iState = headerIndex(head, "statename", "state");
  const iReg = headerIndex(head, "gstregistrationtype", "gstregtype");
  const iGstin = headerIndex(head, "gstinuin", "gstin");
  if (iName === -1) throw new Error("Vendor sheet: couldn't find a 'Name of Ledger' column.");
  const out: SheetVendor[] = [];
  const seen = new Set<string>();
  for (const r of body) {
    const name = cleanName(r[iName] ?? "");
    if (isJunk(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // first occurrence wins
    seen.add(key);
    out.push({
      name,
      vendorGroup: cleanName(r[iUnder] ?? "") || null,
      state: cleanName(r[iState] ?? "") || null,
      gstRegType: cleanName(r[iReg] ?? "") || null,
      gstin: cleanName(r[iGstin] ?? "") || null,
    });
  }
  return out;
}

export function rowsToItems(rows: string[][]): SheetItem[] {
  const [head, ...body] = rows;
  const iName = headerIndex(head, "nameofitem", "name", "itemname");
  const iUnder = headerIndex(head, "under", "group");
  const iUnits = headerIndex(head, "units", "uom", "unit");
  const iGst = headerIndex(head, "gstrate", "gst");
  const iHsn = headerIndex(head, "hsncode", "hsn");
  if (iName === -1) throw new Error("Item sheet: couldn't find a 'Name of Item' column.");
  const out: SheetItem[] = [];
  const seen = new Set<string>();
  for (const r of body) {
    const name = cleanName(r[iName] ?? "");
    if (isJunk(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      itemGroup: cleanName(r[iUnder] ?? "") || null,
      uom: cleanName(r[iUnits] ?? "") || null,
      gstPct: parseGst(r[iGst] ?? ""),
      hsnCode: cleanName(r[iHsn] ?? "") || null,
    });
  }
  return out;
}

export function rowsToMap(rows: string[][]): SheetMapRow[] {
  const [head, ...body] = rows;
  const iSup = headerIndex(head, "suppliername", "vendorname", "supplier");
  const iItem = headerIndex(head, "itemname", "item");
  const iCode = headerIndex(head, "supplieritemcode", "code");
  const iActive = headerIndex(head, "isactive", "active");
  if (iSup === -1 || iItem === -1) {
    throw new Error("Supplier-item sheet: couldn't find SUPPLIER_NAME / ITEM_NAME columns.");
  }
  const out: SheetMapRow[] = [];
  for (const r of body) {
    const supplierName = cleanName(r[iSup] ?? "");
    const itemName = cleanName(r[iItem] ?? "");
    if (isJunk(supplierName) || isJunk(itemName)) continue;
    if (iActive !== -1 && cleanName(r[iActive] ?? "").toLowerCase() === "no") continue;
    out.push({
      supplierName,
      itemName,
      supplierItemCode: iCode !== -1 ? cleanName(r[iCode] ?? "") || null : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plan (dry run) + Apply
// ---------------------------------------------------------------------------

export interface SyncPlan {
  vendors: { add: number; update: number; del: string[]; deactivate: string[] };
  items: { add: number; update: number; del: string[]; deactivate: string[] };
  map: { insert: number; duplicatesSkipped: number; unmatched: string[] };
  sheetVendors: SheetVendor[];
  sheetItems: SheetItem[];
  mapRows: { supplierName: string; itemName: string; supplierItemCode: string | null }[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function buildSyncPlan(
  vendorUrl: string,
  itemUrl: string,
  mapUrl: string
): Promise<SyncPlan> {
  const [vendorRows, itemRows, mapRows] = await Promise.all([
    fetchCsv(vendorUrl),
    fetchCsv(itemUrl),
    fetchCsv(mapUrl),
  ]);
  const sheetVendors = rowsToVendors(vendorRows);
  const sheetItems = rowsToItems(itemRows);
  const sheetMap = rowsToMap(mapRows);

  if (sheetVendors.length < 5) throw new Error("Vendor sheet parsed to fewer than 5 rows — wrong link?");
  if (sheetItems.length < 5) throw new Error("Item sheet parsed to fewer than 5 rows — wrong link?");

  // Existing DB state
  const dbVendors = await db.select({ name: vendors.name }).from(vendors);
  const dbItems = await db.select({ name: items.name }).from(items);
  const usedVendorRows = await db
    .selectDistinct({ name: bills.vendorName })
    .from(bills);
  const usedItemRows = await db
    .selectDistinct({ name: billItems.itemName })
    .from(billItems);

  const usedVendors = new Set(usedVendorRows.map((r) => r.name));
  const usedItems = new Set(usedItemRows.map((r) => r.name));

  // Case-insensitive lookup: sheet name (lower) -> canonical sheet name
  const vendorByLower = new Map(sheetVendors.map((v) => [v.name.toLowerCase(), v.name]));
  const itemByLower = new Map(sheetItems.map((i) => [i.name.toLowerCase(), i.name]));

  // Vendors: exact-name match decides add vs update; case-only differences
  // count as "not in sheet" for the old spelling (new spelling is inserted).
  const dbVendorNames = new Set(dbVendors.map((v) => v.name));
  const dbItemNames = new Set(dbItems.map((i) => i.name));

  const vendorAdd = sheetVendors.filter((v) => !dbVendorNames.has(v.name)).length;
  const vendorUpdate = sheetVendors.length - vendorAdd;
  const sheetVendorNames = new Set(sheetVendors.map((v) => v.name));
  const vendorGone = dbVendors.map((v) => v.name).filter((n) => !sheetVendorNames.has(n));
  const vendorDel = vendorGone.filter((n) => !usedVendors.has(n));
  const vendorDeact = vendorGone.filter((n) => usedVendors.has(n));

  const itemAdd = sheetItems.filter((i) => !dbItemNames.has(i.name)).length;
  const itemUpdate = sheetItems.length - itemAdd;
  const sheetItemNames = new Set(sheetItems.map((i) => i.name));
  const itemGone = dbItems.map((i) => i.name).filter((n) => !sheetItemNames.has(n));
  const itemDel = itemGone.filter((n) => !usedItems.has(n));
  const itemDeact = itemGone.filter((n) => usedItems.has(n));

  // Mapping: resolve names case-insensitively against the sheet masters,
  // dedupe, report what didn't match instead of failing.
  const unmatched: string[] = [];
  const mapSeen = new Set<string>();
  const resolved: SyncPlan["mapRows"] = [];
  let duplicatesSkipped = 0;
  for (const m of sheetMap) {
    const sup = vendorByLower.get(m.supplierName.toLowerCase());
    const it = itemByLower.get(m.itemName.toLowerCase());
    if (!sup || !it) {
      unmatched.push(
        `${m.supplierName} → ${m.itemName}` +
          (!sup && !it ? " (vendor & item)" : !sup ? " (vendor)" : " (item)")
      );
      continue;
    }
    const id = `${sup}::${it}`;
    if (mapSeen.has(id)) {
      duplicatesSkipped++;
      continue;
    }
    mapSeen.add(id);
    resolved.push({ supplierName: sup, itemName: it, supplierItemCode: m.supplierItemCode });
  }

  return {
    vendors: { add: vendorAdd, update: vendorUpdate, del: vendorDel, deactivate: vendorDeact },
    items: { add: itemAdd, update: itemUpdate, del: itemDel, deactivate: itemDeact },
    map: { insert: resolved.length, duplicatesSkipped, unmatched },
    sheetVendors,
    sheetItems,
    mapRows: resolved,
  };
}

export async function applySyncPlan(plan: SyncPlan): Promise<void> {
  // 1. Upsert vendors from the sheet (reactivates anything previously deactivated)
  for (const batch of chunk(plan.sheetVendors, 100)) {
    await db
      .insert(vendors)
      .values(batch.map((v) => ({ ...v, active: true })))
      .onConflictDoUpdate({
        target: vendors.name,
        set: {
          vendorGroup: sql`excluded.vendor_group`,
          state: sql`excluded.state`,
          gstRegType: sql`excluded.gst_reg_type`,
          gstin: sql`excluded.gstin`,
          active: true,
        },
      });
  }

  // 2. Upsert items
  for (const batch of chunk(plan.sheetItems, 100)) {
    await db
      .insert(items)
      .values(batch.map((i) => ({ ...i, type: "stock" as const, active: true })))
      .onConflictDoUpdate({
        target: items.name,
        set: {
          itemGroup: sql`excluded.item_group`,
          uom: sql`excluded.uom`,
          gstPct: sql`excluded.gst_pct`,
          hsnCode: sql`excluded.hsn_code`,
          active: true,
        },
      });
  }

  // 3. Remove what's no longer on the sheet — mapping rows first so vendor
  // deletes aren't left with dangling map entries, then deactivate, then delete.
  for (const batch of chunk(plan.vendors.deactivate, 100)) {
    await db.update(vendors).set({ active: false }).where(inArray(vendors.name, batch));
  }
  for (const batch of chunk(plan.items.deactivate, 100)) {
    await db.update(items).set({ active: false }).where(inArray(items.name, batch));
  }

  // 4. Full replace of the supplier-item map (sheet is the master)
  await db.delete(supplierItemMap);
  for (const batch of chunk(plan.mapRows, 100)) {
    await db
      .insert(supplierItemMap)
      .values(
        batch.map((m) => ({
          id: `${m.supplierName}::${m.itemName}`,
          supplierName: m.supplierName,
          itemName: m.itemName,
          supplierItemCode: m.supplierItemCode,
          isActive: true,
        }))
      )
      .onConflictDoNothing();
  }

  // 5. Hard deletes last (unused rows only — FK-safe by construction)
  for (const batch of chunk(plan.vendors.del, 100)) {
    await db.delete(vendors).where(inArray(vendors.name, batch));
  }
  for (const batch of chunk(plan.items.del, 100)) {
    await db.delete(items).where(inArray(items.name, batch));
  }
}

/** Compact human-readable report for the /setup result banner. */
export function describePlan(plan: SyncPlan, applied: boolean): string[] {
  const verb = applied ? "" : " (preview — nothing written yet)";
  const lines: string[] = [];
  lines.push(
    `Vendors${verb}: ${plan.vendors.add} new, ${plan.vendors.update} updated, ` +
      `${plan.vendors.del.length} deleted, ${plan.vendors.deactivate.length} deactivated (used on old bills).`
  );
  lines.push(
    `Items${verb}: ${plan.items.add} new, ${plan.items.update} updated, ` +
      `${plan.items.del.length} deleted, ${plan.items.deactivate.length} deactivated (used on old bills).`
  );
  lines.push(
    `Vendor-item map${verb}: rebuilt with ${plan.map.insert} mappings` +
      (plan.map.duplicatesSkipped ? `, ${plan.map.duplicatesSkipped} duplicate rows skipped` : "") +
      "."
  );
  if (plan.map.unmatched.length > 0) {
    const shown = plan.map.unmatched.slice(0, 8);
    lines.push(
      `${plan.map.unmatched.length} mapping rows skipped — the name doesn't match the master tab exactly: ` +
        shown.join("; ") +
        (plan.map.unmatched.length > shown.length ? "; …" : "") +
        " — fix the spelling on the sheet and re-run to include them."
    );
  }
  return lines;
}
