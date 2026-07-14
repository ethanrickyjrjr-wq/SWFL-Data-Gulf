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
// Geography still ships, but only at the grain a teaser is allowed: the CITY in the hero
// and the COUNTY in the scarcity block, both written by code, never by the model.
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

import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import { createBlock } from "@/lib/email/doc/default-docs";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
import { pricePerSqft, shortType, spec, specFootnote } from "@/lib/email/listing-flyer";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
// KNOWN-DEBT(data_lake: listing_state lives in the data_lake schema, which the typed
// Supabase client intentionally does not cover — see utils/supabase/service-role.ts):
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import zipCounty from "@/fixtures/swfl-zip-county.json";
import { authorListingNarrative, clearNarrativeSlots, fillNarrative } from "./shared";
import { deIdentifyCommunity } from "@/lib/listings/listing-detail";
import type { RecipeBuildContext } from "./index";
import type { ChromeBlock, LifecycleChrome } from "@/lib/email/lifecycle-chrome";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

/** The citation + CTA fallback root. HARDCODED, exactly as lib/listings/resolve-subject.ts
 *  hardcodes its `sourceUrl`: a citation always points at SWFL Data Gulf. Reading
 *  NEXT_PUBLIC_SITE_URL here would ship "http://localhost:3000" as the source link of
 *  every locally-built doc (observed 07/13/2026 in the first proof run). */
const SITE = "https://www.swfldatagulf.com";

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
export interface Scarcity {
  county: string;
  /** Active for-sale HOMES in the county (beds + sqft present — land excluded). */
  countyHomes: number;
  /** …of those, inside the subject's price band. */
  inBand: number;
  /** …of those, also matching the subject's beds and size. */
  comparable: number;
  bandLo: number;
  bandHi: number;
  bedFloor: number;
  sqftFloor: number;
  /** The lake's own freshness — max(last_seen) on the county's rows, ISO yyyy-mm-dd. */
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
): { bandLo: number; bandHi: number; sqftFloor: number } {
  // Round to the same thousand `usdShort` renders, BEFORE the query sees it.
  const toK = (n: number) => Math.round(n / 1000) * 1000;
  return {
    bandLo: toK(price * 0.9),
    bandHi: toK(price * 1.1),
    sqftFloor: Math.floor((sqft * 0.8) / 50) * 50,
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

/** yyyy-mm-dd → MM/DD/YYYY (the operator's as-of format; the raw token is internal). */
function mdY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

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
export async function loadScarcity(
  county: string,
  price: number,
  beds: number,
  sqft: number,
): Promise<Scarcity | null> {
  if (!county || !price || !beds || !sqft) return null;
  const { bandLo, bandHi, sqftFloor } = scarcityBand(price, sqft);
  try {
    const db = createServiceRoleClientUntyped();
    const base = () =>
      db
        .schema("data_lake")
        .from("listing_state")
        .select("listing_id", { count: "exact", head: true })
        .eq("county", county)
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
      db
        .schema("data_lake")
        .from("listing_state")
        .select("last_seen")
        .eq("county", county)
        .eq("state", "active")
        .eq("sale_or_rent", "sale")
        .eq("source_name", "api_feed")
        .order("last_seen", { ascending: false })
        .limit(1),
    ]);

    const countyHomes = total.count ?? 0;
    if (!countyHomes) return null; // no inventory for this county → nothing to claim
    if (band.count == null || like.count == null) return null;

    const lastSeen = (fresh.data as { last_seen?: string }[] | null)?.[0]?.last_seen;
    const asOfIso = String(lastSeen ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);

    return {
      county,
      countyHomes,
      inBand: band.count,
      comparable: like.count,
      bandLo,
      bandHi,
      bedFloor: beds,
      sqftFloor,
      asOfIso,
    };
  } catch {
    return null; // a DB hiccup degrades to open slots — it never blocks the build
  }
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
  return [
    spec(count(s.countyHomes), `Active homes · ${s.county} County`, "muted"),
    spec(count(s.inBand), `Priced ${usdShort(s.bandLo)}–${usdShort(s.bandHi)}`),
    spec(count(s.comparable), `…that also match beds + size`, "primary"),
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
export function scarcityChartSpec(s: Scarcity): ChartSpec {
  return {
    frameId: "bar-table",
    title: `Homes like this one in ${s.county} County`,
    columns: ["Segment", "Active homes"],
    rows: [
      [`All active homes`, s.countyHomes],
      [`In this price range`, s.inBand],
      [`Beds + size match too`, s.comparable],
    ],
    value_format: "number",
    chart_type: "bar",
    asOf: s.asOfIso,
    source: { citation: "SWFL Data Gulf", url: SITE },
  } as ChartSpec;
}

// ── The build ────────────────────────────────────────────────────────────────

function withCommas(n?: string): string | undefined {
  const digits = String(n ?? "").replace(/[^\d]/g, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : undefined;
}

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
  return [
    spec(facts.beds, "Beds"),
    spec(facts.baths, "Baths"),
    spec(withCommas(facts.sqft), "Sq Ft"),
    spec(pricePerSqft(facts.price, facts.sqft), "$/Sq Ft", "primary"),
    spec(shortType(facts.propertyType) || undefined, "Type", "muted"),
  ];
}

export async function buildComingSoon(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → nothing to tease. Fall through to the generic author rather than
  // shipping an empty teaser (never refuse a build, but never fake a house either).
  if (!facts) return null;

  // THE ONLY GEOGRAPHY THAT SHIPS: the city (hero) and the county (scarcity). Both
  // written here, in code. `facts.address` is never read into a rendered field.
  const city = facts.city?.trim() || "";
  const where = teaserWhere(facts);
  const county = countyForZip(facts.zip);

  // Live county inventory. A miss → open slots + no chart, never an invented count.
  const scarcity = county
    ? await loadScarcity(county, num(facts.price), num(facts.beds), num(facts.sqft)).catch(
        () => null,
      )
    : null;

  const ctaUrl = brandWebsiteUrl(currentDoc) ?? SITE;

  // The chrome, minus the parts that need a rendered chart. Declared ONCE so the shell
  // pass below and the real pass cannot drift apart.
  const chrome: LifecycleChrome = {
    ribbon: "Coming Soon",
    // The alt text is the classic leak: buildListingFlyer sets `alt: facts.address`, and
    // alt text is READ ALOUD by screen readers and shown when images are blocked — which
    // is most of Outlook. It says the CITY. The link goes to the agent's own site, never
    // a listing page for this house. No photo → the chrome's dropzone, whose alt is the
    // heroLabel (the city) — so even the open slot names no street.
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: city
            ? `Coming soon — a home in ${city}`
            : "Coming soon — a home in Southwest Florida",
          linkUrl: ctaUrl,
        }
      : null,
    // The hero: the CITY over the PRICE. New Listing puts the ADDRESS there; that one
    // substitution is this deliverable.
    heroValue: facts.price ?? "",
    heroLabel: where,
    specs: teaserSpecs(facts),
    specFootnote: specFootnote(facts),
    // The narrator's slot stays EMPTY here and is authored into below — and only from
    // lane-2 material. See the block comment at the narrator.
    narrative: "",
    ctaLabel: "Join the Private Preview List",
    ctaUrl,
  };

  // THE ACCENT THE EMAIL WILL ACTUALLY WEAR. The chrome owns the brand-or-editorial
  // decision (a real user brand rides through untouched; a blank house brand gets the
  // campaign's editorial palette), and the chart PNG has to be tinted with the SAME
  // accent or the picture is a different brand from the email around it. Re-deriving that
  // rule here would duplicate a constant the chrome owns and let the two drift, so we ASK
  // it: one extra call to a pure function, zero I/O.
  const accent = buildLifecycleEmail(currentDoc, chrome).globalStyle.accentColor;

  // The chart. Only ever rendered from counts that are real; a failure simply means the
  // block is never pushed. An empty chart box is worse than no chart.
  const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
  const chart = scarcity
    ? await chartSpecToEmailImage(
        scarcityChartSpec(scarcity),
        accent,
        `email-charts/coming-soon-${scarcity.county}-${scarcity.bandLo}-${scarcity.bandHi}-${scarcity.bedFloor}-${scarcity.sqftFloor}-${scarcity.asOfIso}-${tint}.png`,
      ).catch(() => null)
    : null;

  // ── MY MIDDLE — the scarcity content ──────────────────────────────────────
  // A hairline STRIP (never a stacked stat grid — that is the wall the campaign chrome
  // exists to kill), then the funnel that draws it.
  const middle: ChromeBlock[] = [
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
  if (chart) {
    middle.push({
      block: {
        id: createBlock("image").id,
        type: "image",
        // NO CAPTION. The rendered chart already draws its own title ("Homes like this
        // one in Lee County") AND its own source line ("SWFL Data Gulf · as of ...").
        // Passing chart.caption printed both a SECOND time underneath the image —
        // title and provenance, stated twice, in the one email that is supposed to be
        // about scarcity. `alt` still carries the full sentence for screen readers and
        // for the images-off fallback, which is where that text belongs. Every other
        // recipe already omits the caption here; this was the one that didn't.
        props: { url: chart.url, kind: "chart", alt: chart.alt },
      },
      height: 5,
    });
  }

  // ── MY TAIL — the sources note ────────────────────────────────────────────
  // The citation AND the methodology, in the collapsed list (rules of engagement: sources
  // ride in the collapsed list, not inline). This is where the band is DISCLOSED: the
  // counts are real, and the stated criterion is what makes them checkable rather than a
  // number we asserted.
  const tail: ChromeBlock[] = scarcity
    ? [
        {
          block: {
            id: createBlock("sources").id,
            type: "sources",
            props: {
              sources: [
                {
                  label: `Active for-sale homes, ${scarcity.county} County — as of ${mdY(scarcity.asOfIso)}`,
                  url: SITE,
                },
              ],
              note: `"Like this one" = list price ${usdShort(scarcity.bandLo)}–${usdShort(scarcity.bandHi)}, ${scarcity.bedFloor}+ beds, ${count(scarcity.sqftFloor)}+ sq ft. Vacant land excluded.`.slice(
                0,
                200,
              ),
            },
          },
          height: 3,
        },
      ]
    : [];

  let doc: EmailDoc = {
    ...buildLifecycleEmail(currentDoc, { ...chrome, middle, tail }),
    // THE SUBJECT LINE. deriveEmailDocSubject falls back to a hero's LABEL, so without
    // this the subject would be bare geography. Written deterministically from the city —
    // a model never touches it, so it can never smuggle the street into it.
    subjectVariants: [
      city
        ? `Coming soon in ${city} — before it hits the market`
        : "Coming soon — before it hits the market",
    ],
  };

  // ── The narrator ───────────────────────────────────────────────────────────
  // It gets a DE-IDENTIFIED fact sheet. authorListingNarrative builds its prompt from
  // facts.address / facts.city / facts.zip / facts.remarks — hand it raw ctx.facts and
  // you have literally typed "Address: 326 Shore Dr, Fort Myers, FL 33905" into the
  // model's context and are relying on a framing sentence to stop it echoing that back.
  // "It didn't leak the address that time" is luck, not suppression. Strip the fields;
  // then redact the street out of what comes back anyway.
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
    // THE SPREAD IS THE LEAK. `...facts` now carries `community`, and `community.subdivision`
    // is "Bay Colony" — a name that identifies the very listing this email exists to withhold.
    // Every other identifying field on this object is explicitly stripped above; the community
    // NAME has to be stripped too, or a spread operator quietly undoes the whole recipe.
    // The amenities themselves are safe and are the best thing a teaser can say: "a gated golf
    // community with a pool" builds anticipation without pointing at which one.
    community: deIdentifyCommunity(facts.community),
  };

  const raw = teaserFacts.remarks
    ? await authorListingNarrative(teaserFacts, {
        // Belt AND braces: the name is already stripped from the facts, and the source line
        // itself is rendered with its own "do not name the community" instruction.
        deIdentifyCommunity: true,
        framing:
          "A COMING-SOON TEASER. This home is not yet on the market and its LOCATION IS " +
          "DELIBERATELY WITHHELD — that is the point of the email. You must NOT name or " +
          "hint at a street, a street number, an address, a ZIP code, a subdivision, a " +
          "city, or a neighborhood, even if one appears in the description you were given; " +
          "write around them. Tighten the agent's description into two or three sentences " +
          "of anticipation and close on the fact that it will be shown privately first. " +
          "Describe ONLY what that description actually says — you may not add a room, a " +
          "layout, a finish, a view, a builder's intention, or any quality it does not " +
          "state. Do not claim the home is rare or scarce; the email's own figures make " +
          "that case.",
      }).catch(() => null)
    : null;

  // Belt and braces: redact, then verify. A paragraph that STILL carries the street is
  // dropped to an open slot — an empty commentary slot is a canvas affordance the agent
  // fills, and it is strictly better than a teaser that names the house.
  const cleaned = raw ? redactStreetLine(raw, street) : null;
  const narrative = cleaned && !leaksStreet(cleaned, street) ? cleaned : null;

  // LANDMINE: fillNarrative SKIPS a text block that already has content. The chrome leaves
  // the commentary slot empty on purpose, but clearNarrativeSlots keeps that true even if
  // a sticky block ever arrives pre-filled.
  if (narrative) doc = fillNarrative(clearNarrativeSlots(doc), narrative);

  return doc;
}
