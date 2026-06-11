// scripts/email/fetch-digest-data.mts
import fs from "node:fs";
import path from "node:path";
import type {
  DigestPayload,
  ZipMetricSnapshot,
  CityVoiceSignal,
  FreshnessManifest,
} from "./types.ts";
import { ZIP_FOCUS } from "./types.ts";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
const REPO_ROOT = path.join(import.meta.dirname, "..", "..");
const DRY_RUN = process.env.DRY_RUN === "true";

// ── Brain file parsing ─────────────────────────────────────────────────────

export function parseBrainOutputSection(markdown: string): unknown | null {
  const marker = "--- OUTPUT ---";
  const idx = markdown.indexOf(marker);
  if (idx === -1) return null;
  try {
    return JSON.parse(markdown.slice(idx + marker.length).trim());
  } catch {
    return null;
  }
}

export function extractZipMetrics(row: Record<string, unknown>): ZipMetricSnapshot {
  const n = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const x = Number(v);
    return isNaN(x) ? null : x;
  };
  return {
    median_sale_price: n(row.median_sale_price),
    dom: n(row.median_dom),
    months_of_supply: n(row.months_of_supply),
    avg_sale_to_list: n(row.avg_sale_to_list),
    sold_above_list_pct: n(row.sold_above_list),
    inventory: n(row.inventory),
    sale_count_period: n(row.homes_sold),
  };
}

function readHousingBrain(): {
  zipMetrics: Record<string, ZipMetricSnapshot>;
  countyMetrics: ZipMetricSnapshot;
  periodBegin: string;
} {
  const content = fs.readFileSync(path.join(REPO_ROOT, "brains", "housing-swfl.md"), "utf-8");
  const output = parseBrainOutputSection(content) as {
    detail_tables?: Array<{ rows: Array<Record<string, unknown>> }>;
    key_metrics?: Array<{ slug: string; value: unknown }>;
  } | null;

  const zipMetrics: Record<string, ZipMetricSnapshot> = {};
  let periodBegin = "";
  const rows = output?.detail_tables?.[0]?.rows ?? [];
  for (const row of rows) {
    const zip = String(row.zip_code ?? "");
    if ((ZIP_FOCUS as readonly string[]).includes(zip)) {
      zipMetrics[zip] = extractZipMetrics(row);
      if (!periodBegin && row.period_begin) periodBegin = String(row.period_begin);
    }
  }

  const km = output?.key_metrics ?? [];
  const kv = (slug: string): number | null => {
    const found = km.find((m) => m.slug === slug);
    return found ? (typeof found.value === "number" ? found.value : null) : null;
  };
  const countyMetrics: ZipMetricSnapshot = {
    median_sale_price: kv("median_sale_price_swfl"),
    dom: kv("median_dom_swfl"),
    months_of_supply: kv("housing_months_of_supply_swfl"),
    avg_sale_to_list: kv("avg_sale_to_list_swfl"),
    sold_above_list_pct: kv("sold_above_list_swfl"),
    inventory: null,
    sale_count_period: null,
  };
  return { zipMetrics, countyMetrics, periodBegin };
}

// ── API narrative fetch ────────────────────────────────────────────────────

async function fetchSpeak(slug: string): Promise<{ text: string; freshness_token: string }> {
  const res = await fetch(`${SITE_URL}/api/b/${slug}?view=speak&tier=2`);
  if (!res.ok) throw new Error(`Brain speak fetch failed: ${slug} (${res.status})`);
  const text = await res.text();
  const token = text.match(/SWFL-\d{4}-v\d+-\d{8}/)?.[0] ?? "unknown";
  return { text, freshness_token: token };
}

async function fetchCityVoices(): Promise<CityVoiceSignal[]> {
  const { text } = await fetchSpeak("city-pulse-swfl");
  const signals: CityVoiceSignal[] = [];
  const topicMap: Record<string, CityVoiceSignal["topic"]> = {
    BREAKING: "breaking",
    TRANSACTION: "transactions",
    DEVELOPMENT: "development",
    BUSINESS: "business",
    STRUCTURAL: "structural",
  };
  for (const line of text.split("\n")) {
    const m = line.match(
      /^(BREAKING|TRANSACTION|DEVELOPMENT|BUSINESS|STRUCTURAL):\s*(.+?)\s*—\s*(.+?)\.?\s*(?:Source:\s*(\S+))?$/i,
    );
    if (!m) continue;
    const topic = topicMap[m[1].toUpperCase()];
    if (topic)
      signals.push({ topic, title: m[2].trim(), city: m[3].trim(), source_url: m[4] ?? "" });
  }
  return signals;
}

// ── Main export ────────────────────────────────────────────────────────────

export async function fetchDigestData(): Promise<DigestPayload> {
  const today = new Date().toISOString().slice(0, 10);
  const [masterSpeak, cityVoices, housing] = await Promise.all([
    fetchSpeak("master"),
    fetchCityVoices(),
    Promise.resolve(readHousingBrain()),
  ]);

  const manifest: FreshnessManifest = {
    master: { token: masterSpeak.freshness_token, as_of: today },
    housing_swfl: { token: "housing-swfl-disk", as_of: today, period_begin: housing.periodBegin },
    city_pulse: { token: "city-pulse-daily", as_of: today },
    lee_cre: null,
    source_env: DRY_RUN ? "preview" : "live",
  };

  const topStory = cityVoices.find((s) => s.topic === "breaking") ?? cityVoices[0] ?? null;

  return {
    date: today,
    freshness_manifest: manifest,
    top_line: masterSpeak.text.split("\n").slice(0, 3).join(" ").trim(),
    zip_metrics: housing.zipMetrics,
    county_metrics: housing.countyMetrics,
    city_voices: cityVoices.slice(0, 4),
    top_story: topStory
      ? { title: topStory.title, slug: "city-pulse-swfl", topic: topStory.topic }
      : null,
  };
}
