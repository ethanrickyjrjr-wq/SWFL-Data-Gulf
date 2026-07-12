// lib/concoctions/format.ts — ONE formatter for baked block values.
import type { ColumnFormat } from "./types";

/** null/undefined → "" (an omitted slot — the no-placeholder moat: never "N/A",
 *  never "—", never a fabricated 0). Values restate held numbers verbatim. */
export function formatValue(v: number | string | null | undefined, format: ColumnFormat): string {
  if (v === null || v === undefined || v === "") return "";
  if (format === "text") return String(v);
  if (format === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    return m ? `${m[2]}/${m[3]}/${m[1]}` : String(v);
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (format === "usd") {
    return Number.isInteger(n)
      ? `$${n.toLocaleString("en-US")}`
      : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === "percent") return `${n}%`;
  return n.toLocaleString("en-US");
}
