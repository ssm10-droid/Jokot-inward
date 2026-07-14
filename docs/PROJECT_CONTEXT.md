# Jokot Inward — Project Context

Read this first in any new chat about this project. It's written so a
fresh Claude conversation (which starts with zero memory of past chats)
can pick up exactly where things left off without re-asking questions
already answered or re-hitting bugs already fixed.

## What this is

Purchase-bill inward tracking for Jokot International, a footwear
manufacturer in Karnataka. Replaces a paper/AppSheet process. A bill
moves through four stages — Gate (create) → Store + Purchase (parallel
checks) → Accounts (post to Tally) — with every state transition
recorded. Full original business-logic spec is in the repo's
`README.md` build history / commit messages; the short version is below.

## Repo & deployment

- **GitHub**: `github.com/ssm10-droid/Jokot-inward` (private), branch `main`
- **Vercel**: project `jokot-inward`, team `jift`, auto-deploys on push to `main`
- **Database**: Neon Postgres, via Drizzle ORM (`src/db/schema.ts`)
- **Auth**: email + password (NextAuth Credentials provider, bcrypt hashes
  in the `users` table) — no external identity provider
- **File storage**: Vercel Blob, **private access** (this team's store
  policy) — files are served through `/files/[...path]`, an app route
  that checks the session before streaming. Never link a raw Blob URL
  directly; it will 403/error. Always go through `uploadBuffer()` in
  `src/lib/blob.ts`, which already returns the correct `/files/...` path.
- **Admin/setup**: `/setup` page, gated by the `SETUP_SECRET` env var (not
  a login) — creates tables (idempotent DDL in `src/lib/setup-sql.ts`),
  and upserts users / vendors / items / the bill-number counter. Rerunnable
  anytime to add more of any of those or reset a password.

### Env vars (set in Vercel, not committed)
`DATABASE_URL`, `AUTH_SECRET`, `SETUP_SECRET`, `EXPORT_TOKEN`,
`BLOB_READ_WRITE_TOKEN` (auto-injected when the Blob store is connected —
the "add a read-write token env var" checkbox must be checked when
connecting, it's unchecked by default and easy to miss).

### Bundled master-data import
`src/data/master-import.json` — 88 vendors, 317 items, 401 vendor-item
mappings, cleaned and deduped from the real AppSheet export (Vendor
Master, Item Master, Supplier Item Map sheets). Imported via a checkbox
on `/setup`, batched in groups of 200 with `onConflictDoNothing()` — not
a paste-into-textarea flow, because several real vendor names contain
commas (e.g. "CEYENAR CHEMICALS PVT.LTD, Kerala") which would corrupt on
a naive comma-split. If the source Excel changes, regenerate this JSON
with the same cleaning steps (dedupe by trimmed name, normalize
whitespace so Supplier Item Map's vendor names match Vendor Master
exactly) rather than hand-editing it.

### CSV export for Google Sheets
`/export/{bills,bill-items,vendors,items,supplier-item-map}?token=...`,
checked against `EXPORT_TOKEN` (trimmed both sides). Deliberately
excluded from the session-required middleware in `src/auth.config.ts`
since `IMPORTDATA` can't send a login cookie. Wired into a Google Sheet
via `=IMPORTDATA("https://.../export/bills?token=...")` per tab.

## Everyone involved, non-technical

The person running this project (Shashank) works entirely from a phone
browser — no laptop, no terminal access on their end. Every setup step,
every fix, every piece of guidance has to be phone-doable: Vercel
dashboard taps, `/setup` form submissions, screenshots of error screens
relayed back for diagnosis. Assume this in any future chat: don't suggest
CLI commands, `.env` file edits, or anything requiring a local dev
environment on their side. Claude does the actual coding/pushing via its
own sandboxed container + a GitHub token they generate and paste in.

## How to start a new "build" chat

Each new Claude chat starts with an empty sandbox — no repo cloned, no
git history. To resume development:

1. Ask the user for a fresh GitHub fine-grained personal access token
   (Repository access: only `Jokot-inward`; Permissions → Contents:
   Read and write). Their last one expires ~30 days after creation;
   check if it's still valid before asking for a new one.
2. `git clone https://x-access-token:<TOKEN>@github.com/ssm10-droid/Jokot-inward.git`
3. `npm install`
4. Read this file and `README.md` in full before making changes.
5. Typecheck (`npx tsc --noEmit`) and build
   (`DATABASE_URL=... AUTH_SECRET=... SETUP_SECRET=... BLOB_READ_WRITE_TOKEN=... npx next build`
   with dummy values — see README) before every push. This has caught
   real bugs every single time it's been skipped.
6. Commit with a descriptive message, push to `main` — Vercel auto-deploys.

A GitHub MCP connector (if the user connects one via Claude's connector
directory) would remove the need to re-paste a token each time. Worth
suggesting if this token dance gets old.

## Data model summary

Six core tables (`src/db/schema.ts`): `bills`, `bill_items`, `vendors`,
`items`, `supplier_item_map`, `users`. Plus `counters` (atomic ID
sequences) and `audit_log` (every transition, who + when).

**Computed, never stored**: `total_amount`, `items_count`, `stage`,
`waiting_on`, and all the shortage/discrepancy-completeness flags. All
derived at read time in `src/lib/derive.ts` — one module, nothing can
drift out of sync. Read this file before touching any status logic.

**Validation timing rule** (already correctly implemented, don't
regress it): marking a line "short" or "discrepancy" never requires the
detail fields (qty received, reason, correct rate) at that instant.
Those are enforced later, at the *forward action* (Confirm GRN / Approve
Rates), not at the status-change click. This was a deliberate,
spec-driven design choice — mirroring it in any new transition matters.

## State machine / transition files

Each of these is a `"use server"` file holding role check → precondition
check → mutation → audit log entry, called directly from client
components as server actions:

- `src/app/bills/new/actions.ts` — `createBillAction` (gate)
- `src/app/grn/[id]/actions.ts` — `markItemCheckAction`, `confirmGrnAction` (store)
- `src/app/price/[id]/actions.ts` — `markItemRateAction`, `approveRatesAction`, `raiseQueryAction` (purchase)
- `src/app/issues/actions.ts` — `resolveShortageAction`, `resolvePriceQueryAction` (purchase)

Permissions are always re-checked server-side via `requireRole()` /
`requirePageRole()` in `src/lib/authz.ts` — the session's role claim is
display-only, never trusted for authorization.

## Phase status

- ✅ **Phase 0** — schema, auth, role lookup, `/setup` tooling
- ✅ **Phase 1** — Gate entry, GRN Queue, quantity check, Confirm GRN,
  GRN Note + Vendor Shortage Note PDFs, bill detail/audit page
- ✅ **Phase 2** — Price Approvals, rate check, Approve Rates, Raise
  Query, Vendor Issues (resolves both shortages and price queries)
- ⬜ **Phase 3 (next)** — Post to Tally screen (accounts role, dumb voucher-number
  entry — no real Tally integration, that's explicitly out of scope per
  the original spec until the import contract is separately confirmed),
  Dashboard (per-queue counts, 48h-stuck-bill flags)
- ⬜ **Phase 4** — Notifications (daily digest, build only after the
  core flow has run in real use for a week or two)

## Judgment calls made where the original spec was silent

Both documented in more detail in `README.md`, worth knowing before
changing related code:

1. `total_amount` / `items_count` are computed, not stored columns —
   avoids any possibility of drift.
2. `grn_status` and `price_status` have no "resolved" state in the
   schema. Resolving a shortage or price query moves them back to
   `ok` / `approved` (stamped with resolver + timestamp) so a bill can
   still reach `ready_for_accounts` after a real issue is genuinely
   settled — otherwise it'd be stuck at `vendor_issue` forever.

## Bugs already found and fixed — don't rediscover these

1. **`SETUP_SECRET` comparison must `.trim()` both sides.** Vercel's env
   var textarea and mobile keyboards can introduce invisible trailing
   whitespace; a strict `===` comparison broke setup for a while.
2. **`@react-pdf/renderer` must be in `serverExternalPackages`** in
   `next.config.ts`, or Vercel's bundler mangles its internal font/layout
   engine and every PDF-generating action crashes at runtime (passed
   local build and typecheck fine — only broke in production).
3. **This team's Vercel Blob store is private-access-only.** Uploading
   with `access: 'public'` throws. Always use `access: 'private'` and
   serve through the authenticated `/files/[...path]` route — see
   `src/lib/blob.ts`.
4. **PDF generation in `confirmGrnAction` is wrapped in try/catch and
   never blocks the actual state transition.** A bill must always be
   confirmable even if PDF rendering/upload has a bad day; a missing PDF
   can be regenerated later, a stuck bill cannot.
5. **Env var changes in Vercel need a manual redeploy to take effect** —
   editing a var doesn't retroactively apply to the currently-running
   deployment.
6. **The Blob store connection dialog has an easy-to-miss checkbox**
   ("Add a read-write token env var to this connection") — unchecked by
   default, and without it `BLOB_READ_WRITE_TOKEN` never gets created.

## Testing discipline before every push

1. `npx tsc --noEmit` — must be clean
2. `next build` with dummy env vars — must succeed (catches bundler-level
   issues typecheck misses, like #2 above)
3. For anything touching PDFs: render them with real-shaped fake data via
   a throwaway `tsx` script and actually open the output — typecheck and
   build passing does NOT guarantee `@react-pdf/renderer` produces a
   correct-looking document.

## Master data: Google Sheets is now the source of truth (July 2026)

The bundled AppSheet JSON import on `/setup` was replaced by a
**sync-from-Google-Sheets** feature. One Google Sheet (published to web)
holds three tabs: Item master (gid=0), Vendor master (gid=1503885591),
Supplier-item map (gid=1381933379). The published CSV links are
pre-filled as defaults in `/setup`; logic lives in
`src/lib/sheet-sync.ts`.

Semantics (per the owner's explicit instruction — replace, not merge):

- The sheet is the master. Sync upserts everything on it and removes DB
  rows no longer on it: **deleted if never used on a bill, deactivated
  (`active = false`) if used** — hard deletes of referenced rows would
  break the bills FK. Deactivated rows disappear from every picker
  (`listVendors`/`listAllItems` filter `active = true`) but old bills
  render fine.
- Two-step: **Preview** (dry run, writes nothing — safe on any
  deployment) then **Apply** (recomputes and executes). Always preview
  first.
- Supplier-item map tab is fully rebuilt on each sync. Names are matched
  case-insensitively against the two master tabs; rows that don't match
  are skipped and listed in the report (the sheet has known typos, e.g.
  "DIKISHA PACKAGEING", "Haryan Impex", "NOOH INTERIOS", and a stray
  "Grand Total" row). Duplicates are skipped. Junk names ("", "0",
  "Grand Total") are ignored on all tabs.
- New columns: vendors get `vendor_group`, `gst_reg_type`, `active`;
  items get `item_group`, `hsn_code`, `active` (plus existing `gst_pct`
  now populated). Idempotent ALTERs are in `setup-sql.ts`.
- **GST % and HSN are accounts-facing only** (owner's instruction):
  shown on the accounts Post-to-Tally bill page. Gate/Store/Purchase
  screens keep working in basic GST-exclusive rates and must not
  surface these fields.
- `/setup` also gained an admin-only "Remove one vendor or item" form
  (same delete-if-unused / deactivate-if-used rule; also clears its
  supplier-item-map rows). A sheet sync will re-add the entry if it's
  still on the sheet.
- Users are deliberately NOT synced from the sheet (plaintext passwords
  on a published sheet would be readable by anyone with the link); user
  management stays on the `/setup` form.
