// lib/listings/apify-spend-guard.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
// *** THE PAID VENDOR LANE IS OFF UNTIL SOMEONE TURNS IT ON FOR ONE RUN. ***
// ═══════════════════════════════════════════════════════════════════════════════
//
// Operator, 08/05/2026, verbatim: *"What do you mean a fucking button uses apify???
// 3.95 to build one fucking house email?! They are fractions of a fucking penny to
// run!!! What the fuck did you do?"*
//
// He was right, and the real number was worse. Pulled from the vendor's OWN billing
// API (`/v2/actor-runs`, actor T5QRnLKtyvzxjWVRH) rather than from our estimate:
// **$14.08 across 21 runs on one walk; $14.37 / 51 runs on that actor that day.**
// Charge shape: $2.0000 x1 · $1.9501 x6 · $0.0501 x6 · $0.0100 x37 · $0.0001 x1.
//
// SEVEN ACCEPTANCE RENDERS OF ONE EMAIL. Every one bought a fresh ~200-record ZIP
// month (~$1.95) plus a 5-record subject query (~$0.05). The cache prevented nothing.
//
// ── WHY THE CACHE DID NOT SAVE US (the structural root, still open) ──────────
// `resolveCompEnrichment` returns early ONLY when `missing.length === 0`. One comp
// the ZIP pull never returns is never written to the cache under a key lane A reads,
// so `missing` is never empty, so EVERY sale month is re-bought on EVERY build,
// forever. At the measured join rate (2 of 6) that condition is always true. Fixing
// that needs a purchased-window memo — a new table, a new key, a TTL decision — and
// it is tracked as its own check. THIS FILE makes that leak non-urgent by making the
// unattended re-buy impossible, which is the part that could not wait for a design pass.
//
// ── WHY THE SWITCH IS HERE AND NOT IN A CALLER ───────────────────────────────
// `runApifyActor` (apify-comps.ts) is the ONE place in this tree where money actually
// leaves the process. Every test injects `deps.runActor` to stay offline, so a guard
// placed one level up in `fetchApifyComps` could be routed around by any future caller
// passing its own `runActor`. Guarding the bottom means no caller can opt out — present
// or future, deliberate or by accident.
//
// ── THE VARIABLE IS THE ONE THIS REPO ALREADY USES ───────────────────────────
// `OPERATOR_APPROVED_PAID_RUN=1` is the existing idiom for "this run is allowed to
// spend real money" (CLAUDE.md RULE 1, `scripts/dispatch-rebuild.mjs`). Minting a
// second name for the same concept would break one-authority-per-concept and would
// not be in his muscle memory. One concept, one switch.

/** WHY a spend was refused. NEVER a bare boolean: this directory has two scars from
 *  a silent `[]` — the `APIFY_KEY` name mismatch and the 403 monthly-hard-limit — where
 *  a refusal was byte-identical to "this market has no houses". A third instance is
 *  not acceptable, so a refusal always carries a name a caller can print. */
export const SpendRefusal = {
  /** No `OPERATOR_APPROVED_PAID_RUN=1`. The default, and the safe one. */
  SwitchOff: "paid-lane-switch-off",
  /** The switch is on but this process has already bought its allowance. */
  BudgetExhausted: "process-budget-exhausted",
} as const;

export type SpendRefusalReason = (typeof SpendRefusal)[keyof typeof SpendRefusal];

/** What the vendor bills per result. Verified against the real charges 08/05/2026:
 *  $1.9501 = 195 results x $0.01 + $0.00005 actor start, and $0.0501 = 5 x $0.01.
 *  They divide exactly, so this is the billed unit — not a guess.
 *  ⚠️ Whether $0.01 is still the STORE-LISTED price is a RULE 0.4 crawl4ai pass that
 *  is owed and tracked as its own check. This constant is what we were CHARGED. */
export const USD_PER_RESULT = 0.01;

/** THE PROCESS CEILING, in results — the unit the vendor actually bills.
 *
 *  300 results ≈ $3.00. Chosen against the measured shape rather than a round number:
 *  ONE build's honest need is a single ~200-record sale month, so 300 lets a real build
 *  finish and stops the second one cold. The seven-render walk that cost $14.08 would
 *  have stopped after the first render and change.
 *
 *  This is a PER-PROCESS budget, not per-call. `resolveCompEnrichment`'s own
 *  `HARD_TOTAL_RESULT_CEILING` (700) bounds ONE invocation and cannot see a second
 *  invocation, a subject-record call, or a baths lookup — which is precisely how one
 *  script accumulated 21 billed runs while every individual ceiling was respected. */
export const PROCESS_RESULT_BUDGET = 300;

/** What the vendor charges for a request with NO cap. `max_results_per_location: 0`
 *  means UNLIMITED to this actor (up to 10k) — a $100 run from one omitted field. The
 *  budget must therefore price an uncapped request as EXPENSIVE, never as zero, or the
 *  one request that can bankrupt the run is the one that slips through free. */
const UNBOUNDED_REQUEST_COST = PROCESS_RESULT_BUDGET;

interface Ledger {
  results: number;
  refusals: number;
}

/** Process-scoped on purpose. An email build is a CLI script or a serverless
 *  invocation; the process IS the unit of work a human kicked off and the unit they
 *  get billed for. A cross-process budget would need shared state and a reset policy
 *  neither of which exists yet — and would not have stopped this incident, which was
 *  seven separate processes. The SWITCH is what stops those; the budget stops a
 *  runaway loop inside one of them. */
const ledger: Ledger = { results: 0, refusals: 0 };

/** Test-only reset. Nothing in the product resets a budget mid-run. */
export function resetSpendLedger(): void {
  ledger.results = 0;
  ledger.refusals = 0;
}

export interface SpendLedgerReport {
  /** Results this process has COMMITTED to buy (charged at request time, see below). */
  results: number;
  /** What that costs at the billed unit. THE RECEIPT — never a row-delta. */
  estimatedUsd: number;
  refusals: number;
  /** Did anything get refused? A caller printing "no photos found" must be able to
   *  check this and say "the paid lane was OFF" instead of blaming the market. */
  refused: boolean;
}

export function spendLedger(): SpendLedgerReport {
  return {
    results: ledger.results,
    estimatedUsd: Math.round(ledger.results * USD_PER_RESULT * 100) / 100,
    refusals: ledger.refusals,
    refused: ledger.refusals > 0,
  };
}

/** Is the paid lane armed for this run? `env` is injectable so tests never depend on
 *  the ambient environment (and so a test can never accidentally arm it). */
export function paidLaneEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OPERATOR_APPROVED_PAID_RUN === "1";
}

export interface SpendVerdict {
  allowed: boolean;
  reason?: SpendRefusalReason;
  /** Results charged to the ledger for this request (0 when refused). */
  charged: number;
}

/**
 * May this process buy `requestedResults` more records? Charges the ledger if so.
 *
 * *** CHARGED ON REQUEST, BEFORE THE CALL — NOT ON RESPONSE. ***
 * A call that RETURNS 200 records has already been billed for those 200. A budget that
 * counts returned rows learns the price only after paying it, which is the same
 * after-the-fact reasoning that made the row-delta receipt lie. We commit the cost
 * first and refuse a request we cannot afford WHOLE — never half-buy a window, because
 * a truncated month reads downstream as "these houses have no photos".
 */
export function requestSpend(
  requestedResults: number,
  env: Record<string, string | undefined> = process.env,
): SpendVerdict {
  if (!paidLaneEnabled(env)) {
    ledger.refusals++;
    return { allowed: false, reason: SpendRefusal.SwitchOff, charged: 0 };
  }

  // A non-positive or non-finite cap is UNLIMITED to this vendor, never free.
  const cost =
    Number.isFinite(requestedResults) && requestedResults > 0
      ? Math.ceil(requestedResults)
      : UNBOUNDED_REQUEST_COST;

  if (ledger.results + cost > PROCESS_RESULT_BUDGET) {
    ledger.refusals++;
    return { allowed: false, reason: SpendRefusal.BudgetExhausted, charged: 0 };
  }

  ledger.results += cost;
  return { allowed: true, charged: cost };
}

/** The sentence a refusal prints. Written so it can NEVER be mistaken for a market
 *  fact — the failure mode this whole module exists to stop. */
export function refusalMessage(reason: SpendRefusalReason, requested: number): string {
  const spent = spendLedger();
  if (reason === SpendRefusal.SwitchOff) {
    return (
      `[apify-spend-guard] PAID LANE OFF — refused to buy ${requested} record(s). ` +
      `*** THIS IS NOT "NO RESULTS" AND NOT AN EMPTY MARKET. *** No vendor call was made ` +
      `and nothing was billed. Photo/link/description slots will be empty for a reason ` +
      `that has nothing to do with the houses. To spend real money on this run, set ` +
      `OPERATOR_APPROVED_PAID_RUN=1.`
    );
  }
  return (
    `[apify-spend-guard] PROCESS BUDGET EXHAUSTED — refused to buy ${requested} more ` +
    `record(s). Already committed ${spent.results} record(s) (~$${spent.estimatedUsd.toFixed(2)}) ` +
    `against a ceiling of ${PROCESS_RESULT_BUDGET} (~$${(PROCESS_RESULT_BUDGET * USD_PER_RESULT).toFixed(2)}). ` +
    `*** THIS IS NOT "NO RESULTS". *** Remaining slots ship empty. If this run legitimately ` +
    `needs more, raise PROCESS_RESULT_BUDGET deliberately — do not loop the build.`
  );
}
