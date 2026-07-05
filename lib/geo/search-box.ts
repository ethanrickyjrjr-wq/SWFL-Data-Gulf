// lib/geo/search-box.ts — pure URL builders + parsers for the Mapbox Search Box
// API (interactive autocomplete: /suggest per keystroke, /retrieve on pick).
// Contract verified live 07/05/2026 against docs.mapbox.com/api/search/search-box:
// both endpoints REQUIRE the same customer-generated session_token (UUIDv4) —
// that's what folds a whole typing session into one billed search session
// (≤50 suggests + 1 retrieve, 2-min idle expiry). Proximity is deliberately
// omitted: the documented default is IP proximity, the right bias for visitors
// already in Southwest Florida. No fetch and no env in this module — the
// /api/address-* routes own both, so these stay trivially testable.

const BASE = "https://api.mapbox.com/search/searchbox/v1";
const TYPES = "address,postcode,place,locality,neighborhood";

export interface AddressSuggestion {
  mapboxId: string;
  name: string;
  placeFormatted: string;
}

export function buildSuggestUrl(q: string, sessionToken: string, accessToken: string): string {
  const p = new URLSearchParams({
    q: q.slice(0, 256),
    session_token: sessionToken,
    access_token: accessToken,
    country: "US",
    types: TYPES,
    limit: "6",
    language: "en",
  });
  return `${BASE}/suggest?${p.toString()}`;
}

export function buildRetrieveUrl(
  mapboxId: string,
  sessionToken: string,
  accessToken: string,
): string {
  const p = new URLSearchParams({ session_token: sessionToken, access_token: accessToken });
  return `${BASE}/retrieve/${encodeURIComponent(mapboxId)}?${p.toString()}`;
}

export function parseSuggestions(json: unknown): AddressSuggestion[] {
  const rows = (json as { suggestions?: unknown[] } | null)?.suggestions;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    const row = r as { mapbox_id?: unknown; name?: unknown; place_formatted?: unknown };
    if (typeof row.mapbox_id !== "string" || typeof row.name !== "string") return [];
    return [
      {
        mapboxId: row.mapbox_id,
        name: row.name,
        placeFormatted: typeof row.place_formatted === "string" ? row.place_formatted : "",
      },
    ];
  });
}

export function parseRetrieve(json: unknown): { name: string; zip: string | null } | null {
  const feature = (json as { features?: unknown[] } | null)?.features?.[0] as
    | {
        properties?: {
          name?: unknown;
          full_address?: unknown;
          context?: { postcode?: { name?: unknown } };
        };
      }
    | undefined;
  const props = feature?.properties;
  if (!props) return null;
  const name =
    typeof props.full_address === "string"
      ? props.full_address
      : typeof props.name === "string"
        ? props.name
        : null;
  if (!name) return null;
  const zipRaw = props.context?.postcode?.name;
  const zip = typeof zipRaw === "string" && /^\d{5}/.test(zipRaw) ? zipRaw.slice(0, 5) : null;
  return { name, zip };
}
