// lib/email/doc/types.ts
//
// Shared static contract for the Email Lab block canvas (Card 00).
// PURE data layer — no React, no imports. Everything downstream imports FROM
// here; this file imports from no one. Runtime validation lives in ./schema.ts
// (which conforms to these types); seed docs + factories live in ./default-docs.ts.
//
// Block prop fields are OPTIONAL by design: props are *options*, never a required
// set (spec → "Tokens are optional, never required"). A build renders only the
// fields it has; the rest fall back to component defaults or simply don't render.
// `stats[]` is the one structural exception (an array of cells).

export type BlockType =
  | "header"
  | "hero"
  | "stats"
  | "signal"
  | "text"
  | "image"
  | "listing"
  | "multi-column"
  | "list"
  | "metric-card"
  | "agent-card"
  | "agent-hero"
  | "social-icons"
  | "button"
  | "divider"
  | "footer"
  | "sources";

export type TextAlign = "left" | "center" | "right";

export type PaddingSize = "none" | "sm" | "md" | "lg";

/** Fence 3 — the blessed photo aspect ratios (the photo-size variety axis). A
 *  listing photo displays center-cropped to one of these; default 3:2 (the MLS
 *  standard) when unset, so every existing doc renders identically. User-choosable
 *  in the canvas; the AI leaves it at the default. Registry: block-contract.ts. */
export type PhotoRatio = "3:2" | "4:3" | "4:5" | "1:1" | "16:9";

export type FontFamily =
  | "MODERN_SANS"
  | "BOOK_SERIF"
  | "GEOMETRIC_SANS"
  | "PLAYFAIR_SERIF"
  | "LATO_SANS"
  | "MONTSERRAT_SANS";

// ── Social platforms ────────────────────────────────────────────────────────
// The eight pre-baked platforms. The runtime registry (label, brand color, URL
// detection, branding-token key) lives in `lib/email/social/platforms.ts` — the
// ONE root both the footer's social row AND the `social-icons` block read from.
// This type stays here (types.ts imports from no one); platforms.ts imports it.
export type KnownPlatform =
  "instagram" | "facebook" | "linkedin" | "x" | "tiktok" | "youtube" | "pinterest" | "threads";

/** A platform in a `social-icons` block: a known platform, or "custom" with a
 *  user-supplied label + resolved logo URL (favicon, else globe glyph). */
export type SocialPlatformType = KnownPlatform | "custom";
export type SocialDisplayMode = "icon" | "text" | "icon+text";
export type SocialLayout = "row" | "column";
export type SocialIconSize = "sm" | "md" | "lg";
export type SocialIconColor = "original" | "brand" | "custom";

// ── Per-block layout controls ───────────────────────────────────────────────
// USER-OWNED, AI-safe: ContentPatchSchema strip mode silently drops these even
// if the model tries to write them.

/** Per-block padding + background overrides. */
export interface BlockBase {
  /** Vertical padding: none=0 sm=12px md=24px(default) lg=36px; horizontal always 28px. */
  paddingY?: PaddingSize;
  /** Hex — overrides CARD_BG (#ffffff) for this block's outer Section only. */
  sectionBg?: string;
  /**
   * THE DESIGN VOCABULARY. Default "left" — every existing doc is unchanged.
   *
   * The blocks used to have NO way to express design: BlockBase had padding and a
   * background colour, and that was all. So a recipe could not say "centre this", and the
   * hand-drawn samples — which were raw HTML and could do anything — were literally
   * INEXPRESSIBLE in the document model. That is why the built email never looked like the
   * example, and it was never a builder problem. It was a vocabulary problem.
   *
   * Reuses the existing `TextAlign` (TextProps already carried one) so the two cannot drift.
   */
  align?: TextAlign;
}

// ── Per-block prop interfaces ───────────────────────────────────────────────
// Styling/link/identity fields (bgColor, *Url, companyName, name…) are
// USER-OWNED and sticky — the AI content-patch can never write them
// (enforced in ./schema.ts ContentPatchSchema). The AI writes message content
// only: kicker/value/label/prose/title/body/caption/alt/stats.

export interface HeaderProps {
  logoUrl?: string;
  companyName?: string;
  tagline?: string;
  bgColor?: string;
}

export interface HeroProps extends BlockBase {
  kicker?: string;
  value?: string;
  label?: string;
  prose?: string;
  linkUrl?: string;
  /** Render the kicker as a full-width ACCENT RIBBON above the hero ("◆ NEW LISTING ◆"),
   *  instead of an 11px caption. USER-OWNED. Default off — existing docs unchanged. */
  ribbon?: boolean;
  /** "label-first" puts the LABEL above the VALUE — the address over the price, which is
   *  how a listing flyer actually reads. Default "value-first" (today's behavior). */
  order?: "value-first" | "label-first";
}

export interface StatItem {
  value: string;
  label: string;
  /**
   * WHICH NUMBER MATTERS. Operator, 07/13/2026: *"we need to make numbers different sizes
   * and maybe colors in accordance with importance. also the order of where numbers go
   * based on importance. just looks bad."*
   *
   * He was right, and the reason was structural: StatItem was `{value, label}` — full stop.
   * A recipe had NO WAY TO SAY a number mattered, so `$209/sq ft` (which wins a listing
   * argument) rendered at exactly the same weight as `Type: Residential` (which nobody
   * cares about). Every cell identical; only the cell COUNT changed the size.
   *
   * Default undefined = today's uniform weight, so nothing existing shifts.
   */
  emphasis?: "primary" | "muted";
}

export interface StatsProps extends BlockBase {
  stats: StatItem[]; // 2–3 KPI cells (a "strip" carries more, smaller)
  /**
   * "grid" (default) = today's chunky equal cells.
   * "strip" = ONE delicate hairline-ruled row of small cells — the spec line a real listing
   * flyer runs under the price. Five cells in a strip read as a spec line; five cells in a
   * grid read as a wall.
   */
  variant?: "grid" | "strip";
  /** A footnote under a strip ("*Computed from list price ÷ listed square footage") — the
   *  provenance of a DERIVED cell, stated where the reader can see it. */
  footnote?: string;
}

export interface SignalProps extends BlockBase {
  kicker?: string;
  title?: string;
  body?: string;
  bgColor?: string;
  linkUrl?: string;
}

export interface TextProps extends BlockBase {
  body?: string;
  align?: TextAlign;
  linkUrl?: string;
}

export interface ImageProps extends BlockBase {
  url?: string;
  alt?: string;
  caption?: string;
  /** Distinguishes an auto-injected hero PHOTO ("photo" — a listing/website
   *  og:image) from an auto-injected market CHART (untagged) so the two `image`
   *  blocks coexist: the chart upsert skips kind:"photo". User-owned/sticky —
   *  the AI content-patch can never set it. */
  kind?: "chart" | "photo";
  /** Fence 3 — the photo's aspect ratio (center-cropped). Only applies to
   *  kind:"photo"; absent → 3:2 (behavior-neutral). User-owned/sticky — the AI
   *  content-patch can never set it; the canvas ratio picker writes it. */
  ratio?: PhotoRatio;
  /** Optional click-through URL — wraps the image in an <a> tag. */
  linkUrl?: string;
  // ── Text overlay ────────────────────────────────────────────────────────────
  // When overlayTitle or overlayBody is set, the image renders as a CSS
  // background-image (table cell) with text on top. Supported in Apple Mail,
  // iOS, Gmail web, Yahoo Mail. Outlook desktop falls back to a colored panel.
  /** AI-fillable headline on top of the image. */
  overlayTitle?: string;
  /** AI-fillable supporting text on top of the image. */
  overlayBody?: string;
  /** User-owned: hex text color. Defaults to #ffffff. */
  overlayTextColor?: string;
  /** User-owned: CSS color/rgba for the darkening scrim. Defaults to rgba(0,0,0,0.45). */
  overlayBg?: string;
  /** User-owned: horizontal text alignment inside the overlay. */
  overlayAlign?: TextAlign;
}

/** A single property card: photo on top, price, beds/baths/sqft, address. All
 *  fields are USER-OWNED / listing-sourced (a price is a real number — the AI
 *  content-patch can never write them; they come from the inspector or a listing
 *  URL pull). `badge` is a small tag ("Virtual Tour", "Just Sold"). */
export interface ListingProps extends BlockBase {
  photoUrl?: string;
  price?: string;
  beds?: string;
  baths?: string;
  sqft?: string;
  address?: string;
  badge?: string;
  /** Click-through to the listing — wraps the card photo in an <a> tag. */
  linkUrl?: string;
}

/** One column in a `multi-column` row — a flat "feature card": image + heading +
 *  body + optional link. Intentionally NOT nested blocks (the doc model stays a
 *  flat array; the paid grid is the path to richer side-by-side layouts). */
export interface MultiColumnColumn {
  imageUrl?: string;
  heading?: string;
  body?: string;
  linkUrl?: string;
  linkLabel?: string;
}

/** A 2–3 column row. Side by side on desktop, stacks to one column on mobile
 *  (fluid inline-block — the Cerberus pattern; degrades to stacked in Outlook).
 *  `columns[]` is the structural exception (ordered by array position, like
 *  `stats`). */
export interface MultiColumnProps extends BlockBase {
  columns: MultiColumnColumn[];
}

/** One row in a `list` block. `lead` is a short bold prefix (a date tag like
 *  "JUL 12 ·", a rank, a category); `text` is the row's content. */
export interface ListItem {
  lead?: string;
  text: string;
  /** Optional row click-through ("View →"). USER/ENGINE-owned like every link
   *  field — no AI patch path exists for list items' linkUrl. */
  linkUrl?: string;
}

/** A titled row list — events, tips, links-as-text. Renders as email-safe table
 *  rows (no <ul> bullets — spacing is uneven across clients). `items[]` is a
 *  structural exception (ordered by array position, like `stats`). */
export interface ListProps extends BlockBase {
  title?: string;
  items: ListItem[]; // 1–8 rows
}

/** A single ranked metric: a big value, a label, and an optional percentile bar.
 *  DATA-SEEDED, never AI-authored — the number-bearing fields are named OUTSIDE
 *  the AI content-patch allowlist (`metricValue`/`metricLabel`, like ListingProps'
 *  `price`/`beds`), so a content patch that tries to rewrite a held value is
 *  silently stripped and the component never reads it. Values are restated
 *  verbatim from the ranked-candidate pool (lib/zip-report/signal-rank) — the
 *  seed builder fills them; there is no client-side computation. */
export interface MetricCardProps extends BlockBase {
  /** Preformatted, e.g. "$495K" — a held number restated verbatim, never computed. */
  metricValue?: string;
  /** e.g. "Median Home Value". */
  metricLabel?: string;
  /** Secondary line, e.g. "90-day median sale price". */
  sub?: string;
  /** e.g. "#45 of 124 SWFL ZIPs" — built from the candidate's rankPos/rankOf. */
  rankText?: string;
  /** e.g. "↑ 6.85% YoY" — the candidate's own movementText, restated verbatim. */
  movementText?: string;
  /** 0–100 percentile — drives the bar width only. Undefined → no bar renders
   *  (never a fabricated midpoint; a bar is a restatement of a held percentile). */
  barPct?: number;
}

export interface AgentCardProps {
  photoUrl?: string;
  name?: string;
  title?: string;
  bio?: string;
  phone?: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

/** Full-bleed rectangular agent photo — banner height, name + designation in a
 *  brand-colored strip below. Not a circle. Meant to be the first impression. */
export interface AgentHeroProps {
  photoUrl?: string;
  alt?: string;
  name?: string;
  designation?: string;
  tagline?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

/** One entry in a `social-icons` block. `url` is the destination; `type` selects
 *  the pre-baked icon, or "custom" → render `logoUrl` (resolved) with `label`. */
export interface SocialPlatformEntry {
  type: SocialPlatformType;
  url: string;
  /** Custom platforms: the display name. Known platforms auto-label from the registry. */
  label?: string;
  /** Custom platforms only: favicon-resolved icon URL. */
  logoUrl?: string;
}

/** Standalone social row. `platforms[]` is the structural exception (ordered by
 *  array position — no separate `order` field, one source of truth). The rest
 *  are options with component defaults: icon+text · row · md · original color. */
export interface SocialIconsProps {
  platforms: SocialPlatformEntry[];
  displayMode?: SocialDisplayMode;
  layout?: SocialLayout;
  iconSize?: SocialIconSize;
  iconColor?: SocialIconColor;
  /** Hex — used only when iconColor === "custom". */
  customIconColor?: string;
}

export interface ButtonProps {
  label?: string;
  url?: string;
  bgColor?: string;
}

export interface DividerProps {
  color?: string;
}

/** One held citation — same shape as `RawCitation` (lib/citations/clean-url), kept
 *  structurally duck-typed rather than imported so this file stays import-free. */
export interface SourceCitation {
  url?: string;
  label?: string;
}

/** The collapsed "Sources" block — DATA-SEEDED (the builder that assembles the
 *  doc lists real held/cited sources), never AI-authored: there is no content-patch
 *  or author field for it, so a send can never show an invented citation. On the
 *  CANVAS it renders default-CLOSED with a click-to-open list (native <details>),
 *  the same collapsed-by-default rule every other citation surface follows
 *  (components/CitationList.tsx). In the SENT email it renders one compact
 *  "Sources (N) — view all" line instead — Gmail strips <details>/<summary>
 *  (caniemail, verified 07/19/2026), so an in-email accordion cannot stay closed.
 *  `sources[]` is the structural exception (ordered by array position, like
 *  `stats`/`items`/`columns`). */
export interface SourcesProps extends BlockBase {
  sources: SourceCitation[];
  /** Small print line under the accordion (e.g. a refresh/freshness note). */
  note?: string;
  /** Web home of the full source list (e.g. the ZIP report's #section-sources
   *  accordion) — the sent email's "view all" line links here. */
  viewAllUrl?: string;
}

export interface FooterProps {
  companyName?: string;
  address?: string;
  websiteUrl?: string;
  phone?: string;
  email?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  linkedinUrl?: string;
  /** Display order of the footer social icons. Only platforms with a URL set
   *  render; omitted → registry default order. Footer always renders icon+text. */
  socialOrder?: KnownPlatform[];
  /** Required for CAN-SPAM. Always rendered when present; block cannot be deleted when it's the last footer. */
  unsubscribeUrl?: string;
}

/** Type-level map from block type → its props shape. Single source for per-type
 *  props, used to derive both `EmailBlock` and the default-props table. */
export interface BlockPropsMap {
  header: HeaderProps;
  hero: HeroProps;
  stats: StatsProps;
  signal: SignalProps;
  text: TextProps;
  image: ImageProps;
  listing: ListingProps;
  "multi-column": MultiColumnProps;
  list: ListProps;
  "metric-card": MetricCardProps;
  "agent-card": AgentCardProps;
  "agent-hero": AgentHeroProps;
  "social-icons": SocialIconsProps;
  button: ButtonProps;
  divider: DividerProps;
  footer: FooterProps;
  sources: SourcesProps;
}

// ── Data binding (concoctions) ──────────────────────────────────────────────
// ENGINE-OWNED like `layout`: written only by the materializer
// (lib/concoctions/materialize.ts). The AI patch/author schemas never list it,
// so strip mode drops any attempt (binding-fence.test.ts). Props still carry
// BAKED values — a binding is memory (refresh/rebind/turn-into/provenance),
// never render plumbing; every renderer and export path reads props only.

export const BINDING_VERSION = 1;

export type BindingLane = "lake" | "upload" | "web" | "user";

/** Which slice of the bundle this block renders. */
export interface BindingSlice {
  measures: string[];
  dimension?: string;
  filter?: Record<string, string | number>;
  topN?: number;
}

export interface BlockBinding {
  /** Binding schema version — old versions degrade to "can't refresh", never throw. */
  v: number;
  lane: BindingLane;
  /** lane "lake": registry id + params. */
  concoctionId?: string;
  params?: Record<string, string | number>;
  /** lanes "upload" | "web" | "user": reference to the extracted/cited/stated bundle. */
  bundleRef?: string;
  slice: BindingSlice;
  /** MM/DD/YYYY at materialization — the chip + staleness compare read this. */
  asOf: string;
  /** Chip label for `asOf` (default "As of") — set when the date is a
   *  verification date, not the data period (which lives in sourceLine). */
  asOfLabel?: string;
  sourceLine: string;
}

/**
 * Optional grid position (react-grid-layout v2 item shape; the block `id` is the
 * RGL item `i`). PAID-tier only: a block with NO `layout` renders stacked exactly
 * like the free tier today; a block WITH `layout` lives on the resizable grid.
 * Backward-compatible — never required.
 */
export interface BlockLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  /** Locked block (e.g. footer/unsubscribe) — not draggable/resizable. */
  static?: boolean;
}

/**
 * A single block. Discriminated on `type`; `id` is always present post-parse
 * (the schema's transform mints one when absent — ids never come from the model).
 * Built from `BlockPropsMap` so each variant carries its precise props type.
 * `layout` is optional grid positioning (paid tier); absent = stacked (free tier).
 */
export type EmailBlock = {
  [K in BlockType]: {
    id: string;
    type: K;
    props: BlockPropsMap[K];
    layout?: BlockLayout;
    binding?: BlockBinding;
  };
}[BlockType];

/** Narrow `EmailBlock` to a single type's variant (used by block components). */
export type BlockOf<K extends BlockType> = Extract<EmailBlock, { type: K }>;

export interface EmailGlobalStyle {
  primaryColor: string; // e.g. "#0f1d24"
  accentColor: string; // e.g. "#3DC9C0"
  fontFamily: FontFamily;
  /** Headline font (header company name, hero value). Absent → fontFamily. */
  displayFontFamily?: FontFamily;
  textColor: string; // e.g. "#242424"
  backdropColor: string; // e.g. "#F8F8F8"
  /** Light card/stat surface. Absent → block CARD_BG default (#ffffff). */
  surfaceColor?: string;
  /** Dark surface (dark cards / canvas siblings). Absent → engine defaults. */
  surfaceDarkColor?: string;
}

export interface EmailDoc {
  globalStyle: EmailGlobalStyle;
  blocks: EmailBlock[]; // ordered array — index = render order
  /** Up to 4 AI-authored subject-line alternatives; [0] is the default subject
   *  (deriveEmailDocSubject prefers it). Absent → today's block-derived subject. */
  subjectVariants?: string[];
  /** Up to 4 AI-authored CTA-label alternatives for the doc's button block.
   *  Absent → today's single button_label. */
  ctaVariants?: string[];
  /** Per-doc "keep always fresh" dial for data-bound (dataset) blocks: when on,
   *  the FIRST EDIT ACTION of a session re-bakes stale bindings — never the
   *  open (an accidental open costs nothing; operator rule 07/12/2026). */
  datasetsAlwaysFresh?: boolean;
}
