import type { Metadata } from "next";
import Link from "next/link";
import { Instrument_Serif } from "next/font/google";
import { MetroAreaChart } from "@/components/charts";
import { SWFL_METRO_SERIES } from "@/lib/charts/series";
import { loadMetroTrend, type MetroTrendPanel } from "@/lib/charts/load-metro-trend";
import { loadDeskStats } from "./_lib/desk-stats";
import { InsidersCapture } from "./_components/insiders-capture";
import { WireTicker, type WireItem } from "./_components/wire-ticker";
import { Specimen, type SpecimenPullStat } from "./_components/specimen";
import "./insiders.css";

// The Insiders Edition centerpiece (spec: docs/superpowers/specs/
// 2026-07-10-insiders-page-design.md). Server component: every figure on the
// page is read live from the lake's pivoted views (same loaders as /charts) or
// its block collapses — the page demonstrates the newsletter's own no-invention
// rule. Sections: masthead hero → live wire → specimen (annotated anatomy) →
// live dashboard → printing rules → pipeline → issue ledger → closing capture.
export const revalidate = 3600;

// Editorial display face for the nameplate + paper specimen ONLY — imported in
// this route so it adds zero weight to every other page (Geist stays global).
const instrument = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: "The Insiders Edition",
  description:
    "A monthly Southwest Florida market read written by Claude Fable 5 and fact-checked by machine: every number names its source, and the one direction call per issue is printed with the number that would prove it wrong. Free.",
  alternates: { canonical: "/insiders" },
  openGraph: {
    title: "The Insiders Edition — SWFL Data Gulf",
    description:
      "Monthly Southwest Florida market intelligence, written by Claude Fable 5 and fact-checked by machine. Every number names its source.",
    url: "/insiders",
    siteName: "SWFL Data Gulf",
    type: "website",
  },
};

/* ── Honest derivations: read the loaders' rows as written, nothing more ── */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** "2026-05" → "May 2026" (null when the loader had nothing). */
function monthLabel(ym?: string): string | null {
  if (!ym) return null;
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${names[m - 1]} ${y}`;
}

/** Latest complete row of a pivoted panel (rows arrive oldest → newest). */
function latestRow(panel: MetroTrendPanel): Record<string, unknown> | null {
  return panel.data.length > 0
    ? (panel.data[panel.data.length - 1] as Record<string, unknown>)
    : null;
}

/**
 * SVG polyline points for one REAL series (decorative rendering of live data —
 * ornament on this page is still plotted, never illustrated). Null when the
 * series is too short or flat to draw honestly.
 */
function sparkPoints(panel: MetroTrendPanel, key: string, w: number, h: number): string | null {
  const vals = panel.data
    .map((r) => (r as Record<string, unknown>)[key])
    .filter(isNum)
    .slice(-36);
  if (vals.length < 12) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max === min) return null;
  const pad = 4;
  return vals
    .map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / (vals.length - 1);
      const y = h - pad - ((v - min) / (max - min)) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const METROS: Array<{ key: string; name: string }> = [
  { key: "cape_coral", name: "Cape Coral" },
  { key: "fort_myers", name: "Fort Myers" },
  { key: "naples", name: "Naples" },
];

export default async function InsidersPage() {
  const [zhvi, zori, desk] = await Promise.all([
    loadMetroTrend("zhvi_pivoted"),
    loadMetroTrend("zori_pivoted"),
    loadDeskStats(),
  ]);

  // ── The wire: TODAY'S desk first (operator ruling 07/10/2026 — never lead
  //    the centerpiece with the laggiest series), then the monthly indices ──
  const wire: WireItem[] = [];
  if (desk.listingsTotal != null) {
    wire.push({
      label: "Active listings on the desk · Lee & Collier",
      value: desk.listingsTotal.toLocaleString("en-US"),
    });
  }
  if (desk.mostActive) {
    wire.push({
      label: `Most active ZIP · ${desk.mostActive.place ?? desk.mostActive.zip}`,
      value: `${desk.mostActive.count.toLocaleString("en-US")} listings`,
    });
  }
  if (desk.newsThisMonth != null && desk.newsThisMonth > 0) {
    wire.push({
      label: `Local stories filed since ${desk.newsMonthName} 1`,
      value: desk.newsThisMonth.toLocaleString("en-US"),
    });
  }
  if (desk.topValue) {
    wire.push({
      label: `Highest-value ZIP · ${desk.topValue.place ?? desk.topValue.zip}`,
      value: desk.topValue.usd,
    });
  }
  const zhviLatest = latestRow(zhvi);
  const zoriLatest = latestRow(zori);
  if (zhviLatest) {
    for (const m of METROS) {
      const v = zhviLatest[m.key];
      if (isNum(v)) wire.push({ label: `${m.name} · median home value`, value: usd(v) });
    }
  }
  if (zoriLatest) {
    for (const m of METROS) {
      const v = zoriLatest[m.key];
      if (isNum(v)) wire.push({ label: `${m.name} · median rent`, value: `${usd(v)}/mo` });
    }
  }
  const zhviMonth = monthLabel(zhvi.asOf);
  const zoriMonth = monthLabel(zori.asOf);
  const noteParts: string[] = [];
  if (desk.listingsAsOf) noteParts.push(`desk updated ${desk.listingsAsOf}`);
  if (zhviMonth && zoriMonth && zhviMonth !== zoriMonth) {
    noteParts.push(`Zillow values through ${zhviMonth}, rents through ${zoriMonth}`);
  } else if (zhviMonth || zoriMonth) {
    noteParts.push(`Zillow ZHVI & ZORI through ${zhviMonth ?? zoriMonth}`);
  }
  noteParts.push("SWFL Data Gulf");
  const wireNote = noteParts.join(" · ");

  // ── Specimen: one real pull-stat (freshest lane first) + one real plot ───
  const naplesValue = zhviLatest?.["naples"];
  const pullStat: SpecimenPullStat | null =
    desk.listingsTotal != null && desk.listingsAsOf
      ? {
          label: "Active listings on the desk — Lee & Collier",
          value: desk.listingsTotal.toLocaleString("en-US"),
          source: "SWFL Data Gulf listings desk",
          asOf: desk.listingsAsOf,
        }
      : isNum(naplesValue) && zhviMonth
        ? {
            label: "Naples — median home value",
            value: usd(naplesValue),
            source: "Zillow ZHVI · SWFL Data Gulf",
            asOf: zhviMonth,
          }
        : null;
  const paperSpark = sparkPoints(zhvi, "cape_coral", 320, 64);
  const heroSpark = sparkPoints(zhvi, "cape_coral", 1000, 280);

  const zhviHas = zhvi.data.length > 0;
  const zoriHas = zori.data.length > 0;

  return (
    <main className={`insiders-page ${instrument.variable}`}>
      {/* ── Masthead hero ──────────────────────────────────────────────── */}
      <section className="ins-hero">
        <div className="ins-hero-bg" aria-hidden="true">
          {heroSpark && (
            <svg viewBox="0 0 1000 280" preserveAspectRatio="none">
              <polyline points={heroSpark} fill="none" strokeWidth="2" />
            </svg>
          )}
        </div>
        <div className="ins-hero-inner">
          <p className="ins-kicker">SWFL Data Gulf presents</p>
          <h1 className="ins-nameplate">
            The Insiders
            <br />
            Edition
          </h1>
          <p className="ins-dek">
            Monthly market intelligence for Southwest Florida — written by{" "}
            <strong>Claude Fable 5</strong>, the most capable model Anthropic ships, and
            fact-checked by code that will not let it invent a number.
          </p>
          <div className="ins-badge-row">
            <p className="ins-issue-badge">
              <span className="ins-pulse" aria-hidden="true" />
              Issue 001 · July 2026 · in production
            </p>
            {desk.listingsAsOf && (
              <p className="ins-issue-badge">Desk updated {desk.listingsAsOf}</p>
            )}
          </div>
          <InsidersCapture source="insiders-hero" />
        </div>
      </section>

      {/* ── The wire (live figures only; hidden when the lake degrades) ── */}
      <WireTicker items={wire} note={wireNote} />

      {/* ── The specimen ───────────────────────────────────────────────── */}
      <section className="ins-section">
        <header className="ins-section-head">
          <p className="ins-eyebrow">The anatomy</p>
          <h2 className="ins-h2">
            Built like a newspaper.
            <br />
            Checked like a ledger.
          </h2>
          <p className="ins-lede">
            Five sections, one rule: if a number can&rsquo;t name its source, the issue
            doesn&rsquo;t ship. Here is Issue 001&rsquo;s skeleton — annotated.
          </p>
        </header>
        <Specimen pullStat={pullStat} sparkPoints={paperSpark} />
      </section>

      {/* ── The dashboard, live ────────────────────────────────────────── */}
      {(zhviHas || zoriHas) && (
        <section className="ins-section ins-dashboard">
          <header className="ins-section-head">
            <p className="ins-eyebrow">The dashboard, live</p>
            <h2 className="ins-h2">This page obeys the same rule.</h2>
            <p className="ins-lede">
              These aren&rsquo;t screenshots. They&rsquo;re the desk&rsquo;s own series, rendered
              right now with their as-of dates — the same charts subscribers get. When a series is
              missing, so is its chart.
            </p>
          </header>
          <div className="ins-charts">
            {zhviHas && (
              <MetroAreaChart
                rootId="insiders-home-values"
                data={zhvi.data}
                series={SWFL_METRO_SERIES}
                variant="area"
                valueFormat="usd"
                eyebrow="From the data desk"
                title="Median Home Value"
                subtitle="Cape Coral · Fort Myers · Naples"
                asOf={zhvi.asOf}
              />
            )}
            {zoriHas && (
              <MetroAreaChart
                rootId="insiders-rents"
                data={zori.data}
                series={SWFL_METRO_SERIES}
                valueFormat="rent"
                eyebrow="From the data desk"
                title="Median Monthly Rent"
                subtitle="Cape Coral · Fort Myers · Naples"
                asOf={zori.asOf}
              />
            )}
          </div>
          <p className="ins-source-line">
            Source: Zillow ZHVI &amp; ZORI via SWFL Data Gulf ·{" "}
            <Link href="/charts">explore every chart</Link>
          </p>
        </section>
      )}

      {/* ── The rules we print by ──────────────────────────────────────── */}
      <section className="ins-section">
        <header className="ins-section-head">
          <p className="ins-eyebrow">The rules we print by</p>
          <h2 className="ins-h2">Four rules. No exceptions.</h2>
        </header>
        <div className="ins-rules">
          <div className="ins-rule">
            <span className="ins-rule-n">01</span>
            <h3>Every number names its source</h3>
            <p>
              Our own data, your documents, a named public source, or a figure you hand us — in that
              order. An invented number is the one thing that cannot ship.
            </p>
          </div>
          <div className="ins-rule">
            <span className="ins-rule-n">02</span>
            <h3>Inference is labeled</h3>
            <p>
              Anything beyond the cited facts is tagged <code>[inference]</code> and carries the
              base value it stands on — plus one falsifier that would disprove it.
            </p>
          </div>
          <div className="ins-rule">
            <span className="ins-rule-n">03</span>
            <h3>Facts and calls stay separated</h3>
            <p>
              The reporting sections state what is. Exactly one section is allowed an opinion: the
              Forward Look&rsquo;s single direction call.
            </p>
          </div>
          <div className="ins-rule">
            <span className="ins-rule-n">04</span>
            <h3>A machine reads it before you do</h3>
            <p>
              Before any send, code re-checks every figure against its source. A sentence that fails
              the gate blocks the whole issue — no overrides.
            </p>
          </div>
        </div>
      </section>

      {/* ── How an issue is made ───────────────────────────────────────── */}
      <section className="ins-section ins-pipeline">
        <header className="ins-section-head">
          <p className="ins-eyebrow">How an issue is made</p>
          <h2 className="ins-h2">From desk to inbox.</h2>
        </header>
        <ol className="ins-steps">
          <li className="ins-step">
            <span className="ins-step-n">1</span>
            <h3>The desk</h3>
            <p>
              Permits, listings, home values, rents, flood, tourism — our own Southwest Florida
              series, compiled into one briefing along with the month&rsquo;s local news.
            </p>
          </li>
          <li className="ins-step">
            <span className="ins-step-n">2</span>
            <h3>The writer</h3>
            <p>
              Claude Fable 5 reads the briefing and writes the issue in two passes: a draft, then a
              second pass where it edits itself against the source material.
            </p>
          </li>
          <li className="ins-step">
            <span className="ins-step-n">3</span>
            <h3>The gate</h3>
            <p>
              Deterministic code re-reads every sentence, checks every number against the briefing,
              and rebuilds every chart from the real series. No source, no send.
            </p>
          </li>
          <li className="ins-step">
            <span className="ins-step-n">4</span>
            <h3>The send</h3>
            <p>
              One email a month. Subscribers get each issue before it reaches the public archive —
              and can unsubscribe from any of them.
            </p>
          </li>
        </ol>
      </section>

      {/* ── Issue ledger ───────────────────────────────────────────────── */}
      <section className="ins-section ins-ledger">
        <header className="ins-section-head">
          <p className="ins-eyebrow">The ledger</p>
          <h2 className="ins-h2">Every issue, on the record.</h2>
        </header>
        <div className="ins-ledger-row">
          <span className="ins-ledger-num">001</span>
          <span className="ins-ledger-date">July 2026</span>
          <span className="ins-ledger-status">
            <span className="ins-pulse" aria-hidden="true" />
            in production
          </span>
        </div>
        <p className="ins-ledger-note">
          The archive starts here and never gets edited after the fact. Direction calls stay up —
          right or wrong — next to the falsifiers they shipped with.
        </p>
      </section>

      {/* ── Closing capture ────────────────────────────────────────────── */}
      <section className="ins-final">
        <h2 className="ins-final-h">Be on the list Issue 001 goes to.</h2>
        <p className="ins-final-sub">
          One email a month. Every number sourced. The first issue lands in inboxes before it lands
          anywhere else.
        </p>
        <InsidersCapture source="insiders-footer" />
        <p className="ins-final-links">
          Want to look around first? <Link href="/guides">Read the guides</Link> ·{" "}
          <Link href="/r">Search the data</Link>
        </p>
      </section>
    </main>
  );
}
