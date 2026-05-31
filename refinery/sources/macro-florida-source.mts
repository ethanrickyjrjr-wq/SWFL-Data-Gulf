import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

/**
 * macro-florida source connector — state-level FRED series for Florida
 * (FLUR = unemployment rate, LBSSA12 = labor-force participation).
 * The state tier of the three-tier macro denominator chain
 * (macro-us → macro-florida → macro-swfl). National indicators live in
 * macro-us-source.mts; this connector strictly owns FL state-level data.
 *
 * Trust tier: 1 (FRED is a primary federal source).
 *
 * Future extensions: CBP (county business patterns aggregated to FL),
 * IRS SOI migration totals at the state level. Each lands as another
 * SourceConnector on the macro-florida pack — this file stays FRED-only.
 */

const SOURCE_ID = "fred_macro_florida";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "macro-florida.sample.json",
);

/** Normalized state-macro indicator — what Stage 2 / Stage 3 see. */
export interface MacroFloridaNormalized {
  kind: "macro-indicator";
  /** Stable id used by the pack's METRIC_MAP — see FRED_SERIES below */
  series_id: string;
  label: string;
  value: number;
  unit: string;
  period: string;
  direction: "rising" | "falling" | "stable";
  context: string;
  source_url: string;
}

interface FredSpec {
  key: "FLUR" | "FLLFPR";
  fred_id: string;
  units: "lin" | "pc1";
  label: string;
  unit: string;
  context: string;
}

const FRED_SERIES: FredSpec[] = [
  {
    key: "FLUR",
    fred_id: "FLUR",
    units: "lin",
    label: "Florida Unemployment Rate",
    unit: "percent",
    context:
      "Florida unemployment is the headline labor-tightness read for SWFL operators — tourism and construction absorb new entrants when this stays low.",
  },
  {
    key: "FLLFPR",
    fred_id: "LBSSA12",
    units: "lin",
    label: "Florida Labor Force Participation Rate",
    unit: "percent",
    context:
      "FL LFPR climbs against retirement-state demographic gravity — a positive read on Florida's working-age engagement.",
  },
];

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFredSeries(spec: FredSpec): Promise<FredObservation[]> {
  const key = env.fredApiKey;
  if (!key) {
    throw new Error(
      "macro-florida-source: FRED_API_KEY not set. Add it to .env.local or run with REFINERY_SOURCE=fixture.",
    );
  }
  const url =
    `${FRED_BASE}?series_id=${spec.fred_id}` +
    `&units=${spec.units}` +
    `&api_key=${key}` +
    `&file_type=json` +
    `&sort_order=desc` +
    `&limit=24`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 && attempt < 3) {
      await sleep(2000 * 2 ** (attempt - 1)); // 2 s, then 4 s
      continue;
    }
    if (!res.ok) {
      throw new Error(
        `macro-florida-source: FRED ${spec.fred_id} returned HTTP ${res.status} — check key validity and series id.`,
      );
    }
    const data = (await res.json()) as FredResponse;
    const obs = (data.observations ?? []).filter((o) => o.value !== ".");
    if (obs.length === 0) {
      throw new Error(
        `macro-florida-source: FRED ${spec.fred_id} returned no usable observations.`,
      );
    }
    return obs;
  }
  throw new Error(
    `macro-florida-source: FRED ${spec.fred_id} exhausted 3 attempts on HTTP 429.`,
  );
}

function computeDirection(
  observations: FredObservation[],
): MacroFloridaNormalized["direction"] {
  if (observations.length < 2) return "stable";
  const latest = parseFloat(observations[0].value);
  const compareIdx = Math.min(observations.length - 1, 6);
  const prior = parseFloat(observations[compareIdx].value);
  if (!Number.isFinite(latest) || !Number.isFinite(prior) || prior === 0) {
    return "stable";
  }
  const relChange = (latest - prior) / Math.abs(prior);
  if (relChange > 0.02) return "rising";
  if (relChange < -0.02) return "falling";
  return "stable";
}

function fredReceiptUrl(spec: FredSpec): string {
  return (
    `${FRED_BASE}?series_id=${spec.fred_id}` +
    `&units=${spec.units}` +
    `&file_type=json` +
    `&sort_order=desc` +
    `&limit=24`
  );
}

async function liveFred(): Promise<MacroFloridaNormalized[]> {
  const results: MacroFloridaNormalized[] = [];
  for (let i = 0; i < FRED_SERIES.length; i++) {
    if (i > 0) await sleep(1500);
    const spec = FRED_SERIES[i];
    const obs = await fetchFredSeries(spec);
    const latest = obs[0];
    results.push({
      kind: "macro-indicator",
      series_id: spec.key,
      label: spec.label,
      value: parseFloat(latest.value),
      unit: spec.unit,
      period: latest.date,
      direction: computeDirection(obs),
      context: spec.context,
      source_url: fredReceiptUrl(spec),
    });
  }
  return results;
}

function isDirection(s: unknown): s is MacroFloridaNormalized["direction"] {
  return s === "rising" || s === "falling" || s === "stable";
}

function normalizeFixtureRow(
  row: Record<string, unknown>,
): MacroFloridaNormalized {
  const direction = isDirection(row.direction) ? row.direction : "stable";
  const series_id = String(row.series_id ?? "");
  const spec = FRED_SERIES.find((s) => s.key === series_id);
  const source_url = spec
    ? fredReceiptUrl(spec)
    : `fixture://refinery/__fixtures__/macro-florida.sample.json#${series_id}`;
  return {
    kind: "macro-indicator",
    series_id,
    label: String(row.label ?? ""),
    value: Number(row.value),
    unit: String(row.unit ?? ""),
    period: String(row.period ?? ""),
    direction,
    context: String(row.context ?? ""),
    source_url,
  };
}

async function loadFixtureRows(): Promise<MacroFloridaNormalized[]> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  const data = JSON.parse(raw) as
    | { rows?: unknown[]; data?: unknown[] }
    | unknown[];
  const rows: unknown[] = Array.isArray(data)
    ? data
    : (data.rows ?? data.data ?? []);
  return (rows as Record<string, unknown>[]).map(normalizeFixtureRow);
}

export const macroFloridaSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,
  async fetch(): Promise<RawFragment[]> {
    const indicators =
      env.source === "fixture" ? await loadFixtureRows() : await liveFred();
    const fetched_at = isoTimestamp();
    return indicators.map(
      (normalized): RawFragment<MacroFloridaNormalized> => ({
        fragment_id: fragmentId(SOURCE_ID, normalized.series_id),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: { series_id: normalized.series_id, period: normalized.period },
        normalized,
      }),
    );
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    return {
      source:
        env.source === "fixture"
          ? "FRED — Federal Reserve Economic Data (fixture; FLUR, LBSSA12)"
          : "FRED — Federal Reserve Economic Data (live API; FLUR, LBSSA12)",
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
