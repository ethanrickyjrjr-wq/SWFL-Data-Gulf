// lib/deliverable/recipes/listings-digest.ts
//
// The realtor.com-style multi-category digest: several category sections, each ONE
// `listing-grid` block holding 4 or 6 real homes, and NO home repeated across
// categories. Design: docs/superpowers/specs/2026-08-03-listings-digest-grid-design.md
//
// ── WHY ONE BLOCK PER CATEGORY ───────────────────────────────────────────────
// EmailDoc caps at 20 blocks. A `listing` block per home costs 6 blocks per
// category and tops the email out at 3 categories with no hero and no CTA. One
// grid per category makes a 5-category digest ~9 blocks.
//
// ── NO LLM CALL ANYWHERE IN THIS FILE ────────────────────────────────────────
// Category titles are fixed, every price/spec/address is restated verbatim from a
// held vendor field, and the subject is composed in code. Same doctrine as
// listings-showcase's assignHighlights. Nothing to add to repo-inventory-audit's
// #llm-call-sites-email.
//
// ── ONE CTA ──────────────────────────────────────────────────────────────────
// `docs/standards/emails.md` §0.1: "ONE CTA per email. Never three." The reference
// realtor.com digest puts a CTA under every category; five categories would ship
// six CTAs. Operator decision 08/03/2026: ONE closing button. The grid block still
// SUPPORTS ctaLabel/ctaUrl for a hand-built palette grid — this recipe never sets
// them. Every card still links to its own listing, so nothing is unreachable.
//
// ── SCOPE ────────────────────────────────────────────────────────────────────
// ZIP-first. cityForZipSourced(), NEVER scopeCity() — scopeCity maps
// ZIP -> county -> the county's ANCHOR city, so 33919 (Fort Myers) resolves to
// "Cape Coral" (open check zip_scope_resolves_to_county_anchor_city).
import { createBlock } from "@/lib/email/doc/default-docs";
import { finalizeDoc, type PlanEntry } from "@/lib/email/doc/finalize-doc";
import { GRID_COLS } from "@/lib/email/grid-schema";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
import { rankListings, fetchLakeBathsByPropertyId } from "@/lib/listings/select";
import { fetchPhotoListings } from "@/lib/listings/steadyapi";
import { cityForZipSourced, zipForPoint } from "@/lib/geo/point-in-zip";
import { fetchApifyBathsForHomes, listingAddressKey } from "@/lib/listings/apify-baths";
import type { Listing } from "@/lib/listings/rentcast";
import type { EmailBlock, EmailDoc, ListingGridCard } from "@/lib/email/doc/types";
import type { RecipeBuildContext } from "./index";

const MAX_CARDS = 6;
const MIN_CARDS = 4;

/** Living-area floor for the "Room to spread out" section, in square feet.
 *  Operator-set 08/04/2026 — see the `big-lot` category note for why a lot-size
 *  test alone put a 752 sqft apartment in a section about having space. */
const BIG_LOT_MIN_SQFT = 3000;

/** F1 — a map tile is not a home photo. Top of the scratchpad 08/03/2026:
 *  "WE CAN'T HAVE FUCKING ARIEL VIEWS....AGAIN!!!! PHOTOS OF THE FUCKING LIS…".
 *  The builder passes photoUrl through VERBATIM and never constructs a URL; this
 *  drops anything whose host is a map renderer before it can become a card. */
const BANNED_PHOTO_HOSTS = ["api.mapbox.com"];

export interface CategorySection {
  category: string;
  title: string;
  listings: Listing[];
}

/** Scarcest FIRST — load-bearing, not cosmetic. A broad category assigned first
 *  eats the inventory and every narrow category below it renders empty (F3).
 *  Every predicate reads a REAL vendor field verified present in normalizeResult. */
const CATEGORIES: ReadonlyArray<{
  category: string;
  title: (city: string) => string;
  eligible: (l: Listing) => boolean;
}> = [
  {
    category: "big-lot",
    // FIRST because it is now the SCARCEST — that ordering is the whole no-empty-
    // section guarantee, not a cosmetic choice. Under the 3,000 sqft floor this
    // category has ~4 eligible homes where the others have 6+, and it sat 4th.
    // Caught live 08/04/2026: filling bath counts made one estate full-spec, an
    // earlier category ranked it up and took it, big-lot fell under MIN_CARDS and the
    // section VANISHED. Enriching data changed selection — the second-order effect,
    // not the enrichment, is what broke it.
    //
    // TWO dimensions, not one — the lot AND the house (F14). A lot-only predicate
    // shipped `3704 Broadway Apt 100` here: verbatim vendor row
    // {"beds":1,"sqft":752,"lot_sqft":25857}, a 752 sqft apartment on its BUILDING's
    // 0.59-acre parcel. On any condo row `lot_sqft` is the whole complex, so every
    // unit in it read as "room to spread out."
    //
    // We cannot exclude condos by TYPE: the vendor's /search `description` carries
    // exactly six keys — beds, sqft, lot_sqft and their _display twins — and no type
    // (probed live 08/04/2026, matching steadyapi.ts's 07/07/2026 finding that
    // property_type is request-side only). A living-area floor is the only lever, and
    // it is the one the operator named: "make sure these are over 3k sq ft."
    title: () => "Room to spread out",
    eligible: (l) =>
      l.lotSize != null &&
      l.lotSize >= 0.5 &&
      l.squareFootage != null &&
      l.squareFootage >= BIG_LOT_MIN_SQFT,
  },
  {
    category: "new-construction",
    title: () => "New construction homes",
    eligible: (l) => l.isNewConstruction === true,
  },
  {
    category: "price-drops",
    title: () => "Price drops",
    eligible: (l) => l.isPriceReduced === true && (l.priceReduction ?? 0) > 0,
  },
  { category: "just-listed", title: () => "Just listed", eligible: (l) => l.isNewListing === true },
  { category: "more-homes", title: (city) => `More homes in ${city}`, eligible: () => true },
];

const usd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

/** A listing that can become a real card: a real photo from a real photo host, and
 *  a real listing link. Missing either → dropped, never rendered dead (F1, F7). */
function isRenderable(l: Listing): boolean {
  if (!l.photoUrl || !l.listingUrl) return false;
  const host = hostOf(l.photoUrl);
  return !BANNED_PHOTO_HOSTS.some((banned) => host === banned || host.endsWith(`.${banned}`));
}

/** Dedupe key. Falls back to the listing's own id because a new-construction spec
 *  home can carry NO confirmed street address (its permalink names a model, not an
 *  address — steadyapi.ts), so keying on address alone collapses distinct real
 *  homes into one. */
const dedupeKey = (l: Listing): string => l.addressLine1 || l.id;

/** All three specs present? The card's spec line is all-three-or-omitted (F8). */
const hasFullSpecs = (l: Listing): boolean =>
  l.bedrooms != null && l.bathrooms != null && l.squareFootage != null;

/**
 * Assign listings to categories, scarcest first, removing each category's picks
 * from the shared pool before the next category runs. That single removal step IS
 * the whole no-duplicate-home guarantee (F2) — and because the ZIP pool and the
 * city-backfill pool are ONE concatenated pool, it holds across that boundary too.
 *
 * Single-pass greedy, not an optimizer — deliberate (RULE 11: our volume does not
 * justify a matching algorithm here).
 *
 * Within a category, listings that carry a FULL spec line are preferred over ones
 * that do not, rank order preserved inside each group. Same doctrine as
 * selectPhotographedComps: coverage gates SELECTION, not rendering — four cards
 * that all show "3 bed · 2 bath · 1,295 sqft" beat four where two are blank (F13).
 */
export function assignCategories(listings: readonly Listing[], city: string): CategorySection[] {
  const seen = new Set<string>();
  let pool: Listing[] = [];
  for (const l of listings) {
    if (!isRenderable(l)) continue;
    const key = dedupeKey(l);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(l);
  }

  const out: CategorySection[] = [];
  for (const cat of CATEGORIES) {
    const eligible = pool.filter(cat.eligible);
    // Stable partition: full-spec homes first, each group still in rank order.
    const ordered = [...eligible.filter(hasFullSpecs), ...eligible.filter((l) => !hasFullSpecs(l))];
    const take = ordered.slice(0, MAX_CARDS);
    if (take.length < MIN_CARDS) continue; // never a padded or thin section (F2b)
    // 4 or 6, never 5 — an odd count orphans a half-width card in a 2-across grid.
    const even = take.length - (take.length % 2);
    const picked = take.slice(0, even);
    const pickedKeys = new Set(picked.map(dedupeKey));
    pool = pool.filter((l) => !pickedKeys.has(dedupeKey(l))); // <- the F2 guarantee
    out.push({ category: cat.category, title: cat.title(city), listings: picked });
  }
  return out;
}

/** Extract the SteadyAPI property_id embedded in `sa_<id>` (steadyapi.ts). */
function steadyPropertyId(l: Listing): string | null {
  const m = /^sa_(.+)$/.exec(l.id);
  return m ? m[1]! : null;
}

export interface ListingsDigestDeps {
  loadListings?: (zip: string) => Promise<{ listings: Listing[]; city: string }>;
  /** FREE lane: data_lake.listing_state.baths by property_id, already paid for by
   *  the nightly ingest. Address-independent, so it reaches streetless
   *  new-construction rows. Measured fill rate 08/03/2026: ~20%. */
  fetchBaths?: (propertyIds: readonly string[]) => Promise<Map<string, number>>;
  /** PAID fallback, consulted ONLY for the homes the free lane missed. */
  fetchApifyBaths?: (zip: string) => Promise<Map<string, number>>;
}

/** Live SteadyAPI /search for the ZIP's REAL city (never the county anchor). */
async function loadFromVendor(zip: string): Promise<{ listings: Listing[]; city: string }> {
  const city = cityForZipSourced(zip);
  if (!city) return { listings: [], city: "" };
  const listings = await fetchPhotoListings({ city, state: "FL" });
  return { listings: rankListings(listings), city };
}

export async function buildListingsDigest(
  ctx: RecipeBuildContext,
  deps: ListingsDigestDeps = {},
): Promise<EmailDoc | null> {
  const zip = ctx.zip?.trim();
  if (!zip) return null; // no area named -> fall through, never guess a city

  const loadListings = deps.loadListings ?? loadFromVendor;
  const { listings, city } = await loadListings(zip).catch(() => ({ listings: [], city: "" }));

  // ZIP-local first, city remainder second — ONE shared pool, ZIP-preferred. A
  // listing whose permalink carried no parseable ZIP gets one from its lat/lon via
  // the tracked ZCTA polygons, which matters most for exactly the address-less
  // new-construction rows a ZIP-string filter drops.
  const isLocal = (l: Listing): boolean =>
    l.zipCode === zip ||
    (!l.zipCode && l.latitude != null && l.longitude != null
      ? zipForPoint(l.latitude, l.longitude) === zip
      : false);
  const pool = [...listings.filter(isLocal), ...listings.filter((l) => !isLocal(l))];
  if (pool.length === 0) return null; // F12 — never an empty digest

  const enriched = await withBaths(pool, zip, deps);
  const sections = assignCategories(enriched, city || "the area");
  if (sections.length === 0) return null;

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

  push(keepOrDefault(ctx.currentDoc, "header"), 2);

  const homeCount = sections.reduce((n, s) => n + s.listings.length, 0);
  push(
    {
      id: createBlock("hero").id,
      type: "hero",
      props: {
        kicker: "Listings Digest",
        value: "What's On The Market",
        label: city ? `${city}, FL — ${homeCount} homes for sale right now` : "For sale right now",
      },
    },
    4,
  );

  for (const s of sections) {
    push(
      {
        id: createBlock("listing-grid").id,
        type: "listing-grid",
        props: {
          title: s.title,
          ...(city ? { subtitle: city } : {}),
          cards: s.listings.map((l) => toCard(l, s.listings)),
          // A light card behind every section, the SAME colour on each — operator,
          // 08/04/2026: "put a nice light color card behind each section. same color
          // for each, but just to seperate the sections." No surfaceBg here on
          // purpose: one colour for the whole digest means one place it is decided
          // (SECTION_SURFACE_BG), not five props that can drift apart.
          surface: "card" as const,
          // NO ctaLabel/ctaUrl — ONE CTA per email (emails.md §0.1). See header.
        },
      },
      s.listings.length > 4 ? 18 : 13,
    );
  }

  // The ONE CTA. The agent's own site when known; the button still renders (just
  // not clickable) when it isn't — community-info's convention.
  const site = brandWebsiteUrl(ctx.currentDoc);
  push(
    {
      id: createBlock("button").id,
      type: "button",
      props: {
        role: "primary-cta",
        label: city ? `See every home in ${city}` : "See every home for sale",
        ...(site ? { url: site } : {}),
      },
    },
    2,
  );

  push(keepOrDefault(ctx.currentDoc, "footer"), 3, true);

  const doc = finalizeDoc({ globalStyle: { ...ctx.currentDoc.globalStyle }, entries });
  return {
    ...doc,
    // Composed from the REAL counts so two builds never ship an identical subject —
    // a repeat subject is what invites a client to thread/collapse the message
    // (caught live 08/03/2026). Broadcast digest → optimise for the OPEN, so this
    // stays in the short, clarity-over-cleverness band (emails.md §0.1).
    subjectVariants: [city ? `${homeCount} homes in ${city}` : `${homeCount} homes for sale`],
  };
}

/**
 * Fill `bathrooms` in provenance order: FREE lake lane first, PAID Apify fallback
 * only for what it missed. The Apify call is skipped entirely when the free lane
 * already covered everything — a build that needs nothing spends nothing.
 *
 * Never in a scheduled/cron path (memory: no-paid-search-in-scheduled-ingest);
 * this runs at build time only. Both lanes are empty-tolerant — any failure leaves
 * bathrooms null, and the card then honestly omits its spec line (F8).
 */
async function withBaths(
  pool: Listing[],
  zip: string,
  deps: ListingsDigestDeps,
): Promise<Listing[]> {
  const fetchBaths = deps.fetchBaths ?? fetchLakeBathsByPropertyId;
  const ids = pool.map(steadyPropertyId).filter((id): id is string => id != null);
  const lake = ids.length
    ? await fetchBaths(ids).catch(() => new Map<string, number>())
    : new Map<string, number>();

  let out = pool.map((l) => {
    if (l.bathrooms != null) return l;
    const pid = steadyPropertyId(l);
    const found = pid ? lake.get(pid) : undefined;
    return found != null ? { ...l, bathrooms: found } : l;
  });

  // Only the homes that could still BECOME a full spec line are worth paying for:
  // a row with no beds or no sqft stays spec-less regardless of its bath count.
  // PAY FOR THE HOMES THAT WILL BECOME CARDS, NOT THE FIRST 30 IN THE POOL. A
  // provisional pass tells us which ~28 homes the email would actually show; the
  // pool behind them is ~200, so a cap applied to the pool spends the whole budget
  // on homes that never render. Measured live 08/04/2026: the four "Room to spread
  // out" estates rank far down the pool and fell outside a pool-order cap entirely,
  // so the section stayed spec-less even after the lookup was made exact.
  //
  // Cheap: assignCategories is pure single-pass greedy over an in-memory array (no
  // I/O), and the real pass below re-runs it on the enriched pool.
  const provisional = assignCategories(out, "").flatMap((s) => s.listings);
  const stillMissing = provisional.filter(
    (l) => l.bathrooms == null && l.bedrooms != null && l.squareFootage != null,
  );
  if (stillMissing.length === 0) return out;

  // ── ASK FOR THE HOMES WE HOLD, DON'T FISH IN A ZIP (F17) ──────────────────
  // This used to sweep the REQUESTED zip and hope the homes it needed were among the
  // 60 rows that came back. The pool is deliberately WIDER than that zip — zip-local
  // homes first, then a city-wide backfill — so every backfilled home was
  // structurally unreachable. Caught live 08/04/2026 on a 33919 digest: the four
  // "Room to spread out" estates sit in 33905/33901/33908/33912, the sweep searched
  // 33919, returned 57 addresses and matched ZERO of the four. A CITY-wide sweep is
  // no fix — it also returns one 60-row page (10 zips, live-verified) and those same
  // four were still absent. It samples; it does not look up.
  //
  // The class, worth naming: WIDEN A POOL AND EVERY ENRICHMENT KEYED TO THE OLD
  // SCOPE SILENTLY MISSES THE NEW ROWS. Nothing errors; the column is just null. It
  // bit this category hardest because big-lot estates cluster OUTSIDE the dense inner
  // zip by definition — the failure was correlated with the section, not random.
  //
  // Now each home is looked up by its OWN address, which is exact and CHEAPER than
  // the sweep it replaces: 1 result per call, capped, instead of 60 strangers.
  const apify = deps.fetchApifyBaths
    ? await deps.fetchApifyBaths(zip).catch(() => new Map<string, number>())
    : await fetchApifyBathsForHomes(
        stillMissing.map((l) => ({ street: l.addressLine1 ?? "", city: l.city ?? "" })),
      ).catch(() => new Map<string, number>());
  if (apify.size === 0) return out;

  out = out.map((l) => {
    if (l.bathrooms != null || !l.addressLine1) return l;
    const found = apify.get(listingAddressKey(l.addressLine1, l.city ?? ""));
    return found != null ? { ...l, bathrooms: found } : l;
  });
  return out;
}

/**
 * One listing → one card. Every field restated from a held vendor value; nothing
 * derived, nothing inferred, no URL ever constructed.
 *
 * The spec line is emitted only when EVERY card in this grid can carry one (F13) —
 * a section where two cards read "3 bed · 2 bath · 1,295 sqft" and two are blank
 * looks broken, which is the same complaint pattern as a thin section.
 */
function toCard(l: Listing, section: readonly Listing[]): ListingGridCard {
  const sectionHasSpecs = section.every(hasFullSpecs);
  const specs =
    sectionHasSpecs && hasFullSpecs(l)
      ? `${l.bedrooms} bed · ${l.bathrooms} bath · ${l.squareFootage!.toLocaleString("en-US")} sqft`
      : undefined;
  // The listing's OWN city/state/ZIP (F6) — a city-backfilled home must never read
  // as if it sits in the ZIP the reader asked about.
  const line2 = [l.city, [l.state, l.zipCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    photoUrl: l.photoUrl!,
    linkUrl: l.listingUrl!,
    statusLabel: "For sale",
    statusTone: "active",
    ...(l.price != null ? { price: usd(l.price) } : {}),
    ...(l.isPriceReduced && (l.priceReduction ?? 0) > 0
      ? { priceCut: usd(l.priceReduction!) }
      : {}),
    ...(specs ? { specs } : {}),
    ...(l.addressLine1 ? { addressLine1: l.addressLine1 } : {}),
    ...(line2 ? { addressLine2: line2 } : {}),
  };
}

function keepOrDefault(current: EmailDoc, type: EmailBlock["type"]): EmailBlock {
  return current.blocks.find((b) => b.type === type) ?? createBlock(type);
}
