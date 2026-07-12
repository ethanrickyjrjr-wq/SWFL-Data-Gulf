/**
 * Stale-caveat TTL — the anti-phantom predicate for re-lifted caveats.
 *
 * WHY THIS EXISTS. `refinery/packs/master.mts:188` re-lifts every passing
 * upstream's baked `caveats[]` into master's own OUTPUT on every build. A
 * degradation caveat minted once ("macro-florida failed to rebuild on
 * 2026-06-29") therefore re-ships in every subsequent master build for as long
 * as the upstream sits `skipped-fresh` — up to its 30-day TTL — long after the
 * fact it describes stopped being interesting.
 *
 * WHY IT IS TEMPLATE-ANCHORED, NOT A DATE SCAN. Across the live 41-brain fleet
 * there are 307 caveats, 40 of them carrying an absolute ISO date. A naive
 * "regex any date, drop if older than the TTL" rule drops **34 of those 40** —
 * every one a false positive — because most embedded dates are LAST-SOURCE-EVENT
 * dates, not emission dates. permits-swfl's "Most recent Naples permit issued
 * 2026-04-30 ... Collier signal in this build is stale" gets MORE true as its
 * date recedes; env-swfl's "last reviewed 2026-05-17" is a maintenance note that
 * must never expire; cre-swfl carries 14 dated local-context FACTS. So:
 *
 *   ANCHOR ON THE ENGINE TEMPLATE. NO MATCH => KEEP. ALWAYS.
 *
 * The ONLY caveat in the fleet whose embedded date means "when this caveat was
 * born" is the one minted at `refinery/stages/4-output.mts:191`. That template —
 * and only that template — is TTL-able. Its two siblings share the same latent
 * freeze bug and are unreachable by date math (documented below); 0 instances
 * live today.
 *
 * Applied at `4-output.mts:438` (the engine-wide re-lift chokepoint) — never at
 * `:458-459`, which push caveats minted by THIS build (see the comments there).
 *
 * Parse-at-render by design: turning `caveats: string[]` into
 * `{text, expires_at}[]` would be a `BrainOutput` type-lift requiring a same-
 * commit backfill of all packs (CLAUDE.md brain-factory rule 3). This dodges it,
 * and it also catches hand-written caveats.
 */

/** Default TTL for a dated degradation caveat, in days. */
export const CAVEAT_TTL_DAYS = 14;

/**
 * The ONE TTL-able caveat template. MIRRORS `refinery/stages/4-output.mts:191`
 * BYTE-FOR-BYTE. Capture group 1 is the emission date (that build's run date).
 *
 * ⚠️ COUPLING: if you edit the template string at `4-output.mts:191`, this regex
 * stops matching, `caveatIsFresh` fails OPEN (keeps everything), and the phantom
 * re-ships silently forever. `refinery/lib/caveat-ttl.test.mts` ("template
 * mirror") is the tripwire — it rebuilds the string with :191's interpolation
 * shape and will go RED. Fix both sides together.
 *
 * The two siblings, deliberately NOT matched:
 *   - `4-output.mts:182-183` "... was stale at build time (expired {date})." The
 *     date is an EXPIRY, always already in the past — TTL-ing it would delete a
 *     live staleness signal.
 *   - `4-output.mts:171` "... was unavailable at build time (no last-good read)."
 *     No date at all — un-TTL-able by construction.
 */
export const DEGRADE_CAVEAT =
  /^Upstream brain '[^']+' failed to rebuild on (\d{4}-\d{2}-\d{2}); using last good read from \d{4}-\d{2}-\d{2} \(v\d+\)\.$/;

/**
 * `true` = KEEP the caveat. `false` = DROP it (it is a frozen degradation notice
 * older than the TTL).
 *
 * Fails OPEN in every ambiguous case — no template match, an unparseable date, an
 * unparseable `now` — because DROPPING is the destructive direction: a wrongly
 * kept caveat is noise; a wrongly dropped one deletes a true qualification from a
 * customer answer.
 *
 * Age is computed in whole UTC days, both sides anchored at UTC midnight, so a
 * bare date string ("2026-07-13") and a full `refined_at` timestamp
 * ("2026-07-13T04:05:06Z") produce the identical verdict and no local timezone
 * can shift the boundary. Fresh <=> `ageDays < ttlDays`: a caveat born
 * 2026-06-29 is kept through 2026-07-12 (age 13) and dropped from 2026-07-13
 * (age 14) onward.
 */
export function caveatIsFresh(
  caveat: string,
  now: Date | string = new Date(),
  ttlDays: number = CAVEAT_TTL_DAYS,
): boolean {
  const m = DEGRADE_CAVEAT.exec(caveat.trim());
  if (!m) return true; // not the TTL-able template -> KEEP. This is the whole safety property.

  const bornMs = Date.parse(`${m[1]}T00:00:00Z`);
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (Number.isNaN(bornMs) || Number.isNaN(nowMs)) return true; // fail OPEN

  const nowDayMs = Date.parse(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00Z`);
  const ageDays = Math.round((nowDayMs - bornMs) / 86_400_000);
  return ageDays < ttlDays;
}
