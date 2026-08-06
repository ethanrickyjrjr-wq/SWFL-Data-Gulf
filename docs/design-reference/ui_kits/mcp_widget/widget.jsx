/* global React */
const { useState, useEffect } = React;

// Reuse the master report's first 3 metrics for the widget (per the brief).
const REPORT = {
  direction: "mixed",
  conclusion:
    "SWFL housing is cooling on demand metrics while supply tightens; commercial real estate diverges sharply by corridor.",
  metrics: [
    { label: "Median DOM, Lee SF", value: 51, unit: "days",    delta: "+6 mo/mo", trend: "up",   source: { label: "LeePA",      url: "https://www.leepa.org/" } },
    { label: "Cap rate, Lee multi", value: 5.42, unit: "%",     delta: "+18 bps", trend: "up",   source: { label: "LeePA",      url: "https://www.leepa.org/" } },
    { label: "Permits MTD, Lee",    value: 1247, unit: "permits", delta: "-12% YoY", trend: "down", source: { label: "Lee Accela", url: "https://aca-prod.accela.com/LEECOUNTY/" } },
  ],
  caveats: [
    "Cap rate sample size is small (n=12 this quarter).",
    "FEMA NFIP claims lag by ~45 days.",
  ],
  freshness: "SWFL-7421-v5-20260522",
};

function Chev({ trend }) {
  const color = trend === "up" ? "var(--mangrove)" : trend === "down" ? "var(--sunset-coral)" : "var(--text-secondary)";
  if (trend === "up")
    return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 15 12 9 18 15"/></svg>;
  if (trend === "down")
    return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}

function Wave() {
  return (
    <svg width="18" height="18" viewBox="0 0 64 64" fill="none">
      <path d="M10 28 C 18 22, 26 22, 32 28 C 38 34, 46 34, 54 28" stroke="#3DC9C0" strokeWidth="3" strokeLinecap="round"/>
      <path d="M10 40 C 18 34, 26 34, 32 40 C 38 46, 46 46, 54 40" stroke="#3DC9C0" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}

function Widget({ mode, animKey }) {
  const [showCaveats, setShowCaveats] = useState(false);
  // Durations vary by mode. "subtle" ≤ 300ms total; "impress" ≤ 600ms.
  const verdictDuration = mode === "impress" ? 580 : 300;
  const metricsDelay    = mode === "impress" ? 260 : 180;
  const metricsDuration = mode === "impress" ? 320 : 180;

  return (
    <div className="mcp-widget" key={animKey}>
      <div className="mw-head">
        <div className="mw-brand">
          <Wave />
          SWFL DATA GULF
        </div>
        <div className="mw-fresh">{REPORT.freshness}</div>
      </div>

      <div className="mw-hero">
        <h1
          className="mw-verdict"
          data-direction={REPORT.direction}
          style={{ animation: `mw-spring-rise ${verdictDuration}ms cubic-bezier(.16,.84,.44,1) both` }}
        >
          {REPORT.direction}
        </h1>
        <p
          className="mw-conclusion"
          style={{ animation: `mw-fade ${metricsDuration}ms ${metricsDelay - 20}ms ease-out both` }}
        >
          {REPORT.conclusion}
        </p>
      </div>

      <div
        className="mw-metrics"
        style={{ animation: `mw-fade ${metricsDuration}ms ${metricsDelay}ms ease-out both` }}
      >
        {REPORT.metrics.map((m) => (
          <div className="mw-row" key={m.label}>
            <span className="mw-label">{m.label}</span>
            <span className="mw-value-cell">
              <span className="mw-value">
                {m.unit === "USD" ? "$" : ""}{m.value >= 1000 ? m.value.toLocaleString() : m.value}
              </span>
              {m.unit !== "USD" && <span className="mw-unit">{m.unit}</span>}
              <span className="mw-delta" style={{ color: m.trend === "up" ? "var(--mangrove)" : m.trend === "down" ? "var(--sunset-coral)" : "var(--text-secondary)" }}>
                <Chev trend={m.trend} />
                {m.delta}
              </span>
            </span>
            <a className="mw-source" href={m.source.url} target="_blank" rel="noreferrer">{m.source.label} ↗</a>
          </div>
        ))}
      </div>

      <div className="mw-foot">
        <button className="mw-caveat-btn" onClick={() => setShowCaveats(s => !s)}>
          <span style={{ color: "var(--gulf-teal-dim)", fontFamily: "var(--font-mono)" }}>{showCaveats ? "▾" : "▸"}</span>
          {REPORT.caveats.length} caveats
        </button>
        <a className="mw-view-full" href="../report/index.html">View full report ↗</a>
      </div>
      {showCaveats && (
        <div className="mw-caveats">
          {REPORT.caveats.map((c, i) => (<div key={i}>— {c}</div>))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [mode, setMode] = useState("subtle");
  const [animKey, setAnimKey] = useState(0);
  // Replay animations on mode change.
  useEffect(() => { setAnimKey(k => k + 1); }, [mode]);

  return (
    <>
      <div className="mcp-host">
        <div className="mcp-host-user">
          Pull the master SWFL Data Gulf report.
        </div>
        <div className="mcp-host-ai">
          <div className="mcp-host-tag">
            <svg width="9" height="9" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="20" fill="#3DC9C0"/></svg>
            Claude
          </div>
          Here's the master report. Headline below — caveats and sources inline.
        </div>
      </div>

      <div className="mw-mode-bar">
        <span>HOST MODE</span>
        <button className={mode === "subtle"  ? "is-active" : ""} onClick={() => setMode("subtle")}>subtle (default)</button>
        <button className={mode === "impress" ? "is-active" : ""} onClick={() => setMode("impress")}>impress</button>
        <span style={{ marginLeft: "auto" }}>{mode === "subtle" ? "≤ 300ms total" : "≤ 600ms total"}</span>
      </div>

      <Widget mode={mode} animKey={animKey} />

      <div className="mcp-host" style={{ marginTop: 10 }}>
        <div className="mcp-host-ai" style={{ fontSize: 13 }}>
          Want the full audit (Tier 3) or to drill into a component report (Lee housing, SWFL CRE, permits, tourism, hurricane risk, macro)?
        </div>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
