// lib/email/zip-seed.ts
//
// The ZIP email prebuild (Lane B fork 1b — OPERATOR'S SHAPE): clicking a ZIP on
// the homepage map lands in the email lab with that ZIP's page already built as
// an email. DETERMINISTIC + composed in code from the SAME ranked-candidate pool
// the ZIP report page renders (lib/zip-report/load-ranked-signals.ts) — never an
// LLM authoring call on arrival; drive-by clicks and bots cost ~$0. The AI
// engages only when the visitor edits.
//
// RANKED, NOT A FLAT LIST: the email presents the same ranked/percentile/movement
// signals the webpage does — one `metric-card` per signal, each with the held
// value, its rank, its YoY movement, and a percentile bar (a visual restatement of
// a held percentile, never a fabricated width). The email and the webpage never
// show a different rank/percentile for the same ZIP on the same day (same builder
// + same inputs — see the helper's header).
//
// NEUTRAL SKELETON: seed docs carry NEUTRAL_SKELETON_STYLE (grayscale/slate), NOT
// SWFL's own navy/teal — an unbranded send reads as a skeleton awaiting a brand,
// not "our" template. applyBrand()/brandGlobalStyle() overlay the operator's real
// brand on top, exactly as they would over DEFAULT_GLOBAL_STYLE.
//
// CENSUS: at most ONE census line (median household income) — every other ACS
// figure rides a 2018–2022 vintage that reads stale next to this-week market rows
// (income-only policy in the helper).
//
// Empty-tolerant by contract: out-of-scope ZIP, no lake creds, or zero ranked
// signals → null, and each surface opens in its normal state. Every rendered
// value is a held figure restated verbatim; prose sentences carry NO numbers.

import { createBlock } from "./doc/default-docs";
import { NEUTRAL_SKELETON_STYLE } from "./doc/skeleton-style";
import type { BlockLayout, BlockOf, BlockPropsMap, BlockType, EmailDoc } from "./doc/types";
import { loadLifecycleDigest } from "./market-context";
import { loadRankedZipSignals } from "../zip-report/load-ranked-signals";
import type { RankedSignal } from "../zip-report/signal-rank";

/** Seed-style grid block: default props + overrides + a grid layout (every block
 *  in this doc is positioned, so the preview/send grid render orders them top-to-
 *  bottom — a no-`layout` block would pool at the bottom in compile-grid). */
function gblk<K extends BlockType>(
  type: K,
  layout: BlockLayout,
  overrides: Partial<BlockPropsMap[K]> = {},
): BlockOf<K> {
  const b = createBlock(type);
  Object.assign(b.props as object, overrides);
  (b as { layout?: BlockLayout }).layout = layout;
  return b;
}

/** Same env-aware base the send routes use — local previews resolve locally,
 *  prod-built docs carry prod URLs. */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com").replace(
  /\/$/,
  "",
);

/**
 * Builds the deterministic, ranked ZIP email. Returns null when the ZIP is out of
 * scope or yields no ranked signals — the caller opens its surface unseeded
 * (never an error page).
 */
export async function buildZipSeedDoc(zip: string): Promise<EmailDoc | null> {
  if (!/^\d{5}$/.test(zip)) return null;

  // Parallel pulls: the ranked-signal pool (same as the webpage) + the lifecycle
  // "what just moved" digest. Each is empty-tolerant.
  const [signals, lifecycle] = await Promise.all([
    loadRankedZipSignals(zip, { censusPolicy: "income-only" }),
    loadLifecycleDigest({ kind: "zip", value: zip }),
  ]);

  if (!signals || signals.ranked.length === 0) return null;

  const { ranked, place, hasFlood, fillColor, shapeFound, sources } = signals;
  // A place with no crosswalk name falls back to the ZIP itself — never let a
  // digit-only fallback leak into a prose sentence (figures ride blocks, not prose).
  const placeLabel = /^\d+$/.test(place) ? "this area" : place;

  const top = ranked.slice(0, 6);
  const blocks: EmailDoc["blocks"] = [];
  let y = 0;

  // ── Masthead ──────────────────────────────────────────────────────────────
  blocks.push(gblk("header", { x: 0, y, w: 12, h: 2 }));
  y += 2;

  // ── Shape + identity, side by side ────────────────────────────────────────
  // The cutout is the SAME color as the homepage map / report page: the route
  // takes a `?fill=` param and we pass computeZipGradient's value through. rgb()
  // carries commas/parens → URL-encode it. No flood AAL held → omit ?fill so the
  // route paints its own neutral no-data slate (never a fabricated gradient point).
  const shapeUrl =
    `${SITE}/api/zip-shape/${zip}` + (hasFlood ? `?fill=${encodeURIComponent(fillColor)}` : "");
  const identity = {
    kicker: "Southwest Florida",
    value: place.slice(0, 24),
    label: `ZIP ${zip}`,
    prose: "",
  };
  if (shapeFound) {
    blocks.push(
      gblk(
        "image",
        { x: 0, y, w: 4, h: 4 },
        { url: shapeUrl, alt: `Map cutout of ${place} (${zip})`, caption: "" },
      ),
    );
    blocks.push(gblk("hero", { x: 4, y, w: 8, h: 4 }, identity));
  } else {
    blocks.push(gblk("hero", { x: 0, y, w: 12, h: 4 }, identity));
  }
  y += 4;

  // ── Ranked metric cards, two per row ──────────────────────────────────────
  for (let i = 0; i < top.length; i += 2) {
    blocks.push(gblk("metric-card", { x: 0, y, w: 6, h: 4 }, cardProps(top[i])));
    if (top[i + 1]) {
      blocks.push(gblk("metric-card", { x: 6, y, w: 6, h: 4 }, cardProps(top[i + 1])));
    }
    y += 4;
  }

  // ── Commentary (digit-free): names the signal that most sets this ZIP apart,
  // never its number — the number already rides the card. Composed in code (no
  // LLM call); a fuller "what it means" paragraph is what the visitor gets by
  // opening/editing the doc in the Email Lab (AI-patch path, unchanged). ──
  const lead = top[0];
  const leadTopic = lead
    ? lead.label
        .replace(/\([^)]*\)/g, "") // drop "(90 Days)" etc — no digits in prose
        .replace(/[0-9]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
    : "";
  const commentary = leadTopic
    ? `Right now, the figure that most sets ${placeLabel} apart is its ${leadTopic}.`
    : `Here's where ${placeLabel} stands this week — every figure below is pulled live and cited.`;
  blocks.push(gblk("text", { x: 0, y, w: 12, h: 2 }, { body: commentary, align: "left" }));
  y += 2;

  // ── Market motion — the lifecycle digest sentence (a held, cited value). ──
  if (lifecycle) {
    const windowLabel = lifecycle.label.match(/\(([^)]+)\)\s*$/)?.[1] ?? "recent weeks";
    blocks.push(
      gblk(
        "signal",
        { x: 0, y, w: 12, h: 4 },
        {
          kicker: `${lifecycle.source}${lifecycle.as_of ? ` · as of ${lifecycle.as_of}` : ""}`,
          title: `What just moved (${windowLabel})`,
          body: lifecycle.value,
        },
      ),
    );
    y += 4;
  }

  // ── Sources + CTA + footer ────────────────────────────────────────────────
  // Collapsed accordion, not an inline wall of text — SourcesBlock (native
  // <details>, opens on click only) is the ONE place a citation renders in the
  // Email Lab canvas, same rule every other citation surface follows
  // (components/CitationList.tsx).
  const citationList = [
    ...sources.map((s) => ({ label: s.label, url: s.url })),
    ...(lifecycle ? [{ label: lifecycle.source, url: undefined }] : []),
  ].filter((c, i, arr) => c.label && arr.findIndex((x) => x.label === c.label) === i);
  if (citationList.length > 0) {
    blocks.push(
      gblk(
        "sources",
        { x: 0, y, w: 12, h: 2 },
        {
          sources: citationList,
          note: "Figures refresh from live data when this email rebuilds.",
        },
      ),
    );
    y += 2;
  }

  blocks.push(
    gblk(
      "button",
      { x: 0, y, w: 12, h: 2 },
      { label: "See the full ZIP report", url: `${SITE}/r/zip-report/${zip}` },
    ),
  );
  y += 2;
  blocks.push(gblk("footer", { x: 0, y, w: 12, h: 3, static: true }));

  return { globalStyle: { ...NEUTRAL_SKELETON_STYLE }, blocks };
}

/** One ranked signal → metric-card props. Every field is a held value restated
 *  verbatim; `barPct` is the held percentile (null → no bar, never a midpoint). */
function cardProps(s: RankedSignal): Partial<BlockPropsMap["metric-card"]> {
  return {
    metricValue: s.display,
    metricLabel: s.label,
    sub: s.sub,
    rankText:
      s.rankPos != null && s.rankOf != null ? `#${s.rankPos} of ${s.rankOf} SWFL ZIPs` : undefined,
    movementText: s.movementText,
    barPct: s.percentile ?? undefined,
  };
}
