import { TrendingUp, DollarSign, BarChart3, MapPin } from "lucide-react";

export default function Capabilities() {
  return (
    <section className="capabilities" id="comparison">
      <div className="cap-eyebrow">Real questions. Real data. Real answers.</div>
      <h2 className="cap-headline">
        Whatever you need to know about SWFL&mdash; <span>we have the data.</span>
      </h2>
      <p className="cap-deck">
        Flood risk, home values, permit activity, listing inventory. AI reads it all and answers the
        question you actually came to ask.
      </p>

      <div className="cap-grid">
        <div className="cap-card">
          <span className="cap-icon" aria-hidden="true">
            <TrendingUp size={22} />
          </span>
          <div className="cap-card-title">
            &ldquo;Is this a good time to buy in Cape Coral?&rdquo;
          </div>
          <div className="cap-card-desc">
            Compare asking prices to historical values, check how long homes are sitting, see permit
            activity and flood exposure&mdash;one cited answer.
          </div>
          <div className="cap-chips">
            <span className="cap-chip">Buyers</span>
            <span className="cap-chip">ZIP Analysis</span>
            <span className="cap-chip">Cited Data</span>
          </div>
        </div>

        <div className="cap-card">
          <span className="cap-icon" aria-hidden="true">
            <DollarSign size={22} />
          </span>
          <div className="cap-card-title">
            &ldquo;What should I price my Fort Myers Beach home?&rdquo;
          </div>
          <div className="cap-card-desc">
            DOM per ZIP, price-cut trends, YoY value direction, active supply. The answer is what
            the market will pay&mdash;not what you hope.
          </div>
          <div className="cap-chips">
            <span className="cap-chip">Sellers</span>
            <span className="cap-chip">Pricing</span>
            <span className="cap-chip">No Guessing</span>
          </div>
        </div>

        <div className="cap-card">
          <span className="cap-icon" aria-hidden="true">
            <BarChart3 size={22} />
          </span>
          <div className="cap-card-title">
            &ldquo;Build me a daily market brief for my clients.&rdquo;
          </div>
          <div className="cap-card-desc">
            Describe the report. AI writes it from live data, adds charts and commentary, and sends
            it on schedule&mdash;to every client, automatically.
          </div>
          <div className="cap-chips">
            <span className="cap-chip">Brokers</span>
            <span className="cap-chip">Auto-Send</span>
            <span className="cap-chip">Daily Updates</span>
          </div>
        </div>

        <div className="cap-card">
          <span className="cap-icon" aria-hidden="true">
            <MapPin size={22} />
          </span>
          <div className="cap-card-title">
            &ldquo;Where in SWFL is growth actually happening?&rdquo;
          </div>
          <div className="cap-card-desc">
            Permit activity, inventory shifts, price direction across 57 ZIPs. The map shows where
            the momentum is before anyone else does.
          </div>
          <div className="cap-chips">
            <span className="cap-chip">Investors</span>
            <span className="cap-chip">Market Trends</span>
            <span className="cap-chip">57 ZIPs</span>
          </div>
        </div>
      </div>

      <div className="comp-strip">
        <div className="comp-label">What everyone else charges for this</div>
        <div className="comp-row">
          <div className="comp-item">
            <div className="comp-name">Mailchimp</div>
            <div className="comp-what">Email automation</div>
            <div className="comp-price">$68+/mo — build it yourself</div>
          </div>
          <div className="comp-item">
            <div className="comp-name">Constant Contact</div>
            <div className="comp-what">Scheduled campaigns</div>
            <div className="comp-price">$68/mo — manual workflow setup</div>
          </div>
          <div className="comp-item">
            <div className="comp-name">Follow Up Boss</div>
            <div className="comp-what">AI + automation for RE teams</div>
            <div className="comp-price">$499/mo for 10 users</div>
          </div>
          <div className="comp-item comp-us">
            <div className="comp-name">SWFL Data Gulf</div>
            <div className="comp-what">All of it — just ask</div>
            <div className="comp-price-us">Included.</div>
          </div>
        </div>
      </div>

      <div className="cap-cta-row">
        <a className="cap-btn" href="#waitlist">
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
          Get Access
        </a>
        <p>
          <strong>Realtors, investors, and property managers</strong> in Southwest Florida — built
          for how you actually work.
        </p>
      </div>
    </section>
  );
}
