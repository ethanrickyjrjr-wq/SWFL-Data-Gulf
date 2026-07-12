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
  moduleDir,
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

/** Source dirs of every `python -m` module the entry's workflow runs, that EXIST on disk. */
function producingDirs(
  entry: Registry["pipelines"][number],
  repo: RepoView,
): {
  claimed: string[];
  existing: string[];
} {
  const wf = entry.workflow;
  if (!wf || wf === "none") return { claimed: [], existing: [] };
  const facts = parseWorkflow(repo, wf);
  if (!facts) return { claimed: [], existing: [] };
  const claimed = [...new Set(facts.jobs.flatMap((j) => j.modules).map(moduleDir))];
  return { claimed, existing: claimed.filter((d) => repo.exists(d)) };
}

function targetOf(entry: Registry["pipelines"][number]): string | null {
  return (
    entry.count_table ??
    entry.freshness_table ??
    (entry.dlt_schema_name ? `data_lake.${entry.dlt_schema_name}` : null)
  );
}

export function checkProducer(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  for (const { entry, parked } of allEntries(reg)) {
    if (parked) continue; // a parked entry has no producer by definition
    const target = targetOf(entry);
    if (!target) continue; // tier-1 inventory_id entries carry no SQL target

    const { claimed, existing } = producingDirs(entry, repo);

    // ZOMBIE: the registry names a target, but no module the workflow runs exists.
    // This — not a freshness window — is what catches usgs_tier2. A 60d tolerance
    // HIDES a table frozen since 2026-05-19; "no writer exists" never expires.
    if (existing.length === 0) {
      out.push({
        rule: "zombie_target",
        entry: entry.name,
        severity: "red",
        registrySide: `entry claims target ${target} (workflow: ${entry.workflow ?? "—"})`,
        otherSide:
          claimed.length === 0
            ? "that workflow runs no `python -m` module at all — no writer exists"
            : `no module it runs writes that target — modules resolve to [${claimed.join(", ")}]` +
              `; the target's declared producer is absent from the tree`,
        fix:
          "NEVER_LANDED — the registry names a writer that does not exist. Delete the entry, " +
          "repoint the consumer at the lane that IS produced, or ship the pipeline. " +
          "(Never silence it with a freshness tolerance.)",
      });
      continue;
    }

    if (!entry.dlt_schema_name) continue;

    const py = existing.flatMap((d) => repo.pyFiles(d));
    const srcs = py.map((f) => repo.read(f) ?? "");
    const schema = entry.dlt_schema_name;
    const literal = srcs.some((s) => s.includes(`"${schema}"`) || s.includes(`'${schema}'`));
    if (literal) continue;

    // Dynamic naming (leepa: pipeline_name=f"leepa_t2_{token_hex(4)}") is LEGAL,
    // but only when the registry says so out loud.
    const dynamic = srcs.some((s) => /pipeline_name\s*=\s*f["']/.test(s));

    // ZOMBIE, second shape: modules exist but NONE of them is even a dlt writer —
    // no `dlt.pipeline(` anywhere in their sources. A dlt target (dlt_schema_name)
    // whose only living "producer" is a non-dlt module (usgs_tier2: the tier-1
    // DuckDB->Parquet job) has no writer; the tier-2 module was deleted. Raw-psycopg
    // writers (city_pulse, live_search, listing_lifecycle) never reach this branch:
    // they declare no dlt_schema_name.
    if (!dynamic && !srcs.some((s) => /dlt\.pipeline\s*\(/.test(s))) {
      out.push({
        rule: "zombie_target",
        entry: entry.name,
        severity: "red",
        registrySide: `entry claims target ${target} (workflow: ${entry.workflow ?? "—"})`,
        otherSide:
          `no module it runs writes that target — modules resolve to [${existing.join(", ")}]` +
          `; the target's declared producer is absent from the tree`,
        fix:
          "NEVER_LANDED — the registry names a writer that does not exist. Delete the entry, " +
          "repoint the consumer at the lane that IS produced, or ship the pipeline. " +
          "(Never silence it with a freshness tolerance.)",
      });
      continue;
    }

    if (dynamic) {
      if (entry.schema_static === "unverifiable") continue;
      const sample = srcs.find((s) => /pipeline_name\s*=\s*f["']/.test(s))!;
      const snippet = sample.match(/pipeline_name\s*=\s*f["'][^"']*/)?.[0] ?? "f-string";
      out.push({
        rule: "schema_static_undeclared",
        entry: entry.name,
        severity: "red",
        registrySide: `entry declares \`dlt_schema_name: ${schema}\``,
        otherSide: `${existing.join(", ")} builds the dlt pipeline name at runtime — \`${snippet}\` — so the literal can never appear`,
        fix:
          "SCHEMA_NAME_DRIFT — add `schema_static: unverifiable` to this entry and key freshness on " +
          "`count_table`, never on the phantom schema name.",
      });
      continue;
    }

    out.push({
      rule: "schema_literal_absent",
      entry: entry.name,
      severity: "red",
      registrySide: `entry declares \`dlt_schema_name: ${schema}\``,
      otherSide: `no such literal in ${existing.join(", ")} (${py.length} .py file(s) scanned)`,
      fix: "SCHEMA_NAME_DRIFT — align the registry value with the pipeline's `pipeline_name=`, or fix the pipeline.",
    });
  }
  return out;
}

/** Credential-shaped env names. A config knob (LISTINGS_MIN_ROWS, NEWS_ADAPTIVE) is not one. */
const SECRET_SHAPE = /(_API_KEY|_KEY|_TOKEN|_SECRET|_CREDENTIALS|_URL|_URI|_DSN|_PROXY|_PASSWORD)$/;

/** dlt reads this natively — no os.getenv call appears, so it can never be "unread". */
const IMPLICIT_READS = new Set(["DESTINATION__POSTGRES__CREDENTIALS"]);

const READ_RE =
  /os\.environ\.get\(\s*["']([A-Z][A-Z0-9_]*)["']|os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]|os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g;

/** One record per SOURCE LINE, so an `X or Y` fallback chain is judged as a unit. */
function envReadLines(
  repo: RepoView,
  dirs: string[],
): Array<{ file: string; line: number; names: string[] }> {
  const out: Array<{ file: string; line: number; names: string[] }> = [];
  for (const dir of dirs) {
    for (const file of repo.pyFiles(dir)) {
      if (/(^|\/)(test_|tests?\/)/.test(file)) continue;
      const src = repo.read(file) ?? "";
      src.split("\n").forEach((text, i) => {
        const names = [...text.matchAll(READ_RE)].map((m) => m[1] ?? m[2] ?? m[3]).filter(Boolean);
        if (names.length > 0)
          out.push({ file, line: i + 1, names: [...new Set(names)] as string[] });
      });
    }
  }
  return out;
}

export function checkSecretsWired(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  for (const { entry, parked } of allEntries(reg)) {
    if (parked) continue;
    const wf = entry.workflow;
    if (!wf || wf === "none") continue;
    const facts = parseWorkflow(repo, wf);
    if (!facts) continue;
    // 08g DRIFT B: a caller's workflow-level env: does NOT propagate to a called
    // workflow. Read env from the file that actually runs the python — today that
    // is always this file (zero workflow_call exists), and this comment is the
    // forward guard for when Phase 4 changes that.
    const wired = new Set(facts.jobs.flatMap((j) => j.envKeys));
    const { existing } = producingDirs(entry, repo);
    if (existing.length === 0) continue; // zombie — rule B owns it

    const reads = envReadLines(repo, existing);
    const readNames = new Set(reads.flatMap((r) => r.names));

    for (const r of reads) {
      // Fallback-aware: `os.environ.get("MHS_DB_URL") or os.environ.get("DATABASE_URL")`
      // is satisfied if ANY name on that line is wired.
      if (r.names.some((n) => wired.has(n))) continue;
      const unwiredSecrets = r.names.filter((n) => SECRET_SHAPE.test(n));
      if (unwiredSecrets.length === 0) continue;
      out.push({
        rule: "secret_not_wired",
        entry: entry.name,
        severity: "red",
        registrySide: `${r.file}:${r.line} reads ${unwiredSecrets.map((n) => `\`${n}\``).join(" / ")}`,
        otherSide: `.github/workflows/${wf} env: wires [${[...wired].join(", ") || "nothing"}] — none of them`,
        fix:
          "SECRET_NOT_WIRED — `gh secret set` is step 1; adding the key to the workflow `env:` block " +
          "is step 2. The run goes GREEN while the feature silently no-ops without it.",
      });
    }

    for (const key of wired) {
      if (IMPLICIT_READS.has(key) || readNames.has(key)) continue;
      out.push({
        rule: "secret_wired_unread",
        entry: entry.name,
        severity: "warn",
        registrySide: `.github/workflows/${wf} env: wires \`${key}\``,
        otherSide: `no os.environ/os.getenv read of it in ${existing.join(", ")}`,
        fix:
          "Advisory only. A wired-dead key looks identical to a wired-live key — that is how " +
          "GAP_SENTINEL (dead vendor key = green run) hides. Drop it or document why it stays.",
      });
    }
  }
  return out;
}
