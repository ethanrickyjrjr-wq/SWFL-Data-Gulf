// .claude/hooks/lib/cron-failclosed.mjs
//
// PURE RULES for Gate 13 — a NEW scheduled workflow that spends metered vendor
// quota must be FAIL-CLOSED: if its enabling variable is unset, it must NOT run.
//
// THE INCIDENT (08/04/2026). `neighborhood-amenities-daily.yml` landed on 08/03
// with `cron: "30 9 * * *"` and this job condition:
//     if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}
// That is a NOT-EQUALS. An unset variable is not the string 'false', so the job
// RUNS by default — up to 500 SteadyAPI calls per day, unattended. Worse, the
// session that wrote it reported to the operator that the drain was "blocked on
// an operator-only ENGINE_ENABLED flip", having never opened the condition. The
// operator found it a day later by asking. `!=` and `==` are OPPOSITE defaults
// for an unset var, and the reassuring one was assumed.
//
// WHY THE EXISTING MONEY GUARD DIDN'T CATCH IT: check-no-paid-dispatch.mjs
// defines "paid" as `/ANTHROPIC_API_KEY/` — LLM credits only. This workflow
// spends SteadyAPI quota (PHOTOS_API), which was not in anyone's definition of
// money. That gap is the second half of the incident and is closed here by
// naming every metered key, not just the model one.
//
// SCOPE, deliberately narrow (CLAUDE.md RULE 0.6 — proportion): this gates the
// combination that actually burned us — SCHEDULED (unattended) + METERED (real
// quota) + FAIL-OPEN (runs when unset). A cron with no spend key is not gated. A
// spend key on a manual `workflow_dispatch`-only workflow is not gated; a human
// is present for those. Retrofitting the 100+ existing workflows is NOT in
// scope, which is why the caller fires this on ADDED files only.

/** Secrets whose use means a run consumes METERED THIRD-PARTY QUOTA — real money
 *  or a real monthly allowance, spent per call.
 *
 *  Derived from the live census of `.github/workflows/*.yml` (08/04/2026), not
 *  from memory. Deliberately EXCLUDED, with reasons:
 *    - SUPABASE_* / DESTINATION__POSTGRES__CREDENTIALS / SUPABASE_PG_* — our own
 *      infrastructure. Egress matters but is not per-call vendor spend, and
 *      gating every DB-touching cron would gate all 84 of them.
 *    - FRED_API_KEY / CENSUS_API_KEY / BLS_API_KEY — free government APIs; the
 *      key exists for rate-limiting, not billing.
 *    - GITHUB_TOKEN / REBUILD_PAT / HEALTHCHECKS_PING_KEY — free.
 *    - The OAuth client id/secret pairs (X_, META_, LINKEDIN_, GBP_) — these
 *      publish rather than meter. They deserve their own gate; conflating
 *      "spends money" with "posts publicly" would blur both. Not this gate. */
export const METERED_SECRETS = [
  "ANTHROPIC_API_KEY", // LLM credits — drained to $0 on 07/05/2026
  "PHOTOS_API", // SteadyAPI (50k/mo) — the 08/04/2026 incident
  "MAPBOX_TOKEN", // metered per request
  "RESEND_API_KEY", // outbound email — money AND deliverability
  "RESEND_AUDIENCES_KEY",
  "CRAWL4AI_PROXY", // metered proxy bandwidth
];

/** True when the workflow declares a cron schedule — i.e. it can run with no
 *  human present. Matches `on: schedule:` in either YAML style. */
export function hasSchedule(yamlText) {
  const text = String(yamlText ?? "");
  // A `- cron:` entry is the unambiguous marker; `schedule:` alone can appear in
  // a comment or an input description.
  return /^\s*-\s*cron\s*:/m.test(text);
}

/** The metered secrets this workflow references. */
export function meteredSecretsUsed(yamlText) {
  const text = String(yamlText ?? "");
  return METERED_SECRETS.filter((s) => new RegExp(`secrets\\.${s}\\b`).test(text));
}

/** Every `if:` condition in the file, comments stripped.
 *
 *  Deliberately text-based rather than a YAML parse: the hook runs under plain
 *  `node` with no yaml dependency, and the property being checked (the polarity
 *  of a comparison operator) survives a text read intact. */
export function conditionsIn(yamlText) {
  const out = [];
  const lines = String(yamlText ?? "").split("\n");
  for (const line of lines) {
    // Drop a trailing comment, but not a '#' inside a quoted string.
    const code = line.replace(/\s#(?![^'"]*['"]).*$/, "");
    const m = /^\s*if\s*:\s*(.+?)\s*$/.exec(code);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * Is this condition FAIL-CLOSED for a scheduled run — i.e. does an UNSET
 * variable leave the job not running?
 *
 * FAIL-CLOSED (allowed):  vars.X == 'true'    — unset is not 'true' -> skipped
 * FAIL-OPEN  (blocked):   vars.X != 'false'   — unset is not 'false' -> RUNS
 *
 * The `|| github.event_name == 'workflow_dispatch'` clause common in this repo is
 * irrelevant to a scheduled tick (event_name is 'schedule' then), so a condition
 * is judged on its variable comparisons alone.
 */
export function isFailClosed(condition) {
  const c = String(condition ?? "");
  const comparisons = [...c.matchAll(/\b(?:vars|env|inputs)\.[A-Za-z0-9_]+\s*(==|!=)\s*/g)];
  if (comparisons.length === 0) return false; // no variable test at all -> ungated
  // A single `!=` against a disabling value is enough to make the whole thing
  // fail-open, so EVERY comparison must be an equality opt-in.
  return comparisons.every((m) => m[1] === "==");
}

/**
 * The gate verdict for ONE workflow file. Returns null when the file is fine or
 * out of scope, or a violation object explaining what must change.
 *
 * `path` is used only for the message.
 */
export function cronViolation(path, yamlText) {
  if (!hasSchedule(yamlText)) return null;
  const metered = meteredSecretsUsed(yamlText);
  if (metered.length === 0) return null;

  const conditions = conditionsIn(yamlText);
  if (conditions.length === 0) {
    return {
      path,
      metered,
      reason: "scheduled + metered, with NO `if:` condition anywhere — it runs on every tick",
    };
  }
  if (!conditions.some(isFailClosed)) {
    return {
      path,
      metered,
      reason:
        "every `if:` in this file is FAIL-OPEN (an unset variable still runs it): " +
        conditions.map((c) => `\`${c}\``).join(" · "),
    };
  }
  return null;
}

/** Violations across many files. `files` is [{path, text}]. */
export function cronViolations(files) {
  const out = [];
  for (const f of files ?? []) {
    const v = cronViolation(f?.path, f?.text);
    if (v) out.push(v);
  }
  return out;
}
