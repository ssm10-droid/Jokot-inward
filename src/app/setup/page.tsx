import { sql, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, vendors, items, supplierItemMap, bills, billItems } from "@/db/schema";
import { SETUP_STATEMENTS, MASTER_SYNC_COLUMNS } from "@/lib/setup-sql";
import { buildSyncPlan, applySyncPlan, describePlan } from "@/lib/sheet-sync";
import masterImportData from "@/data/master-import.json";

// The sync action fetches three Google Sheets and runs several DB round
// trips — give it more than the default serverless time budget.
export const maxDuration = 60;

// Published-to-web CSV links for the three master tabs of the Jokot master
// Google Sheet — pre-filled in the sync form; editable there if the sheet
// is ever republished under a new link.
const DEFAULT_SHEET_BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSzUdwFcyTJetmFYM6FUsVRaT8y4uw3pYlmddF9j0RUue_7NDza4mHE3S_VjgznfMl8DJe-8nfdhEAj/pub";
const DEFAULT_ITEM_URL = `${DEFAULT_SHEET_BASE}?gid=0&single=true&output=csv`;
const DEFAULT_VENDOR_URL = `${DEFAULT_SHEET_BASE}?gid=1503885591&single=true&output=csv`;
const DEFAULT_MAP_URL = `${DEFAULT_SHEET_BASE}?gid=1381933379&single=true&output=csv`;

// The old one-time bundled AppSheet import has been superseded by the
// Google-Sheets master-data sync below (the sheet is now the master).
// src/data/master-import.json is kept in the repo purely as a historical
// snapshot of what was originally seeded.
void masterImportData;

function checkSecret(formData: FormData): string | null {
  const secret = String(formData.get("secret") ?? "").trim();
  const expected = process.env.SETUP_SECRET?.trim();
  if (!expected) return "SETUP_SECRET is not configured in Vercel environment variables.";
  if (secret !== expected) return "Wrong setup secret.";
  return null;
}

/**
 * Google-Sheets master-data sync. Preview computes and reports the full
 * plan without writing anything; Apply recomputes and executes it. The
 * sheet is the master: rows missing from it are deleted if never used on a
 * bill, deactivated otherwise (hidden from all pickers, old bills intact).
 */
async function runSheetSync(formData: FormData): Promise<Result> {
  const authErr = checkSecret(formData);
  if (authErr) return { ok: false, lines: [authErr] };

  const vendorUrl = String(formData.get("vendorUrl") ?? "").trim();
  const itemUrl = String(formData.get("itemUrl") ?? "").trim();
  const mapUrl = String(formData.get("mapUrl") ?? "").trim();
  if (!vendorUrl || !itemUrl || !mapUrl) {
    return { ok: false, lines: ["All three sheet links are required."] };
  }
  const apply = String(formData.get("mode")) === "apply";

  try {
    // Make sure the new columns exist even on a database created earlier
    // (just the six ALTERs — the full DDL set runs in the main setup form).
    for (const stmt of MASTER_SYNC_COLUMNS) {
      await db.execute(sql.raw(stmt));
    }
    const plan = await buildSyncPlan(vendorUrl, itemUrl, mapUrl);
    if (apply) await applySyncPlan(plan);
    const lines = describePlan(plan, apply);
    lines.push(
      apply
        ? "Sync applied — the app now follows the Google Sheet."
        : "Preview only. Tap Apply sync to make these changes for real."
    );
    return { ok: true, lines };
  } catch (e) {
    return {
      ok: false,
      lines: [`Sync failed: ${e instanceof Error ? e.message : "unknown error"}. Nothing was left half-done on the vendor/item masters — fix and re-run.`],
    };
  }
}

/**
 * Admin-only single-entry removal, for fixing mistakes: deletes the vendor
 * or item outright if no bill has ever used it, deactivates it otherwise.
 * Its vendor-item mappings are removed either way.
 */
async function runMasterDelete(formData: FormData): Promise<Result> {
  const authErr = checkSecret(formData);
  if (authErr) return { ok: false, lines: [authErr] };

  const kind = String(formData.get("kind") ?? "");
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, lines: ["Type the exact vendor or item name to remove."] };

  try {
    if (kind === "vendor") {
      const found = await db
        .select({ name: vendors.name })
        .from(vendors)
        .where(sql`lower(${vendors.name}) = lower(${name})`);
      if (found.length === 0) return { ok: false, lines: [`No vendor named "${name}" found.`] };
      const exact = found[0].name;
      const used = await db
        .select({ id: bills.id })
        .from(bills)
        .where(eq(bills.vendorName, exact))
        .limit(1);
      await db.delete(supplierItemMap).where(eq(supplierItemMap.supplierName, exact));
      if (used.length > 0) {
        await db.update(vendors).set({ active: false }).where(eq(vendors.name, exact));
        return {
          ok: true,
          lines: [`"${exact}" is used on existing bills, so it was deactivated instead of deleted — it no longer appears anywhere in daily work, and old bills stay intact.`],
        };
      }
      await db.delete(vendors).where(eq(vendors.name, exact));
      return { ok: true, lines: [`Vendor "${exact}" deleted.`] };
    }

    if (kind === "item") {
      const found = await db
        .select({ name: items.name })
        .from(items)
        .where(sql`lower(${items.name}) = lower(${name})`);
      if (found.length === 0) return { ok: false, lines: [`No item named "${name}" found.`] };
      const exact = found[0].name;
      const used = await db
        .select({ id: billItems.id })
        .from(billItems)
        .where(eq(billItems.itemName, exact))
        .limit(1);
      await db.delete(supplierItemMap).where(eq(supplierItemMap.itemName, exact));
      if (used.length > 0) {
        await db.update(items).set({ active: false }).where(eq(items.name, exact));
        return {
          ok: true,
          lines: [`"${exact}" is used on existing bills, so it was deactivated instead of deleted — it no longer appears anywhere in daily work, and old bills stay intact.`],
        };
      }
      await db.delete(items).where(eq(items.name, exact));
      return { ok: true, lines: [`Item "${exact}" deleted.`] };
    }

    return { ok: false, lines: ["Choose whether it's a vendor or an item."] };
  } catch (e) {
    return { ok: false, lines: [`Delete failed: ${e instanceof Error ? e.message : "unknown error"}`] };
  }
}

/**
 * Phone-only setup. Visit /setup after deploying, enter the SETUP_SECRET
 * you configured in Vercel env vars, then submit whichever sections you
 * need — tables always get (re)created, and everything else (bundled
 * master-data import, users, vendors, items, mapping, bill counter) is
 * independently optional and safe to rerun anytime.
 */

const VALID_ROLES = ["gate", "store", "purchase", "accounts", "partner"];

type Result = { ok: boolean; lines: string[] };

async function runSetup(formData: FormData): Promise<Result> {
  "use server";
  const lines: string[] = [];

  const authErr = checkSecret(formData);
  if (authErr) return { ok: false, lines: [authErr] };

  // 1. Tables
  for (const stmt of SETUP_STATEMENTS) {
    await db.execute(sql.raw(stmt));
  }
  lines.push("Tables created (or already present).");

  // 2. Users — one per line: email, name, role, password
  // Re-running with a new password resets that user's password.
  // Omit the password (3 fields) to update name/role without touching it.
  const userText = String(formData.get("users") ?? "").trim();
  let added = 0;
  if (userText) {
    for (const rawLine of userText.split("\n")) {
      const parts = rawLine.split(",").map((s) => s.trim());
      if (parts.length < 3 || !parts[0]) continue;
      const [email, name, roleRaw, password] = parts;
      const role = roleRaw.toLowerCase();
      if (!VALID_ROLES.includes(role)) {
        lines.push(`Skipped ${email}: unknown role "${roleRaw}".`);
        continue;
      }
      if (password && password.length < 6) {
        lines.push(`Skipped ${email}: password must be 6+ characters.`);
        continue;
      }
      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      const baseSet = { name, role: role as never, active: true };
      await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          name,
          role: role as (typeof users.$inferInsert)["role"],
          passwordHash,
          active: true,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: passwordHash ? { ...baseSet, passwordHash } : baseSet,
        });
      added++;
    }
    lines.push(`Users added/updated: ${added}.`);
  }

  // 3. Vendors — one per line: name, state, gstin
  // (state/gstin optional; leave blank/omit if unknown for now)
  const vendorText = String(formData.get("vendors") ?? "").trim();
  let vendorsAdded = 0;
  if (vendorText) {
    for (const rawLine of vendorText.split("\n")) {
      const parts = rawLine.split(",").map((s) => s.trim());
      const name = parts[0];
      if (!name) continue;
      const state = parts[1] || null;
      const gstin = parts[2] || null;
      await db
        .insert(vendors)
        .values({ name, state, gstin })
        .onConflictDoUpdate({
          target: vendors.name,
          set: { state, gstin },
        });
      vendorsAdded++;
    }
    lines.push(`Vendors added/updated: ${vendorsAdded}.`);
  }

  // 4. Items — one per line: name, uom, gst_pct
  // (uom/gst_pct optional; type defaults to "stock")
  const itemText = String(formData.get("items") ?? "").trim();
  let itemsAdded = 0;
  if (itemText) {
    for (const rawLine of itemText.split("\n")) {
      const parts = rawLine.split(",").map((s) => s.trim());
      const name = parts[0];
      if (!name) continue;
      const uom = parts[1] || null;
      const gstPct = parts[2] || null;
      await db
        .insert(items)
        .values({ name, uom, gstPct, type: "stock" })
        .onConflictDoUpdate({
          target: items.name,
          set: { uom, gstPct },
        });
      itemsAdded++;
    }
    lines.push(`Items added/updated: ${itemsAdded}.`);
  }

  // 5. Vendor-item mapping — one per line: vendor_name, item_name, supplier_item_code
  // (supplier_item_code optional; this is what filters the item picker per
  // vendor at Gate — leave empty and every vendor just sees the full item
  // list, which is also the built-in fallback if a vendor has no rows here)
  const mapText = String(formData.get("vendorItemMap") ?? "").trim();
  let mapAdded = 0;
  if (mapText) {
    for (const rawLine of mapText.split("\n")) {
      const parts = rawLine.split(",").map((s) => s.trim());
      const supplierName = parts[0];
      const itemName = parts[1];
      if (!supplierName || !itemName) continue;
      const supplierItemCode = parts[2] || null;
      const id = `${supplierName}::${itemName}`;
      await db
        .insert(supplierItemMap)
        .values({ id, supplierName, itemName, supplierItemCode, isActive: true })
        .onConflictDoUpdate({
          target: supplierItemMap.id,
          set: { supplierItemCode, isActive: true },
        });
      mapAdded++;
    }
    lines.push(`Vendor-item mappings added/updated: ${mapAdded}.`);
  }

  // 6. Bill counter
  const lastBillRaw = String(formData.get("lastBill") ?? "").trim();
  if (lastBillRaw) {
    const n = parseInt(lastBillRaw, 10);
    if (Number.isNaN(n) || n < 0) {
      lines.push("Last bill number ignored — must be a plain number.");
    } else {
      await db.execute(sql`
        INSERT INTO counters (key, value) VALUES ('bill:PB26', ${n})
        ON CONFLICT (key) DO UPDATE SET value = GREATEST(counters.value, ${n})
      `);
      lines.push(
        `Bill counter set — next bill will be PB26-${String(n + 1).padStart(4, "0")}.`
      );
    }
  }

  lines.push("Setup complete. Go to the app home page and sign in.");
  return { ok: true, lines };
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  void (await searchParams);

  async function action(formData: FormData) {
    "use server";
    const result = await runSetup(formData);
    // Surface result via redirect query — simplest server-only feedback.
    const { redirect } = await import("next/navigation");
    const msg = encodeURIComponent(result.lines.join(" | "));
    redirect(`/setup?done=${result.ok ? "1" : "0"}&msg=${msg}`);
  }

  async function syncAction(formData: FormData) {
    "use server";
    let result: Result;
    try {
      result = await runSheetSync(formData);
    } catch (e) {
      result = {
        ok: false,
        lines: [`Sync crashed: ${e instanceof Error ? e.message : "unknown error"}`],
      };
    }
    const { redirect } = await import("next/navigation");
    let joined = result.lines.join(" | ");
    if (joined.length > 1500) joined = joined.slice(0, 1500) + " …(truncated)";
    redirect(`/setup?done=${result.ok ? "1" : "0"}&msg=${encodeURIComponent(joined)}`);
  }

  async function deleteAction(formData: FormData) {
    "use server";
    let result: Result;
    try {
      result = await runMasterDelete(formData);
    } catch (e) {
      result = {
        ok: false,
        lines: [`Delete crashed: ${e instanceof Error ? e.message : "unknown error"}`],
      };
    }
    const { redirect } = await import("next/navigation");
    let joined = result.lines.join(" | ");
    if (joined.length > 1500) joined = joined.slice(0, 1500) + " …(truncated)";
    redirect(`/setup?done=${result.ok ? "1" : "0"}&msg=${encodeURIComponent(joined)}`);
  }

  const params = await searchParams;
  const done = params.done;
  const msg = typeof params.msg === "string" ? decodeURIComponent(params.msg) : null;

  return (
    <main>
      <h1>Jokot Inward — Setup</h1>
      <p className="muted">
        One-time database setup. Needs the setup secret from Vercel env vars.
      </p>

      {msg && (
        <div
          className="card"
          style={{
            borderColor: done === "1" ? "var(--accent)" : "#b3261e",
          }}
        >
          {msg.split(" | ").map((l, i) => (
            <p key={i} style={{ margin: "4px 0" }}>
              {l}
            </p>
          ))}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Master data — sync from Google Sheets</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          The Google Sheet is the master list. Syncing loads every vendor,
          item, and vendor-item mapping from the three published tabs and
          removes anything no longer on them (entries already used on bills
          are deactivated instead of deleted, so old bills stay intact).
          Always run <b>Preview</b> first — it shows exactly what will
          change without touching anything.
        </p>
        <form action={syncAction}>
          <label className="muted">Setup secret</label>
          <input
            name="secret"
            type="password"
            required
            style={inputStyle}
            autoComplete="off"
          />
          <label className="muted">Item master tab (published CSV link)</label>
          <input name="itemUrl" defaultValue={DEFAULT_ITEM_URL} required style={urlStyle} />
          <label className="muted">Vendor master tab (published CSV link)</label>
          <input name="vendorUrl" defaultValue={DEFAULT_VENDOR_URL} required style={urlStyle} />
          <label className="muted">Supplier-item map tab (published CSV link)</label>
          <input name="mapUrl" defaultValue={DEFAULT_MAP_URL} required style={urlStyle} />
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="submit" name="mode" value="preview" style={{ flex: 1 }}>
              Preview changes
            </button>
            <button className="primary" type="submit" name="mode" value="apply" style={{ flex: 1 }}>
              Apply sync
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Remove one vendor or item</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          For fixing a mistaken entry. Type the exact name (copy it from the
          app or the sheet). If it has never been used on a bill it is
          deleted; if it has, it is deactivated — hidden from every screen,
          old bills untouched. Note: the next sheet sync will re-add it if
          it is still on the sheet, so remove it there too.
        </p>
        <form action={deleteAction}>
          <label className="muted">Setup secret</label>
          <input
            name="secret"
            type="password"
            required
            style={inputStyle}
            autoComplete="off"
          />
          <label className="muted">What to remove</label>
          <select name="kind" required style={inputStyle} defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            <option value="vendor">Vendor</option>
            <option value="item">Item</option>
          </select>
          <label className="muted">Exact name</label>
          <input name="name" required style={inputStyle} autoComplete="off" />
          <button className="primary" type="submit">
            Remove entry
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Tables, users &amp; manual additions</h2>
        <form action={action}>
          <label className="muted">Setup secret</label>
          <input
            name="secret"
            type="password"
            required
            style={inputStyle}
            autoComplete="off"
          />

          <label className="muted">
            Users — one per line: email, name, role, password
            <br />
            (roles: gate, store, purchase, accounts, partner — password 6+
            characters; re-run with a new password to reset one)
          </label>
          <textarea
            name="users"
            rows={6}
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13 }}
            placeholder={
              "shashank@jokot.in, Shashank, partner, MyPass123\ngate@jokot.in, Gate Security, gate, Gate2026"
            }
          />

          <label className="muted">
            Vendors — one per line: name, state, gstin
            <br />
            (state/gstin optional — leave them off if you don't have them
            yet; re-run anytime to add more vendors)
          </label>
          <textarea
            name="vendors"
            rows={5}
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13 }}
            placeholder={"Uttam Rubbers\nSri Lakshmi Traders, Karnataka\nABC Chemicals, Tamil Nadu, 33ABCDE1234F1Z5"}
          />

          <label className="muted">
            Items — one per line: name, uom, gst_pct
            <br />
            (uom/gst_pct optional — re-run anytime to add more items)
          </label>
          <textarea
            name="items"
            rows={5}
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13 }}
            placeholder={"EVA Slipper Gents 9, PR\nPU Sandal Ladies 6, PR, 18\nMCR Ortho Insole, PR"}
          />

          <label className="muted">
            Vendor-item mapping — one per line: vendor name, item name,
            supplier item code
            <br />
            (code optional — this filters which items show up for a given
            vendor at Gate; leave a vendor out entirely and it just shows
            the full item list)
          </label>
          <textarea
            name="vendorItemMap"
            rows={5}
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13 }}
            placeholder={"Uttam Rubbers, EVA Slipper Gents 9\nUttam Rubbers, MCR Ortho Insole\nSri Lakshmi Traders, PU Sandal Ladies 6"}
          />

          <label className="muted">
            Highest existing AppSheet bill number (digits only, e.g. 137) —
            leave blank to keep current
          </label>
          <input name="lastBill" inputMode="numeric" style={inputStyle} />

          <button className="primary" type="submit" style={{ marginTop: 8 }}>
            Run setup
          </button>
        </form>
      </div>
    </main>
  );
}

const urlStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  margin: "6px 0 16px",
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "monospace",
  background: "#fff",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  margin: "6px 0 16px",
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 15,
  background: "#fff",
};
