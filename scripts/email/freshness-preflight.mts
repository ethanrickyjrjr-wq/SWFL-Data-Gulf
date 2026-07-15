// scripts/email/freshness-preflight.mts
//
// The digest send gate. The nightly chain rebuilds brains and pushes both
// brains/*.md and brains/_build-report.json to main; daily-email-digest.yml
// checks out main — so the digest's own checkout carries the evidence, and this
// needs no network call.
//
// WHY THIS EXISTS: GitHub can DROP a scheduled run entirely, and this repo's
// overnight schedule: trigger has been measured +2h07m to +5h29m late
// (08d §3). Without this gate, a dropped/late chain means the 14:23 digest
// renders yesterday's numbers and reports green. This gate is structurally
// drift-immune: it does not care WHY the chain failed to run.
//
// WHAT IT MUST NOT DO (regression fixed 2026-07-14): it must not equate "master
// was REBUILT today" with "the chain RAN today". Those are different facts. The
// refinery deliberately SKIPS master when it is inside its own 7-day TTL and no
// upstream rebuilt more recently (refinery/cli.mts — the `masterStaleVsUpstreams`
// branch): on a genuine no-change day the chain runs, decides master is current,
// writes nothing, and exits 0. That is CORRECT behavior, not staleness.
//
// The original gate asserted `master.freshness_token`'s date === today, which the
// pipeline structurally cannot guarantee — so the first quiet day (2026-07-14, run
// 29347029902) refused a perfectly good send, and every future quiet day would too.
// Content vintage is NOT this gate's job and never was: fetch-digest-data's
// `asOfForToken` already stamps each source's TRUE token date (never the send
// date), so a skipped-fresh master renders honestly as "as of 07/13/2026".
//
// So the gate asserts the two things it actually cares about:
//   1. the chain RAN today            — _build-report.json timestamps.started
//   2. master is not HELD             — masterDecision !== "held"
//   3. master.md is readable + tokened — fail closed on a missing/garbled brain
import fs from "node:fs";
import path from "node:path";

/** Raised when the digest must not send. Named for GHA log parsing. */
export class StaleMasterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleMasterError";
  }
}

export const DEFAULT_MASTER_MD = path.join(process.cwd(), "brains", "master.md");
export const DEFAULT_BUILD_REPORT = path.join(process.cwd(), "brains", "_build-report.json");

const TOKEN_LINE = /^freshness_token:\s*(\S+)\s*$/m;
const TOKEN_DATE_TAIL = /-(\d{4})(\d{2})(\d{2})$/;

/**
 * The calendar day (YYYY-MM-DD) baked into master's `freshness_token`
 * (`SWFL-7421-v{n}-{YYYYMMDD}` — refinery/lib/freshness.mts:freshnessToken).
 * We read the FRONTMATTER field, not the HTML comment: the module docstring in
 * freshness.mts states the frontmatter field is the one that survives
 * HTML->markdown stripping, so it is the durable of the two.
 *
 * Returns null (never throws) when master.md is missing, carries no token line,
 * or the token has no parseable date tail. Every null path is a REFUSAL upstream.
 *
 * NOTE: this is master's VINTAGE, not proof the chain ran. It is legitimately
 * older than today on a no-change day. Kept because a null here still means
 * master.md is missing or garbled, which IS a refusal.
 */
export function masterFreshnessDate(masterMdPath: string = DEFAULT_MASTER_MD): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(masterMdPath, "utf8");
  } catch {
    return null;
  }
  const line = raw.match(TOKEN_LINE);
  if (!line) return null;
  const d = line[1].match(TOKEN_DATE_TAIL);
  if (!d) return null;
  return `${d[1]}-${d[2]}-${d[3]}`;
}

export interface ChainRun {
  /** UTC calendar day (YYYY-MM-DD) the chain started. null = unreadable. */
  startedOn: string | null;
  /**
   * "published" | "skipped-fresh" | "held", or null when this run never touched
   * master (a targeted single-pack rebuild — refinery/cli.mts leaves
   * masterDecision undefined for those). null is NOT a refusal: a leaf-only
   * rebuild does not invalidate master's existing synthesis.
   */
  masterDecision: string | null;
}

/**
 * Read the chain's own receipt. brains/_build-report.json is committed by every
 * rebuild run (`chore(brains): daily rebuild <date>`) EVEN when nothing was
 * rebuilt — which is precisely what makes it the honest "did the chain run"
 * signal, where master.md's mtime/token is not.
 *
 * Returns nulls (never throws) on a missing/garbled report. Every null is a
 * REFUSAL upstream.
 */
export function readChainRun(reportPath: string = DEFAULT_BUILD_REPORT): ChainRun {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    return { startedOn: null, masterDecision: null };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { startedOn: null, masterDecision: null };
  }
  const report = parsed as {
    timestamps?: { started?: unknown };
    masterDecision?: unknown;
  };
  const started = report.timestamps?.started;
  // Slice, don't `new Date(...)` — the report stamps UTC ("...Z") and the digest
  // compares against a UTC `today`. Constructing a Date and re-serializing risks
  // a local-timezone round-trip shifting the day across the boundary.
  const startedOn =
    typeof started === "string" && /^\d{4}-\d{2}-\d{2}T/.test(started)
      ? started.slice(0, 10)
      : null;
  const masterDecision = typeof report.masterDecision === "string" ? report.masterDecision : null;
  return { startedOn, masterDecision };
}

/**
 * FAILS CLOSED. A missing / unreadable / unparseable artifact yields null, which
 * never satisfies the assertion, so it refuses. "Never assert on unknown
 * freshness" — the same posture as freshnessGate's NaN-guard
 * (refinery/lib/freshness.mts).
 *
 * REFUSES when:
 *   - the build report is missing/garbled, or did not start today  → chain dropped
 *   - masterDecision === "held"                                    → critical upstream dead
 *   - master.md is missing or carries no parseable token           → garbled brain
 *
 * SENDS when the chain ran today and master is published, skipped-fresh, or
 * untouched-by-a-targeted-rebuild.
 */
export function assertChainRanToday(
  today: string,
  reportPath: string = DEFAULT_BUILD_REPORT,
  masterMdPath: string = DEFAULT_MASTER_MD,
): void {
  const { startedOn, masterDecision } = readChainRun(reportPath);

  if (startedOn !== today) {
    throw new StaleMasterError(
      `nightly chain last ran ${startedOn ?? "never (build report missing or unreadable)"}, ` +
        `expected ${today}. The chain did not land today's run. REFUSING TO SEND.`,
    );
  }

  if (masterDecision === "held") {
    throw new StaleMasterError(
      `the chain ran today but HELD master (a critical upstream's last-good eligibility ` +
        `expired). Master is not trustworthy. REFUSING TO SEND.`,
    );
  }

  const stamped = masterFreshnessDate(masterMdPath);
  if (stamped === null) {
    throw new StaleMasterError(
      `brains/master.md is missing or carries no parseable freshness_token. REFUSING TO SEND.`,
    );
  }
}
