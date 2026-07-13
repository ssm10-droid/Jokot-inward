import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SETUP_STATEMENTS } from "@/lib/setup-sql";

/**
 * Phone-only setup. Visit /setup after deploying, enter the SETUP_SECRET
 * you configured in Vercel env vars, paste the user list, and submit.
 * Creates all tables (idempotent), upserts users, and sets the PB26 bill
 * counter. Safe to run again later to add users or bump the counter.
 *
 * Master data (vendors / items / supplier map) is intentionally not here —
 * that arrives with Phase 1's data screens or a CSV upload. The Phase 0
 * checkpoint only needs users.
 */

const VALID_ROLES = ["gate", "store", "purchase", "accounts", "partner"];

type Result = { ok: boolean; lines: string[] };

async function runSetup(formData: FormData): Promise<Result> {
  "use server";
  const lines: string[] = [];

  const secret = String(formData.get("secret") ?? "").trim();
  const expected = process.env.SETUP_SECRET?.trim();
  if (!expected || secret !== expected) {
    return {
      ok: false,
      lines: [
        !expected
          ? "SETUP_SECRET is not configured in Vercel environment variables."
          : "Wrong setup secret.",
      ],
    };
  }

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

  // 3. Bill counter
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
