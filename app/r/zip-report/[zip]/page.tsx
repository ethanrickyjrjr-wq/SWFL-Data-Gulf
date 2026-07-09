import "./zip-report.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { openZipLab } from "@/lib/lab-entry/destination";
import { resolveZip } from "../../../../refinery/lib/zip-resolver.mts";
import type { LocationInput } from "../../../../refinery/lib/location-resolver.mts";
import type { Grain } from "../../../../refinery/lib/zip-resolver.mts";
import { loadParsedBrain } from "../../../../lib/fetch-brain";
import { buildRegistryTableMap } from "../../../../lib/zip-report/load-registry-tables";
import { rankSignals, type RankedSignal } from "../../../../lib/zip-report/signal-rank";
import {
  buildZipCandidates,
  loadCensusSignals,
  ZIP_METRIC_SOURCES,
  type CensusValue,
  type FloodZipRow,
} from "../../../../lib/zip-report/candidates";
import { getSourcedFigures } from "../../../../lib/figures/sourced";
import { FindItButton, type FoundFigure } from "../_components/find-it-button";
import { assembleLocationDossier, selectDossierLines } from "../../../../lib/zip-dossier";
import type { LocationDossierLine } from "../../../../lib/zip-dossier";
import { didYouMeanBanner } from "../../../../lib/location-surface";
import { extractZipShape } from "../../../../lib/map/extract-zip-shape";
import { ReportFooter, SectionTitle } from "../../_components/report-shell";
import { ReportHighlightBridge } from "../../../../components/highlighter/ReportHighlightBridge";
import { buildReportId } from "../../../../lib/highlighter/report-surface";
import { suggestionsForMetric } from "../../../../lib/highlighter/suggestions";
import type { MetricSuggestion } from "../../../../lib/highlighter/report-context-store";
import { highlighterUiEnabled } from "../../../../lib/highlighter/flag";
import { ColorLegend } from "../../_components/color-legend";
import {
  LocationSearchBox,
  DidYouMeanBanner,
  OutOfScopePanel,
} from "../../_components/location-ui";
import { CitationList } from "../../../../components/CitationList";
import type { SourceEntry } from "../../../../components/CitationList";
import { AnswerText } from "../../../../components/answer/AnswerText";
import { asOfFromToken } from "../../../../lib/project/as-of";
import { computeZipGradient, FLOOD_GRADIENT } from "../../../../lib/map/zip-color";
import DigestSubscribe from "../../../../components/email/DigestSubscribe";
import { MetroAreaChart } from "../../../../components/charts";
import { SWFL_METRO_SERIES } from "../../../../lib/charts/series";
import { loadMetroTrend } from "../../../../lib/charts/load-metro-trend";
import { loadZipQuickSummary } from "../../../../lib/zip-summary/load";
import { loadNarrative } from "../../../../lib/narratives/store";
import { NarrativeSections } from "../../../../components/narratives/NarrativeSections";
import { nearestZips } from "../../../../lib/geo/nearest-zips";
import { zipReportMetadata } from "./metadata";
import type { Metadata } from "next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ zip: string }>;
}): Promise<Metadata> {
  const { zip } = await params;
  return zipReportMetadata(zip);
}

const VALID_ZIP = /^\d{5}$/;

interface PageProps {
  params: Promise<{ zip: string }>;
  searchParams: Promise<{ q?: string; matched?: string; ref?: string }>;
}

type SectionBucket = "city" | "county" | "swfl";

function grainBucket(grain: Grain): SectionBucket {
  if (grain === "city" || grain === "corridor") return "city";
  if (grain === "county") return "county";
  return "swfl";
}

/** A ranked candidate's `key` -> the registry `concept` it won, so the rail can
 * look up `railContext` (keyed by concept) from a rendered signal's key. */
const RAIL_CONCEPT_BY_KEY: Record<string, string> = Object.fromEntries(
  ZIP_METRIC_SOURCES.filter((s) => s.role === "primary").map((s) => [s.key, s.concept]),
);

export default async function ZipReportPage({ params, searchParams }: PageProps) {
  const { zip } = await params;
  if (!VALID_ZIP.test(zip)) notFound();
  const sp = await searchParams;

  const res = resolveZip(zip);
  if (!res.in_scope) {
    return (
      <div className="min-h-dvh bg-navy-dark font-sans text-white">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <OutOfScopePanel query={zip} />
        </div>
      </div>
    );
  }

  const loc: LocationInput = { kind: "zip", resolution: res };

  const REGISTRY_PACK_IDS = [
    "housing-swfl",
    "home-values-swfl",
    "rentals-swfl",
    "active-rentals-swfl",
    "market-heat-swfl",
    "market-temperature-swfl",
    "listing-momentum-swfl",
    "seller-stress-swfl",
    "tier-divergence-swfl",
    "permits-commercial-swfl",
    "properties-collier-value",
  ] as const;

  const [
    registryBrains,
    env,
    permits,
    dossier,
    summary,
    metroTrend,
    censusSignals,
    sourcedFigures,
    narrative,
  ] = await Promise.all([
    Promise.all(REGISTRY_PACK_IDS.map((id) => loadParsedBrain(id))).then(
      (brains) => new Map(REGISTRY_PACK_IDS.map((id, i) => [id, brains[i]])),
    ),
    loadParsedBrain("env-swfl"),
    loadParsedBrain("permits-swfl"),
    assembleLocationDossier(loc),
    loadZipQuickSummary(zip),
    loadMetroTrend("zhvi_pivoted"),
    loadCensusSignals(zip),
    getSourcedFigures({ kind: "zip", key: zip }),
    loadNarrative("zip", zip),
  ]);
  const housing = registryBrains.get("housing-swfl") ?? null;
  const registryTables = buildRegistryTableMap(registryBrains);

  // ── ZIP shape ─────────────────────────────────────────────────────────────
  const { svgMarkup, found: shapeFound } = extractZipShape(zip);

  // ── Housing display fields read directly off the brain; ranking now goes
  // through registryTables (populated above via buildRegistryTableMap). ──
  const housingRow = housing?.output.detail_tables
    ?.find((t) => t.id === "housing_by_zip")
    ?.rows.find((r) => r.key === zip);

  const price = housingRow?.cells["median_sale_price"] as number | undefined;
  const dom = housingRow?.cells["median_dom"] as number | undefined;
  const saleToList = housingRow?.cells["avg_sale_to_list_pct"] as number | null | undefined;
  const mos = housingRow?.cells["months_of_supply"] as number | null | undefined;
  const homesSold = housingRow?.cells["homes_sold"] as number | null | undefined;
  const inventory = housingRow?.cells["inventory"] as number | null | undefined;

  const hasHousing = housingRow !== undefined && price !== undefined && dom !== undefined;

  // ── Flood — flood_by_zip detail table first (all 57 ZIPs), key_metrics fallback ──
  const floodTable = env?.output.detail_tables?.find((t) => t.id === "flood_by_zip");
  const floodRows: FloodZipRow[] = (floodTable?.rows ?? [])
    .map((r) => ({
      zip: r.key,
      aal: r.cells["aal_usd_per_insured_property"] as number,
      pctRank: typeof r.cells["pct_rank"] === "number" ? (r.cells["pct_rank"] as number) : null,
    }))
    .filter((r) => typeof r.aal === "number" && Number.isFinite(r.aal));
  let floodForZip: FloodZipRow | null = floodRows.find((r) => r.zip === zip) ?? null;
  const floodMetric = env?.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_usd_per_insured_property`,
  );
  const rankMetric = env?.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_pct_swfl_rank`,
  );
  if (!floodForZip && floodMetric && rankMetric) {
    floodForZip = {
      zip,
      aal: floodMetric.value as number,
      pctRank: rankMetric.value as number,
    };
  }
  const hasFlood = floodForZip !== null;
  const floodSourceUrl = floodTable?.source.url ?? floodMetric?.source.url ?? "";
  const floodSourceCitation = floodTable?.source.citation ?? floodMetric?.source.citation ?? "";

  // ── Permits (unchanged aggregation; the builder decides covered vs gap) ──
  const permitsTable = permits?.output.detail_tables?.find((t) => t.id === "permits_by_zip");
  const permitsCountMap = new Map<string, number>();
  for (const r of permitsTable?.rows ?? []) {
    const n = r.cells["n_current"];
    if (typeof n === "number") {
      permitsCountMap.set(r.key, (permitsCountMap.get(r.key) ?? 0) + n);
    }
  }
  const permitsCount = permitsCountMap.get(zip) ?? 0;
  const hasPermits = permitsCount > 0;
  const permitsSourceUrl = hasPermits ? (permitsTable?.source.url ?? "") : "";
  const permitsSourceCitation = hasPermits
    ? (permitsTable?.source.citation ?? "Lee County permits")
    : "";

  // ── Candidate pool + deterministic ranking (spec §2) ──────────────────────
  const censusValues: CensusValue[] = summary.figures.flatMap((fig) => {
    const value = censusSignals.numericByKey.get(fig.key);
    if (value === undefined) return [];
    return [
      {
        key: fig.key,
        label: fig.label,
        value,
        display: fig.value,
        sourceLabel: fig.source_label,
        sourceUrl: fig.source_url,
      },
    ];
  });
  const { candidates, gaps, railContext } = buildZipCandidates({
    zip,
    registryTables,
    floodRows,
    floodForZip,
    floodSource: floodSourceUrl
      ? { label: floodSourceCitation || "FEMA NFIP", url: floodSourceUrl }
      : undefined,
    permitsCounts: permitsCountMap,
    permitsSource: permitsSourceUrl
      ? { label: permitsSourceCitation, url: permitsSourceUrl }
      : undefined,
    censusValues,
    censusDistribution: censusSignals.distribution,
  });
  const ranked = rankSignals(candidates);
  const heroSignals = ranked.slice(0, 3);
  const gridSignals = ranked.slice(3);
  const sourcedByKey = new Map(sourcedFigures.map((f) => [f.key, f]));

  // ── Fill color — same gradient as homepage MapCanvas, using live AAL from env-swfl ─
  const fillColor = computeZipGradient(
    hasFlood ? (floodForZip as FloodZipRow).aal : undefined,
    FLOOD_GRADIENT.low,
    FLOOD_GRADIENT.high,
    FLOOD_GRADIENT.c0,
    FLOOD_GRADIENT.c1,
    FLOOD_GRADIENT.c2,
  );

  // ── Identity ──────────────────────────────────────────────────────────────
  const didYouMean = didYouMeanBanner(sp.q, sp.matched);
  const primaryPlace =
    (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null;
  const nearby = nearestZips(zip, 5);
  const cityAreaTitle = primaryPlace ? `${primaryPlace} Area` : "Local Area";
  const countyTitle = res.county_names[0] ? `${res.county_names[0]} County` : "County";
  const eyebrow = `SWFL Data Gulf · ${res.county_names.join(" & ")}`;

  // ── Dossier buckets ───────────────────────────────────────────────────────
  const rollupLines: LocationDossierLine[] = selectDossierLines(dossier.lines, 2).filter(
    (l) => !l.is_true_zip,
  );
  const cityLines = rollupLines.filter((l) => grainBucket(l.grain) === "city");
  const countyLines = rollupLines.filter((l) => grainBucket(l.grain) === "county");
  const swflLines = rollupLines.filter((l) => grainBucket(l.grain) === "swfl");

  // ── Citations ─────────────────────────────────────────────────────────────
  const sources: SourceEntry[] = [];
  if (hasFlood && floodSourceUrl)
    sources.push({ label: floodSourceCitation || "FEMA NFIP", url: floodSourceUrl });
  if (hasPermits && permitsSourceUrl)
    sources.push({ label: permitsSourceCitation, url: permitsSourceUrl });
  for (const l of rollupLines) {
    if (l.source_url) sources.push({ label: l.source_citation || l.brain_id, url: l.source_url });
  }
  for (const fig of summary.figures) {
    if (fig.source_url) sources.push({ label: fig.source_label, url: fig.source_url });
  }
  for (const f of sourcedFigures) {
    sources.push({ label: f.source, url: f.source_url });
  }
  // Demoted "also reported" alternates: their source rides the closed Sources
  // accordion below (deduped by clean-url), NOT an inline rail link — operator
  // ruling 07/03/2026: source links collapse into the closed box, no rail sprawl.
  for (const s of [...heroSignals, ...gridSignals]) {
    const demotedForKey = railContext.get(RAIL_CONCEPT_BY_KEY[s.key] ?? "");
    if (demotedForKey)
      for (const d of demotedForKey)
        if (d.sourceUrl) sources.push({ label: d.sourceLabel, url: d.sourceUrl });
  }

  // ── Freshness ─────────────────────────────────────────────────────────────
  const freshnessToken =
    housing?.freshness_token ?? env?.freshness_token ?? Object.values(dossier.freshness_tokens)[0];
  const asOf = asOfFromToken(freshnessToken);

  const highlighterEnabled = highlighterUiEnabled();

  // ── Metric suggestions ────────────────────────────────────────────────────
  const metricSuggestions: MetricSuggestion[] = [];
  if (hasHousing) {
    const hm = (label: string, value: string): MetricSuggestion => ({
      label,
      suggestions: suggestionsForMetric({ metric: label.toLowerCase(), value }, "housing-swfl"),
      value,
      freshnessToken,
    });
    metricSuggestions.push(
      hm("Median sale price", `$${(price as number).toLocaleString()}`),
      hm("Days on market", String(dom)),
    );
    if (saleToList != null) metricSuggestions.push(hm("Sale-to-list ratio", `${saleToList}%`));
    if (mos != null) metricSuggestions.push(hm("Months of supply", String(mos)));
    if (homesSold != null) metricSuggestions.push(hm("Homes sold (90 days)", String(homesSold)));
    if (inventory != null) metricSuggestions.push(hm("Active inventory", String(inventory)));
  }
  if (hasFlood && floodForZip) {
    const aalVal = floodForZip.aal;
    const floodPctVal = floodForZip.pctRank != null ? Math.round(floodForZip.pctRank) : null;
    const fp = {
      sourceUrl: floodSourceUrl,
      sourceLabel: floodSourceCitation || "FEMA NFIP",
      freshnessToken,
    };
    metricSuggestions.push({
      label: "Avg Annual Loss",
      suggestions: suggestionsForMetric({ metric: "avg annual loss", value: aalVal }, "env-swfl"),
      value: `$${aalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })} / yr`,
      ...fp,
    });
    if (floodPctVal !== null) {
      metricSuggestions.push({
        label: "SWFL percentile rank",
        suggestions: suggestionsForMetric(
          { metric: "SWFL percentile rank", value: floodPctVal },
          "env-swfl",
        ),
        value: `${floodPctVal}th`,
        ...fp,
      });
    }
  }

  return (
    <div className="min-h-dvh bg-navy-dark font-sans text-white">
      {/* ── Search bar ───────────────────────────────────────────────────── */}
      <div className="zr-search-bar">
        <LocationSearchBox defaultValue={zip} />
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="zp-hero">
        <div className="zp-hero-inner">
          {shapeFound ? (
            <div
              className="zp-shape-wrap"
              style={{ "--zip-fill": fillColor } as React.CSSProperties}
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          ) : (
            <div className="zp-shape-placeholder" />
          )}

          <div className="zp-identity">
            <Link href="/" className="zp-nav-back">
              ← Back
            </Link>
            <div className="zp-eyebrow">{eyebrow}</div>
            <div className="zp-number">{zip}</div>
            {primaryPlace && <div className="zp-name">{primaryPlace}</div>}
            {res.county_names[0] && (
              <div className="zp-county">{res.county_names[0]} County, Florida</div>
            )}
          </div>
        </div>
      </section>

      {/* ── HERO SIGNALS — this ZIP's top-3 ranked signals, each with its why ── */}
      {heroSignals.length > 0 && (
        <div className="zp-stats-bar">
          <div className="zp-stats-inner">
            {heroSignals.map((s) => (
              <div key={s.key} className="zp-stat-cell">
                <div className="zp-stat-label">{s.label}</div>
                <div className="zp-stat-value">{s.display}</div>
                {s.sub && <div className="zp-stat-sub">{s.sub}</div>}
                {s.why && <div className="zp-stat-tag">{s.why}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Baked narrative — ONE renderer root, additive (absent row = today's page) ── */}
      <NarrativeSections row={narrative} />

      {/* ── BODY: ranked grid (left) + context rail (right) — every number once ── */}
      <div className="zp-body">
        {/* Full-width title — its faint underline is the baseline the rail aligns to */}
        <div className="zp-breakdown-header">
          <h1 className="zp-breakdown-title">{zip} in detail</h1>
        </div>

        {/* LEFT — every remaining held metric exactly once, ranked; gaps become Find-it */}
        <div className="zp-breakdown">
          {didYouMean && <DidYouMeanBanner message={didYouMean} />}

          <div className="grid gap-3 sm:grid-cols-2">
            {gridSignals.map((s) => (
              <SignalCard key={s.key} s={s} />
            ))}
            {gaps.map((g) => (
              <FindItButton
                key={g.metric_key}
                zip={zip}
                metricKey={g.metric_key}
                label={g.label}
                coverage={g.coverage}
                initialFigure={(sourcedByKey.get(g.metric_key) as FoundFigure | undefined) ?? null}
              />
            ))}
          </div>
        </div>

        {/* RIGHT — context & coverage card. No metric values here, ever. */}
        <aside className="zp-rail">
          <div className="zp-rail-header">
            <div className="zp-rail-metric-name">About This Page</div>
            <div className="zp-rail-sublabel">What leads and why</div>
          </div>
          <div className="zp-rail-zip-header">
            <div className="zp-rail-zip-code">{zip}</div>
            {primaryPlace && <div className="zp-rail-place">{primaryPlace}</div>}
            {res.county_names[0] && (
              <div className="zp-rail-county">{res.county_names[0]} County</div>
            )}
          </div>

          <p className="mt-4 text-xs leading-relaxed text-gray-400">
            The numbers up top are this area&apos;s strongest signals — ranked by how far they sit
            from the Southwest Florida middle and how fast they&apos;re moving. Everything else we
            hold is in the grid, each figure exactly once.
          </p>

          {asOf && <p className="mt-3 text-xs text-gray-500">As of {asOf}</p>}

          {gaps.map((g) => (
            <p key={g.metric_key} className="mt-3 text-xs leading-relaxed text-gray-500">
              {/* Coverage link removed from the rail (operator ruling 07/03/2026):
                  no inline source/coverage deep-links — the rail stays link-free. */}
              Building permits here are issued by the {g.coverage.name.replace(/ permitting$/, "")}{" "}
              — not the county feed our permit counts come from.
            </p>
          ))}

          {[...heroSignals, ...gridSignals]
            .flatMap((s) => {
              const demoted = railContext.get(RAIL_CONCEPT_BY_KEY[s.key] ?? "");
              return demoted ? demoted.map((d) => ({ winner: s, demoted: d })) : [];
            })
            .map(({ winner, demoted }) => (
              <p
                key={`${winner.key}:${demoted.label}`}
                className="mt-3 text-xs leading-relaxed text-gray-500"
              >
                {/* Source link removed from the rail (operator ruling 07/03/2026):
                    the citation rides the closed Sources accordion below, not an
                    inline deep-link. Plain source label kept for context. */}
                Also reported — {demoted.label}: {demoted.display} ({demoted.sourceLabel}).
              </p>
            ))}

          <div className="zp-rail-footer">Every figure is cited — sources listed below.</div>
        </aside>
      </div>

      {/* ── Below body: dossier + chart + citations ──────────────────────── */}
      <div className="mx-auto max-w-[1120px] px-10 pb-24 space-y-10">
        {/* ── City / Corridor Area ───────────────────────────────────────── */}
        {cityLines.length > 0 && (
          <section id="section-city">
            <SectionTitle>{cityAreaTitle}</SectionTitle>
            <div className="mt-4 space-y-3">
              {cityLines.map((l) => (
                <div
                  key={l.brain_id}
                  className="rounded-xl glass-card-modern border border-white/10 px-4 py-3"
                >
                  <p className="text-sm leading-6 text-gray-200">
                    <AnswerText text={stripStatAnnotation(l.text)} />
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── County ────────────────────────────────────────────────────── */}
        {countyLines.length > 0 && (
          <section id="section-county">
            <SectionTitle>{countyTitle}</SectionTitle>
            <div className="mt-4 space-y-3">
              {countyLines.map((l) => (
                <div
                  key={l.brain_id}
                  className="rounded-xl glass-card-modern border border-white/10 px-4 py-3"
                >
                  <p className="text-sm leading-6 text-gray-200">
                    <AnswerText text={stripStatAnnotation(l.text)} />
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Southwest Florida ─────────────────────────────────────────── */}
        {(swflLines.length > 0 || metroTrend.data.length > 0) && (
          <section id="section-swfl">
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
                  <p className="text-sm leading-6 text-gray-200">
                    <AnswerText text={stripStatAnnotation(l.text)} />
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <CitationList sources={sources} />

        {/* ── Nearby ZIPs — same report, one click away ─────────────────── */}
        {nearby.length > 0 && (
          <section id="section-nearby">
            <SectionTitle>Nearby ZIPs</SectionTitle>
            <div className="mt-4 flex flex-wrap gap-3">
              {nearby.map((n) => (
                <Link
                  key={n.zip}
                  href={`/r/zip-report/${n.zip}`}
                  className="rounded-xl glass-card-modern border border-white/10 px-4 py-3 transition-colors hover:border-teal-primary/40"
                >
                  <span className="font-mono text-sm font-semibold text-white">{n.zip}</span>
                  {n.place && <span className="ml-2 text-sm text-gray-400">{n.place}</span>}
                  <span className="ml-2 text-xs text-gray-600">{n.distanceMi} mi</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Build bridge — reader → branded weekly email project ────────── */}
        <section className="glass-card-modern rounded-2xl border border-teal-primary/20 p-6 sm:p-8">
          <h3 className="text-xl font-bold text-white">Turn this into a weekly branded email</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            Free to build. The lab opens with this page already laid out as an email for{" "}
            {primaryPlace ?? `ZIP ${zip}`}, {zip} — style it, then send it to yourself.
          </p>
          {/* Lab-first funnel (spec 07/03/2026): plain link, no claim token —
              auth happens inline at send time (SendToSelfModal). */}
          <a
            href={openZipLab(zip, { ref: typeof sp.ref === "string" && sp.ref ? sp.ref : null })}
            className="mt-4 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            Open it in the email lab →
          </a>
        </section>

        <div>
          <DigestSubscribe
            source="zip-report"
            presetZip={zip}
            endpoint="/api/weekly-read/subscribe"
            heading={`Subscribe to ${zip}'s weekly read`}
            blurb={`A short weekly market read for ${primaryPlace ?? `ZIP ${zip}`}, built and sent by our engine — see it before you build your own.`}
            doneMessage={`You're in — ${zip}'s next weekly read will land in your inbox.`}
          />
        </div>
        <ColorLegend />
        <ReportFooter freshnessToken={freshnessToken} />
      </div>

      {highlighterEnabled && (
        <ReportHighlightBridge
          reportId={buildReportId("zip", zip)}
          freshnessToken={freshnessToken}
          metricSuggestions={metricSuggestions}
        />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function SignalCard({ s }: { s: RankedSignal }) {
  return (
    <div className="rounded-xl glass-card-modern border border-white/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-white">{s.display}</p>
      {s.sub && <p className="mt-0.5 text-xs text-gray-500">{s.sub}</p>}
      {s.why && <p className="mt-1 text-xs text-teal-primary/80">{s.why}</p>}
      {s.movementText && s.movementText !== s.why && (
        <p className="mt-1 text-xs text-gray-400">{s.movementText}</p>
      )}
      {s.footnote && <p className="mt-1 text-xs text-gray-500 italic">{s.footnote}</p>}
    </div>
  );
}

function stripStatAnnotation(text: string): string {
  return text.replace(/\s*\([^()]*:\s*[^()]+\)\s*$/, "");
}
