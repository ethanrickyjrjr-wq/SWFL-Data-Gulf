/**
 * Generator: ingest/cadence_registry.yaml → app/data-coverage/_registry.generated.ts
 *
 * The /data-coverage page must NOT parse YAML at runtime (operator boundary:
 * the registry is a test-time-only dependency). Instead this generator bakes a
 * typed snapshot the page imports as a normal module. A malformed registry
 * breaks THIS generator in CI, never the page render.
 *
 * Run: `npm run gen:coverage` (alias for `bun scripts/gen-coverage-registry.mts`).
 * The drift test (app/data-coverage/drift.test.mts) re-runs `buildRegistryModule`
 * in-memory and fails if the committed file is stale.
 *
 * Table resolution MIRRORS the freshness probe's `check_volume_entry` order
 * EXACTLY (ingest/scripts/check_freshness.py):
 *   count_table → freshness_table → data_lake.{dlt_schema_name}
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";

export type RegistryLane = "tier-1" | "tier-1-duckdb" | "tier-2";

export interface RegistryEntry {
  name: string;
  lane: RegistryLane;
  cadence_days: number;
  tolerance_multiplier: number;
  expected_rows_min: number | null;
  /** Resolved schema for the count/coverage target (tier-2 only); null for tier-1. */
  schema: string | null;
  /** Resolved unqualified table name (tier-2 only); null for tier-1. */
  table: string | null;
  /** dlt schema_name for _dlt_loads freshness (tier-2 dlt pipelines only). */
  dlt_schema_name: string | null;
  /** Schema-qualified non-dlt tier-2 freshness target, if the entry declares one. */
  freshness_table: string | null;
  /** Tier-1 inventory key. */
  inventory_id: string | null;
  inventory_key_type: "exact" | "prefix" | null;
  /** True when sourced from the registry's `not_yet_running:` block. */
  not_yet_running: boolean;
  /** Operator note (parked/blocked reason), if any. */
  note: string | null;
}

interface RawEntry {
  name: string;
  lane: string;
  cadence_days: number;
  tolerance_multiplier?: number;
  expected_rows_min?: number;
  count_table?: string;
  freshness_table?: string;
  dlt_schema_name?: string;
  inventory_id?: string;
  inventory_key_type?: string;
  note?: string;
}

const DEFAULT_TOLERANCE = 2.0;

/**
 * Resolve schema.table the same way `check_volume_entry` does:
 * count_table → freshness_table → data_lake.{dlt_schema_name}. Tier-1 entries
 * have no SQL table → [null, null].
 */
function resolveTable(raw: RawEntry): [string | null, string | null] {
  if (raw.lane === "tier-1" || raw.lane === "tier-1-duckdb") {
    return [null, null];
  }
  const qualified =
    raw.count_table ??
    raw.freshness_table ??
    (raw.dlt_schema_name ? `data_lake.${raw.dlt_schema_name}` : null);
  if (!qualified) return [null, null];
  const dot = qualified.indexOf(".");
  if (dot === -1) return [null, qualified];
  return [qualified.slice(0, dot), qualified.slice(dot + 1)];
}

export function resolveEntry(
  raw: RawEntry,
  notYetRunning: boolean,
): RegistryEntry {
  const [schema, table] = resolveTable(raw);
  const lane = raw.lane as RegistryLane;
  // Robustness: a tier-2 entry that resolves to no table is a registry bug.
  if (lane === "tier-2" && !table) {
    throw new Error(
      `gen-coverage-registry: tier-2 entry '${raw.name}' resolves to no table ` +
        `(needs count_table, freshness_table, or dlt_schema_name).`,
    );
  }
  const keyType = raw.inventory_key_type;
  return {
    name: raw.name,
    lane,
    cadence_days: Number(raw.cadence_days),
    tolerance_multiplier: Number(raw.tolerance_multiplier ?? DEFAULT_TOLERANCE),
    expected_rows_min:
      raw.expected_rows_min === undefined
        ? null
        : Number(raw.expected_rows_min),
    schema,
    table,
    dlt_schema_name: raw.dlt_schema_name ?? null,
    freshness_table: raw.freshness_table ?? null,
    inventory_id: raw.inventory_id ?? null,
    inventory_key_type:
      keyType === "exact" || keyType === "prefix" ? keyType : null,
    not_yet_running: notYetRunning,
    note: raw.note ?? null,
  };
}

export interface ParsedRegistry {
  pipelines?: RawEntry[];
  not_yet_running?: RawEntry[];
}

/** Resolve every entry (active first, then parked) in registry file order. */
export function resolveAll(registry: ParsedRegistry): RegistryEntry[] {
  const active = (registry.pipelines ?? []).map((r) => resolveEntry(r, false));
  const parked = (registry.not_yet_running ?? []).map((r) =>
    resolveEntry(r, true),
  );
  return [...active, ...parked];
}

const HEADER = `// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: ingest/cadence_registry.yaml
// Regenerate: \`npm run gen:coverage\`
// Guarded by: app/data-coverage/drift.test.mts (fails if this file is stale).
//
// Why this exists: the /data-coverage page reads operational facts (cadence,
// volume floor, blocked reason) but must not parse YAML at runtime. This typed
// snapshot is the page's render-time source; the YAML is only ever parsed here
// and in the drift test (test-time-only dependency boundary).

export type RegistryLane = "tier-1" | "tier-1-duckdb" | "tier-2";

export interface RegistryEntry {
  name: string;
  lane: RegistryLane;
  cadence_days: number;
  tolerance_multiplier: number;
  expected_rows_min: number | null;
  schema: string | null;
  table: string | null;
  dlt_schema_name: string | null;
  freshness_table: string | null;
  inventory_id: string | null;
  inventory_key_type: "exact" | "prefix" | null;
  not_yet_running: boolean;
  note: string | null;
}
`;

/**
 * Build the full generated module text. Pure function — the drift test calls
 * this and string-compares to the committed file. Deterministic: JSON.stringify
 * with fixed key insertion order + 2-space indent.
 */
export function buildRegistryModule(registry: ParsedRegistry): string {
  const entries = resolveAll(registry);
  const body = JSON.stringify(entries, null, 2);
  return `${HEADER}\nexport const REGISTRY_ENTRIES: RegistryEntry[] = ${body};\n`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_PATH = join(
  HERE,
  "..",
  "ingest",
  "cadence_registry.yaml",
);
export const OUTPUT_PATH = join(
  HERE,
  "..",
  "app",
  "data-coverage",
  "_registry.generated.ts",
);

export function readRegistry(path: string = REGISTRY_PATH): ParsedRegistry {
  return parse(readFileSync(path, "utf-8")) as ParsedRegistry;
}

function main(): void {
  const registry = readRegistry();
  const text = buildRegistryModule(registry);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, text, "utf-8");
  const n = resolveAll(registry).length;

  console.log(`gen:coverage → wrote ${n} entries to ${OUTPUT_PATH}`);
}

// Bun sets `import.meta.main` true only for the entry point — false when the
// drift test imports this module, so main()'s write side-effect stays scoped to
// the CLI. (Cast: `main` is a Bun extension absent from the standard ImportMeta.)
if ((import.meta as unknown as { main?: boolean }).main) {
  main();
}
