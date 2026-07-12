import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe config shared by middleware and the full auth setup.
 * No database or bcrypt imports here — middleware only validates the JWT
 * and redirects unauthenticated requests to /login. The credentials
 * provider (which needs both) lives in src/auth.ts.
 */
export const authConfig: NextAuthConfig = {
  providers: [], // filled in by src/auth.ts; middleware only reads the JWT
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      // /setup is protected by SETUP_SECRET instead of a session —
      // it must be reachable before any user exists at all.
      if (path.startsWith("/login") || path.startsWith("/setup")) return true;
      return isLoggedIn; // false -> redirect to /login
    },
  },
};
