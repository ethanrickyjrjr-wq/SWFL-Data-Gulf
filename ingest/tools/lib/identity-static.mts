/**
 * Static identity rules — files only (registry YAML + workflow YAML + pipeline
 * Python). NO DB, NO network except the pluggable TagResolver (Task 5), which
 * fails OPEN. Runs in the pre-push hook.
 *
 * OUT OF SCOPE, DELIBERATELY: workflow *state* at the GitHub API. Four workflows
 * (dbpr-sirs-monthly, fgcu-reri-monthly, marketbeat-pdf-ingest, rsw-airport-monthly)
 * carry live crons in source but are `disabled_manually` at the API, orphaning 6
 * registry entries. --static reads FILES; --live reads the DB; NEITHER reads run
 * state. That class belongs to the §7 3a watch manifest (its `disabled` field).
 */
import {
  allEntries,
  parseWorkflow,
  workflowPath,
  type Finding,
  type Registry,
  type RepoView,
} from "./identity-model.mts";

export function checkWorkflowLiveness(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  for (const { entry, parked } of allEntries(reg)) {
    const wf = entry.workflow;
    const dispatchOnly = entry.dispatch_only === true;

    if (wf === undefined) {
      out.push({
        rule: "workflow_field_missing",
        entry: entry.name,
        severity: "red",
        registrySide: `entry "${entry.name}" has no structured \`workflow:\` field`,
        otherSide:
          "the producing workflow filename exists only in freeform `# Cron:` comments (Spine §3 gap)",
        fix: "SCHEMA_NAME_DRIFT — backfill `workflow: <file>.yml` (or `workflow: none`) on this entry.",
      });
      continue;
    }

    if (wf === "none") {
      if (!parked && !dispatchOnly) {
        out.push({
          rule: "no_producer_workflow",
          entry: entry.name,
          severity: "red",
          registrySide: `entry is ACTIVE in pipelines: (cadence_days: ${entry.cadence_days ?? "?"}) and declares \`workflow: none\``,
          otherSide:
            "no scheduled workflow can ever refresh it — the freshness probe expects it fresh forever",
          fix: "NEVER_LANDED — park the entry (`parked: true`), mark it `dispatch_only: true`, or ship the workflow.",
        });
      }
      continue;
    }

    if (!repo.exists(workflowPath(wf))) {
      out.push({
        rule: "workflow_missing",
        entry: entry.name,
        severity: "red",
        registrySide: `entry declares \`workflow: ${wf}\``,
        otherSide: `${workflowPath(wf)} does not exist`,
        fix: "SCHEMA_NAME_DRIFT — fix the filename or add the workflow.",
      });
      continue;
    }

    const facts = parseWorkflow(repo, wf);
    if (!facts) continue; // unparseable — fail open, another rule surfaces it

    if (facts.crons.length === 0 && !parked && !dispatchOnly) {
      out.push({
        rule: "workflow_dark",
        entry: entry.name,
        severity: "red",
        registrySide: `entry is ACTIVE (cadence_days: ${entry.cadence_days ?? "?"}) and declares \`workflow: ${wf}\``,
        otherSide: `.github/workflows/${wf} has no uncommented cron — dispatch-only, so the source silently ages out`,
        fix: "GAP_SENTINEL — restore the cron, or annotate the entry `dispatch_only: true` / `parked: true` (a stated fact beats silence).",
      });
    }

    if (facts.crons.length > 0 && parked) {
      out.push({
        rule: "parked_but_scheduled",
        entry: entry.name,
        severity: "red",
        registrySide: `entry sits in not_yet_running:/parked — check_freshness.py never probes it`,
        otherSide: `.github/workflows/${wf} fires on cron "${facts.crons.join('", "')}"`,
        fix: "ZERO_COVERAGE — promote it to pipelines: in the same commit the cron goes live, or comment the cron out.",
      });
    }
  }
  return out;
}
