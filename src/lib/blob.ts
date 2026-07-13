import { put } from "@vercel/blob";

/**
 * Requires a Blob store connected to the Vercel project (Storage tab →
 * Create Database → Blob). Once connected, BLOB_READ_WRITE_TOKEN is
 * injected automatically — nothing to add to .env by hand.
 */
export async function uploadBuffer(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const result = await put(path, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });
  return result.url;
}
