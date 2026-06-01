import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutputProducerResult,
  BrainOutputMetric,
  BrainOutputDirection,
} from "../types/brain-output.mts";
import {
  dbprPressReleasesSource,
  type DbprPressReleaseNormalized,
} from "../sources/dbpr-press-releases-source.mts";
import { env } from "../config/env.mts";

/**
 * news-swfl — FL DBPR press releases, weekly scrape of myfloridalicense.com.
 *
 * Source: public.dbpr_press_releases (ingest/pipelines/dbpr_press_releases,
 * cron Monday 09:00 UTC via dbpr-press-releases-weekly.yml).
 *
 * Coverage: all DBPR regulated industries statewide; SWFL-relevant flag set
 * by Sonnet enricher for releases mentioning Lee/Collier/Charlotte/Sarasota/Hendry.
 *
 * Key metrics:
 *   dbpr_swfl_releases_90d        — SWFL-relevant releases in last 90 days
 *   dbpr_swfl_releases_prior_90d  — SWFL-relevant releases 90-180 days ago (momentum)
 *   dbpr_total_releases_90d       — all releases in last 90 days (statewide signal)
 *
 * Leaf brain (no upstream brains). Direction: SWFL-relevant release count trend.
 */

let lastRows: DbprPressReleaseNormalized[] = [];
let lastFetchedAt: string | null = null;

function daysBefore(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function makeSource(
  fetchedAt: string,
  sourceUrl: string,
  citation: string,
): BrainOutputMetric["source"] {
  return {
    url: sourceUrl || "https://www2.myfloridalicense.com/press-releases/",
    fetched_at: fetchedAt,
    tier: 2,
    citation: `FL DBPR Press Releases — ${citation}`,
  };
}

// ── corpusSummary ─────────────────────────────────────────────────────────────

function newsSwflCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  const rows = allFragments
    .map((f) => f.normalized as unknown as DbprPressReleaseNormalized)
    .filter(
      (n): n is DbprPressReleaseNormalized => n?.kind === "dbpr-press-release",
    );

  lastRows = rows;
  lastFetchedAt = allFragments[0]?.fetched_at ?? null;

  if (rows.length === 0) return [];

  const cutoff90 = daysBefore(90);
  const swflRecent = rows.filter(
    (r) =>
      r.is_swfl_relevant &&
      r.published_date !== null &&
      r.published_date >= cutoff90,
  );

  return [
    {
      topic: "dbpr_news_snapshot",
      fact: "DBPR press release pulse — latest 90 days",
      value:
        `DBPR SWFL-relevant releases (last 90 days): ${swflRecent.length}. ` +
        `Total releases in dataset: ${rows.length}.`,
      source_fragment_ids: [],
    },
  ];
}

// ── outputProducer ────────────────────────────────────────────────────────────

function newsSwflOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const rows = lastRows;
  const fetchedAt =
    lastFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  if (rows.length === 0) {
    return {
      conclusion:
        "news-swfl: no DBPR press release data available — table may be empty or backfill has not yet run.",
      key_metrics: [],
      caveats: [
        "dbpr_press_releases table returned 0 rows. Run: python -m ingest.pipelines.dbpr_press_releases.pipeline --backfill",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  const cutoff90 = daysBefore(90);
  const cutoff180 = daysBefore(180);

  const allRecent = rows.filter(
    (r) => r.published_date !== null && r.published_date >= cutoff90,
  );
  const swflRecent = allRecent.filter((r) => r.is_swfl_relevant);
  const swflPrior = rows.filter(
    (r) =>
      r.is_swfl_relevant &&
      r.published_date !== null &&
      r.published_date >= cutoff180 &&
      r.published_date < cutoff90,
  );

  const sourceUrl =
    rows.find((r) => r.source_url)?.source_url ??
    "https://www2.myfloridalicense.com/press-releases/";

  const key_metrics: BrainOutputMetric[] = [];

  key_metrics.push({
    metric: "dbpr_swfl_releases_90d",
    label: "SWFL-relevant DBPR press releases (last 90 days)",
    value: swflRecent.length,
    direction:
      swflPrior.length === 0
        ? "stable"
        : swflRecent.length > swflPrior.length
          ? "rising"
          : swflRecent.length < swflPrior.length
            ? "falling"
            : "stable",
    variable_type: "extensive",
    units: "count",
    display_format: "raw",
    source: makeSource(
      fetchedAt,
      sourceUrl,
      `${swflRecent.length} SWFL-relevant releases in last 90 days`,
    ),
  });

  key_metrics.push({
    metric: "dbpr_swfl_releases_prior_90d",
    label: "SWFL-relevant DBPR press releases (prior 90-day window)",
    value: swflPrior.length,
    direction: "stable",
    variable_type: "extensive",
    units: "count",
    display_format: "raw",
    source: makeSource(
      fetchedAt,
      sourceUrl,
      `${swflPrior.length} SWFL-relevant releases 90-180 days prior`,
    ),
  });

  key_metrics.push({
    metric: "dbpr_total_releases_90d",
    label: "Total DBPR press releases (last 90 days, statewide)",
    value: allRecent.length,
    direction: "stable",
    variable_type: "extensive",
    units: "count",
    display_format: "raw",
    source: makeSource(
      fetchedAt,
      sourceUrl,
      `${allRecent.length} total statewide releases in last 90 days`,
    ),
  });

  // ── Direction ────────────────────────────────────────────────────────────────
  let direction: BrainOutputDirection;
  let magnitude: number;
  if (swflPrior.length === 0) {
    direction = "neutral";
    magnitude = 0.3;
  } else {
    const delta = swflRecent.length - swflPrior.length;
    const ratio = Math.abs(delta) / swflPrior.length;
    if (delta > 0) {
      direction = "bullish";
      magnitude = Math.min(0.3 + ratio * 0.4, 0.7);
    } else if (delta < 0) {
      direction = "bearish";
      magnitude = Math.min(0.3 + ratio * 0.4, 0.7);
    } else {
      direction = "neutral";
      magnitude = 0.3;
    }
  }

  // ── Conclusion ───────────────────────────────────────────────────────────────
  const parts: string[] = [];
  parts.push(
    `DBPR issued ${swflRecent.length} SWFL-relevant press release${swflRecent.length === 1 ? "" : "s"} in the last 90 days.`,
  );
  if (swflPrior.length > 0) {
    const delta = swflRecent.length - swflPrior.length;
    const trend =
      delta > 0
        ? `+${delta} vs prior 90-day window`
        : delta < 0
          ? `${delta} vs prior 90-day window`
          : `flat vs prior 90-day window`;
    parts.push(`Enforcement activity momentum: ${trend}.`);
  }
  if (swflRecent.length > 0) {
    const topicCounts: Record<string, number> = {};
    for (const r of swflRecent) {
      for (const t of r.topics) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
    }
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    if (topTopics.length > 0)
      parts.push(`Top topics: ${topTopics.join(", ")}.`);
  }
  parts.push(
    "Source: FL Department of Business and Professional Regulation (www2.myfloridalicense.com/press-releases/).",
  );

  const caveats: string[] = [
    "SWFL relevance is determined by geographic mentions extracted from release text; releases without explicit county/city names may be undercounted.",
    "DBPR release frequency (~4-5/month statewide) makes short windows (< 90 days) noisy — use momentum comparison over equal windows.",
    `${allRecent.length - swflRecent.length} of ${allRecent.length} recent releases were statewide (no SWFL geographic mention) and excluded from the SWFL count.`,
  ];
  if (env.source === "fixture") {
    caveats.unshift(
      "news-swfl: this build uses SYNTHETIC fixture data — set REFINERY_SOURCE=live to read real dbpr_press_releases.",
    );
  }

  return {
    conclusion: parts.join(" "),
    key_metrics,
    caveats,
    direction,
    magnitude,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
    grain_boundary: {
      not_available: [
        "Individual license actions, complaint filings, or case outcomes — only published press releases",
        "Sub-county grain — releases name counties or cities, not ZIP codes or corridors",
        "Enforcement outcome resolution — arrest/citation counts at time of release, not final dispositions",
      ],
      finest_grain: "press-release",
    },
  };
}

// ── Pack definition ───────────────────────────────────────────────────────────

export const newsSwfl: PackDefinition = {
  id: "news-swfl",
  brain_id: "news-swfl",
  domain: "macro",
  scope:
    "FL DBPR press releases — weekly scrape of myfloridalicense.com. Tracks regulatory enforcement actions, licensing changes, and industry news for SWFL (Lee/Collier/Charlotte/Sarasota/Hendry counties).",
  ttl_seconds: 604800, // 7 days — matches weekly ingest cadence

  sources: [dbprPressReleasesSource],
  input_brains: [],

  fitScore: () => 0.6,
  compositeCutoff: 0,
  skipTriageAgent: true,
  skipSynthesisAgent: true,
  corpusSummary: newsSwflCorpusSummary,
  outputProducer: newsSwflOutputProducer,
  synthesisStrategy: "deterministic",

  preferences: [
    "The user tracks SWFL regulatory environment signals — enforcement sweeps, licensing changes, and legislative activity that affect real estate, construction, hospitality, and other regulated industries.",
    "The user reads DBPR enforcement frequency as a market-condition signal: high enforcement post-storm (e.g. unlicensed contractor sweeps) flags recovery activity; ABT actions signal hospitality market health.",
    "The user expects this brain to surface SWFL-relevant regulatory momentum and let master synthesize it against sector-credit and CRE data.",
  ],
  activeProject:
    "news-swfl: weekly DBPR press release regulatory pulse for SWFL — enforcement actions, licensing news, and legislative activity affecting Lee + Collier + Charlotte counties.",
  prompts: {
    triageContext:
      "These fragments are DBPR press release rows from dbpr_press_releases. SWFL-relevant rows are pre-filtered by the enricher; the pack is pure deterministic aggregation.",
    synthesisContext:
      "This pack runs no synthesis agent (skipSynthesisAgent). Every fact is produced deterministically by newsSwflCorpusSummary and the BrainOutput is built by newsSwflOutputProducer.",
  },
};
