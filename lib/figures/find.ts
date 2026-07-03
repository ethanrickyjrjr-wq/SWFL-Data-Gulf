// lib/figures/find.ts
//
// Core of POST /api/figures/find (spec §5): allowlist → cache → lane-3 gap-fill →
// upsert into the shared sourced_figures store. A value is accepted ONLY when its
// digits appear verbatim in a returned cited_text from a real publisher URL
// (fillExternalPoint's moat). A miss is a miss — the caller renders an honest line
// plus a pointer to the real issuing source. Never throws.
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import {
  fillExternalPoint,
  makeDomainSearch,
  SEARCH_ALLOWED_DOMAINS,
  type ExternalPoint,
  type ExternalRequest,
} from "@/lib/assistant/gap-fill";
import { findGap, type MetricGapCoverage } from "./metric-gaps";
import { mapSourcedRows, type SourcedFigure, type SourcedRow } from "./sourced";

const TTL_DAYS = 30;
/** Global daily ceiling on COLD lookups (paid web-search calls), env-tunable. */
const DAILY_CAP = Number(process.env.FIGURES_FIND_DAILY_CAP ?? "25");

export type FindResult =
  | { ok: true; figure: SourcedFigure; cached: boolean }
  | { ok: false; reason: "not_allowed" | "unavailable" | "capped" }
  | { ok: false; reason: "not_found"; pointer: MetricGapCoverage };

export interface FindDeps {
  db?: ReturnType<typeof createServiceRoleClient>;
  fill?: (req: ExternalRequest) => Promise<ExternalPoint | null>;
  now?: () => Date;
}

const SELECT_COLS =
  "metric_key, label, value_num, value_text, unit, source_name, source_url, as_of";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function findFigure(
  zip: string,
  metricKey: string,
  deps: FindDeps = {},
): Promise<FindResult> {
  const gap = findGap(metricKey, zip);
  if (!gap) return { ok: false, reason: "not_allowed" };

  let db: NonNullable<FindDeps["db"]>;
  try {
    db = deps.db ?? createServiceRoleClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const now = deps.now ? deps.now() : new Date();

  // 1. Cache — an unexpired stored figure is returned to everyone, no live call.
  try {
    const { data } = await db
      .from("sourced_figures")
      .select(SELECT_COLS)
      .eq("scope_kind", "zip")
      .eq("scope_key", zip)
      .eq("metric_key", metricKey)
      .gt("expires_at", now.toISOString())
      .maybeSingle();
    if (data) {
      const [figure] = mapSourcedRows([data as unknown as SourcedRow]);
      if (figure) return { ok: true, figure, cached: true };
    }
  } catch {
    /* fall through to the cold path */
  }

  // 2. Global daily cap on cold (paid) lookups — count today's stored rows.
  try {
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
    const { count } = await db
      .from("sourced_figures")
      .select("id", { count: "exact", head: true })
      .gte("fetched_at", dayStart);
    if ((count ?? 0) >= DAILY_CAP) return { ok: false, reason: "capped" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  // 3. Cold: lane-3 gap-fill over the default domains + the issuing city's own.
  const fill =
    deps.fill ??
    ((req: ExternalRequest) =>
      fillExternalPoint(req, {
        search: makeDomainSearch([...SEARCH_ALLOWED_DOMAINS, ...gap.extra_domains]),
      }));
  let point: ExternalPoint | null = null;
  try {
    point = await fill({ label: gap.label(zip), search_query: gap.search_query(zip) });
  } catch {
    point = null;
  }
  if (!point) return { ok: false, reason: "not_found", pointer: gap.coverage };

  // 4. Upsert so every consumer (page, assistant, builders) reads the SAME figure.
  const label = gap.label(zip);
  const valueText = point.value.toLocaleString("en-US");
  const sourceName = hostnameOf(point.url);
  try {
    await db.from("sourced_figures").upsert(
      {
        scope_kind: "zip",
        scope_key: zip,
        metric_key: metricKey,
        label,
        value_num: point.value,
        value_text: valueText,
        unit: null,
        source_name: sourceName,
        source_url: point.url,
        cited_text: point.cited_text.slice(0, 300),
        as_of: null,
        fetched_at: now.toISOString(),
        expires_at: new Date(now.getTime() + TTL_DAYS * 24 * 3600 * 1000).toISOString(),
        requested_from: "find-button",
      },
      { onConflict: "scope_kind,scope_key,metric_key" },
    );
  } catch {
    /* cache-write failure — the figure is still verified; return it anyway */
  }
  return {
    ok: true,
    cached: false,
    figure: { key: metricKey, label, value: valueText, source: sourceName, source_url: point.url },
  };
}
