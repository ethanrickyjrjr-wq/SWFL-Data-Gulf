// lib/deliverable/recipes/under-contract.ts
//
// R4 · UNDER CONTRACT — the same resolved house as New Listing, wearing the
// "it's pending, send me your backup offer" hat.
//
// ── THE REFUTATION THIS FILE IS BUILT AROUND (07/13/2026) ────────────────────
//
// The first build of this recipe SHIPPED A FABRICATED CLAIM. It rendered:
//
//     "This home went under contract after 75 days on market, in line with the
//      72-day median... The seller had reduced the asking price by $104,975
//      BEFORE A CONTRACT WAS REACHED."
//
// NOT ONE NUMBER IN THAT SENTENCE WAS INVENTED. 75 was a real elapsed-day count.
// 72 was a real ZIP median. $104,975 was the vendor's real `reduced_amount`.
// What was invented was the CLAIM DRAWN BETWEEN correctly-sourced numbers:
//
//   • "went under contract after 75 days" — an INTERVAL RE-LABELLING. 75 was
//     elapsed days (list_date → TODAY). Days-TO-CONTRACT is held by no endpoint.
//     A real number wearing the name of a quantity we do not hold is still an
//     invented figure.
//   • "in line with the 72-day median" — a COMPARISON, and comparisons are
//     factual claims. This one is not even wrong-by-arithmetic, it is wrong by
//     CONSTRUCTION: `median_dom` is Redfin's SOLD-COHORT median (it sits beside
//     homes_sold / avg_sale_to_list / sold_above_list in `housing_by_zip` — see
//     ingest/pipelines/redfin_lee/resources.py). A completed clock over homes
//     that SOLD. The subject's is a running clock on a home that has NOT. See
//     THE NON-COMMENSURABILITY, below.
//   • "BEFORE a contract was reached" — a SEQUENCE. We hold a cut AMOUNT
//     (`price.reduced_amount`) and nothing else. No cut date, no contract date,
//     no ordering. An invented ordering is an invented fact.
//
// The no-invention lint tokenizes DIGITS, so all three sailed through it: there
// was nothing numerically wrong to catch. Invention is CLAIM-shaped, not
// number-shaped. lib/deliverable/claims.ts is the answer, and this file wires it.
//
// ── THE MECHANISM: THE NARRATOR IS NEVER GIVEN ANYTHING TO COMPARE ───────────
//
//   1. CODE computes every relation (`settledCount` over the peer ZIP set) and
//      every derived figure (the price-cut sentence).
//   2. The narrator receives the RESULT as a SETTLED ENGLISH SENTENCE.
//   3. The narrator receives NO RAW PAIR, NO RAW SET, NO ROW LIST, and NO LOOSE
//      NUMBER. `narratorSources()` is PURE and takes a `NarratorInput` that has
//      NO numeric field on it AT ALL — the only digits that can reach the model
//      live inside a `SettledClaim.sentence`, and every one of those is in that
//      claim's `anchors`. So `allowedNumerals ⊇ every numeral the narrator saw`.
//      IT CANNOT COMPARE TWO NUMBERS IT WAS NEVER GIVEN TWO OF.
//   4. `auditClaims(prose, settled)` is a FAIL-CLOSED BACKSTOP. Any violation →
//      the paragraph is thrown away, never patched, never "best-effort" shipped.
//   5. `CLAIM_PROHIBITION` is printed verbatim into the system prompt, so the
//      model is told the exact rule the lint enforces.
//
// The done-condition is STRUCTURAL AND GREPPABLE: grep `NarratorInput` — there is
// no `areaDom`, no `daysListed`, no `peers`, no `price` on it. A test asserts it.
//
// ── THE NON-COMMENSURABILITY (why there is still NO subject-vs-area claim) ────
//
// The registry prompt now asks to "set its time on the market against the area's
// typical days on market," and we DO hold both figures:
//
//   • DAYS SINCE LISTED — `today − list_date`. Exact arithmetic on a real date.
//   • TYPICAL DAYS TO SELL — `housing_by_zip.median_dom` for the ZIP.
//
// THEY ARE NOT COMMENSURABLE, AND CODE-COMPUTING THE COMPARISON WOULD NOT MAKE IT
// TRUE. `median_dom` is a COMPLETED duration over homes that SOLD. The subject's
// is a RUNNING count on a home that has not sold — and, being under contract, its
// clock stopped at a date we do not hold while our count keeps ticking. Comparing
// them is a censored-sample error: `compareToSet(75, [72])` would return a
// perfectly correct sentence about a perfectly meaningless relation. The claim
// gate guarantees the ARITHMETIC; it cannot guarantee the comparison is MEANINGFUL.
// That judgement is the author's, and the answer here is NO.
//
// So both figures ride as CELLS, each labelled for exactly the quantity it is
// ("Days Since Listed" — a running age; "Typical Days to Sell" — a completed
// median over sold homes). Two precisely-labelled facts side by side in a strip
// assert nothing — and NEITHER IS EMPHASISED, because `emphasis` says which number
// wins the argument, and a comparison drawn in TYPOGRAPHY is still a comparison.
// The falsifiable sentence — "in line with" — is what shipped, and the narrator is
// now structurally incapable of writing it: IT IS HANDED NEITHER NUMBER.
//
// The ONE time relation that IS commensurable is median_dom vs median_dom — this
// ZIP against every other SWFL ZIP. Same metric, same cohort, same source, same
// window. `settledCount` computes it, and that settled sentence is the only
// relational fact the narrator gets.
//
// ── WHAT WE HOLD, AND WHAT EACH THING IS ─────────────────────────────────────
//
//   SOURCED (ships):
//     • LIST DATE — `/property-tax-history` → `property_history[].listing.list_date`.
//     • DAYS SINCE LISTED — today − list_date. A RUNNING AGE. Not days-to-contract.
//     • TYPICAL DAYS TO SELL — `housing_by_zip.median_dom`, cited, with its as-of.
//     • price · beds · baths · sqft · $/sqft · lot · type · new-construction · the
//       SIZE of the price cut — straight off the resolved vendor record.
//
//   NOT HELD — never asserted, in a cell or in prose:
//     • days-to-contract, the contract date, the contract price, any contract term
//     • the ORDER of the price cut relative to the contract
//     • whether the home was fast or slow, or how it compares to the area
//
//   NOT VENDOR-CONFIRMED: the pending status itself. `/search` `flags.is_pending`
//   is FALSE on the canonical fixture. "Under Contract" is the AGENT'S framing
//   (they picked this recipe for their own listing) — legitimate as a kicker,
//   never printed as a vendor-verified fact.
//
// Probed live 07/13/2026 — a VENDOR CEILING, not a code gap:
//   • `/search` has NO daysOnMarket field at all (zero date-bearing keys, 200 rows);
//   • on a genuinely pending row (property 5998615101, `is_pending: true`) the
//     tax-history `listing.status` STILL reads "for_sale" and there is NO "Pending"
//     event in `property_history`;
//   • `days_after_listed` is null on every event of both properties probed.
//   `cadence_registry.yaml:1800` says the same: "true per-listing days-on-market
//   [is a] genuine vendor ceiling… only aggregate median_days_on_market exists
//   (city/county/ZIP grain), not per-listing."
//
// ── THE SIX ANSWERS (playbook Part 6) ───────────────────────────────────────
//   1. SUBJECT — the listing address, already resolved into `ctx.facts`. NO SECOND
//      RESOLVER; we only ENRICH with the list date, the same shape as `withBaths`.
//   2. SKELETON — `buildLifecycleEmail`. THE CAMPAIGN'S ONE LAYOUT (see below).
//   3. CELLS — the campaign spec strip (beds · baths · sqft · lot · $/sqft · type),
//      plus THIS recipe's own middle: the TIMING line (listed · days since listed ·
//      the ZIP's typical days to sell).
//   4. CHART — NONE. The registry says `chart: "none"`; the slot is never created.
//   5. PROSE — this recipe's own narrator, wired to the claim gate.
//   6. FRAMING — the "Under Contract" ribbon, address-over-price hero, backup-offer CTA.
//
// ── THE LAYOUT IS NOT MINE (07/13/2026) ─────────────────────────────────────
//
// This file used to own its own grid, and so did the other six lifecycle recipes —
// seven files, seven layouts, one "campaign" that read as seven different companies.
// THIS ONE WAS THE WORST OF THEM: it emitted FOUR STACKED STAT GRIDS (3 + 3 + 3 + 1) —
// a wall of chunky cells where a listing flyer runs one hairline spec line.
//
// Operator: *"EACH EMAIL WOULD HAVE THE SAME LOOK, JUST DIFFERENT INFORMATION."*
//
// The shape now lives in ONE place — `lib/email/lifecycle-chrome.ts`. This recipe
// supplies the RIBBON WORD, the numbers, its own MIDDLE and a CTA. It does not get to
// invent a shape. Nothing about the SOURCING changed: every guard below is untouched.

import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { fetchNearbyValues } from "@/lib/listings/steadyapi";
import { canonStreet } from "@/lib/listings/resolve-subject";
import { loadParsedBrain } from "@/lib/fetch-brain";
import { asOfFromToken } from "@/lib/project/as-of";
import { createBlock } from "@/lib/email/doc/default-docs";
import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import { addressLineOf, listingSpecs, spec, specFootnote } from "@/lib/email/listing-flyer";
import { auditClaims, numeralsIn, settledCount, CLAIM_PROHIBITION } from "@/lib/deliverable/claims";
import { clearNarrativeSlots, fillNarrative } from "./shared";
import type { SettledClaim } from "@/lib/deliverable/claims";
import type { RecipeBuildContext } from "./index";
import type { EmailBlock, EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

// ── The vendor lane: the LIST DATE (the fact `/search` does not carry) ────────
//
// This duplicates the auth/header/empty-tolerant shape of lib/listings/steadyapi.ts
// on purpose: that file is SHARED and a parallel build must not touch it.
// REPORTED FOR EXTRACTION — `fetchActiveListDate` belongs next to `fetchSoldEvent`,
// which already fetches this exact body and reads one event type out of it.

const STEADY_BASE = "https://api.steadyapi.com/v1/real-estate";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://steadyapi.com",
  Referer: "https://steadyapi.com/",
};

/** One row of `body.property_history` — only the fields we read are typed. */
interface RawHistoryEvent {
  date?: unknown;
  event_name?: unknown;
  listing?: {
    status?: unknown;
    list_date?: unknown;
  };
}

/**
 * PURE: the ACTIVE for-sale listing's `list_date` out of a `/property-tax-history`
 * body, as an ISO instant — or null.
 *
 * A property carries its whole history: old sold listings, old rental listings, the
 * current one. We take the LATEST `list_date` among events whose own
 * `listing.status` is "for_sale" — the sale lane, current cycle. A prior sale
 * (status "sold"), a withdrawn one ("off_market") and every rental event are
 * excluded, so a 2023 sale's list date can never be mistaken for today's.
 *
 * Never throws; anything unexpected → null (→ the cell becomes an open slot).
 */
export function parseActiveListDate(body: unknown): string | null {
  const history = (body as { body?: { property_history?: unknown } })?.body?.property_history;
  if (!Array.isArray(history)) return null;
  let best: string | null = null;
  for (const row of history as RawHistoryEvent[]) {
    if (row?.listing?.status !== "for_sale") continue;
    const listed = row.listing.list_date;
    if (typeof listed !== "string" || !listed) continue;
    // ISO instants sort lexically — the max is the current cycle's list date.
    if (!best || listed > best) best = listed;
  }
  return best;
}

/**
 * PURE: an ISO instant → MM/DD/YYYY (the Rule-5 date format), in UTC so the output
 * cannot drift with the server's timezone. Anything unparseable → null.
 */
export function formatListDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return null;
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${t.getUTCFullYear()}`;
}

/**
 * PURE: whole days from the list date to `now`. THE CLOCK IS INJECTED, so this is
 * deterministic and the test drives it with a fixed instant.
 *
 * *** READ THE NAME. *** This is DAYS SINCE LISTED — a RUNNING AGE. It is NOT
 * days-to-contract, and re-labelling it as one is the exact fabrication that got
 * this recipe refuted. On an under-contract home the true market clock stopped at
 * a date we do not hold, while this count keeps ticking; it is therefore an UPPER
 * BOUND on nothing we are entitled to state and a comparand for nothing.
 *
 * It reaches the rendered email ONLY as a cell labelled "Days Since Listed". It is
 * NEVER handed to the narrator (see `NarratorInput`), so no sentence can relate it
 * to anything. Negative / unparseable / future-dated → null → an open slot.
 */
export function daysSinceListed(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  const n = now.getTime();
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
  const days = Math.floor((n - t) / 86_400_000);
  return days >= 0 ? days : null;
}

/** One `/property-tax-history` call → the active listing's list date, or null.
 *  Empty-tolerant by contract: no key, non-200, bad body → null, never throws. */
export async function fetchActiveListDate(propertyId: string): Promise<string | null> {
  const key = process.env.PHOTOS_API;
  if (!key || !propertyId) return null;
  try {
    const res = await fetch(`${STEADY_BASE}/property-tax-history?propertyId=${propertyId}`, {
      headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return parseActiveListDate(await res.json());
  } catch {
    return null;
  }
}

/**
 * The subject's LIST DATE (ISO), or null. Two hour-cached vendor calls, keyed off
 * the lat/lon the dispatcher already resolved:
 *
 *   1. `/nearby-home-values` — a property is the nearest property to its OWN
 *      coordinates, so the subject comes back as its own row (the same trick
 *      `withBaths` uses). That row is the ONLY place we can read the vendor's
 *      `property_id`, because `ListingFacts` carries neither an id nor a permalink.
 *   2. `/property-tax-history?propertyId=…` — the list date.
 *
 * This is NOT a second subject resolver: the house is already resolved. It is an
 * enrichment of the resolved subject, exactly like the bath count.
 *
 * Best-effort: any miss → null, and the timing cells become open slots. Never throws.
 */
export async function resolveSubjectListDate(facts: ListingFacts): Promise<string | null> {
  if (facts.lat == null || facts.lon == null || !facts.address) return null;
  const target = canonStreet(facts.address.split(",")[0] ?? "");
  if (!target) return null;
  try {
    const nearby = await fetchNearbyValues({ lat: facts.lat, lon: facts.lon, limit: 25 });
    const self = nearby.find((c) => canonStreet(c.addressLine) === target);
    if (!self?.propertyId) return null;
    return await fetchActiveListDate(self.propertyId);
  } catch {
    return null;
  }
}

// ── The AREA's timing — a fact about the ZIP, and a COMMENSURABLE peer set ────

/**
 * The ZIP's typical time-to-sell, PLUS the same metric for every other ZIP IN ITS OWN
 * METRO.
 *
 * `peers` is the ONLY commensurable comparand this recipe has: median_dom against
 * median_dom — identical metric, identical (sold) cohort, identical source (Redfin
 * via `housing_by_zip`), identical window. That is what `settledCount` computes over.
 * THERE IS DELIBERATELY NO `subjectDom` FIELD, no delta and no verdict: the old build
 * had all three and every one was a claim about an interval we do not hold.
 *
 * ── WHY THE PEER SET IS SCOPED TO THE METRO, AND WHY IT IS NOT A DETAIL ──────
 *
 * My first cut counted over EVERY row in `housing_by_zip` and called them "SWFL ZIP
 * codes we track". Probed live: the table holds 124 rows across FOUR Redfin metros —
 * Cape Coral (39, Lee), Naples (20, Collier), Punta Gorda (13, CHARLOTTE) and North
 * Port (52, SARASOTA/MANATEE). More than half of that set is outside our coverage
 * entirely, and CLAUDE.md locks the point: "Charlotte/Glades/Sarasota are NOT real
 * coverage today — don't claim them" (operator correction, 07/07/2026, after the docs
 * overclaimed "6-county").
 *
 * `settledCount` would have counted it PERFECTLY. 44 of 107 was arithmetically exact.
 * The SET was wrong — so the settled sentence, the one thing computed in code and
 * handed to the narrator as unimpeachable, would have shipped a coverage overclaim
 * AND compared a Fort Myers listing against Bradenton.
 *
 * *** THE CLAIM GATE GUARANTEES THE ARITHMETIC. IT CANNOT GUARANTEE THE POPULATION. ***
 * That is the author's job, and it is the same disease as the refutation wearing a
 * new host: a correct number welded to a false sentence.
 *
 * So the peer set is the subject's OWN metro, read off the row's own `metro` cell
 * (Redfin's `parent_metro_region` — no derivation, no crosswalk, no invention). That
 * is both in-scope AND a strictly better comparand: a Fort Myers ZIP is measured
 * against its own market, not against Sarasota.
 */
export interface MarketTiming {
  /** housing-swfl `housing_by_zip.median_dom` — Redfin, the ZIP's SOLD cohort. */
  areaDom: number;
  zip: string;
  /** Redfin's `parent_metro_region` for this ZIP, verbatim ("Cape Coral, FL"). The
   *  source's OWN label — we never re-map it to a county name we inferred. */
  metro: string;
  /** Every other ZIP IN THE SAME METRO's `median_dom`. The commensurable comparand. */
  peers: number[];
  /** MM/DD/YYYY, or null. NEVER the raw freshness token: rule 5 says state the as-of
   *  date in MM/DD/YYYY and never the raw token, which is INTERNAL. A token we cannot
   *  parse yields null and the citation simply names the source without a date —
   *  `marketSnapshotForZip` falls back to the raw token here, and that is a bug I am
   *  not repeating (REPORTED: `market-snapshot.ts:71` `?? brain.freshness_token`). */
  asOf: string | null;
}

const HOUSING_ZIP_TABLE = "housing_by_zip";

/**
 * housing-swfl → this ZIP's `median_dom` and every other ZIP's. One brain load.
 *
 * REPORTED FOR EXTRACTION: `lib/listings/market-snapshot.ts` already reads this
 * exact detail table for a single ZIP; a `medianDomByZip()` belongs there next to
 * `marketSnapshotForZip`. I cannot make that edit (shared file, parallel build), so
 * the read is duplicated here — and it is the SAME table, the SAME column and the
 * SAME `low_sample` guard, so the two cannot disagree about what median_dom means.
 *
 * Empty-tolerant: any miss → null → the area cells become open slots and the
 * narrator simply gets no area claim. Never throws, never invents a benchmark.
 */
export async function loadAreaTiming(
  zip: string,
  deps: { load?: typeof loadParsedBrain } = {},
): Promise<MarketTiming | null> {
  const want = String(zip ?? "").match(/\d{5}/)?.[0];
  if (!want) return null;
  const load = deps.load ?? loadParsedBrain;

  const brain = await load("housing-swfl").catch(() => null);
  const table = brain?.output?.detail_tables?.find((t) => t.id === HOUSING_ZIP_TABLE);
  if (!brain || !table) return null;

  /** The row's usable median_dom, or null. ONE guard, applied to subject and peers
   *  alike — so the two can never be filtered on different rules. */
  const domOf = (cells: Record<string, unknown>): number | null => {
    if (cells.low_sample === true) return null; // thin sample — never shown, never counted
    const dom = cells.median_dom;
    return typeof dom === "number" && Number.isFinite(dom) && dom > 0 ? dom : null;
  };

  const subject = table.rows.find((r) => r.key === want);
  if (!subject) return null;
  const subjectCells = subject.cells as Record<string, unknown>;
  const areaDom = domOf(subjectCells);
  const metro = subjectCells.metro;
  if (areaDom == null || typeof metro !== "string" || !metro) return null;

  // PEERS = THE SUBJECT'S OWN METRO ONLY. The table spans four Redfin metros, two of
  // which (Punta Gorda / North Port) are outside our coverage — counting over all of
  // them would be an exact count of the wrong population. See MarketTiming, above.
  const peers: number[] = [];
  for (const row of table.rows) {
    if (row.key === want) continue;
    const cells = row.cells as Record<string, unknown>;
    if (cells.metro !== metro) continue;
    const dom = domOf(cells);
    if (dom != null) peers.push(dom);
  }

  return { areaDom, zip: want, metro, peers, asOf: asOfFromToken(brain.freshness_token) };
}

// ── THE CLAIM GATE: every relation computed HERE, in code ────────────────────

/**
 * THE ONE RELATIONAL CLAIM THIS RECIPE MAKES, and it is computed by `settledCount`
 * — never by the model. This is the honest cousin of the comparison that got the
 * recipe refuted: instead of relating an unfinished clock to a sold median (not
 * commensurable, see the header), it relates SOLD MEDIAN TO SOLD MEDIAN.
 *
 * "38 of 51 SWFL ZIP codes we track have a longer typical time-to-sell than 33905."
 *
 * A count in WORDS is the digit lint's blind spot by construction — market-pulse
 * wrote "five of those six ZIPs" over a set whose true answer was four. So the
 * count is an integer comparison in code and the narrator may only restate it.
 *
 * PURE. Null when there is no peer set to count over.
 */
export function settleAreaTiming(timing: MarketTiming | null): SettledClaim | null {
  if (!timing || timing.peers.length === 0) return null;
  const slower = timing.peers.filter((p) => p > timing.areaDom).length;
  const counted = settledCount(slower, timing.peers.length, {
    // The metro is named VERBATIM from the row. Not "SWFL" (that set spans Sarasota
    // and Charlotte — a coverage overclaim), and not "Lee County" (a county name we
    // would have INFERRED from the metro; the source never says it).
    noun: `ZIP codes in the ${timing.metro} metro`,
    predicate: `have a longer typical time-to-sell than ${timing.zip}`,
  });
  // The claim rides with its own provenance, because the sentence is what SHIPS —
  // a citation that lives only in a variable is not a citation. Rule 5: MM/DD/YYYY,
  // never the raw freshness token. An unparseable token names the source and no date
  // rather than leaking `SWFL-7421-v9-20260629` into an agent's email.
  const cite = timing.asOf ? `SWFL Data Gulf, as of ${timing.asOf}` : "SWFL Data Gulf";
  const sentence = `${counted.sentence.replace(/\.$/, "")} (${cite}).`;
  return { sentence, anchors: numeralsIn(sentence) };
}

/**
 * THE STATUS, as a settled sentence — and it has to be one for a sharp reason.
 *
 * `auditClaims`' COMPARATIVE_QUANT fires on a positional word ("under", "over",
 * "above"…) that relates a QUANTITY within the same clause — and "UNDER contract"
 * puts the trigger word in the one sentence this email exists to write. An honest
 * "This home is under contract, and the asking price came down by $104,975" trips
 * it ("under" … "asking"), and fail-closed means an honest paragraph would be
 * thrown away.
 *
 * The answer is NOT to weaken the gate. It is to let CODE author the status
 * sentence, exactly as code authors every other claim here — and then the narrator
 * restates it verbatim, `auditClaims` recognises it as settled, and the trigger
 * word is spent on a sentence WE wrote.
 *
 * The status is the AGENT'S OWN framing (they picked this recipe for their listing).
 * The vendor does NOT confirm it — `/search` `flags.is_pending` is FALSE on the
 * canonical fixture — so it is never printed as a vendor-verified fact. PURE.
 */
export function settleStatus(): SettledClaim {
  return { sentence: "This home is under contract.", anchors: [] };
}

/** The vendor's new-construction flag, as a settled sentence. A flag, not a figure. PURE. */
export function settleNewConstruction(facts: ListingFacts): SettledClaim | null {
  if (!facts.isNewConstruction) return null;
  return { sentence: "It is new construction.", anchors: [] };
}

/**
 * The price cut, as a SETTLED SENTENCE.
 *
 * The AMOUNT is sourced (`price.reduced_amount`). The DATE of the cut is NOT, and
 * neither is the contract's — so this sentence states the amount and places it in
 * NO ORDER against anything. "The seller had reduced the price BEFORE a contract
 * was reached" is the sentence that shipped; there is no source on earth that
 * orders those two events for us.
 *
 * It is a SettledClaim (not a loose fact) for a hard structural reason: its two
 * numerals become ANCHORS, and `auditClaims` rejects any numeral the narrator
 * writes that no settled claim contains. Every digit the model may legally type is
 * therefore one CODE put in front of it. PURE.
 */
export function settlePriceCut(facts: ListingFacts): SettledClaim | null {
  if (!facts.isPriceReduced || !facts.priceReduction) return null;

  // ⚠️ "FROM THE ORIGINAL ASK" WAS A CODE-AUTHORED FALSEHOOD. Removed 07/13/2026.
  //
  // The vendor's price history for the acceptance fixture, pulled live:
  //     2026-04-29  Listed         $765,000   ← the ORIGINAL ask
  //     2026-06-09  Price Changed  $699,975
  //     2026-07-01  Price Changed  $595,000   ← current
  //
  // `reduced_amount` = 104,975 = 699,975 − 595,000. It is **THE MOST RECENT CUT** — NOT the
  // cut from the original ask, which is 765,000 − 595,000 = **$170,000**.
  //
  // So "came down by $104,975 from the original ask" understated the real cut by $65,025,
  // and implied an original ask of $699,975 — a price this home held only as a MID-CYCLE
  // step. A back-solved number is still an invented one.
  //
  // This is THIS FILE'S OWN REFUTED DISEASE, reincarnated one layer up: a real, correctly
  // sourced number **wearing the name of a quantity we do not hold** — structurally
  // identical to "went under contract after 75 days on market." And it was worse, because
  // CODE wrote it and wrapped it in a SettledClaim, which is the narrator's licence to
  // repeat it.
  //
  // Delete the word "original" and the sentence becomes TRUE: $104,975 IS exactly the last
  // cut, and $595,000 IS exactly where it landed. State only that.
  //
  // (The true original ask and the full $170,000 cut ARE sourceable — /property-tax-history
  // carries the whole price history. Reading it is an upgrade, not a fix; tracked as
  // `listing_price_history_original_ask`.)
  const sentence = facts.price
    ? `The asking price came down by ${facts.priceReduction}, to ${facts.price}.`
    : `The asking price came down by ${facts.priceReduction}.`;
  return { sentence, anchors: numeralsIn(sentence) };
}

/** PURE: every relation and every figure this recipe hands the narrator, computed in
 *  code. THIS IS THE WHOLE OF THE NARRATOR'S NUMERIC WORLD. */
export function settleAll(facts: ListingFacts, timing: MarketTiming | null): SettledClaim[] {
  return [
    settleStatus(),
    settleNewConstruction(facts),
    settlePriceCut(facts),
    settleAreaTiming(timing),
  ].filter((s): s is SettledClaim => s !== null);
}

// ── THE LAYOUT: THE CAMPAIGN CHROME, PLUS ONE MIDDLE BLOCK ───────────────────
//
// What this recipe used to do, and why it was the worst offender in the pile:
//
//   header · photo · hero(LEFT) · stats[3] · stats[3] · stats[3] · stats[1]
//
// FOUR STACKED STAT GRIDS. Ten chunky 32px cells in four rows — a WALL. The strip
// variant exists precisely to replace that: "five cells in a STRIP read as a spec
// line; five cells in a GRID read as a wall" (StatsBlock). Same data, entirely
// different email. `buildLifecycleEmail` now owns the shape:
//
//   header · RIBBON("Under Contract") · photo · hero(address over price) · SPEC STRIP
//          · [THE TIMING LINE — this recipe's own middle] · narrative
//          · agent card · CTA("Submit a Backup Offer") · footer
//
// The spec strip is the SAME six cells the New Listing flyer wears (`listingSpecs`),
// off the SAME resolved record — one shared authority, so a subscriber who got the
// New Listing email in April sees the identical spec line here in July. The PRICE
// moved out of the cells and into the hero, where the chrome puts it, so it is stated
// once and not twice.

/**
 * THIS RECIPE'S ONE MIDDLE BLOCK — THE TIMING LINE.
 *
 * The registry prompt asks to "set its time on the market against the area's typical
 * days on market." SET AGAINST — *in the LAYOUT*. Two precisely-labelled facts sitting
 * side by side, related by NO SENTENCE, anywhere, ever (see THE NON-COMMENSURABILITY
 * in the header: `median_dom` is a COMPLETED duration over homes that SOLD; the
 * subject's is a RUNNING count on a home that has not).
 *
 *   Listed            — a DATE we hold (the vendor's `list_date`). Asserts no interval.
 *   Days Since Listed — today − list_date. A RUNNING AGE. The label says exactly that:
 *     never "Days on Market" (an MLS term of art whose clock stops at pending), never
 *     "Days to Contract" (held by no source — that is the fabrication that shipped).
 *   Typical Days to Sell in {zip} — `median_dom`. The label says TO SELL because that
 *     is what it measures.
 *
 * NO CELL IS EMPHASISED. Emphasis says WHICH NUMBER WINS THE ARGUMENT — and the whole
 * point of this line is that these two clocks make no argument against each other. A
 * `primary` here would be a comparison drawn in typography, and a comparison is a
 * factual claim whichever layer states it.
 *
 * It is a STRIP, not a grid: the campaign has exactly one stat device, and a wall of
 * chunky cells is the thing this migration exists to delete. PURE.
 */
export function timingLine(opts: {
  listedOn: string | null;
  daysListed: number | null;
  timing: MarketTiming | null;
  zip?: string;
}): EmailBlock {
  const { listedOn, daysListed, timing } = opts;
  const zip = timing?.zip ?? opts.zip;
  const cells: StatItem[] = [
    spec(listedOn ?? undefined, "Listed"),
    spec(daysListed == null ? undefined : String(daysListed), "Days Since Listed"),
    spec(
      timing ? String(timing.areaDom) : undefined,
      zip ? `Typical Days to Sell in ${zip}` : "Typical Days to Sell Nearby",
    ),
  ];
  return {
    id: createBlock("stats").id,
    type: "stats",
    props: { stats: cells, variant: "strip" },
    // The chrome reads `layout.h` to stack it; x/y are re-assigned there.
    layout: { x: 0, y: 0, w: 12, h: 3 },
  };
}

export interface UnderContractGridOpts {
  facts: ListingFacts;
  current: EmailDoc;
  /** The subject's list date, MM/DD/YYYY, or null → an open slot. A DATE. */
  listedOn: string | null;
  /** today − list_date. A RUNNING AGE, never days-to-contract. Null → open slot. */
  daysListed: number | null;
  /** The ZIP's typical time-to-sell + its peer set, or null → open slots. */
  timing: MarketTiming | null;
}

/** PURE: facts → the positioned EmailDoc, wearing the campaign chrome. No I/O, so the
 *  test drives it with fixture data and makes zero live calls.
 *
 *  Never refuses (RULE 0.7): no photo → a canvas dropzone; no list date → an open slot
 *  whose LABEL is the instruction; no area median → an open slot. Never a zero. */
export function buildUnderContractGrid(opts: UnderContractGridOpts): EmailDoc {
  const { facts, current, listedOn, daysListed, timing } = opts;

  return buildLifecycleEmail(current, {
    // The ONE word that tells a reader which email in the campaign this is.
    ribbon: "Under Contract",
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: facts.address ?? "Property under contract",
          linkUrl: facts.sourceUrl,
        }
      : null,
    // Address over price — the chrome centres it. The old hero led with "75 days on
    // market": the fabricated interval, in the largest type on the page.
    heroValue: facts.price ?? "",
    heroLabel: addressLineOf(facts),
    // The campaign's spec line, from the shared authority. Identical to New Listing's.
    specs: listingSpecs(facts),
    specFootnote: specFootnote(facts),
    // THIS RECIPE'S OWN CONTENT. There is NO CHART: the registry declares
    // `chart: "none"` and the slot is never CREATED — not "reserved then dropped".
    // dom-vs-area needed this home's days-to-contract as its subject bar; that bar can
    // never be honestly drawn, and a fabricated comparison rendered as a PICTURE is
    // worse than one in prose — a chart reads as measured.
    middle: [timingLine({ listedOn, daysListed, timing, zip: facts.zip })],
    // "" = an OPEN SLOT. The builder clears every text slot and the narrator writes
    // into it (fillNarrative SKIPS a slot that already has content — that landmine
    // shipped 2,000 characters of raw MLS copy once already).
    narrative: "",
    // THE NEXT ACTION — not a restatement of what the reader is already looking at.
    ctaLabel: "Submit a Backup Offer",
    ctaUrl: facts.sourceUrl,
  });
}

// ── PROSE — and why this recipe does NOT use `authorListingNarrative` ────────
//
// I tried the shared narrator first, with this recipe's framing + the timing as
// context. It is the wrong tool here, and it FAILED THE HARD BLOCK. Live,
// 07/13/2026, on the 326 Shore Dr facts it INVENTED a physical attribute ("this
// three-story home"), RECITED the spec cells every run, and added SELLING CLAIMS of
// its own ("the scale here is notably generous") — all three forbidden by its OWN
// system prompt. The cause is structural: `authorListingNarrative` is a PROPERTY
// DESCRIPTION writer ("THIS EMAIL IS ABOUT THE HOUSE. Not the market") and it is
// handed the whole fact sheet. With no pasted MLS remarks it has nothing real to
// describe, so it fills the vacuum by reciting numbers and inventing qualities.
//
// An under-contract email is not a description — it is a TRANSACTION note. The photo
// and the grid already show the house. So the prose layer is owned HERE, and the
// narrator is handed almost nothing.

/**
 * INVENTION CLASS 1 — a claim about the HOUSE that is not a number: a view, a
 * waterfront, a pool, a renovation, a finish, a storey count. `gateNarrative` gates
 * NUMBERS only, and `auditClaims` gates RELATIONS — neither sees this. If one of
 * these words is not in the sources we handed the model, the model made it up.
 */
const ATTRIBUTE_CLAIMS = [
  "story",
  "stories",
  "storey",
  "storeys",
  "split-level",
  "waterfront",
  "water",
  "canal",
  "river",
  "gulf",
  "bay",
  "lake",
  "dock",
  "boat",
  "seawall",
  "pool",
  "spa",
  "hot tub",
  "jacuzzi",
  "view",
  "views",
  "vista",
  "overlook",
  "garage",
  "carport",
  "lanai",
  "porch",
  "patio",
  "deck",
  "courtyard",
  "balcony",
  "granite",
  "quartz",
  "marble",
  "hardwood",
  "stainless",
  "tile",
  "fireplace",
  "vaulted",
  "renovated",
  "remodeled",
  "remodelled",
  "updated",
  "upgraded",
  "restored",
  "gated",
  "golf",
  "beach",
  "waterside",
  "cul-de-sac",
  "fenced",
  "landscaped",
  "chef",
  "gourmet",
  "open-concept",
  "walk-in",
  "en-suite",
  "ensuite",
  "guest house",
  "casita",
] as const;

/**
 * OUR OWN BRAND IS ON THE BAN LIST, AND THAT IS A LAUNDERING HOLE.
 *
 * "SWFL Data Gulf" contains "gulf" — which `ATTRIBUTE_CLAIMS` bans, correctly, as in
 * "sweeping views of the gulf". Caught by the guard itself the moment the citation
 * started riding inside the settled sentence, and it cuts BOTH ways:
 *
 *   1. our own citation would fail our own gate, dropping every honest paragraph to
 *      the fallback — a silent, permanent degradation nobody would have noticed; and,
 *      far worse,
 *   2. once the citation sits in `sourceText`, "gulf" IS "in the sources" — so a model
 *      writing "sweeping views of the gulf" would be WAVED THROUGH by a word it read
 *      off our own byline.
 *
 * The brand is a PROPER NOUN, not a description of a house. Strip it from both sides
 * before matching, and both problems close at once.
 */
const BRAND_NAME = /\bSWFL Data Gulf\b/gi;

/**
 * PURE. Attribute words the paragraph asserts that the SOURCES never stated.
 * A non-empty result means the model invented — the paragraph is rejected, never
 * shipped. Word-boundary matched so "waterfront" in the agent's own pasted copy
 * legitimises "waterfront" in the prose.
 */
export function inventedAttributes(paragraph: string, sourceText: string): string[] {
  const src = sourceText.replace(BRAND_NAME, " ").toLowerCase();
  const body = paragraph.replace(BRAND_NAME, " ").toLowerCase();
  const hits = new Set<string>();
  for (const term of ATTRIBUTE_CLAIMS) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(body) && !re.test(src)) hits.add(term);
  }
  return [...hits];
}

/**
 * INVENTION CLASS 2 — a claim about the OFFER.
 *
 * The list price is the SELLER'S ASK. Nothing we hold says what the buyer agreed to
 * pay: `/search` carries `price.amount` (the ask) and a pending BOOLEAN, and no
 * endpoint carries a contract price. Live, 07/13/2026, the model wrote "the seller
 * accepted an offer at the current ask of $595,000" — a fabricated contract term
 * wearing a sourced number. The attribute guard cannot see it (every word is
 * legitimate), so it gets its own detector.
 */
const OFFER_CLAIM_PATTERNS: readonly RegExp[] = [
  /\boffer\s+(?:at|of|for)\s+\$/i,
  /\b(?:at|for)\s+(?:the\s+)?(?:full|current|list(?:ed)?|asking)\s+(?:price|ask)\b/i,
  /\b(?:over|above|below|under)\s+(?:the\s+)?(?:ask|asking)\b/i,
  /\bfull[-\s]price\s+offer\b/i,
  /\b(?:accepted|agreed to|took)\b[^.]{0,30}\b(?:the\s+)?(?:ask|asking price|list price)\b/i,
];

/** PURE: offer-price claims the paragraph makes that no source can support. Non-empty
 *  → the paragraph is rejected. Never shipped, not even when it sounds plausible. */
export function offerClaims(paragraph: string): string[] {
  return OFFER_CLAIM_PATTERNS.filter((re) => re.test(paragraph)).map((re) => re.source);
}

/**
 * INVENTION CLASS 3 — THE ONE THAT SHIPPED. A claim about TIME.
 *
 * The old build rendered "went under contract after 75 days on market, in line with
 * the 72-day median" and "reduced the asking price BEFORE A CONTRACT WAS REACHED" —
 * and BOTH the attribute guard and the offer guard returned clean, because a
 * fabricated INTERVAL carries digits that look sourced and every individual word is
 * legitimate.
 *
 * THE RULE THAT MAKES THIS GUARD SHARP: the sources handed to the model contain NO
 * DAY-COUNT AT ALL — not the subject's, not the area's (see `NarratorInput`, which
 * has no numeric field). So ANY duration in the paragraph is unsourced BY
 * CONSTRUCTION, and we ban all of them. No fragile subject-vs-area parsing.
 *
 * It bans, in the paragraph:
 *   • any duration ("75 days", "72-day", "three weeks", "a month");
 *   • any days-on-market phrasing;
 *   • any ORDERING of events against the contract or the price cut;
 *   • any SPEED characterization ("quickly", "didn't last", "snapped up");
 *   • any COMPARISON of this home to the area's typical.
 *
 * It is the recipe-specific twin of `auditClaims`, which catches the GENERIC claim
 * shapes (comparative / trajectory / count / sequence / spatial / motive /
 * unanchored number). Both run. Either one firing throws the paragraph away.
 */
const TIMING_CLAIM_PATTERNS: readonly RegExp[] = [
  // Any numeric duration — "75 days", "72-day", "3 weeks", "18 months".
  /\b\d+[\s-]*(?:day|week|month|year)s?\b/i,
  // Any spelled-out duration — "after seventy days", "in just two weeks".
  /\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|a few|couple of|handful of)\s+(?:day|week|month)s?\b/i,
  // Days-on-market phrasing in any form.
  /\bdays?\s+on\s+(?:the\s+)?market\b/i,
  /\bdays?\s+to\s+(?:contract|pending|offer)\b/i,
  /\btime\s+on\s+(?:the\s+)?market\b/i,
  /\bdays?\s+since\s+(?:it\s+was\s+)?listed\b/i,
  // ORDERING against the contract — the exact fabrication that shipped.
  /\b(?:before|prior to|ahead of|after|following|once|when)\s+(?:the\s+|a\s+|any\s+)?(?:contract|pending|going under contract)\b/i,
  /\bcontract\s+was\s+(?:reached|accepted|signed|executed|struck)\b/i,
  // ORDERING against the price cut — "after the reduction", "the cut then drew…".
  /\b(?:after|following|since|once|upon)\s+(?:the\s+)?(?:price\s+)?(?:cut|reduction|drop|adjustment|reprice)\b/i,
  /\b(?:led to|resulted in|prompted|triggered|brought(?:\s+in)?|drew|attracted|produced)\b[^.]{0,40}\b(?:contract|offer|buyer)\b/i,
  // SPEED characterization — ours to state, never the model's, and we never state it.
  /\b(?:quick|quickly|quicker|fast|faster|fastest|swift|swiftly|rapid|rapidly|speedy|speedily|brisk|briskly|slow|slower|slowly|sluggish|lingered|languished|promptly|immediately)\b/i,
  /\b(?:didn'?t last|did not last|flew off|snapped up|went fast|barely hit the market|no time at all|in record time)\b/i,
  // COMPARING this home to the area — a comparative claim is a factual claim.
  /\b(?:in line with|compared (?:to|with)|versus|vs\.?|against|outpac\w+|beat|bested|trailed|ahead of|behind)\b[^.]{0,40}\b(?:median|typical|average|area|market|zip)\b/i,
  /\b(?:median|typical|average)\b[^.]{0,30}\bdays?\b/i,
];

/** PURE: timing/sequence/speed claims the paragraph makes that no source can support.
 *  Non-empty → the paragraph is rejected. This is the hard block. */
export function timingClaims(paragraph: string): string[] {
  return TIMING_CLAIM_PATTERNS.filter((re) => re.test(paragraph)).map((re) => re.source);
}

/**
 * PURE: every reason this paragraph may not ship — the recipe's three invention
 * classes AND the generic claim gate. Empty = clean.
 *
 * FAIL-CLOSED: the caller throws the paragraph away on ANY entry. It is never
 * patched, never partially shipped, never "probably fine". Guessing correctly is
 * luck, not sourcing.
 */
export function proseViolations(
  paragraph: string,
  sourceText: string,
  settled: readonly SettledClaim[] = [],
): string[] {
  return [
    ...inventedAttributes(paragraph, sourceText),
    ...offerClaims(paragraph),
    ...timingClaims(paragraph),
    ...auditClaims(paragraph, settled).map((v) => `${v.kind}:${v.match}`),
  ];
}

// ── THE NARRATOR'S WORLD — and the proof it holds no raw set ─────────────────

/**
 * *** THE DONE-CONDITION, AS A TYPE. ***
 *
 * Everything the model is allowed to see. LOOK AT WHAT IS NOT ON IT: no `areaDom`,
 * no `daysListed`, no `peers`, no `price`, no `facts`, no number of any kind. The
 * ONLY digits that can reach the model live inside a `SettledClaim.sentence`, and
 * every one of those is in that claim's `anchors` — so `allowedNumerals` is a
 * SUPERSET of every numeral the narrator ever saw, and `auditClaims` rejects any
 * other digit it types.
 *
 * It cannot compare two numbers it was never given two of. It cannot count a set it
 * was never given. It cannot order two events it was never given dates for. That is
 * structural, and it is greppable: there is no field here to carry them.
 */
export interface NarratorInput {
  /** Relations computed IN CODE. The narrator may RESTATE these and derive nothing. */
  settled: SettledClaim[];
  /** LANE 2 — the agent's own listing copy, if they pasted any. Prose, not figures. */
  remarks?: string;
}

/** PURE: `NarratorInput` → the exact source lines the model is shown. Exported so a
 *  test can assert, on the richest possible input, that the raw figures NEVER appear. */
export function narratorSources(input: NarratorInput): string[] {
  return [
    "CONTEXT: this is an UNDER CONTRACT announcement. The status is the listing agent's " +
      "own — we hold NO contract date, NO days-to-contract figure, and NO term of the contract.",
    ...input.settled.map(
      (s) =>
        `SETTLED FACT (computed for you — restate it word for word, never re-derive): ${s.sentence}`,
    ),
    input.remarks ? `THE AGENT'S OWN LISTING DESCRIPTION:\n${input.remarks.slice(0, 1200)}` : null,
  ].filter(Boolean) as string[];
}

const CTA_HINT =
  "Backup offers are still being accepted — if this one was on your list, it is worth putting your position on paper now.";

/**
 * PURE: the deterministic note — zero model. THIS IS THE FLOOR: what lands when the
 * model violates the gate twice, or the API fails.
 *
 * It is assembled from SETTLED SENTENCES ONLY, plus a call to action that asserts no
 * fact — so it passes its own gate BY CONSTRUCTION, not by inspection. A test proves
 * `proseViolations(fallbackNote(input), sources, input.settled) === []` on the
 * richest possible input.
 *
 * THE OLD ONE FABRICATED BY CONSTRUCTION. It emitted "It went under contract after 45
 * days on the market - 27 days quicker than the 72-day median for ZIP 33905" — the
 * guaranteed-on-API-failure path was a guaranteed lie.
 */
export function fallbackNote(input: NarratorInput): string {
  return [...input.settled.map((s) => s.sentence), CTA_HINT].join(" ");
}

/**
 * The under-contract note. ONE constrained call, then a FAIL-CLOSED gate.
 *
 * The model is handed `narratorSources(input)` and nothing else — sources that carry
 * NO day-count, NO area median, NO contract term and NO loose number. The two
 * fabrications that got this recipe refuted are therefore not merely forbidden, they
 * are UNREACHABLE: there is no number in its context to build them out of.
 *
 * Two strikes → the deterministic note. Never invents, never blocks (RULE 0.7).
 */
export async function authorUnderContractNote(input: NarratorInput): Promise<string> {
  const sources = narratorSources(input);
  const sourceText = sources.join(" ");

  // Nothing beyond the bare status and no pasted copy → skip the model entirely (and
  // the spend): the deterministic note already says everything we hold.
  if (input.settled.length <= 1 && !input.remarks) return fallbackNote(input);

  const system =
    `You write ONE short paragraph (2–3 sentences) for a real-estate email announcing that ` +
    `a home has gone UNDER CONTRACT, and inviting BACKUP OFFERS.\n\n` +
    `THIS EMAIL IS ABOUT THE TRANSACTION, NOT A TOUR OF THE HOUSE. The photo shows the ` +
    `home and a spec grid directly above your paragraph already lists the price, beds, ` +
    `baths, square feet, lot and type. DO NOT LIST THEM BACK — a paragraph that recites ` +
    `the grid is a failure.\n\n` +
    // The exact rule the lint enforces, printed verbatim. A violation is then a
    // refusal to follow an explicit instruction, not a surprise.
    `${CLAIM_PROHIBITION}\n\n` +
    `AND, SPECIFIC TO THIS EMAIL:\n` +
    `1. *** YOU DO NOT KNOW ANYTHING ABOUT TIME. *** You do not know how long this home ` +
    `was on the market. You do not know when it went under contract, or how many days that ` +
    `took. You do not know when the price was cut, or whether it was cut before or after ` +
    `any contract. NEVER write a number of days, weeks or months. NEVER write "after N ` +
    `days", "days on market", "it took", "before a contract was reached", "after the price ` +
    `cut", or any sentence that puts two events in an order. NEVER say it was fast, quick, ` +
    `slow, "didn't last", or "snapped up". NEVER compare this home's timing to the area's ` +
    `typical. A paragraph that does ANY of these is thrown away.\n` +
    `2. A FACT ABOUT THE HOME IS NOT ONLY A NUMBER. You may NOT assert a view, water, a ` +
    `canal, a pool, a garage, a lanai, a storey count, a finish, a renovation, a school, ` +
    `a floor plan, or any neighborhood character unless the SOURCES state it. You have ` +
    `never seen this house.\n` +
    `3. Do not claim the home SOLD or CLOSED. It is under contract.\n` +
    `4. YOU DO NOT KNOW THE OFFER. The list price is the SELLER'S ASK — it is NOT what the ` +
    `buyer agreed to pay, and no source here states the accepted price or any term of the ` +
    `contract. Never write that an offer came in "at the asking price", "at full price", ` +
    `"over ask", or "below ask".\n` +
    `5. If the agent's own description is provided, you may draw ONE true detail from it, ` +
    `restated faithfully — but WITHOUT any number from it. Every digit you write must ` +
    `appear in a SETTLED FACT.\n` +
    `6. KEEP EACH SETTLED FACT IN ITS OWN SENTENCE, word for word. Do not merge two of ` +
    `them into one sentence and do not bolt a clause of your own onto one — a merged ` +
    `sentence is a NEW claim, and it is thrown away.\n\n` +
    `What you MAY say: any SETTLED FACT restated word for word, that backup offers are ` +
    `open, and one true NON-NUMERIC detail from the agent's description.\n\n` +
    `No hype, no exclamation marks. Plain, confident, specific. Return ONLY the paragraph.`;

  const user = `SOURCES:\n${sources.join("\n")}\n\nWrite the paragraph.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await getAnthropic("email_build").messages.create({
        model: EMAIL_MODEL_SONNET,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
      if (!text) continue;
      // THE HARD BLOCK, FAIL-CLOSED. An invented attribute, a fabricated contract
      // term, ANY timing claim, or ANY generic claim shape (`auditClaims`) and the
      // paragraph is thrown away — not once, not "it's probably right".
      if (proseViolations(text, sourceText, input.settled).length === 0) return text;
    } catch {
      break;
    }
  }
  // Two strikes (or an API failure): the deterministic note, which fabricates nothing.
  return fallbackNote(input);
}

// ── The builder ──────────────────────────────────────────────────────────────

export async function buildUnderContract(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → nothing is under contract. Fall through to the generic author
  // rather than announcing a house we don't have (never refuse, never fake one).
  if (!facts) return null;

  // Both timing facts, in parallel. Each is independently best-effort: a miss on
  // either becomes an OPEN SLOT, never a zero and never a guess.
  const zip = facts.zip ?? ctx.zip;
  const [listDateIso, timing] = await Promise.all([
    resolveSubjectListDate(facts).catch(() => null),
    zip ? loadAreaTiming(zip).catch(() => null) : Promise.resolve(null),
  ]);

  const doc = buildUnderContractGrid({
    facts,
    current: currentDoc,
    listedOn: formatListDate(listDateIso),
    // The ONLY subtraction in this module, and it produces a RUNNING AGE that lives
    // in a labelled cell and NOWHERE ELSE. It is not passed to the narrator.
    daysListed: daysSinceListed(listDateIso, new Date()),
    timing,
  });

  // PROSE. Every relation and every figure is computed HERE, in code, and handed over
  // as a settled sentence.
  //
  // *** THE DONE-CONDITION, IN ONE PLACE. *** `input` is the narrator's ENTIRE world,
  // and it is `settled` + the agent's own prose. NOT `facts`. NOT `timing`. NOT
  // `daysListed`. NOT `timing.peers`. The two numbers the refuted build compared —
  // the home's clock and the ZIP's median — are BOTH still in scope right here, on
  // this line, and NEITHER is passed. The narrator cannot compare two numbers it was
  // never given two of.
  const input: NarratorInput = { settled: settleAll(facts, timing), remarks: facts.remarks };

  // LANDMINE: fillNarrative SKIPS a text block that already has content, so CLEAR
  // first. (This grid leaves the slot empty by design, but the doc on the canvas may
  // not — and that is how 2,000 characters of raw MLS copy shipped once already.)
  const narrative = await authorUnderContractNote(input).catch(() => null);
  return narrative ? fillNarrative(clearNarrativeSlots(doc), narrative) : doc;
}
