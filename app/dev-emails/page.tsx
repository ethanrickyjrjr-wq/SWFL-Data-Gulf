/**
 * DEV-ONLY TRIAGE SURFACE — every email we have, on one page, rendered.
 *
 * Built 07/13/2026 so the operator can look at all 41 at once and say keep /
 * change / throw out. It CHANGES NOTHING. It reads the two registries that
 * actually define what exists and renders what it finds:
 *
 *   • 27 TEMPLATES  (SEED_DOCS)  — rendered live through the exact path the
 *     capture script uses: previewFill() drops in the real committed photos and
 *     sourced numbers, renderEmailDocHtml() produces the real email HTML. No
 *     screenshots (they go stale — that is what burned us), no LLM, no network.
 *   • 14 RECIPES    (RECIPES)    — what a user actually receives. Where a
 *     hand-designed HTML version was committed, that file is shown. Where one
 *     was never made, the recipe's declared skeleton template is shown instead
 *     and SAID SO — nothing is faked to fill the grid.
 *
 * Not linked from anywhere. Not in the sitemap. Delete it when triage is done.
 */
import { SEED_DOCS, seedById } from "@/lib/email/doc/default-docs";
import { previewFill } from "@/lib/email/doc/preview-fill";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { RECIPES, RECIPE_KEYS } from "@/lib/deliverable/recipes";
import { EmailFrame } from "./EmailFrame";

export const dynamic = "force-dynamic";

/** recipe key → the committed hand-designed HTML, read off lib/showcase/registry.ts
 *  (liveHref). Absent = no designed version was ever made for that recipe. */
const DESIGNED: Partial<Record<string, string>> = {
  "coming-soon": "/showcase/listing-to-close/live/01-coming-soon.html",
  "new-listing": "/showcase/listing-to-close/live/02-new-listing.html",
  "market-comps": "/showcase/listing-to-close/live/03-comps.html",
  "under-contract": "/showcase/listing-to-close/live/04-pending.html",
  "just-sold": "/showcase/listing-to-close/live/05-sold.html",
  "agent-brand-intro": "/showcase/launch-blitz/live/agent-intro.html",
  "social-pack": "/showcase/launch-blitz/live/social-pack.html",
  "agent-launch": "/showcase/agent-launch/live/01-letter.html",
  "sphere-weekly": "/showcase/agent-launch/live/02-headlines-vs-here.html",
  "review-reply": "/showcase/agent-launch/live/03-review-snapshot.html",
  "market-pulse": "/showcase/market-pulse/live/pulse-email.html",
  "social-cut": "/showcase/market-pulse/live/socials.html",
};

/** THE SEVEN, AS ACTUALLY BUILT. Rendered by scripts/dev-render-listing-emails.mts
 *  from the committed 07/13/2026 capture of 326 Shore Dr — the real builders, the
 *  real numbers, the deterministic prose. Not the showcase mockups. Re-render with:
 *    bun --env-file=<env-without-anthropic-key> scripts/dev-render-listing-emails.mts */
const LIFECYCLE: { key: string; label: string }[] = [
  { key: "coming-soon", label: "Coming Soon" },
  { key: "new-listing", label: "New Listing" },
  { key: "open-house", label: "Open House" },
  { key: "price-reduced", label: "Price Reduced" },
  { key: "market-comps", label: "Market Comps" },
  { key: "under-contract", label: "Under Contract" },
  { key: "just-sold", label: "Just Sold" },
];

/** Loose extras that exist as committed HTML but aren't a recipe of their own. */
const EXTRAS = [
  { name: "Social — square feed", href: "/showcase/launch-blitz/live/social-01-square.html" },
  { name: "Social — landscape link", href: "/showcase/launch-blitz/live/social-02-landscape.html" },
  { name: "Social — portrait feed", href: "/showcase/launch-blitz/live/social-03-portrait.html" },
  { name: "Social — 9:16 story", href: "/showcase/launch-blitz/live/social-04-story.html" },
  { name: "Market Pulse — the ask", href: "/showcase/market-pulse/live/ask.html" },
  { name: "Market Pulse — April vs May", href: "/showcase/market-pulse/live/vintages.html" },
];

function Card({
  n,
  title,
  kind,
  note,
  children,
}: {
  n: number;
  title: string;
  kind: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`e${n}`} style={S.card}>
      <div style={S.cardHead}>
        <div style={S.n}>{n}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={S.h2}>{title}</h2>
          <div style={S.kind}>{kind}</div>
          <p style={S.note}>{note}</p>
        </div>
        <a href="#top" style={S.top}>
          top ↑
        </a>
      </div>
      <div style={S.frameWrap}>{children}</div>
    </section>
  );
}

export default async function DevEmailsPage() {
  // ── 14 recipes: designed HTML if it exists, else the declared skeleton, rendered.
  const recipes = await Promise.all(
    RECIPE_KEYS.map(async (key) => {
      const r = RECIPES[key];
      const href = DESIGNED[key];
      if (href) return { key, label: r.label, href, html: null as string | null, fallback: false };
      const seed = r.skeleton ? seedById(r.skeleton) : undefined;
      const html = seed
        ? await renderEmailDocHtml(previewFill(seed.build(), { seedId: seed.id }))
        : null;
      return { key, label: r.label, href: null, html, fallback: true, skeleton: r.skeleton };
    }),
  );

  // ── 27 templates: the real render path, real photos, real sourced numbers.
  const seeds = await Promise.all(
    SEED_DOCS.map(async (s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      html: await renderEmailDocHtml(previewFill(s.build(), { seedId: s.id })),
    })),
  );

  const total = recipes.length + seeds.length;

  return (
    <main style={S.page} id="top">
      <header style={S.header}>
        <h1 style={S.h1}>Every email we have — all {total}</h1>
        <p style={S.sub}>
          The 7 listing emails as actually built, then {recipes.length} recipes (the designed
          versions), then {seeds.length} templates (the canvases). Rendered live from the code,
          never from screenshots. No AI call anywhere. The hero photo below is a placeholder fixture
          unless this capture was run with <code>--live</code> — see
          scripts/dev-render-listing-emails.mts. Nothing in the product changed. Mark each one:{" "}
          <b>keep</b> / <b>change</b> / <b>kill</b>.
        </p>
        <div style={S.navRow}>
          <span style={S.navLabel}>AS BUILT · real data</span>
          <nav style={S.nav}>
            {LIFECYCLE.map((r) => (
              <a key={r.key} href={`#b-${r.key}`} style={{ ...S.pill, ...S.pillBuilt }}>
                {r.label}
              </a>
            ))}
          </nav>
        </div>
        <div style={S.navRow}>
          <span style={S.navLabel}>RECIPES · designed</span>
          <nav style={S.nav}>
            {recipes.map((r, i) => (
              <a key={r.key} href={`#e${i + 1}`} style={S.pill}>
                {r.label}
              </a>
            ))}
          </nav>
        </div>
        <div style={S.navRow}>
          <span style={S.navLabel}>TEMPLATES · canvases</span>
          <nav style={S.nav}>
            {seeds.map((s, i) => (
              <a
                key={s.id}
                href={`#e${recipes.length + i + 1}`}
                style={{ ...S.pill, ...S.pillAlt }}
              >
                {s.name}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <h2 style={{ ...S.band, color: "#e0b062", borderTopColor: "#5a4520" }}>
        THE 7 LISTING EMAILS — AS ACTUALLY BUILT · 326 Shore Dr, Fort Myers · real numbers, no AI
      </h2>
      <p style={S.bandNote}>
        The real builders, run against the real listing — $595,000 / 3 bed / 3.5 bath / 2,847 sq ft
        / $104,975-cut. The hero photo is a placeholder fixture in this default capture (the real,
        mirrored photo only appears when re-captured with --live). No AI wrote a word of this: every
        narrator here falls through to a deterministic note, which is exactly what your 07/13 build
        produced. Nothing on this row is a mockup.
      </p>
      {LIFECYCLE.map((r) => (
        <section key={r.key} id={`b-${r.key}`} style={{ ...S.card, borderColor: "#5a4520" }}>
          <div style={S.cardHead}>
            <div style={{ flex: 1 }}>
              <h2 style={S.h2}>{r.label}</h2>
              <div style={{ ...S.kind, color: "#c69749" }}>AS BUILT — real data</div>
            </div>
            <a href="#top" style={S.top}>
              top ↑
            </a>
          </div>
          <div style={S.frameWrap}>
            <EmailFrame src={`/dev-emails/${r.key}.html`} />
          </div>
        </section>
      ))}

      <h2 style={S.band}>
        THE {recipes.length} RECIPES — the designed/showcase versions (mostly the fictional demo
        house)
      </h2>
      {recipes.map((r, i) => (
        <Card
          key={r.key}
          n={i + 1}
          title={r.label}
          kind={r.fallback ? "RECIPE — no designed version exists" : "RECIPE — designed"}
          note={
            r.fallback
              ? r.html
                ? `Nobody ever designed this one. Showing the template it's built on (${r.skeleton}) so you can see the bones. The real send fills it from a live address lookup.`
                : `Nobody designed this one and it has no template assigned. There is nothing to show — this is the gap.`
              : `The committed, hand-designed version — real photos, real sourced numbers, exactly as built.`
          }
        >
          {r.href ? (
            <EmailFrame src={r.href} />
          ) : r.html ? (
            <EmailFrame html={r.html} />
          ) : (
            <div style={S.empty}>Nothing built for this recipe.</div>
          )}
        </Card>
      ))}

      <h2 style={S.band}>
        THE {seeds.length} TEMPLATES — the canvases, filled with real photos and real numbers
      </h2>
      {seeds.map((s, i) => (
        <Card
          key={s.id}
          n={recipes.length + i + 1}
          title={s.name}
          kind="TEMPLATE"
          note={s.description}
        >
          <EmailFrame html={s.html} />
        </Card>
      ))}

      <h2 style={S.band}>EXTRAS — other committed pieces, not recipes of their own</h2>
      {EXTRAS.map((x) => (
        <section key={x.href} style={S.card}>
          <div style={S.cardHead}>
            <div style={{ flex: 1 }}>
              <h2 style={S.h2}>{x.name}</h2>
              <div style={S.kind}>EXTRA</div>
            </div>
            <a href="#top" style={S.top}>
              top ↑
            </a>
          </div>
          <div style={S.frameWrap}>
            <EmailFrame src={x.href} />
          </div>
        </section>
      ))}
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  // Sits ABOVE the app chrome (nav + Ask-AI widget come from the root layout and
  // would otherwise cover the emails). Triage surface — own the whole viewport.
  page: {
    position: "fixed",
    inset: 0,
    zIndex: 99999,
    overflowY: "auto",
    background: "#0d0f12",
    color: "#e9edf2",
    padding: "32px 24px 120px",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
  },
  header: { maxWidth: 1100, margin: "0 auto 40px" },
  h1: { fontSize: 30, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.02em" },
  sub: { fontSize: 14, lineHeight: 1.6, color: "#9aa4b2", margin: "0 0 20px", maxWidth: 760 },
  nav: { display: "flex", flexWrap: "wrap", gap: 6 },
  pill: {
    fontSize: 11,
    padding: "4px 9px",
    borderRadius: 999,
    background: "#1b2028",
    color: "#c3cbd6",
    textDecoration: "none",
    border: "1px solid #262d38",
  },
  pillAlt: { background: "#14181e", color: "#7f8b9a" },
  navRow: {
    display: "flex",
    gap: 10,
    alignItems: "baseline",
    margin: "0 0 8px",
  },
  navLabel: {
    flex: "0 0 130px",
    fontSize: 9.5,
    letterSpacing: "0.09em",
    color: "#6f7c8c",
    fontWeight: 700,
    paddingTop: 4,
  },
  pillBuilt: {
    background: "#3a2d14",
    color: "#e0b062",
    borderColor: "#5a4520",
  },
  bandNote: {
    maxWidth: 1100,
    margin: "-10px auto 20px",
    fontSize: 12.5,
    lineHeight: 1.6,
    color: "#9aa4b2",
  },
  band: {
    maxWidth: 1100,
    margin: "48px auto 20px",
    fontSize: 12,
    letterSpacing: "0.09em",
    color: "#6f7c8c",
    fontWeight: 700,
    borderTop: "1px solid #232a34",
    paddingTop: 16,
  },
  card: {
    maxWidth: 1100,
    margin: "0 auto 28px",
    background: "#141820",
    border: "1px solid #232a34",
    borderRadius: 12,
    overflow: "hidden",
  },
  cardHead: { display: "flex", gap: 14, alignItems: "flex-start", padding: "16px 18px" },
  n: {
    width: 30,
    height: 30,
    flex: "0 0 30px",
    borderRadius: 8,
    background: "#232a34",
    color: "#aab4c2",
    fontSize: 13,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  h2: { fontSize: 17, fontWeight: 650, margin: 0 },
  kind: { fontSize: 10, letterSpacing: "0.08em", color: "#6f7c8c", margin: "3px 0 6px" },
  note: { fontSize: 12.5, lineHeight: 1.55, color: "#8e99a8", margin: 0, maxWidth: 680 },
  top: { fontSize: 11, color: "#5f6b7a", textDecoration: "none" },
  frameWrap: {
    background: "#e7e9ee",
    padding: 20,
    display: "flex",
    justifyContent: "center",
  },
  empty: { padding: 40, color: "#8a94a2", fontSize: 13 },
};
