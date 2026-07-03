/**
 * Objection FAQ (Lane B spec §7) — plain-text Q&As, each killing one real
 * objection. No tables, no blockquotes (output rules).
 */
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Where do the numbers come from?",
    a: "Named sources — Zillow ZHVI, FEMA NFIP, the U.S. Census, and our own SWFL listing data. Every answer and every report cites its sources with an as-of date. If we don't hold a number, we say so — we never make one up.",
  },
  {
    q: "Is this only Lee and Collier counties?",
    a: "The map covers Lee and Collier today. Answers and reports draw on data across six Southwest Florida counties, and coverage keeps widening.",
  },
  {
    q: "Do I need a credit card?",
    a: "No. Building reports and asking questions is free. You pay only when you want the engine to send on your behalf.",
  },
  {
    q: "Can I put my brand on the reports?",
    a: "Yes — your logo, colors, contact block, and voice. Clients see your brand, not ours.",
  },
  {
    q: "Can I cancel?",
    a: "Anytime. No contract, no minimum term.",
  },
];

export default function ObjectionFaq() {
  return (
    <section className="faq" aria-label="Common questions">
      <h2 className="faq-headline">Fair questions</h2>
      <div className="faq-list">
        {FAQS.map((f) => (
          <div className="faq-item" key={f.q}>
            <div className="faq-q">{f.q}</div>
            <div className="faq-a">{f.a}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
