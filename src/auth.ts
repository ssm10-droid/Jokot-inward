import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Auth model:
 * - Email + password, checked against the `users` table. Passwords are
 *   stored as bcrypt hashes, set/reset via the /setup page.
 * - A user with no password hash, or active=false, cannot sign in.
 * - The JWT carries the role purely for UI display. It is NEVER the
 *   authority for permissions: every server action calls requireRole()
 *   (src/lib/authz.ts), which re-reads role + active from the database on
 *   each request. Deactivating a user locks them out of all actions
 *   immediately, even with a live session cookie.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const row = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (!row || !row.active || !row.passwordHash) return null;

        const ok = await bcrypt.compare(password, row.passwordHash);
        if (!ok) return null;

        return { email: row.email, name: row.name };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token }) {
      if (token.email) {
        const row = await db.query.users.findFirst({
          where: eq(users.email, token.email.toLowerCase()),
        });
        token.role = row?.role ?? null;
        token.name = row?.name ?? token.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // Display-only; see authz.ts for the authoritative check.
        (session.user as { role?: string | null }).role =
          (token.role as string | null) ?? null;
      }
      return session;
    },
  },
});
