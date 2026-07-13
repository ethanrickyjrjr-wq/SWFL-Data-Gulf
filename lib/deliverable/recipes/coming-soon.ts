// lib/deliverable/recipes/coming-soon.ts
//
// R2 · COMING SOON — the teaser that builds a private-preview list before the sign
// goes up. The SAME resolved house as New Listing, wearing a different hat.
//
// The six answers (playbook Part 6):
//
//   1. SUBJECT — the same listing address as new-listing, resolved ONCE by the
//      dispatcher (ctx.facts). *** BUT THE STREET ADDRESS IS SUPPRESSED. *** That is
//      the entire point of this recipe, and the address is sitting right there in
//      ctx.facts waiting to be leaked. It must not reach the hero, the photo alt
//      text, the subject line, the CTA url, or the prose. Suppression here is
//      STRUCTURAL, not a request: this file never reads `facts.address` into a
//      rendered field, it strips address/city/ZIP out of the narrator's fact sheet
//      (a framing sentence asking a model nicely is not a guarantee — see
//      `teaserFacts`), and it redacts the street out of the model's OUTPUT as well
//      (`redactStreetLine`). A narrative that still leaks is DROPPED to an open slot.
//      Geography still ships — but only at the grain a teaser is allowed: the CITY in
//      the hero and the COUNTY in the scarcity block, both written by code, never by
//      the model.
//   2. SKELETON — a coded grid in THIS file (like buildListingFlyer). No committed
//      SEED_DOC fits: every listing skeleton in default-docs.ts (`new-listing`,
//      `listing-feature`, `skeleton-listing-showcase`, `open-house`, `price-reduced`)
//      is address-FORWARD — it positions the street address as the hero label
//      ("Price and address") under a "New Listing" kicker. Loading one and blanking
//      that slot would leave an open slot whose label INVITES the user to paste the
//      address back in, which is the exact opposite of this deliverable. And
//      `buildListingFlyer` hardcodes `alt: facts.address` on the hero photo plus a
//      "New Listing" kicker, so it cannot be reused either. Reported as a shared-file
//      proposal instead: a `coming-soon` seed mirroring this grid.
//   3. CELLS — the home (beds · baths · sq ft), then SCARCITY from LIVE COUNTY
//      INVENTORY: `data_lake.listing_state` (populated daily by
//      ingest/pipelines/listing_lifecycle) carries every active for-sale listing with
//      its county, list price, beds and sqft. Three real counts, no spec grid, no
//      invention. Any count we cannot source → an OPEN SLOT, never a zero.
//      LAND FILTER (the same hard rule the comps chart learned): a row with no beds
//      and no sqft is a VACANT LOT, not a home — 6,567 of Lee County's 20,560 active
//      rows are bare land. Counting them as "homes" would inflate the denominator and
//      make the scarcity claim a lie. Filter BY DATA (`beds` and `sqft` non-null),
//      never by guessing at `property_type`.
//   4. CHART — inventory-scarcity. This deliverable IS about a number ("how few homes
//      like this one exist"), and the number is about the SUBJECT (its price band, its
//      beds, its size). A three-tier funnel: all active homes → in this price range →
//      beds + size match too. If the counts don't load, the slot is DROPPED
//      (`dropEmptyChartSlot`) — an empty chart box is worse than no chart.
//   5. PROSE — a teaser, authored from a DE-IDENTIFIED fact sheet (no address, no
//      city, no ZIP, remarks street-redacted) and forbidden from naming a location at
//      all. It describes the HOME. Numbers, geography and the scarcity claim are
//      code's job, not the model's.
//   6. FRAMING — "Coming Soon" kicker, price + city hero (never the street), a
//      private-preview CTA.
//
// LIVE PROOF (07/13/2026, 326 Shore Dr, Fort Myers 33905 → $595,000 · 3 bd · 3.5 ba ·
// 2,847 sq ft · Lee County): 13,122 active Lee County homes · 1,062 priced
// $536K–$655K · 328 that also match on beds and size.

import { createBlock, DEFAULT_GLOBAL_STYLE } from "@/lib/email/doc/default-docs";
import { brandWebsiteUrl, heroPhotoBlock } from "@/lib/email/inject-photo";
import { chartSpecToEmailImage } from "@/lib/email/spec-to-png";
// KNOWN-DEBT(data_lake: listing_state lives in the data_lake schema, which the typed
// Supabase client intentionally does not cover — see utils/supabase/service-role.ts):
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import zipCounty from "@/fixtures/swfl-zip-county.json";
import {
  authorListingNarrative,
  clearNarrativeSlots,
  dropEmptyChartSlot,
  fillNarrative,
} from "./shared";
import type { RecipeBuildContext } from "./index";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type {
  BlockLayout,
  EmailBlock,
  EmailDoc,
  FontFamily,
  StatItem,
} from "@/lib/email/doc/types";

/** The citation + CTA fallback root. HARDCODED, exactly as lib/listings/resolve-subject.ts
 *  hardcodes its `sourceUrl`: a citation always points at SWFL Data Gulf. Reading
 *  NEXT_PUBLIC_SITE_URL here would ship "http://localhost:3000" as the source link of
 *  every locally-built doc (observed 07/13/2026 in the first proof run). */
const SITE = "https://www.swfldatagulf.com";

/** The teaser palette — applied ONLY when the incoming brand is still the house
 *  default (a blank brand). A real user brand carries through untouched, exactly as
 *  buildListingFlyer does it. Brand is sticky; we never author one. */
const TEASER_STYLE = {
  primaryColor: "#111A2E",
  accentColor: "#C9A227",
  fontFamily: "BOOK_SERIF" as FontFamily,
  displayFontFamily: "PLAYFAIR_SERIF" as FontFamily,
  textColor: "#22293A",
  backdropColor: "#F1EEE8",
};

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

/** The comparison band: ±10% of the list price, at least the subject's bed count, and
 *  at least 80% of its size (floored to a clean 50 sq ft so the label reads honestly
 *  and the query matches the label exactly). Pure. */
export function scarcityBand(
  price: number,
  sqft: number,
): { bandLo: number; bandHi: number; sqftFloor: number } {
  return {
    bandLo: Math.round(price * 0.9),
    bandHi: Math.round(price * 1.1),
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

/** The scarcity cells. Every value is a real count; every label states the criterion
 *  that produced it, so the reader can see exactly what is being counted. */
export function scarcityStats(s: Scarcity): StatItem[] {
  return [
    { value: count(s.countyHomes), label: `Active homes · ${s.county} County` },
    { value: count(s.inBand), label: `Priced ${usdShort(s.bandLo)}–${usdShort(s.bandHi)}` },
    { value: count(s.comparable), label: `…that also match beds + size` },
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

// ── The coded grid ───────────────────────────────────────────────────────────

function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

function at<T extends EmailBlock>(block: T, y: number, h: number, opts?: Partial<BlockLayout>): T {
  return { ...block, layout: { x: 0, y, w: 12, h, ...opts } };
}

function withCommas(n?: string): string | undefined {
  const digits = String(n ?? "").replace(/[^\d]/g, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : undefined;
}

/** A stat cell: sourced → the value; unsourced → an EMPTY value, i.e. an OPEN SLOT
 *  whose LABEL is the instruction on the canvas, and which StatsBlock drops from the
 *  sent email (`emailRender`). Never a zero, never a naked label to a recipient. */
function spec(value: string | undefined, label: string): StatItem {
  return { value: value && value.trim() ? value.trim().slice(0, 24) : "", label };
}

const num = (s?: string): number => Number(String(s ?? "").replace(/[^\d.]/g, "")) || 0;

export async function buildComingSoon(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  // No subject → nothing to tease. Fall through to the generic author rather than
  // shipping an empty teaser (never refuse a build, but never fake a house either).
  if (!facts) return null;

  const brandIsHouse = currentDoc.globalStyle.accentColor === DEFAULT_GLOBAL_STYLE.accentColor;
  const globalStyle = brandIsHouse
    ? { ...currentDoc.globalStyle, ...TEASER_STYLE }
    : { ...currentDoc.globalStyle };

  // THE ONLY GEOGRAPHY THAT SHIPS: the city (hero) and the county (scarcity). Both
  // written here, in code. `facts.address` is never read into a rendered field.
  const city = facts.city?.trim() || "";
  const where = city ? `${city}, ${facts.state?.trim() || "FL"}` : "Southwest Florida";
  const county = countyForZip(facts.zip);

  // Live county inventory. A miss → open slots + no chart, never an invented count.
  const scarcity = county
    ? await loadScarcity(county, num(facts.price), num(facts.beds), num(facts.sqft)).catch(
        () => null,
      )
    : null;

  // The chart. Only when the counts are real; otherwise the slot is dropped below.
  const accent = globalStyle.accentColor || "#C9A227";
  const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
  const chart = scarcity
    ? await chartSpecToEmailImage(
        scarcityChartSpec(scarcity),
        accent,
        `email-charts/coming-soon-${scarcity.county}-${scarcity.bandLo}-${scarcity.bandHi}-${scarcity.bedFloor}-${scarcity.sqftFloor}-${scarcity.asOfIso}-${tint}.png`,
      ).catch(() => null)
    : null;

  const ctaUrl = brandWebsiteUrl(currentDoc) ?? SITE;

  const blocks: EmailBlock[] = [];
  let y = 0;
  const push = (block: EmailBlock, h: number, opts?: Partial<BlockLayout>) => {
    blocks.push(at(block, y, h, opts));
    y += h;
  };

  // 1. Header — the agent's branded header (sticky).
  push(keepOrDefault(currentDoc, "header"), 2);

  // 2. Hero PHOTO. The alt text is the classic leak: buildListingFlyer sets
  //    `alt: facts.address`, and alt text is READ ALOUD by screen readers and shown
  //    when images are blocked — which is most of Outlook. It says the city, never the
  //    street. The link goes to the agent's site, never a listing page for this house.
  push(
    facts.photos[0]
      ? heroPhotoBlock({
          url: facts.photos[0],
          alt: city
            ? `Coming soon — a home in ${city}`
            : "Coming soon — a home in Southwest Florida",
          linkUrl: ctaUrl,
        })
      : {
          id: createBlock("image").id,
          type: "image",
          props: {
            url: "",
            kind: "photo",
            alt: "Add the teaser photo — an exterior or a detail shot, no street sign",
          },
        },
    6,
  );

  // 3. Hero — "Coming Soon" + the price + the CITY. Never the street.
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        kicker: "Coming Soon",
        value: facts.price ?? "",
        label: where,
      },
    },
    3,
  );

  // 4. The home — enough to make "a home like this" mean something, and nothing that
  //    locates it. No address, no ZIP, no lot (a lot size plus a city narrows a parcel
  //    search further than a teaser should).
  push(
    {
      id: createBlock("stats").id,
      type: "stats",
      props: {
        stats: [
          spec(facts.beds, "Beds"),
          spec(facts.baths, "Baths"),
          spec(withCommas(facts.sqft), "Sq Ft"),
        ],
      },
    },
    2,
  );

  // 5. SCARCITY — live county inventory. Sourced → three real counts. Unsourced →
  //    three OPEN SLOTS whose labels tell the user exactly what to put there. Never a
  //    zero, never a guess.
  push(
    {
      id: createBlock("stats").id,
      type: "stats",
      props: {
        stats: scarcity
          ? scarcityStats(scarcity)
          : [
              spec(undefined, "Active homes in your county — add the count"),
              spec(undefined, "How many are in this price range"),
              spec(undefined, "How many match beds + size"),
            ],
      },
    },
    2,
  );

  // 6. The teaser paragraph. Empty here; authored below (and left an OPEN SLOT if the
  //    narrator has nothing safe to say).
  push({ id: createBlock("text").id, type: "text", props: { body: "", align: "left" } }, 4);

  // 7. The scarcity chart. Empty when the counts didn't load — dropEmptyChartSlot
  //    removes it below rather than shipping an empty box.
  push(
    {
      id: createBlock("image").id,
      type: "image",
      props: {
        url: chart?.url ?? "",
        kind: "chart",
        alt: chart?.alt ?? "Active-inventory scarcity",
        caption: chart?.caption ?? "",
      },
    },
    5,
  );

  // 8. Sources — the citation AND the methodology, in the collapsed list (rules of
  //    engagement: sources ride in the collapsed list, not inline). This is where the
  //    band is DISCLOSED: the counts are real, and the stated criterion is what makes
  //    them checkable rather than a number we asserted.
  if (scarcity) {
    push(
      {
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
      3,
    );
  }

  // 9. Agent card — sticky.
  push(keepOrDefault(currentDoc, "agent-card"), 4);

  // 10. CTA — the private preview list. The url is the agent's own site (or ours);
  //     it never carries the address as a slug, a query param, or anything else.
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: { label: "Join the Private Preview List", url: ctaUrl },
    },
    2,
  );

  // 11. Footer — CAN-SPAM, sticky.
  push(keepOrDefault(currentDoc, "footer"), 3, { static: true });

  let doc: EmailDoc = {
    globalStyle,
    blocks,
    // THE SUBJECT LINE. deriveEmailDocSubject falls back to the hero's LABEL, so
    // without this the subject would be bare geography. Written deterministically from
    // the city — a model never touches it, so it can never smuggle the street into it.
    subjectVariants: [
      city
        ? `Coming soon in ${city} — before it hits the market`
        : "Coming soon — before it hits the market",
    ],
  };

  if (!chart) doc = dropEmptyChartSlot(doc);

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
  // Proven on the first live run of this recipe (07/13/2026). With no pasted
  // description, the only facts the narrator holds are the spec cells sitting directly
  // above its own paragraph — and, told to describe a house it cannot see, it INVENTED:
  //
  //   "…across a layout that gives each room room to breathe. The original ask has been
  //    adjusted by just over $100,000, bringing this build to market at a figure the
  //    builder has now committed to."
  //
  // A floor plan we were never given, and an intention we never had. Both are exactly
  // what playbook rule 4 forbids ("a fact about the home is NOT ONLY A NUMBER — a view,
  // a waterfront, a pool, a renovation, a finish is equally an invention if it wasn't
  // given"), and the shared system prompt already forbade both — it did it anyway.
  // Asking harder is not a fix; removing the incentive is. No vendor sells us MLS
  // remarks (all 18 SteadyAPI endpoints, 07/13/2026), so the description is a LANE-2
  // fact: the agent pastes it. Without it there is nothing honest to say that the grid
  // does not already say, and the paragraph is an OPEN SLOT — not an improvisation.
  const teaserFacts: ListingFacts = {
    ...facts,
    address: undefined,
    city: undefined,
    state: undefined,
    zip: undefined,
    remarks: facts.remarks ? redactStreetLine(facts.remarks, street) : undefined,
  };

  const raw = teaserFacts.remarks
    ? await authorListingNarrative(teaserFacts, {
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

  // LANDMINE: fillNarrative SKIPS a text block that already has content. This grid
  // leaves the commentary slot empty on purpose, but clearNarrativeSlots keeps that
  // true even if a sticky block ever arrives pre-filled.
  if (narrative) doc = fillNarrative(clearNarrativeSlots(doc), narrative);

  return doc;
}
