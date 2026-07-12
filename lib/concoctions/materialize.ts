// lib/concoctions/materialize.ts
//
// The materializer: concoction + params + shape → ordinary EmailBlocks with
// BAKED values and a remembered binding. Three verbs, one engine:
//   load      — def.defaultLayout → blocks (data-first authoring)
//   rebind    — same block, new params (Task 7)
//   turn-into — same binding, different block type (Task 7)
//
// Guard philosophy: distribution guards gate AXES (chart shapes), never
// restatement. A near-constant measure is banned from being a scatter/bar axis
// (it lies visually) but is perfectly honest as a listed/stated figure — so a
// guard-failing chart slice degrades to a list of the same verbatim values
// (FOCUS rule 4: never a refusal, never an empty box). Deterministic: injected
// id counter, no Date.now, no randomness.
import type { EmailBlock } from "@/lib/email/doc/types";
import { BINDING_VERSION } from "@/lib/email/doc/types";
import type { ColumnSpec, ConcoctionDef, ConcoctionRow, DefaultBlockSpec } from "./types";
import { evaluateGuards } from "./guards";
import { formatValue } from "./format";
import { buildChartBlock } from "./chart-block";

export interface MaterializeDeps {
  sb: unknown;
  hostPng?: (key: string, buf: Buffer) => Promise<string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = ConcoctionDef<any>;

function colOf(def: AnyDef, key: string): ColumnSpec | undefined {
  return def.columns.find((c) => c.key === key);
}

/** The row a hero/metric/stats block profiles. Time-series slices (dimension
 *  format "date") profile the LATEST row; categorical slices profile the row
 *  with the highest first-measure value. Deterministic either way. */
function topRow(
  def: AnyDef,
  rows: ConcoctionRow[],
  spec: DefaultBlockSpec,
): ConcoctionRow | undefined {
  const dimCol = spec.slice.dimension ? colOf(def, spec.slice.dimension) : undefined;
  if (dimCol?.format === "date") {
    return [...rows]
      .filter((r) => typeof r[dimCol.key] === "string" && (r[dimCol.key] as string).length > 0)
      .sort((a, b) => String(a[dimCol.key]).localeCompare(String(b[dimCol.key])))
      .at(-1);
  }
  const m1 = spec.slice.measures[0];
  return [...rows]
    .filter((r) => typeof r[m1] === "number" && Number.isFinite(r[m1] as number))
    .sort((a, b) => (a[m1] as number) - (b[m1] as number))
    .at(-1);
}

/** Rows for a list: sorted desc by first measure (non-numeric last), topN. */
function rankedRows(rows: ConcoctionRow[], spec: DefaultBlockSpec): ConcoctionRow[] {
  const m1 = spec.slice.measures[0];
  const ranked = [...rows].sort((a, b) => {
    const av = typeof a[m1] === "number" ? (a[m1] as number) : Number.NEGATIVE_INFINITY;
    const bv = typeof b[m1] === "number" ? (b[m1] as number) : Number.NEGATIVE_INFINITY;
    return bv - av;
  });
  return ranked.slice(0, spec.slice.topN ?? 6);
}

function listBlock(
  def: AnyDef,
  rows: ConcoctionRow[],
  spec: DefaultBlockSpec,
  id: string,
): EmailBlock | null {
  const dimKey = spec.slice.dimension;
  const items = rankedRows(rows, spec)
    .map((row) => {
      const dimCol = dimKey ? colOf(def, dimKey) : undefined;
      const lead = dimCol ? formatValue(row[dimCol.key], dimCol.format) : undefined;
      const parts = spec.slice.measures
        .map((m) => {
          const col = colOf(def, m);
          if (!col) return "";
          const v = formatValue(row[m], col.format);
          return v ? `${col.label} ${v}` : "";
        })
        .filter((s) => s.length > 0);
      if (parts.length === 0 && !lead) return null;
      const text = lead ? `${lead}: ${parts.join(", ")}` : parts.join(", ");
      return { lead: lead || undefined, text };
    })
    .filter(
      (i): i is { lead: string | undefined; text: string } => i !== null && i.text.length > 0,
    );
  if (items.length === 0) return null;
  return {
    id,
    type: "list",
    props: { title: def.label, items },
    layout: { ...spec.layout },
  };
}

/**
 * Map one slice spec to a block with baked values. Pure + synchronous — the
 * chart (image) shape is handled by materializeLoad (async); calling this with
 * an image spec produces the LIST FALLBACK (used when guards fail or the chart
 * path errors). Returns null only when the slice can't say anything at all.
 */
export function mapSliceToBlock(
  def: AnyDef,
  rows: ConcoctionRow[],
  spec: DefaultBlockSpec,
  ids: () => string,
): EmailBlock | null {
  if (rows.length === 0) return null;
  const id = ids();
  const asOf = def.asOf(rows);

  switch (spec.type) {
    case "sources":
      return {
        id,
        type: "sources",
        props: {
          sources: [{ label: def.sourceLine }],
          note: asOf ? `As of ${asOf}` : undefined,
        },
        layout: { ...spec.layout },
      };
    case "hero": {
      const row = topRow(def, rows, spec);
      const col = colOf(def, spec.slice.measures[0]);
      if (!row || !col) return null;
      const value = formatValue(row[col.key], col.format);
      if (!value) return null;
      const dimCol = spec.slice.dimension ? colOf(def, spec.slice.dimension) : undefined;
      const dimVal = dimCol ? formatValue(row[dimCol.key], dimCol.format) : "";
      return {
        id,
        type: "hero",
        props: {
          kicker: def.label.toUpperCase(),
          value,
          label: dimVal ? `${col.label} · ${dimVal}` : col.label,
        },
        layout: { ...spec.layout },
      };
    }
    case "metric-card": {
      const row = topRow(def, rows, spec);
      const col = colOf(def, spec.slice.measures[0]);
      if (!row || !col) return null;
      const metricValue = formatValue(row[col.key], col.format);
      if (!metricValue) return null;
      const dimCol = spec.slice.dimension ? colOf(def, spec.slice.dimension) : undefined;
      const sub = dimCol ? formatValue(row[dimCol.key], dimCol.format) : undefined;
      return {
        id,
        type: "metric-card",
        props: { metricValue, metricLabel: col.label, sub: sub || undefined },
        layout: { ...spec.layout },
      };
    }
    case "stats": {
      const row = topRow(def, rows, spec);
      if (!row) return null;
      const stats = spec.slice.measures
        .slice(0, 3)
        .map((m) => {
          const col = colOf(def, m);
          if (!col) return null;
          const value = formatValue(row[m], col.format);
          return value ? { value, label: col.label } : null;
        })
        .filter((s): s is { value: string; label: string } => s !== null);
      if (stats.length === 0) return null;
      return { id, type: "stats", props: { stats }, layout: { ...spec.layout } };
    }
    case "list":
    case "image": // list FALLBACK for the chart shape — same verbatim values, no axis
      return listBlock(def, rows, { ...spec, type: "list" }, id);
    default:
      return null;
  }
}

/** True when the slice may render as a chart: its axis measure and dimension
 *  both exist and the measure's distribution guards pass on the live rows. */
function chartAllowed(def: AnyDef, rows: ConcoctionRow[], spec: DefaultBlockSpec): boolean {
  const col = colOf(def, spec.slice.measures[0]);
  if (!col || !spec.slice.dimension || !colOf(def, spec.slice.dimension)) return false;
  return evaluateGuards(rows, col).ok;
}

/** load: concoction + params → its default block set, bindings stamped. */

export async function materializeLoad(
  def: AnyDef,
  params: Record<string, string | number>,
  deps: MaterializeDeps,
): Promise<{ blocks: EmailBlock[]; asOf: string }> {
  const parsed = def.params.parse(params ?? {});
  const rows = await def.load(deps.sb, parsed);
  if (rows.length === 0) throw new Error(`${def.id}: no rows`);
  const asOf = def.asOf(rows);
  let n = 0;
  const ids = () => `conc-${def.id}-${n++}`;

  const blocks: EmailBlock[] = [];
  for (const spec of def.defaultLayout) {
    let block: EmailBlock | null = null;
    if (spec.type === "image" && chartAllowed(def, rows, spec)) {
      try {
        block = await buildChartBlock(
          def,
          rows,
          spec,
          { asOf, hostPng: deps.hostPng, ids },
          parsed as Record<string, string | number>,
        );
        block = { ...block, layout: { ...spec.layout } };
      } catch {
        block = mapSliceToBlock(def, rows, spec, ids); // degrade, never refuse
      }
    } else {
      block = mapSliceToBlock(def, rows, spec, ids);
    }
    if (!block) continue;
    blocks.push({
      ...block,
      binding: {
        v: BINDING_VERSION,
        lane: "lake",
        concoctionId: def.id,
        params: parsed as Record<string, string | number>,
        slice: spec.slice,
        asOf,
        sourceLine: def.sourceLine,
      },
    });
  }
  return { blocks, asOf };
}
