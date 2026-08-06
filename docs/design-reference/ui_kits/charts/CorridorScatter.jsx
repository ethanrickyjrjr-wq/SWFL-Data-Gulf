/* global React */
const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
// CorridorScatter — 8 SWFL corridors on cap-rate × vacancy axes.
// Bubble size = |absorption|. Color = evolution. Click to select.
// ============================================================

window.CorridorScatter = function CorridorScatter({ selectedId, onSelect, hoveredId, onHover, palette }) {
  const W = 660, H = 340;
  const PAD = { top: 28, right: 28, bottom: 44, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const all = window.CORRIDORS;
  const withMetrics = all.filter((c) => c.metrics);

  // Axis ranges — round to clean numbers, with padding.
  const xMin = 5,  xMax = 9;   // cap rate %
  const yMin = 0,  yMax = 20;  // vacancy %

  const x = (v) => PAD.left + ((v - xMin) / (xMax - xMin)) * innerW;
  const y = (v) => PAD.top  + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const r = (abs) => {
    // sqrt scale on abs(absorption). 5k → ~5px, 185k → ~22px.
    const a = Math.max(5000, Math.abs(abs));
    return 4 + Math.sqrt(a / 1000) * 1.3;
  };

  const xTicks = [5, 6, 7, 8, 9];
  const yTicks = [0, 5, 10, 15, 20];

  // Median crosshair
  const medX = x(6.5);
  const medY = y(6.0);

  return (
    <div className="cv-scatter-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="cv-scatter">
        {/* Axes grid */}
        {xTicks.map((t) => (
          <g key={`gx${t}`}>
            <line x1={x(t)} x2={x(t)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--gulf-haze)" strokeWidth="0.5" />
            <text x={x(t)} y={H - 18} textAnchor="middle" className="cv-ax-tick">{t}%</text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`gy${t}`}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--gulf-haze)" strokeWidth="0.5" />
            <text x={PAD.left - 12} y={y(t) + 3} textAnchor="end" className="cv-ax-tick">{t}%</text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={PAD.left + innerW / 2} y={H - 4} textAnchor="middle" className="cv-ax-label">CAP RATE → tighter pricing →</text>
        <g transform={`translate(16, ${PAD.top + innerH / 2}) rotate(-90)`}>
          <text textAnchor="middle" className="cv-ax-label">VACANCY → tighter space →</text>
        </g>

        {/* Median crosshair */}
        <line x1={medX} x2={medX} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--gulf-teal)" strokeDasharray="2 4" strokeWidth="0.75" opacity="0.6" />
        <line x1={PAD.left} x2={PAD.left + innerW} y1={medY} y2={medY} stroke="var(--gulf-teal)" strokeDasharray="2 4" strokeWidth="0.75" opacity="0.6" />
        <text x={medX + 6} y={PAD.top + 12} className="cv-ax-tick" fill="var(--gulf-teal)">PACK MEDIAN · 6.5% / 6%</text>

        {/* Quadrant labels */}
        <text x={x(5.5)} y={y(2.5)}  className="cv-quad-label" fill="var(--mangrove)">LANDLORD MARKET</text>
        <text x={x(8.5)} y={y(17)}   className="cv-quad-label" fill="var(--sunset-coral)" textAnchor="end">DISTRESSED</text>

        {/* Bubbles */}
        {withMetrics.map((c, i) => {
          const cx = x(c.metrics.capRate.val);
          const cy = y(c.metrics.vacancy.val);
          const rad = r(c.metrics.absorption.val);
          const isSelected = selectedId === c.id;
          const isHovered = hoveredId === c.id;
          const isDimmed = (selectedId || hoveredId) && !isSelected && !isHovered;
          const color = palette[c.evolution];
          return (
            <g
              key={c.id}
              className={"cv-bubble" + (isSelected ? " is-selected" : "") + (isHovered ? " is-hovered" : "") + (isDimmed ? " is-dimmed" : "")}
              onClick={() => onSelect(c.id)}
              onMouseEnter={() => onHover(c.id)}
              onMouseLeave={() => onHover(null)}
            >
              {/* Outer halo on select */}
              {(isSelected || isHovered) && (
                <circle cx={cx} cy={cy} r={rad + 6} fill="none" stroke={color} strokeWidth="1" opacity="0.55" />
              )}
              <circle cx={cx} cy={cy} r={rad} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.5" />
              <circle cx={cx} cy={cy} r="2.5" fill={color} />
              {/* Label always visible for high-asymmetry corridors; else only on hover/select */}
              {(isSelected || isHovered || c.id === "estero" || c.id === "alico") && (
                <g transform={`translate(${cx + rad + 6}, ${cy + 3})`}>
                  <text className="cv-bubble-label" fill="var(--text-primary)">{c.short}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="cv-scatter-legend">
        <span className="caption">Evolution:</span>
        {Object.entries({ growing: "Growing", stable: "Stable", repositioning: "Repositioning", declining: "Declining" }).map(([k, lbl]) => (
          <span key={k} className="cv-legend-pill">
            <span className="cv-legend-swatch" style={{ background: palette[k] }} />
            {lbl}
          </span>
        ))}
        <span className="caption" style={{ marginLeft: "auto" }}>Bubble size · |net absorption|</span>
      </div>
    </div>
  );
};
