// lib/email/listing-scrape.ts
//
// Read a pasted real-estate listing page for its REAL facts — the data the old
// Email Lab threw away (it grabbed only the og:image thumbnail). Deterministic
// core: numbers come from code, never an LLM, never invented (Brain Factory
// rule 2 + the no-invention moat). `parseListingFacts` is PURE over HTML so it
// is unit-tested against a saved fixture of a real page; `fetchListingFacts` is
// the thin, best-effort network wrapper (reuses og-image.ts's guards).
//
// Two extraction strategies, most-structured first:
//   1. The embedded `{"id":"…","label":"…","value":…}` spec island that IDX
//      sites hydrate from — stable machine ids (price/bedrooms/totalBaths/sqft/
//      acreage/year_built/category). This is the reliable path.
//   2. Visible text fallback for fields the island leaves null (street/zip).
// A field that appears nowhere is left undefined — we never guess a number.

import { fetchOgImage } from "./og-image";

export interface ListingFacts {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: string; // verbatim, e.g. "$20,895,000"
  beds?: string;
  baths?: string;
  sqft?: string;
  lotSize?: string;
  yearBuilt?: string;
  propertyType?: string;
  remarks?: string; // the marketing description, verbatim
  photos: string[]; // absolute listing photo URLs
  sourceUrl: string; // the citation
}

/** Pull one scalar value from the spec island by its machine id. Returns the
 *  string/number value as a string, or undefined when absent or null. */
function pickById(html: string, id: string): string | undefined {
  const re = new RegExp(`"id":"${id}","label":"[^"]*","value":("[^"]*"|-?[\\d.]+|null)`);
  const m = html.match(re);
  if (!m) return undefined;
  const raw = m[1];
  if (raw === "null") return undefined;
  if (raw.startsWith('"')) {
    const inner = raw.slice(1, -1).trim();
    return inner || undefined;
  }
  return raw; // numeric string (e.g. "5", "0.692", "2021")
}

/** First capture of a JSON string field anywhere in the HTML, unescaped. */
function pickJsonString(html: string, key: string): string | undefined {
  const m = html.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`));
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** PURE: extract real listing facts from page HTML. Never throws, never invents —
 *  a missing field is undefined. `url` is echoed back as the citation. */
export function parseListingFacts(html: string, url: string): ListingFacts {
  const price = pickById(html, "price");
  const beds = pickById(html, "bedrooms");
  const baths = pickById(html, "totalBaths") ?? pickById(html, "fullBaths");
  const sqft = pickById(html, "sqft");
  const lotSize = pickById(html, "acreage");
  const yearBuilt = pickById(html, "year_built");
  const propertyType = pickById(html, "category") ?? pickById(html, "style");

  const city = pickJsonString(html, "city");
  const stateMatch = html.match(/"state":"([A-Za-z]{2})"/);
  const state = stateMatch ? stateMatch[1].toUpperCase() : undefined;

  // street/zip are often null in the island → recover from the visible address line.
  let zip: string | undefined;
  let address: string | undefined;
  if (city) {
    const cityEsc = escapeRe(city);
    const zipM = html.match(new RegExp(`${cityEsc}[,\\s]+(?:[A-Z]{2})\\s*(\\d{5})`, "i"));
    if (zipM) zip = zipM[1];
    const addrM = html.match(
      new RegExp(`(\\d{1,6}[^,<>"]{2,50},\\s*${cityEsc}[^\\d]{0,8}[A-Z]{2}\\s*\\d{5})`, "i"),
    );
    if (addrM) address = addrM[1].replace(/\s+/g, " ").trim();
  }

  const remarks = pickJsonString(html, "description");

  // Photos: real listing images only. `/listings/` excludes the brokerage logo
  // (which lives under /images/<id>/…/logo.webp). Normalize escaped slashes first.
  const norm = html.replace(/\\\//g, "/");
  const photos = [
    ...new Set(
      (norm.match(/https?:\/\/[^\s"'<>)]+?\.(?:jpe?g|png|webp)/gi) ?? [])
        .filter((u) => /\/listings\//i.test(u))
        .map((u) => u.replace(/&amp;/g, "&")),
    ),
  ].slice(0, 12);

  return {
    address,
    city,
    state,
    zip,
    price,
    beds,
    baths,
    sqft,
    lotSize,
    yearBuilt,
    propertyType,
    remarks: remarks && remarks.trim() ? remarks.trim() : undefined,
    photos,
    sourceUrl: url,
  };
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 2_000_000;

/** Best-effort: fetch a listing URL and parse its facts. Falls back to the
 *  og:image hero when the page has no inline photos. NEVER throws — returns null
 *  on any block/failure so the build degrades, never crashes. */
export async function fetchListingFacts(url: string): Promise<ListingFacts | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": BROWSER_UA, accept: "text/html,*/*" },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const facts = parseListingFacts(html, url);
    if (facts.photos.length === 0) {
      const og = await fetchOgImage(url).catch(() => null);
      if (og?.image) facts.photos.push(og.image);
    }
    // Usable only if we got at least one real fact — else the caller keeps the
    // newsletter path rather than building a flyer from nothing.
    const hasFact = Boolean(facts.price || facts.beds || facts.sqft || facts.remarks);
    return hasFact ? facts : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
