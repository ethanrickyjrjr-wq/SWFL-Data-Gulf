import type { QualEvent, BrandRegistry } from "./types";
import { zipToCentroid } from "@/lib/geo/zip-centroid";

export interface PermitRow {
  contractor_name: string | null;
  work_description: string | null;
  declared_value_usd: number | null;
  permit_type: string | null;
  status: string | null;
  site_lat: number | null;
  site_lng: number | null;
  zip_code: string | null;
  issue_date: string | null;
}

function detectBrand(
  row: PermitRow,
  brands: BrandRegistry,
): { brandKey: string; entityName: string } | null {
  const searchText = [row.contractor_name, row.work_description]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  for (const [key, entry] of Object.entries(brands)) {
    if (key === "_unclassified") continue;
    const aliases = entry.aliases ?? [key];
    for (const alias of aliases) {
      if (searchText.includes(alias.toUpperCase())) {
        return { brandKey: key, entityName: entry.aliases?.[0] ?? key };
      }
    }
  }
  return null;
}

function resolveCoords(
  row: PermitRow,
): { lat: number; lng: number; geocode_source: "zip_centroid" | "exact" } | null {
  if (row.site_lat != null && row.site_lng != null) {
    return { lat: row.site_lat, lng: row.site_lng, geocode_source: "exact" };
  }
  if (row.zip_code) {
    const centroid = zipToCentroid(row.zip_code);
    if (centroid) return { ...centroid, geocode_source: "zip_centroid" };
  }
  return null;
}

function inferEventType(row: PermitRow): QualEvent["event_type"] {
  const status = (row.status ?? "").toLowerCase();
  const type = (row.permit_type ?? "").toLowerCase();
  if (status === "issued" || status === "active" || type === "new_construction") {
    return "construction_start";
  }
  return "permit_filed";
}

export function extractEventFromPermit(
  row: PermitRow,
  brands: BrandRegistry,
): (QualEvent & { geocode_source?: "zip_centroid" | "exact" }) | null {
  const brandMatch = detectBrand(row, brands);
  if (!brandMatch) return null;

  const entry = brands[brandMatch.brandKey];
  if (!entry || entry.tier >= 5) return null;

  const val = row.declared_value_usd;
  if (val != null && val < 10_000) return null;

  const coords = resolveCoords(row);
  if (!coords) return null;

  const eventType = inferEventType(row);
  const event_date = row.issue_date ?? new Date().toISOString().slice(0, 10);

  return {
    entity_name: brandMatch.entityName,
    entity_brand_key: brandMatch.brandKey,
    event_type: eventType,
    lat: coords.lat,
    lng: coords.lng,
    event_date,
    source: "permits_swfl",
    headline: row.work_description?.slice(0, 120) ?? undefined,
    geocode_source: coords.geocode_source,
  };
}
