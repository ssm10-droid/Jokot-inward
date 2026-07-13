import { put } from "@vercel/blob";

/**
 * Requires a Blob store connected to the Vercel project (Storage tab →
 * Create Database → Blob, with the read-write token env var added).
 *
 * This team's store enforces private access — files aren't reachable via
 * a direct public URL. So we upload as private and return an internal
 * `/files/...` path instead; that route (src/app/files/[...path]/route.ts)
 * checks the session and streams the file through, authenticated the same
 * way as every other page in the app.
 */
export async function uploadBuffer(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const result = await put(path, buffer, {
    access: "private",
    contentType,
    addRandomSuffix: false,
  });
  return `/files/${result.pathname}`;
}
