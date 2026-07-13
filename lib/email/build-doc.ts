// lib/email/build-doc.ts
//
// THE ONE Email Lab build pipeline. Extracted from app/api/email-lab/ai/route.ts
// so (a) the route is a thin wrapper, and (b) a script/test runs the EXACT same
// path. Pipeline: fetch the full lake context + best-effort inject a REAL market
// chart, pick the model by mode, ask the model to fill CONTENT only, apply +
// re-validate. No-invention (every SWFL number is cited) and no-restyle (the
// ContentPatch schema strips style/link/identity keys) are preserved.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import {
  EmailDocSchema,
  BlockContentPatchSchema,
  AuthorDocSchema,
  type ContentPatch,
  type AuthoredDoc,
} from "@/lib/email/doc/schema";
import type { EmailDoc } from "@/lib/email/doc/types";
import { AUTHORABLE_TYPES } from "@/lib/email/doc/block-contract";
import { resolveRecipe, recipeSection } from "@/lib/email/author-recipes";
import { resolveConcoction, datasetsSection } from "@/lib/concoctions/author-section";
import { seedResolvedDataset } from "@/lib/concoctions/seed-authored";
import {
  loadMarketFigures,
  loadLifecycleDigest,
  figuresToPromptBlock,
  type MarketFigure,
} from "@/lib/email/market-context";
import {
  resolveEmailModel,
  EMAIL_MODEL_OPUS,
  EMAIL_MODEL_SONNET,
  EMAIL_MODEL_HAIKU,
} from "@/lib/email/model-router";
import { chartImageBlock, upsertChartBlock } from "@/lib/email/inject-chart";
import { extractUrls, fetchOgImage, type OgImageResult } from "@/lib/email/og-image";
import { brandWebsiteUrl, heroPhotoBlock, upsertHeroPhoto } from "@/lib/email/inject-photo";
import { loadListingContext, renderListingsBlock } from "@/lib/listings/select";
import { deriveListingPhoto } from "@/lib/media/listing-photo";
import { mirrorHeroPhoto } from "@/lib/media/hero-photo";
import {
  isListingIntent,
  isNewListingRecipePrompt,
  subjectAddressFromPrompt,
  listingDescriptionFromPrompt,
} from "@/lib/email/listing-intent";
import { resolveSubjectListing } from "@/lib/listings/resolve-subject";
import { recipeByKey, recipeFromPrompt } from "@/lib/deliverable/recipes";
import { builderFor } from "@/lib/deliverable/recipes/index";
import { resolveSubject } from "@/lib/deliverable/recipes/shared";
import { fetchListingFacts, type ListingFacts } from "@/lib/email/listing-scrape";
import { buildListingFlyer } from "@/lib/email/listing-flyer";
import { compsForAddress, type RenderComp } from "@/lib/assistant/comp-helper";
import {
  buildSoldCompsSpec,
  soldCompsListBlock,
  upsertSoldCompsBlock,
} from "@/lib/email/sold-comp-blocks";
import { chartSpecToEmailImage, type EmailChartImage } from "@/lib/email/spec-to-png";
import { buildChartForQuestion } from "@/lib/assistant/chart-for-question";
import {
  assertHeroChartCoherence,
  chartMagnitudeFromSpec,
} from "@/lib/deliverable/chart-coherence";
import { resolveHeadlineFigure } from "@/lib/email/doc/preview-fill";
import { reshapeChartToType, chartTypeFits, type ChartType } from "@/lib/email/reshape-chart-type";
import { staleFigures } from "@/lib/assistant/freshness";
import {
  webFallback,
  staleFiguresToRequests,
  renderWebFallbackBlock,
  looksLikeFigureAsk,
  type WebFallbackResult,
} from "@/lib/assistant/web-fallback";
import {
  AUTHOR_TOOL,
  authorSystem,
  assembleAuthoredDoc,
  assetMenuById,
  buildAssetMenu,
  buildFigureMenu,
  figureMenuById,
  collectAnchorNumbers,
  collectRecordedAnchors,
  fillEmptySourcesBlock,
  lintAuthoredProse,
  promptAnchors,
  type LibraryAsset,
} from "@/lib/email/author-doc";
import { voiceGuard, cleanTellText } from "@/lib/email/voice-guard";
import { extractNumbers } from "@/lib/deliverable/narrative-lint";
import { loadAddressCompContext, type AddressCompContext } from "@/lib/email/address-context";
import { zipFromPromptPlace } from "@/lib/email/place-from-prompt";
import { findPlaceholder } from "@/lib/showcase/recipe";

/** A recipe's [[blank]] must be FILLED before it reaches the model. If an unfilled
 *  placeholder survives to here — an empty hero fill, a recipe auto-built before its
 *  address popup ran, or a bot POSTing the raw recipe straight to the build — the
 *  literal "[[your city or ZIP]]" token would ship to the author (a word it can't
 *  resolve) AND the build would run unscoped, producing generic content about no
 *  place the user named. This is the ONE chokepoint every build path funnels
 *  through, so the guard lives here: stop and ask for the area instead of shipping
 *  a placeholder. Returns the miss payload the UI already renders, or null when the
 *  prompt is clean. (Sabotage-path backstop, 07/06/2026.) */
export function unfilledPlaceholderMiss(prompt: string): BuildResult | null {
  const ph = findPlaceholder(prompt);
  if (!ph) return null;
  return {
    payload: {
      applied: false,
      message: `Which area should this cover? Tell me a city or ZIP (${ph.hint}) and I'll build it — I won't drop a blank placeholder into your email.`,
    },
  };
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com";
const MAX_TOKENS = 4096;

export interface BuildScope {
  kind?: string;
  value?: string;
  /** Subject listing address (address spine, build 2): when present, the feed
   *  additionally carries nearby sold comps as cited figures. Enrichment only —
   *  kind/value stay the area scope; nothing branches on it besides the feed. */
  address?: string;
}

// ── Lake context (the builder's data feed — EVERYTHING, every time) ──────────
async function fetchMasterDossier(scope?: BuildScope): Promise<string> {
  try {
    const params = new URLSearchParams({ view: "speak", tier: "2", v: "5" });
    if (scope?.kind === "zip" && scope.value) params.set("zip", scope.value);
    else if (scope?.kind === "county" && scope.value) params.set("county", scope.value);
    const res = await fetch(`${BASE_URL}/api/b/master?${params}`, { next: { revalidate: 3600 } });
    if (!res.ok) return "";
    return (await res.text()).slice(0, 12000);
  } catch {
    return "";
  }
}

/** The raw parts of the lake feed: cited figures (each with its as-of) + the master
 *  dossier. Split out from fetchLakeContext so buildContentDoc can refresh STALE figures
 *  via the web lane and drop the superseded held ones BEFORE composing the prompt. */
export async function fetchLakeParts(
  scope?: BuildScope,
): Promise<{ figures: MarketFigure[]; dossier: string; addressComps: RenderComp[] }> {
  const [marketFigures, lifecycleFigure, dossier, addressCtx] = await Promise.all([
    loadMarketFigures(scope).catch(() => []),
    loadLifecycleDigest(scope).catch(() => null),
    fetchMasterDossier(scope).catch(() => ""),
    loadAddressCompContext(scope?.address).catch(
      () => ({ figures: [], comps: [] }) as AddressCompContext,
    ),
  ]);
  const figures = [
    ...marketFigures,
    ...(lifecycleFigure ? [lifecycleFigure] : []),
    ...addressCtx.figures,
  ];
  return { figures, dossier, addressComps: addressCtx.comps };
}

/** Compose the prompt-context string the fill AI reads from cited figures + the dossier. */
export function composeLakeContext(figures: MarketFigure[], dossier: string): string {
  const parts: string[] = [];
  if (figures.length)
    parts.push(
      `CITED FIGURES (quote verbatim — value · source · as-of):\n${figuresToPromptBlock(figures)}`,
    );
  if (dossier)
    parts.push(`FULL SWFL MARKET DOSSIER (all site data — choose what's relevant):\n${dossier}`);
  return parts.join("\n\n");
}

/** Back-compat string API (legacy token route still calls this). */
export async function fetchLakeContext(scope?: BuildScope): Promise<string> {
  const { figures, dossier } = await fetchLakeParts(scope);
  return composeLakeContext(figures, dossier);
}

/** Drop held figures the web lane refreshed (EXACT-label match — the forced request reuses
 *  the figure's label, so the verified web point carries the same label back). The AI then
 *  sees only the fresh cited value, never the stale held one beside it. */
export function dropSuperseded(figures: MarketFigure[], refreshedLabels: string[]): MarketFigure[] {
  const drop = new Set(refreshedLabels);
  return figures.filter((f) => !drop.has(f.label));
}

export interface FreshLakeContext {
  lakeContext: string;
  web: WebFallbackResult;
  webRefreshed: string[];
}

/** THE freshness root (shared by the email build AND the social calendar): refresh any
 *  stale held figure to its current web-cited value, drop the superseded held copy, and
 *  compose the clean context the AI reads. `includeGapProbe` true reproduces buildContentDoc's
 *  figure-ask gap probe; false (calendar) does forced stale-refresh only. Best-effort: any
 *  web failure → held data. */
export async function refreshStaleLakeContext(opts: {
  scope?: BuildScope;
  figures: MarketFigure[];
  dossier: string;
  prompt: string;
  today: Date;
  includeGapProbe: boolean;
}): Promise<FreshLakeContext> {
  const { scope, figures, dossier, prompt, today, includeGapProbe } = opts;
  const stale = staleFigures(figures, today);
  const placeHint = scope?.value
    ? scope.kind === "county"
      ? `${scope.value} County Florida`
      : `${scope.value} Florida`
    : "";
  const forced = staleFiguresToRequests(stale, placeHint);
  const isFigureAsk = includeGapProbe && looksLikeFigureAsk(prompt);
  const heldSummary = composeLakeContext(figures, dossier);
  const web =
    forced.length > 0 || isFigureAsk
      ? await webFallback(prompt, heldSummary, {
          forced,
          probe: isFigureAsk ? undefined : async () => [],
        }).catch(() => ({ verified: [], unfound: [] }))
      : { verified: [], unfound: [] };
  const webRefreshed = web.verified.map((v) => v.label);
  const survivingFigures = dropSuperseded(figures, webRefreshed);
  const lakeContext = composeLakeContext(survivingFigures, dossier);
  return { lakeContext, web, webRefreshed };
}

// ── Chart selection — the SHARED root (the same producer chat uses) ──────────
// buildChartForQuestion picks the chart for the PROMPT — any chartable brain, not a
// hardcoded ZHVI scope — moat-safe (the LLM never touches a figure). It returns a
// ChartSpec + the chart's real figures (groundingNote). spec-to-png rasterizes that
// spec to a hosted PNG for email (the registry's React frames can't run in email).
// This replaces the old one-city ZHVI fork. NEVER throws — a chart is a bonus.
/** The multi-ZIP cities whose ZIP sets are USPS+Mapbox-verified (2026-07-06). Only
 *  these get the ZIP-by-ZIP city chart — a fail-closed allowlist so an unverified or
 *  wrongly-listed place (see the Estero correction) never charts neighbor-city ZIPs
 *  under its own name. New entries join only after the same three-source check. */
const VERIFIED_MULTI_ZIP_CITIES: ReadonlySet<string> = new Set([
  "Cape Coral",
  "Fort Myers",
  "Naples",
  "Lehigh Acres",
  "Bonita Springs",
]);

/** The city's full ZIP list for the ZIP-by-ZIP chart, or undefined when the place is
 *  not an allowlisted multi-ZIP city (single-ZIP places, explicit ZIP scopes, and
 *  unverified places all fall through to the existing single-scope chart). */
export function cityZipsFor(
  promptPlace: { place: string; zip: string; zips: string[] } | undefined,
): string[] | undefined {
  if (!promptPlace) return undefined;
  if (!VERIFIED_MULTI_ZIP_CITIES.has(promptPlace.place)) return undefined;
  return promptPlace.zips.length > 1 ? promptPlace.zips : undefined;
}

async function buildPromptChart(
  prompt: string,
  doc: EmailDoc,
  scope?: BuildScope,
  chartType?: ChartType,
  zips?: string[],
): Promise<{ image: EmailChartImage; groundingNote: string; note?: string } | null> {
  try {
    const question = scope?.value ? `${prompt} (${scope.kind ?? "scope"}: ${scope.value})` : prompt;
    const cfq = await buildChartForQuestion(
      question,
      BASE_URL,
      zips?.length ? { zips } : undefined,
    );
    if (!cfq?.chart) {
      console.log("[email-lab/chart] no chart matched for prompt:", prompt.slice(0, 80));
      return null;
    }
    const hero = resolveHeadlineFigure(doc);
    const magnitude = chartMagnitudeFromSpec(cfq.chart);
    const coherence = assertHeroChartCoherence({ hero, chart: magnitude });
    if (!coherence.coherent) {
      console.log("[email-lab/chart] dropped incoherent chart:", coherence.reason);
      return null;
    }
    // The "pick your chart type" control re-shapes the SAME routed figures into the
    // requested frame (bar/donut/dot vs avg/bar+change). No requested type → the
    // producer's auto choice. Reshaping relabels, never invents (reshape-chart-type.ts).
    // GUARDRAIL: a requested shape the data can't honor falls back to a bar; tell the user why.
    const note =
      chartType && !chartTypeFits(cfq.chart, chartType)
        ? chartType === "donut"
          ? "A donut needs share-style data (counts that add to a whole) — showed a bar for this metric."
          : chartType === "storm-timeline" || chartType === "seasonal-radial"
            ? "That chart needs per-event or per-corridor detail we don't have for this metric yet — showed a bar instead."
            : "This data has no period-over-period change — showed a plain bar instead."
        : undefined;
    const chart = chartType ? reshapeChartToType(cfq.chart, chartType) : cfq.chart;
    const accent = doc.globalStyle.accentColor || "#3DC9C0";
    // The accent is part of the cache key so a brand-color change yields a NEW url —
    // otherwise the browser serves the stale (old-color) PNG from the same address.
    const tint = accent.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) || "x";
    const key = `email-charts/${chart.frameId}-${scope?.value ?? "swfl"}-${chart.asOf ?? "x"}-${tint}.png`;
    const image = await chartSpecToEmailImage(chart, accent, key);
    if (!image) console.log("[email-lab/chart] spec-to-png failed for frameId:", chart.frameId);
    return image ? { image, groundingNote: cfq.groundingNote, note } : null;
  } catch (e) {
    console.error("[email-lab/chart] chart build threw:", e);
    return null;
  }
}

// ── Hero photo — auto-resolve a real property/agent photo from a URL ─────────
// If the prompt carries a listing / agent-website URL, pull that page's og:image
// (the hero photo every site sets for link previews) and drop it in as the lead
// image — so emails get a real picture, not a manual upload. Best-effort, like
// the chart: the og:image lane works for an agent's own site + fetchable listing
// pages; Zillow/Realtor block bots, so those fall through to no photo (the RESO
// Media feed is the next layer). NEVER throws.
async function resolveHeroPhoto(
  prompt: string,
  doc: EmailDoc,
): Promise<(OgImageResult & { source: string }) | null> {
  // Priority: a specific listing/site URL in the prompt → that property's photo.
  // Fallback: the agent's saved brand website → a default hero, nothing to paste.
  const site = brandWebsiteUrl(doc);
  const candidates = site ? [...extractUrls(prompt), site] : extractUrls(prompt);
  try {
    for (const u of candidates.slice(0, 4)) {
      const r = await fetchOgImage(u);
      if (r) {
        // Mirror into email-media so the doc saves OUR durable URL — a scheduled
        // re-send months after the listing closes never depends on the source CDN
        // (check email_hero_mirror_to_storage). Mirror miss keeps the remote URL.
        const mirrored = await mirrorHeroPhoto(r.image);
        return { ...r, image: mirrored ?? r.image, source: u };
      }
    }
  } catch {
    /* a photo is a bonus — never block the fill on it */
  }
  return null;
}

// ── Content patch (the AI fills CONTENT into the fixed skeleton) ─────────────
const TEXT_KEYS = ["kicker", "value", "label", "prose", "title", "body", "caption", "alt"] as const;

/**
 * Held, number-bearing fields the AI may READ but never WRITE.
 *
 * These are the figures the reader actually SEES — a metric card's value, a
 * listing's price. They are deliberately outside `BlockContentPatchSchema`, so a
 * patch touching them is stripped (that fence is untouched by this list). But they
 * were also missing from `docSkeleton`, which is the AI's VIEW of the doc — so a
 * metric-card serialized to the model as `(metric-card): {}`, i.e. BLANK. The
 * writer was composing prose about an email whose six headline numbers it could
 * not see (operator, 07/13/2026: "how can the AI not read what the page says and
 * talk about it?"). It couldn't. Now it can.
 *
 * This also closes the loop the operator asked for: when a USER hand-edits a card
 * to their own figure (BlockInspector writes metricValue directly — lane 4 of the
 * four-lane moat), the next rewrite SEES the user's number and writes about THAT.
 * Read access is what makes the AI's prose track the doc it's actually in.
 */
const HELD_FIGURE_KEYS = [
  "metricValue",
  "metricLabel",
  "sub",
  "rankText",
  "movementText",
  "price",
  "beds",
  "baths",
  "sqft",
  "address",
  "badge",
] as const;

export function docSkeleton(doc: EmailDoc): string {
  const lines = doc.blocks.map((b) => {
    const props = b.props as Record<string, unknown>;
    const text: Record<string, unknown> = {};
    for (const k of TEXT_KEYS) {
      if (props[k] !== undefined && props[k] !== "") text[k] = props[k];
    }
    // Array-shaped content. `stats` was the ONLY one the AI could see; a `list`'s
    // rows and a `multi-column`'s cards serialized as nothing, so the writer was
    // blind to them too (07/13/2026 audit — same class as the metric-card blindness
    // below). These ARE writable (they're in BlockContentPatchSchema), so the model
    // needs to see what's already there to edit rather than clobber it.
    if (b.type === "stats") text.stats = props.stats;
    if (b.type === "list") text.items = props.items;
    if (b.type === "multi-column") text.columns = props.columns;

    const held: Record<string, unknown> = {};
    for (const k of HELD_FIGURE_KEYS) {
      if (props[k] !== undefined && props[k] !== "") held[k] = props[k];
    }
    const heldPart = Object.keys(held).length
      ? ` [held figures on this block — READ ONLY, reference them in your prose, never rewrite them: ${JSON.stringify(held)}]`
      : "";
    return `  "${b.id}" (${b.type}): ${JSON.stringify(text)}${heldPart}`;
  });
  return lines.join("\n");
}

function contentPatchSystem(lakeContext: string, hasChart: boolean): string {
  const dataBlock = lakeContext
    ? `\n\nREAL LAKE DATA (cite verbatim — value · source · as-of):\n${lakeContext}\n`
    : "";
  const chartLine = hasChart
    ? `\n- A real market CHART image is ALREADY placed in the doc (an "image" block). Write its caption and refer to the trend in your prose — never say a chart can't be made; one is already there.`
    : `\n- If a chart would help but none is present, express the data in the closest blocks (stats for key numbers, text for a list). Always produce a valid patch; never error out.`;
  return `You are an email content writer for SWFL Data Gulf, a Southwest Florida real estate intelligence platform.

You receive an EmailDoc skeleton (block ids + current text) and real lake data. Return ONLY a JSON content patch — a flat object mapping block id → updated text fields. No markdown fences, no commentary outside the JSON object.${dataBlock}

Allowed text fields per block: kicker, value, label, prose, title, body, caption, alt, tagline, stats (array of AT MOST 3 {value, label}; keep each value short — a number/figure, not a sentence).

HELD FIGURES ALREADY IN THE DOC — a block may carry "[held figures on this block — READ ONLY …]". Those are REAL, already-sourced numbers the reader can see on the page (a metric card's value, a listing's price), and they may have been set by the user themselves. TREAT THEM AS TRUE and write about them: name them, weave them together, say what they mean. You may NOT rewrite them (any attempt is discarded), and you must restate them VERBATIM — same rounding, same units — if you quote one.

DATA SOURCING — four lanes, in order. NEVER leave a requested field empty because you "don't have the number":
1. LAKE DATA above — use verbatim (value · source · as-of).
2. User's uploaded doc or figure — if the user pasted a number in their request, use it exactly.
3. Internet / publicly known figure — use it; note the source inline (e.g. "per Realtor.com", "per Census Bureau").
4. Can't source it at all — write [Need: brief description of the exact figure] so the user can supply it.
ONLY block: an invented number with no real source. Build is NEVER blocked.

Block rules:
- Do NOT add, remove, or reorder blocks. Do NOT change block types.
- Only the allowed text fields — no colors, urls, logos, photos, company name, agent names, or brand settings.
- Only include block ids and fields you are actually changing.
- Tight prose, no jargon, no internal ids in the copy.${chartLine}

SELLING A PROPERTY — when the email's job is a specific home (new listing, open house, price move, featured or just-sold property), you are its agent and every figure you include must work FOR the sale. Quote a market comparison ONLY when it favors the subject (priced under the median, moving faster than typical); NEVER quote a market median, average, or price-per-square-foot that reads cheaper than the subject property — that tells the reader it's overpriced. Use county pace figures (pending share, price-cut share, days on market) to build urgency instead. Leaving a figure out is selection, not invention — sourcing rules above still apply to every number you DO use.`;
}

export function applyPatch(doc: EmailDoc, patch: ContentPatch): unknown {
  return {
    globalStyle: doc.globalStyle,
    blocks: doc.blocks.map((b) => {
      const p = patch[b.id];
      if (!p) return b;
      return { ...b, props: { ...(b.props as Record<string, unknown>), ...p } };
    }),
  };
}

/** Extract the JSON object and validate it as a content patch — RESILIENTLY. A
 *  single over-limit field (a 4th stat, an over-long value) must NOT nuke the whole
 *  fill: parse PER BLOCK, clamp stats to the layout max, drop only the blocks that
 *  still don't fit, keep every valid one. No-restyle still holds (each block is
 *  strip-mode parsed by BlockContentPatchSchema). Returns null only when there is no
 *  usable patch at all. Handles a markdown-fenced ```json{...}``` response. */
export function tryParsePatch(text: string): ContentPatch | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out: Record<string, unknown> = {};
  for (const [id, raw] of Object.entries(obj as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const candidate: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    // Clamp stats to the layout max so a 4th+ cell doesn't reject the whole block.
    if (Array.isArray(candidate.stats)) candidate.stats = candidate.stats.slice(0, 3);
    const r = BlockContentPatchSchema.safeParse(candidate);
    if (r.success) out[id] = r.data;
    // else: drop just THIS block's patch — keep the rest (never nuke the whole fill).
  }
  return Object.keys(out).length ? (out as ContentPatch) : null;
}

export interface BuildArgs {
  prompt: string;
  rawDoc: unknown;
  scope?: BuildScope;
  /** "interactive" (default, Haiku) | "quality"/"snicklefritz" (Sonnet) | "max" (Opus). */
  mode?: string;
  /** Optional user-chosen chart shape from the lab control; reshapes the routed chart. */
  chartType?: ChartType;
  /** The caller's media library (author path only) — id-selected via the ASSET MENU.
   *  Fetched by the route (it holds the auth user); empty/absent → no menu section. */
  assets?: LibraryAsset[];
  /** The caller's account email (author path only). When the build prompt asks for
   *  a reply CTA, authored buttons get the engine-owned `mailto:` to this address —
   *  the same address blast sends already use as reply-to. Never model-written. */
  replyEmail?: string;
  /** THE RECIPE KEY (`?rkey=` — lib/deliverable/recipes.ts). THIS is the identity a
   *  build routes on: it is what makes the hero pill, the showcase card, the campaign
   *  button and the lab pick produce the SAME deliverable. Identity used to be the
   *  prompt STRING, so a user typing over the [[blank]] — or one surface re-typing a
   *  prompt with an extra sentence — silently forked one deliverable into two.
   *  Absent (an old link, an organic typed ask) → we fall back to matching the prompt
   *  against the registry, and then to the generic author. Never throws on a stale key. */
  recipeKey?: string;
  /** An explicit deliverable-type recipe chosen in the lab, or a saved
   *  `preferred_recipe` (M3 — recipes are user-SELECTABLE). Overrides keyword
   *  detection; unknown/empty falls back to detection. Advisory only (RULE C2). */
  recipeId?: string | null;
}

export interface BuildResult {
  httpStatus?: number;
  payload: Record<string, unknown>;
}

/** Run the full Email Lab content build. Returns the patched (and chart-injected)
 *  EmailDoc, or the current doc + a message on a parse miss — never garbage. */
export async function buildContentDoc({
  prompt,
  rawDoc,
  scope,
  mode,
  chartType,
}: BuildArgs): Promise<BuildResult> {
  const docParsed = EmailDocSchema.safeParse(rawDoc);
  if (!docParsed.success) {
    return { httpStatus: 400, payload: { error: "Invalid email document." } };
  }
  const placeholderMiss = unfilledPlaceholderMiss(prompt);
  if (placeholderMiss) return placeholderMiss;
  let doc = docParsed.data;

  // ── Listing flyer branch ───────────────────────────────────────────────────
  // A "describe THIS house" ask carrying a pasted listing URL: scrape the page
  // for REAL facts and rebuild the canvas as a property flyer (photo · price ·
  // beds/baths/sqft · the real remarks), preserving the user's brand + identity.
  // This is the layout transform the newsletter path can't do (it is forbidden to
  // restructure blocks). A scrape miss falls through to the newsletter path below,
  // so the build is never blocked — and a flyer is never built from invented data.
  if (isListingIntent(prompt)) {
    const url = extractUrls(prompt)[0];
    const facts = url ? await fetchListingFacts(url).catch(() => null) : null;
    if (facts) {
      // Same durable-URL rule as resolveHeroPhoto: the flyer hero saves OUR copy,
      // not the listing CDN's (mirror miss keeps the scraped URL — degraded, never blocked).
      if (facts.photos[0]) {
        const mirrored = await mirrorHeroPhoto(facts.photos[0]);
        if (mirrored) facts.photos[0] = mirrored;
      }
      let flyer = buildListingFlyer(facts, doc);

      // Comps — nearby RECORDED SALES (the chat comp lane: geocode → sold comps →
      // ≤2 exact-sale enrichments, ≤3 vendor calls, no LLM). Sold comps justify the
      // asking price without advertising purchasable competitors (operator decision
      // 07/11/2026). Chart + linked rows ("View →" to each comp's captured
      // realtor.com page). Best-effort: any miss ships the flyer without them.
      const compRes = facts.address ? await compsForAddress(facts.address).catch(() => null) : null;
      const comps = compRes?.comps ?? [];
      const subjectPrice = Number((facts.price ?? "").replace(/[^0-9]/g, "")) || null;
      const spec = buildSoldCompsSpec(
        comps,
        {
          street: facts.address?.split(",")[0]?.trim() ?? "This home",
          listPrice: subjectPrice,
        },
        new Date().toISOString().slice(0, 10),
      );
      if (spec) {
        const accent = doc.globalStyle?.accentColor ?? "#2563eb";
        const chartImg = await chartSpecToEmailImage(
          spec,
          accent,
          `comps-${facts.zip ?? "swfl"}-${Date.now()}`,
        ).catch(() => null);
        if (chartImg) {
          flyer = upsertChartBlock(flyer, chartImageBlock(chartImg));
        }
      }
      const compRows = soldCompsListBlock(comps);
      if (compRows) flyer = upsertSoldCompsBlock(flyer, compRows);

      const reparsed = EmailDocSchema.safeParse(flyer);
      if (reparsed.success) {
        return {
          payload: {
            doc: reparsed.data,
            applied: true,
            replacedLayout: true,
            listing: { sourceUrl: facts.sourceUrl },
          },
        };
      }
    }
  }

  const model = resolveEmailModel(mode);

  // Lake parts + chart in parallel. We pull the raw figures (each with its as-of) so a
  // STALE one can be refreshed from the web BEFORE the AI ever sees it (G28 + freshness).
  const [lakeParts, chartRes, photoRes, listingCtx] = await Promise.all([
    fetchLakeParts(scope),
    buildPromptChart(prompt, doc, scope, chartType),
    resolveHeroPhoto(prompt, doc),
    loadListingContext(scope, new Date(), { derivePhoto: deriveListingPhoto }),
  ]);

  // FRESHNESS — delegated to the shared root so the email path and the social calendar
  // run exactly ONE freshness implementation. includeGapProbe=true preserves the
  // figure-ask gap probe that was previously inline here.
  const today = new Date();
  const {
    lakeContext,
    web,
    webRefreshed: refreshedLabels,
  } = await refreshStaleLakeContext({
    scope,
    figures: lakeParts.figures,
    dossier: lakeParts.dossier,
    prompt,
    today,
    includeGapProbe: true,
  });
  const webBlock = renderWebFallbackBlock(web); // "" when no gap; starts with \n\n otherwise

  // Chart owns the kind:"chart" slot; a brand website (if set) makes it clickable
  // ("if a chart interests you, it brings them to a site") — tracked at send.
  if (chartRes)
    doc = upsertChartBlock(
      doc,
      chartImageBlock({ ...chartRes.image, linkUrl: brandWebsiteUrl(doc) }),
    );
  // Hero photo links back to the listing/site it was pulled from — the email
  // behaves like a webpage, and the click is tracked.
  if (photoRes)
    doc = upsertHeroPhoto(
      doc,
      heroPhotoBlock({
        url: photoRes.image,
        alt: photoRes.title ?? "Featured property",
        linkUrl: photoRes.source,
      }),
    );
  const chartGroundingPart = chartRes?.groundingNote
    ? `\n\nCHART ON SCREEN (caption it from THESE real figures, never invent):\n${chartRes.groundingNote}`
    : "";
  // When we refreshed a stale figure, the WEB-VERIFIED value IS the current one. Stop the
  // model captioning the chart's last (past) monthly point as "now" — the chart is history,
  // the web figure is now. This is the freshness fix the operator demanded for the display.
  const freshnessDirective =
    web.verified.length > 0
      ? `\n\nFRESHNESS — the WEB-VERIFIED figures are CURRENT (fetched live just now). For any metric they cover, state THAT value as the current/"now" figure and attribute it to its named source. If a chart on screen shows the same metric, describe the chart as the historical trajectory THROUGH its labeled date — never call the chart's last (past) point "now".`
      : "";
  // Real current inventory rides into the prompt as cited figures (four-lane safe).
  const listingsBlock = renderListingsBlock(listingCtx.figures);
  const listingsPart = listingsBlock ? `\n\n${listingsBlock}` : "";
  const fullContext =
    lakeContext + listingsPart + chartGroundingPart + webBlock + freshnessDirective;

  let msg: Anthropic.Message;
  try {
    msg = await getAnthropic("email_build").messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: contentPatchSystem(fullContext, !!chartRes),
      messages: [
        {
          role: "user",
          content: `CURRENT DOC (block id → current text):\n${docSkeleton(doc)}\n\nUser request: ${prompt}`,
        },
      ],
    });
  } catch {
    return {
      payload: {
        doc,
        applied: false,
        message: "The AI couldn't respond — check your API key or try again.",
      },
    };
  }

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  if (process.env.EMAIL_LAB_DEBUG === "1") {
    console.log("[email-lab/ai] raw model response:", text.slice(0, 500));
  }
  const patch = tryParsePatch(text);
  if (!patch) {
    return {
      payload: {
        doc,
        applied: false,
        message: "The AI returned an invalid response — try rephrasing.",
      },
    };
  }

  const candidate = applyPatch(doc, patch);
  const reparsed = EmailDocSchema.safeParse(candidate);
  if (!reparsed.success) {
    return {
      payload: {
        doc,
        applied: false,
        message: "The AI response didn't fit the layout — try rephrasing.",
      },
    };
  }

  // A template's EMPTY sources accordion is an open slot the patch can't write
  // (ContentPatch has no sources key) — seed it from the figures the filled doc
  // actually cites, web-verified ones with their urls (email_sources_accordion_autofill).
  let sourcedDoc = fillEmptySourcesBlock(
    reparsed.data,
    lakeParts.figures,
    web.verified.map((v) => ({ label: v.label, value: v.value, url: v.url })),
  );

  // Comp/listing-intent builds carrying a subject address get the LINKED sold-comp
  // rows ("View →" to each captured realtor.com page) — same one comp fetch that
  // fed the figures above, upsert-idempotent for scheduled rebuilds.
  const wantsCompRows =
    (lakeParts.addressComps?.length ?? 0) > 0 &&
    (isListingIntent(prompt) || /\b(comps?|comparables?|recent sales)\b/i.test(prompt));
  if (wantsCompRows) {
    const compRows = soldCompsListBlock(lakeParts.addressComps);
    if (compRows) {
      const withRows = EmailDocSchema.safeParse(upsertSoldCompsBlock(sourcedDoc, compRows));
      if (withRows.success) sourcedDoc = withRows.data;
    }
  }

  return {
    payload: {
      doc: sourcedDoc,
      applied: true,
      patch,
      chart: Boolean(chartRes),
      chartNote: chartRes?.note,
      photo: Boolean(photoRes),
      // Freshness: which stale held figures the AI replaced with a current web-cited value,
      // and the sources it cited — so the UI can show "found fresher data" + the citations.
      webRefreshed: refreshedLabels,
      webSources: web.verified.map((v) => ({ label: v.label, value: v.value, url: v.url })),
    },
  };
}

// ── The AUTHOR path (paid tier — build 03) ───────────────────────────────────
// Beside buildContentDoc (which only re-fills a FIXED skeleton), authorDoc lets the
// model compose the WHOLE document — which blocks, in what order, grouped into rows,
// with content — from the data MENU. The engine then derives the grid layout, gates
// the prose against invention, and returns a positioned EmailDoc. Brand is never
// authored (the incoming globalStyle carries through; applyBrand still overlays
// after); the content-patch + per-block fill paths above are untouched.
//
// MENU vs DOSSIER: the figures menu is the ONLY number source (id-selection); the
// master dossier rides along as QUALITATIVE context ("what's worth saying"), and
// the prose lint anchors on menu + chart figures — so a number lifted out of the
// dossier text is stripped, never silently shipped.
//
// FOLLOW-UPS (documented, not regressions — the free content-patch path keeps all
// of these): the author does not yet run the stale-figure web refresh or the
// model-driven external/upload/user gap-fill lanes; those join the menu + anchor
// set in a later increment.

/** Author quality defaults to Sonnet (the "connect it better" baseline); `max`/
 *  `opus` lifts to Opus, `interactive`/`haiku` drops to Haiku. Reuses the router ids. */
function resolveAuthorModel(mode?: string): string {
  const m = (mode ?? "").trim().toLowerCase();
  if (m === "max" || m === "opus") return EMAIL_MODEL_OPUS;
  if (m === "interactive" || m === "haiku") return EMAIL_MODEL_HAIKU;
  return EMAIL_MODEL_SONNET;
}

/** One forced-tool author call → a validated AuthoredDoc, or null on a miss. */
// Authoring a full multi-block doc (tool call) needs more headroom than a content
// patch — too small truncates the tool_use and the safeParse misses. 8192 covers a
// ~20-block email comfortably.
const AUTHOR_MAX_TOKENS = 8192;

async function callAuthor(
  model: string,
  system: string,
  user: string,
): Promise<AuthoredDoc | null> {
  try {
    const msg = await getAnthropic("email_build").messages.create({
      model,
      max_tokens: AUTHOR_MAX_TOKENS,
      system,
      tools: [AUTHOR_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: AUTHOR_TOOL.name },
      messages: [{ role: "user", content: user }],
    });
    const tool = msg.content.find((b) => b.type === "tool_use") as
      Anthropic.ToolUseBlock | undefined;
    if (!tool) {
      console.error("[email-lab/ai] callAuthor: model returned no tool_use block");
      return null;
    }
    const parsed = AuthorDocSchema.safeParse(tool.input);
    if (!parsed.success) {
      console.error("[email-lab/ai] callAuthor: tool input failed AuthorDocSchema:", parsed.error);
      return null;
    }
    return parsed.data;
  } catch (err) {
    // Previously a bare `catch { return null }` — every failure (network, rate
    // limit, API error) surfaced as the same "try rephrasing" message regardless
    // of cause, so a transient miss read as a permanent one. Log the real error;
    // the caller's message to the user stays generic (never leak internals),
    // but the log now tells us WHY instead of nothing.
    console.error("[email-lab/ai] callAuthor: request failed:", err);
    return null;
  }
}

// ── Listing-flyer slot fillers (the coded grid; only the blanks get filled) ───
/** Drop the empty chart slot when no chart resolved — never ship an empty box. */
function dropEmptyChartSlot(doc: EmailDoc): EmailDoc {
  return {
    ...doc,
    blocks: doc.blocks.filter(
      (b) => !(b.type === "image" && b.props.kind === "chart" && !b.props.url),
    ),
  };
}

/** Fill the FIRST empty text block (the commentary slot) with the paragraph. */
function fillNarrative(doc: EmailDoc, body: string): EmailDoc {
  let done = false;
  return {
    ...doc,
    blocks: doc.blocks.map((b) => {
      if (done || b.type !== "text" || (b.props.body ?? "").trim()) return b;
      done = true;
      return { ...b, props: { ...b.props, body } };
    }),
  };
}

/** One constrained Haiku call → a 2-3 sentence "just listed" paragraph built from
 *  ONLY the real record facts. Best-effort: nothing real to say (no price/beds/
 *  sqft), or any failure → null (the slot stays empty for the user to fill). Never
 *  invents — the model is told to state no number that isn't in the facts. */

async function authorListingNarrative(
  facts: ListingFacts,
  context?: string,
): Promise<string | null> {
  // Nothing real to describe → leave the slot empty (never improvise a house).
  if (!facts.price && !facts.beds && !facts.sqft) return null;
  const lines = [
    facts.address && `Address: ${facts.address}`,
    facts.price && `List price: ${facts.price}`,
    facts.beds && `Beds: ${facts.beds}`,
    facts.baths && `Baths: ${facts.baths}`,
    facts.sqft && `Square feet: ${facts.sqft}`,
    facts.lotSize && `Lot: ${facts.lotSize}`,
    facts.propertyType && `Type: ${facts.propertyType}`,
    facts.yearBuilt && `Year built: ${facts.yearBuilt}`,
    facts.city && `City: ${facts.city}`,
    facts.zip && `ZIP: ${facts.zip}`,
    facts.isNewConstruction && `This is NEW CONSTRUCTION (vendor-stated).`,
    facts.isPriceReduced &&
      facts.priceReduction &&
      `The price was REDUCED by ${facts.priceReduction} from its original ask.`,
    facts.remarks && `The listing's own description: ${facts.remarks.slice(0, 1200)}`,
    context && `Recent sales nearby (background only — this email is NOT about comps):\n${context}`,
  ].filter(Boolean);
  // The old prompt handed the model the spec cells and said "use ONLY these facts" —
  // so the only sentence it COULD write was the cells read back ("a 3-bedroom,
  // 2,847 square-foot home offered at $595,000"), printed directly under a grid that
  // already says exactly that. Write like a listing description instead: say what the
  // home IS and what the neighborhood context means, and let the grid carry the specs.
  const system =
    `You write the property description for a "just listed" real-estate email — the ` +
    `paragraph an agent puts under the photo. Two to four sentences.\n\n` +
    `THIS EMAIL IS ABOUT THE HOUSE. Not the market, not the comps. A buyer reading it ` +
    `wants to know what this property IS.\n\n` +
    `IF THE AGENT'S OWN LISTING DESCRIPTION IS PROVIDED, IT IS THE SOURCE OF TRUTH and ` +
    `your job is to TIGHTEN it into email prose — pull the details that make this home ` +
    `distinctive (the setting, the water, the rooms, the standout features) and cut the ` +
    `rest. Do not reproduce it at full length, and do not flatten it into generalities: ` +
    `the specifics ARE the value. Without it, lead with what is most distinctive and ` +
    `true from the facts — new construction, a price that has come down, scale, the lot.\n\n` +
    `THE SPEC GRID ALREADY SHOWS price, beds, baths, square feet, lot, and type directly ` +
    `above your paragraph. Do NOT list them back. A description that recites the specs is ` +
    `a failure. Nearby sales are BACKGROUND ONLY — do not turn this into a comps ` +
    `analysis; at most one clause may touch the market, and only if it serves the house.\n\n` +
    `WHEN YOU USE THE AGENT'S WORDS, KEEP THEM TRUE. "Five-minute idle to open water" does ` +
    `not become "five minutes to the river" — if you restate a detail, restate what it ` +
    `actually said. And never add a selling claim of your own: "priced to move", "won't ` +
    `last", "a rare opportunity" are YOUR words, not facts about the house. Describe; ` +
    `do not pitch.\n\n` +
    `HARD RULES. Every number you write must appear in the facts given. And a FACT ABOUT ` +
    `THE HOME IS NOT ONLY A NUMBER: you may not assert a view, a waterfront, a pool, a ` +
    `renovation, a garage, a school, a floor plan, a finish, a builder, or a neighborhood ` +
    `character unless the facts state it. You are describing a house you have never seen — ` +
    `you know its price, size, lot, type, and what sold near it, and NOTHING ELSE. If a ` +
    `sentence needs a detail you were not given, cut the sentence. Write about what the ` +
    `size and the lot and the comparable sales actually support. No hype ("stunning", ` +
    `"dream home", "won't last"), no exclamation marks. Plain, confident, specific. ` +
    `Return ONLY the paragraph.`;
  const user = `FACTS:\n${lines.join("\n")}\n\nWrite the description.`;
  try {
    const msg = await getAnthropic("email_build").messages.create({
      // Prose quality is the whole job here; Haiku wrote the robot sentence.
      model: EMAIL_MODEL_SONNET,
      max_tokens: 500,
      system,
      messages: [{ role: "user", content: user }],
    });
    const t = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    return t || null;
  } catch {
    return null;
  }
}

/** Run the full Email Lab AUTHOR build. Returns a positioned (chart/photo-filled,
 *  brand-overlaid-later) EmailDoc, or the current doc + a message on a miss. */
export async function authorDoc({
  prompt,
  rawDoc,
  scope,
  mode,
  chartType,
  assets,
  replyEmail,
  recipeId: recipeOverride,
  recipeKey,
}: BuildArgs): Promise<BuildResult> {
  const docParsed = EmailDocSchema.safeParse(rawDoc);
  if (!docParsed.success) {
    return { httpStatus: 400, payload: { error: "Invalid email document." } };
  }
  const placeholderMiss = unfilledPlaceholderMiss(prompt);
  if (placeholderMiss) return placeholderMiss;
  const currentDoc = docParsed.data;

  // ── Subject-listing flyer lane (address spine) ─────────────────────────────
  // The New Listing recipe carries the subject ADDRESS but no URL. Resolve THAT
  // property's own for-sale record — real photo + price + beds/sqft — and build the
  // fixed listing FLYER grid (the same buildListingFlyer the pasted-URL path uses),
  // instead of letting the free author improvise a generic ZIP/comp card with no
  // house photo. A resolve miss returns the "paste your link or add a photo" ask —
  // never the placeholder grid (that would invent numbers), never a blocked build.
  // The address reaches us by EITHER of the two doors, and this lane is the ONE
  // authority on which: the homepage hero has an address FIELD (→ scope.address),
  // while the Email Lab's campaign button only seeds the recipe TEXT — there the
  // address the user types over the [[blank]] exists nowhere but the prompt. Gating
  // on scope alone is what sent every in-lab campaign build to the free author, which
  // improvised the photo-less ZIP grab-bag ("Typical asking rent") instead of the
  // flyer. Read both; a caller that has neither still falls through untouched.
  // ── RECIPE DISPATCH — identity, not a regex ────────────────────────────────
  // The key is the identity (lib/deliverable/recipes.ts). Resolve it from `rkey`,
  // and fall back to matching the prompt against the registry for old links and
  // stored arc steps. An organic typed ask matches nothing and falls straight
  // through to the generic author, byte-identical to before.
  //
  // What this replaces: `isNewListingRecipePrompt(prompt)` — a REGEX that was the
  // only gate into the working lane. Coming Soon, Comps, Under Contract and Sold all
  // carry a real address in their prompt and every one of them missed that regex, so
  // they resolved no subject and fell into the free author's photo-less grab-bag.
  // Fifteen of seventeen recipes died on that one `if`.
  const activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt);
  const recipeBuilder = activeRecipe ? builderFor(activeRecipe.key) : null;

  if (activeRecipe && recipeBuilder) {
    // Resolve the SUBJECT once, from a real record, before any layout happens. The
    // address reaches us by EITHER door — a field (homepage hero) or the prompt text
    // (the Lab's campaign button seeds only the recipe TEXT, so the address the user
    // types over the [[blank]] exists nowhere else). This lane is the ONE authority
    // on which; never re-gate a lane on how a door happens to pass something.
    const subject =
      activeRecipe.subject === "address"
        ? (scope?.address ?? subjectAddressFromPrompt(prompt))
        : null;
    const resolvedSubject = subject ? await resolveSubject(subject, prompt) : null;

    const built = await recipeBuilder({
      recipe: activeRecipe,
      prompt,
      currentDoc,
      facts: resolvedSubject?.facts ?? null,
      resolved: resolvedSubject?.resolved ?? false,
      zip: scope?.kind === "zip" ? scope.value : undefined,
    }).catch(() => null);

    if (built) {
      const parsed = EmailDocSchema.safeParse(built);
      // A RECIPE THAT FAILS VALIDATION MUST NOT LOOK LIKE A RECIPE THAT WORKED.
      //
      // This used to fall through to the generic author in silence, and that is the
      // disease wearing a lab coat: the user asked for a specific deliverable, the
      // builder produced a malformed one, and they got the free-author grab-bag with
      // no signal that anything went wrong. Caught live on 07/13 — the weekly's honest
      // read came back at 696 chars against a 500-char cap, the doc failed to parse,
      // and the fallback quietly seated a Lee County lake figure in the NATIONAL
      // headline slot. It rendered. It looked fine. It was a lane-3 violation.
      //
      // We still never refuse a build (RULE 0.7) — the generic author below is a real
      // email, not a failure page. But this is now LOUD, so a broken recipe is
      // discoverable instead of camouflaged.
      if (!parsed.success) {
        console.error(
          `[recipe:${activeRecipe.key}] builder produced an INVALID doc — falling back to the generic author. ` +
            `The user asked for "${activeRecipe.label}" and will NOT get it. Issues: ` +
            JSON.stringify(parsed.error.issues.slice(0, 5)),
        );
      }
      if (parsed.success) {
        return {
          payload: {
            doc: parsed.data,
            applied: true,
            replacedLayout: true,
            ...(resolvedSubject
              ? {
                  listing: {
                    subject: resolvedSubject.facts.address ?? subject!,
                    resolved: resolvedSubject.resolved,
                  },
                }
              : {}),
          },
        };
      }
      // Defensive only: a malformed doc falls through to the generic author below.
    }
  }

  // ── LEGACY subject-listing lane ────────────────────────────────────────────
  // Still reachable for a prompt that names a listing but resolves to no recipe key
  // and no builder. Deleting it would REGRESS those asks to the free author.
  const subjectAddress =
    !recipeBuilder && isNewListingRecipePrompt(prompt)
      ? (scope?.address ?? subjectAddressFromPrompt(prompt))
      : null;
  if (subjectAddress) {
    // Never refuse (RULE 0.7). Resolve the real record; on a miss fall back to an
    // address-only skeleton so the coded flyer grid ALWAYS lands on the canvas —
    // empty photo dropzone + empty cells the user fills. This reverses the 07/07
    // "ask for a link/photo" behavior per operator (07/08/2026): the branded grid
    // appears every time; empty cells ≠ the killed grab-bag (no invented numbers,
    // no generic ZIP/comp improviser — just blanks to fill).
    const resolved = await resolveSubjectListing(subjectAddress).catch(() => null);
    const facts: ListingFacts = resolved ?? {
      address: subjectAddress,
      photos: [],
      sourceUrl: BASE_URL,
    };
    // LANE 2 — the agent's own listing description, pasted into the build box. No vendor
    // sells us MLS remarks, so this is the ONLY source for what the home actually is
    // (the water, the rooms, the finishes). It never overwrites a description the record
    // already carries; it fills the gap the feed leaves.
    if (!facts.remarks) {
      const pasted = listingDescriptionFromPrompt(prompt);
      if (pasted) facts.remarks = pasted;
    }
    if (facts.photos[0]) {
      // Same durable-copy rule as the URL flyer: host OUR crop, so a re-send
      // months later never depends on the vendor CDN (miss keeps the original).
      const mirrored = await mirrorHeroPhoto(facts.photos[0]).catch(() => null);
      if (mirrored) facts.photos[0] = mirrored;
    }
    let flyer = buildListingFlyer(facts, currentDoc);

    // Fill the chart slot IN PLACE (preserve its grid layout). A ZIP home-value index
    // says nothing about a house — the chart an agent actually wants on a listing is
    // THIS HOME against the recent sales around it. We hold both halves: the subject's
    // list price (the record above) and the nearby sold comps. On any miss we drop the
    // empty slot rather than ship an empty box (a chart is a bonus, never a blocker).
    // NO CHART ON A NEW LISTING (operator, 07/13/2026). This email's visual IS the
    // property — the photo. A ZIP index says nothing about the house; a comps bar turns
    // it into a comps email; and the price then-vs-now was two bars, which is a fact
    // wearing a chart costume. A deliverable gets a chart when it is ABOUT a number.
    // This one is about a home, so the slot is dropped rather than filled with filler.
    // The comps and price-move shapes belong to the Comps / price-improved recipes and
    // are specified in docs/standards/deliverable-playbook.md — including the rule that
    // a comp must have beds AND sqft, or it's a vacant lot being charted against a house.
    flyer = dropEmptyChartSlot(flyer);

    // Fill the ONE commentary blank. The agent's remarks are the narrator's SOURCE, not
    // the body — buildListingFlyer prefills the slot with the raw remarks, and
    // fillNarrative skips a slot that isn't empty, so leaving it would ship 2,000
    // characters of raw MLS copy instead of email prose. Clear it, then author.
    // No comps context: this email is about the house, and handing the narrator a comp
    // set is what turned the paragraph into a market analysis last round.
    const narrative = await authorListingNarrative(facts);
    if (narrative) {
      flyer = {
        ...flyer,
        blocks: flyer.blocks.map((b) =>
          b.type === "text" ? { ...b, props: { ...b.props, body: "" } } : b,
        ),
      };
      flyer = fillNarrative(flyer, narrative);
    }

    const parsed = EmailDocSchema.safeParse(flyer);
    if (parsed.success) {
      return {
        payload: {
          doc: parsed.data,
          applied: true,
          replacedLayout: true,
          listing: { subject: facts.address ?? subjectAddress, resolved: Boolean(resolved) },
        },
      };
    }
    // Defensive only: a malformed flyer falls through to the generic author below.
  }

  const globalStyle = currentDoc.globalStyle; // brand is canonical — never authored
  const model = resolveAuthorModel(mode);

  // A place named IN THE PROMPT ("...for Cape Coral") resolves to its real ZIP
  // scope when the caller didn't already pass one — a ZIP inside a place's
  // boundary IS that place's data; the user should never have to supply a raw
  // ZIP by hand. Never overrides an explicit caller-supplied scope.
  const promptPlace = !scope?.value ? zipFromPromptPlace(prompt) : undefined;
  const effectiveScope: BuildScope | undefined = promptPlace
    ? { kind: "zip", value: promptPlace.zip }
    : scope;

  // Data feed + best-effort chart/photo, in parallel — the SAME producers the
  // content-patch path uses (each never throws; a chart/photo is a bonus). For an
  // allowlisted multi-ZIP city the chart is scoped to that city's ZIPs (a real
  // ZIP-by-ZIP chart) instead of the SWFL-wide top-12; every other place is undefined
  // here and takes the existing single-scope chart.
  const chartZips = cityZipsFor(promptPlace);
  const [lakeParts, chartRes, photoRes] = await Promise.all([
    fetchLakeParts(effectiveScope),
    buildPromptChart(prompt, currentDoc, effectiveScope, chartType, chartZips),
    resolveHeroPhoto(prompt, currentDoc),
  ]);

  // A multi-ZIP place (Cape Coral is six ZIPs, not one) needs figures from
  // EVERY ZIP it spans — the fetch above only covers the primary ZIP, which is
  // real Cape Coral data but a fraction of the city. Pull the rest in parallel
  // and merge (each figure's own label already carries its ZIP, so a straight
  // concat never blends two ZIPs into one falsely-averaged number). The chart,
  // photo, and dossier above stay primary-ZIP-only for now — those producers
  // take one scope value each; multi-ZIP dossier/chart aggregation is a
  // separate, bigger piece of work, not silently faked here.
  let figures = lakeParts.figures;
  if (promptPlace && promptPlace.zips.length > 1) {
    const otherZips = promptPlace.zips.filter((z) => z !== promptPlace.zip);
    const otherParts = await Promise.all(
      otherZips.map((z) => fetchLakeParts({ kind: "zip", value: z })),
    );
    figures = [...figures, ...otherParts.flatMap((p) => p.figures)];
  }

  const menu = buildFigureMenu(figures);
  const figuresById = figureMenuById(menu);
  const chartGroundingNumbers = chartRes?.groundingNote
    ? extractNumbers(chartRes.groundingNote)
    : [];
  // Lane 4: figures the USER typed (street number, an asking figure) join the
  // GENERAL anchors only — never recordedStrings, so "sold for $X" still
  // requires a recorded menu figure.
  const anchorStrings = collectAnchorNumbers(figures, [
    ...chartGroundingNumbers,
    ...promptAnchors(prompt),
  ]);
  const recordedStrings = collectRecordedAnchors(figures);

  // The deliverable-type recipe: an explicit lab pick / saved preferred_recipe wins,
  // else deterministic keyword routing; no match leaves the generic prompt
  // byte-identical (advisory only — RULE C2, no new gate).
  const resolvedRecipe = resolveRecipe(recipeOverride, prompt);

  // The agent-intro letter carries ONE clipping figure and no chart (recipe rule)
  // — without this, assembleAuthoredDoc force-reserves any offered chart above the
  // footer and a cross-SWFL ranking lands in a personal letter (seen live 07/05/2026).
  const chartSlot =
    chartRes && resolvedRecipe !== "agent-intro"
      ? { url: chartRes.image.url, alt: chartRes.image.alt, linkUrl: brandWebsiteUrl(currentDoc) }
      : null;
  const photoSlot = photoRes
    ? { url: photoRes.image, alt: photoRes.title ?? "Featured property", linkUrl: photoRes.source }
    : null;

  const assetMenu = buildAssetMenu(assets ?? []);
  const system = authorSystem({
    menu,
    dossier: lakeParts.dossier,
    // Block vocabulary comes from the ONE supply contract (block-contract.ts):
    // `authorable` is false only for `metric-card`, which is DATA-SEEDED (its held
    // value is `metricValue`, sourced from the ranked-candidate pool — see
    // lib/email/zip-seed.ts). The author writes `value_figure`, not `metricValue`,
    // so an authored metric-card would ship its placeholder number.
    vocabulary: AUTHORABLE_TYPES,
    hasChart: !!chartRes,
    chartGrounding: chartRes?.groundingNote,
    hasPhoto: !!photoRes,
    assetMenu,
    recipe: resolvedRecipe ? recipeSection(resolvedRecipe) : undefined,
    // Datasets awareness rides only when the prompt resolves one (advisory,
    // digit-free) — a non-matching build stays byte-identical.
    datasets: resolveConcoction(null, prompt) ? datasetsSection() : undefined,
  });
  const baseUser = effectiveScope?.value
    ? `User request: ${prompt}\nScope: ${effectiveScope.kind ?? "area"} ${effectiveScope.value}`
    : `User request: ${prompt}`;

  const authored = await callAuthor(model, system, baseUser);
  if (!authored) {
    return {
      payload: {
        doc: currentDoc,
        applied: false,
        message: "The AI couldn't author this — try rephrasing.",
      },
    };
  }

  const assemble = (a: AuthoredDoc): EmailDoc =>
    assembleAuthoredDoc({
      authored: a,
      figuresById,
      globalStyle,
      anchorNumbers: anchorStrings,
      chart: chartSlot,
      photo: photoSlot,
      defaultLinkUrl: brandWebsiteUrl(currentDoc),
      assetsById: assetMenuById(assetMenu),
      // Reply CTA: only when the prompt asks for a reply AND we know the
      // caller's address. The model writes the label; the engine owns the URL.
      buttonMailto: /\breply\b/i.test(prompt) && replyEmail ? `mailto:${replyEmail}` : undefined,
    });

  const firstParse = EmailDocSchema.safeParse(assemble(authored));
  if (!firstParse.success) {
    return {
      payload: {
        doc: currentDoc,
        applied: false,
        message: "The authored layout didn't validate — try rephrasing.",
      },
    };
  }
  let doc: EmailDoc = firstParse.data;

  // No-invention gate (gateNarrative philosophy) + voiceGuard (banned-phrase lint,
  // spec 2026-07-08): lint prose → on a number-violation OR a robotic corporate-AI
  // "tell", regenerate ONCE naming BOTH → then number-strip (sentence-level) and
  // voice-strip (phrase-surgical, number-safe) whatever survives. One repair round;
  // voiceGuard detection is pure/local, so it adds no extra model call.
  const lint = lintAuthoredProse(doc, anchorStrings, recordedStrings);
  const voice = voiceGuard(doc);
  let regenerations = 0;
  let stripped = false;
  let voiceStripped = false;
  if (!lint.ok || !voice.ok) {
    regenerations = 1;
    const problems: string[] = [];
    if (!lint.ok) {
      problems.push(
        "Your previous draft used numbers that are NOT in the DATA MENU. Re-author so every " +
          "number in prose is quoted verbatim from a [fN] figure, or removed:\n" +
          lint.offending.map((s) => `- "${s}"`).join("\n"),
      );
    }
    if (!voice.ok) {
      problems.push(
        "These phrases read as robotic corporate-AI filler — rewrite the copy in a natural, " +
          "human voice without them (keep every real figure):\n" +
          voice.tells.map((s) => `- "${s}"`).join("\n"),
      );
    }
    const retryUser = `${baseUser}\n\n${problems.join("\n\n")}`;
    const authored2 = await callAuthor(model, system, retryUser);
    const reparse2 = authored2 ? EmailDocSchema.safeParse(assemble(authored2)) : null;
    // Number gate first (sentence-level), then voiceGuard (phrase-surgical) on the
    // result — a number sharing a tell's sentence is never lost.
    let candidate: EmailDoc;
    if (reparse2?.success) {
      const lint2 = lintAuthoredProse(reparse2.data, anchorStrings, recordedStrings);
      if (lint2.ok) {
        candidate = reparse2.data;
      } else {
        candidate = lint2.stripped; // hard-strip the second draft's number offenders
        stripped = true;
      }
    } else if (!lint.ok) {
      candidate = lint.stripped; // no usable second draft — strip the first draft's numbers
      stripped = true;
    } else {
      candidate = doc; // regenerated for voice only, no usable retry — strip voice off the first draft
    }
    const voice2 = voiceGuard(candidate);
    if (!voice2.ok) {
      candidate = voice2.stripped;
      voiceStripped = true;
    }
    doc = candidate;
  }

  // Variants aren't walked by lintAuthoredProse/voiceGuard (they're top-level
  // EmailDoc fields, not block prose) — clean them here, once, unconditionally
  // (variants need cleaning even when the repair loop above never triggered).
  if (doc.subjectVariants?.length || doc.ctaVariants?.length) {
    doc = {
      ...doc,
      ...(doc.subjectVariants ? { subjectVariants: doc.subjectVariants.map(cleanTellText) } : {}),
      ...(doc.ctaVariants ? { ctaVariants: doc.ctaVariants.map(cleanTellText) } : {}),
    };
  }

  // Stripping only shortens strings, so the doc still validates; parse once more
  // defensively and fall back to the current doc on the (unexpected) miss.
  const finalParse = EmailDocSchema.safeParse(doc);
  let finalDoc = finalParse.success ? finalParse.data : currentDoc;

  // Dataset seeding (lib/concoctions/seed-authored.ts): prompt resolved a
  // dataset + params derivable from scope → append its engine-baked blocks
  // under the authored layout. Additive + fail-soft; re-parse defensively.
  if (finalParse.success) {
    const seeded = await seedResolvedDataset(finalDoc, prompt, effectiveScope ?? null);
    if (seeded.seededLabel) {
      const seededParse = EmailDocSchema.safeParse(seeded.doc);
      if (seededParse.success) finalDoc = seededParse.data;
    }
  }

  return {
    payload: {
      doc: finalDoc,
      applied: true,
      authored: true,
      chart: Boolean(chartRes),
      chartNote: chartRes?.note,
      photo: Boolean(photoRes),
      regenerations,
      stripped,
      voiceStripped,
      scheduleSuggestion: authored.schedule_suggestion ?? null,
    },
  };
}
