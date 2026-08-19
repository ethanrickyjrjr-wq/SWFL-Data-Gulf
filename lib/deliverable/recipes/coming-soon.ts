// lib/deliverable/recipes/coming-soon.ts
//
// R2 · COMING SOON — the teaser that builds a private-preview list before the sign goes
// up. The SAME resolved house as New Listing, wearing a different hat — and now, wearing
// THE SAME CHROME.
//
// ── WHAT CHANGED, AND WHY (07/13/2026) ──────────────────────────────────────
//
// This file used to own its own grid: header · photo · hero(LEFT) · stats[3] · stats[3] ·
// text · chart · sources · card · CTA · footer. New Listing owned a different one. So did
// the other five. Seven lifecycle emails, seven layouts, because there was nothing to
// build ONTO. A subscriber walking the campaign from Coming Soon to Sold got seven emails
// that looked like seven different companies. That is not a campaign; it is a pile.
//
// The layout now lives in ONE place — `buildLifecycleEmail` (lib/email/lifecycle-chrome.ts):
//
//   header · RIBBON · photo · hero(centred, LABEL over PRICE) · spec strip
//          · [MY MIDDLE] · narrative · [MY TAIL] · agent card · CTA · footer
//
// I supply the RIBBON WORD ("Coming Soon"), the hero numbers, which spec cells, my own
// middle (the scarcity strip + the funnel chart), a tail (the sources note) and the CTA.
// I do not get to invent a shape. Pinned by lib/deliverable/campaign-coherence.test.ts.
//
// ── THE ONE THING THIS RECIPE CANNOT GET WRONG ──────────────────────────────
//
// *** THE STREET ADDRESS IS SUPPRESSED. *** That is the entire point of the deliverable,
// and the address is sitting right there in ctx.facts waiting to leak. It must not reach
// the hero, the photo alt text, the subject line, the CTA url, the prose — or the
// NARRATOR'S FACT SHEET. Suppression is STRUCTURAL, not a request:
//
//   • this file never reads `facts.address` into a rendered field — the hero LABEL is the
//     CITY (that is why `heroLabel` is `where`, not `addressLineOf(facts)`, which is the
//     one place the campaign chrome would happily have printed it);
//   • it strips address/city/state/ZIP out of the model's fact sheet before the model ever
//     sees them (`teaserFacts`) — a framing sentence asking a model nicely is not a
//     guarantee;
//   • it redacts the street out of the model's OUTPUT as well (`redactStreetLine`), and a
//     paragraph that STILL leaks is DROPPED to an open slot (`leaksStreet`).
//
// Migrating to the chrome does not weaken any of that. The chrome's photo open-slot alt is
// `heroLabel` — the CITY — so even the dropzone names no street.
//
// WHAT IS SUPPRESSED IS THE DOORSTEP, NOT THE MAP (07/14/2026). The COMMUNITY ships BY NAME
// — "coming soon in Bay Colony" is the entire appeal of this email, and a community is not an
// address: nobody drives to a subdivision and knocks on it. So `facts.community` rides into
// the narrator intact, and the framing explicitly PERMITS the community and the city while
// still forbidding the street, the house number, the full address and the ZIP.
//
// (This briefly went the other way. When community facts first landed on `ListingFacts`, the
// `{ ...facts }` spread started carrying `subdivision` into a fact sheet whose every other
// identifying field was stripped, and the reflex was to strip it too. That was over-reading
// the rule: the recipe suppresses the HOUSE, not the neighbourhood it is in. Corrected.)
//
// Geography ships at the grain a teaser is allowed: the COMMUNITY in the prose, the CITY in
// the hero, the COUNTY in the scarcity block — the last two written by code, never the model.
//
// ── THE REST OF THE SIX ANSWERS (playbook Part 6) ───────────────────────────
//
//   CELLS — the spec strip is the home (beds · baths · sq ft · $/sq ft · type), the shared
//     cells every lifecycle email wears, MINUS the LOT: a lot size plus a city narrows a
//     parcel search further than a teaser should. `$/Sq Ft` is the emphasised cell (it is
//     the one that wins the argument) and its footnote states that it is derived.
//   MIDDLE — SCARCITY, from LIVE COUNTY INVENTORY: `data_lake.listing_state` (populated
//     daily by ingest/pipelines/listing_lifecycle) carries every active for-sale listing
//     with its county, list price, beds and sqft. Three real counts, no invention. Any
//     count we cannot source → an OPEN SLOT, never a zero.
//     LAND FILTER (the same hard rule the comps chart learned): a row with no beds and no
//     sqft is a VACANT LOT, not a home — 6,567 of Lee County's 20,560 active rows are bare
//     land. Counting them as "homes" would inflate the denominator and make the scarcity
//     claim a lie. Filter BY DATA (`beds` and `sqft` non-null), never by guessing at
//     `property_type`.
//   CHART — inventory-scarcity. This deliverable IS about a number ("how few homes like
//     this one exist"), and the number is about the SUBJECT (its price band, its beds, its
//     size). A three-tier funnel: all active homes → in this price range → beds + size
//     match too. If the counts don't load the chart is simply never pushed — an empty
//     chart box is worse than no chart.
//   PROSE — a teaser, authored from a DE-IDENTIFIED fact sheet and forbidden from naming a
//     location at all. It describes the HOME. Numbers, geography and the scarcity claim are
//     code's job, not the model's.
//   CTA — "Join the Private Preview List". The NEXT ACTION, not a restatement of the email.
//
// LIVE PROOF (07/13/2026, 326 Shore Dr, Fort Myers 33905 → $595,000 · 3 bd · 3.5 ba ·
// 2,847 sq ft · Lee County): 13,122 active Lee County homes · 1,062 priced $536K–$655K ·
// 328 that also match on beds and size.

import { createBlock } from "@/lib/email/doc/default-docs";
import { spec } from "@/lib/email/listing-flyer";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
import { RECIPES } from "@/lib/deliverable/recipes";
import { renderTemplate } from "./config";
import { resolveCells } from "./cell-catalog";
// KNOWN-DEBT(data_lake: listing_state lives in the data_lake schema, which the typed
// Supabase client intentionally does not cover — see utils/supabase/service-role.ts):
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import zipCounty from "@/fixtures/swfl-zip-county.json";
import { authorListingNarrative, clearNarrativeSlots, fillNarrative } from "./shared";
import type { Derivation, Finisher } from "./derivations";
import type { RecipeBuildContext } from "./index";
import type { ChromeBlock } from "@/lib/email/lifecycle-chrome";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { StatItem } from "@/lib/email/doc/types";

const CFG = RECIPES["coming-soon"].config!;

/** The citation + CTA fallback root. HARDCODED, exactly as lib/listings/resolve-subject.ts
 *  hardcodes its `sourceUrl`: a citation always points at SWFL Data Gulf. Reading
 *  NEXT_PUBLIC_SITE_URL here would ship "http://localhost:3000" as the source link of
 *  every locally-built doc (observed 07/13/2026 in the first proof run). */
const SITE = "https://www.swfldatagulf.com";

/**
 * EVERY LITERAL THIS EMAIL PRINTS OR QUERIES ON, IN ONE PLACE.
 *
 * Operator, 08/05/2026: *"You have written down the entire recipe? We can reproduce easily?
 * We know where everything has come from and has fallbacks!? Everything is a field?"* The
 * honest answer to the last one was NO. The ribbon word, the button label, the subject
 * template, the ±10% band, the 80% size floor, the 50-unit rounding and the citation root
 * were seven magic values scattered across 600 lines. Each was individually defensible and
 * collectively they meant the recipe could not be READ — you had to grep for a string you
 * had already seen in a rendered email to find out where it came from.
 *
 * ── THE TWO RULES THAT KEEP THIS HONEST ─────────────────────────────────────
 *
 * 1. **A FIELD, NOT A SETTING. Frozen, and never read from env or a DB.** `registry-seam.test.ts`
 *    runs every one of the 17 builders TWICE over two independent contexts and asserts the
 *    same document comes back (17/17 green). A value that varies by environment breaks that
 *    guarantee silently — and the SITE constant three lines up already carries the scar:
 *    reading `NEXT_PUBLIC_SITE_URL` here shipped `http://localhost:3000` as the citation URL
 *    of every locally-built doc. Consumers take this as a DEFAULTED PARAMETER, so a test or a
 *    future per-brokerage override can pass its own without a global anywhere.
 * 2. **THE BAND NUMBERS ARE QUERY INPUTS, NOT COPY.** `priceBand`/`sqftFloorRatio` are read by
 *    `scarcityBand`, which rounds BEFORE querying so the criterion the email prints is the
 *    criterion the count was computed over. Change one of these and the printed band moves
 *    with it — which is the point. They must never drift from the disclosure in `tail`.
 */
export const COMING_SOON_FIELDS = Object.freeze({
  // MIGRATED (recipes-as-config): ribbon / ctaLabel / subject / photoAlt / regionLabel
  // are DERIVED views over the config on the registry entry — one root, can't drift.
  ribbon: CFG.ribbon,
  /** The one button. The NEXT ACTION, never a restatement of the email. 1–5 words (§1.8). */
  ctaLabel: CFG.ctaLabel,
  /** The subject, deterministic and never model-authored, so it cannot smuggle the street. */
  subject: {
    withCity: (city: string) => renderTemplate(CFG.subject.withCity, { city }),
    noCity: CFG.subject.bare,
  },
  /** The hero label when the subject has no city, and the widest honest scope name. */
  regionLabel: String(CFG.params!.regionLabel),
  /** Photo alt text — read aloud by screen readers and shown by Outlook with images off,
   *  which is why it names the CITY and never the street. */
  photoAlt: (city: string, fields: { regionLabel: string }) =>
    renderTemplate(CFG.photoAlt, { place: city || fields.regionLabel }),
  /** The comparison band. ±10% of list price, at least the subject's beds, at least 80% of
   *  its size. Rounded to these units BEFORE the query so the printed criterion reproduces.
   *  QUERY INPUTS for the scarcity derivation — stays here beside the math that reads it. */
  band: {
    priceLo: 0.9,
    priceHi: 1.1,
    priceRoundTo: 1000,
    sqftFloorRatio: 0.8,
    sqftRoundTo: 50,
  },
  /** The citation root. A citation always points at SWFL Data Gulf (`resolve-subject.ts`
   *  hardcodes the same). NOT the same concept as `shared.ts`'s env-derived BASE_URL — that
   *  one is where a READER is sent, this one is who the DATA is attributed to. */
  citation: { label: "SWFL Data Gulf", url: SITE },
  /** The sources note is a single line in a collapsed list; longer than this and it wraps
   *  into a paragraph that reads as a disclaimer. */
  noteMaxChars: 200,
});

export type ComingSoonFields = typeof COMING_SOON_FIELDS;

// ── Street suppression ───────────────────────────────────────────────────────
// The one thing this recipe cannot get wrong. Everything below is deterministic;
// none of it asks a model to cooperate.

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The street line of an address — everything before the first comma. */
function streetLineOf(address?: string): string {
  return (
    String(address ?? "")
      .split(",")[0]
      ?.trim() ?? ""
  );
}

/** Every pattern that would leak the subject's street: the whole street line, the
 *  house number on its own, and the street NAME with any suffix spelling ("Shore Dr"
 *  and "Shore Drive" both fall out of `Shore\b`). A house number shorter than two
 *  digits is skipped — stripping a bare "3" would maul ordinary prose. */
function streetPatterns(address?: string): RegExp[] {
  const street = streetLineOf(address);
  if (!street) return [];
  const tokens = street.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const num = /^\d+[A-Za-z]?$/.test(tokens[0]) ? tokens[0] : null;
  const rest = num ? tokens.slice(1) : tokens;
  // Drop the trailing suffix token (Dr / Drive / Ct …) so the core name matches any
  // spelling of it: ["Shore","Dr"] → core "Shore".
  const core = (rest.length > 1 ? rest.slice(0, -1) : rest).join(" ");

  const out: RegExp[] = [new RegExp(escapeRe(street), "gi")];
  if (core.length >= 3) out.push(new RegExp(`\\b${escapeRe(core)}\\b[\\w']*(\\s+\\w+)?`, "gi"));
  if (num && num.length >= 2) out.push(new RegExp(`\\b${escapeRe(num)}\\b`, "g"));
  return out;
}

/** Strip the subject's street out of a block of text. Used BOTH on the way in (the
 *  agent's pasted remarks, before the narrator ever sees them) and on the way out
 *  (the narrator's paragraph). Pure. */
export function redactStreetLine(text: string, address?: string): string {
  if (!text) return text;
  let out = text;
  for (const re of streetPatterns(address)) out = out.replace(re, " ");
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([,;]\s*){2,}/g, ", ")
    .trim();
}

/** True when `text` still carries the subject's street after redaction. The last
 *  gate: a paragraph that trips this is DROPPED to an open slot rather than sent. */
export function leaksStreet(text: string, address?: string): boolean {
  if (!text) return false;
  return streetPatterns(address).some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

// ── The county, from the ZIP we already resolved ─────────────────────────────
// NOT a second resolver (playbook Part 3, rule 1 — there is exactly ONE). The
// dispatcher already resolved the house; this is a lookup on the ZIP that resolution
// handed back, against the committed Census crosswalk `lib/listings/select.ts`
// already reads. Verified 07/13/2026: 33905 → "Lee", which is the literal value
// `data_lake.listing_state.county` carries.
const ZIP_COUNTY: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const entries =
    (zipCounty as { entries?: { zip?: string; county_names?: string[] }[] }).entries ?? [];
  for (const e of entries) {
    if (e.zip && e.county_names?.[0]) m[e.zip] = e.county_names[0];
  }
  return m;
})();

/** The county name for a resolved ZIP, or null. */
export function countyForZip(zip?: string): string | null {
  const z = String(zip ?? "").match(/\d{5}/)?.[0];
  return (z && ZIP_COUNTY[z]) || null;
}

// ── Scarcity — live county inventory ─────────────────────────────────────────

/** The three real counts, plus the criterion that produced them. The criterion is
 *  DISCLOSED (it rides in the cell labels, the chart, and the sources note) — the
 *  counts are real, and a stated band is what keeps "how scarce" from reading as a
 *  number we made up. */
export type ScarcityGrain = "county" | "market";

export interface Scarcity {
  /** The county the counts were scoped to — NULL when the ladder fell through to market grain. */
  county: string | null;
  /** WHAT WAS COUNTED. `county` = one county; `market` = every county in the lake. */
  grain: ScarcityGrain;
  /**
   * *** THE ONE STRING EVERY CONSUMER PRINTS. ***
   *
   * "Lee County" or "Southwest Florida". The stat labels, the chart title AND the sources
   * note all read THIS — never a county name of their own. That is not tidiness: this
   * email's entire integrity argument is that a reader who re-runs the stated criterion
   * reproduces the printed count (it is why `scarcityBand` rounds before querying). If the
   * ladder widens to market grain and even ONE consumer still says "Lee County", the email
   * ships a checkable-looking claim that does not reproduce — worse than an open slot,
   * because it invites the check and fails it. Pinned by a test that asserts no consumer
   * emits a county name the scope did not authorise.
   */
  scopeLabel: string;
  /** WHICH RUNG produced this, for the provenance table. 1 crosswalk · 2 lake · 3 market. */
  rung: 1 | 2 | 3;
  /** Active for-sale HOMES in scope (beds + sqft present — land excluded). */
  activeHomes: number;
  /** …of those, inside the subject's price band. */
  inBand: number;
  /** …of those, also matching the subject's beds and size. */
  comparable: number;
  bandLo: number;
  bandHi: number;
  bedFloor: number;
  sqftFloor: number;
  /** The lake's own freshness — max(last_seen) on the scoped rows, ISO yyyy-mm-dd. */
  asOfIso: string;
}

/**
 * The comparison band: ±10% of the list price, at least the subject's bed count, and at
 * least 80% of its size.
 *
 * ⚠️ THE QUERY MUST USE THE NUMBERS THE EMAIL PRINTS. Fixed 07/13/2026.
 *
 * This used to query the RAW band (595,000 × 0.9 = 535,500 … × 1.1 = 654,500) and then let
 * `usdShort` round it FOR THE LABEL ONLY — so the email printed the criterion
 * **"$536K–$655K"** while the count behind it was computed over **$535,500–$654,500**.
 *
 * A reader who took the email's own stated criterion and re-ran it got **330**, not the
 * **328** printed in gold. The number is REAL — it is not invented — but the disclosed
 * method does not reproduce it, and CHECKABILITY is the entire reason we print the band at
 * all ("a stated band is what keeps 'how scarce' from reading as a number we made up").
 *
 * The sqft floor already had this discipline — it is floored to a clean 50 precisely so the
 * query matches the label. The price band never got it. It does now: ROUND FIRST, THEN
 * QUERY, so the criterion the reader sees is the criterion the count was computed over.
 */
export function scarcityBand(
  price: number,
  sqft: number,
  fields: ComingSoonFields = COMING_SOON_FIELDS,
): { bandLo: number; bandHi: number; sqftFloor: number } {
  const b = fields.band;
  // THE STEP IS HUMAN, SCALED TO THE SUBJECT (operator 08/09/2026: "WHY ARE THE NUMBERS
  // NOT 1.2-1.5?" — a $1.4M email printing "$1.28M–$1.56M" reads as machine output).
  // Both ends FLOOR to a number a person would say out loud, and those same rounded
  // numbers feed the query, so the checkability contract above is untouched. Flooring
  // the top can never drop it below the subject's own price: at every threshold, 10% of
  // the price is at least the step (0.1 × $1M ≥ $100K, 0.1 × $500K ≥ $50K, …).
  const step =
    price >= 1_000_000
      ? 100_000
      : price >= 500_000
        ? 50_000
        : price >= 250_000
          ? 25_000
          : price >= 100_000
            ? 10_000
            : b.priceRoundTo;
  const down = (n: number) => Math.floor(n / step) * step;
  return {
    bandLo: down(price * b.priceLo),
    bandHi: down(price * b.priceHi),
    sqftFloor: Math.floor((sqft * b.sqftFloorRatio) / b.sqftRoundTo) * b.sqftRoundTo,
  };
}

/** 536000 → "$536K"; 1_250_000 → "$1.25M". Compact enough for a 60-char cell label. */
export function usdShort(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${(Math.round(m * 100) / 100).toString()}M`;
  }
  return `$${Math.round(n / 1000)}K`;
}

const count = (n: number): string => n.toLocaleString("en-US");

/**
 * Read the three live counts out of `data_lake.listing_state`.
 *
 * AGGREGATE AT SOURCE — `head: true` + `count: "exact"` returns the count in a header
 * and hauls ZERO rows (a county is ~20k rows; PostgREST would truncate them anyway).
 *
 * THE LAND FILTER IS LOAD-BEARING: `beds` and `sqft` non-null is what separates a home
 * from a vacant lot, and it is a filter BY DATA, never by guessing at `property_type`.
 *
 * Empty-tolerant by contract (RULE 0.7): no creds, a query error, or a zero-row county
 * → null, and the caller ships open slots + no chart instead. NEVER throws, NEVER
 * invents a count.
 */
async function countScarcity(
  county: string | null,
  grain: ScarcityGrain,
  rung: 1 | 2 | 3,
  scopeLabel: string,
  price: number,
  beds: number,
  sqft: number,
  fields: ComingSoonFields,
): Promise<Scarcity | null> {
  const { bandLo, bandHi, sqftFloor } = scarcityBand(price, sqft, fields);
  try {
    const db = createServiceRoleClientUntyped();
    /** The scope predicate — the ONLY difference between a county count and a market count.
     *  Everything else (the active/sale/feed filters and the land filter) is identical, so
     *  the two rungs cannot drift into counting different things. */
    //
    // Cast through a one-method shape rather than threading PostgREST's own builder generic:
    // written as `<T extends { eq: (c, v) => T }>` this tripped TS2589 ("type instantiation
    // is excessively deep"), because the builder's return type re-instantiates itself on
    // every chained filter and the constraint made the compiler unroll it.
    const scoped = <T>(q: T): T =>
      county ? ((q as { eq: (c: string, v: string) => unknown }).eq("county", county) as T) : q;

    const base = () =>
      scoped(
        db
          .schema("data_lake")
          .from("listing_state")
          .select("listing_id", { count: "exact", head: true }),
      )
        .eq("state", "active")
        .eq("sale_or_rent", "sale")
        .eq("source_name", "api_feed")
        .not("beds", "is", null)
        .not("sqft", "is", null)
        .not("list_price", "is", null);

    const [total, band, like, fresh] = await Promise.all([
      base(),
      base().gte("list_price", bandLo).lte("list_price", bandHi),
      base()
        .gte("list_price", bandLo)
        .lte("list_price", bandHi)
        .gte("beds", beds)
        .gte("sqft", sqftFloor),
      scoped(db.schema("data_lake").from("listing_state").select("last_seen"))
        .eq("state", "active")
        .eq("sale_or_rent", "sale")
        .eq("source_name", "api_feed")
        .order("last_seen", { ascending: false })
        .limit(1),
    ]);

    const activeHomes = total.count ?? 0;
    // ── A ZERO HERE FALLS THROUGH TO THE NEXT RUNG. DELIBERATE, AND NOT THE SAME AS A
    //    ZERO ANYWHERE ELSE IN THE FUNNEL. ──────────────────────────────────────────
    //
    // `activeHomes` is the county's TOTAL active for-sale homes with NO band filter on it.
    // Zero does not mean "a rare home" — it means we hold no active inventory for that
    // county AT ALL, i.e. we do not cover it. Lee and Collier are the two data-rich
    // counties; a ZIP that crosswalks to Charlotte, Glades or Sarasota lands here, and the
    // honest move is to widen to the market we DO cover and SAY the scope widened, rather
    // than print three open slots on an email whose whole middle is this block.
    //
    // THE STRONG SCARCITY CLAIM IS NOT AT RISK FROM THIS. A genuinely rare home shows up as
    // `comparable` (or `inBand`) at or near zero, and neither of those triggers a fall-
    // through — only the scope total does. "Zero homes in Lee County match this one" is the
    // best sentence this email can print and it survives intact.
    if (!activeHomes) return null;
    if (band.count == null || like.count == null) return null;

    const lastSeen = (fresh.data as { last_seen?: string }[] | null)?.[0]?.last_seen;
    const asOfIso = String(lastSeen ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);

    return {
      county,
      grain,
      scopeLabel,
      rung,
      activeHomes,
      inBand: band.count,
      comparable: like.count,
      bandLo,
      bandHi,
      bedFloor: beds,
      sqftFloor,
      asOfIso,
    };
  } catch {
    return null; // a DB hiccup degrades to the next rung, then to open slots
  }
}

/**
 * RUNG 2 — the county read off THE LAKE ITSELF, for a ZIP the committed crosswalk misses.
 *
 * `countyForZip` reads a Census file frozen in the repo; `listing_state` carries its own
 * `county` beside its own `zip_code` on every row and is refreshed daily. A ZIP that is new,
 * re-mapped, or simply absent from the fixture is invisible to rung 1 and sitting in plain
 * sight here. One row, one column — not a count.
 */
export async function countyFromLake(zip?: string): Promise<string | null> {
  const z = String(zip ?? "").match(/\d{5}/)?.[0];
  if (!z) return null;
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("listing_state")
      .select("county")
      .eq("zip_code", z)
      .not("county", "is", null)
      .limit(1);
    return (data as { county?: string }[] | null)?.[0]?.county?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * THE SCARCITY LADDER — stop at the first hit, and SAY WHAT YOU COUNTED.
 *
 * ── WHY THIS IS A LADDER AND NOT A QUERY (08/05/2026) ───────────────────────
 *
 * Operator: *"We know where everything has come from and has fallbacks!?"* For the three
 * counts, the honest answer was NO. §2.1.2 of the playbook gives every OTHER ingredient in
 * this campaign a real chain — beds walk free spine → paid row → open; baths walk five lanes
 * — and the three numbers this entire email is ABOUT had exactly one rung: a ZIP the frozen
 * Census fixture happened to know, or nothing. That is not a fallback, it is a coin flip
 * dressed as a source, and it fails in the most ordinary way there is: an unlisted ZIP.
 *
 *   RUNG 1 — county from the committed Census crosswalk (`countyForZip`). Free, offline.
 *   RUNG 2 — county from `listing_state` itself, by the subject's ZIP. Free, daily-fresh,
 *            and it covers exactly the ZIPs rung 1 cannot: new, re-mapped, or never in the
 *            fixture. One row read.
 *   RUNG 3 — THE WHOLE COVERED MARKET, no county filter at all. Every count is still real
 *            and every filter is identical; only the SCOPE widens.
 *   RUNG 4 — OPEN SLOTS. Never a zero, never a guess, never a refusal (RULE 0.7).
 *
 * ── THE RULE THAT MAKES RUNG 3 SHIPPABLE RATHER THAN A LIE ──────────────────
 *
 * Widening the scope CHANGES THE DISCLOSED CRITERION, and this email's whole claim to
 * authority is that a reader who re-runs the stated criterion gets the printed number (it is
 * why `scarcityBand` rounds before it queries). So the scope is not a private detail of the
 * query — it rides in `scopeLabel` and every consumer prints it: the stat cells, the chart
 * title and the sources note. A market-wide count under a "Lee County" label would be a
 * checkable claim that fails its own check. There is a test on exactly that.
 *
 * A wider scope also makes a WEAKER scarcity claim — a market-wide funnel narrows less than
 * a county one. That is correct and deliberate: the reader is told the scope, and a weaker
 * true claim beats a stronger unverifiable one.
 *
 * ── WHAT A RUNG "MISSING" MEANS, since two different things return null ──────
 *
 * `countScarcity` returns null both when the query THREW (no creds, a network fault) and
 * when the scope holds ZERO active homes. The ladder treats them identically on purpose,
 * and the reason is written at that `return` — a zero on the SCOPE TOTAL means we do not
 * cover that county, not that the home is rare. A rare home is a zero on `comparable`,
 * which never triggers a fall-through and prints as the strongest line this email has.
 */
export async function loadScarcity(
  subject: { zip?: string; county?: string | null; price: number; beds: number; sqft: number },
  fields: ComingSoonFields = COMING_SOON_FIELDS,
): Promise<Scarcity | null> {
  const { price, beds, sqft } = subject;
  // The band is meaningless without all three, and a partial band would silently widen the
  // query rather than narrow it. No subject numbers → open slots, immediately.
  if (!price || !beds || !sqft) return null;

  const label = (c: string) => `${c} County`;

  // RUNG 1 — the crosswalk. `subject.county` is what the caller already resolved.
  const rung1 = subject.county?.trim() || countyForZip(subject.zip);
  if (rung1) {
    const hit = await countScarcity(rung1, "county", 1, label(rung1), price, beds, sqft, fields);
    if (hit) return hit;
  }

  // RUNG 2 — the lake's own ZIP→county mapping, for the ZIPs the fixture never knew.
  const rung2 = await countyFromLake(subject.zip);
  if (rung2 && rung2 !== rung1) {
    const hit = await countScarcity(rung2, "county", 2, label(rung2), price, beds, sqft, fields);
    if (hit) return hit;
  }

  // RUNG 3 — the whole covered market. Same filters, wider scope, and it SAYS SO.
  return countScarcity(null, "market", 3, fields.regionLabel, price, beds, sqft, fields);
}

/**
 * The scarcity cells — MY MIDDLE, and a hairline STRIP, not a chunky stat grid.
 *
 * Every value is a real count; every label states the criterion that produced it, so the
 * reader can see exactly what is being counted. The funnel narrows left to right, so the
 * emphasis does too: the county total is CONTEXT (`muted`), and the last cell — the homes
 * that actually match this one — is the number that wins the argument (`primary`). Before
 * StatItem carried `emphasis` a recipe had no way to say that, and all three counts
 * rendered at identical weight, which is how a punchline reads as a wall.
 */
export function scarcityStats(s: Scarcity): StatItem[] {
  // ONE WEIGHT ACROSS THE ROW. The playbook's finish pass, defect 5, verbatim: "Never mark
  // ONE cell in a three-cell row `muted`. All three carry the same weight or the row reads
  // broken." This row had BOTH — `muted` on the county total AND `primary` on the match
  // count — so three cells rendered at three different sizes and the strip read as a
  // ransom note. The funnel's narrowing is carried by the NUMBERS and by the chart beneath
  // it; it does not need type size shouting on top of them.
  //
  // AND THE LABEL COMES OFF `scopeLabel`, NEVER off `s.county`. This cell used to print
  // `${s.county} County` — which was correct while a county was the only thing that could
  // be counted, and becomes a false claim the moment the ladder's rung 3 counts the whole
  // market. The scope is disclosed wherever the count is.
  return [
    spec(count(s.activeHomes), `Active homes · ${s.scopeLabel}`),
    spec(count(s.inBand), `Priced ${usdShort(s.bandLo)}–${usdShort(s.bandHi)}`),
    // "HOMES that…", never a bare "…that also match beds + size": under a small count
    // ("6") a label whose first legible words are "MATCH BEDS + SIZE" reads as a BEDROOM
    // figure sitting one row beneath the subject's real bed count — the operator misread
    // it exactly that way, live, 08/10/2026 ("5 bedrooms at the top and 6 bedrooms in the
    // row below"). The count is HOMES; the label says so before it says "beds".
    spec(count(s.comparable), `…homes that also match beds + size`),
  ];
}

/** The scarcity cells when the counts did NOT load: three OPEN SLOTS whose LABELS are the
 *  instruction on the canvas. Absent from the sent email (StatsBlock drops empty cells).
 *  Never a zero, never a naked label to a recipient, and never a refusal (RULE 0.7). */
export function scarcityOpenSlots(): StatItem[] {
  return [
    spec(undefined, "Active homes in your county — add the count"),
    spec(undefined, "How many are in this price range"),
    spec(undefined, "How many match beds + size"),
  ];
}

/**
 * The inventory-scarcity funnel. Bar labels are kept under barChartSvg's 26-char
 * truncation so the punchline stays legible.
 *
 * `value_format: "number"`, NOT `"count"` — and that is not a style choice.
 * `formatChartValue("count", v)` (lib/charts/format.ts:19) abbreviates anything over
 * 1,000 as `${Math.round(v / 1_000)}k`, so the FIRST rendered proof of this recipe
 * shipped a chart reading "13k · 1k · 328" directly beneath stat cells reading
 * "13,122 · 1,062 · 328". 1,062 → "1k" is a 6% understatement that reads as exactly
 * one thousand, and it made the chart contradict the numbers printed above it. The
 * canvas lies about the email unless you LOOK at it; this is what looking caught.
 * "number" maps to the unitless exact formatter, so the bar values restate the cells
 * digit for digit. (The `count` formatter's collapse is a real defect in a shared
 * file — reported, not patched here.)
 */
export function scarcityChartSpec(
  s: Scarcity,
  fields: ComingSoonFields = COMING_SOON_FIELDS,
): ChartSpec {
  return {
    frameId: "bar-table",
    // `scopeLabel`, never `s.county` — the chart title is the second of the three places
    // the scope has to agree with what was counted.
    title: `Homes like this one in ${s.scopeLabel}`,
    columns: ["Segment", "Active homes"],
    rows: [
      [`All active homes`, s.activeHomes],
      [`In this price range`, s.inBand],
      [`Beds + size match too`, s.comparable],
    ],
    value_format: "number",
    chart_type: "bar",
    asOf: s.asOfIso,
    source: { citation: fields.citation.label, url: fields.citation.url },
  } as ChartSpec;
}

// ── The build ────────────────────────────────────────────────────────────────

const num = (s?: string): number => Number(String(s ?? "").replace(/[^\d.]/g, "")) || 0;

/** The hero's LABEL — the CITY, never the street. The campaign chrome puts this line
 *  ABOVE the price, exactly where New Listing prints its address. This function is the
 *  reason it prints a city instead. */
export function teaserWhere(facts: ListingFacts): string {
  const city = facts.city?.trim() || "";
  return city ? `${city}, ${facts.state?.trim() || "FL"}` : "Southwest Florida";
}

/** The spec strip — the shared lifecycle cells MINUS the LOT. A lot size plus a city
 *  narrows a parcel search further than a teaser should, and the cell is the only one in
 *  `listingSpecs` that helps locate the house rather than describe it. */
export function teaserSpecs(facts: ListingFacts): StatItem[] {
  // ONE WEIGHT ACROSS THE ROW — and MIGRATED: the cell list is CONFIG data resolved
  // through the shared catalog (beds · baths · sq ft · $/sq ft · type, NO lot — a lot
  // size plus a city narrows a parcel search further than a teaser should).
  return resolveCells(CFG.specs, facts);
}

// ── The derivations (registered in derivations.ts — never imported from here) ──

/** ONE scarcity read per build, shared by the middle and the tail derivation. */
const scarcityMemo = new WeakMap<RecipeBuildContext, Promise<Scarcity | null>>();

function loadScarcityOnce(ctx: RecipeBuildContext): Promise<Scarcity | null> {
  let p = scarcityMemo.get(ctx);
  if (!p) {
    const facts = ctx.facts!;
    // Live inventory, down the four-rung ladder (crosswalk county → lake county →
    // whole market → open slots). A miss at every rung → open slots + no chart,
    // never an invented count.
    p = loadScarcity({
      zip: facts.zip,
      county: countyForZip(facts.zip),
      price: num(facts.price),
      beds: num(facts.beds),
      sqft: num(facts.sqft),
    }).catch(() => null);
    scarcityMemo.set(ctx, p);
  }
  return p;
}

/** MIDDLE — the scarcity strip (hairline, never a stacked stat grid) + the funnel
 *  chart. The chart tints with the accent the email will actually wear — the chrome
 *  copies `currentDoc.globalStyle` verbatim (the editorial palette is dead), so the
 *  doc's own accent IS the rendered accent. A chart failure simply means the block
 *  is never pushed: an empty chart box is worse than no chart. */
export const comingSoonScarcity: Derivation = async (ctx) => {
  const scarcity = await loadScarcityOnce(ctx);
  const blocks: ChromeBlock[] = [
    {
      block: {
        id: createBlock("stats").id,
        type: "stats",
        props: {
          stats: scarcity ? scarcityStats(scarcity) : scarcityOpenSlots(),
          variant: "strip",
        },
      },
      height: 3,
    },
  ];
  const accent = ctx.currentDoc.globalStyle.accentColor;
  const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
  const chart = scarcity
    ? await chartSpecToEmailImage(
        scarcityChartSpec(scarcity),
        accent,
        `email-charts/coming-soon-${scarcity.county ?? scarcity.grain}-${scarcity.bandLo}-${scarcity.bandHi}-${scarcity.bedFloor}-${scarcity.sqftFloor}-${scarcity.asOfIso}-${tint}.png`,
        ctx.currentDoc.globalStyle.fontFamily,
      ).catch(() => null)
    : null;
  if (chart) {
    blocks.push({
      block: {
        id: createBlock("image").id,
        type: "image",
        // NO CAPTION. The rendered chart already draws its own title AND source line;
        // a caption printed both a second time. `alt` carries the sentence for screen
        // readers and the images-off fallback, which is where that text belongs.
        props: { url: chart.url, kind: "chart", alt: chart.alt },
      },
      height: 5,
    });
  }
  return { blocks };
};

// The sources-note TAIL derivation was DELETED 08/19/2026 by operator decree ("get
// rid of whatever this shit is in all emails"). No email prints a Sources/methodology
// line; SourcesBlock renders null on the email paths as the one-door backstop. The
// scarcity counts still ship in the strip + funnel chart above, computed as before.

/**
 * THE FINISHER — the teaser narrator, structural suppression intact.
 *
 * It gets a DE-IDENTIFIED fact sheet. authorListingNarrative builds its prompt from
 * facts.address / facts.city / facts.zip / facts.remarks — hand it raw ctx.facts and
 * you have literally typed the address into the model's context and are relying on a
 * framing sentence to stop it echoing that back. "It didn't leak the address that
 * time" is luck, not suppression. Strip the fields; then redact the street out of
 * what comes back anyway; a paragraph that STILL leaks is DROPPED to an open slot.
 */
export const comingSoonTeaserNarrator: Finisher = async (ctx, doc) => {
  const facts = ctx.facts!;
  const street = streetLineOf(facts.address);

  // *** THE NARRATOR RUNS ONLY ON LANE-2 MATERIAL. ***
  //
  // Proven on the first live run of this recipe (07/13/2026). With no pasted description,
  // the only facts the narrator holds are the spec cells sitting directly above its own
  // paragraph — and, told to describe a house it cannot see, it INVENTED:
  //
  //   "…across a layout that gives each room room to breathe. The original ask has been
  //    adjusted by just over $100,000, bringing this build to market at a figure the
  //    builder has now committed to."
  //
  // A floor plan we were never given, and an intention we never had. Both are exactly what
  // playbook rule 4 forbids ("a fact about the home is NOT ONLY A NUMBER — a view, a
  // waterfront, a pool, a renovation, a finish is equally an invention if it wasn't
  // given"), and the shared system prompt already forbade both — it did it anyway. Asking
  // harder is not a fix; removing the incentive is. No vendor sells us MLS remarks (all 18
  // SteadyAPI endpoints, 07/13/2026), so the description is a LANE-2 fact: the agent
  // pastes it. Without it there is nothing honest to say that the grid does not already
  // say, and the paragraph is an OPEN SLOT — not an improvisation.
  const teaserFacts: ListingFacts = {
    ...facts,
    address: undefined,
    city: undefined,
    state: undefined,
    zip: undefined,
    remarks: facts.remarks ? redactStreetLine(facts.remarks, street) : undefined,
    // ── TWO FIELDS THAT MUST DIE HERE, BOTH FOUND BY READING A RENDERED PARAGRAPH
    //    08/05/2026 — neither is an address, and stripping the address was not enough.
    //
    // LOT SIZE. `teaserSpecs` deliberately drops the lot cell, and the reason is written
    // three functions up: "a lot size plus a city narrows a parcel search further than a
    // teaser should." That omission was defeated in one sentence — handed the raw facts,
    // the narrator wrote "The 0.2-acre lot is owner-land — not leased." Suppressing a cell
    // from the GRID while feeding it to the WRITER suppresses nothing. Anything the spec
    // strip refuses to print has to be refused to the model in the same breath.
    //
    // DAYS ON MARKET. Strictly worse than a leak, because it is a CONTRADICTION: this
    // email announces a home that is NOT YET FOR SALE, and the narrator opened with "on
    // the market for just over two weeks." Both facts were true of the resolved listing
    // and the sentence is nonsense in a Coming Soon frame. The claim gate could never
    // catch it — DOM was a fact we DID give it, so the paragraph was honest and wrong.
    lotSize: undefined,
    daysOnMarket: undefined,
    // THE COMMUNITY RIDES, BY NAME. What is withheld is the STREET ADDRESS — the house — not
    // the community it sits in. "Coming soon in Bay Colony" is the teaser working as intended:
    // it is exactly the line that makes an agent's sphere lean in, and a buyer cannot walk up
    // to a community and knock on it. The suppression that matters is still absolute below
    // (street, number, ZIP — stripped from the facts, redacted out of the output, and a
    // paragraph that STILL carries the street is dropped entirely by `leaksStreet`).
    community: facts.community,
  };

  const raw = teaserFacts.remarks
    ? await authorListingNarrative(teaserFacts, {
        framing:
          "A COMING-SOON TEASER. This home is not yet on the market and its STREET ADDRESS IS " +
          "DELIBERATELY WITHHELD — that is the point of the email. You must NOT name or hint " +
          "at a street, a street number, a full address, or a ZIP code, even if one appears " +
          "in the description you were given; write around them. YOU MAY name the COMMUNITY " +
          "and the CITY — 'coming soon in Bay Colony' is the whole appeal of this email, and " +
          "a community is not a doorstep. Tighten the agent's description into two or three " +
          "sentences. Describe ONLY what that description actually says — you may not add a " +
          "room, a layout, a finish, a view, a builder's intention, or any quality it does not " +
          "state. Do not claim the home is rare or scarce; the email's own figures make " +
          "that case." +
          // THE FRAMING USED TO INSTRUCT THE EXACT CLAIM THE GATE THEN KILLED. Until
          // 08/05/2026 this said "…two or three sentences OF ANTICIPATION and CLOSE ON THE
          // FACT THAT IT WILL BE SHOWN PRIVATELY FIRST." Both halves are claims the model
          // was never given: "shown privately first" is a SEQUENCE claim about what happens
          // when, and "anticipation" pushes it to characterise a seller's MOTIVE. The
          // no-invention gate correctly dropped the paragraph — first live run of this
          // recipe under the account brand printed `[narrative] DROPPED — the narrator made
          // 2 claim(s) it was not given: motive("serious"), sequence("before the home is
          // listed")`. The guard was right and the FRAMING was wrong: we were ordering the
          // model to invent, then discarding its work for obeying. The private-preview
          // promise belongs where it already lives and is TRUE by construction — the CTA
          // button ("Join the Private Preview List") and the ribbon ("Coming Soon"), both
          // written by code. Prose never has to carry it.
          " Do NOT say when the home will be listed, shown, or previewed, and do not " +
          "describe the seller's motivation or urgency — you were not told either one, the " +
          "ribbon and the button already say it, and a claim about timing is dropped by the " +
          "no-invention gate rather than sent.",
      }).catch(() => null)
    : null;

  // Belt and braces: redact, then verify. A paragraph that STILL carries the street is
  // dropped to an open slot — an empty commentary slot is a canvas affordance the agent
  // fills, and it is strictly better than a teaser that names the house.
  const cleaned = raw ? redactStreetLine(raw, street) : null;
  const narrative = cleaned && !leaksStreet(cleaned, street) ? cleaned : null;
  // NEVER SILENT (08/09/2026): this drop was the one un-logged path — a paragraph
  // killed here looked identical to "no description existed", and the demo shipped
  // wordless for a night before anyone could say why.
  if (cleaned && !narrative)
    console.warn("[narrative] DROPPED — the authored paragraph still carried the street");

  // LANDMINE: fillNarrative SKIPS a text block that already has content. The chrome leaves
  // the commentary slot empty on purpose, but clearNarrativeSlots keeps that true even if
  // a sticky block ever arrives pre-filled.
  return narrative ? fillNarrative(clearNarrativeSlots(doc), narrative) : doc;
};
