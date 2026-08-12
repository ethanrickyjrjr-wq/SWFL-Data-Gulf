// scripts/lib/watch-manifest.mjs
//
// ONE AUTHORITY for "what does this repo schedule, and what must the watchers +
// tripwire know about each workflow". Three consumers: the two watcher YAMLs
// (codegen), scripts/tripwire-scan.mjs, and (Phase 3c) doctor.
//
// PURE — every export is a function of its arguments. No fs, no gh, no network.
// The impure edges (readdir, `gh api`) live in scripts/build-watch-lists.mjs.
//
// WHY CODEGEN AND NOT A WILDCARD: `on.workflow_run.workflows:` takes EXACT
// workflow `name:` strings and has NO glob support. Live-verified 2026-07-11 —
// GitHub documents glob for `branches:`/`paths:` INSIDE the same workflow_run
// block and pointedly omits it for `workflows:`.
// Evidence: docs/audit/2026-07-11-pipeline-problems/08g-vendor-gha-facts.md Fact 3.

export const MANIFEST_PATH = ".github/_watch-manifest.json";

// Hand-declared INTENT. Everything else in the manifest is derived from the files.
// Keyed by workflow filename; the value is the reason (printed in tripwire output).
export const SHOULD_BE_DARK = {
  "corridor-pulse-weekly.yml":
    "PAUSED 07/05/2026 (operator decree, ingest/CLAUDE.md): no paid model web_search on a schedule. crawl4ai retrofit first, re-enable second.",
  // dbpr-sirs + crexi both run on the self-hosted `swfl-local` runner, which is OFFLINE
  // (0 runners registered). Their schedules would queue against the missing runner and fail
  // after 24h, so both are `disabled_manually` — a shared root, tracked in one check.
  "dbpr-sirs-monthly.yml":
    "TEMPORARILY DARK 07/18/2026: needs the offline self-hosted `swfl-local` runner (0 registered) — scheduled monthly SIRS pulls just queue and fail. Shared runner root: check `swfl_local_runner_offline_dark_sources`. darkDrift flags any re-enable (bring the runner up, then drop this entry).",
  "ingest-crexi-listings.yml":
    "TEMPORARILY DARK 07/18/2026: same offline `swfl-local` runner as dbpr-sirs — the workflow header itself directs keeping it disabled while the runner is unregistered (weekly cron would queue against a missing runner and fail after 24h). Shared runner root: check `swfl_local_runner_offline_dark_sources`. darkDrift flags any re-enable.",
  "daily-email-digest.yml":
    "KILLED 07/16/2026 (operator): disabled after crime news shipped in a send; the City Voices gate now drops crime/courts/disaster items. NEVER re-enable without Ricky — darkDrift makes any re-enable loud.",
  "chief-of-staff-nightly.yml":
    "KILLED 08/06/2026 (operator ran the disable himself; API reads `disabled_manually`). It was a `claude-code-action` job that hit its 30-turn ceiling and died on EVERY run 08/02-08/06 — verbatim `Reached maximum number of turns (30)` — burning a full PAID agent budget (~12 min wall clock) nightly for three weeks and writing nothing. Its failure defect `cron_incident_chief_of_staff_nightly` had been open since due Jul 17, and `morning_brief_no_consumer` separately recorded that the brief has ZERO human engagement even when it succeeds. Red daily + unread when green = pure noise on a paid meter. NEVER re-enable without Ricky AND without first fixing the turn ceiling; darkDrift makes any re-enable loud.",
};

// Scheduled workflows the two watchers deliberately do NOT watch.
export const WATCH_EXEMPT = {
  "tripwire-hourly.yml":
    "Self-reporting alarm: it opens its own `TRIPWIRE RED` issue and then `exit 1`s by design (tripwire-hourly.yml:47-62). Watching it would open a duplicate cron-incident issue + check every hour it is RED.",
  "doc-ratchet-daily.yml":
    "RED IS THE PRODUCT, not a cron failure. `doc-ratchet.mjs check` exits 1 by design when the orphan count has NOT fallen — stagnation is the failure state (scripts/CLAUDE.md; doc-ratchet-daily.yml:9-12). Same shape as tripwire-hourly, s/hour/day/: watching it appends a `docs/cron-rebuild-failures.md` row + sticky-issue comment EVERY DAY we have not deleted an orphan, flooding the one ledger that is supposed to mean `a scheduled job broke`. Exempting here also drops it from the healer (healWatchNames derives from loggerWatchNames), which matters more: the check is DETERMINISTIC over the working tree, so an auto-re-run 30s later returns the identical red — the exact waste CI/factuality-gate are heal-excluded for. Its red stays visible on the Actions board + its own `::error::` annotation. NOT self-reporting like tripwire — that gap is tracked in `doc_ratchet_red_is_board_only`.",
};

// Watched by the logger, never auto-healed. Keyed by workflow NAME (the watcher lists
// are name-keyed). Kept in lockstep with .github/scripts/trigger-list-drift.test.mjs's
// EXCLUDED list — that test is the drift guard on this very set.
//   Daily Brain Rebuild   — owns refinery/lib/master-freeze-watchdog.mts + the vocab
//                           pre-push gate; must never be auto-healed. Its cron retired
//                           07/12/2026 (nightly-chain cutover), so it left the watch
//                           lists — the entry stays as defense in depth if the cron
//                           ever returns.
//   Nightly Chain         — CONTAINS the rebuild (and the paid SteadyAPI sweep + the
//                           Anthropic bake) as called workflows. Its own YAML never
//                           matches the `paid` regex (secrets: inherit — no literal
//                           key string), so autoRetryAllowed() alone would NOT stop
//                           an L0 rerun; this exclusion is what does. An auto-heal of
//                           the chain would auto-heal the rebuild, defeating the
//                           Daily Brain Rebuild exclusion above.
//   Chief of staff nightly — propose-only Sonnet workflow with its own kill switch
//                           (CHIEF_OF_STAFF_ENABLED); an L0 auto-rerun is an unattended
//                           paid LLM call. Its plan (2026-07-10 Task 5) wires the
//                           incident LOGGER only, never the healer.
//   CI / factuality-gate / deptry — push-triggered (WATCH_PUSH_TRIGGERED above).
//                           LOG only, NEVER heal. An auto-rerun of a red CI cannot
//                           fix a deterministic compile or test failure; it only
//                           burns minutes and, worse, a flake that passes on retry
//                           makes a real red look transient — the exact way 42 reds
//                           stayed invisible.
export const HEAL_EXCLUDED_NAMES = [
  "Daily Brain Rebuild",
  "Nightly Chain",
  "Chief of staff nightly",
  "CI",
  "factuality-gate",
  "deptry",
];
/** @deprecated back-compat alias; use HEAL_EXCLUDED_NAMES. */
export const HEAL_EXCLUDED_NAME = HEAL_EXCLUDED_NAMES[0];

// A re-run of these re-fires a send. Never auto-retry, regardless of failure class.
export const SEND_SIDE_EFFECT = {
  "daily-email-digest.yml": "a re-run can re-send subscriber email",
  "email-scheduler.yml": "a re-run can re-send scheduled campaigns",
};

/** Parse ONE workflow file's text into a manifest entry. Pure. */
export function parseWorkflow(file, text) {
  const lines = text.split(/\r?\n/);

  const nameMatch = text.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  const name = nameMatch ? nameMatch[1].trim() : null;

  // scheduled = at least one UNCOMMENTED `- cron:` line. `# - cron: "0 10 * * 0"`
  // (corridor-pulse-weekly.yml:12) never fires, so the leading `#` must lose.
  const scheduled = lines.some((l) => /^\s*-\s*cron:/.test(l));

  // Max job timeout. GHA kills a run when ANY job hits ITS OWN ceiling, so a scalar
  // is only sound while a workflow's jobs share one value — true for every SCHEDULED
  // workflow today (only heal-cron-failure.yml carries 3 distinct values, and it is
  // workflow_run-triggered, never scheduled). null = not declared: we do NOT assume
  // GitHub's default ceiling, and classifyTermination degrades to UNKNOWN_CANCEL.
  const timeouts = [...text.matchAll(/^\s+timeout-minutes:\s*(\d+)/gm)].map((m) => Number(m[1]));
  const timeout_minutes = timeouts.length ? Math.max(...timeouts) : null;

  const cancel_in_progress = /^\s*cancel-in-progress:\s*true\b/m.test(text);

  // PAID = the workflow actually passes the key into a step `env:`. A bare
  // /ANTHROPIC_API_KEY/ substring test false-positives on the two comments that
  // exist to say the workflow does NOT spend — tripwire-hourly.yml:9 and
  // weekly-read.yml:8 both literally read "No ANTHROPIC_API_KEY here". That bare
  // test is the live bug in scripts/tripwire-scan.mjs:54, which Task 5 replaces.
  const paid = /\$\{\{\s*secrets\.ANTHROPIC_API_KEY\s*\}\}/.test(text);

  return {
    name,
    file,
    scheduled,
    timeout_minutes,
    cancel_in_progress,
    paid,
    should_be_dark: Object.hasOwn(SHOULD_BE_DARK, file),
    disabled: null, // observed GitHub API state; filled by buildManifest(files, states)
  };
}

/**
 * @param {{file:string,text:string}[]} files
 * @param {Record<string,string>} [states]  workflow PATH -> gh api `state` ("active" | "disabled_manually" | ...)
 * @param {Record<string,boolean|null>} [prior]  workflow FILE -> previously observed `disabled`
 */
export function buildManifest(files, states = {}, prior = {}) {
  const entries = files
    .map(({ file, text }) => parseWorkflow(file, text))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  for (const e of entries) {
    const p = `.github/workflows/${e.file}`;
    if (Object.hasOwn(states, p))
      e.disabled = states[p] !== "active"; // disabled_manually OR disabled_inactivity
    else if (Object.hasOwn(prior, e.file)) e.disabled = prior[e.file]; // a plain rebuild never wipes observed state
  }
  return entries;
}

/** Loud, never silent. Returns a list of problems; [] means sane. */
export function assertManifestSane(entries) {
  const problems = [];
  const seen = new Map();
  for (const e of entries) {
    if (!e.name) {
      problems.push(
        `${e.file}: no top-level \`name:\` — \`workflow_run.workflows:\` is name-keyed and cannot reference it.`,
      );
      continue;
    }
    if (seen.has(e.name)) {
      problems.push(
        `duplicate workflow name "${e.name}" in ${seen.get(e.name)} and ${e.file} — \`workflow_run.workflows:\` cannot disambiguate two workflows with one name.`,
      );
    }
    seen.set(e.name, e.file);
    if (e.scheduled && e.timeout_minutes === null) {
      problems.push(
        `${e.file}: scheduled but declares no \`timeout-minutes:\` — classifyTermination cannot detect a TIMEOUT kill without a ceiling.`,
      );
    }
  }
  const scheduled = entries.filter((e) => e.scheduled).length;
  if (entries.length > 20 && scheduled < 60) {
    problems.push(
      `only ${scheduled} scheduled workflows parsed out of ${entries.length} files — the cron parser is probably broken (82 were scheduled on 07/11/2026).`,
    );
  }
  return problems;
}

// Push-triggered workflows the logger ALSO watches. `scheduled` (an uncommented
// `- cron:`) is the right filter for cron health but it silently excluded the one
// signal that says main is broken: CI sat RED for 42 consecutive runs, 08/02–08/04
// 2026, and surfaced only because the operator asked. The alarm existed and main
// was simply not plugged into it.
//
// This is an ALLOW-LIST, never a "watch everything unscheduled" rule — most
// workflow_run/dispatch-only workflows are helpers whose failures are already
// reported by the job that called them.
//
// Two couplings that make this more than a name list, both live-verified:
//   1. `maybe_auto_resolve` in log-cron-incident.yml is gated on
//      `event == 'schedule'`. Without widening it to `push`, every red would open
//      a ledger row + sticky-issue comment that NEVER closes — 42 permanent rows
//      from this one incident.
//   2. healWatchNames() derives from THIS function, so anything added here would
//      be auto-re-run on failure. Auto-rerunning CI would mask real red and burn
//      minutes on a deterministic compile error, so all three are also listed in
//      HEAL_EXCLUDED_NAMES below. Log, never heal.
export const WATCH_PUSH_TRIGGERED = {
  "ci.yml": "CI",
  "factuality-gate.yml": "factuality-gate",
  "deptry.yml": "deptry",
};

export function loggerWatchNames(entries) {
  const pushWatched = entries
    .filter((e) => !e.scheduled && Object.hasOwn(WATCH_PUSH_TRIGGERED, e.file))
    .map((e) => e.name);
  return entries
    .filter((e) => e.scheduled && !Object.hasOwn(WATCH_EXEMPT, e.file))
    .map((e) => e.name)
    .concat(pushWatched)
    .sort(); // default (code-unit) sort — deterministic on every platform, unlike localeCompare
}

export function healWatchNames(entries) {
  return loggerWatchNames(entries).filter((n) => !HEAL_EXCLUDED_NAMES.includes(n));
}

/**
 * Replace the `workflows:` item block in a watcher YAML, in place.
 * HARD CONSTRAINT: emit ONLY `- "Name"` lines. The existing parser at
 * .github/scripts/trigger-list-drift.test.mjs:27 stops at the first non-item line,
 * so an interspersed comment would silently truncate the watched set.
 */
export function rewriteWorkflowList(yamlText, names) {
  for (const n of names) {
    if (n.includes('"'))
      throw new Error(`workflow name contains a double quote, cannot emit: ${n}`);
  }
  const lines = yamlText.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*workflows:\s*$/.test(l));
  if (start === -1) throw new Error("no `workflows:` key found in this YAML");
  let end = start + 1;
  while (end < lines.length && /^\s*-\s*".*"\s*$/.test(lines[end])) end++;
  const indent = " ".repeat(lines[start].match(/^\s*/)[0].length + 2);
  const block = names.map((n) => `${indent}- "${n}"`);
  return [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join("\n");
}

/**
 * ZOMBIE_CRON — disabled at the GitHub API while an UNCOMMENTED cron still sits in
 * source. Both the registry and the YAML claim it is scheduled; the freshness probe
 * expects fresh rows; `gh workflow enable` resumes it instantly with no code-level
 * guard. Phase 2 CANNOT see this class (`--static` reads files, `--live` reads
 * data_lake; neither reads workflow state) — this manifest is the only artifact that
 * can. Live 07/11/2026: 4 members, orphaning 6 registry entries (08e §1, 08h §3).
 *
 * `should_be_dark` DELIBERATELY DOES NOT EXEMPT (corrected 08/12/2026). It used to:
 * `&& !e.should_be_dark` treated a written-down reason as if it were a guard. It is not.
 * A SHOULD_BE_DARK entry says "we meant to disable this"; a commented-out cron says
 * "and it cannot come back by accident." Those are independent, and the one that
 * actually holds is the cron. chief-of-staff-nightly.yml proved it: KILLED 08/06/2026
 * on a paid claude-code-action that died on its 30-turn ceiling nightly, declared dark,
 * and printed GREEN by tripwire while `- cron: "47 8 * * *"` sat live in source — one
 * `gh workflow enable` from resuming the burn. corridor-pulse-weekly.yml is the shape
 * we want: declared dark AND cron commented out, so it is a zombie under neither test.
 */
export function zombieCrons(entries) {
  return entries.filter((e) => e.scheduled && e.disabled === true);
}

/** A workflow we DECLARED dark that is ENABLED at the API — what checkPulseDark exists to catch. */
export function darkDrift(entries) {
  return entries.filter((e) => e.should_be_dark && e.disabled === false);
}

/** MONEY GUARD. A re-run of a paid workflow re-spends; a re-run of a sender re-sends. */
export function autoRetryAllowed(entry) {
  if (!entry) return false; // unknown workflow -> never retry
  if (entry.paid) return false;
  if (Object.hasOwn(SEND_SIDE_EFFECT, entry.file)) return false;
  return true;
}
