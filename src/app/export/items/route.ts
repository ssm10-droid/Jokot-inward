import { db } from "@/db";
import { toCsv, checkExportToken } from "@/lib/csv";

export async function GET(request: Request) {
  if (!checkExportToken(request)) {
    return new Response("Unauthorized. Add ?token=... to the URL.", { status: 401 });
  }

  const rows = await db.query.items.findMany();

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
