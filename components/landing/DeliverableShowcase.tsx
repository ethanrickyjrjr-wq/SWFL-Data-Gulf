/**
 * Deliverable showcase (Lane B spec §4) — "builds free, pay to send" shown as
 * product-in-action. The preview pane renders REAL loader figures (the same
 * live rows the map draws) as a miniature branded-email frame — real output
 * shape, real numbers, never abstract art. When the loader served sample data
 * the preview hides rather than showcase mock figures as the product.
 */
export interface ShowcaseFigures {
  zip: string;
  place: string;
  value?: string;
  listings?: string;
  dom?: string;
  asOf?: string;
}

const STEPS = [
  {
    title: "Describe it",
    desc: "“Weekly market read for my Naples buyers — values, fresh listings, flood context.”",
  },
  {
    title: "AI builds it from live data",
    desc: "Every figure pulled from the lake and cited. Your brand, your voice, zero spreadsheets.",
  },
  {
    title: "It sends on schedule",
    desc: "To every client, automatically. You review the first one; the engine handles the rest.",
  },
];

export default function DeliverableShowcase({ figures }: { figures: ShowcaseFigures | null }) {
  return (
    <section className="showcase" id="how-it-works">
      <div className="cap-eyebrow">The report writes itself</div>
      <h2 className="cap-headline">
        Describe the report once. <span>It shows up in inboxes forever.</span>
      </h2>
      <div className="showcase-grid">
        <ol className="showcase-steps">
          {STEPS.map((s, i) => (
            <li className="showcase-step" key={s.title}>
              <span className="showcase-step-n">{i + 1}</span>
              <div>
                <div className="showcase-step-title">{s.title}</div>
                <div className="showcase-step-desc">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>
        {figures && (
          <div
            className="showcase-preview"
            aria-label={`Example email built from live ${figures.place} data`}
          >
            <div className="showcase-mail">
              <div className="showcase-mail-bar">
                <span className="showcase-mail-dot" />
                <span className="showcase-mail-dot" />
                <span className="showcase-mail-dot" />
              </div>
              <div className="showcase-mail-subject">
                This week in {figures.place} ({figures.zip})
              </div>
              <div className="showcase-mail-body">
                {figures.value && (
                  <div className="showcase-fig">
                    <span className="showcase-fig-label">Median home value</span>
                    <span className="showcase-fig-val">{figures.value}</span>
                  </div>
                )}
                {figures.listings && (
                  <div className="showcase-fig">
                    <span className="showcase-fig-label">Active listings</span>
                    <span className="showcase-fig-val">{figures.listings}</span>
                  </div>
                )}
                {figures.dom && (
                  <div className="showcase-fig">
                    <span className="showcase-fig-label">Avg days on market</span>
                    <span className="showcase-fig-val">{figures.dom}</span>
                  </div>
                )}
                <div className="showcase-mail-cite">
                  Live figures{figures.asOf ? ` · as of ${figures.asOf}` : ""} · sources cited in
                  every send
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="cap-cta-row">
        <a className="cap-btn" href="/email-lab">
          Build one free — no credit card
        </a>
        <p>
          <strong>Watermarked until you send.</strong> Building costs nothing, ever.
        </p>
      </div>
    </section>
  );
}
