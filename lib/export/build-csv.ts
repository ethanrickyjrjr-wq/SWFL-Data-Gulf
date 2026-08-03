// lib/export/build-csv.ts
// Pure: (registry entry, rows) → full CSV document. EVERY cell exits through
// toCsvLine/escapeCsvCell (lib/email/csv-escape.ts — the pinned OWASP exit
// root, FM1). BOM prefix so Excel reads UTF-8 (FM7). CRLF records (RFC 4180).
import { toCsvLine } from "@/lib/email/csv-escape";
import { attribsUnionColumns, type ExportColumn, type ExportSurfaceDef } from "./surfaces";

const BOM = "\uFEFF"; // explicit escape — an invisible literal gets lost in copy-paste

function cellValue(row: Record<string, unknown>, col: ExportColumn): string | null {
  const raw = col.key.startsWith("attribs.")
    ? (row.attribs as Record<string, unknown> | null | undefined)?.[
        col.key.slice("attribs.".length)
      ]
    : row[col.key];
  if (raw === null || raw === undefined) return null;
  if (col.format === "date") return String(raw).slice(0, 10);
  if (col.format === "join-semicolon") {
    return Array.isArray(raw) ? raw.map(String).join("; ") : String(raw);
  }
  // attribs values come from user CSV imports (strings/numbers), but a nested
  // object must never ship as "[object Object]".
  return typeof raw === "object" ? JSON.stringify(raw) : String(raw);
}

export function buildCsv(
  def: ExportSurfaceDef,
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const columns: ExportColumn[] = def.withAttribsUnion
    ? [...def.columns, ...attribsUnionColumns(rows)]
    : [...def.columns];
  const lines = [toCsvLine(columns.map((c) => c.header))];
  for (const row of rows) {
    lines.push(toCsvLine(columns.map((c) => cellValue(row, c))));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}
