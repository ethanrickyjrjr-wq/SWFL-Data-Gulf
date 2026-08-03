// lib/deliverable/recipes/listings-showcase.ts
//
// PROVENANCE: distilled from Zillow's "3 applause-worthy homes" send
// (reallygoodemails.com/emails/3-applause-worthy-homes), found 08/03/2026 via
// crawl4ai + a direct screenshot read (RGE serves the desktop capture as an
// image, not raw HTML — read with vision, no paid API call).
//
// STRUCTURE KEPT (Step 3, deliverable-distiller skill — arrangement only, never
// the source's copy, images, or brand): a repeating full-width card — PHOTO,
// then a bold one-line hook, then ONE short "why" sentence, then ONE CTA —
// stacked three times, with NO price/beds/baths/sqft spec sheet anywhere, PLUS
// one closing CTA at the end. The photo and the honest reason ARE the pitch;
// the source never shows a number. This is genuinely different from every
// other recipe in this file: all seven lifecycle recipes and market-comps/
// price-reduced lead with a spec strip or a chart. This one is the only
// recipe that shows MULTIPLE real homes and leads with a photo + a feature,
// never a figure.
//
// ── WHY EVERY "REASON" IS DETERMINISTIC, NEVER LLM-WRITTEN ──────────────────
// The source's charm is a curator's eye picking ONE real feature per home. We
// have no curator — we have real per-listing fields (lot size, new-
// construction flag, property type, a real price cut, days-on-market). So the
// "why" is CHOSEN and PHRASED in code from those fields (same doctrine as
// community-info's composeNarrative / back-on-market's neutralTruth) — never a
// model inventing a vibe about a house it has never seen. A listing with no
// qualifying field still gets an honest generic line built only from whatever
// spec fields it actually holds.
//
// ── HARD RULE: NO REPEATED HIGHLIGHT IN ONE EMAIL (operator decree 08/03/2026) ─
// `assignHighlights` never lets a category repeat — a listing whose only real
// feature is already claimed by an earlier card falls to the generic
// spec-based fallback instead of restating the same line twice. A final
// dedupe pass (still zero invention — it only ever appends the listing's OWN
// real address) guarantees no two cards can ever read identically, even in
// the residual case of two homes with literally the same beds/baths/sqft.
// Caught live: repeating "Brand-new construction" verbatim on two cards is
// also the kind of duplicate content that can trip a client's "similar
// content" collapse — never acceptable on an outgoing email either way.
//
// ── REAL LISTINGS WITH REAL CLICK-THROUGH LINKS ──────────────────────────────
// The lake-only feed (`loadListingContext`, `data_lake.listing_state`) does
// NOT carry a listing-detail URL — verified live against the table's actual
// 44 columns (08/03/2026): no `listing_url`. `fetchPhotoListings`
// (lib/listings/steadyapi.ts) is the live SteadyAPI-backed path that DOES
// resolve one (`canonicalRealtorUrl(permalink)`) and already filters to
// photo-bearing rows. Every picked listing must carry BOTH a real photo AND a
// real listing URL — every photo and every "Take a look" button links
// straight to the real realtor.com listing page; a listing missing either is
// skipped, never rendered dead.
//
// No ZIP named -> null (back-on-market's own AREA-mode precedent: never guess
// a city the user didn't name). Fewer than one qualifying listing -> null too
// (RULE 0.7: never an invented or link-less card; the default grid is still a
// real email).

import { createBlock } from "@/lib/email/doc/default-docs";
import { finalizeDoc, type PlanEntry } from "@/lib/email/doc/finalize-doc";
import { GRID_COLS } from "@/lib/email/grid-schema";
import { scopeCity, rankListings } from "@/lib/listings/select";
import { fetchPhotoListings } from "@/lib/listings/steadyapi";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
import type { Listing } from "@/lib/listings/rentcast";
import type { EmailBlock, EmailDoc } from "@/lib/email/doc/types";
import type { RecipeBuildContext } from "./index";

const MAX_HOMES = 3;

export interface Highlight {
  category: string;
  title: string;
  body: string;
}

const usd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const oneDecimal = (n: number): string => (Math.round(n * 10) / 10).toString();

/** Every category this recipe can honestly claim, priority order — each guarded
 *  by a REAL field check. assignHighlights() walks this top to bottom per home. */
const CANDIDATES: ReadonlyArray<{
  category: string;
  eligible: (l: Listing) => boolean;
  build: (l: Listing) => Highlight;
}> = [
  {
    category: "new-construction",
    eligible: (l) => l.isNewConstruction === true,
    build: () => ({
      category: "new-construction",
      title: "Brand-new construction",
      body: "Nothing to renovate, nothing to guess about — this one was just built.",
    }),
  },
  {
    category: "big-lot",
    eligible: (l) => l.lotSize != null && l.lotSize >= 0.5,
    build: (l) => ({
      category: "big-lot",
      title: "Room to spread out",
      body: `Sits on ${oneDecimal(l.lotSize!)} acres — real space around the house.`,
    }),
  },
  {
    category: "low-maintenance",
    eligible: (l) => /condo|townhouse/i.test(l.propertyType ?? ""),
    build: () => ({
      category: "low-maintenance",
      title: "Low-maintenance living",
      body: "No yard work, no roof to worry about — just move in.",
    }),
  },
  {
    category: "price-cut",
    eligible: (l) => l.isPriceReduced === true && (l.priceReduction ?? 0) > 0,
    build: (l) => ({
      category: "price-cut",
      title: "Priced to move",
      body: `The list price was just cut by ${usd(l.priceReduction!)}.`,
    }),
  },
  {
    category: "just-listed",
    eligible: (l) =>
      l.isNewListing === true || (l.daysOnMarket != null && !l.domIsFloor && l.daysOnMarket <= 7),
    build: () => ({
      category: "just-listed",
      title: "Just hit the market",
      body: "This one only went active this week.",
    }),
  },
  {
    category: "big-house",
    eligible: (l) => l.squareFootage != null && l.squareFootage >= 2800,
    build: (l) => ({
      category: "big-house",
      title: "Plenty of room",
      body: `${l.squareFootage!.toLocaleString("en-US")} square feet of real living space.`,
    }),
  },
];

/** Universal fallback — always eligible, built ONLY from fields the listing
 *  actually holds. Never a made-up feature. */
function fallbackHighlight(l: Listing): Highlight {
  const specParts = [
    l.bedrooms != null ? `${l.bedrooms} bed` : null,
    l.bathrooms != null ? `${l.bathrooms} bath` : null,
    l.squareFootage != null ? `${l.squareFootage.toLocaleString("en-US")} sq ft` : null,
  ].filter((s): s is string => Boolean(s));
  return {
    category: "generic",
    title: "Worth a look",
    body: specParts.length
      ? `${specParts.join(", ")} — a real listing in ${l.city || "the area"}.`
      : `A real listing in ${l.city || "the area"}, worth a look.`,
  };
}

/**
 * One highlight per listing, IN ORDER. HARD RULE: a category, once used, never
 * repeats — a listing whose only real qualifying category is already claimed
 * falls straight to the generic per-home fallback (never restates a used
 * category, never leaves a card without a highlight). A final pass guarantees
 * no two cards can read identically even after the fallback, by appending the
 * listing's own real address — the one thing guaranteed unique across
 * distinct homes, never an invented distinguisher. Pure and exported for the
 * test.
 */
export function assignHighlights(listings: readonly Listing[]): Highlight[] {
  const used = new Set<string>();
  const picked = listings.map((l) => {
    const eligible = CANDIDATES.filter((c) => c.eligible(l));
    const fresh = eligible.find((c) => !used.has(c.category));
    const highlight = fresh ? fresh.build(l) : fallbackHighlight(l);
    used.add(highlight.category);
    return highlight;
  });

  const seenText = new Set<string>();
  return picked.map((h, i) => {
    const sig = `${h.title} ${h.body}`;
    if (!seenText.has(sig)) {
      seenText.add(sig);
      return h;
    }
    const l = listings[i]!;
    const disambiguated: Highlight = { ...h, body: `${h.body} (${l.addressLine1})` };
    seenText.add(`${disambiguated.title} ${disambiguated.body}`);
    return disambiguated;
  });
}

function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

export interface ListingsShowcaseDeps {
  loadListings?: (zip: string) => Promise<{ listings: Listing[]; city: string }>;
}

/** Live SteadyAPI /search, the one path that resolves a real listing-detail URL
 *  (canonicalRealtorUrl) alongside the photo. Already filters to photo-bearing
 *  rows; ranked best-first the same way every other builder ranks listings. */
async function loadFromVendor(zip: string): Promise<{ listings: Listing[]; city: string }> {
  const city = scopeCity({ kind: "zip", value: zip });
  const listings = await fetchPhotoListings({ city, state: "FL" });
  return { listings: rankListings(listings), city };
}

export async function buildListingsShowcase(
  ctx: RecipeBuildContext,
  deps: ListingsShowcaseDeps = {},
): Promise<EmailDoc | null> {
  const zip = ctx.zip?.trim();
  if (!zip) return null; // no area named -> fall through, never guess a city

  const loadListings = deps.loadListings ?? loadFromVendor;
  const { listings, city } = await loadListings(zip).catch(() => ({ listings: [], city: "" }));

  // Distinct addresses, a REAL photo AND a REAL listing link — a listing
  // missing either is skipped, never rendered as a dead card (RULE 0.7: never
  // an invented or link-less card).
  const seen = new Set<string>();
  const withLinks = listings.filter((l) => {
    if (!l.photoUrl || !l.listingUrl || seen.has(l.addressLine1)) return false;
    seen.add(l.addressLine1);
    return true;
  });
  if (withLinks.length === 0) return null;

  const picks = withLinks.slice(0, MAX_HOMES);
  const highlights = assignHighlights(picks);

  const entries: PlanEntry[] = [];
  const push = (block: Omit<EmailBlock, "layout">, h: number, isStatic?: true) => {
    entries.push({
      id: block.id,
      type: block.type,
      props: block.props as Record<string, unknown>,
      span: GRID_COLS,
      newRow: true,
      height: h,
      ...(isStatic ? { isStatic: true } : {}),
    });
  };

  // Header — the agent's own, sticky.
  push(keepOrDefault(ctx.currentDoc, "header"), 2);

  // Hero — the theme, never a fabricated event/contest hook (structure only).
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        kicker: "Listings Showcase",
        // Words headline, not a stat — HeroProps.value's 40-char word cap
        // (schema.ts heroValue(), split from the numeric cap 08/03/2026) covers
        // this; a numeric hero value still holds to 24.
        value: "Homes Worth a Second Look",
        label: city ? `${city}, FL — for sale right now` : "For sale right now",
      },
    },
    4,
  );

  push(
    {
      id: createBlock("text").id,
      type: "text",
      props: {
        body:
          "A few real homes on the market right now — no price tags, no spec sheet, " +
          "just what makes each one worth a second look.",
        align: "left",
      },
    },
    2,
  );

  // ── ONE card per home: photo -> one real reason -> one CTA, every link real ─
  picks.forEach((l, i) => {
    const where = [l.addressLine1, l.city].filter(Boolean).join(", ") || "this home";
    push(
      {
        id: createBlock("image").id,
        type: "image",
        props: {
          url: l.photoUrl!,
          alt: `Photo of a home for sale — ${where}`,
          caption: where,
          kind: "photo",
          linkUrl: l.listingUrl!,
        },
      },
      6,
    );
    push(
      {
        id: createBlock("signal").id,
        type: "signal",
        props: {
          kicker: "What we love",
          title: highlights[i]!.title,
          body: highlights[i]!.body,
        },
      },
      3,
    );
    push(
      {
        id: createBlock("button").id,
        type: "button",
        props: {
          label: "Take a look",
          url: l.listingUrl!,
        },
      },
      2,
    );
  });

  // Closing CTA — every email ends with an ask, not just each card (operator
  // decree 08/03/2026). The agent's own site when known; the button still
  // renders (just not clickable) when it isn't, same convention as
  // community-info's closing button.
  const site = brandWebsiteUrl(ctx.currentDoc);
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: {
        label: "See more listings like these",
        ...(site ? { url: site } : {}),
      },
    },
    2,
  );

  push(keepOrDefault(ctx.currentDoc, "footer"), 3, true);

  const doc = finalizeDoc({ globalStyle: { ...ctx.currentDoc.globalStyle }, entries });
  return {
    ...doc,
    // A real, varying subject (home count + area) so this recipe never ships
    // the exact same subject line build after build — a repeat subject is
    // what invites a client to thread/collapse the message (caught live
    // 08/03/2026 sending two proof builds back to back with one hardcoded
    // subject). deriveEmailDocSubject() prefers this over any block-derived
    // fallback.
    subjectVariants: [
      city
        ? `${picks.length} ${picks.length === 1 ? "home" : "homes"} worth a second look in ${city}`
        : `${picks.length} ${picks.length === 1 ? "home" : "homes"} worth a second look`,
    ],
  };
}
