/* global React */
const { useState } = React;

const CLIENTS = [
  { id: "claude",  label: "Claude",   cmd: "claude mcp add swfl npx @swfl/connect" },
  { id: "cursor",  label: "Cursor",   cmd: "cursor mcp add swfl npx @swfl/connect" },
  { id: "chatgpt", label: "ChatGPT",  cmd: "open https://chat.openai.com/g/swfl-data-gulf" },
];

const COVERAGE = [
  "Lee housing",
  "Collier housing",
  "SWFL CRE — office, retail, multifamily, industrial",
  "Building permits (Accela)",
  "Tourism (TDT) & Naples RevPAR",
  "Hurricane & flood risk (NOAA + FEMA NFIP)",
  "Logistics corridors (FDOT, BTS FAF5)",
  "Macro context — Florida & national",
  "Population & migration (Census)",
];

function Wave({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path d="M10 28 C 18 22, 26 22, 32 28 C 38 34, 46 34, 54 28" stroke="#3DC9C0" strokeWidth="3" strokeLinecap="round"/>
      <path d="M10 40 C 18 34, 26 34, 32 40 C 38 46, 46 46, 54 40" stroke="#3DC9C0" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
      <path d="M10 52 C 18 46, 26 46, 32 52 C 38 58, 46 58, 54 52" stroke="#3DC9C0" strokeWidth="3" strokeLinecap="round" opacity="0.3"/>
    </svg>
  );
}

function InstallBlock() {
  const [client, setClient] = useState("claude");
  const [copied, setCopied] = useState(false);
  const cmd = CLIENTS.find((c) => c.id === client).cmd;

  const copy = () => {
    navigator.clipboard?.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="cn-install cn-anim-3">
      <div className="cn-install-tabs">
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            className={"cn-install-tab" + (client === c.id ? " is-active" : "")}
            onClick={() => setClient(c.id)}
          >{c.label}</button>
        ))}
      </div>
      <div className="cn-install-block">
        <span className="cn-install-cmd">
          <span className="prompt">$</span>{cmd}
        </span>
        <button className={"cn-install-copy" + (copied ? " is-copied" : "")} onClick={copy}>
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Copied
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SampleReportTease() {
  return (
    <section className="cn-tease cn-anim-4">
      <div className="cn-tease-frame">
        <header className="cn-tease-chrome">
          <span className="cn-tease-url">swflgulf.app/r/master</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>SWFL-7421-v5-20260522</span>
        </header>
        <div className="cn-tease-verdict">
          <h2 className="verdict" data-direction="mixed" style={{ fontSize: 56, lineHeight: 1, margin: 0 }}>mixed</h2>
          <p className="cn-tease-conclusion">
            SWFL housing is cooling on demand metrics while supply tightens;
            commercial real estate diverges sharply by corridor with industrial
            outperforming office and retail.
          </p>
        </div>
        <div className="cn-tease-grid">
          {[
            { label: "Median DOM, Lee SF",    value: "51",     unit: "days",   delta: "+6 mo/mo",  color: "#5BC97A" },
            { label: "Cap rate, Lee multi",   value: "5.42",   unit: "%",      delta: "+18 bps",   color: "#5BC97A" },
            { label: "Permits MTD, Lee",      value: "1,247",  unit: "permits",delta: "-12% YoY",  color: "#E08158" },
          ].map((m) => (
            <div className="cn-tease-cell" key={m.label}>
              <span className="metric-label" style={{ fontSize: 10 }}>{m.label}</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span className="metric-value" style={{ fontSize: 28 }}>{m.value}</span>
                <span className="metric-unit">{m.unit}</span>
              </span>
              <span className="numeric" style={{ color: m.color, fontSize: 12 }}>{m.delta}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Waitlist() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 1500);
  };
  return (
    <section className="cn-wait">
      <h2>The coverage so far</h2>
      <p className="cn-wait-sub">Ten topic domains live today. Working data, sourced datasets, fresh refreshes. Get notified when the next surface ships.</p>

      <form className="cn-wait-form" onSubmit={submit}>
        <input
          className="cn-wait-input"
          type="email"
          placeholder="you@firm.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="cn-wait-submit" type="submit">
          {submitted ? "On the list ✓" : "Get notified"}
        </button>
      </form>

      <div className="cn-wait-coverage">
        <span className="cn-wait-cov-title">Topic domains</span>
        <div className="cn-wait-rows">
          {COVERAGE.map((c) => (
            <div className="cn-wait-row" key={c}>
              <span className="cn-wait-tick">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              {c}
            </div>
          ))}
        </div>
        <span className="cn-wait-privacy">No tracking. No marketing email. One note when the next coverage area lands.</span>
      </div>
    </section>
  );
}

function Nav() {
  return (
    <nav className="cn-nav">
      <a className="cn-brand" href="#">
        <Wave size={20} />
        <span className="cn-wordmark">SWFL DATA GULF</span>
      </a>
      <div className="cn-nav-links">
        <a href="#">Coverage</a>
        <a href="#">Sample report</a>
        <a href="../report/index.html">Open app</a>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="cn-foot">
      <span>© 2026 SWFL Data Gulf · Lee · Collier</span>
      <span>Sourced. Fresh. Surgical.</span>
    </footer>
  );
}

function App() {
  return (
    <>
      <Nav />
      <section className="cn-hero">
        <span className="cn-eyebrow cn-anim-1">
          <span className="cn-eyebrow-dot" />
          Now in beta · Lee, Collier
        </span>
        <h1 className="cn-hero-h1 cn-anim-1">
          Real answers about <span className="accent">Southwest Florida</span>.
        </h1>
        <p className="cn-hero-sub cn-anim-2">
          Install once. Your AI gets sourced data on housing, CRE, permits,
          traffic, tourism, hurricane risk, and the macro context behind them.
          Sourced. Fresh. Surgical.
        </p>
        <InstallBlock />
      </section>
      <SampleReportTease />
      <Waitlist />
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
