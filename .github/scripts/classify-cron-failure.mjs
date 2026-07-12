// Shared classifier for cron-workflow failures.
//
//   classify(logTail) -> { klass, signal, suggestedAction }
//
// Pure + deterministic (regex only). UNKNOWN routes to the LLM narrative in the
// heal workflow; every other class carries a deterministic suggestedAction.
// Imported by BOTH log-cron-incident.mjs (fills the ledger Root Cause + issue body)
// and heal-cron-failure.mjs (routes to L0 retry / L2 diagnose).
//
// Spec: docs/superpowers/specs/2026-06-08-leveled-cron-self-healing-design.md

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// import-name -> PyPI package. Data, not code (widen breadth by editing the JSON).
const IMPORT_MAP = (() => {
  try {
    const raw = JSON.parse(readFileSync(resolve(HERE, "pypi-import-map.json"), "utf8"));
    delete raw._comment;
    return raw;
  } catch {
    return {};
  }
})();

// Common stdlib top-level names — a ModuleNotFoundError on one of these means a
// broken Python env / wrong version, NOT a missing pip package.
const STDLIB = new Set(
  "os sys json re math time datetime collections itertools functools pathlib typing subprocess logging csv io abc dataclasses enum hashlib base64 urllib http sqlite3 asyncio random string decimal uuid traceback warnings contextlib shutil tempfile glob argparse configparser unittest threading queue socket ssl gzip zipfile pickle copy inspect operator".split(
    " ",
  ),
);

/**
 * Classify a failed-run log tail into a deterministic failure class.
 * @param {string} logTail
 * @returns {{ klass: string, signal: string, suggestedAction: string }}
 */
export function classify(logTail) {
  const text = logTail || "";
  let m;

  // 1. LOCKFILE — repo-specific recurring breaker (bun.lock drift vs frozen CI install).
  if (/lockfile had changes, but lockfile is frozen/i.test(text)) {
    return {
      klass: "LOCKFILE",
      signal: "bun.lock drift",
      suggestedAction:
        "Run `bun install` locally and commit the updated `bun.lock` in the same push (CI runs `bun install --frozen-lockfile`). See CLAUDE.md RULE 1 breaker #1.",
    };
  }

  // 2. ACTION_VERSION — a pinned GitHub Action version that doesn't exist.
  m = text.match(/(actions\/[\w.-]+@v?[\w.-]+)/i);
  if (
    m &&
    /(?:not\s*(?:found|exist)|nonexistent|Unable to resolve action|Can't find|unable to find version)/i.test(
      text,
    )
  ) {
    return {
      klass: "ACTION_VERSION",
      signal: m[1],
      suggestedAction: `Workflow pins \`${m[1]}\`, which doesn't exist. Bump it to a real released version of that action.`,
    };
  }

  // 3. BILLING — Anthropic credit/billing exhaustion (HTTP 402 `billing_error`).
  //    A credit-exhausted org 402s every messages call, so every AI brain HOLDs
  //    platform-wide during a scheduled-send window. The distinctive signal is the
  //    error body's literal `billing_error` type token (or the "credit balance is
  //    too low" human message) — verified against docs.claude.com/en/api/errors
  //    (2026-07-04): it is HTTP 402, NOT a 400. Placed before DETERMINISTIC_HOLD (a
  //    402 is tagged `failureClass=deterministic` upstream by resilient-build, so it
  //    would otherwise mis-bucket as a master HOLD with useless "reconcile sources[]"
  //    advice) and before TRANSIENT (retry/timeout noise often precedes the 402).
  if (/\bbilling_error\b|credit balance is too low|\binsufficient[ _]?credit\b/i.test(text)) {
    return {
      klass: "BILLING",
      signal: "anthropic billing_error (402)",
      suggestedAction:
        "Anthropic credit/billing exhaustion (HTTP 402 `billing_error`) — every AI brain HOLDs platform-wide until credits are restored. Top up credits at platform.claude.com (Billing/Plans). This is a payment problem, not a code, dependency, or pipeline-wiring problem — do not retry or reconcile packs.",
    };
  }

  // 4. MISSING_DEP — a Python import of a package that isn't installed.
  m = text.match(/ModuleNotFoundError: No module named ['"]([\w][\w.]*)['"]/);
  if (m) {
    const mod = m[1];
    return { klass: "MISSING_DEP", signal: mod, suggestedAction: depFix(mod) };
  }

  // 5. MISSING_SECRET — env var / credential absent. Must look like an ENV name (UPPER_SNAKE).
  m =
    text.match(
      /missing required env var\(s\)[^:]*:\s*([A-Z][A-Z0-9_]+(?:\s*,\s*[A-Z][A-Z0-9_]+)*)/,
    ) ||
    text.match(/KeyError:\s*['"]([A-Z][A-Z0-9_]{2,})['"]/) ||
    text.match(/\b([A-Z][A-Z0-9_]{2,})\s+not set\b/) ||
    text.match(/\bmissing[:,]?\s+([A-Z][A-Z0-9_]{2,})\b/);
  if (m) {
    const first = m[1].split(",")[0].replace(/\s+/g, "");
    const all = m[1].replace(/\s+/g, " ").trim();
    return {
      klass: "MISSING_SECRET",
      signal: all,
      suggestedAction: `Secret \`${first}\` is not reaching the pipeline. Confirm it's set (\`gh secret set ${first}\`) AND wired into this workflow's \`env:\` block — both steps are required (CLAUDE.md RULE 1 breaker #3 / "Secret wired in repo but not passed to workflow").`,
    };
  }

  // 6. SCHEMA_DRIFT — vocab orphan / missing relation or column / Postgres column
  //    type drift (DatatypeMismatch) / failed render validation / stale alias.
  m = text.match(
    /(Orphan Concept[^\n]*|relation ["'][\w.]+["'] does not exist|column ["'][\w.]+["'] does not exist|column ["']?[\w.]+["']? is of type [^\n]+? but expression is of type [\w ]+|[^\n]*failed validation[^\n]*|CORRIDOR_ALIASES[^\n]*)/i,
  );
  if (m) {
    return {
      klass: "SCHEMA_DRIFT",
      signal: m[1].slice(0, 120).trim(),
      suggestedAction:
        "Schema/vocab drift — a slug, relation, or column the pipeline expects no longer matches the lake or the vocab. Needs a human: register the slug in `refinery/vocab/brain-vocabulary.json`, add the versioned DDL, or sync the alias map. Run `bun refinery/tools/check-vocab-coverage.mts --all` if vocab-related.",
    };
  }

  // 7. DETERMINISTIC_HOLD — master held / a brain's brains/<id>.md missing. Root:
  //    a pack lists a brain in `sources[]` but not `input_brains[]`, so the DAG
  //    resolver never builds it → deterministic master HOLD (the 06-18 flap).
  //    Surfaced by build 02's `CRON-DIAG failureClass=deterministic …` echo and/or
  //    the raw `_build-report.json`. Deterministic: never auto-retry, no LLM.
  // Two arms only: the `failureClass=deterministic` token build 02's formatCronDiag
  // emits (also matches the raw `"failureClass": "deterministic"` in _build-report.json),
  // and the literal `brains/<id>.md not found` thrown by brain-input-source. A 3rd
  // generic-`.md not found` arm was dropped — it false-matched benign lines
  // (CHANGELOG.md, docs/guide.md) and was already covered by the `brains/` arm.
  m = text.match(/("?failureClass"?\s*[:=]\s*"?deterministic\b|brains\/[\w.-]+\.md not found)/i);
  if (m) {
    return {
      klass: "DETERMINISTIC_HOLD",
      signal: m[1].slice(0, 120).trim(),
      suggestedAction:
        "Master held — a brain in a pack's `sources[]` is missing from its `input_brains[]` (or its `brains/<id>.md` was never built), so the DAG resolver never built it → deterministic HOLD. Reconcile the two lists; the load-time invariant in `refinery/config/packs.mts` (Phase-1 build 05) now blocks this drift. Do NOT auto-retry.",
    };
  }

  // 8. CONTENT_STALE — an ingest content-freshness guard tripped (ingest.lib.guards
  //    assert_content_fresh -> ContentStaleError). The run was LOAD-fresh (dlt wrote a
  //    _dlt_loads row) but the newest CONTENT date stalled past the pipeline's gating
  //    threshold, or the fetched batch carried no dated rows. A stalled-source / broken-scrape
  //    signal — NOT transient, and distinct from DATA_EMPTY (a true 0-row pull). Placed before
  //    DATA_EMPTY so the guard's own error wins. Never auto-retry: a retry re-merges the stale window.
  if (/\bContentStaleError\b|\[content-guard\]/.test(text)) {
    return {
      klass: "CONTENT_STALE",
      signal: "content-freshness guard tripped",
      suggestedAction:
        "An ingest content-freshness guard tripped — the run was LOAD-fresh (dlt wrote a load row) but the newest content date has stalled past the pipeline's gating threshold (or the batch carried no dated rows). The source or scraper stopped advancing: check the source URL/feed, the scrape window/cursor, and any WAF or region-filter change. Do NOT auto-retry — a retry re-merges the same stale content.",
    };
  }

  // 9. DATA_EMPTY — source returned nothing (dead/changed URL, WAF, async job not polled).
  m = text.match(
    /\b(0 rows|0 permits?|0 decisions|0 URLs?|0 records|no rows|returned 0|empty (?:HTML|response|result)|0 \w+ (?:discovered|returned|loaded))\b/i,
  );
  if (m) {
    return {
      klass: "DATA_EMPTY",
      signal: m[1].trim(),
      suggestedAction:
        "Source returned no data — likely a dead/changed URL, a new WAF block, or an async job whose result wasn't polled. Needs a human to re-point or re-scrape the source. If un-scrapable, consider the Operation Dumbo Drop scaffold.",
    };
  }

  // 10. TRANSIENT — network / timeout / rate-limit; usually self-resolves on retry.
  if (
    /ReadTimeout|TimeoutError|ConnectTimeout|Connection error|socket connection was closed|UNEXPECTED_EOF_WHILE_READING|SSL[: ][^\n]*EOF|HTTP 429|\b429\b|rate.?limit|Temporary failure in name resolution|Connection reset|ECONNRESET|ETIMEDOUT|EAI_AGAIN|Max retries exceeded/i.test(
      text,
    )
  ) {
    const t = text.match(
      /ReadTimeout|TimeoutError|Connection error|socket connection was closed|UNEXPECTED_EOF_WHILE_READING|429|Connection reset|ECONNRESET|ETIMEDOUT/i,
    );
    return {
      klass: "TRANSIENT",
      signal: t ? t[0] : "network",
      suggestedAction:
        "Transient network/timeout/rate-limit — usually self-resolves. Auto-retried once; if it recurs the upstream API may be down or throttling (space dispatches out).",
    };
  }

  // 11. UNKNOWN — unrecognised shape; route to the LLM narrative.
  return {
    klass: "UNKNOWN",
    signal: "",
    suggestedAction: "Unrecognised failure shape — needs diagnosis.",
  };
}

function depFix(mod) {
  const top = mod.split(".")[0];
  if (STDLIB.has(top)) {
    return `\`${mod}\` is a Python standard-library module — a bare ModuleNotFoundError here usually means a wrong Python version or a corrupted env, NOT a missing package. Check this workflow's Python setup.`;
  }
  const pypi = IMPORT_MAP[top] || IMPORT_MAP[mod];
  if (pypi) {
    return `Add \`${pypi}\` to \`ingest/requirements.txt\` (import name \`${top}\` → PyPI package \`${pypi}\`), then commit. Confirm it isn't a local-module import bug first.`;
  }
  return `\`${mod}\` is missing. If third-party, add it to \`ingest/requirements.txt\` (verify the exact PyPI name — it can differ from the import name). If it's a local module, this is an import-path bug, not a missing dependency.`;
}

/**
 * fs-backed guard (NOT pure): does this import name correspond to a local module
 * in the repo? If so, a MISSING_DEP is really an import-path bug, and we must not
 * suggest adding it to requirements.txt (dependency-confusion-safe).
 */
export function isLocalModule(mod, repoRoot = process.cwd()) {
  const top = mod.split(".")[0];
  return [
    `ingest/pipelines/${top}`,
    `ingest/lib/${top}`,
    `ingest/${top}.py`,
    `ingest/lib/${top}.py`,
    `ingest/pipelines/${top}.py`,
  ].some((c) => existsSync(resolve(repoRoot, c)));
}

// A freshness probe going red is a real stale-data signal — never auto-retry it.
export function isFreshnessProbe(workflowName) {
  return workflowName === "freshness-probe-daily";
}

// L0 retry applies only to transient failures.
export function shouldRetry(klass) {
  return klass === "TRANSIENT";
}

// L2 LLM narrative applies to the fuzzy classes (deterministic ones are handled by the logger).
export function needsLlm(klass) {
  return klass === "DATA_EMPTY" || klass === "SCHEMA_DRIFT" || klass === "UNKNOWN";
}

// ---------------------------------------------------------------------------
// TERMINATION classifier — the classes the watchers used to drop on the floor.
//
// THE VENDOR FACT THIS RESTS ON: a job that hits its `timeout-minutes` ceiling
// surfaces at the RUN level as conclusion `cancelled`, NOT `timed_out`. Proven on
// this repo — corridor-pulse-weekly runs 27903898570 (06/21), 28321195281 (06/28)
// and 28739416924 (07/05) are each event=schedule, conclusion=cancelled, ~45.3 min
// wall clock against the 45-minute ceiling then in force. The workflow's own comment
// records the kills (corridor-pulse-weekly.yml:31-36). A gate that only admits
// `conclusion == 'failure'` — which is exactly what both watchers did — is blind to
// all three, which is how a full paid web_search sweep burned three times with zero
// rows kept and no incident.
//
// PURE. The gh lookup for `hasNewerRun` lives in lib/cron-run.mjs and is only
// consulted when the workflow actually declares `cancel-in-progress` — no scheduled
// workflow does today, so it costs nothing in prod.

/** A run within this fraction of its ceiling was killed by it, not by chance. */
export const TIMEOUT_RATIO = 0.95;

/**
 * @param {{conclusion:string,event:string,run_started_at?:string,updated_at?:string}} run
 * @param {{file:string,timeout_minutes:number|null,cancel_in_progress:boolean}|null} wf manifest entry
 * @param {boolean} hasNewerRun
 * @returns {{klass:string,reason:string,should_retry:boolean|null,prescription:string,elapsed_minutes:number|null,timeout_ratio:number|null}}
 */
export function classifyTermination(run, wf, hasNewerRun = false) {
  const file = wf?.file || (run.path || "").split("/").pop() || "unknown workflow";
  const ceiling = wf?.timeout_minutes ?? null;

  const started = run.run_started_at ? Date.parse(run.run_started_at) : NaN;
  const ended = run.updated_at ? Date.parse(run.updated_at) : NaN;
  const elapsed =
    Number.isFinite(started) && Number.isFinite(ended) && ended >= started
      ? Math.round(((ended - started) / 60000) * 100) / 100
      : null;
  const ratio =
    elapsed !== null && ceiling ? Math.round((elapsed / ceiling) * 10000) / 10000 : null;
  const base = { elapsed_minutes: elapsed, timeout_ratio: ratio };

  // A `failure` keeps its existing home: the log-tail classify() decides the class
  // and shouldRetry() decides the retry. Not this function's call.
  if (run.conclusion === "failure") {
    return { klass: "FAILURE", reason: "", should_retry: null, prescription: "", ...base };
  }

  if (run.conclusion !== "cancelled" && run.conclusion !== "timed_out") {
    return {
      klass: "OTHER",
      reason: `conclusion=${run.conclusion} — not a termination class`,
      should_retry: false,
      prescription: "",
      ...base,
    };
  }

  // Scope the cancelled path to SCHEDULED runs. A cancelled dispatch is a human
  // pressing stop (3 of leepa's 4 cancels), not a pipeline incident.
  if (run.event !== "schedule") {
    return {
      klass: "OTHER",
      reason: `conclusion=${run.conclusion} on a ${run.event} run — out of scope (only scheduled runs raise a termination incident)`,
      should_retry: false,
      prescription: "",
      ...base,
    };
  }

  const timeoutRx =
    `Run hit its ceiling: ${elapsed ?? "?"} min elapsed against \`timeout-minutes: ${ceiling ?? "?"}\` in ` +
    `${file}${ratio !== null ? ` (${Math.round(ratio * 100)}% of the ceiling)` : ""}. ` +
    `Raise \`timeout-minutes\` in ${file} or shorten the job. DO NOT RE-RUN: the run already spent its full budget — ` +
    `corridor-pulse burned three consecutive 45-minute kills (06/21, 06/28, 07/05) at full API spend and kept zero rows.`;

  // GitHub's own timed_out conclusion needs no ceiling math.
  if (run.conclusion === "timed_out") {
    return {
      klass: "TIMEOUT",
      reason: `GitHub reported \`timed_out\` for ${file}. ${timeoutRx}`,
      should_retry: false, // MONEY GUARD
      prescription: "TIMEOUT_KILL",
      ...base,
    };
  }

  // TIMEOUT is checked BEFORE SUPERSEDED on purpose: a run that already burned its
  // full budget is never "merely superseded" — the money guard wins the tie.
  if (ratio !== null && ratio >= TIMEOUT_RATIO) {
    return {
      klass: "TIMEOUT",
      reason: timeoutRx,
      should_retry: false, // MONEY GUARD
      prescription: "TIMEOUT_KILL",
      ...base,
    };
  }

  if (wf?.cancel_in_progress && hasNewerRun) {
    return {
      klass: "SUPERSEDED",
      reason: `${file} declares \`cancel-in-progress\` and a newer run exists — this run was self-cancelled by the concurrency group. Not an incident.`,
      should_retry: false,
      prescription: "SUPERSEDED",
      ...base,
    };
  }

  // Neither. Print the evidence and say so — never invent a diagnosis (spec §11 UNKNOWN).
  const why =
    ceiling === null
      ? `${file} declares no \`timeout-minutes\`, so a ceiling kill cannot be ruled in or out`
      : `${elapsed ?? "?"} min elapsed is only ${ratio !== null ? Math.round(ratio * 100) : "?"}% of its ${ceiling}-min ceiling, so this was not a timeout kill`;
  return {
    klass: "UNKNOWN_CANCEL",
    reason:
      `Scheduled run of ${file} was CANCELLED with no known cause: ${why}, and the workflow does not declare ` +
      `\`cancel-in-progress\` with a newer run to supersede it. Evidence: elapsed=${elapsed ?? "?"} min, ceiling=${ceiling ?? "none"}, ` +
      `ratio=${ratio ?? "n/a"}. Someone or something cancelled it out-of-band. Needs a human — do not guess.`,
    should_retry: false,
    prescription: "UNKNOWN",
    ...base,
  };
}
