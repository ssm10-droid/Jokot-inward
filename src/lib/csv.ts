/** Converts an array of flat objects into CSV text, quoting fields that need it. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

/**
 * Checks the ?token= query param against EXPORT_TOKEN, trimmed on both
 * sides (same whitespace-safety lesson learned from SETUP_SECRET).
 */
export function checkExportToken(request: Request): boolean {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const expected = process.env.EXPORT_TOKEN?.trim();
  return !!expected && token === expected;
}
