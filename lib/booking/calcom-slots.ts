// lib/booking/calcom-slots.ts — real availability for a pasted cal.com link.
//
// GET https://api.cal.com/v2/slots is PUBLIC: no API key, no OAuth — the same
// call the agent's own booking page makes for anonymous visitors. All we need
// is the public username + event slug already inside their pasted link.
// Header `cal-api-version: 2024-09-04` is LOAD-BEARING: without it the API
// silently serves an older response shape. Rate limit 120 req/min. Source
// (crawl4ai 08/19/2026, OpenAPI + docs):
// _RESEARCH/competitor-and-strategy/2026-08-19-calcom-api-v2-slots.md
//
// Availability is a NICETY, never a gate: every failure path returns [] and the
// caller falls back to the plain booking button — the same "branding never
// blocks a build" contract apply-brand keeps.

export interface CalLinkParts {
  username: string;
  /** null on a bare profile link — no event type means no slots query. */
  eventSlug: string | null;
}

export function parseCalLink(url: unknown): CalLinkParts | null {
  if (typeof url !== "string") return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== "cal.com" && !host.endsWith(".cal.com")) return null;
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs.length === 0) return null;
  return { username: segs[0], eventSlug: segs[1] ?? null };
}

const SLOTS_ENDPOINT = "https://api.cal.com/v2/slots";

/**
 * ISO starts of every open slot in [startISO, endISO], flattened in day order.
 * Response shape (pinned by the version header):
 * `{ status: "success", data: { "YYYY-MM-DD": [{ start: ISO }, …] } }`.
 */
export async function fetchCalcomSlots(
  args: { calLink: string; startISO: string; endISO: string; timeZone: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const parts = parseCalLink(args.calLink);
  if (!parts?.eventSlug) return [];
  const u = new URL(SLOTS_ENDPOINT);
  u.searchParams.set("username", parts.username);
  u.searchParams.set("eventTypeSlug", parts.eventSlug);
  u.searchParams.set("start", args.startISO);
  u.searchParams.set("end", args.endISO);
  u.searchParams.set("timeZone", args.timeZone);
  try {
    // 8s hard bound: this runs on the SEND path, upstream of the blast route's
    // own deadline arithmetic (wave2Deadline is computed AFTER this call) — a
    // slow-but-not-hung vendor would otherwise eat the route's whole headroom
    // and strand an email_blasts row in "sending" (second-order audit
    // 08/19/2026). Abort degrades to [] like every other failure: plain button.
    const res = await fetchImpl(u.toString(), {
      headers: { "cal-api-version": "2024-09-04" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: unknown };
    const days = body?.data;
    if (!days || typeof days !== "object" || Array.isArray(days)) return [];
    const out: string[] = [];
    for (const day of Object.keys(days).sort()) {
      const entries = (days as Record<string, unknown>)[day];
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        const start = (e as { start?: unknown })?.start;
        if (typeof start === "string" && start.trim() !== "") out.push(start);
      }
    }
    return out;
  } catch {
    return [];
  }
}
