// lib/deliverable/recipes/market-comps.ts
//
// R3 · MARKET COMPS — the EVIDENCE email. The one deliverable in the lifecycle that
// is genuinely ABOUT a number, so it is the one that earns the comps chart.
//
// ── THE LAYOUT IS NOT MINE. IT IS THE CAMPAIGN'S. ─────────────────────────────
//
// Operator, 07/13/2026: *"EACH EMAIL WOULD HAVE THE SAME LOOK, JUST DIFFERENT
// INFORMATION."* It was not the case. This file used to own its own grid — hero-left,
// photo, stats[3], stats[2], chart, list — and so did the other six, each invented by a
// different worker because there was nothing to build ONTO. Seven emails from one agent
// that looked like seven different companies.
//
// The shape now comes from ONE place: `buildLifecycleEmail` (lib/email/lifecycle-chrome.ts).
//
//   header · RIBBON · photo · hero(centred: address over price) · spec strip
//          · [MY MIDDLE: the comps chart + the evidence table] · narrative
//          · [MY TAIL: the sources] · agent card · CTA · footer
//
// What is MINE is the ribbon word ("Market Comps"), which cells ride the strip, the
// chart, the table, the sources and the CTA. THE SHAPE IS NOT MINE TO CHANGE. Enforced
// by campaign-coherence.test.ts.
//
// The five answers that ARE still mine (playbook Part 6):
//
//   1. SUBJECT — the same resolved house as New Listing. The dispatcher resolved it
//      (resolveSubject); we never resolve twice. What is DIFFERENT here is that the
//      subject's own list price is the CLAIM the email defends — so no price, no
//      argument (we still ship the grid; the case just becomes an open slot).
//   2. CELLS — the strip carries the TERMS OF THE COMPARISON, not a wall of stat rows:
//        beds · baths · sq ft · $/sq ft THIS HOME (primary — it wins the argument)
//        · $/sq ft COMP MEDIAN · the comp count (muted)
//      The footnote under the strip states the derivation, the MIX and the spread.
//      Every value is code-computed from the live comp set. Unsourced → open slot.
//   3. CHART — comps-bar, and the SUBJECT IS ITS OWN BAR (we hold its list price;
//      the chat comp lane omits a subject bar only because ITS subject has no price —
//      that reasoning does not transfer, so do not cargo-cult it here).
//   4. PROSE — the straight case for the asking price. This recipe deliberately does
//      NOT use `authorListingNarrative`: that narrator is told "THIS EMAIL IS ABOUT
//      THE HOUSE, not the market, not the comps… do not turn this into a market
//      analysis", which is exactly the email we are writing. It would refuse the job.
//      Ours permits the price argument and keeps every no-invention guardrail.
//   5. CTA — "Talk Through These Numbers". The next action, never a pointer back at the
//      comps the reader is already looking at.
//
// ── THE HARD RULE, LEARNED THE HARD WAY ──────────────────────────────────────
// *** A COMP MUST HAVE beds AND sqft, OR IT IS A VACANT LOT. ***
// The nearby set mixes bare land in with homes. Verified live 07/13/2026: `315 Shore
// Dr` comes back with beds:null, baths:null, sqft:null and a $139,800 valuation.
// Charting a $139.8k lot against a 2,847 sq ft house makes the ask look like a bargain
// for a fake reason — and the narrator, reading its own chart, then wrote a sentence
// on that misreading. FILTER BY DATA, NEVER BY GUESSING AT THE NAME (the lot's name is
// "315 Shore Dr" — it looks exactly like its neighbors).
//
// This filter (`isComparableHome`) now lives in `recipes/shared.ts` (Task 8's copy-#2
// extraction) — price-reduced.ts's own chart needs the identical rule and imports it
// from there rather than redefining it.
//
// ── THE OTHER HONESTY PROBLEM: NOT EVERY COMP IS A SALE ───────────────────────
// `compsForAddress` tags each price: a recorded `sold`, a realtor.com `estimate`
// (AVM), or a `last_list`. On the live fixture only 2 of 5 real homes are recorded
// sales; the rest are current valuations. Every number is sourced — so this constrains
// the PROSE, it never blocks the build. The registry prompt no longer promises "six
// LIVE comparable listings" (it never had six live listings to give), and the MIX is
// now stated on FOUR surfaces the reader cannot miss: the chart bar suffix "(est.)"
// (buildSoldCompsSpec), the evidence table's TITLE, each row's own "Sold 08/29/2025" /
// "Estimated value 06/08/2026" line, and the stat cell's label. The narrator is handed
// the mix as a SETTLED COUNT — it never counts anything itself.
//
// ── THE CLAIM GATE (lib/deliverable/claims.ts) — WIRED HERE ───────────────────
// This recipe is the reason claims.ts exists. It shipped, to a rendered artifact, a
// comparison that was INVERTED (see the guard block above `buildPriceCase`). The fix is
// structural and it is greppable:
//
//   `buildNarratorPrompt(facts, pc)` DOES NOT TAKE THE COMP ARRAY. It cannot. There is
//   no `RenderComp` in its signature, so there is no raw comp set for it to serialize,
//   so the model is never handed two comp numbers to draw a third claim between. The old
//   version passed `compLines` — every comp's address, price, sq ft and $/sq ft — and
//   then asked the model, politely, not to compare them. It compared them.
//
// Every relation is computed in code (`compareToSet`, `settledCount`, `buildPriceCase`)
// and handed over as a SETTLED ENGLISH SENTENCE. `auditClaims` is the fail-closed
// backstop underneath: any violation and the narrator's paragraph is DROPPED to an open
// slot — the code-authored verdict still ships, because it is true by construction.

import { compsForAddress, type RenderComp } from "@/lib/assistant/comp-helper";
import { saleDateLabel } from "@/lib/assistant/comp-rank";
import { resolveCompPhotos } from "@/lib/listings/comp-photos";
// NOTE: `fetchApifyComps` / `pickAddressMatch` are deliberately NOT imported here any
// more. The subject-record call that used them was a paid vendor round-trip that could
// not succeed by construction — see the block comment at the subject-record read below.
// The paid ZIP pull this recipe still makes goes through `resolveCompEnrichment`, which
// is cache-first and now sits behind the process spend guard (apify-spend-guard.ts).
import { resolveCompEnrichment } from "@/lib/listings/apify-identity";
import { fetchCachedRecordLoose } from "@/lib/listings/apify-record-store";
import { spendLedger } from "@/lib/listings/apify-spend-guard";
import {
  buildDescriptionBlock,
  upsertDescriptionBlock,
  emptyDescriptionSlot,
  dropEmptyDescriptionSlot,
} from "@/lib/email/listing-description-block";
import { formatSoldSpell } from "@/lib/listings/dom";
import {
  auditClaims,
  CLAIM_PROHIBITION,
  compareToSet,
  numeralsIn,
  settledCount,
  type SettledClaim,
} from "@/lib/deliverable/claims";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_SONNET } from "@/lib/email/model-router";
import { createBlock } from "@/lib/email/doc/default-docs";
import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import type { ChromeBlock } from "@/lib/email/lifecycle-chrome";
import { addressLineOf, pricePerSqft, spec } from "@/lib/email/listing-flyer";
import { chartMagnitudeFromSpec, type ChartMagnitude } from "@/lib/deliverable/chart-coherence";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import {
  clearNarrativeSlots,
  fillNarrative,
  FAVORABLE_FRAMING_POLICY,
  isComparableHome,
  median,
  perSqft,
} from "./shared";
import { marketCompsSubject } from "./subject-lines";
import type { RecipeBuildContext } from "./index";
import type { EmailBlock, EmailDoc, ListItem, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** How many comparable HOMES the email shows. The registry prompt says six; if the
 *  block only yields five real homes we ship five — a count is sourced like any other
 *  fact, and manufacturing a sixth to satisfy a sentence is invention. */
const MAX_COMPS = 6;

/** Pull more than we show, because the land filter below will eat some of them. The
 *  nearby fetch is ONE vendor call whose page we already paid for (limit 25), and the
 *  sold-event enrichment is capped at 2 regardless of topN — so this widens the net
 *  for free. Verified live 07/13/2026: 12 nearby → 11 homes + 1 vacant lot. */
const COMP_POOL = 12;

/** The floor under "every comp has a photo" (operator decree 08/04/2026). Below this the
 *  FULL ranked set ships instead: a price-defence email built on one comp defends nothing,
 *  and a vendor outage must never masquerade as a thin market. Two is the minimum from
 *  which a median and a range mean anything at all. */
const MIN_PHOTOGRAPHED_COMPS = 2;

/** How stale a CACHED subject record may be and still supply the listing URL and style.
 *  Both are stable facts about a house — a listing's permalink and its architectural
 *  style do not change while it sits on the market — which is the same reasoning behind
 *  `paid-record-lane.ts`'s 365-day `SPEC_MAX_AGE_DAYS`. This lane may never serve a
 *  MOVING fact (price, status, days on market) from a cached row, and it does not. */
const SUBJECT_RECORD_MAX_AGE_DAYS = 365;

/** Parse a verbatim vendor string ("$595,000", "2847") to a number. 0 → null. */
function num(s?: string): number | null {
  const n = Number((s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** THE SUBJECT IS NOT ITS OWN COMP. Normalized street-line exact match only (house
 *  number + street name, city/state/zip stripped) — never a fuzzy/partial match that
 *  could wrongly drop a real, different nearby home (e.g. two houses sharing a
 *  street name in different cities). A miss on `subjectAddress` never excludes
 *  anything — the caller decides what to do with an unresolved subject. */
export function isNotSubjectAddress(c: RenderComp, subjectAddress: string | undefined): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const subj = norm((subjectAddress ?? "").split(",")[0] ?? "");
  if (!subj) return true;
  return norm(c.addressLine) !== subj;
}

/** THE MAX AGE for a recorded sale to still count as evidence for TODAY's asking
 *  price. Operator decree, 08/03/2026: "comps can't be from more than 6 months to a
 *  year ago." Only touches `priceKind === "sold"` rows with a real date — a
 *  valuation/estimate carries no sale to go stale on, and a sale with no date on
 *  record can't be judged, so neither is dropped by this filter. */
const MAX_SOLD_AGE_DAYS = 365;

export function isFreshSale(c: RenderComp, now: Date): boolean {
  if (c.priceKind !== "sold") return true;
  if (!c.priceDate) return true;
  const soldMs = Date.parse(c.priceDate);
  if (!Number.isFinite(soldMs)) return true;
  const ageDays = (now.getTime() - soldMs) / 86_400_000;
  return ageDays <= MAX_SOLD_AGE_DAYS;
}

/** "2026-06-08" → "06/08/2026" (house rule: MM/DD/YYYY, never the raw token). */
function mdy(iso: string | null): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : undefined;
}

/** The date THE RECORD ACTUALLY CARRIES, at the precision it carries it.
 *
 *  *** A DAY WE WERE NEVER TOLD IS AN INVENTED FACT. *** Our own lake comp lane reads
 *  `sale_month` and tags every row `dateGrain: "month"` (comp-source-lake.ts:167) because
 *  "every row is day-of-month 1 by construction". `RenderComp` has carried that tag since
 *  the lane was built, the chat lane has always honoured it ("sold in May 2026"), and the
 *  ranker honours it — this row renderer did not. It called `mdy()` unconditionally, so a
 *  month became "05/01/2026" and a price-defence email printed five recorded sales all
 *  dated the first of the month. Found by rendering and looking, 08/05/2026 (§2.3.4).
 *
 *  `saleDateLabel` (comp-rank.ts) is the ONE root for this and is reused verbatim rather
 *  than re-derived here — the whole defect was a second formatter that did not know. */
function priceDateLabel(c: RenderComp): string | undefined {
  return saleDateLabel(c.priceDate, c.dateGrain ?? "day") ?? undefined;
}

/** What the price actually IS — never dressed as a sale it was not. The chat lane's
 *  own vocabulary ("sold … on", "estimated value", "last listed"), kept honest.
 *  A recorded sale with a known spell adds "· sold in N days" (code-computed off the
 *  same vendor response — spec 2026-07-16-listing-dom-design.md §4). */
function priceKindPhrase(c: RenderComp): string {
  if (c.priceKind === "sold") {
    const d = priceDateLabel(c);
    const spell = formatSoldSpell(c.soldInDays);
    const base = d ? `Sold ${d}` : "Sold";
    return spell ? `${base} · ${spell}` : base;
  }
  if (c.priceKind === "estimate") {
    const d = priceDateLabel(c);
    return d ? `Estimated value ${d}` : "Estimated value";
  }
  return "Last listed";
}

/** One evidence row: "$385,000 · $195/sq ft" over "336 Shore Dr Lot 58 · 3 bd ·
 *  1,976 sq ft · Sold 05/23/2025", click-through to the comp's captured page.
 *
 *  NOTE (copy #2 watch): `soldCompsListBlock` (sold-comp-blocks.ts) builds the OTHER
 *  comp row — price + date, no $/sq ft — for the "Recent sales nearby" context list.
 *  This one is the evidence table: $/sq ft is the whole argument, so it must be on the
 *  row. Two different rows for two different jobs. If R5 (Just Sold) ends up needing
 *  THIS row too, that is copy #2 and it should be extracted into sold-comp-blocks.ts. */
/** A REAL photo of each comparable home, from our own lake (`lib/listings/comp-photos`).
 *  Operator decree 08/03/2026: a property visual is a PHOTO OF THAT LISTING or it is
 *  NOTHING — the satellite-aerial thumbnail that used to fill this slot is deleted, and
 *  no substitute image (aerial, street view, map tile, placeholder) may take its place.
 *  A comp we hold no photo for ships with no image and keeps its realtor.com link. */
export async function resolveCompThumbnails(
  comps: RenderComp[],
  zip?: string,
): Promise<{
  thumbnails: Map<string, string>;
  styles: Map<string, string>;
  listingUrls: Map<string, string>;
  /** Total baths off the SAME paid record as the photo — see the note at the fill site. */
  baths: Map<string, number>;
}> {
  const thumbnails = new Map<string, string>();
  const styles = new Map<string, string>();
  const listingUrls = new Map<string, string>();
  const baths = new Map<string, number>();
  try {
    // ── LANE 1 · OUR OWN LAKE. Free. Photos only; the nightly sweep's window opened
    // 06/30/2026, so a comp set reaching back 6-12 months mostly predates it and this
    // lane legitimately returns little. NO `enrich` here on purpose — lane 2 is now a
    // per-address lookup and no longer belongs inside the photo resolver.
    for (const [k, v] of await resolveCompPhotos(comps)) thumbnails.set(k, v);

    // ── LANE 2 · CACHE FIRST, then ONE **DATED ZIP PULL** — and it is not cheap.
    //
    // *** THE PARAGRAPH THAT USED TO SIT HERE SAID "ONE VERIFIED LOOKUP PER HOUSE … at
    // most one verified call per remaining comp" AND THAT IS NOT WHAT HAPPENS. *** It
    // described a per-property lookup the vendor does not sell. `apify-identity.ts` ran
    // this to ground on 08/04/2026 and says so in its own header: a street address is
    // accepted and silently treated as an AREA CENTRE, `radius` is ignored, so the only
    // thing purchasable is an area over a date range. `resolveCompEnrichment` therefore
    // buys the ZIP narrowed to the months our comps actually sold in — up to 200 records
    // PER SALE MONTH (`DEFAULT_MAX_PAID_RESULTS_PER_MONTH`), not one per comp.
    //
    // *** THE MEASURED PRICE, 08/05/2026, ONE BUILD ON 8348 SOUTHWINDBAY CIR: two sale
    // months, 395 records bought, ~$3.95, 2 of 3 uncached comps joined. *** The record
    // store went 26 → 383 rows and the SECOND build on the same house bought ZERO. So
    // the cost is real but it is per ZIP-and-window, not per email, and it amortises —
    // which is exactly why the cache lane runs first and why a walk should stay on one
    // subject. A comment that quotes ~$0.01 for that is not a rounding error, it is the
    // wrong order of magnitude in the one place a builder looks before spending.
    //
    // `resolveCompEnrichment` reads `data_lake.apify_property_records` first (free, and
    // the reason we stop re-buying the same houses). It returns the LISTING URL too —
    // the Lee lake comp lane
    // sets `sourceUrl: null` (comp-helper.ts:291) because deed data carries no listing
    // page, which is why every comp row rendered unlinked.
    const enrichment = await resolveCompEnrichment(
      comps.map((c) => ({
        addressLine: c.addressLine,
        city: c.city,
        // A recorded sale lives in the `sold` index; a valuation or last-list is an
        // ACTIVE record and lives in `for_sale`. Asking the wrong index returns only
        // this house's neighbours, every one of which `matchesAddress` correctly
        // rejects — an empty slot with no error, which is the failure shape this whole
        // module exists to kill.
        listingType: (c.priceKind === "sold" ? "sold" : "for_sale") as "sold" | "for_sale",
        // THE FIELD THAT DECIDES THE SPEND. The paid lane narrows the ZIP to the window
        // these dates describe and buys NOTHING without one — so a build on the vendor's
        // AVM lane (every `priceDate` null, comp-helper.ts:440) costs zero rather than
        // paying for an unwindowed sweep that can only join 0 of 6.
        priceDate: c.priceDate,
      })),
      { state: "FL", zip },
    );
    for (const [addressLine, e] of enrichment) {
      // The lake's photo ALWAYS wins — we never pay to replace a free hit.
      if (e.photoUrl && !thumbnails.has(addressLine)) thumbnails.set(addressLine, e.photoUrl);
      if (e.listingUrl) listingUrls.set(addressLine, e.listingUrl);
      if (e.style) styles.set(addressLine, e.style);
      // BATHS FROM THE VENDOR RECORD. Operator, 08/04/2026: *"Why the fuck is baths not in
      // from fucking [Apify]!!!!?????"* — it never was. This lane read photo, link and
      // style off a 69-field record we had already paid for and dropped `full_baths` /
      // `half_baths`, so a comp whose bath count the lake did not hold rendered without
      // one even though the answer was sitting in the same response. Zero extra calls.
      // The LAKE still wins where it has a value (see the merge below): it is a recorded
      // county figure, the vendor's is an MLS listing figure.
      if (e.baths != null) baths.set(addressLine, e.baths);
    }
    return { thumbnails, styles, listingUrls, baths };
  } catch {
    // A miss is an empty slot, never a build failure.
    return { thumbnails, styles, listingUrls, baths };
  }
}

/** @param listingUrl the vendor listing page resolved for THIS comp. The Lee lake comp
 *  lane sets `sourceUrl: null` (deed data has no listing page), so without this every
 *  row rendered unlinked — breaking the half of the decree that survives a missing
 *  photo: "no photo -> still a link, never a placeholder image." */
function compRow(c: RenderComp, thumbUrl?: string, listingUrl?: string): ListItem {
  const ppsf = perSqft(c.price, c.sqft);
  const lead = [usd(c.price as number), ppsf ? `${usd(ppsf)}/sq ft` : ""]
    .filter(Boolean)
    .join(" · ");
  // *** BATHS. *** Operator, 08/04/2026: *"Where the fuck is baths?????????????????"*
  //
  // He is right and it was never here. The row printed "3 bd · 1,976 sq ft" and dropped the
  // bath count on the floor — while `RenderComp.baths` was populated, `lee_comp_sales_v`
  // SELECTS `baths` explicitly, and the LeePA layer-23 join that supplies it was wired on
  // 08/02/2026. The data travelled the whole pipeline and then simply wasn't rendered. It
  // is also half of the operator's own comparability rule ("WE WANT SIMILAR SQ FT, STYLE,
  // BEDS AND BATHS SAME OR CLOSE ... WE ARE FUCKING COMPARING!!!") and the ranker already
  // scores on it — so the email was hiding a dimension it was actively sorting by.
  //
  // Half-baths are real (2.5), so this is NOT integer-formatted. Absent → the segment is
  // omitted, never a "0 ba" that asserts a bathless house.
  const text = [
    c.addressLine,
    c.beds != null ? `${c.beds} bd` : "",
    c.baths != null ? `${c.baths} ba` : "",
    c.sqft != null ? `${c.sqft.toLocaleString("en-US")} sq ft` : "",
    priceKindPhrase(c),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    lead: lead.slice(0, 40),
    text: text.slice(0, 200),
    ...(c.sourceUrl || listingUrl ? { linkUrl: c.sourceUrl ?? listingUrl } : {}),
    ...(thumbUrl ? { imageUrl: thumbUrl, imageAlt: `Listing photo of ${c.addressLine}` } : {}),
  };
}

/** "(2 recorded sales, 3 valuations)" — THE MIX. The registry prompt used to promise
 *  "six LIVE comparable listings" and the set is nothing of the kind: it is recorded
 *  sales plus current valuations. So the mix is stated on the FACE of the email, in the
 *  stat cell AND on the evidence table's own title, and a reader can never mistake an
 *  AVM for a sale. Singular/plural handled; a zero side is simply not mentioned. */
function mixParen(comps: RenderComp[]): string {
  const sold = comps.filter((c) => c.priceKind === "sold").length;
  const rest = comps.length - sold;
  const parts = [
    sold ? `${sold} recorded ${sold === 1 ? "sale" : "sales"}` : "",
    rest ? `${rest} ${rest === 1 ? "valuation" : "valuations"}` : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** The evidence table's title — the mix again, where the rows actually are. */
function mixTitle(comps: RenderComp[]): string {
  return `The comparable homes${mixParen(comps)}`;
}

/** Every comp's $/sq ft, ascending. The set this whole email argues over. */
function compPpsfs(comps: RenderComp[]): number[] {
  return comps
    .map((c) => perSqft(c.price, c.sqft))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
}

/**
 * THE SPEC STRIP — the campaign's one hairline row, carrying THE TERMS OF THE COMPARISON.
 *
 * This used to be TWO chunky stat grids stacked on each other (row A: the subject; row B:
 * the evidence) — a wall, and a shape no other email in the campaign wore. The strip is
 * the campaign's, so the comps email says the same things in the same row: the subject's
 * spec line, then the ONE number that wins the argument, then the set it is judged against.
 *
 *   $/Sq Ft (this home's price ÷ its sqft) is `primary`: it IS the claim, in the accent.
 *   Median (the comp set's own $/Sq Ft)    carries no emphasis — it is what the claim is
 *   judged against, not a second claim.
 *
 * An unsourced value is "" — an OPEN SLOT on the canvas (the label is the instruction)
 * and ABSENT from the sent email. Never a zero, never a made-up median.
 */
export function compsSpecs(facts: ListingFacts, comps: RenderComp[]): StatItem[] {
  const medianPpsf = median(compPpsfs(comps));
  return [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(num(facts.sqft)?.toLocaleString("en-US"), "Sq Ft"),
    // *** LABELS MUST FIT ONE LINE, AND MUST MATCH THE CAMPAIGN'S OWN WORDS. ***
    // Operator, 08/04/2026, on the sent email — twice: *"Fonts, grids, sizes"* AND *"it's
    // $ sq. ft."* / *"why the fuck is it not nicely formatted... it's not hard to make
    // them the same."* Both complaints trace to the same root: this recipe invented its own
    // label text instead of reusing `listingSpecs` (`listing-flyer.ts`), which this repo's
    // own header names as "the REFERENCE for the other six: copy this shape." That file
    // already solved BOTH problems at 94px cells (six-cell strip, tighter than this five-cell
    // one): `"$/Sq Ft"` for the price-per-square-foot cell, `"DOM"` for days-on-market, no
    // emphasis on either. "This home" named nothing (the reader has no way to know it is a
    // dollar figure without reading the value), "Comp median" (11 uppercase chars, two of
    // them M) wrapped to two lines and broke the shared label baseline every other cell
    // shares (`tallest`/`lines()` in StatsBlock.tsx), and "Days listed"/`"muted"` rendered
    // smaller and greyer than its neighbors for no reason `listingSpecs` shares — three
    // gratuitous divergences from the one recipe already proven at a TIGHTER cell width.
    // Fixed by conforming, not by re-deriving: `"$/Sq Ft"` beside `"Median"` reads as the
    // same unit compared two ways (the footnote states the range in that unit already), and
    // `"DOM"` matches the reference file's own label for the same underlying number.
    spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft", "primary"),
    spec(medianPpsf ? usd(medianPpsf) : undefined, "Median"),
    // DAYS ON MARKET — our own `listing_dom` root (docs/standards/data-roots.md:279
    // names "email DOM" as a wire target), attached by the lake resolve lane and NEVER
    // a first-seen floor. It took the cell the comp COUNT used to hold: that count is
    // already stated in the footnote, on the evidence table's own title, and in the
    // narrator's verdict — three surfaces — while how long THIS house has been on the
    // market appeared nowhere at all. Absent → an open slot, never a zero.
    spec(
      facts.daysOnMarket != null && facts.daysOnMarket >= 0
        ? String(facts.daysOnMarket)
        : undefined,
      "DOM",
    ),
  ];
}

/** THE SUBJECT'S OWN DIMENSIONS, handed to the comp lookup so the size-band ranker
 *  (`lib/assistant/comp-rank.ts`, built to Fannie B4-1.3-08) actually engages.
 *
 *  `compsForAddress` ranks ONLY when it is told the subject's size (comp-helper.ts:397)
 *  — otherwise it falls through to the vendor's raw nearest-first slice, which is the
 *  exact `nearby.slice(0, topN)` the ranker was written to replace, and is how a
 *  $385,000 home got defended with $850,000 and $721,000 "comparables" (operator,
 *  08/03/2026). Nothing here is derived or guessed: an unlisted or unparseable
 *  dimension is simply absent, because ranking against an invented size would invent
 *  the very fact it filters on. */
export function subjectDims(facts: ListingFacts): {
  subjectSqft?: number;
  subjectBeds?: number;
  subjectBaths?: number;
} {
  const sqft = num(facts.sqft);
  const beds = num(facts.beds);
  const baths = num(facts.baths); // 3.5 stays 3.5 — a half bath is a real difference
  return {
    ...(sqft != null ? { subjectSqft: sqft } : {}),
    ...(beds != null ? { subjectBeds: beds } : {}),
    ...(baths != null ? { subjectBaths: baths } : {}),
  };
}

/**
 * THE CHART — $/sq ft, not total price.
 *
 * Operator, 08/03/2026: *"COMPARABLES ARE JUST THAT, COMPARABLE, SO IT'S A TERRIBLE
 * CHART TO PUT IN THE EMAIL. PRICE IS GOING TO BE SIMILAR."* He is right, and the
 * size-band fix above makes him MORE right: once the set is genuinely comparable, total
 * prices cluster by construction and six near-identical bars carry no information.
 *
 * $/sq ft is the number this email actually argues over — the strip's `primary` cell,
 * the footnote's spread, and every relation `buildPriceCase` computes. The subject is
 * its own first bar; comps sort ascending so the reader sees where the ask lands in the
 * band. A comp with no price or no size has no $/sq ft and simply is not plotted.
 */
export function compsPpsfSpec(
  facts: ListingFacts,
  comps: RenderComp[],
  asOfIso: string,
): ChartSpec | null {
  const subjectPpsf = perSqft(num(facts.price), num(facts.sqft));
  if (subjectPpsf == null) return null;
  const kindSuffix = (c: RenderComp) =>
    c.priceKind === "sold" ? "" : c.priceKind === "estimate" ? " (est.)" : " (list)";
  const plotted = comps
    .map((c) => ({ c, ppsf: perSqft(c.price, c.sqft) }))
    .filter((x): x is { c: RenderComp; ppsf: number } => x.ppsf != null)
    .sort((a, b) => a.ppsf - b.ppsf);
  if (plotted.length < 2) return null; // one bar next to the subject is not a comparison
  const street = (facts.address ?? "").split(",")[0]?.trim() || "This home";
  return {
    frameId: "bar-table",
    title: "Price per square foot — this home vs the comparable homes",
    columns: ["Property", "$/Sq Ft"],
    rows: [
      [`${street} (Subject)`, Math.round(subjectPpsf)],
      ...plotted.map((x) => [`${x.c.addressLine}${kindSuffix(x.c)}`, Math.round(x.ppsf)]),
    ] as (string | number | null)[][],
    value_format: "usd",
    chart_type: "bar",
    asOf: asOfIso,
    source: { citation: "SWFL Data Gulf · realtor.com", url: "https://www.realtor.com" },
  } as ChartSpec;
}

/** The magnitude this chart hands the coherence gate — deliberately `"other"`.
 *
 *  `assertHeroChartCoherence` compares like with like, and its own header says a
 *  cross-class pair is always coherent. $195 per square foot under a $595,000 asking
 *  headline IS such a pair, but the module's four-way `UnitClass` has no per-area
 *  class, so reading this spec's `value_format: "usd"` literally would make the gate
 *  false-fire and SILENTLY DROP the chart on every build. This is not a bypass: the
 *  gate exists to catch a headline sitting orders of magnitude outside bars in the
 *  SAME unit, and these are not the same unit. Pinned by test. */
export function ppsfChartMagnitude(spec: ChartSpec): ChartMagnitude | null {
  const m = chartMagnitudeFromSpec(spec);
  return m ? { ...m, unit: "other" } : null;
}

/**
 * THE FOOTNOTE UNDER THE STRIP — the derivation, THE MIX, and the spread.
 *
 * The mix used to ride in a stat LABEL ("Comparable homes (2 recorded sales, 3
 * valuations)"). A grid cell could carry 48 characters; a STRIP cell is a 9px uppercase
 * caption in a sixth of the email's width, and that label would have wrapped to five
 * ragged lines and dragged the whole strip out of shape. The footnote is the element the
 * strip already has for exactly this — full width, centred, under the row.
 *
 * So the mix is STILL on the face of the email, on four surfaces a reader cannot miss:
 * here, the evidence table's own title, each row's "Sold 08/29/2025" / "Estimated value
 * 06/08/2026" line, and the chart's "(est.)" bar suffix.
 *
 * Never truncated mid-number: the schema caps a footnote at 120 characters, so we pick
 * the longest CANDIDATE that fits rather than slicing a "$173–$266" in half.
 */
/**
 * Real, sourced style comparison — never invented. Fires ONLY when the subject AND at
 * least one comp both carry a real vendor style string and they disagree. Operator,
 * 08/04/2026: "point out major community differences...if any" — applied to structural
 * style the same way. Silent when either side is unknown (RULE 0.7: an open slot, never
 * a guess).
 */
export function styleDifferenceNote(
  subjectStyle: string | null | undefined,
  comps: { style?: string | null }[],
): string | null {
  const subject = subjectStyle?.trim();
  if (!subject) return null;
  const differing = comps
    .map((c) => c.style?.trim())
    .filter((s): s is string => !!s && s.toLowerCase() !== subject.toLowerCase());
  if (!differing.length) return null;
  const distinct = [...new Set(differing.map((s) => s.toLowerCase()))];
  return distinct.length === 1
    ? `Note: one comp is a ${differing[0]}, not a ${subject}.`
    : `Note: the comps mix styles — not all are a ${subject} like the subject.`;
}

export function compsFootnote(
  facts: ListingFacts,
  comps: RenderComp[],
  subjectStyle?: string | null,
): string | undefined {
  const derived = pricePerSqft(facts.price, facts.sqft) ? "*$/Sq Ft = price ÷ listed sq ft." : "";

  const ppsf = compPpsfs(comps);
  const lo = ppsf[0];
  const hi = ppsf[ppsf.length - 1];
  const range = !ppsf.length
    ? ""
    : lo === hi
      ? ` run at ${usd(lo)}`
      : ` run from ${usd(lo)} to ${usd(hi)}`;
  const homes = comps.length === 1 ? "home" : "homes";
  const mix = comps.length
    ? `The ${comps.length} comparable ${homes}${mixParen(comps)}${range}.`
    : "";
  const styleNote = styleDifferenceNote(subjectStyle, comps) ?? "";

  const full = [derived, mix, styleNote].filter(Boolean).join(" ");
  const mixPlusStyle = [mix, styleNote].filter(Boolean).join(" ");
  // Longest-that-fits, in order of what a reader loses least by losing.
  for (const candidate of [full, mixPlusStyle, mix, derived]) {
    if (candidate && candidate.length <= 120) return candidate;
  }
  return undefined;
}

/** A block and the row height it wants. WHERE it lands is the seam's call, never ours. */
function sized(block: Omit<EmailBlock, "layout">, h: number): ChromeBlock {
  return { block, height: h };
}

/**
 * MY MIDDLE — the comps bar chart and the evidence table. This is the ONE place the
 * campaign's emails legitimately differ, and it is the whole reason this email exists.
 *
 * The chart slot is reserved EMPTY and filled in place below (or dropped — an empty chart
 * box is worse than no chart). The table is omitted entirely when there is nothing real to
 * list: a `list` needs >= 1 row, and an empty shell is not a slot, it is a lie.
 */
function compsMiddle(
  comps: RenderComp[],
  thumbnails: Map<string, string> = new Map(),
  listingUrls: Map<string, string> = new Map(),
): ChromeBlock[] {
  // ═══════════════════════════════════════════════════════════════════════════
  // *** THERE IS NO CHART IN THIS EMAIL. DO NOT PUT ONE BACK. ***
  //
  // Operator, THREE times now:
  //   08/03/2026 — "COMPARABLES ARE JUST THAT, COMPARABLE, SO IT'S A TERRIBLE CHART TO
  //                 PUT IN THE EMAIL. PRICE IS GOING TO BE SIMILAR."
  //   08/04/2026 — "Do not use that stupid fucking chart for comps!!!!!!! How many times
  //                 do I have to say it!!!!!"
  //
  // The first time, this code "answered" him by swapping the total-PRICE bars for
  // $/SQ FT bars and keeping the chart. That was a dodge, not a fix — it is still seven
  // near-equal bars of a set that is comparable BY CONSTRUCTION, which is the entire
  // reason he said it was a terrible chart. It also rendered with its own labels cut off
  // mid-word ("848 Southwindbay Cir (Su…", "PORTOFINO SPRINGS B…", "L MASTIQUE BEACH
  // BLVD") because seven full addresses do not fit a 600px canvas.
  //
  // The comparison this email argues is ALREADY on the face of it, twice, in a form that
  // does not need decoding: the stat strip prints "$333 $/SQ FT — THIS HOME" beside
  // "$212 $/SQ FT — COMP MEDIAN", and the evidence table prints every comp's own $/sq ft
  // on its row. A chart adds a third copy of one number and a hundred lines of markup.
  //
  // `compsPpsfSpec` is kept and still tested — the SOCIAL/PDF surfaces may want it — but
  // no email block reserves a chart slot. If you are about to add one, re-read this.
  // ═══════════════════════════════════════════════════════════════════════════
  // ── THE DESCRIPTION SLOT — RESERVED HERE, AND THAT IS WHY IT LANDS IN THE RIGHT
  //    PLACE. Operator, 08/04/2026: *"Description below property info."*
  //
  // `compsMiddle` is the FIRST thing the chrome emits after the stats strip, so a slot
  // reserved at the head of it renders directly beneath the beds/sq ft/$-per-sq-ft row —
  // the prose form of the numbers immediately above it, and well before the ask.
  //
  // RESERVED, not spliced. `finalize-doc.ts` mints x/y/w/h for every block that goes
  // through the plan; a block spliced in afterwards has no `layout` and sinks to
  // y = 1_000_000, "the bottom of the content, just above the footer" — which is exactly
  // where the listing's own copy printed in the 08/04 send, under the CTA and under
  // "Sources (2)". Reserving it here is the same pattern the seed-slot playbook already
  // uses. `upsertDescriptionBlock` fills it IN PLACE, keeping these coordinates.
  //
  // Safe from the narrator only because `clearNarrativeSlots`/`fillNarrative` now honour
  // `isDescriptionBlock` (shared.ts). Before that they blanked every text block and wrote
  // prose into the first empty one — which is what made reserving it impossible.
  // Unfilled → `dropEmptyDescriptionSlot` removes it. An empty box is not a slot.
  const blocks: ChromeBlock[] = [sized(emptyDescriptionSlot(), 3)];
  if (comps.length) {
    // PER-ROW photos. This used to be ALL-OR-NOTHING — every row shows its photo or
    // none do — on the reasoning that a table with two pictures and four blanks reads
    // as broken. That rule is a rendering AESTHETIC, and it collided with reality: our
    // photo window opened 06/30/2026 while a comp set reaches back 6-12 months, so
    // PARTIAL coverage is the normal case, and all-or-nothing turned "we have 4 of 6
    // photos" into SIX rows with ZERO photos — silently, with no error anywhere, in an
    // email whose brief explicitly asked for comp thumbnails.
    //
    // The per-row contract is the one comp-photos.ts already states in its own header:
    // "A comp we cannot photograph ships without a picture and keeps its realtor.com
    // link." That is the truth constraint; the even-looking table was never one.
    blocks.push(
      sized(
        {
          id: createBlock("list").id,
          type: "list",
          props: {
            title: mixTitle(comps),
            items: comps.map((c) =>
              compRow(c, thumbnails.get(c.addressLine), listingUrls.get(c.addressLine)),
            ),
          },
        },
        Math.max(4, comps.length + 2),
      ),
    );
  }
  return blocks;
}

// The sources-accordion TAIL was DELETED 08/19/2026 by operator decree ("get rid of
// whatever this shit is in all emails") — no email prints a Sources/methodology line;
// SourcesBlock renders null on the email paths as the one-door backstop.

/**
 * THE COMPS EMAIL, WEARING THE CAMPAIGN'S CHROME.
 *
 * Pure: no I/O, invents nothing. The SHAPE comes from `buildLifecycleEmail` and is not
 * mine; the ribbon word, the cells, the middle, the tail and the CTA are. Brand is STICKY
 * — the chrome lifts the agent's header, agent card, footer and colours off the canvas,
 * so a comps email arriving three weeks after the New Listing is visibly the same sender.
 */
/** Is this URL a real LISTING page, or our own site standing in for one?
 *  `resolve-subject.ts` fills `sourceUrl` with `https://www.swfldatagulf.com` when it
 *  has nothing better, and a reader who clicks "Find Out More" on a specific house
 *  expects that house — not our homepage. Host match only; never a fuzzy guess. */
export function isListingUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    return !/(^|\.)swfldatagulf\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function buildCompsGrid(
  facts: ListingFacts,
  comps: RenderComp[],
  current: EmailDoc,
  thumbnails: Map<string, string> = new Map(),
  /** The subject's real listing page, when we hold one. Falls back to `facts.sourceUrl`
   *  — which is our own site — only because there is nothing better to point at. */
  listingUrl: string | null = null,
  /** The subject's own vendor style label, when the Apify subject-record fetch ran.
   *  Absent whenever that fetch didn't need to run — never guessed. */
  subjectStyle: string | null = null,
  /** Per-comp listing pages resolved by the enrichment lane. */
  listingUrls: Map<string, string> = new Map(),
): EmailDoc {
  const destination = listingUrl ?? facts.sourceUrl;
  const doc = buildLifecycleEmail(current, {
    ribbon: "Market Comps",
    // The subject's photo — it identifies the house whose price is on trial. No photo →
    // a canvas dropzone, absent from the sent email (the open-slot contract).
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: facts.address ?? "The subject property",
          linkUrl: destination,
        }
      : null,
    // The hero is the CLAIM this email defends: the ask, on this address.
    heroValue: facts.price ?? "",
    heroLabel: addressLineOf(facts),
    specs: compsSpecs(facts, comps),
    specFootnote: compsFootnote(facts, comps, subjectStyle),
    middle: compsMiddle(comps, thumbnails, listingUrls),
    // EMPTY — the narrator fills it (fillNarrative). Unwritten → an open slot.
    narrative: "",
    // NO tail — the sources accordion was removed by operator decree 08/19/2026.
    // "Find Out More" — operator decree, handoff §1 item 6. The LABEL changed; the
    // reasoning under it did not: the ask is still a step toward the agent, never a
    // pointer back at the comps the reader is already looking at. The target is the
    // agent's own site when we hold one, and the listing page otherwise (item 6:
    // "target is the agent's site URL; for now use the realtor.com listing URL").
    ctaLabel: "Find Out More",
    ctaUrl: destination,
  });
  return {
    ...doc,
    // THE SUBJECT LINE — deterministic, never model-authored (subject-lines.ts). Without
    // this, `deriveEmailDocSubject` falls back to the hero label (bare price+address),
    // which loses the one thing that makes an evidence email worth opening: the question
    // it answers. Written from the same `facts.address` the hero already carries.
    subjectVariants: [marketCompsSubject(facts.address)],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE DIRECTIONAL GUARD — why every line below this exists.
//
// This recipe SHIPPED, to the rendered artifact, the sentence:
//
//   "At $209 per square foot, the asking price for 326 Shore Dr sits just below the
//    $213 median … — and below the two recorded sales on Shore Dr, which closed at
//    $173 and $195 per square foot."
//
// $209 is ABOVE $195 and ABOVE $173. The central argument of a price-defense email
// was INVERTED — it told the recipient the ask was under the recorded sales when it
// was 7% and 21% OVER them. Same paragraph: "the subject falls at the low end of that
// band" when $209 sits BELOW a $210–$266 band entirely. Every underlying number was
// correctly sourced. The FALSEHOOD was the comparison drawn between them.
//
// *** A COMPARISON IS A FACTUAL CLAIM, AND THE NARRATOR DOES NOT GET TO MAKE ONE. ***
//
// A stronger prompt is not the fix — the old prompt already said "if the ask sits above
// the set, do not hide it", and the model hid it by asserting the opposite. The fix is
// structural, in three parts:
//
//   1. COMPUTE  — `buildPriceCase` derives every relation (vs the median, vs the
//      recorded sales, position in the set, largest-home) in deterministic code and
//      composes the comparative sentences ITSELF. That text is the `verdict`.
//   2. HAND OVER THE RESULT — the narrator is given the verdict as a settled fact and
//      writes only the CONTEXT around it. It never sees a comparison to make.
//   3. LINT — `contextViolations` rejects the narrator's paragraph if it contains any
//      comparative token at all (they are enumerated, and the model is handed the same
//      list) or any number we did not source. A violation DROPS the context and ships
//      the code-authored verdict alone: fail-closed, so the guard can cost prose but it
//      can never cost truth.
//
// If the comparison cannot be computed (no ask, no square footage, no comps), the
// paragraph does not ship at all — the slot stays OPEN. The refutation's rule: "If you
// cannot compute a defensible comparison, the sentence does not ship."
// ─────────────────────────────────────────────────────────────────────────────

/** Where the subject sits against a referent. Exact integer compare on the two rounded
 *  $/sq ft figures — no invented tolerance band, because a tolerance is a judgment and
 *  judgment is where a false comparison hides. */
export type Direction = "above" | "below" | "level";

export interface PriceCase {
  subjectPpsf: number;
  medianPpsf: number;
  /** How many comps carry a real $/sq ft (the set the math is over). */
  n: number;
  vsMedian: { dir: Direction; diff: number };
  /** The recorded sales' $/sq ft, ascending. Valuations are NOT in here. */
  soldPpsf: number[];
  /** null when the set holds no recorded sale. "within" = strictly inside their spread. */
  vsSold: Direction | "within" | null;
  lowerCount: number;
  higherCount: number;
  levelCount: number;
  /** THE MIX, counted in code. The narrator never counts — it is handed the count. */
  soldCount: number;
  estCount: number;
  subjectIsLargest: boolean;
  /** The comparative sentences, AUTHORED IN CODE. The only comparison this email makes. */
  verdict: string;
  /** The verdict, sentence by sentence, as SETTLED CLAIMS (claims.ts). This is the ONLY
   *  channel by which a relation reaches the narrator: as a finished English sentence
   *  with its numerals as the anchor allow-set. `auditClaims` checks the narrator's
   *  prose against exactly these. */
  claims: SettledClaim[];
}

/** "$173 and $195" · "$173, $195 and $210" */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * THE COMPARISON, COMPUTED. Pure, offline, no LLM anywhere near it.
 *
 * Returns null when there is no defensible comparison to make — no ask, no square
 * footage on the subject, or no comp with a real $/sq ft. Null → the prose slot stays
 * an OPEN SLOT. We do not fall back to comparing total prices across different-sized
 * houses; that comparison is not defensible, so it is not made.
 */
export function buildPriceCase(facts: ListingFacts, comps: RenderComp[]): PriceCase | null {
  const subjectPpsf = perSqft(num(facts.price), num(facts.sqft));
  const priced = comps
    .map((c) => ({ c, ppsf: perSqft(c.price, c.sqft) }))
    .filter((x): x is { c: RenderComp; ppsf: number } => x.ppsf != null);
  const medianPpsf = median(priced.map((x) => x.ppsf));
  if (subjectPpsf == null || medianPpsf == null || priced.length === 0) return null;

  const n = priced.length;
  const dirOf = (a: number, b: number): Direction =>
    a === b ? "level" : a > b ? "above" : "below";

  const vsMedian = {
    dir: dirOf(subjectPpsf, medianPpsf),
    diff: Math.abs(subjectPpsf - medianPpsf),
  };

  // THE SALES ARE THEIR OWN QUESTION. A recorded sale is evidence; a valuation is an
  // opinion. The sentence that got this backwards was about the SALES, so they get
  // their own computed relation rather than being folded into the set.
  const soldPpsf = priced
    .filter((x) => x.c.priceKind === "sold")
    .map((x) => x.ppsf)
    .sort((a, b) => a - b);
  let vsSold: PriceCase["vsSold"] = null;
  if (soldPpsf.length) {
    const lo = soldPpsf[0];
    const hi = soldPpsf[soldPpsf.length - 1];
    vsSold =
      subjectPpsf > hi
        ? "above"
        : subjectPpsf < lo
          ? "below"
          : soldPpsf.every((v) => v === subjectPpsf)
            ? "level"
            : "within";
  }

  // POSITION IN THE SET — `compareToSet` (claims.ts) OWNS this relation. It takes the
  // subject and the set of integers and returns the settled English sentence; there is no
  // model anywhere near it and no room for one. This is what kills the "falls at the low
  // end of that band" class of error — the shipped lie said exactly that while $209 sat
  // BELOW a $210–$266 band entirely. We state the true position instead of characterizing it.
  const setClaim = compareToSet(
    subjectPpsf,
    priced.map((x) => x.ppsf),
    { unit: "usd", noun: "asking price per square foot" },
  );
  const lowerCount = priced.filter((x) => x.ppsf < subjectPpsf).length;
  const higherCount = priced.filter((x) => x.ppsf > subjectPpsf).length;
  const levelCount = n - lowerCount - higherCount;

  const soldCount = priced.filter((x) => x.c.priceKind === "sold").length;
  const estCount = n - soldCount;

  const subjSqft = num(facts.sqft);
  const subjectIsLargest =
    subjSqft != null && priced.every((x) => x.c.sqft != null && x.c.sqft < subjSqft);

  // ── THE VERDICT. Composed here, from the relations above. Every clause is a
  //    deterministic read of two sourced numbers; none of it is a characterization.
  const homes = `${n} comparable ${n === 1 ? "home" : "homes"}`;
  const addr = facts.address?.split(",")[0]?.trim();
  const forAddr = addr ? ` for ${addr}` : "";

  // MAGNITUDE TIER — direction-symmetric. An extreme gap (the subject sits strictly beyond
  // the full spread of the set — genuinely below every comp, or genuinely above every comp)
  // states its size plainly and directly rather than the same flat "sits $X above/below"
  // wording used for a marginal gap. Fires IDENTICALLY whichever way the number points —
  // this recipe exists to defend a price that can legitimately sit on either side of the
  // comps, and a tier that only sharpens language in the flattering direction is spin, not
  // honesty. See docs/superpowers/specs/2026-07-15-sell-side-favorable-framing-design.md §4a.
  //
  // FIX (task-5 review, Critical finding): an earlier version of this formula ALSO fired on
  // `diff / medianPpsf >= 0.4` (a percentage-of-median gap), independent of range membership.
  // That's not a range check — it can be (and was, in a reproduced case) true while the
  // subject sits strictly INSIDE [min(allPpsf), max(allPpsf)], which made the "entire range"
  // sentence below assert a falsehood that directly contradicted the very next sentence
  // (vsSold/compareToSet correctly saying the subject falls WITHIN the range). Removed —
  // isExtreme must be true ONLY when subjectPpsf is provably outside
  // [min(allPpsf), max(allPpsf)]; a large percentage gap that's still inside the range falls
  // through to the plain, always-true "sits $X above/below the median" sentence in the
  // `else` branch below, which is honest either way.
  const allPpsf = priced.map((x) => x.ppsf);
  // FIX (final-review, 07/16/2026): with a SINGLE priced comp, "outside the full range"
  // and "outside the median" are the same one-comp comparison wearing two names — the
  // sentence below would still say "not just the median, the entire range" about a
  // one-element "range", which is not a range at all. Require at least 2 priced comps
  // before the extreme tier can fire; n === 1 falls through to the plain, always-true
  // "sits $X above/below the median" sentence in the `else` branch, which is honest at
  // any n.
  const isExtreme =
    n >= 2 &&
    ((vsMedian.dir === "below" && subjectPpsf < Math.min(...allPpsf)) ||
      (vsMedian.dir === "above" && subjectPpsf > Math.max(...allPpsf)));
  const s1 =
    vsMedian.dir === "level"
      ? `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} is level with the ` +
        `${usd(medianPpsf)} median across the ${homes} nearby.`
      : isExtreme
        ? `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} sits ` +
          `${usd(vsMedian.diff)} ${vsMedian.dir} every comparable home in the set — not just ` +
          `the ${usd(medianPpsf)} median, the entire range.`
        : `At ${usd(subjectPpsf)} per square foot, the asking price${forAddr} sits ` +
          `${usd(vsMedian.diff)} ${vsMedian.dir} the ${usd(medianPpsf)} median across the ` +
          `${homes} nearby.`;

  const sentences = [s1];

  if (vsSold && soldPpsf.length) {
    const list = `${joinAnd(soldPpsf.map((v) => usd(v)))} per square foot`;
    const noun =
      soldPpsf.length === 1
        ? "the one recorded sale in the set"
        : soldPpsf.length === 2
          ? "both recorded sales in the set"
          : `all ${soldPpsf.length} recorded sales in the set`;
    sentences.push(
      vsSold === "within"
        ? `That falls within the recorded sales in the set (${list}).`
        : vsSold === "level"
          ? `That matches ${noun} (${list}).`
          : `That is ${vsSold} ${noun} (${list}).`,
    );
  }

  // The position sentence is compareToSet's, verbatim — a shared, tested, code-owned
  // comparison. It never comes from here and it never comes from the model.
  //
  // *** BUT NOT WHEN THE EXTREME TIER ALREADY SAID IT. *** `isExtreme` means the ask sits
  // strictly outside [min, max] of the priced set, and `s1` already printed exactly that
  // ("sits $123 above every comparable home in the set — not just the $210 median, the
  // entire range"). `compareToSet` then says "the asking price per square foot is above
  // every comparable in the set (which run from $182 to $266)" — the SAME relation, the
  // same range, in different words. The 08/05/2026 live render shipped both, plus the
  // recorded-sales sentence, and read as three-times padding (§2.3.4 defect 2).
  //
  // The gate is `isExtreme` and nothing else, so it is direction-symmetric by construction:
  // it drops the duplicate identically whether the ask sits above or below the set. When
  // the tier does NOT fire, the subject is somewhere inside the band and this sentence is
  // the only thing that says WHERE — so it stays. A fact is never dropped here; only a
  // second copy of one already printed in the sentence immediately before it.
  if (setClaim && !isExtreme) sentences.push(setClaim.sentence);

  if (subjectIsLargest && subjSqft != null) {
    sentences.push(
      `At ${subjSqft.toLocaleString("en-US")} square feet, it is the largest home in the set.`,
    );
  }

  return {
    subjectPpsf,
    medianPpsf,
    n,
    vsMedian,
    soldPpsf,
    vsSold,
    lowerCount,
    higherCount,
    levelCount,
    soldCount,
    estCount,
    subjectIsLargest,
    verdict: sentences.join(" "),
    // EVERY verdict sentence is a settled claim. `auditClaims` skips a sentence the
    // narrator restates verbatim from here, and allows exactly the numerals these carry.
    claims: sentences.map((s) => ({ sentence: s, anchors: numeralsIn(s) })),
  };
}

/**
 * EVERYTHING THE NARRATOR IS ALLOWED TO KNOW — as settled sentences, and nothing else.
 *
 * NOTE THE SIGNATURE: it takes the PriceCase, NOT the comps. There is no `RenderComp`
 * here, so there is no raw comp set to serialize, so the model is never handed two comp
 * numbers to draw a third claim between. That is the whole defense. The old version
 * passed every comp's address, price, sq ft and $/sq ft and then asked the model not to
 * compare them — and it compared them, backwards, into a shipped artifact.
 *
 * The returned list is BOTH the model's fact sheet AND the audit's allow-set: a numeral
 * the narrator writes that appears in none of these sentences was invented, full stop.
 */
/**
 * THE MIX AND THE CAVEAT — counted in code (`settledCount`), and PRINTED. Not handed to
 * the narrator to say, because saying it REQUIRES A COUNT and a count is exactly what the
 * narrator may not do. market-pulse's narrator wrote "five of those six ZIPs" over a set
 * whose true answer was four; a word-count carries no digits, so a digit lint sails
 * straight past it.
 *
 * Caught live on the first run of this rebuild: handed the mix as a fact and asked what
 * the evidence IS, the model wrote "Four of the six figures… the two recorded sales…" — a
 * word-count of its own, dropped by the gate, taking a true paragraph down with it. The
 * fault was the DESIGN, not the model: the mix belonged in the printed sentence all along.
 * If a fact can only be stated as a count, CODE STATES IT.
 */
export function mixClaims(pc: PriceCase): SettledClaim[] {
  const noun = "comparable homes";
  const mix =
    pc.estCount === 0
      ? settledCount(pc.soldCount, pc.n, { noun, predicate: "are recorded sales" })
      : pc.soldCount === 0
        ? settledCount(pc.estCount, pc.n, {
            noun,
            predicate: "are current valuations — estimates, not sales",
          })
        : settledCount(pc.soldCount, pc.n, {
            noun,
            predicate: "are recorded sales; the rest are current valuations — estimates, not sales",
          });
  return [mix, { sentence: `None of it is adjusted for condition.`, anchors: [] }];
}

/** The COMPLETE code-authored paragraph: every comparison, the mix, the caveat. True by
 *  construction, and it ships whether or not the narrator's sentences survive the gate. */
export function evidenceParagraph(pc: PriceCase): string {
  return [pc.verdict, ...mixClaims(pc).map((c) => c.sentence)].join(" ");
}

export function narratorClaims(facts: ListingFacts, pc: PriceCase): SettledClaim[] {
  const claim = (sentence: string): SettledClaim => ({ sentence, anchors: numeralsIn(sentence) });
  const out: SettledClaim[] = [...pc.claims, ...mixClaims(pc)];

  // The SUBJECT's own record — scalars, each one a fact on its own, none of them a set.
  if (facts.price) out.push(claim(`The asking price is ${facts.price}.`));
  const spec = [
    facts.beds && `${facts.beds} bedrooms`,
    facts.baths && `${facts.baths} bathrooms`,
    num(facts.sqft) && `${num(facts.sqft)!.toLocaleString("en-US")} square feet`,
    facts.lotSize && `a ${facts.lotSize} lot`,
  ].filter(Boolean);
  if (spec.length) out.push(claim(`The home has ${joinAnd(spec as string[])}.`));
  if (facts.yearBuilt) out.push(claim(`The home was built in ${facts.yearBuilt}.`));
  if (facts.isNewConstruction) {
    out.push(claim(`The home is new construction, per the listing record.`));
  }
  if (facts.isPriceReduced && facts.priceReduction) {
    out.push(
      // ⚠️ NOT "from the original". `reduced_amount` is the MOST RECENT cut — the vendor's
      // price history for the fixture runs $765,000 → $699,975 → $595,000, so $104,975 is the
      // LAST cut, and the cut from the ORIGINAL ask is $170,000. Saying "from the original"
      // understates it by $65,025 and implies an original ask the house never had at listing.
      // A real number wearing the name of a quantity we do not hold is still invented.
      // (Playbook Part 8.5. The true original IS sourceable — /property-tax-history.)
      claim(`The asking price has already come down by ${facts.priceReduction}.`),
    );
  }
  return out;
}

/**
 * THE BANNED VOCABULARY. Every word here is a way to place one magnitude against
 * another, or to claim a location we were never given. The code has already made every
 * comparison this email makes — so the narrator has no legitimate use for any of them,
 * and a hit means it drew a comparison of its own.
 *
 * The SAME list is printed into the system prompt, so the model is told exactly what it
 * may not say. Bare "than" is deliberate: it is the catch-all that closes every
 * "<anything>-er than" construction I could not enumerate. It costs the model "rather
 * than", and that is a trade I will make every time.
 *
 * Locational terms are here for the third, smaller lie in the same paragraph: the model
 * called 141 and 143 Coral Dr "comparable homes on the same street" as 326 Shore Dr.
 * We are handed no location for a comp beyond "nearby". So "nearby" is all it may say.
 */
export const BANNED_CONTEXT_PHRASES: readonly string[] = [
  // Comparatives + superlatives.
  "than",
  "above",
  "below",
  "under",
  "over",
  "beneath",
  "higher",
  "lower",
  "highest",
  "lowest",
  "larger",
  "largest",
  "bigger",
  "biggest",
  "smaller",
  "smallest",
  "cheaper",
  "cheapest",
  "pricier",
  "priciest",
  "exceeds",
  "exceed",
  "outpaces",
  "outstrips",
  "surpasses",
  "eclipses",
  "dwarfs",
  "trails",
  "undercuts",
  "tops",
  "beats",
  "in line with",
  "on par",
  "low end",
  "high end",
  "midpoint",
  "median",
  "range",
  "premium",
  "discount",
  "bargain",
  "steal",
  "underpriced",
  "overpriced",
  "competitive",
  "aligns",
  "consistent with",
  "compares",
  "compared",
  "versus",
  "relative to",
  "matches",
  // Locational claims — we hold no comp's location beyond "nearby".
  "neighborhood",
  "community",
  "subdivision",
  "block",
  "next door",
  // ...and NO STREET NAME, EVER. The shipped lie said the comps were "on Shore Dr" and
  // "on the same street" — 141 and 143 Coral Dr are neither. The word "street" alone
  // does not catch "Shore Dr", so the SUFFIXES are banned outright: the narrator may
  // not name a road at all. (The code-authored verdict names the subject's street and
  // is never linted — it reads the address off the record.)
  "dr",
  "drive",
  "st",
  "street",
  "ave",
  "avenue",
  "blvd",
  "boulevard",
  "ln",
  "lane",
  "ct",
  "court",
  "rd",
  "road",
  "pkwy",
  "parkway",
  "cir",
  "circle",
  "ter",
  "terrace",
];

/** Every number we actually hold, as bare digit strings. A numeric token in the
 *  narrator's context that is not in here was invented, full stop. */
function sourcedDigits(facts: ListingFacts, comps: RenderComp[], pc: PriceCase): Set<string> {
  const out = new Set<string>();
  const add = (v: string | number | null | undefined) => {
    const d = String(v ?? "").replace(/\D/g, "");
    if (d) out.add(d);
  };
  add(facts.price);
  add(facts.sqft);
  add(facts.beds);
  add(facts.baths);
  add(facts.lotSize);
  add(facts.priceReduction);
  add(facts.yearBuilt);
  add(facts.zip);
  for (const c of comps) {
    add(c.price);
    add(c.sqft);
    add(c.beds);
    add(c.baths);
    add(perSqft(c.price, c.sqft));
    // THE SAME GRAIN RULE AS THE ROW. Handing the narrator "05012026" off a month-grain
    // record would ALLOW it to write the fabricated day the row renderer just stopped
    // printing — an allow-set is a permission, and this one was minted from a date we
    // do not hold. A month-grain label carries no day, so no day is permitted.
    add(priceDateLabel(c));
  }
  add(pc.subjectPpsf);
  add(pc.medianPpsf);
  add(pc.vsMedian.diff);
  add(pc.n);
  add(pc.lowerCount);
  add(pc.higherCount);
  add(pc.levelCount);
  for (const v of pc.soldPpsf) add(v);
  return out;
}

/**
 * THE LINT. Runs on the NARRATOR'S CONTEXT ONLY — never on the code-authored verdict,
 * which legitimately says "above" and "below" because it computed them.
 *
 * Returns the violations. A non-empty result DROPS the context: the email then ships the
 * verdict alone, which is a complete and provably-true paragraph. Fail-closed by design —
 * an over-strict lint costs a sentence of colour; an under-strict one ships a lie.
 */
export function contextViolations(
  text: string,
  facts: ListingFacts,
  comps: RenderComp[],
  pc: PriceCase,
): string[] {
  const hits: string[] = [];

  // ── THE SUBJECT'S OWN ADDRESS IS A SOURCED FACT, NOT A LOCATION CLAIM. ──────
  // The road-suffix ban below exists for ONE reason: the narrator once called
  // 141/143 Coral Dr "comparable homes on Shore Dr". That is a claim about where a
  // COMP is, and we hold no comp location beyond "nearby".
  //
  // But it also fired on the SUBJECT's own street — which we read straight off the
  // record and which the code-authored verdict PRINTS one sentence earlier. Found
  // live 08/03/2026 on 2601 SW 37th Ter: "ter" tripped the suffix ban and "2601"
  // and "37" tripped the digit lint, so the narrator's paragraph was dropped on
  // EVERY build of that listing and the email shipped the verdict alone. The
  // operator's "commentary in the agent's voice" vanished, silently.
  //
  // So the subject's own street line is lifted out BEFORE the scans. Only the exact
  // subject address is removed — every other road name, and every other number,
  // still faces the full lint. The guard is narrowed to its real target, not weakened.
  const subjectLine = (facts.address ?? "").split(",")[0]?.trim() ?? "";
  const scanned = subjectLine
    ? text.replace(new RegExp(subjectLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ")
    : text;
  const lower = scanned.toLowerCase();

  for (const phrase of BANNED_CONTEXT_PHRASES) {
    // Word-boundary match, so "over" does not fire on "discover" and "block" does not
    // fire on "blocked".
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) hits.push(`comparative/location term: "${phrase}"`);
  }

  // A DATE IS ONE TOKEN, NOT THREE. Caught live: the narrator correctly wrote "$300,000
  // closed 08/29/2025" — a real, sourced sale date — and the number scanner shredded it
  // into "08", "29" and "2025" and rejected all three. So dates are checked WHOLE against
  // the dates we actually hold (house format MM/DD/YYYY), then lifted out of the text
  // before the number scan.
  // MONTH-GRAIN ROWS CONTRIBUTE NO DAY. A lake comp's `priceDate` is a month stamped to
  // day 1, so passing it through `mdy` would put "05/01/2026" in the ALLOW-SET — licensing
  // the narrator to write the exact fabricated day the row renderer was just fixed to stop
  // printing. An allow-set built from a date we do not hold is a permission we cannot give.
  const sourcedDates = new Set(
    comps
      .map((c) => ((c.dateGrain ?? "day") === "day" ? mdy(c.priceDate) : undefined))
      .filter((d): d is string => Boolean(d)),
  );
  const DATE = /\b\d{2}\/\d{2}\/\d{4}\b/g;
  for (const d of scanned.match(DATE) ?? []) {
    if (!sourcedDates.has(d)) hits.push(`unsourced date: "${d}"`);
  }

  // A numeric token is `$595,000` / `2,847` / `0.26` — a trailing sentence period is NOT
  // part of it (`[\d,.]*` greedily ate the full stop and reported `"$450,000."`).
  const allowed = sourcedDigits(facts, comps, pc);
  for (const tok of scanned.replace(DATE, " ").match(/\$?\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const digits = tok.replace(/\D/g, "");
    if (digits && !allowed.has(digits)) hits.push(`unsourced number: "${tok}"`);
  }

  return hits;
}

/**
 * The price case — the code-authored comparison, plus ONE constrained call for the
 * context around it.
 *
 * NOT `authorListingNarrative`. That narrator's system prompt says "THIS EMAIL IS ABOUT
 * THE HOUSE. Not the market, not the comps… do not turn this into a market analysis",
 * and it takes comps as "Background context (NOT the subject of this email)". Pointed at
 * a comps email it would refuse the only job there is. So this recipe carries its own —
 * with the comparison ALREADY MADE and the model forbidden from making another.
 *
 * Never invents. No computable comparison → null, and the slot stays an OPEN SLOT.
 */
export function buildNarratorPrompt(
  facts: ListingFacts,
  pc: PriceCase,
): { system: string; user: string; settled: SettledClaim[] } {
  const settled = narratorClaims(facts, pc);

  const system =
    `You write the CONTEXT sentences of a real-estate MARKET COMPS email — the one an ` +
    `agent sends to make the case that the asking price is right. Two or three sentences. ` +
    `Plain, confident, specific.\n\n` +
    // THE PROHIBITION, VERBATIM FROM THE GATE. The model is told the exact rule the lint
    // enforces, so a violation is a refusal to follow an explicit instruction rather than
    // a surprise. Keep this line — it is the contract between the prompt and auditClaims.
    `${CLAIM_PROHIBITION}\n\n` +
    `*** THE COMPARISON IS ALREADY WRITTEN AND YOU DO NOT GET TO MAKE ANOTHER ONE. ***\n` +
    `It was computed from the records — not by you — and it is printed IMMEDIATELY BEFORE ` +
    `your sentences, in the same paragraph. Do not restate it, do not re-derive it, do not ` +
    `soften it, do not contradict it.\n\n` +
    `THESE WORDS ARE FORBIDDEN. Using any of them, in any form, voids your paragraph:\n` +
    BANNED_CONTEXT_PHRASES.map((p) => `"${p}"`).join(", ") +
    `.\nThat list includes the bare word "than", and it means EVERY use of it — "rather ` +
    `than" and "other than" void the paragraph exactly like "higher than" does. If a ` +
    `sentence wants "than", rewrite the sentence without it: "estimates rather than sales" ` +
    `becomes "estimates, not sales". Every one of these words is a way of placing one thing ` +
    `against another, and the code has already done that.\n\n` +
    `YOUR JOB IS NARROW, AND IT IS THE ONE THING THE PRINTED SENTENCES CANNOT DO: say WHAT ` +
    `THIS HOME IS. New construction. The lot. A price that has already come down. Then ` +
    `close by inviting the reader to talk it through.\n\n` +
    `WHAT IS ALREADY PRINTED, AND WHICH YOU MUST NOT REPEAT: every comparison, the make-up ` +
    `of the evidence (how many are recorded sales, how many are current valuations), and ` +
    `the fact that none of it is adjusted for condition. All of that is stated for you, ` +
    `directly above your sentences. Do not restate it and do not count anything — a count ` +
    `is a factual claim, it is already made, and if you make one of your own your paragraph ` +
    `is voided even when it happens to be right.\n\n` +
    `DO NOT RECITE THE SPEC EITHER. The grid directly above your paragraph already prints ` +
    `the price, the beds, the baths, the square feet and the lot. A paragraph that reads ` +
    `them back is a wasted paragraph.\n\n` +
    `HARD RULES. Every number you write must appear VERBATIM in the settled facts — same ` +
    `digits, same commas. Never compute a new one, never round differently, never estimate. ` +
    `A FACT ABOUT A HOME IS NOT ONLY A NUMBER: you may not assert a view, a waterfront, a ` +
    `pool, a renovation, a garage, a school, a finish, a builder, a condition, or a ` +
    `character for the subject OR for any comparable unless the facts state it. You have ` +
    `never seen these houses, and you do not know where the comparables are beyond ` +
    `"nearby" — never name a road, not even the subject's own.\n\n` +
    `AND A MARKET RULE IS NOT A FACT EITHER. Do not prop the argument up on a general ` +
    `claim you were not given — "price per square foot compresses as size increases", ` +
    `"new construction commands a premium". Those are assertions about a market you were ` +
    `handed no evidence for, and they are inventions exactly like a made-up number. Never ` +
    `add a selling claim of your own either: "priced to move", "won't last", "a rare ` +
    `opportunity" are YOUR words, not facts. No hype, no exclamation marks.\n\n` +
    `Return ONLY your two or three sentences.\n\n` +
    FAVORABLE_FRAMING_POLICY;

  // THE ENTIRE FACT SHEET. Settled sentences, nothing else — no comp rows, no comp
  // prices, no comp addresses, no set of anything. There is nothing here to compare.
  const user =
    `THE SETTLED FACTS. This is EVERYTHING you know. Each line was computed from the ` +
    `records and is already true:\n` +
    settled.map((s) => `- ${s.sentence}`).join("\n") +
    `\n\nALREADY PRINTED, IMMEDIATELY BEFORE YOUR SENTENCES — DO NOT REPEAT ANY OF IT:\n` +
    `${evidenceParagraph(pc)}\n\n` +
    `Write your two or three sentences: what this home is, and the invitation.`;

  return { system, user, settled };
}

export async function authorCompsCase(
  facts: ListingFacts,
  comps: RenderComp[],
): Promise<string | null> {
  // No defensible comparison → no case → the slot stays open. (Old behavior returned
  // null on "no price or no comps"; this is that, plus the sqft the math needs.)
  const pc = buildPriceCase(facts, comps);
  if (!pc) return null;

  // The comps are used to COMPUTE the case (above) and to LINT the output (below). They
  // are never used to PROMPT — buildNarratorPrompt cannot even see them.
  const { system, user, settled } = buildNarratorPrompt(facts, pc);

  let context = "";
  try {
    const msg = await getAnthropic("email_build").messages.create({
      model: EMAIL_MODEL_SONNET,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: user }],
    });
    context = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  } catch {
    context = "";
  }

  // THE GATE — FAIL-CLOSED. The verdict is true by construction and always ships. The
  // narrator's context ships ONLY if it drew no claim of its own and invented no number.
  //
  // TWO LINTS, both fail-closed, and they check different things:
  //   • auditClaims (claims.ts) — the SHAPES a source cannot support: a comparison, a
  //     trajectory, a count, a sequence, a location relation, a motive, and any numeral
  //     that appears in no settled sentence. The shared gate, and the primary one.
  //   • contextViolations (below) — this recipe's own extra: the banned comparative
  //     vocabulary, and the ROAD-SUFFIX ban that catches "on Shore Dr" (a ban on the word
  //     "street" did not — the model just wrote the road's actual name).
  if (context) {
    const violations = [
      ...auditClaims(context, settled).map((v) => `${v.kind}: "${v.match}"`),
      ...contextViolations(context, facts, comps, pc),
    ];
    if (violations.length) {
      console.error(
        `[market-comps] narrator context DROPPED — ${violations.length} violation(s): ` +
          `${violations.join("; ")}\n  dropped text: ${context}`,
      );
      context = "";
    }
  }

  // The code-authored evidence ALWAYS ships — comparisons, mix, caveat. The narrator's
  // colour ships only if it cleared both gates. A missing sentence is honest; a confident
  // false one is not.
  const evidence = evidenceParagraph(pc);
  return context ? `${evidence} ${context}` : evidence;
}

export async function buildMarketComps(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → there is no asking price to defend. Fall through to the generic
  // author rather than shipping a comp table about no house.
  if (!facts?.address) return null;

  // THE ONE comp source (lib/assistant/comp-helper.ts) — geocode → Lee/Collier gate →
  // ONE /nearby-home-values call → <=2 exact-sale enrichments. Never throws; a miss is
  // an empty set, and the grid still lands with open slots (RULE 0.7: never refuse).
  //
  // *** THE SUBJECT'S DIMENSIONS TRAVEL WITH THE ADDRESS. *** `compsForAddress` runs
  // the size-band ranker ONLY when it is told what the subject IS (comp-helper.ts:397);
  // handed an address alone it falls through to the vendor's raw nearest-first slice.
  // This recipe did exactly that for its whole life, which is how a $385,000 home
  // shipped with $850,000 and $721,000 "comparables" (operator, 08/03/2026). The
  // dimensions were already in `facts` — `compsSpecs` renders them four lines away.
  const result = await compsForAddress(facts.address, {
    topN: COMP_POOL,
    ...subjectDims(facts),
  }).catch(() => null);

  // *** THE LAND FILTER. *** By DATA, never by name. Nearest-first order is the
  // vendor's own; we keep it and take the first MAX_COMPS real homes.
  //
  // *** THE SUBJECT-IS-NOT-ITS-OWN-COMP FILTER *** and *** THE STALE-SALE FILTER ***
  // (both operator-flagged live, 08/03/2026): the vendor's nearby-values feed can
  // return the subject house itself in the candidate set (16447 Rainbow Meadows Ct
  // shipped as a "comparable" of itself, citing its own 2017 sale) — normalized
  // street-line exact match only, never fuzzy. And a recorded sale used to defend
  // TODAY's asking price has to actually be recent: "can't be from more than 6
  // months to a year ago" — a sale carrying no date, or a valuation (no sale date to
  // go stale on), is never dropped by this filter; only an OLD RECORDED SALE is.
  const now = new Date();
  // NOT sliced to MAX_COMPS yet — the photo filter below picks from the WHOLE ranked pool,
  // so a comp we hold no picture for is replaced by the next-best one we do, rather than
  // simply leaving a gap. Resolving photos over 12 candidates costs the same as over 6:
  // it is one dated ZIP pull either way.
  const pool = (result?.comps ?? [])
    .filter(isComparableHome)
    .filter((c) => isNotSubjectAddress(c, facts.address))
    .filter((c) => isFreshSale(c, now));

  // *** WHICH COMPS DEFEND THE PRICE IS DECIDED BEFORE ANY PHOTO IS FETCHED, AND
  //     IT MUST STAY THAT WAY. ***
  // Nearest-first is the vendor's own order and we keep it. An earlier version of
  // this build let PHOTO COVERAGE choose the set (take the photographed ones) — which
  // silently made `buildPriceCase`'s median, `vsSold` and `compareToSet` position
  // depend on which houses we happen to hold pictures of. In a price-DEFENSE email
  // that is the exact class of error `claims.ts` exists to prevent: the comparison
  // moving for a reason that has nothing to do with the houses. Photos decorate the
  // evidence; they never select it.
  //
  // A REAL PHOTO of each comparable home — our own lake first, then the paid Apify
  // lane for the ones that predate our sweep (its window opened 06/30/2026). Never a
  // satellite aerial, never any other stand-in image (operator decree 08/03/2026).
  // A comp we cannot photograph ships without a picture and keeps its realtor.com
  // link — the PER-ROW contract stated in comp-photos.ts's own header.
  const {
    thumbnails,
    styles,
    listingUrls,
    baths: vendorBaths,
  } = await resolveCompThumbnails(pool, facts.zip);

  // ═══════════════════════════════════════════════════════════════════════════
  // *** EVERY COMP IN THIS EMAIL HAS A PHOTO. A COMP WE CANNOT PICTURE IS DROPPED. ***
  //
  // Operator, 08/04/2026: *"Get rid of the no photo comps."*
  //
  // Dropped from the SET, not merely from the table — the median, the range, the count and
  // the whole price case recompute on exactly the rows the reader can see. Filtering only
  // the table would print "6 comparable homes ... run from $111 to $266" above five rows,
  // which is a worse defect than the ragged layout it would be fixing.
  //
  // *** THE COST, STATED PLAINLY BECAUSE IT IS REAL: PHOTO COVERAGE NOW SELECTS THE COMP
  // SET, AND THEREFORE MOVES THE MEDIAN AND THE CLAIM. *** This file argued the opposite
  // for its whole life ("Photos decorate the evidence; they never select it") and the
  // reasoning still stands on its own terms — the comparison can shift for a reason that
  // has nothing to do with the houses. The operator was told that in one sentence and
  // decided anyway; this comment is the record of the trade, not a hedge against it.
  //
  // THE ONE FLOOR: if fewer than MIN_PHOTOGRAPHED_COMPS survive, keep the full ranked set.
  // A price-defence email with one comp, or none, defends nothing — and a vendor outage
  // (the 08/04 Apify cap returned 403 on every call) must not silently empty the evidence
  // table. Falling back is LOUD, so a zero-photo build never passes for a small market.
  // ═══════════════════════════════════════════════════════════════════════════
  const photographed = pool.filter((c) => thumbnails.has(c.addressLine));
  const enough = photographed.length >= MIN_PHOTOGRAPHED_COMPS;
  if (!enough && pool.length) {
    // *** NAME THE REAL REASON, DO NOT SAY "CHECK THE VENDOR CAP". ***
    // This warning used to send every reader hunting a vendor outage. Since 08/05/2026
    // the overwhelmingly likely cause is that the paid lane was simply OFF — it is off by
    // default now — and a builder who reads "photo-supply problem" goes looking for a
    // problem that does not exist. The guard knows which it was, so ask it.
    const spent = spendLedger();
    const why = spent.refused
      ? `THE PAID PHOTO LANE WAS REFUSED THIS RUN (${spent.refusals} refusal(s)) — most likely ` +
        `it is simply OFF. It is off by default; set OPERATOR_APPROVED_PAID_RUN=1 to spend. ` +
        `This is NOT a thin market and NOT a vendor outage.`
      : `The paid lane RAN (${spent.results} record(s), ~$${spent.estimatedUsd.toFixed(2)}) and ` +
        `still did not cover these comps — so this is a genuine photo-supply problem ` +
        `(vendor cap, or the houses are outside the months we pulled), not a thin market.`;
    console.warn(
      `[market-comps] ONLY ${photographed.length} of ${pool.length} comp(s) have a photo — ` +
        `below the floor of ${MIN_PHOTOGRAPHED_COMPS}, so the FULL ranked set ships and some ` +
        `rows will have no picture. ${why}`,
    );
  }
  const comps = (enough ? photographed : pool).slice(0, MAX_COMPS);
  // Style rides onto the SAME comp objects everything downstream already reads —
  // one shape, not a second parallel map to keep in sync. Absent = open slot.
  const compsStyled = comps.map((c) => ({
    ...c,
    style: styles.get(c.addressLine) ?? null,
    // OUR OWN NUMBER FIRST. The lake's `baths` is a recorded county figure; the vendor's
    // is an MLS listing figure. They disagree on half-baths often enough that a silent
    // vendor overwrite would change a comparability claim we already made. Vendor fills
    // the HOLE only (RULE 0.7 lane order: our data, then the paid lane).
    baths: c.baths ?? vendorBaths.get(c.addressLine) ?? null,
  }));

  // ── THE SUBJECT'S OWN RECORD — fetched ONCE, used twice ─────────────────────
  // Operator, 08/03/2026: *"WHY THE FUCK DOES THE BUTTON LINK BACK TO OUR SITE AND NOT
  // THE LISTING FOR FIND OUT MORE? CLICKING ON THE PICTURE GOES TO US TOO?"*
  //
  // Because `resolve-subject.ts` hard-codes `sourceUrl: "https://www.swfldatagulf.com"`
  // and both the hero photo link and the CTA read it — the exact thing `emails.md` §0.1d
  // forbids ("Never hard-code a `swfldatagulf.com` URL into a recipe, seed, or block as
  // the default"). The lake carries no listing URL, so the only real one we can hold is
  // the vendor's `property_url`, which the handoff named as the CTA target (§1 item 6)
  // and which arrives on the SAME record that carries the description. One call, both
  // jobs: no listing URL and no description costs one fetch, not two.
  //
  // This does not make us the destination by default — `applyBrand` still rewrites the
  // button to the agent's own saved URL when they have one. It stops us shipping OUR
  // homepage as the fallback when a real listing page exists.
  // ═══════════════════════════════════════════════════════════════════════════
  // *** THIS WAS A PAID VENDOR CALL. IT BOUGHT 5 RECORDS PER BUILD TO JOIN ZERO,
  //     BY CONSTRUCTION, AND IT IS DELETED. ***
  //
  // Operator, 08/05/2026: *"What do you mean a fucking button uses apify???"* — he was
  // right, and it was worse than absurd, it was provably futile. The vendor's OWN billing
  // API shows this line as **$0.0501 x6 on 08/05/2026** — one charge per render.
  //
  // The call passed the subject's own address as `location` and asked `pickAddressMatch`
  // for the record that IS this house. But `location` is a SEARCH AREA: this actor treats
  // a street address as an area CENTRE and **does not return the centre's own record**
  // (run to ground live 08/04/2026 — the header block of `apify-identity.ts` lists the
  // five wrong houses a radius-0.3 query on 14503 Dolce Vista Rd came back with, and
  // playbook §2.3.1 states the same fact). So `pickAddressMatch` returned null EVERY time
  // it ran. $0.05 a build, forever, for a guaranteed null — and the button then fell back
  // to our homepage anyway, which is the §1.8 violation it was added to fix.
  //
  // THE URL WAS ALREADY ON DISK THE WHOLE TIME. `data_lake.apify_property_records` carries
  // `property_url` on **26 of 26 rows** (counted live 08/05/2026 — the best-filled column
  // on that table) and `style` beside it, on rows we have ALREADY BOUGHT. This reads that
  // row. It issues no vendor call and cannot: free, and it hits more often than the paid
  // call it replaces, which hit never. The full ladder — and why we never derive a
  // permalink instead — is `lib/listings/listing-url.ts`.
  //
  // A miss stays null, and null is a first-class answer: `listingButtonUrl` DROPS the
  // button rather than substituting a homepage (playbook §1.8 — a listing button may never
  // fall back to a homepage; Gmail sender guidelines, a deliverability rule not a taste call).
  // ═══════════════════════════════════════════════════════════════════════════
  const needsSubjectRecord = !facts.remarks || !isListingUrl(facts.sourceUrl);
  const subjectRecord = needsSubjectRecord
    ? ((await fetchCachedRecordLoose(
        (facts.address ?? "").split(",")[0]?.trim() ?? "",
        facts.city ?? (facts.address ?? "").split(",")[1]?.trim() ?? "",
        SUBJECT_RECORD_MAX_AGE_DAYS,
      ).catch(() => undefined)) ?? null)
    : null;
  // `StoredApifyRecord` carries an `[k: string]: unknown` index signature, so these two
  // columns arrive UNTYPED and must be narrowed rather than trusted. That is not
  // ceremony: a non-string here would reach an `href`, and `isListingUrl` is the same
  // gate `listing-url.ts` applies — an absolute http(s) URL or NO BUTTON at all (§1.8).
  const rawSubjectUrl = subjectRecord?.property_url;
  const listingUrl =
    typeof rawSubjectUrl === "string" && isListingUrl(rawSubjectUrl.trim())
      ? rawSubjectUrl.trim()
      : null;
  // Free byproduct of the SAME subject-record fetch above — never a dedicated call
  // just for style. Null whenever that fetch didn't need to run.
  const rawSubjectStyle = subjectRecord?.style;
  const subjectStyle =
    typeof rawSubjectStyle === "string" && rawSubjectStyle.trim() ? rawSubjectStyle.trim() : null;

  let doc = buildCompsGrid(
    facts,
    compsStyled,
    currentDoc,
    thumbnails,
    listingUrl,
    subjectStyle,
    listingUrls,
  );

  // ── NO CHART. See the block comment in `compsMiddle` — the operator has killed the
  // comps chart three times and the previous "fix" swapped its unit instead of removing
  // it. `compsPpsfSpec` / `ppsfChartMagnitude` stay exported and tested for the social
  // and PDF surfaces; this email reserves no chart slot and fills none.

  // ── THE PROSE. The model does not write prose and nothing else — it writes LESS than
  // that. The COMPARISON is computed in code (buildPriceCase) and the model only writes
  // the context around it, linted. See the guard block above authorCompsCase: this
  // recipe shipped an inverted comparative once, and it will not do it twice.
  //
  // Clear first — fillNarrative SKIPS a text block that already has content (the landmine
  // that shipped 2,000 characters of raw MLS copy on 07/13).
  const narrative = await authorCompsCase(facts, comps);
  if (narrative) doc = fillNarrative(clearNarrativeSlots(doc), narrative);

  // ── THE HOME'S OWN DESCRIPTION — operator ask, handoff §1 item 3 ────────────
  //
  // *** IT GOES IN AFTER THE NARRATIVE PASS, AND THAT ORDER IS LOAD-BEARING. ***
  // `clearNarrativeSlots` blanks the body of EVERY text block and `fillNarrative`
  // then writes into the first empty one. Insert the description before those two
  // and it is wiped, then overwritten with the narrator's paragraph — the 07/13
  // raw-MLS-copy landmine pointing the other way. Design §4 F4; the block carries
  // its own `descriptionSlot` marker so a refresh replaces rather than stacks.
  //
  // TWO LANES, BOTH FREE NOW: the resolved record's own `remarks` (ours, already
  // fetched), then the description off the ALREADY-BOUGHT row read above. The model
  // never sees this text and never rewrites it: it is the listing agent's own copy
  // about a house we have never seen, verbatim or not at all.
  //
  // *** THE COLUMN IS `description`, NOT `text`. *** The live vendor record calls this
  // field `text` (`ApifyRecord.text`); `toRow` promotes it into the cache column
  // `description` (apify-record-store.ts), which is what `paid-record-lane.ts` reads.
  // Since this lane now reads the STORED row rather than a live one, reading `.text`
  // here would silently be `undefined` on every build — a free fact dropped on the
  // floor with no error, which is the exact failure shape this directory keeps hitting.
  const rawRemarks = subjectRecord?.description;
  const remarks =
    facts.remarks ?? (typeof rawRemarks === "string" && rawRemarks.trim() ? rawRemarks : null);
  const description = buildDescriptionBlock(remarks, listingUrl ?? facts.sourceUrl);
  if (description) doc = upsertDescriptionBlock(doc, description);
  // Reserved but nothing to say → take the slot back out. An empty panel where a
  // description would have been is not an open slot, it is a hole.
  doc = dropEmptyDescriptionSlot(doc);

  return doc;
}
