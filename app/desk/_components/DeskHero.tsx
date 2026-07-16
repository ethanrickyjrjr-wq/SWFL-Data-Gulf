"use client";

import { useMemo, useState } from "react";
import { AreaChart, Area } from "@/components/charts/vendor/bklit/area-chart";
import { LineChart } from "@/components/charts/vendor/bklit/line-chart";
import { Line } from "@/components/charts/vendor/bklit/line";
import { Grid } from "@/components/charts/vendor/bklit/grid";
import { XAxis } from "@/components/charts/vendor/bklit/x-axis";
import { YAxis } from "@/components/charts/vendor/bklit/y-axis";
import { ChartTooltip } from "@/components/charts/vendor/bklit/tooltip";
import { ChartStatFlow } from "@/components/charts/vendor/bklit/chart-stat-flow";
import { FitGlow } from "@/components/charts/vendor/bklit/fit-glow";
import { hydrateOverlay, hydrateWindowLayer, type FitLayer } from "@/lib/charts/fit-overlay";
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

/**
 * Compact button labels for the window menu. The FULL label — the one that discloses the
 * ex-boom exclusion — rides in `title` and prints verbatim in the copy below the chart, so
 * the short form here shortens a button, never a disclosure.
 */
const WINDOW_LABEL: Record<string, string> = {
  full: "Full",
  "10y": "10 yr",
  "5y": "5 yr",
  "24m": "2 yr",
  "12m": "1 yr",
  // NOT "Ex-boom". That is our word, not a reader's — internal jargon on a button the
  // customer clicks, which the rules of engagement forbid in user-facing copy. It also
  // told them nothing: a reader who does not already know what we mean by "the boom"
  // cannot find out from the word "ex-boom".
  "ex-boom": "Without the 2021–22 run-up",
};

function WindowButton({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={title}
      className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${
        active
          ? "border-gulf-teal/50 bg-gulf-teal/10 text-gulf-teal"
          : "border-[#22414f] text-gray-500 hover:text-gray-300"
      }`}
    >
      {label}
    </button>
  );
}

const usdFull = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const pct1 = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const months1 = (v: number) => `${v.toFixed(1)} mo`;

/**
 * Redfin's "city" grain (redfin_city_swfl) tracks INCORPORATED CITY LIMITS, not the broader
 * mailing-address area a ZIP-code site would call "Naples" or "Fort Myers" — Naples' limits are
 * a small, wealthy coastal core, which is why its city-level median reads far above the wider
 * Naples market. Source: city-data.com (incorporated-city ZIP lists), verified live 07/14/2026.
 */
const CITY_ZIP_COVERAGE: Record<string, string> = {
  cape_coral: "33903, 33904, 33909, 33914, 33990, 33991",
  fort_myers: "33901, 33907, 33912, 33916, 33917, 33966",
  naples: "34101, 34102, 34103, 34104, 34105, 34112",
};

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

  /**
   * THE SELECTED WINDOW. `null` = the verdict view (the long run set against the last 24
   * months — the comparison the engine exists to make). Otherwise one row of the menu,
   * read on its own.
   */
  const [win, setWin] = useState<string | null>(null);
  // Memoized because `areaRows`/`fitLayers`/`zoomDomain` all depend on `picked`. Rebuilt
  // inline, these hand those hooks a fresh identity every render, the React Compiler cannot
  // preserve their memoization, and it bails out of optimizing the whole component.
  const menu = useMemo(
    () => (active?.trend ? [] : (active?.windows ?? [])),
    [active?.trend, active?.windows],
  );
  const picked = useMemo(() => menu.find((w) => w.window === win) ?? null, [menu, win]);

  const areaRows = useMemo(() => {
    const rows = (active?.trend?.points ?? active?.points ?? []).map((p) => ({
      date: new Date(`${p.date.slice(0, 10)}T00:00:00Z`),
      value: p.value,
    }));
    if (!picked) return rows;
    // ZOOM TO THE SELECTED WINDOW. This clips the VIEW, not the fit — the line was fitted
    // on the server over exactly these points, so the chart shows the data the fit saw and
    // nothing else. (`ex-boom` spans the full history, so it clips to everything: its fit
    // excluded 2021–22, but the DATA is never hidden. The label carries the exclusion.
    // That distinction is the bug this build already had to fix once.)
    const lo = new Date(picked.from).getTime();
    const hi = new Date(picked.to).getTime();
    return rows.filter((r) => r.date.getTime() >= lo && r.date.getTime() <= hi);
  }, [active, picked]);

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
    if (picked) return [hydrateWindowLayer(picked)];
    const o = hydrateOverlay(active.fit);
    return [o.long, o.current].filter((l): l is FitLayer => !!l);
  }, [active, picked]);

  /**
   * THE ZOOMED Y-DOMAIN — and the reason the zoomed view is a LINE, not an area.
   *
   * bklit gives any all-positive series a ZERO BASELINE. That is right for an area chart:
   * the fill's height IS the magnitude. It is ruinous for a zoomed price window — two years
   * of Cape Coral sits between $350k and $410k, so a real $1,201-a-month slide renders as a
   * FLAT LINE against a zero baseline. Zooming in to see the turn and being shown a flat
   * line is worse than not zooming at all.
   *
   * So a zoomed window truncates the axis — and takes on the obligation that comes with it.
   * A truncated axis is honest ONLY if the reader can see where it starts, so the zoomed
   * view drops the fill (an area whose base is not zero overstates every movement by the
   * height of the crop) and turns the Y LABELS ON. A line with a labelled axis is a normal
   * chart. An area on a cropped axis with no labels is the oldest lie in the business.
   */
  const zoomDomain: [number, number] | null = useMemo(() => {
    if (!picked || areaRows.length === 0) return null;
    const vals = areaRows.map((r) => r.value);
    // The fit must fit INSIDE the frame too, or the line we drew leaves the chart.
    const layer = hydrateWindowLayer(picked);
    for (const c of [layer.line, layer.fan?.hi, layer.fan?.lo]) {
      if (c) vals.push(c.from.y, c.to.y);
    }
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.12 || 1;
    return [lo - pad, hi + pad];
  }, [picked, areaRows]);

  /** THE HEADLINE FOLLOWS THE WINDOW. Every FIT OVER window ends at the latest
   *  reading, so the big number already IS the picked window's end value — what
   *  never moved was the delta beside it, stuck on the one-month change no
   *  matter the window (operator call 07/16/2026: the numbers up top must
   *  change with the zoom). When a window is picked, the delta becomes that
   *  window's ACTUAL change — last held reading minus the first held reading
   *  inside the window, never a fitted value. */
  const windowDelta = useMemo(() => {
    if (!picked || areaRows.length < 2) return null;
    const first = areaRows[0];
    const last = areaRows[areaRows.length - 1];
    const delta = last.value - first.value;
    const mdy = (d: Date) =>
      `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
    return {
      delta,
      display: `$${Math.abs(Math.round(delta)).toLocaleString("en-US")}`,
      range: `${mdy(first.date)} → ${mdy(last.date)}`,
    };
  }, [picked, areaRows]);

  /** The two sentences on screen ALWAYS describe the fit on screen. Never one window's
   *  line under another window's claim. */
  const read = picked
    ? { claim: picked.claim, falsifier: picked.falsifier }
    : active?.fit
      ? { claim: active.fit.claim, falsifier: active.fit.falsifier }
      : null;

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
            {windowDelta ? (
              <span
                className="font-mono text-sm tabular-nums"
                style={{ color: windowDelta.delta >= 0 ? UP : DOWN }}
              >
                {windowDelta.delta >= 0 ? "▲" : "▼"} {windowDelta.display}
                <span className="ml-1 text-gray-500">across this window · {windowDelta.range}</span>
              </span>
            ) : active.latest.direction && active.latest.direction !== "flat" ? (
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
            {zoomDomain ? (
              // ZOOMED: a LINE on a truncated, LABELLED axis. No fill — an area whose base
              // is not zero overstates every movement by the height of the crop.
              <LineChart data={areaRows} xDataKey="date" aspectRatio="3 / 1" yDomain={zoomDomain}>
                <Grid horizontal />
                {fitLayers ? <FitGlow layers={fitLayers} /> : null}
                <Line dataKey="value" stroke={seriesColor} strokeWidth={2} />
                <YAxis />
                <XAxis />
                <ChartTooltip
                  rows={(point) => [
                    {
                      color: seriesColor,
                      label: active.label,
                      value: usdFull(typeof point.value === "number" ? point.value : 0),
                    },
                  ]}
                />
              </LineChart>
            ) : (
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
            )}
          </div>
          {active.trend ? (
            <p className="mt-2 text-[11px] text-gray-500">
              {active.trend.label} — monthly, {active.trend.sourceLabel}
            </p>
          ) : null}
          {/* THE TREND READ — and it ships as a PAIR or not at all. The claim without
              its falsifier is an [INFERENCE] with nothing staked on it, which the rules
              of engagement forbid; the engine computes both, so neither is optional. */}
          {/* THE WINDOW MENU. Exactly the rows this city's series EARNED — the server already
              dropped every window whose label would outrun its data, and nothing here adds one
              back. Picking a row zooms the chart to that window and swaps in ITS fit and ITS
              two sentences, so the line on screen and the claim under it are always the same
              window. "Trend" is the comparison the engine was built to make. */}
          {menu.length > 0 ? (
            <div
              className="mt-3 flex flex-wrap items-center gap-1"
              role="tablist"
              aria-label="Fitted window"
            >
              <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-gray-600">
                Fit over
              </span>
              <WindowButton active={!picked} onClick={() => setWin(null)} label="Trend" />
              {menu.map((w) => (
                <WindowButton
                  key={w.window}
                  active={picked?.window === w.window}
                  onClick={() => setWin(w.window)}
                  label={WINDOW_LABEL[w.window] ?? w.window}
                  title={w.label}
                />
              ))}
            </div>
          ) : null}

          {read && fitLayers ? (
            <div className="mt-3 border-l-2 border-[#22414f] pl-3">
              <p className="text-[13px] leading-5 text-gray-300">
                <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-500">
                  [inference]
                </span>
                {read.claim}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-gray-500">{read.falsifier}</p>
              {/* WHY THIS WINDOW EXISTS. Only the run-up window carries one, and without it
                  a reader is handed an adjustment they cannot evaluate — "excluding the
                  2021–2022 run-up" with no reason reads as us hiding something. It also
                  says the excluded months are STILL ON THE CHART: only the fitted line
                  skips them, and nothing is ever removed from the picture. */}
              {picked?.note ? (
                <p className="mt-2 border-t border-[#22414f]/60 pt-2 text-[11px] leading-5 text-gray-500">
                  {picked.note}
                </p>
              ) : null}
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
      <p className="mt-1 text-[11px] text-gray-600">
        City limits, not the wider mailing area —{" "}
        {hero.cities.map((c) => `${c.label} ${CITY_ZIP_COVERAGE[c.key] ?? "n/a"}`).join(" · ")} —
        city-data.com
      </p>
    </div>
  );
}
