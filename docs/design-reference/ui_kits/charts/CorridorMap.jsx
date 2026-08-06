/* global React */
const { useState, useEffect, useRef } = React;

// ============================================================
// CorridorMap — Lee + Collier polygons with 8 corridor markers.
// Synced with scatter via selectedId. Click marker → onSelect.
// ============================================================

window.CorridorMap = function CorridorMap({ selectedId, onSelect, hoveredId, onHover, palette }) {
  const [geo, setGeo] = useState(null);
  useEffect(() => {
    fetch("swfl-geo.json").then((r) => r.json()).then(setGeo);
  }, []);

  const corridors = window.CORRIDORS;

  if (!geo) {
    return <div className="cv-map-loading">Loading geography…</div>;
  }

  // Project lon/lat → svg using bbox from geo
  const { minLon, maxLon, minLat, maxLat } = geo.bbox;
  const project = (lon, lat) => {
    const x = ((lon - minLon) / (maxLon - minLon)) * geo.width;
    const y = ((maxLat - lat) / (maxLat - minLat)) * geo.height;
    return [x, y];
  };

  return (
    <div className="cv-map-frame">
      <div className="cv-map-chrome">
        <span className="cv-map-coord">LEE + COLLIER · 26.5°N 81.9°W</span>
        <span className="cv-map-scale">
          <span className="cv-map-scale-bar" />
          <span>20 mi</span>
        </span>
      </div>

      <svg viewBox={geo.viewBox} className="cv-map-svg">
        <defs>
          <pattern id="cv-water-2" width="14" height="14" patternUnits="userSpaceOnUse">
            <rect width="14" height="14" fill="var(--gulf-midnight)" />
            <path d="M0 7 Q 3.5 4, 7 7 T 14 7" stroke="var(--gulf-teal)" strokeWidth="0.4" fill="none" opacity="0.16" />
          </pattern>
          <filter id="cv-glow-2" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect width="100%" height="100%" fill="url(#cv-water-2)" />

        {/* County polygons — neutral fill always */}
        <path d={geo.lee}     className="cv-county-base" />
        <path d={geo.collier} className="cv-county-base" />

        {/* County labels */}
        <text x="180" y="130" className="cv-county-name">LEE</text>
        <text x="440" y="560" className="cv-county-name">COLLIER</text>

        {/* Gulf label */}
        <text x="22" y="42" className="cv-water-label">GULF OF</text>
        <text x="22" y="58" className="cv-water-label">MEXICO</text>

        {/* Corridor markers */}
        {corridors.map((c, i) => {
          const [cx, cy] = project(c.lonlat[0], c.lonlat[1]);
          const isSelected = selectedId === c.id;
          const isHovered = hoveredId === c.id;
          const isDimmed = (selectedId || hoveredId) && !isSelected && !isHovered;
          const color = palette[c.evolution];
          const r = isSelected ? 14 : isHovered ? 11 : 8;
          return (
            <g
              key={c.id}
              className={"cv-mark" + (isSelected ? " is-selected" : "") + (isHovered ? " is-hovered" : "") + (isDimmed ? " is-dimmed" : "")}
              onClick={() => onSelect(c.id)}
              onMouseEnter={() => onHover(c.id)}
              onMouseLeave={() => onHover(null)}
            >
              {(isSelected || isHovered) && (
                <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" />
              )}
              <circle cx={cx} cy={cy} r={r + 6} fill={color} opacity="0.18" />
              <circle cx={cx} cy={cy} r={r} fill={color} style={{ filter: isSelected ? "url(#cv-glow-2)" : null }} />
              <circle cx={cx} cy={cy} r="3" fill="var(--gulf-midnight)" />
              {(isSelected || isHovered) && (
                <g transform={`translate(${cx + r + 10}, ${cy - 4})`}>
                  <text className="cv-mark-label">{c.short}</text>
                  <text className="cv-mark-sub" y="16">{c.city}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      <div className="cv-map-footer">
        <span className="caption">Lee + Collier boundaries · US Census TIGER 2010 (public domain)</span>
        <span className="caption" style={{ color: "var(--gulf-teal)" }}>Click any corridor to inspect →</span>
      </div>
    </div>
  );
};
