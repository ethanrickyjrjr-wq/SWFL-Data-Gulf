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
import { collapseToGrain, evaluateGuards, topValueIsTied } from "./guards";
import { formatValue } from "./format";
import { buildChartBlock } from "./chart-block";
import { getConcoction } from "./registry";

export interface MaterializeDeps {
  sb: unknown;
  hostPng?: (key: string, buf: Buffer) => Promise<string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = ConcoctionDef<any>;

function colOf(def: AnyDef, key: string): ColumnSpec | undefined {
  return def.columns.find((c) => c.key === key);
}

/**
 * THE GRAIN SEAM. Every shape goes through this before it ranks, crowns or plots.
 *
 * When the slice's lead measure declares a `grain` (the dimension it is really
 * held at), the rows are collapsed to that grain and the slice's dimension is
 * rewritten to it. So a chart of corridor rent — where rent is a submarket figure
 * repeated across the corridors inside it — becomes a chart of SUBMARKET rent:
 * one bar per submarket, genuinely different values, no invented ranking of
 * corridors that the source never ranked.
 *
 * Rows with a null grain value fall out here (see collapseToGrain): an uncited
 * figure must not be rendered as a figure.
 */
function applyGrain(
  def: AnyDef,
  rows: ConcoctionRow[],
  spec: DefaultBlockSpec,
): { rows: ConcoctionRow[]; spec: DefaultBlockSpec } {
  const lead = colOf(def, spec.slice.measures[0]);
  const grainKey = lead?.grain;
  if (!grainKey || !colOf(def, grainKey)) return { rows, spec };
  const collapsed = collapseToGrain(rows, grainKey);
  if (collapsed.length === 0) return { rows: [], spec };
  return {
    rows: collapsed,
    spec: { ...spec, slice: { ...spec.slice, dimension: grainKey } },
  };
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
  allRows: ConcoctionRow[],
  rawSpec: DefaultBlockSpec,
  ids: () => string,
): EmailBlock | null {
  if (allRows.length === 0) return null;
  const id = ids();
  // as-of is a property of the SOURCE, so it reads the full row set — collapsing
  // for a shape must not change the date we stamp on it.
  const asOf = def.asOf(allRows);
  const { rows, spec } = applyGrain(def, allRows, rawSpec);
  if (rows.length === 0) return null;

  switch (spec.type) {
    case "sources":
      return {
        id,
        type: "sources",
        props: {
          sources: [{ label: def.sourceLine }],
          note: asOf ? `${def.asOfLabel ?? "As of"} ${asOf}` : undefined,
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
      // NO CROWNING A TIE. If the top value is shared, naming one holder of it
      // asserts a winner the source never named — state the figure, not a victor.
      const tied = topValueIsTied(rows, col.key);
      return {
        id,
        type: "hero",
        props: {
          kicker: def.label.toUpperCase(),
          value,
          label: dimVal && !tied ? `${col.label} · ${dimVal}` : col.label,
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
      const sub =
        dimCol && !topValueIsTied(rows, col.key)
          ? formatValue(row[dimCol.key], dimCol.format)
          : undefined;
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
 *  both exist and the measure's distribution guards pass on the live rows.
 *  Judged on the GRAIN-COLLAPSED rows — an axis is only honest about the rows it
 *  actually plots, and those are the collapsed ones. */
function chartAllowed(def: AnyDef, rows: ConcoctionRow[], spec: DefaultBlockSpec): boolean {
  const col = colOf(def, spec.slice.measures[0]);
  if (!col || !spec.slice.dimension || !colOf(def, spec.slice.dimension)) return false;
  return evaluateGuards(rows, col).ok;
}

/** The rows + slice a chart will actually plot: grain-collapsed, so a submarket
 *  figure is drawn once per submarket instead of once per corridor that shares it. */
function chartInputs(
  def: AnyDef,
  rows: ConcoctionRow[],
  spec: DefaultBlockSpec,
): { rows: ConcoctionRow[]; spec: DefaultBlockSpec; allowed: boolean } {
  const g = applyGrain(def, rows, spec);
  return { ...g, allowed: g.rows.length > 0 && chartAllowed(def, g.rows, g.spec) };
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
    const chart = spec.type === "image" ? chartInputs(def, rows, spec) : null;
    if (chart?.allowed) {
      try {
        block = await buildChartBlock(
          def,
          chart.rows,
          chart.spec,
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
        ...(def.asOfLabel ? { asOfLabel: def.asOfLabel } : {}),
        sourceLine: def.sourceLine,
      },
    });
  }
  return { blocks, asOf };
}

/** A binding that can't be re-run: missing, foreign-versioned, unknown def, or
 *  params the def's CURRENT schema rejects. Callers keep the baked values and
 *  flag "can't refresh" — degrade, never break the doc. */
export class BindingUnrefreshable extends Error {}

async function rematerialize(
  block: EmailBlock,
  targetType: EmailBlock["type"],
  newParams: Record<string, string | number>,
  deps: MaterializeDeps,
): Promise<EmailBlock> {
  const binding = block.binding;
  if (!binding) throw new BindingUnrefreshable("block has no binding");
  if (binding.v !== BINDING_VERSION) {
    throw new BindingUnrefreshable(`binding version ${binding.v} != ${BINDING_VERSION}`);
  }
  if (binding.lane !== "lake" || !binding.concoctionId) {
    throw new BindingUnrefreshable(`lane ${binding.lane} is not re-loadable from the registry`);
  }
  const def = getConcoction(binding.concoctionId);
  if (!def) throw new BindingUnrefreshable(`unknown dataset ${binding.concoctionId}`);

  let parsed: Record<string, string | number>;
  try {
    parsed = def.params.parse({ ...binding.params, ...newParams }) as Record<
      string,
      string | number
    >;
  } catch (e) {
    throw new BindingUnrefreshable(
      `params no longer valid for ${def.id}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const rows = await def.load(deps.sb, parsed);
  if (rows.length === 0) throw new BindingUnrefreshable(`${def.id}: no rows`);
  const asOf = def.asOf(rows);
  const spec: DefaultBlockSpec = {
    type: targetType,
    slice: binding.slice,
    layout: block.layout ?? { x: 0, y: 0, w: 12, h: 4 },
  };

  let rebuilt: EmailBlock | null = null;
  const chart = targetType === "image" ? chartInputs(def, rows, spec) : null;
  if (chart?.allowed) {
    try {
      rebuilt = await buildChartBlock(
        def,
        chart.rows,
        chart.spec,
        { asOf, hostPng: deps.hostPng, ids: () => block.id },
        parsed,
      );
    } catch {
      rebuilt = mapSliceToBlock(def, rows, spec, () => block.id);
    }
  } else {
    rebuilt = mapSliceToBlock(def, rows, spec, () => block.id);
  }
  if (!rebuilt)
    throw new BindingUnrefreshable(`${def.id}: slice no longer renders as ${targetType}`);

  return {
    ...rebuilt,
    id: block.id,
    layout: block.layout ? { ...block.layout } : rebuilt.layout,
    binding: {
      ...binding,
      params: parsed,
      slice: binding.slice,
      asOf,
      ...(def.asOfLabel ? { asOfLabel: def.asOfLabel } : {}),
    },
  } as EmailBlock;
}

/** rebind: same block, new params — values follow, identity/layout/slice stay. */
export async function rebindBlock(
  block: EmailBlock,
  newParams: Record<string, string | number>,
  deps: MaterializeDeps,
): Promise<EmailBlock> {
  return rematerialize(block, block.type, newParams, deps);
}

/** turn-into: same binding, different block type (Notion semantics — nothing
 *  is lost; data the new shape doesn't use is simply set aside). */
export async function turnIntoBlock(
  block: EmailBlock,
  newType: EmailBlock["type"],
  deps: MaterializeDeps,
): Promise<EmailBlock> {
  return rematerialize(block, newType, {}, deps);
}
