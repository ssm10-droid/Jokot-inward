import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, type Role, type User } from "@/db/schema";

export class AuthzError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthzError";
  }
}

/**
 * The single authoritative permission check. Looks the role up from the
 * database by the authenticated email on every call — never trusts the
 * session token's role claim or anything client-supplied.
 *
 * Usage in a server action / transition:
 *   const actor = await requireRole("store");
 *   const anyOf = await requireRole(["purchase", "partner"]);
 */
export async function requireRole(allowed: Role | Role[]): Promise<User> {
  const actor = await requireUser();
  const allowedList = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedList.includes(actor.role)) {
    throw new AuthzError(
      `This action requires role ${allowedList.join(" or ")}; you are ${actor.role}.`
    );
  }
  return actor;
}

/** Any signed-in, active user. */
export async function requireUser(): Promise<User> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) throw new AuthzError("Not signed in.");
  const row = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!row || !row.active) throw new AuthzError("Account not active.");
  return row;
}

/**
 * Page-level guard for server components. Redirects (rather than throwing)
 * on auth/role failure, since a page render can't surface a caught error
 * the way a form submission can.
 */
export async function requirePageRole(allowed: Role | Role[]): Promise<User> {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const email = session.user.email.toLowerCase();
  const row = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!row || !row.active) redirect("/login");

  const allowedList = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedList.includes(row.role)) {
    redirect(`/?denied=${row.role}`);
  }
  return row;
}
