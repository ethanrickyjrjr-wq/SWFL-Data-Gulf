"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  METRIC_ORDER,
  NO_DATA_FILL,
  blendedT,
  rampColor,
  type HomeMapPayload,
  type MetricKey,
} from "@/lib/landing/home-map-types";

/**
 * Homepage hero — Lane B Phase 1 (specs: 2026-07-03-homepage-rebuild-design.md
 * + 2026-07-03-lab-first-funnel-landing-design.md).
 *
 * Live-lake choropleth (props-fed by lib/landing/load-home-map-data.ts — the
 * mock fixture only rides as its fail-soft fallback). Home Value is the first
 * map and wears the orange brand ramp; color position blends rank with
 * magnitude so decisive gaps pop (operator rulings 07/03/2026).
 *
 * MAP CLICK = THE ZIP REPORT (operator ruling 07/09/2026, spec
 * 2026-07-09-zip-page-destination-design.md — reverses the 07/03 lab-first
 * click): clicking any ZIP — map polygon or rail row — lands on
 * /r/zip-report/[zip]. The email lab stays one click away via that page's
 * build bridge. The contractor SVG is served from public/map/lee-collier.svg
 * and injected client-side.
 */

type Payload = Pick<HomeMapPayload, "data" | "badge" | "stats">;

const zipReportHref = (zip: string) => `/r/zip-report/${zip}`;

const fmt = (val: number, format: "currency" | "number") => {
  if (format === "currency") {
    if (val >= 1_000_000_000) return "$" + (val / 1_000_000_000).toFixed(1) + "B";
    if (val >= 1_000_000) return "$" + (val / 1_000_000).toFixed(2) + "M";
    if (val >= 1000) return "$" + Math.round(val / 1000) + "K";
    return "$" + val.toLocaleString("en-US");
  }
  return val.toLocaleString("en-US");
};

export default function Hero({ payload }: { payload: Payload }) {
  const { data, badge, stats } = payload;
  const router = useRouter();

  const availableMetrics = useMemo(
    () => METRIC_ORDER.filter((k) => data.metrics[k] !== undefined),
    [data.metrics],
  );
  const [metric, setMetric] = useState<MetricKey>(availableMetrics[0] ?? "value");
  const [svgReady, setSvgReady] = useState(false);

  const svgHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Imperative hover handlers are wired once at SVG injection; they read the
  // active metric through this ref so recoloring never rewires them.
  const metricRef = useRef<MetricKey>(metric);
  useEffect(() => {
    metricRef.current = metric;
  }, [metric]);

  const active = data.metrics[metric];

  /** Color position per ZIP: ½ rank + ½ log-magnitude (see home-map-types). */
  const activeT = useMemo(() => (active ? blendedT(active.data) : {}), [active]);

  /** Descending [zip, value] for the top-5 rail list. */
  const activeRanked = useMemo(
    () => (active ? Object.entries(active.data).sort((a, b) => b[1] - a[1]) : []),
    [active],
  );

  // ── SVG injection + per-ZIP wiring (once) ──
  useEffect(() => {
    const host = svgHostRef.current;
    if (!host) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const moveTip = (e: MouseEvent) => {
      const tip = tipRef.current;
      const canvas = canvasRef.current;
      if (!tip || !canvas) return;
      const r = canvas.getBoundingClientRect();
      let x = e.clientX - r.left + 14;
      let y = e.clientY - r.top + 14;
      if (x + 180 > r.width) x -= 200;
      if (y + 80 > r.height) y -= 90;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    };
    const showTip = (e: MouseEvent, zip: string) => {
      const tip = tipRef.current;
      if (!tip) return;
      const m = data.metrics[metricRef.current];
      const val = m?.data[zip];
      const set = (cls: string, text: string) => {
        const el = tip.querySelector<HTMLElement>(`.${cls}`);
        if (el) el.textContent = text;
      };
      set("tip-zip", zip);
      set("tip-place", data.placeNames[zip] || "");
      set("tip-val", m && val !== undefined ? fmt(val, m.format) : "N/A");
      set("tip-cta", "Click → full ZIP report");
      tip.style.opacity = "1";
      moveTip(e);
    };
    const hideTip = () => {
      if (tipRef.current) tipRef.current.style.opacity = "0";
    };

    fetch("/map/lee-collier.svg")
      .then((r) => r.text())
      .then((svgText) => {
        if (cancelled || !svgHostRef.current) return;
        host.innerHTML = svgText;
        host.querySelectorAll<SVGGElement>(".zip-group").forEach((g) => {
          g.setAttribute("tabindex", "0");
          g.setAttribute("role", "link");
          g.setAttribute(
            "aria-label",
            `${data.placeNames[g.id] || g.id} (${g.id}) — open the full ZIP report`,
          );
          const on = <K extends keyof HTMLElementEventMap>(
            type: K,
            fn: (e: HTMLElementEventMap[K]) => void,
          ) => {
            g.addEventListener(type, fn as EventListener);
            cleanups.push(() => g.removeEventListener(type, fn as EventListener));
          };
          on("mouseenter", (e) => showTip(e as MouseEvent, g.id));
          on("mousemove", (e) => moveTip(e as MouseEvent));
          on("mouseleave", hideTip);
          on("click", () => router.push(zipReportHref(g.id)));
          on("keydown", (e) => {
            const ke = e as KeyboardEvent;
            if (ke.key === "Enter" || ke.key === " ") {
              ke.preventDefault();
              router.push(zipReportHref(g.id));
            }
          });
        });

        // Clean edge cuts: Lee top cut (y=153, removes NFM) + Collier staircase
        // right. Pad 0.025 — the old 0.06 left a dead moat around the counties.
        const svg = host.querySelector("svg");
        if (svg) {
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", "100%");
          let bx0 = Infinity,
            by0 = Infinity,
            bx1 = -Infinity,
            by1 = -Infinity;
          host.querySelectorAll<SVGGElement>(".zip-group").forEach((g) => {
            try {
              const bb = g.getBBox();
              if (bb.width > 0 && bb.height > 0) {
                bx0 = Math.min(bx0, bb.x);
                by0 = Math.min(by0, bb.y);
                bx1 = Math.max(bx1, bb.x + bb.width);
                by1 = Math.max(by1, bb.y + bb.height);
              }
            } catch {
              /* skip */
            }
          });
          by0 = Math.max(by0, 153);
          bx1 = Math.min(bx1, 1188);
          if (Number.isFinite(bx0)) {
            const bw = bx1 - bx0,
              bh = by1 - by0;
            const bpad = Math.max(bw, bh) * 0.025;
            let defs = svg.querySelector("defs");
            if (!defs) {
              defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
              svg.insertBefore(defs, svg.firstChild);
            }
            const cp = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
            cp.setAttribute("id", "hero-clip");
            cp.setAttribute("clipPathUnits", "userSpaceOnUse");
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            poly.setAttribute(
              "points",
              [
                `${bx0 - bpad},153`,
                `1102,153`,
                `1102,663`,
                `1188,663`,
                `1188,${by1 + bpad}`,
                `${bx0 - bpad},${by1 + bpad}`,
              ].join(" "),
            );
            cp.appendChild(poly);
            defs.appendChild(cp);
            host
              .querySelectorAll<SVGGElement>(".zip-group")
              .forEach((g) => g.setAttribute("clip-path", "url(#hero-clip)"));
            svg.setAttribute(
              "viewBox",
              `${bx0 - bpad} ${by0 - bpad} ${bw + bpad * 2} ${bh + bpad * 2}`,
            );
            svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
          }
        }
        setSvgReady(true);
      })
      .catch(() => {
        /* map fetch failed — rest of the page still renders */
      });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
    // data is server-loaded and stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recolor on metric change (blended rank+magnitude positions) ──
  useEffect(() => {
    const host = svgHostRef.current;
    if (!host || !svgReady || !active) return;
    host.querySelectorAll<SVGGElement>(".zip-group").forEach((g) => {
      const t = activeT[g.id];
      const color = t === undefined ? NO_DATA_FILL : rampColor(t, active.c0, active.c1, active.c2);
      g.querySelectorAll<SVGElement>("path, polygon").forEach((p) => {
        if (p.tagName === "path" && (p.getAttribute("d") ?? "").length < 100) return;
        p.style.fill = color;
        p.style.stroke = "#0a1419";
        p.style.strokeWidth = ".3px";
        p.style.opacity = "1";
      });
    });
  }, [svgReady, active, activeT]);

  const submitSearch = () => {
    const val = (searchRef.current?.value ?? "").trim();
    if (!val) return;
    // One ZIP truth: the report route (the rail rows open the lab instead).
    router.push(/^\d{5}$/.test(val) ? `/r/zip-report/${val}` : `/ask?q=${encodeURIComponent(val)}`);
  };

  // Agent-first re-flip (spec 2026-07-05-agent-first-homepage-design.md): the
  // headline hero moved to components/landing/HeroCampaign.tsx; this component
  // is now the proof-of-data section — same map, rail, stats, and report/ask
  // search, retitled and demoted below the fold. Mechanics unchanged.
  return (
    <section>
      <div className="map-section" id="data">
        <div className="map-intro">
          <div className="hero-badge">{badge}</div>
          <h2 className="map-heading">The data your campaigns are built on</h2>
          <p className="map-sub">
            Live Southwest Florida market signals, cited to the source. Click any ZIP — map or list
            — for its full report: the numbers, what just moved, and what&rsquo;s down the road.
          </p>
          <div className="search-wrap">
            <div className="search-bar">
              <svg
                className="search-icon"
                width="16"
                height="16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={searchRef}
                className="search-input"
                type="text"
                placeholder="Search ZIP code, city, or neighborhood…"
                aria-label="Search by ZIP code, city, or neighborhood"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitSearch();
                }}
              />
              <button className="search-btn" type="button" onClick={submitSearch}>
                Search
              </button>
            </div>
          </div>
          <div className="filter-row">
            {availableMetrics.map((k) => (
              <button
                key={k}
                className={`filter-pill${metric === k ? " active" : ""}`}
                type="button"
                onClick={() => setMetric(k)}
              >
                {data.metrics[k]?.label}
              </button>
            ))}
          </div>
        </div>
        <div className="map-layout">
          <div className="data-rail">
            <div className="rail-header">
              <div className="rail-metric-name">{active?.label ?? ""}</div>
              <div className="rail-sublabel">{active?.sublabel ?? ""}</div>
            </div>

            {active && (
              <div className="rail-top">
                <div className="rail-top-title">
                  Top ZIPs · {active.label}
                  {active.asOf ? ` · ${active.asOf}` : ""}
                </div>
                <ol className="rail-top-list">
                  {activeRanked.slice(0, 5).map(([zip, val], i) => (
                    <li key={zip}>
                      <button
                        type="button"
                        className="rail-top-row"
                        onClick={() => router.push(zipReportHref(zip))}
                      >
                        <span className="rail-top-rank">{i + 1}</span>
                        <span className="rail-top-place">
                          {data.placeNames[zip] ?? zip}
                          <span className="rail-top-zip">{zip}</span>
                        </span>
                        <span className="rail-top-val">{fmt(val, active.format)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="rail-top-hint">
                  Click any ZIP — map or list — to open its full report, built from live figures.
                </div>
              </div>
            )}

            <div className="rail-footer">
              Sources: Zillow ZHVI · SWFL Data Gulf listings · realtor.com · Census TIGER 2020
            </div>
          </div>

          <div className="map-canvas" ref={canvasRef}>
            <div className="svg-host" ref={svgHostRef} aria-hidden="false" />
            {active && (
              <div className="map-legend">
                <div className="legend-title">{active.label}</div>
                <div
                  className="legend-bar"
                  style={{
                    background: `linear-gradient(to right, ${active.c0}, ${active.c1}, ${active.c2})`,
                  }}
                />
                <div className="legend-labels">
                  <span>{fmt(active.low, active.format)}</span>
                  <span>{fmt(active.high, active.format)}</span>
                </div>
              </div>
            )}
            <div id="tooltip" ref={tipRef}>
              <div className="tip-zip" />
              <div className="tip-place" />
              <div className="tip-val" />
              <div className="tip-cta" />
            </div>
          </div>
        </div>

        {stats.length > 0 && (
          <div className="stats-bar">
            {stats.map((s) => (
              <div className="stat-cell" key={s.label}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-sub">{s.sub}</div>
                <div className="stat-tag">{s.tag}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
