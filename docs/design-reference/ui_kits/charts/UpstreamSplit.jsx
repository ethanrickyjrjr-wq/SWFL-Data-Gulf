/* global React */
const { useEffect, useRef, useState } = React;

// ============================================================
// UpstreamSplit — ACTIVE FLAGS by type, with the corridors carrying
// each flag named inline.
// ============================================================

window.UpstreamSplit = function UpstreamSplit({ palette }) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setRevealed(true)),
      { threshold: 0.25 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  // Group all flags across corridors by flag type.
  const grouped = {};
  for (const c of window.CORRIDORS) {
    for (const f of c.flags) {
      if (!grouped[f.type]) grouped[f.type] = [];
      grouped[f.type].push({ ...f, corridor: c });
    }
  }
  const order = ["new_project", "regulatory", "infrastructure", "construction", "status_update"];
  const total = Object.values(grouped).reduce((a, arr) => a + arr.length, 0);

  return (
    <div className="cv-bars" ref={ref}>
      {order.filter((k) => grouped[k]).map((k, i) => {
        const items = grouped[k];
        const meta = window.FLAG_TYPES[k];
        const barColor = palette["flag_" + k] || meta.color;
        const pct = (items.length / total) * 100;
        return (
          <div key={k} className="cv-bar-row">
            <span className="cv-bar-label" style={{ color: barColor }}>
              {meta.label}
              <span className="cv-bar-count">{items.length}</span>
            </span>
            <div className="cv-bar-track">
              <div
                className="cv-bar-fill"
                style={{
                  width: revealed ? `${pct}%` : "0%",
                  background: barColor,
                  "--bar-glow": `color-mix(in srgb, ${barColor} 40%, transparent)`,
                  transitionDelay: `${i * 80}ms`,
                }}
              />
              <span className="cv-bar-pct">{Math.round(pct)}%</span>
            </div>
            <div className="cv-bar-corridors">
              {items.map((it, j) => (
                <span key={j} className="cv-bar-corridor-tag" title={it.text}>{it.corridor.short}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
