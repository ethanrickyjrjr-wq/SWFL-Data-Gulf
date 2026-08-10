// lib/deliverable/recipes/under-contract.ts
//
// R4 · UNDER CONTRACT — the beat in the narrative that most agents skip.
//
// ── WRITTEN NEW 08/06/2026. THE JULY FILE IS GONE. ───────────────────────────
//
// Operator decree 08/05/2026, verbatim: *"There can't be code for this if it is not from
// today. We are building everything new so we build it fucking right."* The 1,098-line
// 07/17/2026 file that used to sit at this path predated the assembly line and was never a
// diff target. The one thing in it worth keeping — the SteadyAPI list-date chain that
// `new-listing.ts` imports as its DOM fallback — moved to `lib/listings/list-date.ts`,
// where a vendor fetch chain actually belongs. Nothing else survived.
//
// ── THE DECREE THAT UNBLOCKED THIS EMAIL ─────────────────────────────────────
//
// Operator, 08/05/2026, verbatim: *"The fucking under contract date is the date the email
// is fucking made, user can change it if they want."*
//
// That single sentence dissolved the gap the July build fabricated its way around. The
// contract date is **not** detected, **not** a wait on a vendor, and **not** held by any
// source — it **defaults to the build date**, and the doc is editable afterwards, which is
// what the Lab is. So days-to-contract stops being an interval nobody holds and becomes
// `contractDate − listedDate` — and with the contract date pinned to today, that is
// exactly the count our own listing clock already computes at read time.
//
// **THE CONTRACT DATE IS NEVER PARSED OUT OF THE PROMPT.** §1.13: the seed prompt text is
// DISPLAY and SEED only, never identity, and a build is never routed on it. A regex that
// turned "we went pending 7/28" into a headline number would be identity-from-prose, and
// the resulting claim would be TRUE and therefore invisible to the claim gate — which is
// the exact shape of the Coming Soon narrator defect (§2.2.4 #4).
//
// ── THE BYTES-LEVEL INVARIANT — every lifecycle email has one; this is ours ──
//
// New Listing's is that the address DOES ship. Coming Soon's is that it does NOT.
//
//   *** THE EMAIL STATES A PENDING FACT AND NEVER A SOLD ONE. ***
//
// A pending home has not sold and we do not hold a sold price. Asserted against the
// RENDERED BYTES with a non-zero exit by `scripts/email/render-under-contract.mts`, which
// imports `SOLD_LANGUAGE` from this file rather than re-typing it.
//
// ── THE SIX ANSWERS (playbook Part 6) ────────────────────────────────────────
//
//   SKELETON — the shared campaign chrome (`buildLifecycleEmail`). No layout of its own.
//   CELLS    — the address and the LIST price in the hero; the shared spec strip WITH the
//              lot (Coming Soon drops it to avoid narrowing a parcel search — that reason
//              is gone the moment the address ships); then the speed pair.
//   CHART    — **NONE.** Locked in `recipes.ts` and unchallenged by the research: a
//              lifecycle email about one house gets the photo as its visual, and two bars
//              reading was-versus-now is a fact wearing a chart costume. Policy "none"
//              means DROP the slot — no image block is ever pushed here.
//   PROSE    — the seller's description VERBATIM in its reserved slot, plus the shared
//              listing narrator writing the EXTRA below it — the community and the
//              location (operator decree 08/10/2026) — handed NO days count and NO costs.
//   CTA      — ONE. "here's what else," never "get in line."
//
// ── WHY THIS EMAIL EXISTS (three jobs, one email) ────────────────────────────
//
//  1. SOCIAL PROOF — the beat in a narrative. A neighbour who watches a listing come to
//     market, go under contract and close is receiving three impressions of an agent who
//     gets results. **This email has nothing to sell, and that is the point.**
//  2. RECAPTURE THE UNDERBIDDERS — known band, known area, known moment of wanting.
//     **But NOT a backup-offer ask.** Redfin cites NAR: only 6% of home sales fall
//     through. That is a 1-in-17 shot, and asking a reader to queue behind a signed
//     contract spends credibility on a coin that lands wrong sixteen times out of
//     seventeen.
//  3. SPEED AS PROOF — the one number this email owns, and the only place the four-lane
//     moat shows up inside a lifecycle email. We hold the market comparand; nobody else
//     emailing an agent's database does.

import { withCommas } from "@/lib/format-number";
import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import { createBlock } from "@/lib/email/doc/default-docs";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
import {
  addressLineOf,
  listingDescription,
  pricePerSqft,
  shortType,
  spec,
  specFootnote,
} from "@/lib/email/listing-flyer";
import { todayIso } from "@/lib/listings/dom";
// THE LIST-SIDE MEDIAN, THROUGH THE ONE ROOT THAT ALREADY OWNS IT.
// `data_lake.zip_active_dom_median` — active for-sale listings, first-seen floors
// excluded. `docs/standards/data-roots.md:69-71` is explicit that list-side is
// `listing_dom` and sold-side is `redfin_swfl.median_dom` and the two are NEVER
// interchanged. The July build compared this home against the SOLD-side median; that was
// a second, separate error from the date error, and reusing this root is what prevents it
// from being re-committed by a fresh query.
import { fetchZipBenchmark } from "@/lib/buyer-leverage/zip-benchmark";
import { authorListingNarrative, clearNarrativeSlots, fillNarrative } from "./shared";
import type { RecipeBuildContext } from "./index";
import type { ChromeBlock, LifecycleChrome } from "@/lib/email/lifecycle-chrome";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

/** The citation root. A citation always points at SWFL Data Gulf, exactly as
 *  `resolve-subject.ts` hardcodes its `sourceUrl`. NOT the same concept as `shared.ts`'s
 *  env-derived `BASE_URL` — that one is where a READER is sent, this one is who the DATA
 *  is attributed to. Reading `NEXT_PUBLIC_SITE_URL` here would ship "http://localhost:3000"
 *  as the citation of every locally-built doc (observed on Coming Soon, 07/13/2026). */
const SITE = "https://www.swfldatagulf.com";

/**
 * *** THE BANNED SOLD PHRASINGS — ONE ROOT, TWO CONSUMERS. ***
 *
 * The recipe's own guard reads this, and so does the bytes assertion in
 * `scripts/email/render-under-contract.mts`. A hand-typed second copy in the script is how
 * a guard silently stops guarding when someone adds a phrase in one place — the same
 * lesson §2.3.6 records about the comps chart ("a comment was the only thing guarding it,
 * and a comment is not a guard").
 *
 * Lowercase, because both consumers compare against lowercased text.
 */
export const SOLD_LANGUAGE = Object.freeze([
  "sold for",
  "sold price",
  "closed at",
  "final sale",
  "sale price",
] as const);

/**
 * EVERY LITERAL THIS EMAIL PRINTS OR QUERIES ON, IN ONE PLACE.
 *
 * The §2.2 precedent, and the operator question behind it: *"Everything is a field?"* A
 * FIELD, NOT A SETTING — frozen, and never read from env or a DB. `registry-seam.test.ts`
 * runs all 17 builders twice over two independent contexts and asserts the same document
 * comes back; a value that varies by environment breaks that guarantee silently.
 * Consumers take it as a DEFAULTED PARAMETER, so a test or a future per-brokerage override
 * passes its own without a global anywhere.
 */
export const UNDER_CONTRACT_FIELDS = Object.freeze({
  /** The chrome's ribbon word — the one thing that tells a reader which email this is.
   *  ⚠️ WORDING IS AN OPEN OPERATOR QUESTION: "under contract" vs "pending" in Florida
   *  practice was researched 08/05/2026 and three sources failed to settle it. This is the
   *  recipe key and the operator's own word throughout the walk, so it is the default —
   *  but it has NOT been ratified. Do not record it as settled in playbook §2.4. */
  ribbon: "Under Contract",
  /** The one button. **"Here's what else," never "get in line."** It points at the agent's
   *  own site — where their other listings and their valuation offer both live — so the
   *  label matches the destination, which is a Gmail deliverability rule (§1.8: recipients
   *  must know what to expect on click), not a taste call. 1–5 words. */
  ctaLabel: "See What Else Is Available",
  /** Deterministic, never model-authored, so it can never smuggle a claim. 30–40 chars is
   *  the open-rate target (§1.10) and the street form usually lands inside it. */
  subject: {
    withStreet: (street: string) => `Under contract: ${street}`,
    withCity: (city: string) => `Under contract in ${city}`,
    bare: "Under contract",
  },
  /** Photo alt — read aloud by screen readers and shown by Outlook with images off. The
   *  address ships here on purpose; this email suppresses nothing. */
  photoAlt: (address: string) => `Under contract — ${address}`,
  /**
   * THE SAMPLE FLOOR FOR THE COMPARAND. A median over a handful of listings is not a
   * market fact, and shipping one next to this home's real number lends it an authority
   * it has not earned. Below this the comparison is DROPPED and this home's number ships
   * alone — the email is still correct, just quieter.
   *
   * This is the `coming_soon_degenerate_funnel_floor` failure shape (that email's funnel
   * will happily print "2,575 comparable homes" as scarcity) caught BEFORE it ships rather
   * than after. A field, not a magic number, so moving it is a decision and not a patch.
   */
  minMedianSample: 10,
  /** The citation root. */
  citation: { label: "SWFL Data Gulf", url: SITE },
  /** A sources note longer than this wraps into a paragraph and reads as a disclaimer. */
  noteMaxChars: 200,
});

export type UnderContractFields = typeof UNDER_CONTRACT_FIELDS;

// ── The speed number ─────────────────────────────────────────────────────────

/**
 * DAYS TO CONTRACT — this home's number, and the headline of the email.
 *
 * With the contract date pinned to the build date (the decree), `contractDate − listedDate`
 * IS `today − listedDate`, which is exactly what `data_lake.listing_dom` computes at read
 * time and what `resolve-subject.ts` attaches as `facts.daysOnMarket`.
 *
 * *** THE FLOOR GUARD IS INHERITED, NOT RE-IMPLEMENTED. *** `resolve-subject.ts:362`
 * attaches that field ONLY when `domIsFloor !== true`. So an absent value already means
 * "we do not honestly hold this", and refusing it here needs no second check against a
 * first-seen date. Plumbing a raw `listedDate` onto `ListingFacts` to compute this a
 * second way would route around that guard — a floored first-seen date is precisely what
 * the build handoff says to refuse, so the symmetric-looking field would be a hole.
 *
 * NEVER ESTIMATED. Null → the speed cells become open slots.
 */
export function daysToContract(facts: ListingFacts): number | null {
  const d = facts.daysOnMarket;
  if (d == null || !Number.isFinite(d) || d < 0) return null;
  return Math.floor(d);
}

/** The comparand plus the scope it was actually computed over. */
export interface Speed {
  /** This home: listed → under contract, in whole days. */
  daysToContract: number;
  /** The market's median days LISTED (active for-sale, floors excluded). Null = dropped. */
  medianDom: number | null;
  /** How many listings the median was computed over. Below the floor → the median drops. */
  sampleSize: number;
  /**
   * *** THE ONE STRING EVERY CONSUMER PRINTS. ***
   *
   * "ZIP 33908". The stat cell AND the sources note read THIS, never a ZIP of their own.
   * Same rule as Coming Soon's `scopeLabel`, and for the same reason: this email's claim
   * to authority is that a reader who re-runs the stated criterion reproduces the printed
   * number. A count under a label the query did not use is a checkable claim that fails
   * its own check — worse than an open slot, because it invites the check.
   */
  scopeLabel: string;
  /** Which rung produced the comparand, for the provenance table. */
  rung: 1 | 2;
  /** When we READ it. The median is computed live at read time, so this is the build date. */
  asOfIso: string;
}

/**
 * THE SPEED LADDER.
 *
 *   RUNG 1 — the subject's ZIP, through `fetchZipBenchmark` → the
 *            `data_lake.zip_active_dom_median` RPC. Free, live, list-side, floors excluded.
 *   RUNG 2 — **THE COMPARISON IS DROPPED.** This home's number ships alone.
 *
 * ── THE COUNTY RUNG IS DELIBERATELY NOT BUILT, AND THAT IS DECLARED ──────────
 *
 * The build handoff's ladder reads "city or ZIP → county scope → dropped". There is no
 * county-scoped median root today — `zip_active_dom_median` is ZIP-only — and writing a
 * fresh county aggregate here would mint a SECOND root for a concept `data-roots.md`
 * already assigns to one (RULE 0.55: one root per concept per cadence; if the root isn't
 * listed you ADD a root, you do NOT add a second table). Inventing an unproven aggregate
 * mid-build is exactly what §2.3.6 refused to do with the comps CTA: named, handed up, not
 * bodged. A ZIP miss therefore drops straight to rung 2 — a weaker true claim beats a
 * stronger unverifiable one.
 *
 * Empty-tolerant by contract (RULE 0.7): no creds, a query error, or a thin sample → the
 * median is null and the email ships this home's number. Never throws, never invents.
 */
export async function loadSpeed(
  facts: ListingFacts,
  fields: UnderContractFields = UNDER_CONTRACT_FIELDS,
  deps: { benchmark?: typeof fetchZipBenchmark; asOf?: string } = {},
): Promise<Speed | null> {
  const days = daysToContract(facts);
  if (days == null) return null;

  // ⚠️ THIS BUILDER READS THE CLOCK, AND IT IS THE FIRST ONE THAT DOES.
  //
  // PART 0 of the playbook says of `registry-seam.test.ts`: *"The clock is deliberately NOT
  // normalised: no builder reads it on this path, and if one starts to, that test goes red
  // — which is the signal, not a nuisance."* That test runs each builder TWICE, milliseconds
  // apart, so both calls return the same date and it stays green — **the guard the playbook
  // described as the signal does not fire for this.** Recorded rather than discovered later.
  //
  // Exposure today is nil: `asOfIso` reaches the doc ONLY through the sources note, which is
  // emitted only when a median actually shipped, and the seam test has no DB creds so the
  // median is always null there. That is a property of the test environment, not a
  // guarantee — hence `deps.asOf`, so any caller that needs determinism can pin it.
  const asOfIso = deps.asOf ?? todayIso();
  const zip = String(facts.zip ?? "").match(/\d{5}/)?.[0];
  const base: Speed = {
    daysToContract: days,
    medianDom: null,
    sampleSize: 0,
    scopeLabel: zip ? `ZIP ${zip}` : fields.citation.label,
    rung: 2,
    asOfIso,
  };
  if (!zip) return base;

  try {
    const bench = await (deps.benchmark ?? fetchZipBenchmark)(zip);
    const median = bench?.medianDomDays;
    const sample = bench?.sampleSize ?? 0;
    if (median == null || median < 0) return base;
    return { ...base, medianDom: median, sampleSize: sample, rung: 1 };
  } catch {
    return base; // a DB hiccup degrades to this home's number alone
  }
}

/**
 * THE SPEED PAIR — my middle, and the argument.
 *
 * Shape from the research: two numbers side by side, "most homes in [City] sell in X days,
 * this one in X." Two cells, never three, and **ONE WEIGHT ACROSS THE ROW.**
 *
 * The playbook's finish pass, defect 5, verbatim: "Never mark ONE cell in a three-cell row
 * `muted`. All three carry the same weight or the row reads broken." It was committed on
 * New Listing (§2.1.6 defects 4/5) and re-committed on Coming Soon the very next email
 * (§2.2.6 item 2), both times by marking the punchline `primary` and the context `muted`.
 * The contrast between 18 and 96 is carried BY THE NUMBERS. It does not need type size
 * shouting on top of it.
 *
 * AND THE LABEL COMES OFF `scopeLabel`, NEVER off `facts.zip` — see the field's own note.
 * The label says "days listed", not "days on market", because the comparand is the current
 * AGE of homes still for sale, not a completed sale interval. Those are different facts and
 * the cell that prints one may not be worded as the other.
 */
export function speedStats(
  s: Speed,
  fields: UnderContractFields = UNDER_CONTRACT_FIELDS,
): StatItem[] {
  const cells: StatItem[] = [spec(String(s.daysToContract), "Days to contract")];
  // THE DEGENERATE-SAMPLE FLOOR. A median over three listings is not a market fact.
  if (s.medianDom != null && s.sampleSize >= fields.minMedianSample) {
    cells.push(spec(String(s.medianDom), `Median days listed · ${s.scopeLabel}`));
  }
  return cells;
}

/** The speed cells when nothing resolved: OPEN SLOTS whose LABELS are the instruction on
 *  the canvas, absent from the sent email. Never a zero, never a refusal (RULE 0.7). */
export function speedOpenSlots(): StatItem[] {
  return [
    spec(undefined, "Days to contract — add the count"),
    spec(undefined, "What's typical in this ZIP"),
  ];
}

// ── The rest of the cells ────────────────────────────────────────────────────

/** yyyy-mm-dd → MM/DD/YYYY (the operator's as-of format; the raw token is internal). */
function mdY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

/**
 * THE SPEC STRIP — the shared lifecycle cells, WITH the lot.
 *
 * Coming Soon drops the lot because a lot size plus a city narrows a parcel search further
 * than a teaser should. That reason evaporates the moment the address ships in full, which
 * it does here.
 *
 * *** NO DOM CELL. *** `listing-flyer.ts` says it in as many words: "this cell is for
 * ACTIVE listings ONLY. Never pass it on under-contract or just-sold." The MLS clock
 * stopped when the contract was signed; a running "days on market" count on this home is a
 * number that keeps ticking past the fact it claims to describe. The speed strip carries
 * the honest version of that idea, computed and labelled as a CLOSED interval.
 *
 * ONE WEIGHT ACROSS THE ROW — no `primary`, no `muted`. See `speedStats`.
 */
export function underContractSpecs(facts: ListingFacts): StatItem[] {
  return [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
    spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft"),
    // THE UNIT IS ALREADY IN THE VALUE. Rendered and looked at 08/06/2026: this cell
    // printed **"0.19 ac ac"**. `resolve-subject.ts:283` formats the lake's `lot_acres`
    // as `"0.19 ac"` before it ever reaches a recipe, and the shared `listingSpecs` passes
    // `facts.lotSize` straight through for exactly that reason. Appending a unit to a
    // value that carries one is the same class as the 43,560 conversion bug — a recipe
    // assuming a raw number where the spine hands it a formatted string. No test caught
    // it; the render did.
    spec(facts.lotSize, "Lot"),
    spec(shortType(facts.propertyType) || undefined, "Type"),
  ];
}

/**
 * THE SUBJECT LINE — deterministic, never model-authored, and it leads with the STATUS
 * rather than the celebration. A subject always resolves; there is no rung 4.
 *
 * `days` is accepted because the research's strongest form is "Under contract in 9 days" —
 * but it is used ONLY when the count is genuinely short, because "Under contract in 213
 * days" is a subject line that argues against the email underneath it.
 */
export function underContractSubject(
  facts: ListingFacts,
  days: number | null,
  fields: UnderContractFields = UNDER_CONTRACT_FIELDS,
): string {
  const street =
    String(facts.address ?? "")
      .split(",")[0]
      ?.trim() ?? "";
  if (street) return fields.subject.withStreet(street);
  const city = facts.city?.trim();
  if (city) return fields.subject.withCity(city);
  return days != null ? `${fields.subject.bare} in ${days} days` : fields.subject.bare;
}

// ── The build ────────────────────────────────────────────────────────────────

export async function buildUnderContract(
  ctx: RecipeBuildContext,
  fields: UnderContractFields = UNDER_CONTRACT_FIELDS,
): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  if (!facts) return null;

  // THE ADDRESS IS THE INVARIANT. No street and no city means there is no house to
  // announce, and a headless "Under Contract" email is worse than none. Returning null
  // hands the build to the terminal author — which stamps `recipe_key = default-grid`,
  // and playbook PART 0 reads that as "a builder fell through — go look." That IS the loud
  // failure the handoff asked for: recorded in provenance, not swallowed.
  //
  // *** GATE ON STREET-OR-CITY, NOT ON `addressLineOf` BEING NON-EMPTY. *** Caught by its
  // own test 08/06/2026: `addressLineOf` falls back to `[city, state].join(", ")`, so a
  // subject carrying nothing but `state: "FL"` produced the truthy string "FL" and built an
  // email whose hero read **"FL"** over the price. Non-empty is not the same predicate as
  // identifying, and the invariant is about identifying the house.
  const address = addressLineOf(facts);
  if (!facts.address?.trim() && !facts.city?.trim()) return null;
  if (!address.trim()) return null;

  const days = daysToContract(facts);
  const speed = await loadSpeed(facts, fields).catch(() => null);

  // THE CTA POINTS AT THE AGENT'S OWN SITE, and that is not the homepage defect §2.3.5
  // records on Market Comps. That defect is a button LABELLED "View the Full Listing"
  // landing on our home page — a promise the destination does not keep. This button
  // promises "what else is available" and lands where the agent's other listings and their
  // valuation offer actually live. We deliberately do NOT use `listingButtonUrl(facts)`
  // here: this home is under contract, so its own listing page is the one destination that
  // would waste the click.
  const ctaUrl = brandWebsiteUrl(currentDoc) ?? SITE;

  // ── MY MIDDLE — the speed pair. NO CHART: policy is "none", and "none" means DROP the
  //    slot. An empty chart box is worse than no chart, and two bars showing
  //    was-versus-now is a fact wearing a chart costume.
  const middle: ChromeBlock[] = [
    {
      block: {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: speed ? speedStats(speed, fields) : speedOpenSlots(),
          variant: "strip",
        },
      },
      height: 3,
    },
  ];

  // ── MY TAIL — the sources note. This is where the criterion is DISCLOSED, so the
  //    printed median is checkable rather than asserted. Only emitted when a median
  //    actually shipped; a note describing a number that is not on the page is noise.
  const medianShipped =
    speed != null && speed.medianDom != null && speed.sampleSize >= fields.minMedianSample;
  const tail: ChromeBlock[] = medianShipped
    ? [
        {
          block: {
            id: createBlock("sources").id,
            type: "sources",
            props: {
              sources: [
                {
                  // THE SECOND CONSUMER of `scopeLabel`. Same rule as the cell: the
                  // citation names the scope that was actually computed over.
                  label: `Active for-sale listings, ${speed!.scopeLabel} — as of ${mdY(speed!.asOfIso)}`,
                  url: fields.citation.url,
                },
              ],
              note:
                `Median days listed = how long homes currently for sale in ${speed!.scopeLabel} have been on the market ` +
                `(${speed!.sampleSize} listings; first-seen floors excluded).`.slice(
                  0,
                  fields.noteMaxChars,
                ),
            },
          },
          height: 3,
        },
      ]
    : [];

  const chrome: LifecycleChrome = {
    ribbon: fields.ribbon,
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: fields.photoAlt(address),
          linkUrl: ctaUrl,
        }
      : null,
    // THE HERO: the ADDRESS over the LIST PRICE. Operator decision, 08/05/2026: *"Under
    // contract price is whatever is listed."* We never claim a sold price — we would not
    // have it, and a pending home has not sold.
    heroValue: facts.price ?? "",
    heroLabel: address,
    specs: underContractSpecs(facts),
    specFootnote: specFootnote(facts),
    // THE SELLER'S OWN WORDS, VERBATIM, in their own reserved slot. `descriptionSlot` is
    // the marker both narrative passes skip, so the authored paragraph can never overwrite
    // it — the 07/19/2026 clobber that kept the description from ever reaching a reader.
    description: listingDescription(facts.remarks),
    narrative: "",
    middle,
    tail,
    ctaLabel: fields.ctaLabel,
    ctaUrl,
  };

  let doc: EmailDoc = {
    ...buildLifecycleEmail(currentDoc, chrome),
    subjectVariants: [underContractSubject(facts, days, fields)],
  };

  // ── The narrator — the ONLY thing the AI writes ────────────────────────────
  //
  // RUNS ON ANY HONEST MATERIAL: lane-2 remarks OR our own community layers (lane 1,
  // free). Until 08/10/2026 the pasted description was the ONLY trigger — the gate below
  // explains why that was the ladder read upside down. With NEITHER held, the paragraph
  // is an OPEN SLOT rather than an improvisation, exactly as before.
  //
  // *** IT IS HANDED NO DAYS COUNT. *** `daysOnMarket` is stripped from its fact sheet for
  // the same reason Coming Soon strips it: the number is TRUE, so the claim gate would
  // pass whatever the model wrote around it, and the model's framing of a stopped clock is
  // not something we can check. The strip prints the interval, correctly labelled, in
  // code. Suppressing a cell from the GRID while feeding it to the WRITER suppresses
  // nothing (§2.2.4 defect 4) — and the converse holds: a cell code prints precisely is a
  // cell the model must not re-narrate loosely.
  //
  // AND IT IS HANDED NO FIGURES IT DID NOT NEED. Found by reading the rendered paragraph
  // 08/06/2026 — with the full fact sheet it ignored the description entirely and wrote:
  //
  //   "Built in 1988 and set on a 0.22-acre lot, this home carries a monthly HOA of $1,326
  //    … Grocery stores and restaurants each open within a mile, with the nearest of each
  //    category sitting at 0.71 and 0.63 miles respectively."
  //
  // Five figures in three sentences, one of them (the lot) A VERBATIM RESTATEMENT OF A SPEC
  // CELL TWO ROWS ABOVE IT, and not one word from the seller's own copy. Every fact was
  // TRUE, so the claim gate passed it — this is the failure class §2.1.6 defect 3 records
  // (the paragraph restating what the page already says) meeting §1.14's standing rule that
  // **the model writes prose and never a figure.**
  //
  // The fix is the one this codebase keeps re-learning: not a sterner prompt, but removing
  // the material. `yearBuilt` and `hoaFee` are stripped — costs are the realtor's
  // conversation, never the email's (operator decree 08/10/2026: "LET'S NOT TALK ABOUT MORE
  // COSTS... JUST TALK ABOUT THE GOOD THINGS THAT ARE THERE"). `daysOnMarket` and `lotSize`
  // stay stripped for the claim-gate reasons above.
  //
  // *** THE COMMUNITY RIDES — FOR REAL THIS TIME (operator decree 08/10/2026). *** Verbatim:
  // "UNDER CONTRACT HAS NO DESCRIPTION!!! WE ARE SENDING OUT EMAILS TO PEOPLE WHO MAY BUY IF
  // THE DEAL FALLS THROUGH... WHY WOULD WE NOT HAVE A FUCKING DESCRIPTION AND COMMUNITY
  // INFORMATION MAYBE." The 08/06 version of this file WROTE the sentence "the community
  // rides" and then stripped `neighborhood` and `communityStats` three lines below it — so
  // the shared narrator's community layers (inside the gate · nearby amenities · the
  // subdivision) never reached this email's writer. The reader of this email is exactly the
  // person the community sells to: someone who wanted this house and may still get it. This
  // also answers §2.4.5's open fork (`under_contract_narrator_has_no_job`): the paragraph's
  // job is the community and the location — the EXTRA below the description, never its echo.
  const narratorFacts: ListingFacts = {
    ...facts,
    daysOnMarket: undefined,
    lotSize: undefined,
    yearBuilt: undefined,
    hoaFee: undefined,
  };

  // THE WRITER RUNS ON ANY HONEST MATERIAL, NOT ONLY ON A PASTE. Lane-2 remarks were the
  // ONLY trigger until 08/10/2026 — which meant a house whose community layers sat fully
  // sourced in our own lake (lane 1, free) still shipped a wall of numbers whenever no
  // description was held. That is the sourcing ladder read upside down (RULE 0.7a). A house
  // with NEITHER still gets the open slot, never an improvisation.
  const hasDescription = Boolean(facts.remarks);
  const hasCommunityMaterial = Boolean(
    facts.community || facts.insideTheGate || facts.communityStats || facts.neighborhood,
  );

  const raw =
    hasDescription || hasCommunityMaterial
      ? await authorListingNarrative(narratorFacts, {
          descriptionRendered: hasDescription,
          framing:
            "AN UNDER-CONTRACT ANNOUNCEMENT. This home has accepted an offer and is under " +
            "contract. IT HAS NOT SOLD and it has not closed — you must NOT write 'sold', " +
            "'sold for', 'sold price', 'closed at', 'final sale' or 'sale price', and you " +
            "must not state or imply any sale figure. " +
            // AND IT IS TOLD NOTHING ABOUT THE PRICE. Removed 08/06/2026 after the FIRST
            // acceptance run dropped the paragraph: this sentence used to read "The price
            // shown is the LIST price," and the gate printed `[narrative] DROPPED — the
            // narrator made 1 claim(s) it was not given: sequence("before weighing the list
            // price")`. The model does not need the price to describe a house, and naming it
            // invited exactly the reasoning that produced a sequence claim. §2.2.4's closing
            // lesson, arriving on the very next email: **a fact you hand the writer is a fact
            // it will try to use.** The strip prints the price; prose never has to.
            // ── THE NARRATOR'S JOB IS NOT "TIGHTEN THE DESCRIPTION" — IT IS THE EXTRA
            // BELOW IT: THE COMMUNITY AND THE LOCATION. ───────────────────────────
            // §2.1.6 defect 3 still governs when a description ships: a paragraph that
            // summarises it hands the reader the same sentences twice. Read on the second
            // acceptance run 08/06/2026 — the description said "the gated, bundled golf
            // community of Kelly Greens, offering championship golf, tennis, and … just
            // minutes from Sanibel Island, Fort Myers Beach … SWFL International Airport",
            // and the paragraph came back "Kelly Greens is a gated, bundled golf community …
            // also offers tennis, and the location puts Sanibel Island, Fort Myers Beach,
            // and Southwest Florida International Airport within a short drive."
            // What changed 08/10/2026 is the paragraph's POSITIVE job: with the community
            // layers back on the fact sheet, it writes what the description does NOT say —
            // the same walked grammar as New Listing's authored extra ("THE POINT OF THE
            // NARRATOR IS... ADDING EXTRA BELOW", 08/09/2026).
            (hasDescription
              ? "The seller's own description is printed IN FULL directly above your " +
                "paragraph, and the reader has just read it. DO NOT summarise it, restate " +
                "it, or repeat any fact it already states. Your job is the EXTRA it does " +
                "not contain: what the community and the location offer, drawn ONLY from " +
                "the community and neighborhood facts you were given. If those facts and " +
                "the description overlap, say only what is genuinely new; if you have " +
                "nothing honest to add, say nothing — a missing paragraph is fine and a " +
                "redundant one is not. "
              : "No seller description is available for this home, so your paragraph is " +
                "the only body copy the reader gets. Describe what makes this home and " +
                "its community appealing, drawn ONLY from the facts you were given. ") +
            "Never add a room, a layout, a finish, a view, a builder's intention, or any " +
            "quality your facts do not state. " +
            // ONLY THE GOOD THINGS — operator decree 08/10/2026 (the polish decree, applied
            // at authoring time): positives only, no cost talk, no negative framing of the
            // location. Costs are the realtor's conversation, never the email's.
            "Speak only to the GOOD: what is nearby, what the community offers, what the " +
            "location puts close at hand. Never frame the location or the home " +
            "negatively, and never mention any cost, fee, or dollar amount. " +
            "WRITE PROSE, NOT FIGURES: do not restate the price, the beds, the baths, the " +
            "square footage, the lot size or any other number that already appears in the " +
            "email — those cells sit directly above your paragraph and repeating them reads " +
            "as a spreadsheet export rather than as an agent. " +
            // THE FRAMING MUST NOT ORDER A CLAIM THE GATE WILL THEN KILL. §2.2.4's closing
            // lesson: Coming Soon's prompt instructed "anticipation" and "shown privately
            // first" — a motive claim and a sequence claim — and the no-invention gate
            // correctly dropped every paragraph that obeyed. We were telling it to invent,
            // then punishing it for complying. Everything about SPEED and STATUS here is
            // true by construction in code (the ribbon, the strip, the button), so prose
            // never has to carry it.
            "Do NOT say how fast it went, how long it was listed, how many offers there " +
            "were, or how the market is doing — you were not told any of those, the ribbon " +
            "and the figures already say what is known, and a claim about timing or demand " +
            "is dropped by the no-invention gate rather than sent. Do NOT invite backup " +
            "offers or suggest the reader can still buy this home.",
        }).catch(() => null)
      : null;

  // BELT AND BRACES. The framing above forbids sold language; this refuses it. A framing
  // sentence asking a model nicely is not a guarantee — that is the whole lesson of the
  // suppression architecture on Coming Soon, applied to the one thing this email cannot
  // get wrong. A paragraph that claims a sale is DROPPED to an open slot: a missing
  // paragraph is honest, a confident false one is not.
  const clean = raw && !SOLD_LANGUAGE.some((p) => raw.toLowerCase().includes(p)) ? raw : null;

  // LANDMINE: fillNarrative SKIPS a text block that already has content. The chrome leaves
  // the commentary slot empty on purpose, but clearNarrativeSlots keeps that true even if
  // a sticky block ever arrives pre-filled — and it deliberately does not touch the
  // reserved `descriptionSlot`.
  if (clean) doc = fillNarrative(clearNarrativeSlots(doc), clean);

  return doc;
}
