"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

export type HBarTier = "bullish" | "neutral" | "bearish";

export type HBarCorridor = {
  name: string;
  value: number;
  tier: HBarTier;
};

export type HBarChartProps = {
  title: string;
  corridors: HBarCorridor[];
  median: number;
  range: { min: number; max: number };
  eyebrow?: string;
  separatorAfter?: number;
  separatorLabel?: string;
  detailHref?: string;
  detailLabel?: string;
};

type TooltipState = {
  visible: boolean;
  x: number;
  y: number;
  corridor: HBarCorridor | null;
};

const ANIM_DURATION = 0.75;
const ANIM_STAGGER = 0.11;

export function HBarChart({
  title,
  corridors,
  median,
  range,
  eyebrow,
  separatorAfter,
  separatorLabel,
  detailHref,
  detailLabel,
}: HBarChartProps) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const fillRefs = useRef<(HTMLDivElement | null)[]>([]);
  const valueRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    corridor: null,
  });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const fills = fillRefs.current.filter(
        (el): el is HTMLDivElement => el !== null,
      );
      const pcts = corridors.map((c) => (c.value / range.max) * 100);

      gsap.fromTo(
        fills,
        { width: 0 },
        {
          width: (i) => `${pcts[i]}%`,
          duration: ANIM_DURATION,
          ease: "power2.out",
          stagger: ANIM_STAGGER,
        },
      );

      corridors.forEach((c, i) => {
        const valEl = valueRefs.current[i];
        if (!valEl) return;
        const proxy = { v: 0 };
        gsap.to(proxy, {
          v: c.value,
          duration: ANIM_DURATION,
          ease: "power2.out",
          delay: i * ANIM_STAGGER,
          onUpdate: () => {
            valEl.textContent = `$${proxy.v.toFixed(2)}`;
          },
        });
      });
    }, scopeRef);

    return () => ctx.revert();
  }, [corridors, range.max]);

  const handleEnter = (idx: number) => (e: React.MouseEvent) => {
    setHoveredIdx(idx);
    setTooltip({
      visible: true,
      x: e.clientX + 14,
      y: e.clientY - 48,
      corridor: corridors[idx],
    });
  };

  const handleMove = (e: React.MouseEvent) => {
    setTooltip((prev) =>
      prev.visible ? { ...prev, x: e.clientX + 14, y: e.clientY - 48 } : prev,
    );
  };

  const handleLeave = () => {
    setHoveredIdx(null);
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const tipCorr = tooltip.corridor;
  const tipDiff = tipCorr ? tipCorr.value - median : 0;
  const tipSign = tipDiff >= 0 ? "+" : "−";

  return (
    <div ref={scopeRef} className="hbarchart-root">
      <div className="hbarchart-card">
        <div className="hbarchart-eyebrow">
          {eyebrow ?? `${corridors.length} corridors`}
        </div>
        <div className="hbarchart-title">{title}</div>
        <div
          className={`hbarchart-list${hoveredIdx !== null ? " has-hover" : ""}`}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        >
          {corridors.map((c, i) => {
            const pct = (c.value / range.max) * 100;
            const showSeparator =
              typeof separatorAfter === "number" &&
              separatorLabel &&
              i + 1 === separatorAfter;
            return (
              <Fragment key={c.name}>
                <div
                  className={`hbarchart-row${hoveredIdx === i ? " hovered" : ""}`}
                  onMouseEnter={handleEnter(i)}
                >
                  <div className="hbarchart-label">{c.name}</div>
                  <div className="hbarchart-track">
                    <div
                      ref={(el) => {
                        fillRefs.current[i] = el;
                      }}
                      className={`hbarchart-fill hbarchart-fill-${c.tier}`}
                      data-pct={pct.toFixed(2)}
                    />
                  </div>
                  <div
                    ref={(el) => {
                      valueRefs.current[i] = el;
                    }}
                    className="hbarchart-value"
                  >
                    $0.00
                  </div>
                </div>
                {showSeparator && (
                  <div className="hbarchart-separator" aria-hidden="true">
                    <span className="hbarchart-separator-label">
                      {separatorLabel}
                    </span>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
        <div className="hbarchart-footer">
          <span>
            Median ${median.toFixed(2)} &nbsp;·&nbsp; range $
            {range.min.toFixed(2)}–${range.max.toFixed(2)}
          </span>
          {detailHref && detailLabel && (
            <a className="hbarchart-detail-link" href={detailHref}>
              {detailLabel}
            </a>
          )}
        </div>
      </div>

      {tipCorr && (
        <div
          className={`hbarchart-tooltip${tooltip.visible ? " visible" : ""}`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="hbarchart-tooltip-name">{tipCorr.name}</div>
          <div className="hbarchart-tooltip-row">
            <span>Asking Rent</span>
            <span>${tipCorr.value.toFixed(2)}/sqft</span>
          </div>
          <div className="hbarchart-tooltip-row">
            <span>Tier</span>
            <span>
              {tipCorr.tier.charAt(0).toUpperCase() + tipCorr.tier.slice(1)}
            </span>
          </div>
          <div className="hbarchart-tooltip-row">
            <span>vs Median</span>
            <span>
              {tipSign}${Math.abs(tipDiff).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <style jsx>{`
        .hbarchart-root {
          --teal: #3ecfb2;
          --teal-glow: rgba(62, 207, 178, 0.45);
          --amber: #e8a84c;
          --amber-glow: rgba(232, 168, 76, 0.45);
          --muted-txt: rgba(255, 255, 255, 0.38);
          --label-txt: rgba(255, 255, 255, 0.88);
          --value-txt: rgba(255, 255, 255, 0.95);
          --meta-txt: rgba(62, 207, 178, 0.6);
          width: 100%;
          display: flex;
          justify-content: center;
        }

        .hbarchart-card {
          background: #162030;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 28px 32px 22px;
          width: 100%;
          max-width: 620px;
          min-width: 320px;
          font-family:
            var(--font-plex-sans),
            "IBM Plex Sans",
            ui-sans-serif,
            system-ui,
            -apple-system,
            sans-serif;
        }

        .hbarchart-eyebrow {
          font-family:
            var(--font-plex-mono), "IBM Plex Mono", ui-monospace,
            SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          color: var(--muted-txt);
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .hbarchart-title {
          font-size: 20px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 24px;
          letter-spacing: -0.01em;
        }

        .hbarchart-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .hbarchart-row {
          display: grid;
          grid-template-columns: 148px 1fr 76px;
          align-items: center;
          gap: 12px;
          padding: 5px 0;
          border-radius: 4px;
          transition: opacity 0.2s;
        }

        .hbarchart-label {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--label-txt);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          letter-spacing: -0.01em;
          transition: color 0.2s;
        }

        .hbarchart-track {
          position: relative;
          height: 24px;
          background: rgba(255, 255, 255, 0.04);
          border-radius: 3px;
          overflow: hidden;
        }

        .hbarchart-fill {
          position: absolute;
          inset: 0 auto 0 0;
          width: 0%;
          border-radius: 3px;
          transition:
            filter 0.25s,
            opacity 0.25s;
        }

        .hbarchart-fill-bullish {
          background: var(--teal);
          box-shadow: 0 0 10px var(--teal-glow);
        }

        .hbarchart-fill-neutral {
          background: rgba(62, 207, 178, 0.55);
          box-shadow: none;
        }

        .hbarchart-fill-bearish {
          background: var(--amber);
          box-shadow: 0 0 10px var(--amber-glow);
        }

        .hbarchart-value {
          font-family:
            var(--font-plex-mono), "IBM Plex Mono", ui-monospace,
            SFMono-Regular, Menlo, monospace;
          font-size: 13.5px;
          font-weight: 600;
          color: var(--value-txt);
          text-align: right;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }

        .hbarchart-list.has-hover .hbarchart-row {
          opacity: 0.35;
        }
        .hbarchart-list.has-hover .hbarchart-row.hovered {
          opacity: 1;
        }
        .hbarchart-list.has-hover .hbarchart-row.hovered .hbarchart-fill {
          filter: brightness(1.25);
        }
        .hbarchart-list.has-hover .hbarchart-separator {
          opacity: 0.35;
        }

        .hbarchart-separator {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 4px 0;
          transition: opacity 0.2s;
        }
        .hbarchart-separator::before,
        .hbarchart-separator::after {
          content: "";
          flex: 1;
          border-top: 1px dashed rgba(255, 255, 255, 0.12);
        }
        .hbarchart-separator-label {
          font-family:
            var(--font-plex-mono), "IBM Plex Mono", ui-monospace,
            SFMono-Regular, Menlo, monospace;
          font-size: 10.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted-txt);
          white-space: nowrap;
        }

        .hbarchart-tooltip {
          position: fixed;
          background: #1c2e3f;
          border: 1px solid rgba(62, 207, 178, 0.3);
          border-radius: 8px;
          padding: 10px 14px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s;
          z-index: 100;
          min-width: 180px;
          font-family:
            var(--font-plex-sans),
            "IBM Plex Sans",
            ui-sans-serif,
            system-ui,
            -apple-system,
            sans-serif;
        }
        .hbarchart-tooltip.visible {
          opacity: 1;
        }
        .hbarchart-tooltip-name {
          font-size: 12px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 4px;
        }
        .hbarchart-tooltip-row {
          display: flex;
          justify-content: space-between;
          font-family:
            var(--font-plex-mono), "IBM Plex Mono", ui-monospace,
            SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          color: var(--muted-txt);
        }
        .hbarchart-tooltip-row span:last-child {
          color: var(--teal);
        }

        .hbarchart-footer {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px dashed rgba(255, 255, 255, 0.1);
          font-family:
            var(--font-plex-mono), "IBM Plex Mono", ui-monospace,
            SFMono-Regular, Menlo, monospace;
          font-size: 11.5px;
          color: var(--meta-txt);
          letter-spacing: 0.02em;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .hbarchart-detail-link {
          color: var(--teal);
          text-decoration: none;
          font-weight: 600;
          transition: opacity 0.15s;
        }
        .hbarchart-detail-link:hover {
          opacity: 0.75;
        }
      `}</style>
    </div>
  );
}

export default HBarChart;
