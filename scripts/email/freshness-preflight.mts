// scripts/email/freshness-preflight.mts
//
// The digest send gate. The nightly chain rebuilds master and pushes
// brains/master.md to main; daily-email-digest.yml checks out main — so the
// digest's own checkout carries the token, and this needs no network call.
//
// WHY THIS EXISTS: GitHub can DROP a scheduled run entirely, and this repo's
// overnight schedule: trigger has been measured +2h07m to +5h29m late
// (08d §3). Without this gate, a dropped/late chain means the 10:23 AM digest
// renders YESTERDAY's numbers under TODAY's date and reports green. This gate is
// structurally drift-immune: it does not care WHY master is stale.
import fs from "node:fs";
import path from "node:path";

/** Raised when master's freshness_token is not today's. Named for GHA log parsing. */
export class StaleMasterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleMasterError";
  }
}

export const DEFAULT_MASTER_MD = path.join(process.cwd(), "brains", "master.md");

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

/**
 * FAILS CLOSED. A missing / unreadable / unparseable master.md yields null, which
 * is never equal to `today`, so it refuses. "Never assert on unknown freshness" —
 * the same posture as freshnessGate's NaN-guard (refinery/lib/freshness.mts).
 */
export function assertMasterFreshToday(
  today: string,
  masterMdPath: string = DEFAULT_MASTER_MD,
): void {
  const stamped = masterFreshnessDate(masterMdPath);
  if (stamped === today) return;
  throw new StaleMasterError(
    `master freshness_token is ${stamped ?? "unreadable"}, expected ${today}. ` +
      `The nightly chain did not land today's rebuild. REFUSING TO SEND.`,
  );
}
