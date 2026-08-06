/* global React, Icon */
const { useState, useEffect, useRef } = React;

// ============================================================
// Header — fixed top bar: wordmark, animations toggle, freshness.
// ============================================================
window.Header = function Header({ token, animationsOn, onToggleAnimations }) {
  return (
    <header className="rp-header">
      <a className="rp-brand" href="#">
        <svg width="22" height="22" viewBox="0 0 64 64" fill="none">
          <path d="M10 28 C 18 22, 26 22, 32 28 C 38 34, 46 34, 54 28" stroke="#3DC9C0" strokeWidth="3" strokeLinecap="round" fill="none"/>
          <path d="M10 40 C 18 34, 26 34, 32 40 C 38 46, 46 46, 54 40" stroke="#3DC9C0" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.6"/>
          <path d="M10 52 C 18 46, 26 46, 32 52 C 38 58, 46 58, 54 52" stroke="#3DC9C0" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.3"/>
        </svg>
        <span className="rp-wordmark">SWFL DATA GULF</span>
      </a>

      <div className="rp-header-right">
        <div className="rp-freshness">
          <Icon name="radio-tower" size={13} color="#3DC9C0" />
          <span className="rp-freshness-label">Last computed</span>
          <span className="rp-freshness-token">{token}</span>
        </div>
        <button
          className={"rp-toggle " + (animationsOn ? "is-on" : "is-off")}
          onClick={onToggleAnimations}
          aria-pressed={animationsOn}
        >
          <span>Animations</span>
          <span className="rp-toggle-knob"><span /></span>
          <span className="rp-toggle-state">{animationsOn ? "On" : "Off"}</span>
        </button>
      </div>
    </header>
  );
};

// ============================================================
// Tabs — Glance / Report / Audit.
// ============================================================
window.TierTabs = function TierTabs({ active, onChange }) {
  const tiers = [
    { id: "glance", label: "Glance" },
    { id: "report", label: "Report" },
    { id: "audit", label: "Audit" },
  ];
  return (
    <div className="rp-tabs" role="tablist">
      {tiers.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={"rp-tab" + (active === t.id ? " is-active" : "")}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
};

// ============================================================
// Verdict — the lowercase direction word.
// ============================================================
window.Verdict = function Verdict({ direction, animate }) {
  return (
    <h1
      className="verdict rp-verdict"
      data-direction={direction}
      style={animate ? { animation: "rp-verdict-rise 800ms cubic-bezier(.16,.84,.44,1) both" } : null}
    >
      {direction}
    </h1>
  );
};

// ============================================================
// Conclusion — sentence under verdict, never repeats the verdict word.
// ============================================================
window.Conclusion = function Conclusion({ text, animate }) {
  return (
    <p
      className="rp-conclusion"
      style={animate ? { animation: "rp-fade-rise 500ms 300ms cubic-bezier(.215,.61,.355,1) both" } : null}
    >
      {text}
    </p>
  );
};

// ============================================================
// Metric row — label, value+unit, trend, source chip.
// Used in Tier 2 metrics table (staggered 60-80ms apart).
// ============================================================
window.MetricRow = function MetricRow({ metric, index = 0, animate }) {
  const trendIcon =
    metric.trend === "up" ? "chevron-up" :
    metric.trend === "down" ? "chevron-down" : "minus";
  const trendColor =
    metric.trend === "up" ? "var(--mangrove)" :
    metric.trend === "down" ? "var(--sunset-coral)" : "var(--text-secondary)";

  const valueStr = window.fmt.value(metric.value, metric.unit);
  const unitStr  = window.fmt.unit(metric.unit);

  return (
    <div
      className="rp-row"
      style={animate ? { animation: `rp-fade-rise 400ms ${600 + index * 70}ms cubic-bezier(.215,.61,.355,1) both` } : null}
    >
      <div className="rp-row-label">{metric.label}</div>
      <div className="rp-row-value">
        <span className="metric-value">{valueStr}</span>
        {unitStr && <span className="metric-unit">{unitStr}</span>}
      </div>
      <div className="rp-row-trend numeric" style={{ color: trendColor }}>
        <Icon name={trendIcon} size={13} color={trendColor} />
        {metric.delta}
      </div>
      <a className="rp-row-source source-link" href={metric.source.url} target="_blank" rel="noreferrer">
        {metric.source.label} <Icon name="arrow-up-right" size={11} />
      </a>
    </div>
  );
};

// ============================================================
// Drivers — fades in as a block (no per-item stagger).
// ============================================================
window.Drivers = function Drivers({ items, animate }) {
  return (
    <section
      className="rp-drivers"
      style={animate ? { animation: "rp-fade-rise 500ms 1050ms cubic-bezier(.215,.61,.355,1) both" } : null}
    >
      <h2 className="rp-section-title">Drivers</h2>
      <ul className="rp-driver-list">
        {items.map((d, i) => (
          <li key={i} className="rp-driver-item">
            <span className="rp-driver-tick" aria-hidden>—</span>
            <span>{d}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

// ============================================================
// Caveats — fades in last, slightly reduced opacity by default.
// ============================================================
window.Caveats = function Caveats({ items, animate }) {
  const [open, setOpen] = useState(true);
  return (
    <section
      className="rp-caveats"
      style={animate ? { animation: "rp-fade-rise 400ms 1300ms cubic-bezier(.215,.61,.355,1) both" } : null}
    >
      <button className="rp-caveat-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="rp-caveat-glyph">{open ? "▾" : "▸"}</span>
        {items.length} caveats
      </button>
      {open && (
        <ul className="rp-caveat-list">
          {items.map((c, i) => (
            <li key={i} className="rp-caveat-item">{c}</li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ============================================================
// Upstream — pill chips for component reports.
// ============================================================
window.Upstream = function Upstream({ items, animate }) {
  return (
    <section
      className="rp-upstream"
      style={animate ? { animation: "rp-fade-rise 400ms 1450ms cubic-bezier(.215,.61,.355,1) both" } : null}
    >
      <h2 className="rp-section-title">Component reports</h2>
      <div className="rp-upstream-list">
        {items.map((u) => (
          <a key={u.id} className="rp-upstream-chip" href={"#/r/" + u.id}>
            {u.label}
            <Icon name="chevron-right" size={11} color="#807e76" />
          </a>
        ))}
      </div>
    </section>
  );
};
