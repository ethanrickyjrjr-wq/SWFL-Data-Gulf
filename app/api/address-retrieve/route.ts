import { NextRequest, NextResponse } from "next/server";
import { buildRetrieveUrl, parseRetrieve } from "@/lib/geo/search-box";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

export const runtime = "nodejs";

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** MAPBOX_TOKEN is URL-restricted — every Mapbox call must send this exact
 *  Referer or Mapbox 403s (same constant as refinery/lib/geocode.mts:32-33). */
const MAPBOX_REFERER = "https://www.swfldatagulf.com/";

// Second half of the hero autocomplete pair: called ONCE when the visitor picks
// a suggestion. Resolves the pick to { name, zip, inScope } — the ZIP is what
// the email lab's prebuild needs, and inScope rides the same zip-resolver the
// rest of the platform gates on (6-county footprint). Must reuse the SAME
// session_token as the preceding /suggest calls (session-based billing).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const session = req.nextUrl.searchParams.get("session") ?? "";
  const token = process.env.MAPBOX_TOKEN;
  if (!id || !SESSION_RE.test(session) || !token) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const res = await fetch(buildRetrieveUrl(id, session, token), {
      headers: { Referer: MAPBOX_REFERER },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });
    const parsed = parseRetrieve(await res.json());
    if (!parsed) return NextResponse.json({ error: "no feature" }, { status: 404 });
    const inScope = parsed.zip ? resolveZip(parsed.zip).in_scope : false;
    return NextResponse.json({ ...parsed, inScope });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
