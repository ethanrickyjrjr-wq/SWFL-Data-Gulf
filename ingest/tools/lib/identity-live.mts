/**
 * Live identity rules — registry ↔ data_lake, both directions. CI only.
 *
 * View-vs-table MUST come from pg_catalog.pg_class.relkind, never
 * information_schema.tables: the lake MCP proxy reports the VIEW
 * listing_active_stats as a BASE TABLE. See identity-lake.mts.
 *
 * The ZOMBIE rule (usgs_tier2) is STATIC, not live — a 60-day tolerance HIDES a
 * table frozen since 2026-05-19. The assertion is "some pipeline WRITES this
 * table", not "the table is recent". --live only attaches the evidence date.
 */
import { allEntries, type Finding, type Registry, type RepoView } from "./identity-model.mts";

export interface LakeTable {
  schema: string;
  name: string;
  kind: "table" | "view";
  rows: number;
  columns: string[];
}
export interface DltLoad {
  schema_name: string;
  ok_loads: number;
  last_inserted_at: string | null;
}
export interface LakeReader {
  baseTables(schema: string): Promise<LakeTable[]>;
  table(qualified: string): Promise<LakeTable | null>;
  rowCount(qualified: string, sourceName?: string): Promise<number>;
  dltLoads(): Promise<DltLoad[]>;
  close(): Promise<void>;
}

function targets(entry: Registry["pipelines"][number]): string[] {
  const t = [entry.count_table, entry.freshness_table].filter(Boolean) as string[];
  return [...new Set(t)];
}

export async function runLiveChecks(
  reg: Registry,
  _repo: RepoView,
  lake: LakeReader,
  now: Date,
): Promise<Finding[]> {
  const out: Finding[] = [];
  const entries = allEntries(reg);
  const pending = (e: Registry["pipelines"][number]) =>
    typeof e.first_run_after === "string" && new Date(`${e.first_run_after}T00:00:00Z`) > now;

  // --- (a) ZERO COVERAGE: DB has, registry lacks -----------------------------
  // Computed from pg_catalog BASE TABLES — never from _dlt_loads.schema_name, so
  // the 426 dead leepa_t2_* / collier_parcels_t2_* / tier1_inventory hash-churn
  // schemas cannot flood this. NOT keyed on row count: community_profiles and
  // neighborhood_stats are 0-row, uncovered, and read by a shipping brain.
  const claimed = new Set<string>();
  for (const { entry } of entries) {
    for (const t of targets(entry)) claimed.add(t.toLowerCase());
    if (entry.dlt_schema_name) claimed.add(`data_lake.${entry.dlt_schema_name}`.toLowerCase());
  }
  for (const ex of reg.coverage_exempt ?? []) if (ex?.table) claimed.add(ex.table.toLowerCase());

  for (const t of await lake.baseTables("data_lake")) {
    if (t.name.startsWith("_")) continue; // dlt internals (_dlt_loads, _tier1_inventory)
    const q = `${t.schema}.${t.name}`;
    if (claimed.has(q.toLowerCase())) continue;
    out.push({
      rule: "zero_coverage",
      entry: q,
      severity: "red",
      registrySide: "no cadence_registry entry and no coverage_exempt: names this table",
      otherSide: `it exists in data_lake with ${t.rows} rows — unprobed, unguarded, invisible to check_freshness.py`,
      fix:
        "ZERO_COVERAGE — add a `pipelines:` entry (+ a cron) or an explicit `coverage_exempt: {table, reason}`. " +
        "A brain reading an unmonitored table degrades to empty and still reports healthy.",
    });
  }

  const loads = await lake.dltLoads();
  const landed = new Map(loads.map((l) => [l.schema_name.toLowerCase(), l]));

  for (const { entry, parked } of entries) {
    if (parked) continue;
    const isPending = pending(entry);
    const push = (f: Finding) => {
      if (!isPending || f.severity === "warn") return out.push(f);
      out.push({
        ...f,
        rule: "first_run_pending",
        severity: "warn",
        fix: `PENDING until first_run_after: ${entry.first_run_after}. Original: [${f.rule}] ${f.fix}`,
      });
    };

    // --- (b) GHOST TARGET: registry claims, DB lacks --------------------------
    for (const t of targets(entry)) {
      const tbl = await lake.table(t);
      if (tbl === null) {
        push({
          rule: "ghost_target",
          entry: entry.name,
          severity: "red",
          registrySide: `entry claims ${t}${entry.expected_rows_min ? ` (expected_rows_min: ${entry.expected_rows_min})` : ""}`,
          otherSide: `relation does not exist in pg_catalog`,
          fix:
            "NEVER_LANDED — the registry's floor was derived from a dry-run, and a dry-run writes nothing. " +
            "Land it, or delete the entry.",
        });
        continue;
      }

      // --- correction #2: WHICH COLUMN does the target ACTUALLY have? ---------
      if (entry.source_name !== undefined && !tbl.columns.includes("source_name")) {
        push({
          rule: "identity_column_mismatch",
          entry: entry.name,
          severity: "red",
          registrySide: `entry declares \`source_name: ${entry.source_name}\` — check_freshness.py scopes every query \`WHERE source_name = %s\` (:238, :382)`,
          otherSide:
            `${t} has no \`source_name\` column (columns: ${tbl.columns.slice(0, 8).join(", ")}` +
            `${tbl.columns.includes("source_tag") ? " — it has `source_tag` instead" : ""})`,
          fix:
            "SCHEMA_NAME_DRIFT — this is the exact source_tag-vs-source_name mismatch that false-REDded " +
            "daily_truth for two weeks. Drop the scoping field, or add the column the probe reads.",
        });
      }

      // --- (d) ROW FLOOR -------------------------------------------------------
      if (typeof entry.expected_rows_min === "number" && t === (entry.count_table ?? t)) {
        const n = await lake.rowCount(
          t,
          tbl.columns.includes("source_name") ? entry.source_name : undefined,
        );
        if (n < entry.expected_rows_min) {
          push({
            rule: "row_floor_breach",
            entry: entry.name,
            severity: "red",
            registrySide: `entry declares expected_rows_min: ${entry.expected_rows_min} on ${t}`,
            otherSide: `${t} holds ${n} rows${entry.source_name ? ` for source_name='${entry.source_name}'` : ""}`,
            fix: "NEVER_LANDED / GAP_SENTINEL — a green run with no rows. Verify the vendor account and the writer, not the floor.",
          });
        }
      }
    }

    // --- (c) dlt SCHEMA NEVER LANDED ------------------------------------------
    // schema_static: unverifiable = the pipeline names its dlt schema at RUNTIME
    // (leepa: leepa_t2_<hash>), so the registry's static name can never appear in
    // _dlt_loads. Asserting it landed would be a guaranteed false RED; the real
    // live check for such entries is the count_table row floor above.
    if (entry.dlt_schema_name && entry.schema_static !== "unverifiable") {
      const l = landed.get(entry.dlt_schema_name.toLowerCase());
      if (!l || l.ok_loads === 0) {
        push({
          rule: "dlt_never_landed",
          entry: entry.name,
          severity: "red",
          registrySide: `entry declares \`dlt_schema_name: ${entry.dlt_schema_name}\``,
          otherSide:
            `_dlt_loads has no status=0 load under that schema` +
            (loads.length
              ? ` — the schemas that DID land include [${loads
                  .slice(0, 5)
                  .map((x) => x.schema_name)
                  .join(", ")}…]`
              : ""),
          fix:
            "NEVER_LANDED / SCHEMA_NAME_DRIFT — either the pipeline has never landed a row, or the registry " +
            "names the dlt DATASET (data_lake) instead of the dlt SCHEMA. Freshness keyed on this is a phantom.",
        });
      } else if (l.last_inserted_at) {
        // (e) ZOMBIE evidence. The RED verdict is the STATIC rule (no producing
        // module) — a freshness tolerance would hide this (usgs: 53/60 days).
        const ageDays = Math.floor(
          (now.getTime() - new Date(l.last_inserted_at).getTime()) / 86_400_000,
        );
        const tol = (entry.cadence_days ?? 30) * (entry.tolerance_multiplier ?? 2);
        if (ageDays > tol) {
          out.push({
            rule: "dlt_writer_frozen",
            entry: entry.name,
            severity: "warn",
            registrySide: `entry claims cadence_days: ${entry.cadence_days ?? "?"} on schema ${entry.dlt_schema_name}`,
            otherSide: `newest ok load in _dlt_loads is ${l.last_inserted_at.slice(0, 10)} (${ageDays}d, tolerance ${tol}d)`,
            fix: "Evidence for the static zombie_target verdict — confirm a pipeline still WRITES this table.",
          });
        }
      }
    }
  }
  return out;
}
