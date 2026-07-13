import { get } from "@vercel/blob";
import { requireUser } from "@/lib/authz";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    await requireUser();
  } catch {
    const url = new URL(request.url);
    return Response.redirect(`${url.origin}/login`, 302);
  }

  const { path } = await params;
  const pathname = path.join("/");

  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return new Response("File not found.", { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Content-Disposition": result.blob.contentDisposition,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
