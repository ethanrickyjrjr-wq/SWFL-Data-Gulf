import { TrendingUp, DollarSign, BarChart3, MapPin } from "lucide-react";
import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";

/**
 * Persona cards (Lane B spec §3) — each card IS its question: the whole card
 * links to /ask?q=<the question> so the feature demos itself on the live
 * assistant. The named-competitor strip is gone (locked no-trash-talk rule);
 * the deliverable showcase carries the "what this replaces" job with category
 * framing instead.
 */
const CARDS = [
  {
    icon: TrendingUp,
    q: "Is this a good time to buy in Cape Coral?",
    desc: "Compare asking prices to historical values, check how long homes are sitting, see permit activity and flood exposure—one cited answer.",
    chips: ["Buyers", "ZIP Analysis", "Cited Data"],
  },
  {
    icon: DollarSign,
    q: "Is Fort Myers Beach a buyer's or seller's market right now?",
    desc: "Days on market, price-cut trends, YoY value direction, active supply. The answer is what the market is actually doing—not a guess.",
    chips: ["Sellers", "Pricing", "No Guessing"],
  },
  {
    icon: BarChart3,
    q: "Build me a daily market brief for my clients.",
    desc: "Describe the report. AI writes it from live data, adds charts and commentary, and sends it on schedule—to every client, automatically.",
    chips: ["Brokers", "Auto-Send", "Daily Updates"],
  },
  {
    icon: MapPin,
    q: "Where in SWFL is growth actually happening?",
    desc: "Listing activity, inventory shifts, price direction across the region. The map shows where the momentum is before anyone else does.",
    chips: ["Investors", "Market Trends", "Live Map"],
  },
];

export default function Capabilities() {
  return (
    <section className="capabilities" id="comparison">
      <div className="cap-eyebrow">Real questions. Real data. Real answers.</div>
      <h2 className="cap-headline">
        Whatever you need to know about SWFL&mdash; <span>we have the data.</span>
      </h2>
      <p className="cap-deck">
        Flood risk, home values, listing activity, market direction. AI reads it all and answers the
        question you actually came to ask &mdash; click any card to ask it live.
      </p>

      <div className="cap-grid">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <a className="cap-card" key={c.q} href={`/ask?q=${encodeURIComponent(c.q)}`}>
              <span className="cap-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <div className="cap-card-title">&ldquo;{c.q}&rdquo;</div>
              <div className="cap-card-desc">{c.desc}</div>
              <div className="cap-chips">
                {c.chips.map((chip) => (
                  <span className="cap-chip" key={chip}>
                    {chip}
                  </span>
                ))}
              </div>
              <span className="cap-card-go" aria-hidden="true">
                Ask it →
              </span>
            </a>
          );
        })}
      </div>

      <div className="cap-cta-row">
        <a className="cap-btn" href={EMAIL_LAB_LANDING}>
          <svg
            width="15"
            height="15"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          Build one free
        </a>
        <p>
          <strong>Realtors, investors, and property managers</strong> in Southwest Florida — built
          for how you actually work.
        </p>
      </div>
    </section>
  );
}
