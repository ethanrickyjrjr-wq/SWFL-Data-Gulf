"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerializedMetric {
  label: string;
  value: string;
  direction: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
}

type TabKey = "vacancy" | "absorption" | "rent";

interface ParsedMBMetric {
  city: string;
  metricType: TabKey;
  value: string;
  direction: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
}

// ---------------------------------------------------------------------------
// Direction color system — mirrors DIRECTION_CONFIG in metrics-table.tsx
// ---------------------------------------------------------------------------

const DIRECTION_CONFIG: Record<string, { label: string; className: string }> = {
  rising: { label: "↑ Rising", className: "text-[#5bc97a]" },
  bullish: { label: "↑ Bullish", className: "text-[#5bc97a]" },
  falling: { label: "↓ Falling", className: "text-[#e08158]" },
  bearish: { label: "↓ Bearish", className: "text-[#e08158]" },
  mixed: { label: "→ Mixed", className: "text-[#d4b370]" },
  stable: { label: "→ Stable", className: "text-[#b8b4a8]" },
  neutral: { label: "→ Neutral", className: "text-[#b8b4a8]" },
};

function directionClass(direction: string | null): string {
  if (!direction) return "text-[#00d4aa]";
  return DIRECTION_CONFIG[direction]?.className ?? "text-[#00d4aa]";
}

function DirectionBadge({ direction }: { direction: string | null }) {
  if (!direction) return <span className="text-[#807e76] text-xs">—</span>;
  const cfg = DIRECTION_CONFIG[direction];
  if (!cfg) return <span className="text-[#b8b4a8] text-xs">{direction}</span>;
  return <span className={`text-xs font-medium ${cfg.className}`}>{cfg.label}</span>;
}

function SourceLink({ url, label }: { url?: string | null; label?: string | null }) {
  if (!url) return null;
  const isInternal =
    url.includes("supabase.co") || url.startsWith("/") || url.includes("swfldatagulf.com");
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-[10px] font-medium underline-offset-2 hover:underline ${
        isInternal
          ? "text-[#00d4aa]/70 hover:text-[#00d4aa]"
          : "text-blue-400/70 hover:text-blue-400"
      }`}
    >
      {label || "Source"}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Label utilities
// ---------------------------------------------------------------------------

export function shortenCRELabel(label: string): string {
  const l = label.toLowerCase();
  const isMB = label.startsWith("MarketBeat");
  const tag = isMB ? " (MB)" : "";
  if (l.includes("cap rate") || l.includes("cap_rate")) return "Cap Rate";
  if (l.includes("vacancy")) return `Vacancy Rate${tag}`;
  if (l.includes("absorption")) return `Net Absorption${tag}`;
  if (l.includes("asking rent") || (l.includes("rent") && !l.includes("absorption")))
    return `Asking Rent NNN${tag}`;
  if (l.includes("factor")) return "Composite Factor";
  if (l.includes("pulse") || l.includes("signal")) return "Pulse Signals";
  if (l.includes("saturation")) return "Permit Saturation";
  return label.length > 22 ? label.slice(0, 22) + "…" : label;
}

export function parseMarketBeatLabel(label: string): { city: string; metricType: TabKey } | null {
  const l = label.toLowerCase();

  if (!label.startsWith("MarketBeat ")) return null;
  if (l.includes(" area ")) return null;
  if (l.includes("swfl")) return null;
  if (l.includes("industrial")) return null;
  if (l.includes("office")) return null;
  if (l.includes("retail")) return null;
  if (l.includes("flex")) return null;

  const withoutPrefix = label.slice("MarketBeat ".length);
  const withoutDate = withoutPrefix.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const wdLower = withoutDate.toLowerCase();

  let metricType: TabKey;
  let keyword: string;
  if (wdLower.includes("net absorption")) {
    metricType = "absorption";
    keyword = "net absorption";
  } else if (wdLower.includes("asking rent")) {
    metricType = "rent";
    keyword = "asking rent";
  } else if (wdLower.includes("vacancy rate")) {
    metricType = "vacancy";
    keyword = "vacancy rate";
  } else {
    return null;
  }

  const idx = wdLower.indexOf(keyword);
  if (idx <= 0) return null;
  const city = withoutDate.slice(0, idx).trim();
  if (!city) return null;

  return { city, metricType };
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TABS: { key: TabKey; label: string }[] = [
  { key: "vacancy", label: "Vacancy Rate" },
  { key: "absorption", label: "Net Absorption" },
  { key: "rent", label: "Asking Rent" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CoreStatCard({ metric }: { metric: SerializedMetric }) {
  const colorCls = directionClass(metric.direction);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 flex flex-col gap-1">
      <dt className="text-xs uppercase tracking-wider text-gray-400 leading-tight">
        {shortenCRELabel(metric.label)}
      </dt>
      <dd className={`font-mono text-lg font-semibold tabular-nums ${colorCls}`}>{metric.value}</dd>
      {metric.direction && (
        <div className="mt-0.5">
          <DirectionBadge direction={metric.direction} />
        </div>
      )}
      {metric.sourceUrl && (
        <div className="mt-1">
          <SourceLink url={metric.sourceUrl} label={metric.sourceLabel || "Source"} />
        </div>
      )}
    </div>
  );
}

function CityRow({
  city,
  value,
  direction,
  sourceUrl,
  sourceLabel,
}: {
  city: string;
  value: string;
  direction: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
}) {
  const colorCls = directionClass(direction);
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm border-b border-white/[0.06] last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-gray-300 font-medium">{city}</span>
        {sourceUrl && <SourceLink url={sourceUrl} label={sourceLabel || "Source"} />}
      </div>
      <div className="flex items-center gap-3 text-right shrink-0 ml-4">
        <span className={`font-mono text-sm tabular-nums ${colorCls}`}>{value}</span>
        <DirectionBadge direction={direction} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface CREKeyMetricsPanelProps {
  coreMetrics: SerializedMetric[];
  mbMetrics: SerializedMetric[];
}

export function CREKeyMetricsPanel({ coreMetrics, mbMetrics }: CREKeyMetricsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("vacancy");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  // Parse MB metrics once per render
  const parsed: ParsedMBMetric[] = [];
  for (const m of mbMetrics) {
    const p = parseMarketBeatLabel(m.label);
    if (!p) continue;
    parsed.push({
      ...p,
      value: m.value,
      direction: m.direction,
      sourceUrl: m.sourceUrl,
      sourceLabel: m.sourceLabel,
    });
  }

  const allCities = Array.from(new Set(parsed.map((p) => p.city))).sort((a, b) =>
    a.localeCompare(b),
  );

  const visibleRows = parsed
    .filter((p) => p.metricType === activeTab)
    .filter((p) => selectedCity === null || p.city === selectedCity)
    .sort((a, b) => a.city.localeCompare(b.city));

  function handleCityPill(city: string) {
    setSelectedCity((prev) => (prev === city ? null : city));
  }

  return (
    <div className="mt-6 space-y-6">
      {/* ── Corridor Summary stat grid ── */}
      {coreMetrics.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Corridor Summary
          </h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {coreMetrics.map((m, i) => (
              <CoreStatCard key={i} metric={m} />
            ))}
          </dl>
        </section>
      )}

      {/* ── MarketBeat city grid ── */}
      {parsed.length > 0 && (
        <section className="rounded-xl glass-card-modern border border-white/10 overflow-hidden">
          {/* Header + tabs */}
          <div className="px-4 pt-4 pb-0 border-b border-white/10">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              MarketBeat by City
            </h3>
            <div role="tablist" aria-label="MarketBeat metric type" className="flex gap-0">
              {TABS.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.key)}
                    className={[
                      "px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00d4aa]",
                      isActive
                        ? "border-b-2 border-[#00d4aa] text-[#00d4aa]"
                        : "border-b-2 border-transparent text-gray-400 hover:text-gray-200",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* City filter pills */}
          {allCities.length > 1 && (
            <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-white/[0.06]">
              <button
                onClick={() => setSelectedCity(null)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selectedCity === null
                    ? "border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa]"
                    : "border-white/20 bg-white/[0.04] text-gray-400 hover:text-gray-200 hover:border-white/30",
                ].join(" ")}
              >
                All
              </button>
              {allCities.map((city) => {
                const isActive = selectedCity === city;
                return (
                  <button
                    key={city}
                    onClick={() => handleCityPill(city)}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa]"
                        : "border-white/20 bg-white/[0.04] text-gray-400 hover:text-gray-200 hover:border-white/30",
                    ].join(" ")}
                  >
                    {city}
                  </button>
                );
              })}
            </div>
          )}

          {/* City rows */}
          <div role="tabpanel">
            {visibleRows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">
                No data for this selection.
              </p>
            ) : (
              visibleRows.map((row, i) => (
                <CityRow
                  key={`${row.city}-${i}`}
                  city={row.city}
                  value={row.value}
                  direction={row.direction}
                  sourceUrl={row.sourceUrl}
                  sourceLabel={row.sourceLabel}
                />
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
