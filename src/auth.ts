import NextAuth from "next-auth";
import { eq } from "drizzle-orm";
import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Auth model:
 * - Google sign-in. Only emails present and active in the `users` table may
 *   sign in at all — everyone else is rejected at the door.
 * - The JWT carries the role purely for UI display (nav, labels).
 * - It is NEVER the authority for permissions. Every server action calls
 *   requireRole() (src/lib/authz.ts), which re-reads the role from the
 *   database by session email on each request. Deactivating a user in the
 *   users table therefore locks them out of all actions immediately, even
 *   if they still hold a valid session cookie.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const row = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      return !!row && row.active;
    },
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
