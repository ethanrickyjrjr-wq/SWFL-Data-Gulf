// app/insiders/_components/specimen.tsx
//
// The specimen — Issue 001's front page rendered as cream paper on the dark
// desk, with a teal annotation rail explaining the guarantee behind each
// section. The anatomy is real (the exact issue skeleton the composer emits);
// the prose is deliberately self-referential — it describes each section
// rather than faking editorial content. The ONLY figures on the paper are
// live loader values passed in by the page (`pullStat`, `sparkPoints`); when
// the lake degrades those slots collapse instead of showing a sample number.

export interface SpecimenPullStat {
  label: string; // e.g. "ACTIVE LISTINGS ON THE DESK — LEE & COLLIER"
  value: string; // e.g. "29,401"
  source: string; // e.g. "SWFL Data Gulf listings desk"
  asOf: string; // e.g. "07/10/2026" (or a month label when the source is monthly)
}

interface Annotation {
  n: string;
  title: string;
  body: string;
}

const ANNOTATIONS: Annotation[] = [
  {
    n: "01",
    title: "The Read",
    body: "The month's thesis, in a few tight paragraphs. Every claim in them traces back to a figure on the data desk — no vibes, no filler.",
  },
  {
    n: "02",
    title: "The Stories",
    body: "Three to four a month: what happened, what our data shows about it, and the historical analog that puts it in context.",
  },
  {
    n: "03",
    title: "The Dashboard",
    body: "Charts drawn only from series we actually hold. If we don't have the data, the chart doesn't exist — there is no stock-art version.",
  },
  {
    n: "04",
    title: "The Forward Look",
    body: "One direction call per issue — printed with its falsifier: the number that, if it prints, kills the call. Accountability by design.",
  },
  {
    n: "05",
    title: "Sources",
    body: "Every figure in the issue carries a number, and every number resolves to a named source in this list. All of them, every month.",
  },
];

function Pin({ n }: { n: string }) {
  return <span className="ins-pin">{n}</span>;
}

export function Specimen({
  pullStat,
  sparkPoints,
}: {
  pullStat: SpecimenPullStat | null;
  sparkPoints: string | null;
}) {
  return (
    <div className="ins-specimen">
      {/* ── The paper ─────────────────────────────────────────────────── */}
      <article className="ins-paper" aria-label="Anatomy of an issue">
        <div className="ins-paper-stamp" aria-hidden="true">
          <span>Fact-checked by machine</span>
          <span className="ins-paper-stamp-sub">no source · no send</span>
        </div>

        <header className="ins-paper-masthead">
          <p className="ins-paper-kicker">SWFL Data Gulf</p>
          <p className="ins-paper-name">The Insiders Edition</p>
          <div className="ins-paper-issue-row">
            <span>Issue 001</span>
            <span>July 2026</span>
            <span>Complimentary</span>
          </div>
        </header>

        <section className="ins-paper-section">
          <h3 className="ins-paper-h">
            The Read <Pin n="01" />
          </h3>
          <p className="ins-paper-body ins-paper-dropcap">
            Every issue opens with what the month actually did, why it did it, and what that means
            if you own, build, or lease here. The prose is written to be read — but underneath it,
            each sentence is chained to the desk. A claim that can&rsquo;t point at its figure never
            makes the page.
          </p>
          {pullStat && (
            <aside className="ins-paper-pullstat">
              <p className="ins-paper-pullstat-label">{pullStat.label}</p>
              <p className="ins-paper-pullstat-value">
                {pullStat.value}
                <sup>[1]</sup>
              </p>
              <p className="ins-paper-pullstat-src">
                {pullStat.source} · as of {pullStat.asOf}
              </p>
            </aside>
          )}
        </section>

        <section className="ins-paper-section">
          <h3 className="ins-paper-h">
            The Stories <Pin n="02" />
          </h3>
          <div className="ins-paper-skeletons" aria-hidden="true">
            <div className="ins-paper-skel" style={{ width: "86%" }} />
            <div className="ins-paper-skel" style={{ width: "72%" }} />
            <div className="ins-paper-skel" style={{ width: "64%" }} />
          </div>
          <p className="ins-paper-caption">
            Headlines land with the issue — each told three ways: what happened, what our data
            shows, and the closest historical analog.
          </p>
        </section>

        <section className="ins-paper-section">
          <h3 className="ins-paper-h">
            The Dashboard <Pin n="03" />
          </h3>
          {sparkPoints ? (
            <svg
              className="ins-paper-spark"
              viewBox="0 0 320 64"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline points={sparkPoints} fill="none" strokeWidth="2" />
            </svg>
          ) : null}
          <p className="ins-paper-caption">
            Drawn from the same live series charted further down this page — never illustrated,
            always plotted.
          </p>
        </section>

        <section className="ins-paper-section">
          <h3 className="ins-paper-h">
            The Forward Look <Pin n="04" />
          </h3>
          <div className="ins-paper-call">
            <span className="ins-paper-tag">[inference]</span>
            <p className="ins-paper-body">
              The one place the issue takes a position — a single direction call, stated with the
              audited base value it stands on <em>and the falsifier printed beside it</em>: the
              number that proves us wrong if it shows up.
            </p>
          </div>
        </section>

        <footer className="ins-paper-sources">
          <h3 className="ins-paper-h">
            Sources <Pin n="05" />
          </h3>
          <p className="ins-paper-src-line">
            {pullStat
              ? `[1] ${pullStat.source} — as of ${pullStat.asOf}.`
              : "[1] — every figure resolves here, numbered and named."}{" "}
            Every other figure prints the same way.
          </p>
        </footer>
      </article>

      {/* ── The annotation rail ───────────────────────────────────────── */}
      <div className="ins-rail" aria-label="What each section guarantees">
        {ANNOTATIONS.map((a) => (
          <div className="ins-rail-note" key={a.n}>
            <span className="ins-rail-n">{a.n}</span>
            <div>
              <p className="ins-rail-title">{a.title}</p>
              <p className="ins-rail-body">{a.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
