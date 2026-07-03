// lib/email/pexels.ts — Pexels photo search for the Email Lab media library.
//
// Mirrors lib/listings/steadyapi.ts: the key is read at CALL time (never module
// load), and every failure lane — no key, non-200, malformed body, network —
// returns [] so the picker degrades to "no results" and nothing ever blocks a
// build. Pexels auth header is the bare key (no "Bearer") per the live API docs
// (pexels.com/api, fetched via crawl4ai 07/02/2026 in the spec's research pass).
// License: free for commercial use incl. newsletters; attribution ("Photo by X
// on Pexels") lifts the rate cap and matches citation culture — the media route
// stores it and rides it on the image caption. Free tier: 200 req/hr.
// SERVER-ONLY: the key must never reach the client — the lab talks to
// /api/email-lab/pexels, which proxies through here.

const PEXELS_SEARCH = "https://api.pexels.com/v1/search";

export interface PexelsPhoto {
  id: number;
  /** Render URL — large2x (2x retina) preferred, else large, else original. */
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  photographer: string;
  photographerUrl?: string;
  /** The photo's Pexels page (attribution link target). */
  pexelsUrl?: string;
}

/** Raw API body → normalized photos. Pure; garbage in → []. */
export function mapPexelsResponse(body: unknown): PexelsPhoto[] {
  const photos = (body as { photos?: unknown[] } | null)?.photos;
  if (!Array.isArray(photos)) return [];
  const out: PexelsPhoto[] = [];
  for (const raw of photos) {
    const p = raw as {
      id?: number;
      width?: number;
      height?: number;
      url?: string;
      photographer?: string;
      photographer_url?: string;
      alt?: string;
      src?: { original?: string; large2x?: string; large?: string };
    };
    const url = p.src?.large2x ?? p.src?.large ?? p.src?.original;
    if (!url || typeof p.photographer !== "string" || !p.photographer) continue;
    out.push({
      id: p.id ?? 0,
      url,
      width: p.width,
      height: p.height,
      alt: p.alt || undefined,
      photographer: p.photographer,
      photographerUrl: p.photographer_url,
      pexelsUrl: p.url,
    });
  }
  return out;
}

/** Search Pexels. Empty-tolerant: no key / blank query / any failure → [].
 *  Each failure lane logs a one-line warn so runtime logs name the cause —
 *  the picker's "No results" is deliberately indistinguishable to the USER,
 *  never to the operator. */
export async function searchPexels(query: string, perPage = 24): Promise<PexelsPhoto[]> {
  const key = process.env.PEXELS_API_KEY;
  const q = query.trim();
  if (!q) return [];
  if (!key) {
    console.warn("[pexels] PEXELS_API_KEY not set in this runtime — returning []");
    return [];
  }
  try {
    const res = await fetch(
      `${PEXELS_SEARCH}?query=${encodeURIComponent(q)}&per_page=${Math.min(Math.max(perPage, 1), 80)}`,
      { headers: { Authorization: key } },
    );
    if (!res.ok) {
      console.warn(`[pexels] upstream ${res.status} for query "${q}" — returning []`);
      return [];
    }
    const photos = mapPexelsResponse(await res.json());
    if (photos.length === 0) console.warn(`[pexels] upstream OK but zero photos for "${q}"`);
    return photos;
  } catch (e) {
    console.warn(`[pexels] fetch failed: ${(e as Error).message} — returning []`);
    return [];
  }
}
