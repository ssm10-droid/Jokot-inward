import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * ID sequences via an atomic counter table.
 *
 * The AppSheet version used MAX()+1 formulas — fine for one user, unsafe for
 * a real backend. Advisory locks are also out: Neon's HTTP driver is
 * stateless per statement, so a transaction-scoped lock wouldn't hold.
 * A single INSERT .. ON CONFLICT .. RETURNING is atomic in Postgres and
 * needs no session state, so two simultaneous gate entries can never be
 * assigned the same number.
 *
 * The seed script initializes "bill:PB26" from the highest existing bill
 * number so the sequence continues where AppSheet left off.
 */
export const BILL_PREFIX = "PB26"; // FY 2026-27; change on FY rollover

async function nextCounter(key: string): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value
  `);
  return Number((result.rows[0] as { value: number }).value);
}

/** Bill IDs: PB26-####, continuing from the seeded counter. */
export async function nextBillId(): Promise<string> {
  const n = await nextCounter(`bill:${BILL_PREFIX}`);
  return `${BILL_PREFIX}-${String(n).padStart(4, "0")}`;
}

/**
 * GRN numbers: GRN-YYYYMMDD-N, the Nth GRN confirmed that IST day.
 * Only generated at Confirm GRN, never at bill creation.
 */
export async function nextGrnNo(now: Date = new Date()): Promise<string> {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const ymd = ist.toISOString().slice(0, 10).replace(/-/g, "");
  const n = await nextCounter(`grn:${ymd}`);
  return `GRN-${ymd}-${n}`;
}
