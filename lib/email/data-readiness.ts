// Data-readiness verification ladder — runs T-60min before each scheduled email blast.
// Checks whether metric items still have fresh brain data; if stale, climbs four tiers
// to substitute an honest value rather than cancelling the send.
//
// Tier 1 — two crawl4ai sources agree within tolerance    → crawl_consensus
// Tier 2 — one crawl + claude-haiku-4-5 confirms         → crawl_haiku
// Tier 3 — claude-sonnet-4-6 standalone verification     → sonnet_only
// Tier 4 — last known value within max_stale_days        → last_known
// (no tier succeeded)                                    → omitted
//
// Never cancels a blast — substitutes with honest sourcing note on the result.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { ProjectItem } from "@/lib/project/items";
import {
  verificationQuery,
  buildCrawl4aiSearchUrl,
  extractNumericValue,
} from "./verification-sources";

export type VerificationTier =
  | "brain_fresh"
  | "crawl_consensus"
  | "crawl_haiku"
  | "sonnet_only"
  | "last_known"
  | "omitted";

export interface VerificationResult {
  metric_slug: string;
  metric_label: string;
  scope_kind: string | null;
  scope_value: string | null;
  tier_used: VerificationTier;
  value_used: string | null;
  source_urls: string[];
  snapshot_value: string;
  within_tolerance: boolean;
}

// ── Tolerance loading ────────────────────────────────────────────────────────

interface ToleranceEntry {
  tolerance_abs: number | null;
  tolerance_pct: number | null;
  max_stale_days: number;
  z_flag_threshold: number | null;
}
type ToleranceConfig = Record<string, ToleranceEntry>;

let _tolerances: ToleranceConfig | null = null;
function loadTolerances(): ToleranceConfig {
  if (_tolerances) return _tolerances;
  const raw = readFileSync(
    join(process.cwd(), "ingest", "data-verification-tolerances.yaml"),
    "utf-8",
  );
  _tolerances = parse(raw) as ToleranceConfig;
  return _tolerances;
}

/** Match slug to a tolerance key — tries full slug, then common prefixes, then _default. */
function toleranceFor(slug: string): ToleranceEntry {
  const cfg = loadTolerances();
  if (cfg[slug]) return cfg[slug];
  // Prefix matching for slugs like "mortgage_rate_30yr_swfl" → "mortgage_rate"
  for (const key of Object.keys(cfg)) {
    if (key !== "_default" && slug.startsWith(key)) return cfg[key];
  }
  return cfg["_default"]!;
}

function withinTolerance(a: number, b: number, tol: ToleranceEntry): boolean {
  if (tol.tolerance_abs != null) return Math.abs(a - b) <= tol.tolerance_abs;
  if (tol.tolerance_pct != null) {
    const ref = Math.max(Math.abs(a), Math.abs(b), 0.001);
    return (Math.abs(a - b) / ref) * 100 <= tol.tolerance_pct;
  }
  return true;
}

// ── crawl4ai search ──────────────────────────────────────────────────────────

async function crawl4aiSearch(searchQuery: string): Promise<{ text: string; url: string } | null> {
  try {
    const apiUrl = process.env.CRAWL4AI_API_URL ?? "http://localhost:11235";
    const apiToken = process.env.CRAWL4AI_API_TOKEN;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiToken) headers["Authorization"] = `Bearer ${apiToken}`;

    const res = await fetch(`${apiUrl}/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: searchQuery,
        max_results: 3,
        extraction_config: {
          type: "cosine",
          params: { semantic_filter: searchQuery, word_count_threshold: 10 },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { markdown?: string; url?: string }[];
    };
    const first = data.results?.[0];
    if (!first?.markdown) return null;
    return { text: first.markdown.slice(0, 2000), url: first.url ?? "" };
  } catch {
    return null;
  }
}

// ── AI verification tiers ────────────────────────────────────────────────────

const anthropic = new Anthropic();

async function haikuConfirm(
  label: string,
  scope: string,
  crawledText: string,
  snapshotValue: string,
): Promise<{ confirmed: boolean; value: string | null }> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: `Does this text confirm that the current ${label} for ${scope} is approximately ${snapshotValue}?\n\nText:\n${crawledText}\n\nRespond with YES:[value] or NO.`,
        },
      ],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    if (text.startsWith("YES:")) {
      return { confirmed: true, value: text.slice(4).trim() };
    }
    return { confirmed: false, value: null };
  } catch {
    return { confirmed: false, value: null };
  }
}

async function sonnetVerify(
  label: string,
  scope: string,
): Promise<{ value: string; sourceUrl: string } | null> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `What is the current ${label} for ${scope} as of today? Cite a reputable source (government data, major real estate platform, or financial institution). Return JSON only: {"value":"...","source_name":"...","source_url":"...","as_of":"..."}`,
        },
      ],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const jsonMatch = text.match(/\{[\s\S]+\}/);
    if (!jsonMatch) return null;
    const json = JSON.parse(jsonMatch[0]) as { value?: string; source_url?: string };
    if (json.value) return { value: json.value, sourceUrl: json.source_url ?? "" };
    return null;
  } catch {
    return null;
  }
}

// ── Main verification ladder ─────────────────────────────────────────────────

type MetricItem = Extract<ProjectItem, { kind: "metric" }>;

export async function verifyMetricItem(
  item: MetricItem,
  asOf: Date = new Date(),
): Promise<VerificationResult> {
  const slug = item.metric_slug ?? item.label.toLowerCase().replace(/\s+/g, "_");
  const scope = {
    zip: item.scope_kind === "zip" ? (item.scope_value ?? undefined) : undefined,
    place:
      item.scope_kind === "city" || item.scope_kind === "state"
        ? (item.scope_value ?? undefined)
        : undefined,
    county: item.scope_kind === "county" ? (item.scope_value ?? undefined) : undefined,
  };
  const scopeStr = scope.zip ?? scope.place ?? scope.county ?? "Southwest Florida";
  const tol = toleranceFor(slug);
  const snapshotValue = item.value;
  const snapshotNum = extractNumericValue(snapshotValue);

  const base = {
    metric_slug: slug,
    metric_label: item.label,
    scope_kind: item.scope_kind ?? null,
    scope_value: item.scope_value ?? null,
    snapshot_value: snapshotValue,
  } as const;

  const vq = verificationQuery(slug, scope, asOf);
  const searchStr = buildCrawl4aiSearchUrl(vq);
  const altSearch = `${vq.query}${vq.preferred_domains[1] ? ` site:${vq.preferred_domains[1]}` : ""}`;

  // TIER 1: two independent crawl4ai searches agree
  const [crawl1, crawl2] = await Promise.all([
    crawl4aiSearch(searchStr),
    crawl4aiSearch(altSearch),
  ]);

  if (crawl1 && crawl2) {
    const val1 = extractNumericValue(crawl1.text);
    const val2 = extractNumericValue(crawl2.text);
    if (val1 != null && val2 != null && withinTolerance(val1, val2, tol)) {
      const avg = (val1 + val2) / 2;
      return {
        ...base,
        tier_used: "crawl_consensus",
        value_used: String(avg),
        source_urls: [crawl1.url, crawl2.url].filter(Boolean),
        within_tolerance: snapshotNum != null ? withinTolerance(avg, snapshotNum, tol) : true,
      };
    }
  }

  // TIER 2: one crawl + Haiku confirmation
  const crawlResult = crawl1 ?? crawl2;
  if (crawlResult) {
    const crawlNum = extractNumericValue(crawlResult.text);
    if (crawlNum != null) {
      const haiku = await haikuConfirm(item.label, scopeStr, crawlResult.text, snapshotValue);
      if (haiku.confirmed && haiku.value) {
        return {
          ...base,
          tier_used: "crawl_haiku",
          value_used: haiku.value,
          source_urls: [crawlResult.url].filter(Boolean),
          within_tolerance:
            snapshotNum != null ? withinTolerance(crawlNum, snapshotNum, tol) : true,
        };
      }
    }
  }

  // TIER 3: Sonnet standalone verification
  const sonnet = await sonnetVerify(item.label, scopeStr);
  if (sonnet) {
    const sonnetNum = extractNumericValue(sonnet.value);
    const inTol =
      snapshotNum != null && sonnetNum != null
        ? withinTolerance(sonnetNum, snapshotNum, tol)
        : true;
    return {
      ...base,
      tier_used: "sonnet_only",
      value_used: sonnet.value,
      source_urls: [sonnet.sourceUrl].filter(Boolean),
      within_tolerance: inTol,
    };
  }

  // TIER 4: last known value if within max_stale_days
  if (item.freshness_token) {
    const tokenDate = item.freshness_token.match(/(\d{8})$/)?.[1];
    if (tokenDate) {
      const tokenTs = new Date(
        `${tokenDate.slice(0, 4)}-${tokenDate.slice(4, 6)}-${tokenDate.slice(6, 8)}`,
      ).getTime();
      const agedays = Math.floor((Date.now() - tokenTs) / 86_400_000);
      if (agedays <= tol.max_stale_days) {
        return {
          ...base,
          tier_used: "last_known",
          value_used: snapshotValue,
          source_urls: [],
          within_tolerance: true,
        };
      }
    }
  }

  // OMIT — all tiers exhausted, data too stale
  return {
    ...base,
    tier_used: "omitted",
    value_used: null,
    source_urls: [],
    within_tolerance: false,
  };
}

/** Insert a verification result row into data_readiness_alerts. */
export async function logVerificationResult(
  supabase: SupabaseClient,
  projectId: string,
  scheduleId: string | null,
  result: VerificationResult,
  sendAt?: string,
): Promise<void> {
  const { error } = await supabase.from("data_readiness_alerts").insert({
    project_id: projectId,
    schedule_id: scheduleId,
    metric_slug: result.metric_slug,
    metric_label: result.metric_label,
    scope_kind: result.scope_kind,
    scope_value: result.scope_value,
    tier_used: result.tier_used,
    value_used: result.value_used,
    source_urls: result.source_urls.length > 0 ? result.source_urls : null,
    snapshot_value: result.snapshot_value,
    within_tolerance: result.within_tolerance,
    send_at: sendAt ?? null,
  });
  if (error) console.error("[data_readiness] log error:", error.message);
}
