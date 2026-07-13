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
      // /setup is protected by SETUP_SECRET, /export by its own token
      // param — neither can rely on a session (Google Sheets' IMPORTDATA
      // can't send a login cookie), so both bypass the session check here.
      if (path.startsWith("/login") || path.startsWith("/setup") || path.startsWith("/export"))
        return true;
      return isLoggedIn; // false -> redirect to /login
    },
  },
};
