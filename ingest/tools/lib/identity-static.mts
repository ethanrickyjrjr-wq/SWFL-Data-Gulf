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

/** Workflows that own a nightly ordered chain. A member invoked from a head by a
 *  job-level `uses:` is CLOCKED even though it carries no cron of its own — the
 *  07/12/2026 cutover retired the members' standalone crons on purpose (08d §6:
 *  8 independent clocks each paid their own scheduler drift, making execution
 *  order random). Honored ONLY while the head itself has a live cron: if the
 *  chain's cron is ever commented out, its members really are dark again and
 *  workflow_dark fires for each one. */
const CHAIN_HEADS = ["nightly-chain.yml"];

function chainClockedMembers(repo: RepoView): Set<string> {
  const out = new Set<string>();
  for (const head of CHAIN_HEADS) {
    const facts = repo.exists(workflowPath(head)) ? parseWorkflow(repo, head) : null;
    if (!facts || facts.crons.length === 0) continue; // a dark head clocks nothing
    for (const j of facts.jobs) {
      if (!j.callsReusable) continue;
      const base = (j.callsReusable.split("/").pop() ?? "").replace(/@.*$/, "");
      if (base) out.add(base);
    }
  }
  return out;
}

export function checkWorkflowLiveness(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  const chained = chainClockedMembers(repo);
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

    if (facts.crons.length === 0 && !parked && !dispatchOnly && !chained.has(wf)) {
      out.push({
        rule: "workflow_dark",
        entry: entry.name,
        severity: "red",
        registrySide: `entry is ACTIVE (cadence_days: ${entry.cadence_days ?? "?"}) and declares \`workflow: ${wf}\``,
        otherSide: `.github/workflows/${wf} has no uncommented cron — dispatch-only, so the source silently ages out`,
        fix: "GAP_SENTINEL — restore the cron, annotate the entry `dispatch_only: true` / `parked: true`, or invoke it by `uses:` from a cron-carrying chain head (a stated fact beats silence).",
      });
    }

    if ((facts.crons.length > 0 || chained.has(wf)) && parked) {
      out.push({
        rule: "parked_but_scheduled",
        entry: entry.name,
        severity: "red",
        registrySide: `entry sits in not_yet_running:/parked — check_freshness.py never probes it`,
        otherSide:
          facts.crons.length > 0
            ? `.github/workflows/${wf} fires on cron "${facts.crons.join('", "')}"`
            : `.github/workflows/${wf} is invoked nightly by a chain head (${CHAIN_HEADS.join(", ")})`,
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
    // `workflow: none` + `dispatch_only: true` = a STATED manual source (mhs_databook:
    // a human drops the PDF). No code writer exists by design — that is the declared
    // truth, not a zombie. An entry with workflow: none and NO dispatch_only still
    // zombies (usgs_tier2) until an operator decision lands in known_drift.
    if (entry.workflow === "none" && entry.dispatch_only === true) continue;
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

/** Read natively by something that is not our code — no os.getenv call can ever appear. */
const IMPLICIT_READS = new Set([
  "DESTINATION__POSTGRES__CREDENTIALS", // dlt reads it inside the library
  "PYTHONUNBUFFERED", // the interpreter itself reads it
]);

const READ_RE =
  /os\.environ\.get\(\s*["']([A-Z][A-Z0-9_]*)["']|os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]|os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g;

/**
 * `anthropic.Anthropic()` / `AsyncAnthropic()` with NO args reads ANTHROPIC_API_KEY
 * inside the SDK — the env read our regex hunts for never appears in our source.
 * Argful construction (`Anthropic(api_key=...)`) is excluded: there the key arrives
 * via a visible os.environ read that READ_RE already catches.
 */
const SDK_IMPLICIT_RE = /\b(?:Async)?Anthropic\(\s*\)/;

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
        if (SDK_IMPLICIT_RE.test(text)) names.push("ANTHROPIC_API_KEY");
        if (names.length > 0)
          out.push({ file, line: i + 1, names: [...new Set(names)] as string[] });
      });
    }
  }
  return out;
}

export function checkSecretsWired(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  // Shared-lib reads satisfy the SURPLUS direction only. A wired key that ingest/lib
  // consumes is plausibly live (storage_uploader reads SUPABASE_URL/SUPABASE_SERVICE_KEY
  // for 44 workflows), but with no import analysis a lib read is never attributed to a
  // specific pipeline — so it can suppress `secret_wired_unread`, never demand wiring
  // via `secret_not_wired`.
  const libReadNames = new Set(envReadLines(repo, ["ingest/lib"]).flatMap((r) => r.names));
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
      if (IMPLICIT_READS.has(key) || readNames.has(key) || libReadNames.has(key)) continue;
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

/**
 * Tag resolution. NEVER a baked version literal.
 *
 * LIVE FACT (gh api repos/actions/checkout/{tags,releases/latest}, re-verified 2026-07-12):
 *   v7.0.0 published 2026-06-18 → latest major = v7
 *   v6.0.0 published 2025-11-20 → v6 EXISTS and resolves (101 workflows pin it)
 * 00-DIAGNOSIS's "actions/checkout@v6 (nonexistent version)" is REFUTED — the label
 * was already false at the incident dates. A hardcoded expected-major would have
 * false-flagged v6 in June AND be blind to v7 today. That is why this resolves
 * against live/maintained tags and asserts only "the ref exists".
 *
 * tag-exists != compatible: v7.0.0 blocks fork-PR checkout on workflow_run (we use
 * workflow_run in 4 workflows) and moved to ESM. So a newer major is a WARN, never
 * a RED, and NOTHING here tells anyone to mass-bump.
 */
export interface TagResolver {
  /** Tag names for `owner/repo`, or null when unresolvable (offline / no gh) → fail OPEN. */
  tags(action: string): string[] | null;
}

function majorOf(ref: string): string | null {
  const m = ref.match(/^v(\d+)/);
  return m ? m[1] : null;
}

export function checkTimeouts(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const { entry } of allEntries(reg)) {
    const wf = entry.workflow;
    if (!wf || wf === "none" || seen.has(wf)) continue;
    seen.add(wf);
    const facts = parseWorkflow(repo, wf);
    if (!facts) continue;
    for (const job of facts.jobs) {
      // 08g DRIFT A: timeout-minutes is NOT a supported keyword on a job that
      // `uses:` a reusable workflow — GitHub ignores it. Demanding it there is a
      // permanent false RED (and invites someone to "fix" it with an ignored key).
      if (job.callsReusable) continue;
      if (job.timeoutMinutes === null) {
        out.push({
          rule: "timeout_missing",
          entry: entry.name,
          severity: "red",
          registrySide: `entry runs via \`workflow: ${wf}\``,
          otherSide: `job \`${job.id}\` has no timeout-minutes — a hung run burns the full 6h GHA ceiling`,
          fix: "TIMEOUT_KILL — add `timeout-minutes:` to the job (see fdot-aadt-annual.yml: an untimed kill left the table EMPTY for 18 days).",
        });
      }
    }
  }
  return out;
}

export function checkActionVersions(reg: Registry, repo: RepoView, tags: TagResolver): Finding[] {
  const out: Finding[] = [];
  const seenWf = new Set<string>();
  const warnedUnresolved = new Set<string>();
  for (const { entry } of allEntries(reg)) {
    const wf = entry.workflow;
    if (!wf || wf === "none" || seenWf.has(wf)) continue;
    seenWf.add(wf);
    const facts = parseWorkflow(repo, wf);
    if (!facts) continue;
    for (const ref of facts.jobs.flatMap((j) => j.usesRefs)) {
      if (ref.startsWith("./")) continue; // local reusable workflow — not a marketplace action
      const [action, pin] = ref.split("@");
      if (!action || !pin) continue;
      const known = tags.tags(action);
      if (known === null) {
        if (!warnedUnresolved.has(action)) {
          warnedUnresolved.add(action);
          out.push({
            rule: "action_tags_unresolved",
            entry: entry.name,
            severity: "warn",
            registrySide: `.github/workflows/${wf} pins \`${ref}\``,
            otherSide: `tags for ${action} are unresolvable here (no gh / offline / not in ingest/tools/action-tags.json)`,
            fix: "Fail-open: run `bun ingest/tools/check-registry-identity.mts --refresh-tags` to update the maintained allowlist.",
          });
        }
        continue;
      }
      const exact = known.includes(pin);
      const major = majorOf(pin);
      const floating = major !== null && known.some((t) => t.startsWith(`v${major}.`));
      if (!exact && !floating) {
        out.push({
          rule: "action_version_unresolvable",
          entry: entry.name,
          severity: "red",
          registrySide: `.github/workflows/${wf} pins \`${ref}\``,
          otherSide: `live tags for ${action} are [${known.slice(0, 6).join(", ")}…] — nothing resolves \`${pin}\``,
          fix: "ACTION_VERSION — repin to a tag that exists. (Resolved against live tags, never a baked literal.)",
        });
        continue;
      }
      const latestMajor = known
        .map((t) => Number(majorOf(t) ?? -1))
        .reduce((a, b) => Math.max(a, b), -1);
      if (major !== null && latestMajor > Number(major)) {
        out.push({
          rule: "action_major_behind",
          entry: entry.name,
          severity: "warn",
          registrySide: `.github/workflows/${wf} pins \`${ref}\` (resolves — GREEN)`,
          otherSide: `latest major for ${action} is v${latestMajor}`,
          fix:
            "Advisory ONLY. Tag-exists != compatible — do NOT mass-bump. (checkout v7 blocks fork-PR " +
            "checkout on workflow_run, which 4 of our workflows use, and moved to ESM.)",
        });
      }
    }
  }
  return out;
}

/**
 * The identity column is `source_name`. check_freshness.py scopes BOTH the
 * freshness MAX() (:238) and the volume COUNT(*) (:382) on `WHERE source_name = %s`.
 * `source_tag` is read by NOTHING in ingest/scripts/ or ingest/lib/ — the registry's
 * one source_tag: field (news_swfl -> news_crawl) is a phantom with no code literal.
 * That is the exact class that false-REDded daily_truth for two weeks.
 */
export function checkIdentityFields(reg: Registry, repo: RepoView): Finding[] {
  const out: Finding[] = [];

  for (const ex of reg.coverage_exempt ?? []) {
    if (!ex?.table || !ex?.reason) {
      out.push({
        rule: "malformed_annotation",
        entry: ex?.table ?? "coverage_exempt[?]",
        severity: "red",
        registrySide: `coverage_exempt entry ${JSON.stringify(ex)}`,
        otherSide: "requires both `table:` and `reason:` — a bare table name is a silent exemption",
        fix: "Give every exemption a stated reason (brain_writeback / runtime_cache / static_seed / derived_snapshot).",
      });
    }
  }

  for (const { entry } of allEntries(reg)) {
    for (const kd of entry.known_drift ?? []) {
      if (!kd?.rule || !kd?.check) {
        out.push({
          rule: "malformed_annotation",
          entry: entry.name,
          severity: "red",
          registrySide: `known_drift entry ${JSON.stringify(kd)}`,
          otherSide: "requires both `rule:` and `check:` (an OPEN key in the `checks` ledger)",
          fix: 'RULE 2.4 — no silent deferrals. `node scripts/check.mjs open <project> <key> "<label>"`, then name that key here.',
        });
      }
    }

    if (entry.source_tag !== undefined) {
      out.push({
        rule: "source_tag_field_forbidden",
        entry: entry.name,
        severity: "red",
        registrySide: `entry declares \`source_tag: ${entry.source_tag}\``,
        otherSide:
          "nothing in ingest/scripts/ or ingest/lib/ reads source_tag — check_freshness.py scopes on " +
          "source_name (:238 freshness MAX, :382 volume COUNT). The field is a phantom.",
        fix:
          "SCHEMA_NAME_DRIFT — delete `source_tag:`. If the writer really stamps a discriminator, " +
          "declare it as `source_name:` AND confirm the target table has that column (--live).",
      });
    }

    if (entry.source_name !== undefined) {
      const { existing } = producingDirs(entry, repo);
      if (existing.length === 0) continue; // zombie — rule B owns it
      const srcs = existing.flatMap((d) => repo.pyFiles(d)).map((f) => repo.read(f) ?? "");
      const lit = entry.source_name;
      if (!srcs.some((s) => s.includes(`"${lit}"`) || s.includes(`'${lit}'`))) {
        out.push({
          rule: "source_name_literal_absent",
          entry: entry.name,
          severity: "red",
          registrySide: `entry declares \`source_name: ${lit}\` (the probe scopes every query on it)`,
          otherSide: `no such literal anywhere in ${existing.join(", ")}`,
          fix:
            "SCHEMA_NAME_DRIFT — a one-letter drift here makes every freshness/volume query match ZERO " +
            "rows and the source false-REDs forever. Align the registry value with the writer's literal.",
        });
      }
    }
  }
  return out;
}

export function runStaticChecks(reg: Registry, repo: RepoView, tags: TagResolver): Finding[] {
  // Every rule is independently fail-open: a thrown rule degrades to a WARN and
  // never flips the exit code (same contract as pre-push Gate 2/5).
  const rules: Array<[string, () => Finding[]]> = [
    ["workflow_liveness", () => checkWorkflowLiveness(reg, repo)],
    ["producer", () => checkProducer(reg, repo)],
    ["secrets", () => checkSecretsWired(reg, repo)],
    ["timeouts", () => checkTimeouts(reg, repo)],
    ["action_versions", () => checkActionVersions(reg, repo, tags)],
    ["identity_fields", () => checkIdentityFields(reg, repo)],
  ];
  const out: Finding[] = [];
  for (const [name, fn] of rules) {
    try {
      out.push(...fn());
    } catch (err) {
      out.push({
        rule: "rule_crashed",
        entry: name,
        severity: "warn",
        registrySide: `static rule \`${name}\``,
        otherSide: `threw: ${(err as Error)?.message ?? err}`,
        fix: "Fail-open: this rule was skipped, not passed. Fix the tool.",
      });
    }
  }
  return out;
}

/** A RED becomes a WARN only when the entry names it in known_drift with an OPEN checks key. */
export function applyKnownDrift(
  reg: Registry,
  findings: Finding[],
): { blocking: Finding[]; suppressed: Finding[] } {
  const map = new Map<string, string>();
  for (const { entry } of allEntries(reg)) {
    for (const kd of entry.known_drift ?? []) {
      if (kd?.rule && kd?.check) map.set(`${entry.name}:${kd.rule}`, kd.check);
    }
  }
  const blocking: Finding[] = [];
  const suppressed: Finding[] = [];
  for (const f of findings) {
    const check = map.get(`${f.entry}:${f.rule}`);
    if (f.severity === "red" && check) {
      suppressed.push({
        ...f,
        severity: "warn",
        fix: `KNOWN DRIFT — tracked by check \`${check}\`. ${f.fix}`,
      });
    } else if (f.severity === "red") {
      blocking.push(f);
    } else {
      suppressed.push(f);
    }
  }
  return { blocking, suppressed };
}
