/* global React */
// Chart components for embedding in AI chat answers.
// Self-contained. Width budget: 480–640px.
// Data is REAL corridor data from the SWFL CRE source — corridor names,
// cap rates, vacancy, absorption, asking rent. Replace this fixture
// with a live fetch in production; the component shape stays the same.
// Visual language per app/_design/05-color-and-type.md.

const { useState } = React;

const arrow = (d) => d === "up" ? "↑" : d === "down" ? "↓" : "→";

// ============================================================
// Card 1 — KPI tile with sparkline
// ============================================================
window.KPICard = function KPICard({ palette }) {
  const series = [6.95, 6.92, 6.88, 6.82, 6.78, 6.74, 6.70, 6.65, 6.61, 6.58, 6.54, 6.50];
  const W = 200, H = 56;
  const min = Math.min(...series), max = Math.max(...series);
  const points = series.map((v, i) => [
    (i / (series.length - 1)) * W,
    H - ((v - min) / (max - min || 1)) * H,
  ]);
  const path = points.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = path + ` L ${W} ${H} L 0 ${H} Z`;

  return (
    <div className="cc-card">
      <div className="cc-card-head">
        <span className="cc-card-eyebrow">Trailing 12 months</span>
        <span className="cc-card-title">Median cap rate</span>
      </div>
      <div className="cc-kpi-body">
        <div className="cc-kpi-left">
          <span className="cc-kpi-val">6.5%</span>
          <span className="cc-kpi-delta is-good">
            <span className="cc-kpi-delta-arrow">↓</span>
            45 bps · 12mo
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="cc-kpi-spark" preserveAspectRatio="none">
          <path d={area} fill={palette.growing} opacity="0.18" />
          <path d={path} fill="none" stroke={palette.growing} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="3" fill={palette.growing} />
        </svg>
      </div>
      <div className="cc-card-foot">
        <span>Compressing — landlord-market read</span>
      </div>
    </div>
  );
};

// ============================================================
// Card 2 — Stat row · 4 KPIs side by side
// ============================================================
window.StatRow = function StatRow({ palette }) {
  const stats = [
    { label: "Cap rate",   val: "6.5%",     dir: "down", good: true,  delta: "−45 bps" },
    { label: "Vacancy",    val: "6.0%",     dir: "down", good: true,  delta: "−80 bps" },
    { label: "Absorption", val: "32K sqft", dir: "up",   good: true,  delta: "+18%" },
    { label: "Rent PSF",   val: "$32.50",   dir: "up",   good: true,  delta: "+4%" },
  ];
  return (
    <div className="cc-card">
      <div className="cc-card-head">
        <span className="cc-card-eyebrow">Pack medians</span>
        <span className="cc-card-title">Four-metric snapshot</span>
      </div>
      <div className="cc-stat-grid">
        {stats.map((s) => (
          <div key={s.label} className="cc-stat-cell">
            <span className="cc-stat-label">{s.label}</span>
            <span className="cc-stat-val">{s.val}</span>
            <span className="cc-stat-delta" style={{ color: s.good ? palette.growing : palette.declining }}>
              {arrow(s.dir)} {s.delta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// Card 3 — Horizontal bar chart, sorted
// ============================================================
window.HBarChart = function HBarChart({ palette }) {
  const items = [
    { label: "Fort Myers Beach", val: 45.00, tag: "tourism"  },
    { label: "North Naples",     val: 42.50, tag: "growing"  },
    { label: "Pine Ridge Rd",    val: 38.00, tag: "stable"   },
    { label: "Cape Coral Pkwy",  val: 32.50, tag: "growing"  },
    { label: "Estero (anchor)",  val: 28.00, tag: "anchor"   },
    { label: "Bonita Springs",   val: 26.50, tag: "stable"   },
    { label: "Alico Industrial", val: 16.50, tag: "industrial"},
  ];
  const tagColor = { growing: palette.growing, stable: palette.stable, tourism: palette.repositioning, anchor: palette.repositioning, industrial: palette.stable };
  const max = Math.max(...items.map((i) => i.val));

  return (
    <div className="cc-card">
      <div className="cc-card-head">
        <span className="cc-card-eyebrow">7 corridors</span>
        <span className="cc-card-title">Asking rent (NNN, $/sqft)</span>
      </div>
      <ul className="cc-hbar-list">
        {items.map((it, i) => {
          const pct = (it.val / max) * 100;
          const color = tagColor[it.tag] || palette.stable;
          return (
            <li key={i} className="cc-hbar-row">
              <span className="cc-hbar-label">{it.label}</span>
              <div className="cc-hbar-track">
                <div className="cc-hbar-fill" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="cc-hbar-val">${it.val.toFixed(2)}</span>
            </li>
          );
        })}
      </ul>
      <div className="cc-card-foot">
        <span>Median $32.50 · range $16.50–$45.00</span>
      </div>
    </div>
  );
};

// ============================================================
// Card 4 — Comparison table
// ============================================================
window.CompareTable = function CompareTable({ palette }) {
  const rows = [
    { name: "North Naples",     ev: "stable",        cap: 5.8, vac: 4.2,  abs: 120500, rent: 42.50 },
    { name: "Alico Industrial", ev: "growing",       cap: 6.0, vac: 3.0,  abs: 185000, rent: 16.50 },
    { name: "Fort Myers Beach", ev: "repositioning", cap: 8.5, vac: 18.0, abs: -5000,  rent: 45.00 },
    { name: "Cape Coral Pkwy",  ev: "growing",       cap: 6.2, vac: 5.0,  abs: 32000,  rent: 32.50 },
  ];

  const cell = (v, dir, good, fmt) => {
    const isGood = (dir === "up" && good === "up") || (dir === "down" && good === "down");
    const same = dir === "flat";
    const color = same ? "var(--text-secondary)" : isGood ? palette.growing : palette.declining;
    return (
      <span className="cc-tcell-mv">
        {fmt(v)}
        <span style={{ color }} className="cc-tcell-arrow">{arrow(dir)}</span>
      </span>
    );
  };

  // Heuristic: cap and vac fall → good; abs and rent rise → good.
  const dir = (v, baseline) => v < baseline ? "down" : v > baseline ? "up" : "flat";

  return (
    <div className="cc-card">
      <div className="cc-card-head">
        <span className="cc-card-eyebrow">Comparison</span>
        <span className="cc-card-title">4 corridors compared</span>
      </div>
      <table className="cc-cmp">
        <thead>
          <tr>
            <th></th>
            <th>Cap</th>
            <th>Vac</th>
            <th>Abs</th>
            <th>Rent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>
                <span className="cc-cmp-dot" style={{ background: palette[r.ev] }} />
                <span className="cc-cmp-name">{r.name}</span>
              </td>
              <td>{cell(r.cap, dir(r.cap, 6.5), "down", (v) => v.toFixed(1) + "%")}</td>
              <td>{cell(r.vac, dir(r.vac, 6.0), "down", (v) => v.toFixed(1) + "%")}</td>
              <td>{cell(r.abs, dir(r.abs, 32000), "up", (v) => (v >= 1000 || v <= -1000) ? (v / 1000).toFixed(0) + "K" : String(v))}</td>
              <td>{cell(r.rent, dir(r.rent, 32.5), "up", (v) => "$" + v.toFixed(0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cc-card-foot">
        <span>Arrows colored by movement vs the pack</span>
      </div>
    </div>
  );
};

// ============================================================
// Card 5 — Donut / share breakdown
// ============================================================
window.DonutCard = function DonutCard({ palette }) {
  const entries = [
    ["highway strip mall", 2],
    ["mixed-use downtown", 1],
    ["anchor-dependent",   1],
    ["suburban residential", 1],
    ["beachfront tourism", 1],
    ["medical anchored",   1],
    ["industrial flex",    1],
  ];
  const total = entries.reduce((a, [, v]) => a + v, 0);
  const colorAt = (i) => [palette.stable, palette.growing, palette.repositioning, palette.declining, "#8C7BB8", "#B87B91", "#7BB8A4"][i % 7];

  const cx = 90, cy = 90, R = 70, r = 44;
  let acc = 0;
  const slices = entries.map(([type, v], i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += v;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const p = (a) => [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
    const q = (a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const [x0, y0] = p(a0), [x1, y1] = p(a1), [x2, y2] = q(a1), [x3, y3] = q(a0);
    return {
      type, count: v, color: colorAt(i),
      d: `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`,
    };
  });

  return (
    <div className="cc-card">
      <div className="cc-card-head">
        <span className="cc-card-eyebrow">Composition</span>
        <span className="cc-card-title">Corridor type breakdown</span>
      </div>
      <div className="cc-donut-body">
        <svg viewBox="0 0 180 180" className="cc-donut">
          {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
          <text x={cx} y={cy - 6} textAnchor="middle" className="cc-donut-big">{total}</text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="cc-donut-small">corridors</text>
        </svg>
        <ul className="cc-donut-legend">
          {slices.map((s, i) => (
            <li key={i}>
              <span className="cc-leg-sw" style={{ background: s.color }} />
              <span className="cc-leg-lbl">{s.type}</span>
              <span className="cc-leg-val">{s.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// ============================================================
// Card 6 — Dot distribution
// ============================================================
window.DotPlot = function DotPlot({ palette }) {
  const items = [
    { label: "North Naples",     val: 5.8, ev: "stable" },
    { label: "Alico Industrial", val: 6.0, ev: "growing" },
    { label: "Cape Coral Pkwy",  val: 6.2, ev: "growing" },
    { label: "Pine Ridge Rd",    val: 6.5, ev: "stable" },
    { label: "Bonita Springs",   val: 7.0, ev: "stable" },
    { label: "Estero (anchor)",  val: 7.5, ev: "repositioning" },
    { label: "Fort Myers Beach", val: 8.5, ev: "repositioning" },
  ];
  const min = 5, max = 9;
  const median = 6.5;
  const W = 540, H = 96, PAD_L = 16, PAD_R = 16;
  const innerW = W - PAD_L - PAD_R;
  const xPos = (v) => PAD_L + ((v - min) / (max - min)) * innerW;

  return (
    <div className="cc-card">
      <div className="cc-card-head">
        <span className="cc-card-eyebrow">Distribution</span>
        <span className="cc-card-title">Cap rates across the pack</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="cc-dotplot">
        <line x1={PAD_L} y1={H - 28} x2={W - PAD_R} y2={H - 28} stroke="var(--gulf-haze)" strokeWidth="1" />
        {[5, 6, 7, 8, 9].map((t) => (
          <g key={t}>
            <line x1={xPos(t)} x2={xPos(t)} y1={H - 32} y2={H - 24} stroke="var(--gulf-haze)" strokeWidth="1" />
            <text x={xPos(t)} y={H - 8} textAnchor="middle" className="cc-axis-tick">{t}%</text>
          </g>
        ))}
        <line x1={xPos(median)} x2={xPos(median)} y1={20} y2={H - 28} stroke={palette.stable} strokeDasharray="2 3" strokeWidth="1" />
        <text x={xPos(median)} y={14} textAnchor="middle" className="cc-axis-tick" fill={palette.stable}>MEDIAN {median}%</text>
        {items.map((it, i) => {
          const x = xPos(it.val);
          const y = H - 28 - 18;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="6" fill={palette[it.ev]} fillOpacity="0.25" />
              <circle cx={x} cy={y} r="3.5" fill={palette[it.ev]} />
            </g>
          );
        })}
      </svg>
      <div className="cc-card-foot">
        <span>Range 5.8% (tight) → 8.5% (loose)</span>
      </div>
    </div>
  );
};

// ============================================================
// Card 7 — Direction / verdict bars
// ============================================================
window.VerdictBars = function VerdictBars({ palette }) {
  const items = [
    { label: "SWFL CRE",      dir: "bullish",  mag: 0.86, conf: 0.91 },
    { label: "Building permits", dir: "neutral",  mag: 0.42, conf: 0.78 },
    { label: "Freight nowcast",  dir: "neutral",  mag: 0.04, conf: 0.91 },
    { label: "Environment",   dir: "bearish",  mag: 0.67, conf: 0.84 },
  ];
  const dirColor = (d) =>
    d === "bullish" ? palette.growing
    : d === "bearish" ? palette.declining
    : palette.stable;

  return (
    <div className="cc-card">
      <div className="cc-card-head">
        <span className="cc-card-eyebrow">4 signals</span>
        <span className="cc-card-title">Direction × magnitude</span>
      </div>
      <ul className="cc-verdict-list">
        {items.map((b, i) => (
          <li key={i} className="cc-verdict-row">
            <span className="cc-verdict-name">{b.label}</span>
            <span className="cc-verdict-pill" style={{ color: dirColor(b.dir), borderColor: dirColor(b.dir) }}>
              {b.dir}
            </span>
            <div className="cc-mag-track">
              <div className="cc-mag-fill" style={{ width: `${b.mag * 100}%`, background: dirColor(b.dir) }} />
            </div>
            <span className="cc-verdict-conf">{(b.conf * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
      <div className="cc-card-foot">
        <span>Confidence on the right · magnitude 0–1</span>
      </div>
    </div>
  );
};

// ============================================================
// Card 8 — Sparkline list
// ============================================================
window.SparkList = function SparkList({ palette }) {
  const series = [
    { label: "Median cap rate",  val: "6.5%",     data: [6.95, 6.92, 6.88, 6.78, 6.70, 6.61, 6.50],     good: true },
    { label: "Median vacancy",   val: "6.0%",     data: [6.8, 6.7, 6.6, 6.4, 6.3, 6.2, 6.0],             good: true },
    { label: "Median absorption",val: "32K sqft", data: [25, 26, 27, 29, 30, 31, 32],                    good: true },
    { label: "Median rent PSF",  val: "$32.50",   data: [31.2, 31.3, 31.5, 31.8, 32.0, 32.2, 32.5],      good: true },
  ];

  const Spark = ({ data, color }) => {
    const W = 100, H = 28;
    const min = Math.min(...data), max = Math.max(...data);
    const path = data.map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / (max - min || 1)) * H;
      return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="cc-sl-spark" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div className="cc-card">
      <div className="cc-card-head">
        <span className="cc-card-eyebrow">12 months</span>
        <span className="cc-card-title">Pack medians with trends</span>
      </div>
      <ul className="cc-sl-list">
        {series.map((s, i) => (
          <li key={i} className="cc-sl-row">
            <span className="cc-sl-label">{s.label}</span>
            <Spark data={s.data} color={s.good ? palette.growing : palette.declining} />
            <span className="cc-sl-val">{s.val}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
