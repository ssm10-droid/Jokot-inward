import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe config shared by middleware and the full auth setup.
 * No database imports here — middleware only validates the JWT and
 * redirects unauthenticated requests to /login. All DB-backed checks
 * (sign-in gating, role lookup) live in src/auth.ts and src/lib/authz.ts.
 */
export const authConfig: NextAuthConfig = {
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      // /setup is protected by SETUP_SECRET instead of a session —
      // it must be reachable before any user can sign in.
      if (path.startsWith("/login") || path.startsWith("/setup")) return true;
      return isLoggedIn; // false -> redirect to /login
    },
  },
};
