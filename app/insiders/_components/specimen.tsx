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
    title: "The Tape",
    body: "Fifteen numbers, cold. Each line carries its own source and date — the month before anyone frames it.",
  },
  {
    n: "02",
    title: "The Lead",
    body: "The month's one thesis, argued in prose that is chained to the desk. Anything beyond the cited facts is tagged as inference, with its falsifier.",
  },
  {
    n: "03",
    title: "The papers vs. the ledger",
    body: "The month's loudest press claim, run against the data. A standing fact-check — what was said, and what the records say.",
  },
  {
    n: "04",
    title: "The Atlas",
    body: "Two communities per city, top against entry, on one yardstick from the counties' own parcel rolls. Nobody else prints the market at this grain.",
  },
  {
    n: "05",
    title: "The Watch",
    body: "Dated events with what we expect — and what would prove us wrong. The next issue grades every entry, in print.",
  },
  {
    n: "06",
    title: "The Falsifier Ledger",
    body: "Every call preregistered: base value, direction, the number that kills it, and the date it gets graded. Misses included.",
  },
  {
    n: "07",
    title: "The Receipts",
    body: "The issue's own audit, counted in code: figures stated, sources named, zero invented. Built the way your emails and reports get built.",
  },
  {
    n: "08",
    title: "Sources",
    body: "Every figure resolves to a named source in one list at the bottom. All of them, every month.",
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
            The Tape <Pin n="01" />
          </h3>
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
          <p className="ins-paper-caption">
            Fifteen one-line numbers open every issue — no commentary, every line sourced and dated.
            The figure above is line one, live.
          </p>
        </section>

        <section className="ins-paper-section">
          <h3 className="ins-paper-h">
            The Lead <Pin n="02" />
          </h3>
          <p className="ins-paper-body ins-paper-dropcap">
            The month&rsquo;s one thesis, argued start to finish. The prose is written to be read —
            but underneath it, each sentence is chained to the desk. A claim that can&rsquo;t point
            at its figure never makes the page.
          </p>
        </section>

        <section className="ins-paper-section">
          <h3 className="ins-paper-h">
            What the papers said · what the ledger says <Pin n="03" />
          </h3>
          <div className="ins-paper-skeletons" aria-hidden="true">
            <div className="ins-paper-skel" style={{ width: "86%" }} />
            <div className="ins-paper-skel" style={{ width: "64%" }} />
          </div>
          <p className="ins-paper-caption">
            The month&rsquo;s loudest press claim, run against the records — a standing fact-check,
            every issue.
          </p>
        </section>

        <section className="ins-paper-section">
          <h3 className="ins-paper-h">
            The Atlas <Pin n="04" />
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
            Community-grain pairs, city by city, on one yardstick — plotted from the same live
            series charted further down this page. Never illustrated, always plotted.
          </p>
        </section>

        <section className="ins-paper-section">
          <h3 className="ins-paper-h">
            The Watch &amp; The Falsifier Ledger <Pin n="05" /> <Pin n="06" />
          </h3>
          <div className="ins-paper-call">
            <span className="ins-paper-tag">[inference]</span>
            <p className="ins-paper-body">
              Where the issue takes its positions — dated expectations and direction calls, each
              stated with the audited base value it stands on{" "}
              <em>and the falsifier printed beside it</em>: the number that proves us wrong if it
              shows up. The next issue grades them all, in print.
            </p>
          </div>
        </section>

        <footer className="ins-paper-sources">
          <h3 className="ins-paper-h">
            The Receipts &amp; Sources <Pin n="07" /> <Pin n="08" />
          </h3>
          <p className="ins-paper-src-line">
            {pullStat
              ? `[1] ${pullStat.source} — as of ${pullStat.asOf}.`
              : "[1] — every figure resolves here, numbered and named."}{" "}
            Every other figure prints the same way — and the issue closes by counting them.
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
