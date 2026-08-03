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
// stacked three times, with NO price/beds/baths/sqft spec sheet anywhere. The
// photo and the honest reason ARE the pitch; the source never shows a number.
// This is genuinely different from every other recipe in this file: all seven
// lifecycle recipes and market-comps/price-reduced lead with a spec strip or a
// chart. This one is the only recipe that shows MULTIPLE real homes and leads
// with a photo + a feature, never a figure.
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
// ── REAL LISTINGS, NOT ONE ADDRESS ───────────────────────────────────────────
// Reuses loadListingContext (lib/listings/select.ts) — the SAME lake-first
// active-listing feed agent-brand-intro's chart and coming-soon's scarcity
// count already trust (data-roots.md: listing_state -> listing_active_homes).
// Requires ctx.zip (back-on-market's AREA-mode precedent: no ZIP -> null, fall
// through to the generic author — never guess a city the user didn't name).
// Fewer than one listing with a real photo -> null too (RULE 0.7: never an
// invented or photo-less card; the default grid is still a real email).

import { createBlock } from "@/lib/email/doc/default-docs";
import { finalizeDoc, type PlanEntry } from "@/lib/email/doc/finalize-doc";
import { GRID_COLS } from "@/lib/email/grid-schema";
import { loadListingContext } from "@/lib/listings/select";
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
 * One highlight per listing, IN ORDER, preferring a category no earlier listing
 * already used (so three homes don't all say "Priced to move"). Pure and
 * exported for the test. Never invents: every branch reads a real field or
 * falls to the universal fallback.
 */
export function assignHighlights(listings: readonly Listing[]): Highlight[] {
  const used = new Set<string>();
  return listings.map((l) => {
    const eligible = CANDIDATES.filter((c) => c.eligible(l));
    const fresh = eligible.find((c) => !used.has(c.category));
    const pick = fresh ?? eligible[0] ?? null;
    const highlight = pick ? pick.build(l) : fallbackHighlight(l);
    used.add(highlight.category);
    return highlight;
  });
}

function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}

export interface ListingsShowcaseDeps {
  loadListings?: (zip: string) => Promise<{ listings: Listing[]; city: string }>;
}

async function loadFromLake(zip: string): Promise<{ listings: Listing[]; city: string }> {
  const { ranked, city } = await loadListingContext({ kind: "zip", value: zip }, new Date());
  return { listings: ranked, city };
}

export async function buildListingsShowcase(
  ctx: RecipeBuildContext,
  deps: ListingsShowcaseDeps = {},
): Promise<EmailDoc | null> {
  const zip = ctx.zip?.trim();
  if (!zip) return null; // no area named -> fall through, never guess a city

  const loadListings = deps.loadListings ?? loadFromLake;
  const { listings, city } = await loadListings(zip).catch(() => ({ listings: [], city: "" }));

  // Distinct addresses, real photo, best-ranked first (loadListingContext already
  // sorts by coordinates/residential-type/recency). Fewer than one real photo ->
  // null (RULE 0.7: never an invented or photo-less card).
  const seen = new Set<string>();
  const withPhotos = listings.filter((l) => {
    if (!l.photoUrl || seen.has(l.addressLine1)) return false;
    seen.add(l.addressLine1);
    return true;
  });
  if (withPhotos.length === 0) return null;

  const picks = withPhotos.slice(0, MAX_HOMES);
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

  // ── ONE card per home: photo -> one real reason -> one CTA ────────────────
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
          ...(l.listingUrl ? { linkUrl: l.listingUrl } : {}),
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
          ...(l.listingUrl ? { url: l.listingUrl } : {}),
        },
      },
      2,
    );
  });

  push(keepOrDefault(ctx.currentDoc, "footer"), 3, true);

  return finalizeDoc({ globalStyle: { ...ctx.currentDoc.globalStyle }, entries });
}
