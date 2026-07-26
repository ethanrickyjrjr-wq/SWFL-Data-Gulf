// components/why-not-selling/WinsRead.tsx — the Why Isn't It Selling report body.
// Server component: check cards (headline + sourced figures), the area context strip,
// the ALWAYS-rendered honesty block, and the track-it form (dark sender — the POST
// stores a watch; no email goes out until wins_watch_email_live closes).
//
// Styling: the shared /r/ report family (report-shell.tsx canvas) — same classes as
// BackOnMarketRead; no page-local class names. Every figure renders
// "label: value · source, as of MM/DD/YYYY". No system nouns anywhere.
import type { WinsReport } from "@/lib/why-not-selling/load-report";
import type { CheckResult } from "@/lib/why-not-selling/types";

function CheckCard({ check }: { check: CheckResult }) {
  return (
    <div
      className={`rounded-lg border px-4 py-4 ${
        check.status === "flag"
          ? "border-amber-400/40 bg-amber-400/[0.06]"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gulf-teal">
          {check.title}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            check.status === "flag"
              ? "bg-amber-400/15 text-amber-300"
              : "bg-white/[0.06] text-gray-400"
          }`}
        >
          {check.status === "flag" ? "worth attention" : "looks normal"}
        </span>
      </div>
      {check.headline && <p className="mt-2 text-base leading-7 text-gray-200">{check.headline}</p>}
      {check.figures.length > 0 && (
        <ul className="mt-3 space-y-1">
          {check.figures.map((f, i) => (
            <li key={i} className="text-sm leading-6 text-gray-400">
              {f.label}: <span className="text-gray-200">{f.value}</span>
              <span className="text-gray-500">
                {" "}
                · {f.source}, as of {f.asOf}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WinsRead({
  report,
  q,
  watchSaved,
}: {
  report: WinsReport;
  q: string;
  watchSaved: boolean;
}) {
  const { subject, subjectMiss, checks, areaFigures, place, zip } = report;
  return (
    <section className="mt-8 space-y-6">
      {watchSaved && (
        <p className="rounded-lg border border-gulf-teal/40 bg-gulf-teal/10 px-4 py-3 text-sm leading-6 text-gray-200">
          Saved — we&rsquo;ll keep reading this home against the market.
        </p>
      )}

      {subject ? (
        <h2 className="text-xl font-semibold tracking-tight text-gulf-teal">
          {subject.display} · {place}
        </h2>
      ) : (
        <h2 className="text-xl font-semibold tracking-tight text-gulf-teal">
          The market read for {place} · {zip}
        </h2>
      )}

      {subjectMiss && (
        <p className="text-base leading-7 text-gray-300">
          We don&rsquo;t see an active listing at this address — here&rsquo;s the area read.
        </p>
      )}

      <div className="space-y-4">
        {checks.map((c) => (
          <CheckCard key={c.id} check={c} />
        ))}
      </div>

      {areaFigures.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gulf-teal">
            The field around it
          </h3>
          <ul className="mt-3 space-y-1">
            {areaFigures.map((f, i) => (
              <li key={i} className="text-sm leading-6 text-gray-400">
                {f.label}: <span className="text-gray-200">{f.value}</span>
                <span className="text-gray-500">
                  {" "}
                  · {f.source}, as of {f.asOf}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The honesty block — ALWAYS rendered (spec). */}
      <p className="max-w-2xl text-sm leading-7 text-gray-300">
        What the data can&rsquo;t see: condition, photos, staging, and what buyers said after
        showings. Those live with people, not records — it&rsquo;s exactly where a good local agent
        earns their fee.
      </p>

      {subject && (
        <form
          method="post"
          action="/api/report-watch"
          className="max-w-xl space-y-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-4"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gulf-teal">
            Track this home
          </h3>
          <p className="text-sm leading-6 text-gray-400">
            We&rsquo;ll re-run this report as the market moves and email you what changed — until it
            sells.
          </p>
          <input type="hidden" name="address_key" value={subject.addressKey} />
          <input type="hidden" name="zip" value={subject.zip} />
          <input type="hidden" name="q" value={q} />
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              name="email"
              required
              placeholder="you@example.com"
              aria-label="Email address"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:border-gulf-teal/60 focus:outline-none focus:ring-1 focus:ring-gulf-teal/40"
            />
            <button
              type="submit"
              className="btn-gradient inline-flex shrink-0 items-center rounded-lg px-5 py-3 text-sm font-semibold text-navy-dark transition-all hover:opacity-90"
            >
              Track it
            </button>
          </div>
          <label className="flex items-start gap-2 text-sm leading-6 text-gray-400">
            <input type="checkbox" name="agent_optin" className="mt-1" />
            <span>Have one vetted local agent review this report with me (optional)</span>
          </label>
        </form>
      )}
    </section>
  );
}
