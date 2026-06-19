import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type {
  QualEvent,
  ScoredEvent,
  BrandRegistry,
  BrandEntry,
  RadiusConfig,
  ProjectTypeConfig,
  EventType,
} from "./types";

const TIER_WEIGHT: Record<number, { open: number; close: number }> = {
  1: { open: 10, close: 10 },
  2: { open: 8, close: 7 },
  3: { open: 5, close: 4 },
  4: { open: 2, close: 2 },
  5: { open: 0, close: 0 },
};

const EVENT_TYPE_MULTIPLIER: Record<EventType, number> = {
  opening: 1.0,
  anchor_announced: 0.9,
  construction_start: 0.8,
  closing: 1.1,
  zoning_change: 0.7,
  business_news: 0.5,
  permit_filed: -1,
};

const PERMIT_TYPE_MULTIPLIER: Record<string, number> = {
  new_construction: 1.0,
  addition: 0.8,
  alteration: 0.5,
  tenant_buildout: 0.5,
  renovation: 0.3,
  remodel: 0.3,
  repair: 0.1,
  maintenance: 0.1,
};

function permitValueMultiplier(declaredValueUsd: number | null | undefined): number {
  if (declaredValueUsd == null) return 0.4;
  if (declaredValueUsd < 50_000) return 0.2;
  if (declaredValueUsd < 250_000) return 0.5;
  if (declaredValueUsd < 1_000_000) return 0.7;
  if (declaredValueUsd < 5_000_000) return 0.9;
  return 1.0;
}

let _brands: BrandRegistry | null = null;
let _radius: RadiusConfig | null = null;

export function loadBrandRegistry(): BrandRegistry {
  if (_brands) return _brands;
  const raw = readFileSync(join(process.cwd(), "ingest", "brand-tier-registry.yaml"), "utf-8");
  _brands = parse(raw) as BrandRegistry;
  return _brands;
}

export function loadRadiusConfig(): RadiusConfig {
  if (_radius) return _radius;
  const raw = readFileSync(join(process.cwd(), "ingest", "event-radius-config.yaml"), "utf-8");
  _radius = parse(raw) as RadiusConfig;
  return _radius;
}

export function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3_958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveRadiusBand(
  distanceMiles: number,
  config: ProjectTypeConfig,
): { band: string; multiplier: number } | null {
  const sorted = [...config.radius_bands].sort((a, b) => a.radius_miles - b.radius_miles);
  for (const band of sorted) {
    if (distanceMiles <= band.radius_miles) {
      return { band: `${band.radius_miles}mi`, multiplier: band.weight_multiplier };
    }
  }
  return null;
}

function resolveBrandEntry(
  brandKey: string | undefined,
  brands: BrandRegistry,
): { entry: BrandEntry; key: string } {
  if (brandKey && brands[brandKey]) return { entry: brands[brandKey], key: brandKey };
  return {
    entry: brands["_unclassified"] ?? { tier: 5, category: "unknown" },
    key: "_unclassified",
  };
}

function buildAiSummary(event: QualEvent, distanceMiles: number, _finalScore: number): string {
  const dir = distanceMiles < 0.1 ? "on-site" : `${distanceMiles.toFixed(1)} mi`;
  const typeLabel: Record<EventType, string> = {
    opening: "opening",
    closing: "closed permanently",
    permit_filed: "permit filed",
    construction_start: "construction started",
    zoning_change: "zoning change",
    anchor_announced: "announced",
    business_news: "news",
  };
  const label = typeLabel[event.event_type] ?? event.event_type;
  const base = `${event.entity_name} (${dir}): ${label} ${event.event_date}`;
  return event.headline ? `${base} — ${event.headline.slice(0, 80)}` : base;
}

export interface ScoreEventOptions {
  permitType?: string;
  declaredValueUsd?: number | null;
}

export function scoreEvent(
  event: QualEvent,
  project: { lat: number; lng: number; project_type?: string | null },
  brands: BrandRegistry,
  radiusConfig: RadiusConfig,
  opts: ScoreEventOptions = {},
): ScoredEvent {
  const { entry: brandEntry } = resolveBrandEntry(event.entity_brand_key, brands);
  const tier = brandEntry.tier ?? 5;

  const isClose = event.event_type === "closing";
  const brandWeight = isClose
    ? (brandEntry.weight_close ?? TIER_WEIGHT[tier]?.close ?? 0)
    : (brandEntry.weight_open ?? TIER_WEIGHT[tier]?.open ?? 0);

  if (brandWeight === 0) {
    const distanceMiles = haversineDistanceMiles(project.lat, project.lng, event.lat, event.lng);
    return {
      ...event,
      brand_tier: tier,
      brand_weight: 0,
      distance_miles: distanceMiles,
      radius_band: "outside",
      final_score: 0,
      notify_user: false,
      inject_ai: false,
      ai_summary: buildAiSummary(event, distanceMiles, 0),
      suppressed_reason: "tier_5",
    };
  }

  const distanceMiles = haversineDistanceMiles(project.lat, project.lng, event.lat, event.lng);
  const typeKey = project.project_type ?? "_default";
  const config = radiusConfig[typeKey] ?? radiusConfig["_default"]!;

  const bandResult = resolveRadiusBand(distanceMiles, config);
  if (!bandResult) {
    return {
      ...event,
      brand_tier: tier,
      brand_weight: brandWeight,
      distance_miles: distanceMiles,
      radius_band: "outside",
      final_score: 0,
      notify_user: false,
      inject_ai: false,
      ai_summary: buildAiSummary(event, distanceMiles, 0),
      suppressed_reason: "score_below_threshold",
    };
  }

  const { band, multiplier: radiusMultiplier } = bandResult;

  let finalScore: number;
  if (event.event_type === "permit_filed") {
    const permitTypeM = PERMIT_TYPE_MULTIPLIER[opts.permitType ?? ""] ?? 0.5;
    const permitValueM = permitValueMultiplier(opts.declaredValueUsd);
    finalScore = brandWeight * permitTypeM * permitValueM * radiusMultiplier;
  } else {
    const eventTypeM = EVENT_TYPE_MULTIPLIER[event.event_type] ?? 0.5;
    finalScore = brandWeight * eventTypeM * radiusMultiplier;
  }

  const notify_user = finalScore >= config.min_score_to_notify;
  const inject_ai = finalScore >= config.min_score_for_ai_context;
  const ai_summary = buildAiSummary(event, distanceMiles, finalScore);

  return {
    ...event,
    brand_tier: tier,
    brand_weight: brandWeight,
    distance_miles: distanceMiles,
    radius_band: band,
    final_score: finalScore,
    notify_user,
    inject_ai,
    ai_summary,
    suppressed_reason: !inject_ai ? "score_below_threshold" : undefined,
  };
}
