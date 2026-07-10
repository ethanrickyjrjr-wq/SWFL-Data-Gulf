// lib/email/outreach/brand-fixtures.ts
//
// Loads fixtures/real-estate-brands/ (curated brokerage brand profiles) for the
// outreach brand resolver. Script/CLI runtime ONLY — node:fs, never bundle client-side.
// A malformed file is skipped and reported, never a crash: outreach must not die
// because one brand file rotted.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface BrandFixture {
  slug: string;
  company_name: string;
  domain?: string;
  dbpr_name?: string;
  brand: {
    status: "official_guide" | "curated" | "crawled" | "api";
    palette: {
      primaryColor: string;
      accentColor?: string;
      textColor?: string;
      backdropColor?: string;
    };
    confidence: number;
    logo_url?: string | null;
    source_url?: string;
    fonts?: string[];
    notes?: string;
  };
}

export interface LoadResult {
  fixtures: BrandFixture[];
  skipped: { file: string; reason: string }[];
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const STATUSES = new Set(["official_guide", "curated", "crawled", "api"]);

export function validateFixture(
  raw: unknown,
): { ok: true; fixture: BrandFixture } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not an object" };
  const f = raw as Record<string, unknown>;
  if (typeof f.slug !== "string" || !f.slug) return { ok: false, reason: "missing slug" };
  if (typeof f.company_name !== "string" || !f.company_name) {
    return { ok: false, reason: "missing company_name" };
  }
  const brand = f.brand as Record<string, unknown> | undefined;
  if (!brand || typeof brand !== "object") return { ok: false, reason: "missing brand" };
  if (!STATUSES.has(String(brand.status))) {
    return { ok: false, reason: `bad status "${String(brand.status)}"` };
  }
  const conf = brand.confidence;
  if (typeof conf !== "number" || conf < 0 || conf > 1) {
    return { ok: false, reason: "confidence not in 0..1" };
  }
  const palette = brand.palette as Record<string, unknown> | undefined;
  if (!palette || typeof palette !== "object") return { ok: false, reason: "missing palette" };
  if (typeof palette.primaryColor !== "string" || !HEX_RE.test(palette.primaryColor)) {
    return { ok: false, reason: `bad primaryColor "${String(palette.primaryColor)}"` };
  }
  for (const key of ["accentColor", "textColor", "backdropColor"] as const) {
    const v = palette[key];
    if (v !== undefined && (typeof v !== "string" || !HEX_RE.test(v))) {
      return { ok: false, reason: `bad ${key} "${String(v)}"` };
    }
  }
  return { ok: true, fixture: raw as BrandFixture };
}

export async function loadBrandFixtures(dir: string): Promise<LoadResult> {
  const fixtures: BrandFixture[] = [];
  const skipped: LoadResult["skipped"] = [];
  let entries: { slug?: string; file?: string }[];
  try {
    const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
    entries = Array.isArray(index?.brokerages) ? index.brokerages : [];
  } catch (err) {
    skipped.push({ file: "index.json", reason: err instanceof Error ? err.message : String(err) });
    return { fixtures, skipped };
  }
  for (const entry of entries) {
    const file = entry.file ?? `${entry.slug}.json`;
    try {
      const raw = JSON.parse(await readFile(join(dir, file), "utf8"));
      const v = validateFixture(raw);
      if (v.ok) fixtures.push(v.fixture);
      else skipped.push({ file, reason: v.reason });
    } catch (err) {
      skipped.push({ file, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const s of skipped) {
    console.error(`[brand-fixtures] skipped ${s.file}: ${s.reason}`);
  }
  return { fixtures, skipped };
}
