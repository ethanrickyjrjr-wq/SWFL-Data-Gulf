// lib/figures/sourced.ts
//
// Reader for public.sourced_figures — the shared lane-3 figure cache. A number
// found live with a named web source is stored ONCE and read by the ZIP report
// page, the site assistant's located path, and the email/social builders
// (market-context). Spec: docs/superpowers/specs/2026-07-03-zip-signal-hero-design.md §1.
//
// Empty-tolerant by contract (four-lane / ODD): no creds, no rows, any query
// error → [] — never a thrown error and NEVER an invented figure.
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export interface SourcedFigureScope {
  kind: "zip" | "county";
  key: string;
}

export interface SourcedFigure {
  /** metric_key, e.g. "permits_90d". */
  key: string;
  label: string;
  /** Display string — value_text preferred, else value_num + unit. */
  value: string;
  /** source_name, e.g. "capecoral.gov". */
  source: string;
  source_url: string;
  /** MM/DD/YYYY. */
  as_of?: string;
}

export interface SourcedRow {
  metric_key: string;
  label: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  source_name: string;
  source_url: string;
  as_of: string | null;
}

const SELECT_COLS =
  "metric_key, label, value_num, value_text, unit, source_name, source_url, as_of";

function mdY(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Pure row → figure mapper. Rows with no renderable value are dropped, never zero-filled. */
export function mapSourcedRows(rows: SourcedRow[]): SourcedFigure[] {
  const out: SourcedFigure[] = [];
  for (const r of rows) {
    const num = r.value_num != null ? Number(r.value_num) : null;
    const value =
      r.value_text ??
      (num != null && Number.isFinite(num)
        ? `${num.toLocaleString("en-US")}${r.unit ? ` ${r.unit}` : ""}`
        : null);
    if (!value || !r.metric_key || !r.source_name || !r.source_url) continue;
    out.push({
      key: r.metric_key,
      label: r.label,
      value,
      source: r.source_name,
      source_url: r.source_url,
      as_of: mdY(r.as_of),
    });
  }
  return out;
}

/** Unexpired cached figures for a scope. Empty-tolerant: any failure → []. */
export async function getSourcedFigures(scope: SourcedFigureScope): Promise<SourcedFigure[]> {
  let db: ReturnType<typeof createServiceRoleClient>;
  try {
    db = createServiceRoleClient();
  } catch {
    return []; // no creds in this env — degrade, never throw
  }
  try {
    const { data, error } = await db
      .from("sourced_figures")
      .select(SELECT_COLS)
      .eq("scope_kind", scope.kind)
      .eq("scope_key", scope.key)
      .gt("expires_at", new Date().toISOString());
    if (error || !data) return [];
    return mapSourcedRows(data as unknown as SourcedRow[]);
  } catch {
    return [];
  }
}

/** Grounding block for the assistant's located path. "" when nothing is cached. */
export function sourcedFiguresPromptBlock(figs: SourcedFigure[]): string {
  if (figs.length === 0) return "";
  const lines = figs.map(
    (f) => `- ${f.label}: ${f.value} (${f.source}${f.as_of ? `, as of ${f.as_of}` : ""})`,
  );
  return (
    "\n\n=== FOUND FIGURES — numbers previously found live from named web sources and " +
    "cached. State them only as written, with their source; never invent a figure not " +
    "listed here. ===\n" +
    lines.join("\n")
  );
}

/** Convenience for the located-ZIP path: fetch + format in one await. */
export async function sourcedFiguresBlockForZip(zip: string | null): Promise<string> {
  if (!zip) return "";
  return sourcedFiguresPromptBlock(await getSourcedFigures({ kind: "zip", key: zip }));
}
