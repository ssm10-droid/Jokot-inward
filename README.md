# Jokot Inward

Purchase-bill inward tracking for Jokot International. Replaces the
AppSheet build with a custom Next.js app on Vercel + Neon Postgres.

**Status: Phase 3 complete**, plus master-data mapping and CSV exports —
Post to Tally (accounts role), Dashboard (per-queue counts, 48h
stuck-bill flags), vendor-item mapping via `/setup`, and live-refreshing
CSV exports for Google Sheets. Core workflow — Gate through Accounts —
is fully built end to end.

## Google Sheets live view

Five CSV export routes, token-protected (no login session — Google
Sheets can't send a cookie):

```
/export/bills?token=...
/export/bill-items?token=...
/export/vendors?token=...
/export/items?token=...
/export/supplier-item-map?token=...
```

Setup: add an `EXPORT_TOKEN` env var in Vercel (any long random string —
treat it like a password, since anyone with the link can read this data,
though not modify it). In a Google Sheet, on an empty tab, one formula
per tab:

```
=IMPORTDATA("https://<your-app>.vercel.app/export/bills?token=YOUR_TOKEN")
```

Google refreshes `IMPORTDATA` roughly hourly on its own, or manually via
the sheet's *Data → Refresh* (or select the cell and press Enter again).
It's not instant-live, but close enough for a working reference view —
building an actual push-sync to Sheets would need Google's API and OAuth,
real added complexity for marginal benefit over this.

## Master data via /setup

Vendors, items, and vendor-item mapping (which filters the item picker
per vendor at Gate) are all loaded the same phone-only way as users —
paste lines into `/setup`, rerunnable anytime to add more. See the page
itself for the exact line format of each box.

## Phase 2 routes

```
/price            purchase — queue of bills awaiting rate check
/price/[id]       purchase — per-item OK/Discrepancy marking, Approve Rates,
                    or Raise Query (bill-level, independent of item marks)
/issues           purchase — resolve shortages (debit note / replacement)
                    and open price queries
```

### A judgment call worth knowing about

The build spec defines `grn_status` as `pending | ok | short` and
`price_status` as `pending | approved | query` — no fourth "resolved"
state, and no automatic rule for what happens to those statuses once
Purchase resolves an issue. Left as-is, a bill with any shortage or price
query would sit at `vendor_issue` forever, even after it's genuinely
settled, because `stage` only becomes `ready_for_accounts` when
`grn_status='ok' AND price_status='approved'`.

So resolving a shortage (either debit note or replacement) sets
`grn_status` back to `'ok'`, and resolving a price query sets
`price_status` to `'approved'` — both stamped with who resolved it and
when, in `resolution_type`/`resolution_notes`/`issue_resolved_by`/
`issue_resolved_date` and via the audit log. This is what lets a bill
that had a real shortage still reach Accounts once everything's been
sorted out administratively. Flagging this because it's a functional
decision filling a gap the spec left open, not something restating spec
behavior.

## One new setup step for Phase 1: Blob storage

Bill photos and generated PDFs need file storage. In Vercel:
**Storage** tab → **Create Database** → **Blob** → connect it to this
project, with **"Add a read-write token env var to this connection"**
checked (easy to miss — it's unchecked by default). No new secret to add
to `.env` by hand; the token is injected automatically.

Files are stored **private** (matching this team's store policy) and
served through `/files/[...path]`, an app route that checks the session
before streaming anything — same authentication as every other page, no
public/guessable URLs.

## Phase 1 routes

```
/bills/new       gate — create bill + line items, camera-capture photo
/bills/[id]       any role — read-only detail, computed stage, audit trail
/grn              store — queue of bills awaiting quantity check
/grn/[id]         store — per-item OK/Short marking, Confirm GRN
```

`src/app/bills/new/actions.ts` and `src/app/grn/[id]/actions.ts` hold the
state-transition logic (createBillAction, markItemCheckAction,
confirmGrnAction) — each does role check → precondition check → mutation
→ audit log entry, matching the "keep it server-side and centralized"
principle from the spec. `confirmGrnAction` is the one enforcing
`shortageDetailsFilled` at the forward action, not at the status change.

## Architecture decisions locked in Phase 0

- **All computed fields derive at read time** (`src/lib/derive.ts`) —
  `stage`, `waiting_on`, total amount, shortage/discrepancy checks. Nothing
  stored, nothing to drift. Every future screen and transition reads from
  this one module.
- **Roles are database-authoritative** (`src/lib/authz.ts`). The session
  token's role is display-only; every server action re-reads the role by
  email. Deactivating a user in the `users` table locks them out instantly.
- **Auth is email + password** (Credentials provider, bcrypt hashes in the
  users table) — no external identity provider to configure.
- **ID sequences use an atomic counter table** (`src/lib/ids.ts`), not
  MAX()+1 — safe when two people submit at the same moment. `PB26-####`
  continues from the AppSheet sequence via the seed script.
- **Validation timing**: shortage/discrepancy detail fields are nullable in
  the schema by design. They're enforced at Confirm GRN / Approve Rates
  (Phase 1/2 transitions), never at the moment a status changes.
- **audit_log table** added beyond the spec's stamped columns — the stamps
  answer "who owns the current state", the log answers "what happened, in
  order". The bill detail screen will read from it.

## Setup — phone-only path (no laptop needed)

Everything below works from a phone browser:

1. **Neon** (neon.tech): create project, copy the pooled `DATABASE_URL`.
2. **Vercel** (vercel.com): import the GitHub repo, add env vars
   `DATABASE_URL`, `AUTH_SECRET` (any long random string), `SETUP_SECRET`
   (another random string you invent). Deploy.
3. Visit `https://<your-app>.vercel.app/setup`, enter the SETUP_SECRET,
   paste the team as `email, name, role, password` lines, put in the
   highest existing AppSheet bill number. Submit — creates all tables
   and users.
4. Go to the app home page, sign in with email + password. The role chip
   is the Phase 0 checkpoint.

Auth is email + password against the users table (bcrypt-hashed).
Passwords are set and reset only via /setup (partner holds SETUP_SECRET).

## Setup — laptop path (~30 minutes)

### 1. Neon database
1. Create a project at https://neon.tech (free tier is fine to start).
2. Copy the **pooled** connection string into `.env` as `DATABASE_URL`.

### 2. Google OAuth
1. Google Cloud Console → APIs & Services → Credentials → Create
   OAuth client ID → Web application.
2. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<your-app>.vercel.app/api/auth/callback/google` (after deploy)
3. Put client ID/secret in `.env` as `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
4. `openssl rand -base64 32` → `AUTH_SECRET`.

### 3. Local run
```bash
cp .env.example .env   # fill in values
npm install
npm run db:push        # create tables in Neon
# put real CSVs in ./data (see data/README.md), especially users.csv
npm run db:seed -- --last-bill <highest existing PB26 number, digits only>
npm run dev            # http://localhost:3000
```
Sign in with an email listed in `users.csv`. The landing page shows the
role read from the database — that's the Phase 0 checkpoint.

### 4. Deploy to Vercel
1. Push this repo to GitHub, import it in Vercel.
2. Add env vars in Vercel project settings: `DATABASE_URL`, `AUTH_SECRET`,
   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
3. Add the production redirect URI to the Google OAuth client (step 2.2).
4. Deploy. Sign in from your phone to confirm.

## Project map

```
src/db/schema.ts      six spec tables + counters + audit_log
src/db/index.ts       Neon + Drizzle client
src/lib/derive.ts     every computed field, defined once
src/lib/authz.ts      requireRole / requireUser — the only permission gate
src/lib/ids.ts        PB26-#### and GRN-YYYYMMDD-N generators
src/auth.ts           Google sign-in, users-table gated
src/auth.config.ts    edge-safe config shared with middleware
src/middleware.ts     session redirect only (no role logic)
scripts/seed.ts       CSV master-data loader + bill counter init
drizzle/              generated SQL migration (inspectable)
```

## Phase 1 (next)

Gate entry form (header + line items, vendor-filtered picker with full-list
fallback), GRN queue, per-item OK/Short marking, Confirm GRN with the
`shortageDetailsFilled` gate, GRN number generation, GRN Note PDF.
