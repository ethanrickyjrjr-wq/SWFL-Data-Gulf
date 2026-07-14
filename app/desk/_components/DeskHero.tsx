"use client";

import { useMemo, useState } from "react";
import { AreaChart, Area } from "@/components/charts/vendor/bklit/area-chart";
import { LineChart } from "@/components/charts/vendor/bklit/line-chart";
import { Line } from "@/components/charts/vendor/bklit/line";
import { Grid } from "@/components/charts/vendor/bklit/grid";
import { XAxis } from "@/components/charts/vendor/bklit/x-axis";
import { ChartTooltip } from "@/components/charts/vendor/bklit/tooltip";
import { ChartStatFlow } from "@/components/charts/vendor/bklit/chart-stat-flow";
import { FitGlow } from "@/components/charts/vendor/bklit/fit-glow";
import { hydrateOverlay, type FitLayer } from "@/lib/charts/fit-overlay";
import { rebaseFromFirst } from "@/lib/desk/mappers";
import type { HeroData } from "@/lib/desk/types";

const UP = "#5bc97a"; // mangrove
const DOWN = "#e08158"; // sunset-coral

/**
 * THE DATA'S OWN COLOUR, when a fitted trend is drawn behind it.
 *
 * The city palette and the trend palette COLLIDE. Fort Myers' colour is mangrove — the
 * exact green the fit uses to mean "climbing" — so its observed line and its fitted line
 * rendered in the same green and the claim became indistinguishable from the fact it was
 * drawn from. Naples' colour is neutral-gold, the same hue the fan uses to mean "no
 * direction can be read here."
 *
 * On a single-series chart the city colour carries NO information anyway — the tab already
 * says which city it is. The trend colour carries all of it. So when a fit is present the
 * observed series takes the constant data colour and the palette is free to mean what it
 * says. (The "% since start" tab plots three cities at once and keeps their colours; there
 * is no fit there, and nothing to collide with.)
 *
 * lib/charts/svg/fit-trend.ts pins its observed series the same way, for the same reason.
 */
const DATA = "#3DC9C0"; // gulf-teal
/** Matches lib/desk/loaders.ts REBASE_TRAILING_MONTHS — display copy only. */
const REBASE_MONTHS_LABEL = "year";

const usdFull = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const pct1 = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const months1 = (v: number) => `${v.toFixed(1)} mo`;

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
      (active?.trend?.points ?? active?.points ?? []).map((p) => ({
        date: new Date(`${p.date.slice(0, 10)}T00:00:00Z`),
        value: p.value,
      })),
    [active],
  );

  /**
   * The fit crosses the RSC boundary as ISO strings and is rehydrated here — the ONLY
   * thing that happens to it on the client. It is NOT rebuilt, and the client never
   * re-decides what may be drawn: a second copy of that branch is a second chance to
   * draw a line over a market the server just ruled directionless.
   *
   * The fit belongs to the series the chart is DRAWING. When `trend` is present the
   * chart draws that instead (a different series, a different unit) — so the fit is
   * withheld, because a price trend glowing behind a months-of-supply line is a lie
   * that would look completely convincing.
   */
  const fitLayers: FitLayer[] | null = useMemo(() => {
    if (!active?.fit || active.trend) return null;
    const o = hydrateOverlay(active.fit);
    return [o.long, o.current].filter((l): l is FitLayer => !!l);
  }, [active]);

  // The fit's palette only means something if the data isn't wearing it too. See DATA.
  const seriesColor = fitLayers ? DATA : (active?.color ?? DATA);

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
          {/* The live asking median and months of supply are STATED, not charted. Both
              are real and both belong on a price panel — but an area drawn under a
              dollar headline reads as that dollar figure, and months of supply is not
              a price. It is now said in the unit it is actually in. */}
          {[active.anchor, active.supply].filter(Boolean).map((d) => (
            <p key={d!.label} className="mt-2 font-mono text-[11px] text-gray-500">
              {d!.label}: <span className="text-gray-300">{d!.display}</span>
              {" · "}
              {d!.sourceLabel}
              {d!.asOf ? ` · as of ${d!.asOf}` : ""}
            </p>
          ))}
          <div className="mt-4">
            <AreaChart data={areaRows} xDataKey="date" aspectRatio="3 / 1">
              <Grid horizontal />
              {/* THE BACKLIT FIT — an underlay, so it paints BEHIND the series below.
                  What it draws (a line, a fan, or nothing) was decided on the server by
                  lib/charts/fit-overlay.ts; this renders it and decides nothing. */}
              {fitLayers ? <FitGlow layers={fitLayers} /> : null}
              <Area
                dataKey="value"
                stroke={seriesColor}
                fill={seriesColor}
                fillOpacity={fitLayers ? 0.14 : 0.35}
              />
              <XAxis />
              <ChartTooltip
                rows={(point) => [
                  {
                    color: seriesColor,
                    label: active.trend?.label ?? active.label,
                    value: active.trend
                      ? months1(typeof point.value === "number" ? point.value : 0)
                      : usdFull(typeof point.value === "number" ? point.value : 0),
                  },
                ]}
              />
            </AreaChart>
          </div>
          {active.trend ? (
            <p className="mt-2 text-[11px] text-gray-500">
              {active.trend.label} — monthly, {active.trend.sourceLabel}
            </p>
          ) : null}
          {/* THE TREND READ — and it ships as a PAIR or not at all. The claim without
              its falsifier is an [INFERENCE] with nothing staked on it, which the rules
              of engagement forbid; the engine computes both, so neither is optional. */}
          {active.fit && fitLayers ? (
            <div className="mt-3 border-l-2 border-[#22414f] pl-3">
              <p className="text-[13px] leading-5 text-gray-300">
                <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-500">
                  [inference]
                </span>
                {active.fit.claim}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-gray-500">{active.fit.falsifier}</p>
            </div>
          ) : null}
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
