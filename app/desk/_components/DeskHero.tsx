"use client";

import { useMemo, useState } from "react";
import { AreaChart, Area } from "@/components/charts/vendor/bklit/area-chart";
import { LineChart } from "@/components/charts/vendor/bklit/line-chart";
import { Line } from "@/components/charts/vendor/bklit/line";
import { Grid } from "@/components/charts/vendor/bklit/grid";
import { XAxis } from "@/components/charts/vendor/bklit/x-axis";
import { ChartTooltip } from "@/components/charts/vendor/bklit/tooltip";
import { ChartStatFlow } from "@/components/charts/vendor/bklit/chart-stat-flow";
import { rebaseFromFirst } from "@/lib/desk/mappers";
import type { HeroData } from "@/lib/desk/types";

const UP = "#5bc97a"; // mangrove
const DOWN = "#e08158"; // sunset-coral
/** Matches lib/desk/loaders.ts REBASE_TRAILING_MONTHS — display copy only. */
const REBASE_MONTHS_LABEL = "year";

const usdFull = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const pct1 = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/**
 * Hero — big count-up price over a gradient area of the same series. Tabs pick
 * a city; the last tab rebases all three to % change from the comparison
 * window's first reading. That window is `hero.rebase` (a full trailing year
 * of monthly sold prices) when the daily asking lane is too new to trend on
 * its own — never the 2-day asking series itself. All values arrive SSR'd
 * from the server; NumberFlow only animates what the server already rendered.
 */
export function DeskHero({ hero }: { hero: HeroData }) {
  const [tab, setTab] = useState<string>(hero.cities[0]?.key ?? "rebased");
  const active = hero.cities.find((c) => c.key === tab);

  const areaRows = useMemo(
    () =>
      (active?.points ?? []).map((p) => ({
        date: new Date(`${p.date.slice(0, 10)}T00:00:00Z`),
        value: p.value,
      })),
    [active],
  );

  const rebaseCities = hero.rebase?.cities ?? hero.cities;

  const rebasedRows = useMemo(() => {
    if (rebaseCities.length === 0) return [];
    const perCity = rebaseCities.map((c) => ({
      key: c.key,
      series: rebaseFromFirst(c.points.map((p) => ({ period: p.date, value: p.value }))),
    }));
    const byDate = new Map<string, Record<string, unknown>>();
    for (const { key, series } of perCity) {
      for (const p of series) {
        const iso = p.period.slice(0, 10);
        const row = byDate.get(iso) ?? { date: new Date(`${iso}T00:00:00Z`) };
        row[key] = p.value;
        byDate.set(iso, row);
      }
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
  }, [rebaseCities]);

  if (hero.cities.length === 0) return null;

  return (
    <div>
      <div
        className="mb-4 flex flex-wrap items-center gap-1"
        role="tablist"
        aria-label="Hero series"
      >
        {hero.cities.map((c) => (
          <button
            key={c.key}
            role="tab"
            aria-selected={tab === c.key}
            onClick={() => setTab(c.key)}
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
              tab === c.key
                ? "border-gulf-teal/50 bg-gulf-teal/10 text-gulf-teal"
                : "border-[#22414f] text-gray-500 hover:text-gray-300"
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          role="tab"
          aria-selected={tab === "rebased"}
          onClick={() => setTab("rebased")}
          className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
            tab === "rebased"
              ? "border-gulf-teal/50 bg-gulf-teal/10 text-gulf-teal"
              : "border-[#22414f] text-gray-500 hover:text-gray-300"
          }`}
        >
          {hero.rebase ? `% over the ${REBASE_MONTHS_LABEL}` : "% since start"}
        </button>
      </div>

      {active ? (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-500">{active.latest.label}</h3>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="flex flex-col">
              <ChartStatFlow
                value={active.latest.value}
                label={`${active.latest.sourceLabel}${active.latest.asOf ? ` · as of ${active.latest.asOf}` : ""}`}
                prefix="$"
                valueClassName="text-4xl sm:text-5xl font-bold tracking-tight"
                labelClassName="text-[11px] text-gray-500 font-mono"
              />
            </span>
            {active.latest.direction && active.latest.direction !== "flat" ? (
              <span
                className="font-mono text-sm tabular-nums"
                style={{ color: active.latest.direction === "up" ? UP : DOWN }}
              >
                {active.latest.direction === "up" ? "▲" : "▼"} {active.latest.deltaDisplay}
                {active.latest.deltaNote ? (
                  <span className="ml-1 text-gray-500">{active.latest.deltaNote}</span>
                ) : null}
              </span>
            ) : null}
          </div>
          {active.anchor ? (
            <p className="mt-2 font-mono text-[11px] text-gray-500">
              {active.anchor.label}: <span className="text-gray-300">{active.anchor.display}</span>
              {" · "}
              {active.anchor.sourceLabel}
              {active.anchor.asOf ? ` · as of ${active.anchor.asOf}` : ""}
            </p>
          ) : null}
          <div className="mt-4">
            <AreaChart data={areaRows} xDataKey="date" aspectRatio="3 / 1">
              <Grid horizontal />
              <Area dataKey="value" stroke={active.color} fill={active.color} fillOpacity={0.35} />
              <XAxis />
              <ChartTooltip
                rows={(point) => [
                  {
                    color: active.color,
                    label: active.label,
                    value: usdFull(typeof point.value === "number" ? point.value : 0),
                  },
                ]}
              />
            </AreaChart>
          </div>
        </div>
      ) : (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-500">
            {hero.rebase
              ? `Change over the trailing ${REBASE_MONTHS_LABEL} — all three cities`
              : `Change since ${hero.windowNote.toLowerCase().includes("monthly") ? "the window opened" : "day 0"} — all three cities`}
          </h3>
          <div className="mt-4">
            <LineChart data={rebasedRows} xDataKey="date" aspectRatio="3 / 1">
              <Grid horizontal />
              {rebaseCities.map((c) => (
                <Line key={c.key} dataKey={c.key} stroke={c.color} strokeWidth={2} />
              ))}
              <XAxis />
              <ChartTooltip
                rows={(point) =>
                  rebaseCities.map((c) => ({
                    color: c.color,
                    label: c.label,
                    value: pct1(typeof point[c.key] === "number" ? (point[c.key] as number) : 0),
                  }))
                }
              />
            </LineChart>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">
        {tab === "rebased" ? (hero.rebase?.windowNote ?? hero.windowNote) : hero.windowNote}
      </p>
    </div>
  );
}
