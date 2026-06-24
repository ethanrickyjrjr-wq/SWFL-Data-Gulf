/**
 * Capabilities section from the approved HOMEPAGE/ demo — 4 capability cards,
 * a real-price competitor comparison strip (crawl4ai-sourced), and the CTA.
 * Static; styles live in home-explorer.css (namespaced under .home-explorer).
 */
import { Zap, FileText, Users, CalendarClock } from "lucide-react";

export default function Capabilities() {
  return (
    // id="comparison" is the nav "How It Works" anchor target (this section carries the
    // capability cards + the competitor comparison strip).
    <section className="capabilities" id="comparison">
      <div className="cap-eyebrow">What you can do</div>
      <h2 className="cap-headline">
        Tell it what you want. <span>It happens.</span>
      </h2>
      <p className="cap-deck">
        No workflow builders. No drip sequence setup. No $499/mo CRM. Just say what you need.
      </p>

      <div className="cap-grid">
        <div className="cap-card">
          <span className="cap-icon" aria-hidden="true">
            <Zap size={22} />
          </span>
          <div className="cap-card-title">Ask anything. Get the answer.</div>
          <div className="cap-card-desc">
            Any market question, any ZIP. Real numbers, right now.
          </div>
        </div>

        <div className="cap-card">
          <span className="cap-icon" aria-hidden="true">
            <FileText size={22} />
          </span>
          <div className="cap-card-title">Describe it. AI builds it.</div>
          <div className="cap-card-desc">
            Market summary, flood analysis, investment memo. Say what you need&mdash;it&rsquo;s
            ready.
          </div>
        </div>

        <div className="cap-card">
          <span className="cap-icon" aria-hidden="true">
            <Users size={22} />
          </span>
          <div className="cap-card-title">Add clients. AI tracks everything.</div>
          <div className="cap-card-desc">
            Drop in properties or clients. AI monitors what changes and tells you first.
          </div>
        </div>

        <div className="cap-card">
          <span className="cap-icon" aria-hidden="true">
            <CalendarClock size={22} />
          </span>
          <div className="cap-card-title">Scheduled. Automatic. Just say when.</div>
          <div className="cap-card-desc">
            &ldquo;Email my clients every month.&rdquo; Done. AI writes it from live data,
            personalizes it for each client, and sends on schedule&mdash;forever. No workflow to
            build.
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
