import "./zip-report.css";
import { notFound } from "next/navigation";
import { resolveZip } from "../../../../refinery/lib/zip-resolver.mts";
import type { LocationInput } from "../../../../refinery/lib/location-resolver.mts";
import type { Grain } from "../../../../refinery/lib/zip-resolver.mts";
import { resolveGradeConfig, type DirectionPolarity } from "../../../../refinery/vocab/loader.mts";
import { loadParsedBrain } from "../../../../lib/fetch-brain";
import { assembleLocationDossier, selectDossierLines } from "../../../../lib/zip-dossier";
import type { LocationDossierLine } from "../../../../lib/zip-dossier";
import { identityForZip, didYouMeanBanner } from "../../../../lib/location-surface";
import {
  ReportShell,
  ReportHeader,
  ReportFooter,
  SectionTitle,
  Meta,
} from "../../_components/report-shell";
import { ReportHighlightBridge } from "../../../../components/highlighter/ReportHighlightBridge";
import { buildReportId } from "../../../../lib/highlighter/report-surface";
import { suggestionsForMetric } from "../../../../lib/highlighter/suggestions";
import type { MetricSuggestion } from "../../../../lib/highlighter/report-context-store";
import { highlighterUiEnabled } from "../../../../lib/highlighter/flag";
import { DataRow } from "../../_components/metrics-table";
import { ColorLegend } from "../../_components/color-legend";
import {
  LocationSearchBox,
  IdentityCard,
  DidYouMeanBanner,
  OutOfScopePanel,
} from "../../_components/location-ui";
import { CitationList } from "../../../../components/CitationList";
import type { SourceEntry } from "../../../../components/CitationList";
import { Breadcrumbs } from "@/components/nav/Breadcrumbs";
import { zipReportTrail } from "@/lib/nav/breadcrumbs";
import { asOfFromToken } from "../../../../lib/project/as-of";
import DigestSubscribe from "../../../../components/email/DigestSubscribe";
import { MetroAreaChart } from "../../../../components/charts";
import { SWFL_METRO_SERIES } from "../../../../lib/charts/series";
import { loadMetroTrend } from "../../../../lib/charts/load-metro-trend";
import { loadZipQuickSummary } from "../../../../lib/zip-summary/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ZIP = /^\d{5}$/;

interface PageProps {
  params: Promise<{ zip: string }>;
  searchParams: Promise<{ q?: string; matched?: string }>;
}

type SectionBucket = "city" | "county" | "swfl";

function grainBucket(grain: Grain): SectionBucket {
  if (grain === "city" || grain === "corridor") return "city";
  if (grain === "county") return "county";
  return "swfl"; // region, msa, national, state
}

function deltaForSlug(
  deltaSlug: string,
  delta: number | null | undefined,
  unitLabel: string,
): { text: string; polarity: DirectionPolarity; isUp: boolean } | null {
  if (delta == null || delta === 0) return null;
  const { direction_polarity } = resolveGradeConfig(deltaSlug);
  return {
    text: `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta)}${unitLabel}`,
    polarity: direction_polarity,
    isUp: delta > 0,
  };
}

export default async function ZipReportPage({ params, searchParams }: PageProps) {
  const { zip } = await params;
  if (!VALID_ZIP.test(zip)) notFound();
  const sp = await searchParams;

  const res = resolveZip(zip);
  if (!res.in_scope) {
    return (
      <ReportShell width="2xl">
        <ReportHeader title={`ZIP ${zip}`}>
          <div className="mt-5">
            <LocationSearchBox defaultValue={zip} />
          </div>
        </ReportHeader>
        <OutOfScopePanel query={zip} />
        <ReportFooter />
      </ReportShell>
    );
  }

  const loc: LocationInput = { kind: "zip", resolution: res };

  const [housing, env, permits, dossier, summary, metroTrend] = await Promise.all([
    loadParsedBrain("housing-swfl"),
    loadParsedBrain("env-swfl"),
    loadParsedBrain("permits-swfl"),
    assembleLocationDossier(loc),
    loadZipQuickSummary(zip),
    loadMetroTrend("zhvi_pivoted"),
  ]);

  // ── Housing ──────────────────────────────────────────────────────────────
  const housingTable = housing?.output.detail_tables?.find((t) => t.id === "housing_by_zip");
  const housingRow = housingTable?.rows.find((r) => r.key === zip);

  const price = housingRow?.cells["median_sale_price"] as number | undefined;
  const priceYoy = housingRow?.cells["median_sale_price_yoy_pct"] as number | null | undefined;
  const dom = housingRow?.cells["median_dom"] as number | undefined;
  const domYoy = housingRow?.cells["median_dom_yoy_days"] as number | null | undefined;
  const saleToList = housingRow?.cells["avg_sale_to_list_pct"] as number | null | undefined;
  const mos = housingRow?.cells["months_of_supply"] as number | null | undefined;
  const homesSold = housingRow?.cells["homes_sold"] as number | null | undefined;
  const inventory = housingRow?.cells["inventory"] as number | null | undefined;

  // ── Flood ─────────────────────────────────────────────────────────────────
  const floodMetric = env?.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_usd_per_insured_property`,
  );
  const rankMetric = env?.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_pct_swfl_rank`,
  );
  const hasFlood = floodMetric !== undefined && rankMetric !== undefined;
  const hasHousing = housingRow !== undefined && price !== undefined && dom !== undefined;

  const priceBadge = deltaForSlug("median_sale_price_yoy_pct", priceYoy, "% YoY");
  const domBadge = deltaForSlug("median_dom_yoy_days", domYoy, " days");
  const priceColor = priceBadge ? badgeColor(priceBadge.polarity, priceBadge.isUp) : undefined;
  const domColor = domBadge ? badgeColor(domBadge.polarity, domBadge.isUp) : undefined;

  const aal = hasFlood ? ((floodMetric as NonNullable<typeof floodMetric>).value as number) : 0;
  const rank = hasFlood
    ? Math.round((rankMetric as NonNullable<typeof rankMetric>).value as number)
    : 0;
  const floodSourceUrl = hasFlood
    ? (floodMetric as NonNullable<typeof floodMetric>).source.url
    : "";
  const floodSourceCitation = hasFlood
    ? (floodMetric as NonNullable<typeof floodMetric>).source.citation
    : "";

  // ── Permits (Lee county, per-ZIP) ─────────────────────────────────────────
  const permitsTable = permits?.output.detail_tables?.find((t) => t.id === "permits_by_zip");
  const permitsRows = permitsTable?.rows.filter((r) => r.key === zip) ?? [];
  const permitsCount = permitsRows.reduce((acc, r) => {
    const n = r.cells["n_current"];
    return acc + (typeof n === "number" ? n : 0);
  }, 0);
  const hasPermits = permitsRows.length > 0 && permitsCount > 0;
  const permitsSourceUrl = hasPermits ? (permitsTable?.source.url ?? "") : "";
  const permitsSourceCitation = hasPermits
    ? (permitsTable?.source.citation ?? "Lee County permits")
    : "";

  // Z-score bar for permit activity (maps -3…+3 → 0…100%)
  const permitsZipMetrics =
    permits?.output.key_metrics.filter((m) => m.metric.startsWith(`permits_lee_zip_${zip}_`)) ?? [];
  const avgPermitsZ =
    permitsZipMetrics.length > 0
      ? permitsZipMetrics.reduce((sum, m) => sum + (typeof m.value === "number" ? m.value : 0), 0) /
        permitsZipMetrics.length
      : null;
  const permitsBarPct =
    avgPermitsZ !== null
      ? Math.min(100, Math.max(0, ((avgPermitsZ + 3) / 6) * 100)).toFixed(1)
      : null;

  // ── Identity and did-you-mean ─────────────────────────────────────────────
  const identity = identityForZip(res);
  const didYouMean = didYouMeanBanner(sp.q, sp.matched);

  const primaryPlace =
    (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null;
  const headerTitle = primaryPlace ? `${primaryPlace} (ZIP ${zip})` : `ZIP ${zip}`;
  const cityAreaTitle = primaryPlace ? `${primaryPlace} Area` : "Local Area";
  const countyTitle = res.county_names[0] ? `${res.county_names[0]} County` : "County";

  // ── Dossier lines bucketed into three sections ────────────────────────────
  const rollupLines: LocationDossierLine[] = selectDossierLines(dossier.lines, 2).filter(
    (l) => !l.is_true_zip,
  );
  const cityLines = rollupLines.filter((l) => grainBucket(l.grain) === "city");
  const countyLines = rollupLines.filter((l) => grainBucket(l.grain) === "county");
  const swflLines = rollupLines.filter((l) => grainBucket(l.grain) === "swfl");

  // ── Citations (all sources for the bottom accordion) ─────────────────────
  const sources: SourceEntry[] = [];
  if (hasFlood && floodSourceUrl) {
    sources.push({ label: floodSourceCitation || "FEMA NFIP", url: floodSourceUrl });
  }
  if (hasPermits && permitsSourceUrl) {
    sources.push({ label: permitsSourceCitation, url: permitsSourceUrl });
  }
  for (const l of rollupLines) {
    if (l.source_url) {
      sources.push({ label: l.source_citation || l.brain_id, url: l.source_url });
    }
  }
  for (const fig of summary.figures) {
    if (fig.source_url) {
      sources.push({ label: fig.source_label, url: fig.source_url });
    }
  }

  // ── Freshness token — internal only; as-of shown once, MM/DD/YYYY ─────────
  const freshnessToken =
    housing?.freshness_token ?? env?.freshness_token ?? Object.values(dossier.freshness_tokens)[0];
  const asOf = asOfFromToken(freshnessToken);

  const highlighterEnabled = highlighterUiEnabled();

  // ── Per-metric highlighter suggestions ───────────────────────────────────
  const metricSuggestions: MetricSuggestion[] = [];
  if (hasHousing) {
    const housingMetric = (label: string, value: string): MetricSuggestion => ({
      label,
      suggestions: suggestionsForMetric({ metric: label.toLowerCase(), value }, "housing-swfl"),
      value,
      freshnessToken,
    });
    metricSuggestions.push(
      housingMetric("Median sale price", `$${(price as number).toLocaleString()}`),
      housingMetric("Days on market", String(dom)),
    );
    if (saleToList != null)
      metricSuggestions.push(housingMetric("Sale-to-list ratio", `${saleToList}%`));
    if (mos != null) metricSuggestions.push(housingMetric("Months of supply", String(mos)));
    if (homesSold != null)
      metricSuggestions.push(housingMetric("Homes sold (90d)", String(homesSold)));
    if (inventory != null)
      metricSuggestions.push(housingMetric("Active inventory", String(inventory)));
  }
  if (hasFlood) {
    const floodProvenance = {
      sourceUrl: floodSourceUrl,
      sourceLabel: floodSourceCitation || "FEMA NFIP",
      freshnessToken,
    };
    metricSuggestions.push(
      {
        label: "Avg Annual Loss",
        suggestions: suggestionsForMetric({ metric: "avg annual loss", value: aal }, "env-swfl"),
        value: `$${aal.toLocaleString(undefined, { maximumFractionDigits: 0 })} / yr per insured property`,
        ...floodProvenance,
      },
      {
        label: "SWFL percentile rank",
        suggestions: suggestionsForMetric(
          { metric: "SWFL percentile rank", value: rank },
          "env-swfl",
        ),
        value: `${rank}th`,
        ...floodProvenance,
      },
    );
  }

  // NOTE: the ZIP choropleth map is intentionally NOT rendered here yet — the served
  // contractor map (/maps/lee-collier.svg) still welds Fort Myers Beach (33931) to the
  // mainland. Do not put a geographically-wrong map on a client-facing report.
  // The builder + ZipChoropleth are ready; re-add once the corrected SVG lands.

  const pageContent = (
    <>
      <Breadcrumbs trail={zipReportTrail(primaryPlace, zip)} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <ReportHeader title={headerTitle}>
        <dl className="mt-4 flex flex-wrap gap-5 text-sm">
          {asOf && <Meta label="As of" value={asOf} />}
        </dl>
        <div className="mt-5">
          <LocationSearchBox defaultValue={zip} />
        </div>
      </ReportHeader>

      {/* ── Identity ────────────────────────────────────────────────────── */}
      <IdentityCard identity={identity} />
      {didYouMean && <DidYouMeanBanner message={didYouMean} />}

      {/* ── Top stat bar (3 headline figures) ───────────────────────────── */}
      {(hasFlood || hasHousing || hasPermits) && (
        <div className="zr-stats-bar">
          <div className="zr-stat-cell">
            <p className="zr-stat-label">Avg Annual Loss</p>
            <p className="zr-stat-value">
              {hasFlood ? `$${aal.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
            </p>
            <p className="zr-stat-sub">per insured property / yr · flood</p>
          </div>
          <div className="zr-stat-cell">
            <p className="zr-stat-label">Median Home Value</p>
            <p className="zr-stat-value">
              {hasHousing ? `$${(price as number).toLocaleString()}` : "—"}
            </p>
            <p className="zr-stat-sub">90-day median sale price</p>
          </div>
          <div className="zr-stat-cell">
            <p className="zr-stat-label">New Permits (90d)</p>
            <p className="zr-stat-value">{hasPermits ? permitsCount.toLocaleString() : "—"}</p>
            <p className="zr-stat-sub">
              {hasPermits ? "Lee County building permits" : "Not available for this area"}
            </p>
          </div>
        </div>
      )}

      {/* ── At a glance — percentile bars ───────────────────────────────── */}
      {(hasFlood || (hasPermits && permitsBarPct !== null)) && (
        <section id="section-glance" className="mt-10">
          <SectionTitle>{zip} at a glance</SectionTitle>
          <div className="mt-4 rounded-xl glass-card-modern border border-white/10 px-6 py-2">
            {hasFlood && (
              <div className="zp-metric-block">
                <div className="zp-metric-header">
                  <span className="zp-metric-label">Flood Risk</span>
                  <span className="zp-metric-rank">{rank}th SWFL pct.</span>
                </div>
                <p className="zp-metric-value">
                  ${aal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="zp-metric-sublabel">avg annual loss per insured property</p>
                <div className="zp-bar-track">
                  <div className="zp-bar-fill zp-bar-fill--flood" style={{ width: `${rank}%` }} />
                </div>
                <span className="zp-percentile">
                  {rank}th percentile — higher = more flood-exposed
                </span>
              </div>
            )}
            {hasPermits && permitsBarPct !== null && (
              <div className="zp-metric-block">
                <div className="zp-metric-header">
                  <span className="zp-metric-label">Permit Activity</span>
                </div>
                <p className="zp-metric-value">{permitsCount.toLocaleString()}</p>
                <p className="zp-metric-sublabel">new permits in last 90 days (Lee County)</p>
                <div className="zp-bar-track">
                  <div
                    className="zp-bar-fill zp-bar-fill--permits"
                    style={{ width: `${permitsBarPct}%` }}
                  />
                </div>
                <span className="zp-percentile">activity relative to trailing-365d baseline</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Quick data summary (crawl-fed, Section A populates) ─────────── */}
      <section id="section-quick-summary" className="mt-10">
        <SectionTitle>Quick data summary of {zip}</SectionTitle>
        {summary.figures.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {summary.figures.map((fig) => (
              <div
                key={fig.key}
                className="rounded-xl glass-card-modern border border-white/10 px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {fig.label}
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-white">{fig.value}</p>
                {fig.as_of && <p className="mt-0.5 text-xs text-gray-500">as of {fig.as_of}</p>}
                <p className="mt-1 text-xs text-gray-600">{fig.source_label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm italic text-gray-500">
            Demographic summary is being populated — check back soon.
          </p>
        )}
      </section>

      {/* ── ZIP-Level: Housing + Flood ───────────────────────────────────── */}
      {(hasHousing || hasFlood) && (
        <section id="section-zip" className="mt-10">
          <SectionTitle>ZIP-Level Data</SectionTitle>

          {hasHousing && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                Housing Market
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">90-day window</p>
              <dl className="mt-3 divide-y divide-white/[0.06] rounded-xl glass-card-modern border border-white/10">
                <DataRow
                  label="Median sale price"
                  value={`$${(price as number).toLocaleString()}`}
                  badge={trendBadge(priceBadge)}
                  valueClassName={priceColor}
                />
                <DataRow
                  label="Days on market"
                  value={String(dom)}
                  badge={trendBadge(domBadge)}
                  valueClassName={domColor}
                />
                {saleToList != null && (
                  <DataRow label="Sale-to-list ratio" value={`${saleToList}%`} />
                )}
                {mos != null && <DataRow label="Months of supply" value={String(mos)} />}
                {homesSold != null && (
                  <DataRow label="Homes sold (90d)" value={String(homesSold)} />
                )}
                {inventory != null && (
                  <DataRow label="Active inventory" value={String(inventory)} />
                )}
              </dl>
            </div>
          )}

          {hasFlood && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                Flood Risk
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">NFIP 10-yr average annual loss</p>
              <dl className="mt-3 divide-y divide-white/[0.06] rounded-xl glass-card-modern border border-white/10">
                <DataRow
                  label="Avg Annual Loss"
                  value={`$${aal.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })} / yr per insured property`}
                />
                <DataRow label="SWFL percentile rank" value={`${rank}th`} />
              </dl>
            </div>
          )}
        </section>
      )}

      {/* ── City / Corridor Area ─────────────────────────────────────────── */}
      {cityLines.length > 0 && (
        <section id="section-city" className="mt-10">
          <SectionTitle>{cityAreaTitle}</SectionTitle>
          <div className="mt-4 space-y-3">
            {cityLines.map((l) => (
              <div
                key={l.brain_id}
                className="rounded-xl glass-card-modern border border-white/10 px-4 py-3"
              >
                <p className="text-sm leading-6 text-gray-200">{stripStatAnnotation(l.text)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── County ──────────────────────────────────────────────────────── */}
      {countyLines.length > 0 && (
        <section id="section-county" className="mt-10">
          <SectionTitle>{countyTitle}</SectionTitle>
          <div className="mt-4 space-y-3">
            {countyLines.map((l) => (
              <div
                key={l.brain_id}
                className="rounded-xl glass-card-modern border border-white/10 px-4 py-3"
              >
                <p className="text-sm leading-6 text-gray-200">{stripStatAnnotation(l.text)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Southwest Florida ───────────────────────────────────────────── */}
      {(swflLines.length > 0 || metroTrend.data.length > 0) && (
        <section id="section-swfl" className="mt-10">
          <SectionTitle>Southwest Florida</SectionTitle>
          {metroTrend.data.length > 0 && (
            <div className="mt-5">
              <MetroAreaChart
                data={metroTrend.data}
                series={SWFL_METRO_SERIES}
                variant="area"
                asOf={metroTrend.asOf}
                eyebrow="Southwest Florida"
                title="Median Home Value Trend"
                subtitle="Cape Coral · Fort Myers · Naples"
                valueFormat="usd"
                rootId="zip-report-zhvi"
              />
            </div>
          )}
          <div className="mt-4 space-y-3">
            {swflLines.map((l) => (
              <div
                key={l.brain_id}
                className="rounded-xl glass-card-modern border border-white/10 px-4 py-3"
              >
                <p className="text-sm leading-6 text-gray-200">{stripStatAnnotation(l.text)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Sources (one shared CitationList; collapsed by default) ──────── */}
      <CitationList sources={sources} />

      {/* ── Free digest capture ──────────────────────────────────────────── */}
      <div className="mt-10">
        <DigestSubscribe source="zip-report" />
      </div>

      <ColorLegend />

      <ReportFooter freshnessToken={freshnessToken} />

      {highlighterEnabled && (
        <ReportHighlightBridge
          reportId={buildReportId("zip", zip)}
          freshnessToken={freshnessToken}
          metricSuggestions={metricSuggestions}
        />
      )}
    </>
  );

  return <ReportShell width="2xl">{pageContent}</ReportShell>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function badgeColor(polarity: DirectionPolarity, isUp: boolean): string {
  if (polarity === "none") return "text-gray-400";
  if (polarity === "higher_is_bullish") {
    return isUp ? "text-[#5bc97a]" : "text-[#e08158]";
  }
  return isUp ? "text-[#e08158]" : "text-[#5bc97a]";
}

function trendBadge(b: { text: string; polarity: DirectionPolarity; isUp: boolean } | null) {
  if (!b) return null;
  return <span className={`font-sans text-xs ${badgeColor(b.polarity, b.isUp)}`}>{b.text}</span>;
}

function stripStatAnnotation(text: string): string {
  return text.replace(/\s*\([^()]*:\s*[^()]+\)\s*$/, "");
}
