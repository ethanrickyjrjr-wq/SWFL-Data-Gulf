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
export type PhotoRatio = "3:2" | "4:3" | "4:5" | "1:1";

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
}

export interface StatItem {
  value: string;
  label: string;
}

export interface StatsProps extends BlockBase {
  stats: StatItem[]; // 2–3 KPI cells
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

/** The collapsed "Sources" accordion — DATA-SEEDED (the builder that assembles the
 *  doc lists real held/cited sources), never AI-authored: there is no content-patch
 *  or author field for it, so a send can never show an invented citation. Renders
 *  default-CLOSED with a click-to-open list (native <details>, no JS needed), the
 *  same collapsed-by-default rule every other citation surface follows
 *  (components/CitationList.tsx). `sources[]` is the structural exception (ordered
 *  by array position, like `stats`/`items`/`columns`). */
export interface SourcesProps extends BlockBase {
  sources: SourceCitation[];
  /** Small print line under the accordion (e.g. a refresh/freshness note). */
  note?: string;
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
  [K in BlockType]: { id: string; type: K; props: BlockPropsMap[K]; layout?: BlockLayout };
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
}
