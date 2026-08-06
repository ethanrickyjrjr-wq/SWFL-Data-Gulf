/* global React */
const { useMemo } = React;

// ============================================================
// CorridorDetail — full profile panel for the selected corridor.
// Shows the verbatim character quote, evolution, tenant mix,
// all 4 metrics with trend arrows + delta vs pack median, flags.
// ============================================================

const arrowFor = (dir) =>
  dir === "rising"  ? "↑"
  : dir === "falling" ? "↓"
  : "→";

const dirColor = (dir, metricGood) => {
  // metricGood: which direction is "good" for this metric.
  // capRate falling = good (compressing), vacancy falling = good (tighter), absorption rising = good, rent rising = good.
  if (dir === "stable") return "var(--text-secondary)";
  return dir === metricGood ? "var(--mangrove)" : "var(--sunset-coral)";
};

const fmt = (m) => {
  if (!m) return "—";
  if (m.unit === "%")    return m.val.toFixed(1) + "%";
  if (m.unit === "$/sf") return "$" + m.val.toFixed(2);
  if (m.unit === "sqft") {
    const v = m.val;
    if (Math.abs(v) >= 1000) return v.toLocaleString();
    return String(v);
  }
  return String(m.val);
};

window.CorridorDetail = function CorridorDetail({ corridor, palette }) {
  if (!corridor) {
    return (
      <div className="cv-detail cv-detail-empty">
        <span className="caption" style={{ letterSpacing: "0.08em" }}>SELECT A CORRIDOR</span>
        <p>Click any bubble in the scatter, any marker on the map, or any row in the table to inspect.</p>
      </div>
    );
  }

  const evColor = palette[corridor.evolution];
  const medians = window.PACK_MEDIANS;

  const metricRows = corridor.metrics
    ? [
        { k: "capRate",    label: "Cap rate",       good: "falling", med: medians.capRate.val,    fmtMed: (v) => v.toFixed(1) + "%" },
        { k: "vacancy",    label: "Vacancy",        good: "falling", med: medians.vacancy.val,    fmtMed: (v) => v.toFixed(1) + "%" },
        { k: "absorption", label: "Net absorption", good: "rising",  med: medians.absorption.val, fmtMed: (v) => v.toLocaleString() + " sqft" },
        { k: "rent",       label: "Asking rent",    good: "rising",  med: medians.rent.val,       fmtMed: (v) => "$" + v.toFixed(2) + " PSF" },
      ]
    : null;

  return (
    <div className="cv-detail">
      <div className="cv-detail-head">
        <div>
          <span className="cv-detail-meta">{corridor.city.toUpperCase()} · {corridor.county.toUpperCase()} · {corridor.type.replace(/-/g, " ")}</span>
          <h3 className="cv-detail-name">{corridor.name}</h3>
        </div>
        <span className="cv-detail-evolution" style={{ color: evColor, borderColor: evColor }}>
          {corridor.evolution}
        </span>
      </div>

      {corridor.character ? (
        <blockquote className="cv-detail-quote">
          <span className="cv-detail-quote-mark" style={{ color: evColor }}>"</span>
          {corridor.character}
        </blockquote>
      ) : (
        <p className="cv-detail-empty-line">No character narrative recorded.</p>
      )}

      <div className="cv-detail-tenants">
        <span className="cv-detail-section-label">Tenant mix</span>
        <p>{corridor.tenants}</p>
      </div>

      <div className="cv-detail-seasonal">
        <span className="cv-detail-section-label">Seasonal index</span>
        <div className="cv-seasonal-bar">
          <div className="cv-seasonal-fill" style={{ width: `${corridor.seasonalIdx * 100}%`, background: evColor }} />
          <span className="cv-seasonal-val">{corridor.seasonalIdx.toFixed(2)}</span>
        </div>
        <span className="caption">0 = no seasonality · 1 = extreme · pack runs 0.10 (Alico) – 0.88 (Estero)</span>
      </div>

      {metricRows ? (
        <div className="cv-detail-metrics">
          <span className="cv-detail-section-label">Metrics vs pack median</span>
          <div className="cv-metric-grid">
            {metricRows.map((row) => {
              const m = corridor.metrics[row.k];
              const delta = m.val - row.med;
              const pct = (delta / row.med) * 100;
              const better = (row.good === "falling" && delta < 0) || (row.good === "rising" && delta > 0);
              const same = Math.abs(pct) < 0.5;
              const deltaColor = same ? "var(--text-secondary)" : (better ? "var(--mangrove)" : "var(--sunset-coral)");
              return (
                <div key={row.k} className="cv-metric-cell">
                  <span className="cv-metric-label">{row.label}</span>
                  <div className="cv-metric-val">
                    <span className="cv-metric-num">{fmt(m)}</span>
                    <span className="cv-metric-arrow" style={{ color: dirColor(m.dir, row.good) }}>{arrowFor(m.dir)}</span>
                  </div>
                  <span className="cv-metric-delta" style={{ color: deltaColor }}>
                    {same ? "= median" : (delta > 0 ? "+" : "") + (row.k === "absorption" ? Math.round(delta).toLocaleString() : delta.toFixed(2)) + (row.k === "absorption" ? " sqft" : row.k === "rent" ? " $/sf" : " ppts")}
                    <span className="cv-metric-delta-vs"> vs {row.fmtMed(row.med)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="cv-detail-empty-block">
          <span className="cv-detail-section-label">Metrics</span>
          <p>No quantitative metrics available for this corridor (content score 4 — see pack caveat).</p>
        </div>
      )}

      {corridor.flags.length > 0 && (
        <div className="cv-detail-flags">
          <span className="cv-detail-section-label">Active flags · {corridor.flags.length}</span>
          <ul className="cv-flags-list">
            {corridor.flags.map((f, i) => {
              const meta = window.FLAG_TYPES[f.type];
              const flagColor = palette["flag_" + f.type] || meta.color;
              return (
                <li key={i} className="cv-flag">
                  <div className="cv-flag-head">
                    <span className="cv-flag-type" style={{ color: flagColor, borderColor: flagColor }}>{meta.label}</span>
                    <span className="cv-flag-priority">{window.PRIORITY_LABEL[f.priority]}</span>
                  </div>
                  <p className="cv-flag-text">{f.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
