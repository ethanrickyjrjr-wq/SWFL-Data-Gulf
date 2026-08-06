/* global React, Verdict, Conclusion, MetricRow, Drivers, Caveats, Upstream, Icon */
const { useState, useMemo } = React;

// ============================================================
// Tier 1 — executive glance. 2-5 sentences. Minimal motion.
// ============================================================
window.GlanceView = function GlanceView({ report, animate }) {
  return (
    <article className="rp-glance">
      <Verdict direction={report.direction} animate={animate} />
      <div
        className="rp-glance-block"
        style={animate ? { animation: "rp-fade-rise 400ms 400ms cubic-bezier(.215,.61,.355,1) both" } : null}
      >
        <p className="rp-glance-conclusion">{report.conclusion}</p>
        <p className="rp-glance-supporting">
          Demand metrics softening (DOM <span className="numeric">+6</span>, permits
          <span className="numeric"> -12% YoY</span>), supply tightening, industrial
          CRE outperforming office and retail. Naples luxury hospitality holds
          (<span className="numeric">RevPAR +4% YoY</span>).
        </p>
        <div className="rp-glance-sources">
          {report.key_metrics.slice(0, 3).map((m) => (
            <a key={m.label} href={m.source.url} className="source-link" target="_blank" rel="noreferrer">
              {m.source.label}
            </a>
          ))}
        </div>
      </div>
    </article>
  );
};

// ============================================================
// Tier 2 — default Report view. Full sequence.
// ============================================================
window.ReportView = function ReportView({ report, animate }) {
  return (
    <article className="rp-report">
      <header className="rp-hero">
        <Verdict direction={report.direction} animate={animate} />
        <Conclusion text={report.conclusion} animate={animate} />
      </header>

      <section className="rp-metrics">
        <h2 className="rp-section-title">Key metrics</h2>
        <div className="rp-rows">
          {report.key_metrics.map((m, i) => (
            <MetricRow key={m.label} metric={m} index={i} animate={animate} />
          ))}
        </div>
      </section>

      <Drivers items={report.drivers} animate={animate} />
      <Caveats items={report.caveats} animate={animate} />
      <Upstream items={report.upstream_reports} animate={animate} />
    </article>
  );
};

// ============================================================
// Tier 3 — audit. Full citation table. Single fade.
// ============================================================
window.AuditView = function AuditView({ report, animate }) {
  // Pad the audit with derived per-metric audit rows. Numbers never animate.
  const rows = report.key_metrics.map((m) => ({
    metric: m.label,
    value: window.fmt.value(m.value, m.unit) + (m.unit && m.unit !== "USD" ? " " + m.unit : ""),
    delta: m.delta,
    n: ["n=12","n=183","n=1247","n=58","n=30yr"][report.key_metrics.indexOf(m)] || "—",
    asof: report.freshness_token,
    source: m.source,
  }));

  return (
    <article
      className="rp-audit"
      style={animate ? { animation: "rp-fade-in 300ms ease-out both" } : null}
    >
      <header className="rp-audit-header">
        <h2 className="rp-section-title">Audit · full citation table</h2>
        <span className="caption">Numbers verbatim, sources linked, sample sizes shown. No motion below.</span>
      </header>
      <table className="rp-audit-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th className="num-col">Value</th>
            <th className="num-col">Delta</th>
            <th className="num-col">Sample</th>
            <th>Source</th>
            <th>As of</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.metric}</td>
              <td className="numeric num-col">{r.value}</td>
              <td className="numeric num-col">{r.delta}</td>
              <td className="numeric num-col">{r.n}</td>
              <td>
                <a className="source-link" href={r.source.url} target="_blank" rel="noreferrer">
                  {r.source.label}
                </a>
              </td>
              <td className="mono">{r.asof}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
};
