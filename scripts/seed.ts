/**
 * Seed master data from CSV exports of the AppSheet sheets.
 *
 * Expected files in ./data (headers must match exactly, case-insensitive):
 *
 *   vendors.csv            name, tally_ledger_name, gstin, default_purchase_ledger, state
 *   items.csv              name, tally_stock_item_name, uom, type, gst_pct
 *   supplier_item_map.csv  supplier_name, item_name, supplier_item_code, is_active
 *   users.csv              email, name, role
 *
 * Usage:
 *   npm run db:push        # create tables first
 *   npm run db:seed        # then seed
 *   npm run db:seed -- --last-bill 137   # also set the PB26 counter so the
 *                                        # next bill becomes PB26-0138
 *
 * Idempotent: re-running upserts rows rather than duplicating them.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  vendors,
  items,
  supplierItemMap,
  users,
  counters,
} from "../src/db/schema";

const DATA_DIR = path.join(process.cwd(), "data");

function readCsv(file: string): Record<string, string>[] {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) {
    console.log(`  (skipped ${file} — not found)`);
    return [];
  }
  const raw = fs.readFileSync(p, "utf8");
  return parse(raw, {
    columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  });
}

const VALID_ROLES = ["gate", "store", "purchase", "accounts", "partner"];

async function main() {
  console.log("Seeding from ./data ...");

  // vendors
  const vendorRows = readCsv("vendors.csv");
  for (const r of vendorRows) {
    if (!r.name) continue;
    await db
      .insert(vendors)
      .values({
        name: r.name,
        tallyLedgerName: r.tally_ledger_name || null,
        gstin: r.gstin || null,
        defaultPurchaseLedger: r.default_purchase_ledger || null,
        state: r.state || null,
      })
      .onConflictDoUpdate({
        target: vendors.name,
        set: {
          tallyLedgerName: r.tally_ledger_name || null,
          gstin: r.gstin || null,
          defaultPurchaseLedger: r.default_purchase_ledger || null,
          state: r.state || null,
        },
      });
  }
  console.log(`  vendors: ${vendorRows.length}`);

  // items
  const itemRows = readCsv("items.csv");
  for (const r of itemRows) {
    if (!r.name) continue;
    const type = r.type === "expense" ? "expense" : "stock";
    await db
      .insert(items)
      .values({
        name: r.name,
        tallyStockItemName: r.tally_stock_item_name || null,
        uom: r.uom || null,
        type,
        gstPct: r.gst_pct || null,
      })
      .onConflictDoUpdate({
        target: items.name,
        set: {
          tallyStockItemName: r.tally_stock_item_name || null,
          uom: r.uom || null,
          type,
          gstPct: r.gst_pct || null,
        },
      });
  }
  console.log(`  items: ${itemRows.length}`);

  // supplier_item_map (known-incomplete — picker falls back to full list)
  const mapRows = readCsv("supplier_item_map.csv");
  for (const r of mapRows) {
    if (!r.supplier_name || !r.item_name) continue;
    const id = `${r.supplier_name}::${r.item_name}`;
    const isActive = (r.is_active ?? "true").toLowerCase() !== "false";
    await db
      .insert(supplierItemMap)
      .values({
        id,
        supplierName: r.supplier_name,
        itemName: r.item_name,
        supplierItemCode: r.supplier_item_code || null,
        isActive,
      })
      .onConflictDoUpdate({
        target: supplierItemMap.id,
        set: { supplierItemCode: r.supplier_item_code || null, isActive },
      });
  }
  console.log(`  supplier_item_map: ${mapRows.length}`);

  // users
  const userRows = readCsv("users.csv");
  for (const r of userRows) {
    if (!r.email || !r.role) continue;
    const role = r.role.toLowerCase();
    if (!VALID_ROLES.includes(role)) {
      console.warn(`  ! skipping ${r.email}: unknown role "${r.role}"`);
      continue;
    }
    await db
      .insert(users)
      .values({
        email: r.email.toLowerCase(),
        name: r.name || r.email,
        role: role as (typeof users.$inferInsert)["role"],
        active: true,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: r.name || r.email, role: role as never },
      });
  }
  console.log(`  users: ${userRows.length}`);

  // bill counter — continue from AppSheet's highest number
  const flagIdx = process.argv.indexOf("--last-bill");
  if (flagIdx !== -1) {
    const lastN = parseInt(process.argv[flagIdx + 1], 10);
    if (Number.isNaN(lastN) || lastN < 0) {
      throw new Error("--last-bill must be a non-negative integer");
    }
    await db.execute(sql`
      INSERT INTO counters (key, value) VALUES ('bill:PB26', ${lastN})
      ON CONFLICT (key) DO UPDATE SET value = GREATEST(counters.value, ${lastN})
    `);
    console.log(
      `  bill counter set: next bill will be PB26-${String(lastN + 1).padStart(4, "0")}`
    );
  } else {
    const existing = await db.query.counters.findFirst();
    if (!existing) {
      console.log(
        "  ! bill counter not set. Run with --last-bill <n> using the highest"
      );
      console.log(
        "    existing AppSheet bill number, or the sequence starts at PB26-0001."
      );
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
