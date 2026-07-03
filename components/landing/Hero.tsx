"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  METRIC_ORDER,
  NO_DATA_FILL,
  quantileT,
  rampColor,
  type HomeMapPayload,
  type MetricKey,
} from "@/lib/landing/home-map-types";

/**
 * Homepage hero — Lane B Phase 1 (spec: 2026-07-03-homepage-rebuild-design.md).
 * Live-lake choropleth (props-fed by lib/landing/load-home-map-data.ts — the
 * mock fixture only rides as its fail-soft fallback), Home Value default
 * (locked vision), rank-based colors so the skewed metrics read as data
 * instead of a dead low-end mass, and a data rail that leads with the top-5
 * ZIPs before any interaction. Map click SELECTS (fills the rail) — the rail's
 * two doors are "Build a branded email" (/email-lab?zip=) and the full ZIP
 * report. The contractor SVG is served from public/map/lee-collier.svg and
 * injected client-side.
 */

type Payload = Pick<HomeMapPayload, "data" | "badge" | "stats">;

const county = (zip: string) => (parseInt(zip) >= 34100 ? "Collier County" : "Lee County");

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
  const [selected, setSelected] = useState<string | null>(null);
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

  /** Rank position per ZIP for the active metric (drives color + mini-bars). */
  const activeT = useMemo(() => (active ? quantileT(active.data) : {}), [active]);

  /** Descending [zip, value] for ranks + the top-5 rail list. */
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
          g.setAttribute("role", "button");
          g.setAttribute("aria-label", `${data.placeNames[g.id] || g.id} (${g.id})`);
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
          on("click", () => setSelected(g.id));
          on("keydown", (e) => {
            const ke = e as KeyboardEvent;
            if (ke.key === "Enter" || ke.key === " ") {
              ke.preventDefault();
              setSelected(g.id);
            }
          });
        });

        // Clean edge cuts: Lee top cut (y=153, removes NFM) + Collier staircase
        // right. Pad tightened 0.06 → 0.025 — the old pad left a dead moat of
        // canvas around the counties.
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

  // ── Recolor on metric change (rank-based positions) ──
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

  // ── Selected outline follows state ──
  useEffect(() => {
    const host = svgHostRef.current;
    if (!host || !svgReady) return;
    host.querySelectorAll(".zip-group.selected").forEach((s) => s.classList.remove("selected"));
    if (selected) {
      host.querySelector<SVGGElement>(`.zip-group[id="${selected}"]`)?.classList.add("selected");
    }
  }, [selected, svgReady]);

  const submitSearch = () => {
    const val = (searchRef.current?.value ?? "").trim();
    if (!val) return;
    // One ZIP truth: the report route (same page the rail's "Full report" opens).
    router.push(/^\d{5}$/.test(val) ? `/r/zip-report/${val}` : `/ask?q=${encodeURIComponent(val)}`);
  };

  const metricRowColor: Record<MetricKey, string> = {
    value: "var(--gulf-teal)",
    activity: "#4a6fa8",
    flood: "var(--sunset-coral)",
  };

  return (
    <section>
      <div className="hero">
        <div className="hero-badge">{badge}</div>
        <h1>
          Southwest Florida market intelligence,
          <br />
          <em>cited to the source.</em>
        </h1>
        <p className="hero-sub">
          Ask about any ZIP, address, or corridor and get an answer with every number sourced. Build
          a branded client report in minutes. Free to build — no credit card.
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

      <div className="map-section" id="data">
        <div className="map-layout">
          <div className="data-rail">
            <div className="rail-header">
              <div className="rail-metric-name">{active?.label ?? ""}</div>
              <div className="rail-sublabel">{active?.sublabel ?? ""}</div>
            </div>

            {!selected && active && (
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
                        onClick={() => setSelected(zip)}
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
                <div className="rail-top-hint">Click any ZIP on the map for the full picture.</div>
              </div>
            )}

            {selected && (
              <div className="rail-detail visible">
                <div className="zip-header">
                  <div className="zip-code-label">{selected}</div>
                  <div className="zip-place">{data.placeNames[selected] ?? selected}</div>
                  <div className="zip-county">{county(selected)}</div>
                </div>
                {availableMetrics.map((k) => {
                  const m = data.metrics[k];
                  if (!m) return null;
                  const val = m.data[selected];
                  const t = k === metric ? activeT[selected] : quantileT(m.data)[selected];
                  const r =
                    val !== undefined
                      ? Object.values(m.data).filter((v) => v > val).length + 1
                      : null;
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`metric-row${k === metric ? " active-metric" : ""}`}
                      onClick={() => setMetric(k)}
                    >
                      <div className="metric-row-label">{m.label}</div>
                      <div className="metric-row-value">
                        {val !== undefined ? fmt(val, m.format) : "N/A"}
                      </div>
                      <div className="metric-row-rank">
                        {r ? `#${r} of ${Object.keys(m.data).length} ZIPs` : ""}
                      </div>
                      <div className="mini-bar">
                        <div
                          className="mini-bar-fill"
                          style={{
                            background: metricRowColor[k],
                            width: t !== undefined ? `${Math.max(3, t * 100)}%` : "0%",
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
                <div className="rail-cta">
                  <a className="rail-cta-primary" href={`/email-lab?zip=${selected}`}>
                    Build a branded email
                  </a>
                  <a className="rail-cta-secondary" href={`/r/zip-report/${selected}`}>
                    Full report →
                  </a>
                </div>
                <button type="button" className="rail-back" onClick={() => setSelected(null)}>
                  ← Back to top ZIPs
                </button>
              </div>
            )}

            <div className="rail-footer">
              Sources: Zillow ZHVI · SWFL Data Gulf listings · FEMA NFIP · Census TIGER 2020
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
