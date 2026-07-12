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
