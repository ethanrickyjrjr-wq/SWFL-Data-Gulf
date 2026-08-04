/**
 * lib/social/listing-carousel.ts
 *
 * Listing record → the model for a Bluesky photo carousel (cover + up to 3
 * interior slides). PURE: no network, no Apify client, no rendering. The caller
 * supplies the vendor record; this file decides what is TRUE about it.
 *
 * ── WHY PURE, AND WHY IT LIVES HERE ─────────────────────────────────────────
 * The Apify fetch itself belongs to `lib/listings/apify-comps.ts`, which a
 * PARALLEL session is mid-TDD on (08/03/2026). Two authors, one file, one
 * shared index is how a merge conflict lands on `main`, so this module takes
 * the record as INPUT and owns none of the fetch. `parsePhotoList` is a
 * deliberate small duplicate of that file's `parseAltPhotos` for the same
 * reason — a duplicated 8-line splitter is cheap; a contended file is not.
 *
 * ── THE VENDOR SHAPE, VERIFIED (run lxiDH7wcIbMRIGwWK, 08/03/2026) ──────────
 *  - `alt_photos` is a COMMA-SPACE-JOINED STRING, not an array — and it can
 *    repeat a url (the real 2601 SW 37th Ter record does).
 *  - `half_baths` is the literal string `"<NA>"` when absent, NOT null.
 *  - `full_baths` / `half_baths` are SEPARATE fields; baths is our arithmetic.
 *
 * ── THE MOAT ────────────────────────────────────────────────────────────────
 * A missing field OMITS its element. There is no "0", no "N/A", no placeholder
 * ever burned into a public image. Mirrors `hasStatValue` in
 * render-social-image.ts. Every number on a card traces verbatim to a field.
 */

/** The lexicon caps `app.bsky.embed.images` at 4 (docs.bsky.app, verified
 *  08/03/2026: "Each post contains up to four images"). Exceeding it is a hard
 *  error from `postToBluesky` — we cap here so the adapter never sees it. */
export const MAX_CAROUSEL_PHOTOS = 4;

/** `text.maxGraphemes` in app.bsky.feed.post — the same cap the post-now lane
 *  enforces as `MAX_CAPTION_GRAPHEMES`. Named locally so the caption builder
 *  reads as a budget rather than as a validator import. */
export const CAPTION_GRAPHEME_CAP = 300;

/** Vendor sentinel for "no value". Arrives as a literal string, not null. */
const NA = "<NA>";

/** A realtor.com property record as the bulk actor returns it. Every field is
 *  optional and loosely typed ON PURPOSE — this is a scraped third-party shape,
 *  and 2 of 5 store actors tested returned junk. */
export interface ListingRecord {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  status?: string | null;
  list_price?: number | string | null;
  beds?: number | string | null;
  full_baths?: number | string | null;
  half_baths?: number | string | null;
  sqft?: number | string | null;
  year_built?: number | string | null;
  price_per_sqft?: number | string | null;
  property_url?: string | null;
  primary_photo?: string | null;
  alt_photos?: string | string[] | null;
}

export interface CarouselCard {
  /** Source photo url — the caller fetches + composites it. */
  photoUrl: string;
  /** `cover` gets the price and the full spec strip; `interior` gets a slim footer. */
  role: "cover" | "interior";
  /** Street line, e.g. "2601 SW 37th Ter". */
  address: string;
  /** "Cape Coral, FL 33914" — whatever of it actually exists. */
  locality: string;
  /** Formatted list price, e.g. "$385,000". ABSENT when the record has none. */
  price?: string;
  /** Spec chips, already formatted. Missing fields are absent, never zeroed. */
  specs: string[];
  /** Accessibility alt text for the Bluesky image embed. */
  alt: string;
  /** 1-based slide position, for a "1/4" indicator. */
  index: number;
  /** Total slides in this carousel. */
  total: number;
}

// ── field coercion ───────────────────────────────────────────────────────────

/** A vendor value → a real finite number, or null. `"<NA>"`, "", null, and NaN
 *  all collapse to null so a caller can only ever omit, never print junk. */
function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t === NA) return null;
    const n = Number(t.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A vendor value → a non-blank trimmed string, or null. */
function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return !t || t === NA ? null : t;
}

const GROUPED = new Intl.NumberFormat("en-US");

// ── photos ───────────────────────────────────────────────────────────────────

/**
 * Split the vendor gallery into real urls. `alt_photos` arrives as a
 * comma-space-joined STRING (an array is accepted too — shape drift is not a
 * crash). Anything that is not http(s) is DROPPED rather than handed to an
 * image fetch, and order is preserved.
 */
export function parsePhotoList(raw: unknown): string[] {
  const parts: string[] = Array.isArray(raw)
    ? raw.filter((p): p is string => typeof p === "string")
    : typeof raw === "string" && raw.trim() && raw.trim() !== NA
      ? raw.split(",")
      : [];
  return parts.map((p) => p.trim()).filter((p) => /^https?:\/\//i.test(p));
}

/**
 * Pick the carousel's photos: the primary photo leads (the handoff's "exterior
 * first"), then gallery order for variety, DEDUPED — the real vendor record
 * repeats a url, and a carousel showing the same room twice reads as broken.
 * Capped at the lexicon's 4.
 */
export function selectCarouselPhotos(
  record: ListingRecord,
  max: number = MAX_CAROUSEL_PHOTOS,
): string[] {
  const cap = Math.max(1, Math.min(max, MAX_CAROUSEL_PHOTOS));
  const primary = str(record.primary_photo);
  const ordered = [
    ...(primary && /^https?:\/\//i.test(primary) ? [primary] : []),
    ...parsePhotoList(record.alt_photos),
  ];
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const url of ordered) {
    if (seen.has(url)) continue;
    seen.add(url);
    picked.push(url);
    if (picked.length === cap) break;
  }
  return picked;
}

// ── specs — deterministic math, omission over placeholders ───────────────────

/**
 * Compose the bath count from the two SEPARATE vendor fields. A half bath is
 * 0.5; `"<NA>"` contributes nothing. Returns null when there is no bath data at
 * all — the caller then omits the chip rather than printing "0 ba".
 */
export function formatBaths(full: unknown, half: unknown): string | null {
  const f = num(full);
  const h = num(half);
  if (f == null && h == null) return null;
  const total = (f ?? 0) + (h ?? 0) * 0.5;
  if (total <= 0) return null;
  // A trailing ".0" never ships — 2 baths is "2 ba", 2.5 is "2.5 ba".
  return `${Number.isInteger(total) ? total : total.toFixed(1)} ba`;
}

/** The spec strip. Each chip appears only if its field is really present. */
export function formatSpecs(record: ListingRecord): string[] {
  const chips: string[] = [];
  const beds = num(record.beds);
  if (beds != null && beds > 0) chips.push(`${beds} bd`);
  const baths = formatBaths(record.full_baths, record.half_baths);
  if (baths) chips.push(baths);
  const sqft = num(record.sqft);
  if (sqft != null && sqft > 0) chips.push(`${GROUPED.format(sqft)} sqft`);
  const year = num(record.year_built);
  if (year != null && year > 0) chips.push(`Built ${year}`);
  return chips;
}

/** "Cape Coral, FL 33914" from whatever of those three fields exists. */
function localityOf(record: ListingRecord): string {
  const city = str(record.city);
  const tail = [str(record.state), str(record.zip_code)].filter(Boolean).join(" ");
  return [city, tail].filter(Boolean).join(", ");
}

function priceOf(record: ListingRecord): string | undefined {
  const p = num(record.list_price);
  return p != null && p > 0 ? `$${GROUPED.format(p)}` : undefined;
}

// ── cards ────────────────────────────────────────────────────────────────────

/**
 * Build the carousel's card models. Returns [] when the record has no usable
 * photo — the caller ABORTS the post rather than publishing a card with a
 * missing image (handoff §5, "Empty Apify run").
 */
export function buildCarouselCards(
  record: ListingRecord,
  max: number = MAX_CAROUSEL_PHOTOS,
): CarouselCard[] {
  const photos = selectCarouselPhotos(record, max);
  if (photos.length === 0) return [];

  const address = str(record.street) ?? "";
  const locality = localityOf(record);
  const price = priceOf(record);
  const specs = formatSpecs(record);
  const where = [address, locality].filter(Boolean).join(", ");

  return photos.map((photoUrl, i) => ({
    photoUrl,
    role: i === 0 ? ("cover" as const) : ("interior" as const),
    address,
    locality,
    ...(price ? { price } : {}),
    specs,
    alt:
      i === 0
        ? `Front exterior of ${where}${specs.length ? ` — ${specs.join(", ")}` : ""}.`
        : `Interior photo ${i + 1} of ${photos.length} at ${where}.`,
    index: i + 1,
    total: photos.length,
  }));
}

// ── caption ──────────────────────────────────────────────────────────────────

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

function graphemes(s: string): number {
  let n = 0;
  for (const _ of GRAPHEMES.segment(s)) n++;
  return n;
}

/** Status → the human lead-in. An unknown vendor status falls back to a neutral
 *  one so a raw enum ("PENDING_CONTINUE_SHOW") never prints to a public feed. */
function leadFor(status: string | null): string {
  switch ((status ?? "").toUpperCase()) {
    case "FOR_SALE":
      return "New on the market";
    case "PENDING":
      return "Now pending";
    case "SOLD":
      return "Just sold";
    default:
      return "On the market";
  }
}

/**
 * The post text. The realtor.com link rides HERE, as text — `detectLinkFacets`
 * turns it into a rich-text facet. It must NOT become an external embed: a
 * Bluesky post carries ONE embed, and ours is `app.bsky.embed.images` so that
 * tapping a photo opens the image viewer instead of leaving the app. That is
 * the operator's whole ask (handoff §2).
 *
 * Elements are DROPPED in priority order until the 300-grapheme budget is met.
 * The url is reserved first and never truncated — a half-cut url is a dead link.
 */
export function buildCarouselCaption(record: ListingRecord): string {
  const url = str(record.property_url);
  const suffix = url ? `\n\n${url}` : "";
  const budget = CAPTION_GRAPHEME_CAP - graphemes(suffix);

  const address = str(record.street) ?? "";
  const where = [address, str(record.city)].filter(Boolean).join(", ");
  const lead = leadFor(str(record.status));
  const price = priceOf(record);
  const specs = formatSpecs(record).join(" · ");

  // Most → least droppable. The address is the last thing to go.
  const candidates: Array<Array<string | undefined | false>> = [
    [`${lead} — ${where}.`, specs && ` ${specs}.`, price && ` ${price}.`],
    [`${lead} — ${where}.`, price && ` ${price}.`],
    [`${where}.`, price && ` ${price}.`],
    [`${where}.`],
    [address],
  ];

  for (const parts of candidates) {
    const body = parts.filter(Boolean).join("");
    if (graphemes(body) <= budget) return `${body}${suffix}`;
  }

  // Even the bare address overruns (a pathological street name). Cut it to fit
  // rather than returning something the adapter will reject.
  const hard = Array.from(GRAPHEMES.segment(address), (s) => s.segment)
    .slice(0, Math.max(0, budget))
    .join("");
  return `${hard}${suffix}`;
}
