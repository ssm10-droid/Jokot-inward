# Jokot Inward

Purchase-bill inward tracking for Jokot International. Replaces the
AppSheet build with a custom Next.js app on Vercel + Neon Postgres.

**Status: Phase 0** — schema, auth, role lookup, seed tooling. No workflow
screens yet; the landing page just proves sign-in and database-backed roles
work end to end.

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
