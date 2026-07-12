import { describe, expect, test } from "bun:test";
import { MemRepo, loadRegistry } from "./identity-model.mts";
import { runLiveChecks, type DltLoad, type LakeReader, type LakeTable } from "./identity-live.mts";

const NOW = new Date("2026-07-11T12:00:00Z");

function fakeLake(over: Partial<{ tables: LakeTable[]; loads: DltLoad[] }> = {}): LakeReader {
  const tables: LakeTable[] = over.tables ?? [];
  const loads: DltLoad[] = over.loads ?? [];
  return {
    baseTables: async (schema) => tables.filter((t) => t.schema === schema && t.kind === "table"),
    table: async (q) => {
      const [s, n] = q.split(".");
      return tables.find((t) => t.schema === s && t.name === n) ?? null;
    },
    rowCount: async (q) => (await fakeLake({ tables, loads }).table(q))?.rows ?? 0,
    dltLoads: async () => loads,
    close: async () => {},
  };
}
const T = (
  name: string,
  rows: number,
  columns: string[] = ["id"],
  schema = "data_lake",
): LakeTable => ({
  schema,
  name,
  kind: "table",
  rows,
  columns,
});

const repo = new MemRepo({ "ingest/cadence_registry.yaml": "pipelines: []\n" });
const reg = (yaml: string) => loadRegistry(new MemRepo({ "ingest/cadence_registry.yaml": yaml }));

describe("runLiveChecks", () => {
  test("RED zero_coverage: a live lake table no entry claims (parcel_subdivision)", async () => {
    const r = reg(`
pipelines:
  - name: leepa
    count_table: data_lake.leepa_parcels
coverage_exempt:
  - table: data_lake.view_vintages
    reason: derived_snapshot
`);
    const lake = fakeLake({
      tables: [T("leepa_parcels", 548798), T("parcel_subdivision", 220875), T("view_vintages", 1357)],
    });
    const f = await runLiveChecks(r, repo, lake, NOW);
    const zc = f.filter((x) => x.rule === "zero_coverage");
    expect(zc.map((x) => x.entry)).toEqual(["data_lake.parcel_subdivision"]);
    expect(zc[0].otherSide).toContain("220875 rows");
  });

  test("zero_coverage fires on a 0-ROW uncovered table too (community_profiles)", async () => {
    const f = await runLiveChecks(
      reg("pipelines: []\n"),
      repo,
      fakeLake({ tables: [T("community_profiles", 0)] }),
      NOW,
    );
    expect(f.filter((x) => x.rule === "zero_coverage").map((x) => x.entry)).toEqual([
      "data_lake.community_profiles",
    ]);
  });

  test("zero_coverage NEVER fires on dlt hash-churn schemas (leepa_t2_*) — they are not base tables", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: leepa
    count_table: data_lake.leepa_parcels
    dlt_schema_name: leepa_parcels_tier2
    schema_static: unverifiable
`),
      repo,
      fakeLake({
        tables: [T("leepa_parcels", 548798)],
        loads: [
          { schema_name: "leepa_t2_a1b2c3d4", ok_loads: 1, last_inserted_at: "2026-05-18T00:00:00Z" },
          {
            schema_name: "collier_parcels_t2_ff00ff00",
            ok_loads: 1,
            last_inserted_at: "2026-06-06T00:00:00Z",
          },
          { schema_name: "tier1_inventory", ok_loads: 56, last_inserted_at: "2026-05-19T00:00:00Z" },
        ],
      }),
      NOW,
    );
    expect(f.filter((x) => x.severity === "red")).toEqual([]);
  });

  test("RED ghost_target: registry names a table the DB does not have (redfin_city_swfl)", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: redfin_city_swfl
    count_table: data_lake.redfin_city_swfl
    dlt_schema_name: redfin_city_swfl
    expected_rows_min: 1700
`),
      repo,
      fakeLake({ tables: [] }),
      NOW,
    );
    const rules = f.filter((x) => x.severity === "red").map((x) => x.rule);
    expect(rules).toContain("ghost_target");
    expect(rules).toContain("dlt_never_landed");
    const ghost = f.find((x) => x.rule === "ghost_target")!;
    expect(ghost.registrySide).toContain("expected_rows_min: 1700");
    expect(ghost.otherSide).toContain("relation does not exist");
    expect(ghost.fix).toContain("a dry-run writes nothing");
  });

  test("RED dlt_never_landed: news_swfl's phantom `dlt_schema_name: data_lake`", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: news_swfl
    dlt_schema_name: data_lake
    freshness_table: data_lake.news_articles_swfl
`),
      repo,
      fakeLake({
        tables: [T("news_articles_swfl", 4210)],
        loads: [{ schema_name: "news_swfl", ok_loads: 24, last_inserted_at: "2026-07-10T00:00:00Z" }],
      }),
      NOW,
    );
    const nl = f.filter((x) => x.rule === "dlt_never_landed");
    expect(nl).toHaveLength(1);
    expect(nl[0].registrySide).toContain("dlt_schema_name: data_lake");
    expect(nl[0].otherSide).toContain("news_swfl");
  });

  test("RED row_floor_breach: dbpr_re_licensees 0 rows vs floor 15000", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: dbpr_re_licensees
    count_table: public.dbpr_re_licensees
    expected_rows_min: 15000
    source_name: dbpr_re_rgn7
`),
      repo,
      fakeLake({ tables: [{ ...T("dbpr_re_licensees", 0, ["source_name"]), schema: "public" }] }),
      NOW,
    );
    const rf = f.filter((x) => x.rule === "row_floor_breach");
    expect(rf).toHaveLength(1);
    expect(rf[0].registrySide).toContain("15000");
    expect(rf[0].otherSide).toContain("0 rows");
  });

  test("RED identity_column_mismatch: entry scopes on source_name, the table has source_tag", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: daily_truth_ish
    count_table: data_lake.daily_truth
    source_name: live_search
`),
      repo,
      fakeLake({ tables: [T("daily_truth", 120, ["metric", "source_tag"])] }),
      NOW,
    );
    const m = f.filter((x) => x.rule === "identity_column_mismatch");
    expect(m).toHaveLength(1);
    expect(m[0].registrySide).toContain("source_name: live_search");
    expect(m[0].otherSide).toContain("has no `source_name` column");
    expect(m[0].otherSide).toContain("source_tag");
  });

  test("first_run_after in the future demotes never-landed/floor REDs to a PENDING warn", async () => {
    const f = await runLiveChecks(
      reg(`
pipelines:
  - name: leepa_parcel_zip
    count_table: data_lake.leepa_parcel_zip
    dlt_schema_name: leepa_parcel_zip
    expected_rows_min: 480000
    first_run_after: "2026-07-15"
`),
      repo,
      fakeLake({ tables: [] }),
      NOW,
    );
    expect(f.filter((x) => x.severity === "red")).toEqual([]);
    expect(f.map((x) => x.rule)).toContain("first_run_pending");
  });
});
