// lib/listings/apify-run.ts
//
// *** THE ONE PLACE IN THE TREE WHERE MONEY LEAVES THE PROCESS. ***
//
// Moved out of apify-comps.ts on 08/10/2026 when the by-address lookup
// (apify-property-lookup.ts) became the second paid lane. The doctrine is
// unchanged: every caller injects its own offline runner in tests, so a guard
// placed any higher could be routed around by a future caller bringing its own
// runner. Guarding the bottom means no caller can opt out — present or future,
// deliberate or by accident. See apify-spend-guard.ts for the $14.08 afternoon
// that forced it.
//
// ── CALLER CONTRACT ON `requestedResults` ────────────────────────────────────
// It must be derived from the INPUT's own cap field — comps derive it from
// `max_results_per_location`, the by-address lane from `property_inputs.length`.
// Never a constant typed at the call site: the guard charges what you REQUEST,
// before the call, so a request understated is a bill the budget never saw.

import { requestSpend, refusalMessage } from "./apify-spend-guard";

export interface GuardedApifyRun {
  /** URL-path actor id, e.g. "one-api~realtor-property-scraper". */
  actorId: string;
  input: Record<string, unknown>;
  /** Results this request can bill — charged BEFORE the call (see guard). */
  requestedResults: number;
}

/**
 * Run an actor synchronously and return its dataset items. NEVER THROWS a
 * guard/vendor failure into the caller — an empty [] with a LOUD console line is
 * the contract (RULE 0.7, a build is never refused; and this directory's two
 * scars where a silent [] read as "this market has no houses").
 */
export async function runGuardedApifyActor(run: GuardedApifyRun): Promise<unknown[]> {
  // ── THE SWITCH AND THE BUDGET, BEFORE THE FETCH ────────────────────────────
  // Charged on the REQUESTED cap: a run that returns N records has already been
  // billed for them, so a budget that counts what came back learns the price
  // only after paying it.
  const verdict = requestSpend(run.requestedResults);
  if (!verdict.allowed) {
    console.warn(refusalMessage(verdict.reason!, run.requestedResults));
    return [];
  }

  // BOTH names are read on purpose. `.env.local` has carried `APIFY_KEY` all
  // along; the lane once looked only for `APIFY_TOKEN` and silently returned []
  // on every call (operator, 08/03/2026: "APIFY KEY IN .ENV.LOCAL THOUGH").
  // The code reads what is actually there.
  const token = process.env.APIFY_TOKEN ?? process.env.APIFY_KEY;
  if (!token) {
    console.warn("[apify-run] no APIFY_TOKEN / APIFY_KEY in env — paid fetch skipped");
    return [];
  }

  // ── THE DEADLINE ─────────────────────────────────────────────────────────────
  // run-sync holds the HTTP line open until the actor finishes — the vendor caps
  // that at ~300s, and this fetch used to wait it out with no bound of its own,
  // which is how a lab build sat on "Working…" for 7 minutes (operator, 08/10/2026)
  // with nothing on screen and nothing in the logs. `timeout=` caps the RUN on the
  // vendor's side; the abort signal caps OUR wait a beat longer so the two can't
  // deadlock. A deadline hit degrades to [] LOUDLY, same contract as every other
  // failure here — never a silent multi-minute hang inside an interactive build.
  const RUN_TIMEOUT_SECS = 90;
  let res: Response;
  try {
    res = await fetch(
      `https://api.apify.com/v2/acts/${run.actorId}/run-sync-get-dataset-items?token=${token}&timeout=${RUN_TIMEOUT_SECS}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run.input),
        signal: AbortSignal.timeout((RUN_TIMEOUT_SECS + 15) * 1000),
      },
    );
  } catch (err) {
    console.error(
      `[apify-run] VENDOR CALL DID NOT COMPLETE within ${RUN_TIMEOUT_SECS}s (${run.actorId}) — ` +
        `aborted so the build can finish instead of hanging. This is NOT "no results": ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
  if (!res.ok) {
    // *** A VENDOR REFUSAL IS NOT "NO RESULTS." *** Measured live 08/04/2026: an
    // HTTP 403 monthly-hard-limit returned as a bare [] made an exhausted ACCOUNT
    // look exactly like an empty MARKET, and an email shipped with open photo
    // slots as though no photos existed. Say it out loud, every time.
    const body = await res.text().catch(() => "");
    console.error(
      `[apify-run] VENDOR CALL FAILED ${res.status} ${res.statusText} (${run.actorId}) — ` +
        `this is NOT "no results". Slots will be empty for a reason that has nothing to ` +
        `do with the houses: ${body.slice(0, 300)}`,
    );
    return [];
  }
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}
