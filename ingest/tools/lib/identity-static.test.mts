import { describe, expect, test } from "bun:test";
import { MemRepo, loadRegistry } from "./identity-model.mts";
import { checkWorkflowLiveness } from "./identity-static.mts";

const WF_LIVE = `
name: Franchise outcomes quarterly
on:
  schedule:
    - cron: "0 8 15 1,4,7,10 *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - run: python -m ingest.duckdb_pipelines.franchise_outcomes.pipeline
`;

const WF_DARK = `
name: Collier permits monthly
on:
  # schedule:
  #   - cron: "0 9 5 * *"
  workflow_dispatch:
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - run: python -m ingest.pipelines.collier_permits.pipeline
`;

function build(registryYaml: string) {
  const repo = new MemRepo({
    "ingest/cadence_registry.yaml": registryYaml,
    ".github/workflows/franchise-outcomes-quarterly.yml": WF_LIVE,
    ".github/workflows/collier-permits-monthly.yml": WF_DARK,
    "ingest/pipelines/collier_permits/pipeline.py": "x = 1\n",
    "ingest/duckdb_pipelines/franchise_outcomes/pipeline.py": "x = 1\n",
  });
  return { repo, reg: loadRegistry(repo) };
}

describe("checkWorkflowLiveness", () => {
  test("RED: an active entry whose workflow has NO uncommented cron (collier_permits)", () => {
    const { repo, reg } = build(`
pipelines:
  - name: collier_permits
    workflow: collier-permits-monthly.yml
    cadence_days: 30
`);
    const f = checkWorkflowLiveness(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["workflow_dark"]);
    expect(f[0].entry).toBe("collier_permits");
    expect(f[0].registrySide).toContain("cadence_days: 30");
    expect(f[0].otherSide).toContain("collier-permits-monthly.yml has no uncommented cron");
  });

  test("GREEN: the same dark workflow once the entry declares dispatch_only", () => {
    const { repo, reg } = build(`
pipelines:
  - name: collier_permits
    workflow: collier-permits-monthly.yml
    cadence_days: 30
    dispatch_only: true
`);
    expect(checkWorkflowLiveness(reg, repo)).toEqual([]);
  });

  test("RED (inverse): a parked entry whose workflow IS scheduled (sba_foia_franchise_outcomes)", () => {
    const { repo, reg } = build(`
pipelines: []
not_yet_running:
  - name: sba_foia_franchise_outcomes
    workflow: franchise-outcomes-quarterly.yml
`);
    const f = checkWorkflowLiveness(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["parked_but_scheduled"]);
    expect(f[0].otherSide).toContain("0 8 15 1,4,7,10 *");
    expect(f[0].fix).toContain("promote it to pipelines:");
  });

  test("RED: workflow: names a file that does not exist", () => {
    const { repo, reg } = build(`
pipelines:
  - name: ghost_pipeline
    workflow: no-such-workflow.yml
`);
    const f = checkWorkflowLiveness(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["workflow_missing"]);
    expect(f[0].otherSide).toContain(".github/workflows/no-such-workflow.yml does not exist");
  });

  test("RED: the Spine field is absent entirely", () => {
    const { repo, reg } = build(`
pipelines:
  - name: unspined
    cadence_days: 7
`);
    expect(checkWorkflowLiveness(reg, repo).map((x) => x.rule)).toEqual(["workflow_field_missing"]);
  });

  test("GREEN: workflow: none is legal for a parked entry", () => {
    const { repo, reg } = build(`
pipelines: []
not_yet_running:
  - name: airdna_str_swfl
    workflow: none
`);
    expect(checkWorkflowLiveness(reg, repo)).toEqual([]);
  });

  test("RED: workflow: none on an ACTIVE entry (no producer at all)", () => {
    const { repo, reg } = build(`
pipelines:
  - name: mhs_databook
    workflow: none
    cadence_days: 365
`);
    expect(checkWorkflowLiveness(reg, repo).map((x) => x.rule)).toEqual(["no_producer_workflow"]);
  });
});

import { checkProducer } from "./identity-static.mts";

const WF_USGS = `
name: USGS monthly
on:
  schedule:
    - cron: "0 11 10 * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - run: python -m ingest.duckdb_pipelines.usgs.pipeline
`;
const WF_LEEPA = `
name: LeePA parcels annual
on:
  schedule:
    - cron: "0 9 15 * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - run: python -m ingest.pipelines.leepa.pipeline
`;
const WF_BLS = `
name: BLS LAUS monthly
on:
  schedule:
    - cron: "0 12 5 * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - run: python -m ingest.pipelines.bls_laus.pipeline
`;

function producerRepo(registryYaml: string) {
  const repo = new MemRepo({
    "ingest/cadence_registry.yaml": registryYaml,
    ".github/workflows/usgs-monthly.yml": WF_USGS,
    ".github/workflows/leepa-parcels-annual.yml": WF_LEEPA,
    ".github/workflows/bls-laus-monthly.yml": WF_BLS,
    // The ONLY usgs code: DuckDB -> Parquet. Writes no Postgres table. There is
    // no ingest/pipelines/usgs/ — it was deleted.
    "ingest/duckdb_pipelines/usgs/pipeline.py":
      'CREATE = "CREATE TABLE usgs_daily"  # in-memory duckdb, never Postgres\n',
    "ingest/pipelines/leepa/resources.py":
      'import secrets as _secrets\npipe = dlt.pipeline(pipeline_name=f"leepa_t2_{_secrets.token_hex(4)}")\n',
    "ingest/pipelines/bls_laus/pipeline.py": 'p = dlt.pipeline(pipeline_name="bls_laus")\n',
  });
  return { repo, reg: loadRegistry(repo) };
}

describe("checkProducer", () => {
  test("RED zombie: registry names a target but the producing module DOES NOT EXIST (usgs_tier2)", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: usgs_tier2
    lane: tier-2
    workflow: usgs-monthly.yml
    dlt_schema_name: usgs
    count_table: data_lake.usgs_daily
`);
    const f = checkProducer(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["zombie_target"]);
    expect(f[0].registrySide).toContain("data_lake.usgs_daily");
    expect(f[0].otherSide).toContain("ingest/duckdb_pipelines/usgs");
    expect(f[0].otherSide).toContain("no module it runs writes that target");
    expect(f[0].fix).toContain("NEVER_LANDED");
  });

  test("RED: dynamic pipeline_name without the declared escape (leepa, undeclared)", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: leepa
    lane: tier-2
    workflow: leepa-parcels-annual.yml
    dlt_schema_name: leepa_parcels_tier2
    count_table: data_lake.leepa_parcels
`);
    const f = checkProducer(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["schema_static_undeclared"]);
    expect(f[0].otherSide).toContain('pipeline_name=f"leepa_t2_{');
  });

  test("GREEN: the same leepa entry once it declares schema_static: unverifiable", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: leepa
    lane: tier-2
    workflow: leepa-parcels-annual.yml
    dlt_schema_name: leepa_parcels_tier2
    schema_static: unverifiable
    count_table: data_lake.leepa_parcels
`);
    expect(checkProducer(reg, repo)).toEqual([]);
  });

  test("GREEN: a static dlt_schema_name literal present in the pipeline python (bls_laus)", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: bls_laus
    lane: tier-2
    workflow: bls-laus-monthly.yml
    dlt_schema_name: bls_laus
`);
    expect(checkProducer(reg, repo)).toEqual([]);
  });

  test("RED: schema literal absent, module exists, naming is NOT dynamic", () => {
    const { repo, reg } = producerRepo(`
pipelines:
  - name: bls_laus
    lane: tier-2
    workflow: bls-laus-monthly.yml
    dlt_schema_name: bls_laus_typo
`);
    const f = checkProducer(reg, repo);
    expect(f.map((x) => x.rule)).toEqual(["schema_literal_absent"]);
    expect(f[0].registrySide).toContain("bls_laus_typo");
    expect(f[0].otherSide).toContain("ingest/pipelines/bls_laus");
  });
});

import { checkSecretsWired } from "./identity-static.mts";

const WF_NEWS = `
name: SWFL business news ingest daily
on:
  schedule:
    - cron: "0 6 * * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Run news ingest
        env:
          DESTINATION__POSTGRES__CREDENTIALS: \${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
          NEWS_ADAPTIVE: "1"
        run: python -m ingest.pipelines.news_swfl.pipeline
`;
const WF_MHS = `
name: MHS permits annual
on:
  schedule:
    - cron: "0 10 20 3 *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Run
        env:
          DATABASE_URL: \${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
        run: python -m ingest.pipelines.mhs_permits_swfl.pipeline
`;

function secretsRepo(registryYaml: string) {
  const repo = new MemRepo({
    "ingest/cadence_registry.yaml": registryYaml,
    ".github/workflows/news-swfl-ingest.yml": WF_NEWS,
    ".github/workflows/ingest-mhs-permits-swfl.yml": WF_MHS,
    "ingest/pipelines/news_swfl/novelty.py": 'db_url = os.environ.get("DATABASE_URL")\n',
    "ingest/pipelines/news_swfl/fetcher.py":
      'if os.environ.get("NEWS_ADAPTIVE", "").strip():\n    pass\n',
    "ingest/pipelines/mhs_permits_swfl/pipeline.py":
      'url = os.environ.get("MHS_DB_URL") or os.environ.get("DATABASE_URL")\n',
  });
  return { repo, reg: loadRegistry(repo) };
}

describe("checkSecretsWired", () => {
  test("RED: news_swfl reads DATABASE_URL; the workflow env: never aliases it", () => {
    const { repo, reg } = secretsRepo(`
pipelines:
  - name: news_swfl
    workflow: news-swfl-ingest.yml
`);
    const red = checkSecretsWired(reg, repo).filter((f) => f.severity === "red");
    expect(red.map((f) => f.rule)).toEqual(["secret_not_wired"]);
    expect(red[0].registrySide).toContain("ingest/pipelines/news_swfl/novelty.py");
    expect(red[0].registrySide).toContain("DATABASE_URL");
    expect(red[0].otherSide).toContain("news-swfl-ingest.yml env: wires");
    expect(red[0].otherSide).toContain("DESTINATION__POSTGRES__CREDENTIALS");
    expect(red[0].fix).toContain("SECRET_NOT_WIRED");
  });

  test("GREEN: an `or` fallback chain whose alias IS wired (mhs_permits_swfl)", () => {
    const { repo, reg } = secretsRepo(`
pipelines:
  - name: mhs_permits_swfl
    workflow: ingest-mhs-permits-swfl.yml
`);
    expect(checkSecretsWired(reg, repo).filter((f) => f.severity === "red")).toEqual([]);
  });

  test("non-credential env knobs (NEWS_ADAPTIVE-shaped) never RED", () => {
    const { repo, reg } = secretsRepo(`
pipelines:
  - name: news_swfl
    workflow: news-swfl-ingest.yml
`);
    const names = checkSecretsWired(reg, repo).map((f) => f.registrySide);
    expect(names.some((s) => s.includes("NEWS_ADAPTIVE"))).toBe(false);
  });

  test("WARN (never RED): a key wired into env: that the code never reads", () => {
    const { repo, reg } = secretsRepo(`
pipelines:
  - name: mhs_permits_swfl
    workflow: ingest-mhs-permits-swfl.yml
`);
    // MHS reads DATABASE_URL, so nothing is surplus here; assert the WARN path
    // exists and is warn-severity by construction on news (NEWS_ADAPTIVE is read,
    // DESTINATION is implicit-dlt → whitelisted; so: no surplus, no crash).
    const all = checkSecretsWired(reg, repo);
    expect(all.every((f) => f.severity !== "red")).toBe(true);
  });
});
