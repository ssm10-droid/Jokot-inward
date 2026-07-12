import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Lightweight edge middleware: JWT presence check + redirect only.
 * Role enforcement happens server-side per action via requireRole().
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
