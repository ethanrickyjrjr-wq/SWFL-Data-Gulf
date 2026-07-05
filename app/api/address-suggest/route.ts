import { NextRequest, NextResponse } from "next/server";
import { buildSuggestUrl, parseSuggestions } from "@/lib/geo/search-box";

export const runtime = "nodejs";

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** MAPBOX_TOKEN is URL-restricted — every Mapbox call must send this exact
 *  Referer or Mapbox 403s (same constant as refinery/lib/geocode.mts:32-33). */
const MAPBOX_REFERER = "https://www.swfldatagulf.com/";

// Server proxy for the homepage hero autocomplete (spec:
// 2026-07-05-agent-first-homepage-design.md) — the URL-restricted MAPBOX_TOKEN
// never ships to the browser. Empty-tolerant: any upstream failure returns
// { suggestions: [] } so the hero degrades to free-typed submit (spec: no
// error states). The session param is the Search Box session_token — the hero
// mints one UUIDv4 per typing session so suggest+retrieve bill as ONE session.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const session = req.nextUrl.searchParams.get("session") ?? "";
  const token = process.env.MAPBOX_TOKEN;
  if (q.length < 3 || !SESSION_RE.test(session) || !token) {
    return NextResponse.json({ suggestions: [] });
  }
  try {
    const res = await fetch(buildSuggestUrl(q, session, token), {
      headers: { Referer: MAPBOX_REFERER },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ suggestions: [] });
    return NextResponse.json({ suggestions: parseSuggestions(await res.json()) });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
