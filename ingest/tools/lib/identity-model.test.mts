import { describe, expect, test } from "bun:test";
import {
  MemRepo,
  allEntries,
  formatFindings,
  loadRegistry,
  moduleDir,
  parseWorkflow,
  type Finding,
} from "./identity-model.mts";

const REGISTRY = `
pipelines:
  - name: news_swfl
    lane: tier-2
    workflow: news-swfl-ingest.yml
    dlt_schema_name: data_lake
    source_tag: news_crawl
  - name: collier_permits
    lane: tier-2
    workflow: collier-permits-monthly.yml
not_yet_running:
  - name: sba_foia_franchise_outcomes
    workflow: franchise-outcomes-quarterly.yml
coverage_exempt:
  - table: data_lake.view_vintages
    reason: derived_snapshot
`;

// Real shape: `on:` must survive as a STRING key (YAML 1.2 core schema, verified
// against Bun.YAML 1.3.14 — NOT the YAML-1.1 `on -> true` boolean trap), a
// commented cron must NOT parse, and env lives at STEP level in this repo.
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
      - uses: actions/checkout@v6
      - name: Run
        env:
          DESTINATION__POSTGRES__CREDENTIALS: \${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
        run: python -m ingest.pipelines.collier_permits.pipeline
`;

describe("loadRegistry", () => {
  test("parses pipelines, not_yet_running, and the structured coverage_exempt block", () => {
    const reg = loadRegistry(new MemRepo({ "ingest/cadence_registry.yaml": REGISTRY }));
    expect(reg.pipelines.map((e) => e.name)).toEqual(["news_swfl", "collier_permits"]);
    expect(reg.not_yet_running?.[0].name).toBe("sba_foia_franchise_outcomes");
    expect(reg.coverage_exempt).toEqual([
      { table: "data_lake.view_vintages", reason: "derived_snapshot" },
    ]);
  });

  test("allEntries marks not_yet_running entries parked", () => {
    const reg = loadRegistry(new MemRepo({ "ingest/cadence_registry.yaml": REGISTRY }));
    const parked = allEntries(reg).filter((e) => e.parked).map((e) => e.entry.name);
    expect(parked).toEqual(["sba_foia_franchise_outcomes"]);
  });
});

describe("parseWorkflow", () => {
  const repo = new MemRepo({ ".github/workflows/collier-permits-monthly.yml": WF_DARK });

  test("a commented-out schedule yields ZERO crons", () => {
    expect(parseWorkflow(repo, "collier-permits-monthly.yml")!.crons).toEqual([]);
  });

  test("collects step-level env keys, uses refs, timeout, and python -m modules", () => {
    const job = parseWorkflow(repo, "collier-permits-monthly.yml")!.jobs[0];
    expect(job.envKeys).toEqual(["DESTINATION__POSTGRES__CREDENTIALS"]);
    expect(job.usesRefs).toEqual(["actions/checkout@v6"]);
    expect(job.timeoutMinutes).toBe(30);
    expect(job.modules).toEqual(["ingest.pipelines.collier_permits.pipeline"]);
    expect(job.callsReusable).toBeNull();
  });

  test("returns null for a workflow file that does not exist", () => {
    expect(parseWorkflow(repo, "ghost.yml")).toBeNull();
  });

  test("extracts a module from the pwsh self-hosted-runner shape (& $env:VENV_PY -m ...)", () => {
    const pwshRepo = new MemRepo({
      ".github/workflows/dbpr-sirs-monthly.yml": `
name: DBPR SIRS
on:
  workflow_dispatch:
jobs:
  ingest:
    runs-on: [self-hosted, swfl-local]
    timeout-minutes: 45
    steps:
      - name: Run ingest
        run: |
          & "$env:VENV_PY" -m ingest.pipelines.dbpr_sirs.pipeline @pyArgs
`,
    });
    const job = parseWorkflow(pwshRepo, "dbpr-sirs-monthly.yml")!.jobs[0];
    expect(job.modules).toEqual(["ingest.pipelines.dbpr_sirs.pipeline"]);
  });
});

describe("moduleDir", () => {
  test("maps a python module path to its source dir", () => {
    expect(moduleDir("ingest.pipelines.news_swfl.pipeline")).toBe("ingest/pipelines/news_swfl");
    expect(moduleDir("ingest.duckdb_pipelines.usgs.pipeline")).toBe("ingest/duckdb_pipelines/usgs");
    expect(moduleDir("ingest.scripts.faf5_to_parquet")).toBe("ingest/scripts");
  });
});

describe("formatFindings", () => {
  test("names BOTH sides of the drift and the fix", () => {
    const f: Finding[] = [
      {
        rule: "source_tag_field_forbidden",
        entry: "news_swfl",
        severity: "red",
        registrySide: 'cadence_registry.yaml declares `source_tag: news_crawl`',
        otherSide:
          "nothing in ingest/ reads source_tag — check_freshness.py scopes on source_name (:238, :382)",
        fix: "SCHEMA_NAME_DRIFT — delete the source_tag: field; use source_name: if the column exists.",
      },
    ];
    const out = formatFindings(f);
    expect(out).toContain("RED  news_swfl [source_tag_field_forbidden]");
    expect(out).toContain("registry: cadence_registry.yaml declares `source_tag: news_crawl`");
    expect(out).toContain("reality:  nothing in ingest/ reads source_tag");
    expect(out).toContain("fix:      SCHEMA_NAME_DRIFT");
  });
});
