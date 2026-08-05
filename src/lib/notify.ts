import { db } from "@/db";
import { users, notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { Role } from "@/db/schema";

/**
 * Email notifications via Resend's REST API (no SDK dependency).
 *
 * TRIAL MODE: if NOTIFY_TRIAL_EMAIL is set, EVERY notification goes to that
 * one address (with a "[would go to: ...]" line in the body) instead of the
 * real role users. Remove the env var to switch to real per-role routing —
 * no code change needed.
 *
 * All sends are best-effort: a mail failure must never block a bill
 * transition (same principle as PDF generation in confirmGrnAction).
 */

const RESEND_URL = "https://api.resend.com/emails";
const FROM = process.env.NOTIFY_FROM || "Jokot Inward <onboarding@resend.dev>";

export async function sendEmail(
  to: string[],
  subject: string,
  body: string
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || to.length === 0) return false;
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, text: body }),
    });
    if (!res.ok) {
      console.error("Resend send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend send error:", err);
    return false;
  }
}

/** Active users of a role (lowercased emails). */
async function emailsForRole(role: Role): Promise<string[]> {
  const rows = await db.query.users.findMany({
    where: and(eq(users.role, role), eq(users.active, true)),
  });
  return rows.map((u) => u.email);
}

/**
 * Resolve recipients for a role, honouring trial mode.
 * Returns { to, note } where note explains rerouting (trial only).
 */
async function resolveRecipients(
  roles: Role[]
): Promise<{ to: string[]; note: string }> {
  const real = (
    await Promise.all(roles.map((r) => emailsForRole(r)))
  ).flat();
  const unique = [...new Set(real)];
  const trial = process.env.NOTIFY_TRIAL_EMAIL?.trim();
  if (trial) {
    return {
      to: [trial],
      note:
        unique.length > 0
          ? `\n\n[TRIAL MODE — this would go to: ${unique.join(", ")}]`
          : `\n\n[TRIAL MODE — no active ${roles.join("/")} users found yet]`,
    };
  }
  return { to: unique, note: "" };
}

// Link base for emails: explicit APP_URL wins; otherwise use Vercel's own
// stable branch URL (so trial-branch emails link to the trial deployment,
// and production emails link to production) — no per-environment config.
const APP_URL =
  process.env.APP_URL ||
  (process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`) ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "https://jokot-inward.vercel.app";

/**
 * The action screen for a role on a given bill. Emails link here (via the
 * login page with callbackUrl, so signing in lands the person directly on
 * the decision screen — no navigating).
 */
export function actionPath(role: Role, billId: string): string {
  switch (role) {
    case "store":
      return `/grn/${billId}`;
    case "purchase":
      return `/price/${billId}`;
    case "accounts":
      return `/accounts/${billId}`;
    default:
      return `/bills/${billId}`;
  }
}

function deepLink(path: string): string {
  return `${APP_URL}/login?callbackUrl=${encodeURIComponent(path)}`;
}

function linksBlock(roles: Role[], billId: string, issuePath?: string): string {
  const lines = roles.map((r) => {
    const path = issuePath && r === "purchase" ? issuePath : actionPath(r, billId);
    const label =
      r === "store" ? "Store — check quantities" :
      r === "purchase" ? "Purchase — take action" :
      r === "accounts" ? "Accounts — post to Tally" :
      "Open bill";
    return `${label}:\n${deepLink(path)}`;
  });
  return lines.join("\n\n");
}

/**
 * Immediate "this is now waiting on you" email, fired from server actions
 * right after a stage transition. Best-effort, never throws.
 */
export async function notifyAssigned(
  roles: Role[],
  billId: string,
  vendorName: string,
  what: string,
  issuePath?: string
): Promise<void> {
  try {
    const { to, note } = await resolveRecipients(roles);
    await sendEmail(
      to,
      `[Jokot Inward] ${billId} — ${what}`,
      `Bill ${billId} (${vendorName}) is now waiting on you: ${what}.\n\nTap your link, sign in, and you land straight on the decision screen:\n\n${linksBlock(roles, billId, issuePath)}${note}`
    );
  } catch (err) {
    console.error("notifyAssigned failed:", err);
  }
}

/**
 * Escalation email (20+ min with no action) — goes to the responsible
 * role AND partners (supervision). Deduped by the notifications table:
 * one escalation per (bill, blocker key), ever.
 */
export async function notifyEscalation(
  billId: string,
  key: string,
  roles: Role[],
  vendorName: string,
  what: string,
  waitingSinceMin: number,
  issuePath?: string
): Promise<"sent" | "already" | "failed"> {
  const dedupeKey = `esc:${key}`;
  const existing = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.billId, billId),
      eq(notifications.kind, dedupeKey)
    ),
  });
  if (existing) return "already";

  const { to, note } = await resolveRecipients([...roles, "partner"]);
  const ok = await sendEmail(
    to,
    `[Jokot Inward] ⚠️ ${billId} pending ${waitingSinceMin} min — ${what}`,
    `Bill ${billId} (${vendorName}) has had no action for ${waitingSinceMin} minutes.\n\nStill waiting on: ${what}.\n\nOpen it: ${APP_URL}/bills/${billId}${note}`
  );
  if (!ok) return "failed";

  await db.insert(notifications).values({ billId, kind: dedupeKey });
  return "sent";
}
