// lib/email/doc/default-docs.ts
//
// "Start from" seed EmailDocs + block factories (Card 00). PURE data layer.
// The legacy TEMPLATES picker maps onto SEED_DOCS (spec → Template regression:
// the picker becomes a seed list, it is not deleted). Each `build()` mints FRESH
// block ids so picking a seed twice never aliases two docs to the same ids.

import { mintBlockId } from "./schema";
import type {
  BlockLayout,
  BlockOf,
  BlockPropsMap,
  BlockType,
  EmailDoc,
  EmailGlobalStyle,
} from "./types";

/** SWFL house brand. The brand pickers overwrite these per project; they are
 *  user-owned and sticky (the AI never rewrites globalStyle). */
export const DEFAULT_GLOBAL_STYLE: EmailGlobalStyle = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

/** Default props for each block type — used by the add-block palette and by the
 *  seed builder below. Sensible placeholders; the user/AI fills real content. */
// Brand-bearing blocks (header / footer / agent-*) default to the SWFL Data Gulf
// HOUSE BRAND, never lorem-style placeholders: the AI content fill deliberately
// skips brand blocks, so an empty brand profile used to ship "Your Company" /
// "123 Main St" in REAL sends (operator ruling 07/05/2026 — house brand until the
// user's own brand overrides via applyBrand/brandingToTokens).
export const HOUSE_BRAND = {
  companyName: "SWFL Data Gulf",
  tagline: "Southwest Florida Market Intelligence",
  // Icon-only, transparent mark — header/doc-report already render companyName as
  // text right next to this image. logo-name.png (full wordmark, opaque bg) is for
  // standalone placements (README, style-gallery) with no adjacent text; using it
  // here duplicated the brand name and boxed a near-black rect inside the header.
  logoUrl: "https://www.swfldatagulf.com/logo-mark.png",
  address: "Fort Myers, FL",
  email: "hello@swfldatagulf.com",
  websiteUrl: "https://www.swfldatagulf.com",
} as const;

export const DEFAULT_BLOCK_PROPS: { [K in BlockType]: BlockPropsMap[K] } = {
  header: {
    companyName: HOUSE_BRAND.companyName,
    tagline: HOUSE_BRAND.tagline,
    logoUrl: HOUSE_BRAND.logoUrl,
  },
  // Data-bearing blocks follow THE SLOT RULE (check: email_palette_demo_figures):
  // a field whose right answer depends on real data ships EMPTY, with the
  // instruction in the label — docSkeleton skips empty fields, so an empty value
  // is an open slot the AI fills, while a filled one reads as "the current
  // answer" and can ship verbatim into a real send.
  hero: {
    kicker: "Market Spotlight",
    value: "",
    label: "The headline number and what it measures",
    prose: "Write a quick, plain-language read on what this number means for readers.",
  },
  stats: {
    stats: [
      { value: "", label: "Median DOM" },
      { value: "", label: "Months of Supply" },
      { value: "", label: "YoY Price" },
    ],
  },
  signal: {
    kicker: "Signal to Watch",
    title: "Name the one shift worth watching",
    body: "Say what's changing and why it matters — inventory, pricing, or buyer behavior.",
  },
  text: { body: "Write your message here.", align: "left" },
  image: { url: "", alt: "", caption: "" },
  listing: {
    photoUrl: "",
    price: "",
    beds: "",
    baths: "",
    sqft: "",
    address: "",
    badge: "",
  },
  "multi-column": {
    columns: [
      { heading: "Column one", body: "A short description for the first column." },
      { heading: "Column two", body: "A short description for the second column." },
    ],
  },
  list: {
    title: "Worth knowing",
    items: [
      { lead: "MON ·", text: "First item — a short line readers can scan." },
      { lead: "TUE ·", text: "Second item — swap these for events, tips, or links." },
    ],
  },
  "metric-card": {
    metricValue: "",
    metricLabel: "Name the metric this card carries",
    sub: "",
    rankText: "",
    movementText: "",
    // No barPct: a bar restates a held percentile — absent means no bar renders.
  },
  // ⚠️ THE AI DELIBERATELY SKIPS BRAND BLOCKS — so whatever is defaulted here is what a
  // RECIPIENT READS. `name`/`title`/`ctaLabel` are the HOUSE BRAND (real, sendable, per
  // the 07/05/2026 ruling). But `bio` and `tagline` were LOREM INSTRUCTIONS ("A short bio
  // that builds trust with your readers"), and nothing ever overwrote them: verified live
  // on 07/13 — that exact sentence rendered into the SENT New Listing email, under the
  // agent's own name. An instruction to the author is never copy for the reader.
  //
  // They are now "" — and the blocks already omit an empty line on the sendable paths
  // (AgentCardBlock: `props.bio || scope`), so the gap simply closes.
  "agent-card": {
    name: HOUSE_BRAND.companyName,
    title: "Market Intelligence",
    bio: "",
    phone: "",
    ctaLabel: "Get in touch",
  },
  "agent-hero": {
    photoUrl: "",
    alt: "Agent photo",
    name: HOUSE_BRAND.companyName,
    designation: HOUSE_BRAND.tagline,
    tagline: "",
    ctaLabel: "Schedule a call",
    ctaUrl: "",
  },
  "social-icons": {
    platforms: [],
    displayMode: "icon+text",
    layout: "row",
    iconSize: "md",
    iconColor: "original",
  },
  button: { label: "View Full Report", url: "" },
  divider: { color: "#E5E7EB" },
  // Empty by default — the block renders nothing until the builder seeds real
  // held citations (never a placeholder "Source 1" a real send could ship).
  sources: { sources: [] },
  footer: {
    companyName: HOUSE_BRAND.companyName,
    address: HOUSE_BRAND.address,
    phone: "",
    email: HOUSE_BRAND.email,
    websiteUrl: HOUSE_BRAND.websiteUrl,
    instagramUrl: "",
    facebookUrl: "",
    linkedinUrl: "",
    unsubscribeUrl: "#unsubscribe",
  },
};

/** Fresh, mutable copy of a block type's default props. */
export function defaultPropsFor<K extends BlockType>(type: K): BlockPropsMap[K] {
  return structuredClone(DEFAULT_BLOCK_PROPS[type]);
}

/** Mint a brand-new block with default props (used by the add-block palette). */
export function createBlock<K extends BlockType>(type: K): BlockOf<K> {
  // Generic-over-K construction: the object is built to match BlockOf<K> but TS
  // can't relate the mapped props access to the discriminated Extract, so it
  // routes through `unknown` (TS-recommended for this sound generic cast).
  return { id: mintBlockId(), type, props: defaultPropsFor(type) } as unknown as BlockOf<K>;
}

/** Seed-builder helper: a block with default props plus optional overrides. */
function seedBlock<K extends BlockType>(
  type: K,
  overrides: Partial<BlockPropsMap[K]> = {},
): BlockOf<K> {
  return {
    id: mintBlockId(),
    type,
    props: { ...defaultPropsFor(type), ...overrides },
  } as unknown as BlockOf<K>;
}

/** Grid seed-builder: same as seedBlock but carries a BlockLayout for paid-tier
 *  pre-positioned templates. The canvas uses these x/y/w/h values to place the
 *  block on the react-grid-layout canvas; free-tier ignores layout and stacks. */
function seedBlockGrid<K extends BlockType>(
  type: K,
  layout: BlockLayout,
  overrides: Partial<BlockPropsMap[K]> = {},
): BlockOf<K> {
  return {
    id: mintBlockId(),
    type,
    props: { ...defaultPropsFor(type), ...overrides },
    layout,
  } as unknown as BlockOf<K>;
}

export interface SeedDoc {
  id: string;
  name: string;
  description: string;
  /** Builds a fresh EmailDoc with newly-minted block ids each call. */
  build: () => EmailDoc;
}

const style = (): EmailGlobalStyle => ({ ...DEFAULT_GLOBAL_STYLE });

// ─────────────────────────────────────────────────────────────────────────────
// THE SLOT RULE — read before authoring or editing a template below.
//
//   If a field's right answer depends on real data, leave it EMPTY ("") and put
//   the instruction in the LABEL. If it's structure, style, brand, or a button
//   that says "Schedule a Showing," fill it in.
//
// This is mechanical, not stylistic. docSkeleton (build-doc.ts:317) builds the
// AI's view of a template and SKIPS any field whose value is "" — so an empty
// value is an OPEN SLOT the AI fills, while a filled value is handed to the AI
// as "the current answer" and may simply be kept. The label is ALWAYS sent.
//
//   => A label is an instruction to whoever fills the slot, not a caption.
//
//   OPEN ("")   every figure · every photo · every commentary sentence · every link
//   FILLED      layout (x/y/w/h) · globalStyle · brand · stats labels ("Beds") ·
//               button labels · caption/alt written as instructions
//
// `trend-snapshot` (bottom of this file) is the reference implementation:
//   { value: "", label: "The headline number the chart supports" }
//
// Charts need no authoring: reserve an `image` block with the layout you want and
// upsertChartBlock (inject-chart.ts) replaces it IN PLACE. Colors need no
// authoring: applyBrand overlays the user's brand after the fill.
//
// NOTE: many templates below predate this rule and carry finished EXAMPLE numbers
// (a demo look). That is a known divergence, tracked in `checks` as
// `seed_static_figures_bypass_invention_gate` — do not copy that pattern into a
// new template. Full playbook:
//   docs/superpowers/specs/2026-07-08-seed-slot-playbook-handoff.md
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Linear "start from" seeds. These cover the single-column templates; the 5
 * structural templates (shell-two-col, email-compare, email-hbar, email-table,
 * email-ranked) stay on the legacy token rail (spec → Template regression).
 */
export const SEED_DOCS: SeedDoc[] = [
  {
    id: "market-spotlight",
    name: "Market Spotlight",
    description: "Big headline number, KPIs, the trend chart behind it, and a signal to watch.",
    build: () => ({
      globalStyle: style(),
      blocks: [
        seedBlock("header"),
        seedBlock("hero", {
          kicker: "Market Spotlight",
          value: "",
          label: "The headline number and what it measures",
          prose: "Write a quick, plain-language read on where the market's heading this month.",
        }),
        seedBlock("stats", {
          stats: [
            { value: "", label: "Median DOM" },
            { value: "", label: "Months of Supply" },
            { value: "", label: "YoY Price" },
          ],
        }),
        // Chart slot — upsertChartBlock replaces it in place (no authoring needed).
        seedBlock("image", {
          alt: "Market trend chart",
          caption: "The 12-month trend behind the headline",
        }),
        seedBlock("signal", {
          kicker: "Signal to Watch",
          title: "Name the one shift worth watching this month",
          body: "Say what's changing and why it matters — inventory, pricing, or buyer behavior.",
        }),
        seedBlock("button"),
        seedBlock("footer"),
      ],
    }),
  },
  {
    id: "just-sold",
    name: "Just Sold",
    description: "Photo of the win, the numbers behind it, sign off as the agent.",
    // MIRRORS what the Just Sold BUTTON builds (lib/deliverable/recipes/just-sold.ts).
    // The seed card is that deliverable unfilled; the button is it filled from the
    // resolved house. seed-recipe-parity.test.ts fails the suite if they drift.
    //
    // "Days on Market" is GONE from the spec row on purpose: no source we hold carries
    // a days-to-contract or days-to-sale interval for a subject property. A cell we can
    // never fill honestly is not an open slot — it is an invitation to invent one, and
    // a builder did exactly that ("went under contract after 75 days on market").
    // It wears the CAMPAIGN CHROME (lib/email/lifecycle-chrome.ts) — the same shape as its
    // six siblings, so a subscriber walking the campaign sees one agent, not seven.
    build: () => ({
      globalStyle: style(),
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }),
        seedBlockGrid("hero", { x: 0, y: 2, w: 12, h: 1 }, { kicker: "Just Sold", ribbon: true }),
        seedBlockGrid(
          "image",
          { x: 0, y: 3, w: 12, h: 6 },
          { alt: "Photo of the sold property", kind: "photo" },
        ),
        seedBlockGrid(
          "hero",
          { x: 0, y: 9, w: 12, h: 4 },
          {
            value: "",
            label: "The close and where it sold",
            prose: "",
            align: "center",
            order: "label-first",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 13, w: 12, h: 3 },
          {
            variant: "strip",
            stats: [
              { value: "", label: "Beds" },
              { value: "", label: "Baths" },
              { value: "", label: "Sq Ft" },
              { value: "", label: "$/Sq Ft" },
              { value: "", label: "List Price", emphasis: "muted" as const },
              { value: "", label: "List-to-Sale", emphasis: "primary" as const },
            ],
          },
        ),
        seedBlockGrid("text", { x: 0, y: 16, w: 12, h: 4 }, { body: "", align: "left" }),
        // The agent and the ask share ONE row ({7,5}) — mirrors buildLifecycleEmail, which is
        // the authority for this card's shape (seed-recipe-parity.test.ts holds them equal).
        seedBlockGrid("agent-card", { x: 0, y: 20, w: 7, h: 4 }),
        seedBlockGrid("button", { x: 7, y: 20, w: 5, h: 2 }, { label: "What's My Home Worth?" }),
        seedBlockGrid("footer", { x: 0, y: 24, w: 12, h: 3, static: true }),
      ],
    }),
  },
  {
    id: "market-letter",
    name: "Market Letter",
    description: "An editorial note: intro, narrative, a signal, and your sign-off.",
    build: () => ({
      globalStyle: { ...style(), displayFontFamily: "PLAYFAIR_SERIF" },
      blocks: [
        seedBlock("header"),
        seedBlock("hero", {
          kicker: "This Month in SWFL",
          value: "",
          label: "Lee & Collier Counties",
        }),
        seedBlock("text", {
          body: "Open with the story behind the month's numbers — what shifted and why it matters to your readers.",
        }),
        seedBlock("signal", {
          kicker: "Signal to Watch",
          title: "Name the one shift worth watching this month",
          body: "Say what's changing and why it matters — inventory, pricing, or buyer behavior.",
        }),
        seedBlock("divider"),
        seedBlock("agent-card"),
        seedBlock("footer"),
      ],
    }),
  },
  {
    id: "listing-feature",
    name: "Listing Feature",
    description: "A photo-led feature for a single property or neighborhood.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F7F5F2",
        accentColor: "#8A6D3B",
      },
      blocks: [
        seedBlock("header"),
        seedBlock("hero", { kicker: "Featured Listing", value: "", label: "" }),
        seedBlock("image", {
          alt: "Featured property",
          caption: "Add a caption for this photo.",
          kind: "photo",
          ratio: "4:5",
        }),
        seedBlock("text", { body: "Describe what makes this property stand out." }),
        seedBlock("button", { label: "See the Listing" }),
        seedBlock("footer"),
      ],
    }),
  },
  {
    id: "welcome",
    name: "Welcome",
    description: "Onboard a new subscriber: who you are and what to expect.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F6F8F6",
        accentColor: "#3F7D5C",
        displayFontFamily: "BOOK_SERIF",
      },
      blocks: [
        seedBlock("header"),
        seedBlock("hero", {
          kicker: "Welcome",
          value: "",
          label: "",
          prose:
            "Welcome them in your own voice — who you are, what they'll get, and how often you'll send it.",
        }),
        seedBlock("agent-card"),
        seedBlock("button", { label: "Explore the Data" }),
        seedBlock("footer"),
      ],
    }),
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "A clean header, one message, and a call to action.",
    build: () => ({
      globalStyle: style(),
      blocks: [
        seedBlock("header"),
        seedBlock("hero", { kicker: "", value: "", label: "" }),
        seedBlock("button"),
        seedBlock("footer"),
      ],
    }),
  },
  {
    id: "agent-spotlight",
    name: "Agent Spotlight",
    description: "Lead with the agent photo, then track record and a clear call to action.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#FAF6F0",
        primaryColor: "#1F2937",
        accentColor: "#D97706",
        fontFamily: "PLAYFAIR_SERIF",
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("hero", {
          kicker: "Meet Your Agent",
          value: "",
          label: "Your name, license, and the counties you serve",
          prose:
            "Introduce yourself in a sentence or two — what you specialize in, why it matters.",
        }),
        seedBlock("agent-card", {
          photoUrl: "",
          name: "",
          title: "Your title and brokerage",
          bio: "A short bio that builds trust — years of experience, what makes you different.",
          phone: "",
          ctaUrl: "",
          ctaLabel: "See my listings",
        }),
        seedBlock("stats", {
          stats: [
            { value: "", label: "Homes Sold" },
            { value: "", label: "Avg Sale Price" },
            { value: "", label: "List-to-Sale" },
          ],
        }),
        seedBlock("button", { label: "Schedule a Consultation" }),
        seedBlock("footer"),
      ],
    }),
  },

  // ── Pre-positioned grid templates (PAID tier — all blocks carry layout) ────
  // The engine fills these with real data; the canvas places them on the grid.
  // Columns span 12 units; y values are additive (y + h = next block's y).

  {
    id: "luxury-market-report",
    name: "Luxury Market Report",
    description:
      "Serif masthead, wide-banner photo hero, headline + stat side-by-side, market chart, two listing cards.",
    build: () => ({
      globalStyle: {
        ...style(),
        // Serif display for the masthead + hero value — the luxury register
        // (magazine-issue precedent); body copy stays in the house sans.
        displayFontFamily: "PLAYFAIR_SERIF",
        backdropColor: "#F0ECE6",
        primaryColor: "#1a1006",
        accentColor: "#B8860B",
        textColor: "#2C2010",
      },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        // hero photo — full-bleed wide banner (the 16:9 editorial cut)
        seedBlockGrid(
          "image",
          { x: 0, y: 2, w: 12, h: 5 },
          { alt: "Property hero photo", kind: "photo", ratio: "16:9" },
        ),
        // headline left, median-price stat right — same row
        seedBlockGrid(
          "hero",
          { x: 0, y: 7, w: 8, h: 4 },
          {
            kicker: "Luxury Market Report",
            value: "",
            label: "Median Sale Price · Lee County",
            prose: "Say where the luxury tier is moving and what's driving it this month.",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 8, y: 7, w: 4, h: 4 },
          {
            stats: [
              { value: "", label: "Days on Market" },
              { value: "", label: "YoY Price" },
            ],
          },
        ),
        // 12-month chart — full bleed
        seedBlockGrid(
          "image",
          { x: 0, y: 11, w: 12, h: 5 },
          { alt: "12-month market chart", caption: "12-Month Price Trend" },
        ),
        // two-col listing grid
        seedBlockGrid(
          "listing",
          { x: 0, y: 16, w: 6, h: 7 },
          { price: "", beds: "", baths: "", sqft: "", address: "", badge: "Featured" },
        ),
        seedBlockGrid(
          "listing",
          { x: 6, y: 16, w: 6, h: 7 },
          { price: "", beds: "", baths: "", sqft: "", address: "", badge: "New" },
        ),
        seedBlockGrid("footer", { x: 0, y: 23, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "new-listing",
    name: "New Listing",
    description:
      "Hero property photo, price + address headline, the full spec grid, AI paragraph, CTA.",
    // THE SEED CARD AND THE NEW LISTING BUTTON ARE THE SAME DELIVERABLE (operator,
    // 07/13/2026: "make sure each button touches creates the same exact thing for the
    // same buttons / showcase card / email lab choice"). They were not: this seed gave
    // ONE 3-cell spec row and no agent card, while the button (buildListingFlyer) gives
    // SEVEN spec slots and an agent card. Same name, different email.
    //
    // This grid now MIRRORS buildListingFlyer's output with empty facts — the seed card
    // is that flyer unfilled, the button is that flyer filled from the resolved house.
    // Structure identical, one has values. seed-recipe-parity.test.ts fails the suite if
    // these two ever drift apart again. (The chart slot is absent on purpose: a new
    // listing ships NO chart — its visual is the photo.)
    //
    // Every value is "" per THE SLOT RULE — an empty value is an OPEN SLOT the user or
    // the AI fills, and the LABEL is the instruction. Never a zero, never a demo figure.
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F5F0EB",
        primaryColor: "#2C1810",
        accentColor: "#C17B3E",
        textColor: "#3D2414",
      },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        // The accent RIBBON — its own band, ABOVE the photo. A design element, not a caption.
        seedBlockGrid("hero", { x: 0, y: 2, w: 12, h: 1 }, { kicker: "New Listing", ribbon: true }),
        seedBlockGrid(
          "image",
          { x: 0, y: 3, w: 12, h: 6 },
          { alt: "Property photo", kind: "photo", ratio: "3:2" },
        ),
        // The ADDRESS leads, centred, in display serif; the PRICE is the headline number
        // under it, in the accent colour. That is how a listing flyer actually reads.
        seedBlockGrid(
          "hero",
          { x: 0, y: 9, w: 12, h: 4 },
          {
            value: "",
            label: "Price and address",
            prose: "",
            align: "center",
            order: "label-first",
          },
        ),
        // ONE hairline spec strip, in reading order. $/Sq Ft is emphasised because it WINS
        // THE ARGUMENT; Type is muted because it is context. Two chunky rows of identical
        // cells is what you get when the layout has no way to rank them.
        seedBlockGrid(
          "stats",
          { x: 0, y: 13, w: 12, h: 3 },
          {
            variant: "strip",
            footnote: "*Computed from list price ÷ listed square footage.",
            stats: [
              { value: "", label: "Beds" },
              { value: "", label: "Baths" },
              { value: "", label: "Sq Ft" },
              { value: "", label: "Lot" },
              { value: "", label: "$/Sq Ft", emphasis: "primary" as const },
              { value: "", label: "Type", emphasis: "muted" as const },
            ],
          },
        ),
        seedBlockGrid("text", { x: 0, y: 16, w: 12, h: 4 }, { body: "", align: "left" }),
        // The agent and the ask share ONE row ({7,5}) — mirrors buildLifecycleEmail, which is
        // the authority for this card's shape (seed-recipe-parity.test.ts holds them equal).
        seedBlockGrid("agent-card", { x: 0, y: 20, w: 7, h: 4 }),
        seedBlockGrid("button", { x: 7, y: 20, w: 5, h: 2 }, { label: "View the Full Listing" }),
        seedBlockGrid("footer", { x: 0, y: 24, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "weekly-pulse",
    name: "Weekly Market Pulse",
    description: "Header graphic, 3 KPI stats, two charts side-by-side, ZIP comparison signal.",
    build: () => ({
      globalStyle: { ...style() },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }),
        seedBlockGrid("image", { x: 0, y: 2, w: 12, h: 4 }, { alt: "Weekly pulse header graphic" }),
        seedBlockGrid(
          "stats",
          { x: 0, y: 6, w: 12, h: 3 },
          {
            stats: [
              { value: "", label: "Median Price" },
              { value: "", label: "Median DOM" },
              { value: "", label: "Supply" },
            ],
          },
        ),
        // two charts side-by-side — real top-level blocks, not one multi-column
        seedBlockGrid(
          "image",
          { x: 0, y: 9, w: 6, h: 6 },
          { alt: "Price trend chart", caption: "12-month median sale price movement" },
        ),
        seedBlockGrid(
          "image",
          { x: 6, y: 9, w: 6, h: 6 },
          { alt: "Inventory trend chart", caption: "Months of supply, same window" },
        ),
        seedBlockGrid(
          "signal",
          { x: 0, y: 15, w: 7, h: 4 },
          {
            kicker: "ZIP Comparison",
            title: "How your ZIP stacks up",
            body: "Pull side-by-side data for the ZIPs your clients care about most.",
          },
        ),
        seedBlockGrid("button", { x: 7, y: 15, w: 5, h: 4 }, { label: "See Full Report" }),
        seedBlockGrid("footer", { x: 0, y: 19, w: 12, h: 3, static: true }),
      ],
    }),
  },

  // ── Background skeleton templates ──────────────────────────────────────────
  // These are visual shells. Content slots are intentionally empty — the user
  // fills them via AI prompt or direct editing in the inspector.

  {
    id: "skeleton-clean-white",
    name: "Clean White",
    description: "Crisp white background, photo placeholder up top, open content area below.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#ffffff",
        primaryColor: "#111827",
        accentColor: "#3DC9C0",
        displayFontFamily: "PLAYFAIR_SERIF",
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("image", { kind: "photo", ratio: "4:3" }),
        seedBlock("hero", { kicker: "", value: "", label: "", prose: "" }),
        seedBlock("stats", {
          stats: [
            { value: "", label: "" },
            { value: "", label: "" },
            { value: "", label: "" },
          ],
        }),
        seedBlock("text", { body: "" }),
        seedBlock("button", { label: "" }),
        seedBlock("footer"),
      ],
    }),
  },

  {
    id: "skeleton-dark-pro",
    name: "Dark Pro",
    description:
      "Deep dark background — bold, high-contrast. Photo placeholder, open content area.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#0f1d24",
        primaryColor: "#0f1d24",
        accentColor: "#3DC9C0",
        // Blocks render on white cards over the dark backdrop — body text must
        // be dark. The old #e8e4dc (light, authored for text ON the backdrop)
        // rendered near-invisible cream-on-white in every text block.
        textColor: "#26343B",
        displayFontFamily: "BOOK_SERIF",
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("image", { kind: "photo", ratio: "1:1" }),
        seedBlock("hero", { kicker: "", value: "", label: "", prose: "" }),
        seedBlock("stats", {
          stats: [
            { value: "", label: "" },
            { value: "", label: "" },
            { value: "", label: "" },
          ],
        }),
        seedBlock("divider"),
        seedBlock("text", { body: "" }),
        seedBlock("button", { label: "" }),
        seedBlock("footer"),
      ],
    }),
  },

  {
    id: "skeleton-agent-feature",
    name: "Agent Feature",
    description:
      "Full-width rectangular agent photo banner — not a circle. Name strip, stats, CTA.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F8F8F8",
        primaryColor: "#1a2e35",
        accentColor: "#3DC9C0",
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("agent-hero", {
          photoUrl: "",
          name: "",
          designation: "",
          tagline: "",
          ctaLabel: "",
          ctaUrl: "",
        }),
        seedBlock("stats", {
          stats: [
            { value: "", label: "" },
            { value: "", label: "" },
            { value: "", label: "" },
          ],
        }),
        seedBlock("text", { body: "" }),
        seedBlock("button", { label: "" }),
        seedBlock("footer"),
      ],
    }),
  },

  {
    id: "skeleton-listing-showcase",
    name: "Listing Showcase",
    description:
      "Property photo banner, price + address hero, beds/baths/sqft stats, agent card, CTA.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#EFF5F3",
        primaryColor: "#123334",
        accentColor: "#2E8B7A",
        textColor: "#1C2B2B",
        displayFontFamily: "BOOK_SERIF",
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("image", { kind: "photo", ratio: "4:3" }),
        seedBlock("hero", { kicker: "New Listing", value: "", label: "", prose: "" }),
        seedBlock("stats", {
          stats: [
            { value: "", label: "Beds" },
            { value: "", label: "Baths" },
            { value: "", label: "Sq Ft" },
          ],
        }),
        seedBlock("text", { body: "" }),
        seedBlock("agent-card"),
        seedBlock("button", { label: "Schedule a Showing" }),
        seedBlock("footer"),
      ],
    }),
  },

  // ── 10 AI-fillable grid templates (react-grid-layout canvas) ─────────────
  // Each block carries a `layout` (x, y, w, h) so the 2D canvas can place and
  // resize them freely. Free-tier canvas ignores `layout` and stacks them.
  // AI fills: kicker/value/label/prose/body/stats[] — styling fields are sticky.

  {
    id: "open-house",
    name: "Open House Invite",
    description:
      "Full-width exterior photo, date/time hero, specs, description + RSVP side-by-side, agent card.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F8F4EE",
        primaryColor: "#1C2B1A",
        accentColor: "#4A7C59",
        textColor: "#2A3828",
      },
      // It wears the CAMPAIGN CHROME — same shape as its six siblings.
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid("hero", { x: 0, y: 2, w: 12, h: 1 }, { kicker: "Open House", ribbon: true }),
        seedBlockGrid(
          "image",
          { x: 0, y: 3, w: 12, h: 6 },
          { alt: "Property exterior", kind: "photo", ratio: "3:2" },
        ),
        seedBlockGrid(
          "hero",
          { x: 0, y: 9, w: 12, h: 4 },
          {
            value: "",
            label: "Price and address",
            prose: "",
            align: "center",
            order: "label-first",
          },
        ),
        // The DATE and TIME are in NO vendor feed — the agent supplies them. They LEAD the
        // strip (they are the point of this email) and they are OPEN SLOTS whose labels are
        // the instruction. Never a placeholder date, never a zero.
        seedBlockGrid(
          "stats",
          { x: 0, y: 13, w: 12, h: 3 },
          {
            variant: "strip",
            stats: [
              { value: "", label: "Open House Date", emphasis: "primary" as const },
              { value: "", label: "Open House Time", emphasis: "primary" as const },
              { value: "", label: "Beds" },
              { value: "", label: "Baths" },
              { value: "", label: "Sq Ft" },
            ],
          },
        ),
        // body MUST be "" — THE SLOT RULE. This carried a coaching note ("Write a couple
        // of sentences that get someone off the couch…"), and TextBlock ships any
        // non-empty body: a user who picked this card and hit send EMAILED THAT SENTENCE
        // to real people. An instruction to the author is not copy for the reader.
        seedBlockGrid("text", { x: 0, y: 16, w: 12, h: 4 }, { body: "", align: "left" }),
        // The agent and the ask share ONE row ({7,5}) — mirrors buildLifecycleEmail, which is
        // the authority for this card's shape (seed-recipe-parity.test.ts holds them equal).
        seedBlockGrid("agent-card", { x: 0, y: 20, w: 7, h: 4 }),
        seedBlockGrid("button", { x: 7, y: 20, w: 5, h: 2 }, { label: "RSVP for the Open House" }),
        seedBlockGrid("footer", { x: 0, y: 24, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "price-reduced",
    name: "Price Reduced",
    description:
      "Reduced price hero left, before/after stats right, property photo, urgency text, CTA.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#FFF8F0",
        primaryColor: "#7B2D00",
        accentColor: "#E05A00",
        textColor: "#3D1800",
      },
      // It wears the CAMPAIGN CHROME — same shape as its six siblings. The CUT rides in the
      // hero's kicker: the accent line ABOVE the price, smaller (the operator's ruling).
      // "Days on Market" is GONE: no source we hold carries a days-to-contract interval, and
      // a cell we can never fill honestly is an invitation to invent one.
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "hero",
          { x: 0, y: 2, w: 12, h: 1 },
          { kicker: "Price Improved", ribbon: true },
        ),
        seedBlockGrid(
          "image",
          { x: 0, y: 3, w: 12, h: 6 },
          { alt: "Property photo", kind: "photo", ratio: "4:3" },
        ),
        seedBlockGrid(
          "hero",
          { x: 0, y: 9, w: 12, h: 4 },
          {
            value: "",
            label: "Price and address",
            prose: "",
            align: "center",
            order: "label-first",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 13, w: 12, h: 3 },
          {
            variant: "strip",
            stats: [
              { value: "", label: "Previous Price", emphasis: "muted" as const },
              { value: "", label: "Beds" },
              { value: "", label: "Baths" },
              { value: "", label: "Sq Ft" },
              { value: "", label: "Lot" },
              { value: "", label: "$/Sq Ft", emphasis: "primary" as const },
            ],
          },
        ),
        // body MUST be "" — THE SLOT RULE. This shipped a coaching note ("Say why this is
        // a good value now — what changed, and why a motivated seller means room to
        // negotiate") straight into real sends: TextBlock ships any non-empty body. Worse,
        // it asked for TWO claims we cannot source — a seller's MOTIVE and a negotiating
        // position. The product's own template was instructing the user to invent.
        seedBlockGrid("text", { x: 0, y: 16, w: 12, h: 4 }, { body: "", align: "left" }),
        // The agent and the ask share ONE row ({7,5}) — mirrors buildLifecycleEmail, which is
        // the authority for this card's shape (seed-recipe-parity.test.ts holds them equal).
        seedBlockGrid("agent-card", { x: 0, y: 20, w: 7, h: 4 }),
        // NOT "See the New Price" — the email already IS the new price. A CTA must ask for
        // the NEXT action, not point at what the reader is looking at.
        seedBlockGrid("button", { x: 7, y: 20, w: 5, h: 2 }, { label: "Schedule a Showing" }),
        seedBlockGrid("footer", { x: 0, y: 24, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "just-sold-grid",
    name: "Just Sold",
    description:
      "Property photo left + sold hero right, full-width sale stats, story, agent card, home value CTA.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F0F4F8",
        primaryColor: "#0D2340",
        accentColor: "#1D6FA4",
        textColor: "#1A2E40",
      },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "image",
          { x: 0, y: 2, w: 7, h: 5 },
          { alt: "Sold property", kind: "photo", ratio: "4:5" },
        ),
        seedBlockGrid(
          "hero",
          { x: 7, y: 2, w: 5, h: 5 },
          {
            kicker: "Just Sold",
            value: "",
            label: "Location and close date",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 7, w: 12, h: 3 },
          {
            stats: [
              { value: "", label: "Sale Price" },
              { value: "", label: "Days on Market" },
              { value: "", label: "List-to-Sale" },
            ],
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 10, w: 12, h: 3 },
          {
            body: "Say what made this one move fast — right pricing, a bidding war, whatever the real story is.",
          },
        ),
        seedBlockGrid("agent-card", { x: 0, y: 13, w: 12, h: 4 }),
        seedBlockGrid("button", { x: 0, y: 17, w: 12, h: 2 }, { label: "What's Your Home Worth?" }),
        seedBlockGrid("footer", { x: 0, y: 19, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "neighborhood-report",
    name: "Neighborhood Report",
    description:
      "Area headline + KPIs, market chart left + key insight right, agent commentary, search CTA.",
    build: () => ({
      globalStyle: { ...style() },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "hero",
          { x: 0, y: 2, w: 12, h: 4 },
          {
            kicker: "The area and the month this report covers",
            value: "",
            label: "Median Sale Price",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 6, w: 12, h: 3 },
          {
            stats: [
              { value: "", label: "Median Price" },
              { value: "", label: "Avg Days on Market" },
              { value: "", label: "Homes Sold" },
            ],
          },
        ),
        seedBlockGrid(
          "image",
          { x: 0, y: 9, w: 7, h: 5 },
          {
            alt: "6-month price trend chart",
            caption: "6-Month Median Sale Price",
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 7, y: 9, w: 5, h: 5 },
          {
            kicker: "Signal",
            title: "Name the one inventory or pricing shift worth flagging",
            body: "Say what changed and what it means for how fast homes are moving.",
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 14, w: 12, h: 3 },
          {
            body: "Give your read on this area — what you're seeing on the ground and what buyers or sellers should know.",
          },
        ),
        seedBlockGrid(
          "button",
          { x: 0, y: 17, w: 12, h: 2 },
          { label: "Search Homes in This Area" },
        ),
        seedBlockGrid("footer", { x: 0, y: 19, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "investment-brief",
    name: "Investment Brief",
    description:
      "Property photo + cap rate hero side-by-side, investment KPIs, market chart, analysis CTA.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F0F8F0",
        primaryColor: "#0D2B0D",
        accentColor: "#2E7D32",
        textColor: "#1A3A1A",
      },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "image",
          { x: 0, y: 2, w: 6, h: 5 },
          { alt: "Investment property", kind: "photo", ratio: "1:1" },
        ),
        seedBlockGrid(
          "hero",
          { x: 6, y: 2, w: 6, h: 5 },
          {
            kicker: "Investment Opportunity",
            value: "",
            label: "Cap rate, unit count, city, and price",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 7, w: 12, h: 3 },
          {
            stats: [
              { value: "", label: "Gross Monthly Rent" },
              { value: "", label: "Cap Rate" },
              { value: "", label: "Gross Rent Multiplier" },
            ],
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 0, y: 10, w: 12, h: 3 },
          {
            kicker: "Why Now",
            title: "Name the market condition making this deal work",
            body: "Say what's driving it — rent growth, tight supply, or pricing ahead of a correction.",
          },
        ),
        seedBlockGrid(
          "image",
          { x: 0, y: 13, w: 12, h: 5 },
          {
            alt: "Rental rate trend chart",
            caption: "12-Month Rental Rate Trend · Fort Myers",
          },
        ),
        seedBlockGrid(
          "button",
          { x: 0, y: 18, w: 12, h: 2 },
          { label: "Request Full Investment Analysis" },
        ),
        seedBlockGrid("agent-card", { x: 0, y: 20, w: 12, h: 4 }),
        seedBlockGrid("footer", { x: 0, y: 24, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "rate-watch",
    name: "Rate Watch",
    description:
      "Current rate + affordability stats, market chart, buyer insight, consultation CTA.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F0F2FF",
        primaryColor: "#1A1A4E",
        accentColor: "#3F51B5",
        textColor: "#1A1A3A",
      },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "hero",
          { x: 0, y: 2, w: 7, h: 4 },
          {
            kicker: "Rate Watch · this month",
            value: "",
            label: "30-Year Fixed · National Average",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 7, y: 2, w: 5, h: 4 },
          {
            stats: [
              { value: "", label: "Payment on $400K" },
              { value: "", label: "Price YoY" },
              { value: "", label: "Months of Supply" },
            ],
          },
        ),
        seedBlockGrid(
          "image",
          { x: 0, y: 6, w: 12, h: 5 },
          {
            alt: "Affordability trend chart",
            caption: "Monthly Payment on Median SWFL Home · 12 Months",
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 0, y: 11, w: 12, h: 3 },
          {
            kicker: "What This Means for Buyers",
            title: "Say what higher rates changed for competition and negotiating room",
            body: "Ground it in a real number if you have one — how many buyers sat out, or how much leverage shifted.",
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 14, w: 12, h: 3 },
          {
            body: "Give buyers a short, practical list — rate buydowns, seller concessions, or when to lock.",
          },
        ),
        seedBlockGrid(
          "button",
          { x: 0, y: 17, w: 12, h: 2 },
          { label: "Schedule a Buyer Consultation" },
        ),
        seedBlockGrid("agent-card", { x: 0, y: 19, w: 12, h: 4 }),
        seedBlockGrid("footer", { x: 0, y: 23, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "monthly-digest",
    name: "Monthly Digest",
    description:
      "Monthly KPIs, two charts side-by-side, insight + commentary, the month in numbers, agent sign-off.",
    build: () => ({
      globalStyle: { ...style() },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }),
        seedBlockGrid(
          "hero",
          { x: 0, y: 2, w: 12, h: 3 },
          {
            // Structural kicker (like "Market Spotlight") — the label/prose carry
            // the authoring instructions; a kicker instruction leaks into previews.
            kicker: "Monthly Digest",
            value: "",
            label: "Median Sale Price",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 5, w: 12, h: 3 },
          {
            stats: [
              { value: "", label: "Median Price" },
              { value: "", label: "Median DOM" },
              { value: "", label: "Months of Supply" },
            ],
          },
        ),
        // two charts side-by-side — weekly-pulse depth at monthly cadence
        seedBlockGrid(
          "image",
          { x: 0, y: 8, w: 6, h: 5 },
          {
            alt: "12-month price trend",
            caption: "12-Month Median Sale Price · SWFL",
          },
        ),
        seedBlockGrid(
          "image",
          { x: 6, y: 8, w: 6, h: 5 },
          {
            alt: "Inventory trend chart",
            caption: "Homes for Sale, Same Window",
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 0, y: 13, w: 6, h: 4 },
          {
            kicker: "Key Signal",
            title: "Name the one number that summarizes the month",
            body: "Say what it means and whether it's the third straight month of the same trend or a change.",
          },
        ),
        seedBlockGrid(
          "text",
          { x: 6, y: 13, w: 6, h: 4 },
          {
            body: "Give your take — where things stand for buyers and sellers right now, in your own words.",
          },
        ),
        seedBlockGrid(
          "list",
          { x: 0, y: 17, w: 12, h: 4 },
          {
            title: "The month in numbers",
            items: [
              { lead: "SALES ·", text: "Give the month's closed-sales count and how it compares." },
              { lead: "PRICE ·", text: "Give the median and the direction it moved." },
              { lead: "SUPPLY ·", text: "Give inventory or months of supply and the trend." },
            ],
          },
        ),
        seedBlockGrid("divider", { x: 0, y: 21, w: 12, h: 1 }),
        seedBlockGrid("agent-card", { x: 0, y: 22, w: 12, h: 4 }),
        seedBlockGrid("footer", { x: 0, y: 26, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "year-in-review",
    name: "Year in Review",
    description:
      "Annual headline stats, full-year price chart, 3-column highlights, commentary, CTA.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F8F0FF",
        primaryColor: "#2D0D5E",
        accentColor: "#7B3FC7",
        textColor: "#2A0D4A",
      },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "hero",
          { x: 0, y: 2, w: 12, h: 3 },
          {
            kicker: "Year in Review",
            value: "",
            label: "A full-year look at what moved, what stalled, and what's next",
            prose: "",
            sectionBg: "#7B3FC7",
          },
        ),
        // Researched convention (RULE 0.4, housingwire.com + highnote.io annual-review
        // templates): a year-in-review cascades national → local → neighborhood stats,
        // then a market analysis — this seed's shape (headline stats → full-year chart →
        // highlights → forward-look) already matches; the fix here is real data slots and
        // real layout variety, not a restructure.
        seedBlockGrid(
          "stats",
          { x: 0, y: 5, w: 12, h: 3 },
          {
            stats: [
              { value: "", label: "Median Price · Full Year" },
              { value: "", label: "Annual Price Growth" },
              { value: "", label: "Homes Sold" },
            ],
          },
        ),
        // two full-year charts side-by-side — price AND volume tell the year
        seedBlockGrid(
          "image",
          { x: 0, y: 8, w: 6, h: 5 },
          {
            alt: "Full-year price trend",
            caption: "Median Sale Price · Month by Month",
          },
        ),
        seedBlockGrid(
          "image",
          { x: 6, y: 8, w: 6, h: 5 },
          {
            alt: "Full-year sales volume chart",
            caption: "Homes Sold · Month by Month",
          },
        ),
        // {4,4,4} — three real blocks, not one multi-column pretending to be three.
        seedBlockGrid(
          "signal",
          { x: 0, y: 13, w: 4, h: 5 },
          {
            kicker: "What Moved",
            title: "Name the segment that led the year",
            body: "Waterfront, luxury, a price band — say which and why.",
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 4, y: 13, w: 4, h: 5 },
          {
            kicker: "What Stalled",
            title: "Name what softened or sat longest",
            body: "New construction, a submarket, a price band — say which and why.",
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 8, y: 13, w: 4, h: 5 },
          {
            kicker: "What's Next",
            title: "Give one forward-looking call",
            body: "What you expect heading into next year, and what would change your mind.",
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 18, w: 7, h: 3 },
          {
            body: "Write your close, in your own voice — what kind of year this was, and what you're building toward next.",
          },
        ),
        seedBlockGrid("button", { x: 7, y: 18, w: 5, h: 3 }, { label: "See the Full Year Report" }),
        seedBlockGrid("footer", { x: 0, y: 21, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "listing-digest",
    name: "Listing Digest",
    description:
      "4 property cards in a 2×2 grid — new listings or curated picks for a buyer segment.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F5F5F5",
        primaryColor: "#111827",
        accentColor: "#3DC9C0",
      },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "hero",
          { x: 0, y: 2, w: 12, h: 3 },
          {
            kicker: "New to Market",
            value: "",
            label: "How many homes, and the area they're in",
            prose: "",
          },
        ),
        seedBlockGrid(
          "listing",
          { x: 0, y: 5, w: 6, h: 7 },
          { photoUrl: "", price: "", beds: "", baths: "", sqft: "", address: "", badge: "New" },
        ),
        seedBlockGrid(
          "listing",
          { x: 6, y: 5, w: 6, h: 7 },
          {
            photoUrl: "",
            price: "",
            beds: "",
            baths: "",
            sqft: "",
            address: "",
            badge: "Waterfront",
          },
        ),
        seedBlockGrid(
          "listing",
          { x: 0, y: 12, w: 6, h: 7 },
          { photoUrl: "", price: "", beds: "", baths: "", sqft: "", address: "", badge: "Pool" },
        ),
        seedBlockGrid(
          "listing",
          { x: 6, y: 12, w: 6, h: 7 },
          {
            photoUrl: "",
            price: "",
            beds: "",
            baths: "",
            sqft: "",
            address: "",
            badge: "Luxury",
          },
        ),
        seedBlockGrid("button", { x: 0, y: 19, w: 12, h: 2 }, { label: "View All Listings" }),
        seedBlockGrid("agent-card", { x: 0, y: 21, w: 12, h: 4 }),
        seedBlockGrid("footer", { x: 0, y: 25, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "stay-in-touch",
    name: "Stay in Touch",
    description:
      "Agent hero banner, personal note left + market fact right, social links, referral CTA.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#FAFAFA",
        primaryColor: "#1C1C1C",
        accentColor: "#3DC9C0",
        textColor: "#2A2A2A",
      },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "agent-hero",
          { x: 0, y: 2, w: 12, h: 5 },
          {
            photoUrl: "",
            name: "",
            designation: "Realtor® · Southwest Florida",
            tagline: "Here when you need me — and sending useful market info in between.",
            ctaLabel: "Schedule a call",
            ctaUrl: "",
          },
        ),
        seedBlockGrid(
          "hero",
          { x: 0, y: 7, w: 12, h: 3 },
          {
            kicker: "Checking In",
            value: "",
            label: "",
            prose:
              "Halfway through the year — thought you'd appreciate a quick look at where things stand in your market.",
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 10, w: 7, h: 4 },
          {
            body: "Real estate is rarely an emergency — but when the moment arrives, you want someone who's been watching the numbers all year. That's me. If you're thinking about anything at all, I'm happy to talk it through.",
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 7, y: 10, w: 5, h: 4 },
          {
            kicker: "Market Snapshot",
            title: "Name the one stat that makes them feel good about staying put",
            body: "Pull a real number for their ZIP or neighborhood and say what it means for their equity.",
          },
        ),
        seedBlockGrid(
          "social-icons",
          { x: 0, y: 14, w: 12, h: 2 },
          {
            platforms: [],
            displayMode: "icon+text",
            layout: "row",
            iconSize: "md",
            iconColor: "original",
          },
        ),
        seedBlockGrid(
          "button",
          { x: 0, y: 16, w: 12, h: 2 },
          { label: "Know Someone Buying or Selling?" },
        ),
        seedBlockGrid("footer", { x: 0, y: 18, w: 12, h: 3, static: true }),
      ],
    }),
  },

  // PROVENANCE: distilled from a Manus.im-generated "SWFL Market Snapshot"
  // infographic (agent output, screenshot capture), found 07/08/2026. Layout
  // system only — no source copy, figures, images, or brand identity retained.
  {
    id: "trend-snapshot",
    name: "Trend Snapshot",
    description:
      "Chart leads, no hero — one trend chart up top, supporting stats below, a short read, and your sign-off.",
    build: () => ({
      globalStyle: { ...style() },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "image",
          { x: 0, y: 2, w: 12, h: 6 },
          {
            alt: "The single trend chart that carries this snapshot's story",
            caption: "Name the trend and the time window it covers",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 8, w: 12, h: 3 },
          {
            stats: [
              { value: "", label: "The headline number the chart supports" },
              { value: "", label: "A second metric for context" },
              { value: "", label: "A third metric for comparison" },
            ],
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 11, w: 12, h: 3 },
          {
            body: "Read the trend in plain language: what changed, why it matters, and what to watch next.",
          },
        ),
        seedBlockGrid("agent-card", { x: 0, y: 14, w: 12, h: 4 }),
        seedBlockGrid("footer", { x: 0, y: 18, w: 12, h: 3, static: true }),
      ],
    }),
  },

  // ── Editorial seeds (author-layout-recipes build) ──────────────────────────
  // STRUCTURE comes from the recipes (author-recipes.ts); these seeds carry the
  // editorial GLOBAL STYLE — serif display, airy padding, restrained palette.
  // Brand stays canonical: applyBrand still overlays globalStyle after.
  {
    id: "editorial-letter",
    name: "Editorial Letter",
    description:
      "A text-only personal letter — serif, airy, one link, no buttons. Plain letters out-open designed emails for warm audiences.",
    build: () => ({
      globalStyle: {
        ...style(),
        // Fence 4 (BLESSED_PAIRINGS): a serif body's only legal display pairing is
        // a sans — never serif+serif. This template has no hero/kicker that would
        // render a display font anyway, so a single serif voice throughout is both
        // correct and the intended "plain letter" feel.
        fontFamily: "BOOK_SERIF",
        primaryColor: "#1C1C1C",
        accentColor: "#8A7B5C",
        textColor: "#2A2A2A",
        backdropColor: "#FBFAF8",
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("text", {
          body: "Dear reader,\n\nWrite like you would to one person — what you noticed in the market this month, what it means for them, and the one thing worth doing about it.\n\nWarmly,",
          paddingY: "lg",
        }),
        seedBlock("agent-card", { ctaLabel: "" }),
        seedBlock("footer"),
      ],
    }),
  },
  {
    id: "magazine-issue",
    name: "Magazine Issue",
    description:
      "Masthead hero with overlay title, feature cards, a dark section band — the designed edition for a warm audience.",
    build: () => ({
      globalStyle: {
        ...style(),
        displayFontFamily: "PLAYFAIR_SERIF",
        primaryColor: "#14181C",
        textColor: "#2A2A2A",
        backdropColor: "#F6F5F2",
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("image", {
          url: "",
          alt: "Issue cover",
          overlayTitle: "The Issue",
          overlayBody: "A designed edition of what mattered in your market.",
          paddingY: "lg",
        }),
        // Feature cards with image slots — imageUrl: "" declares the open slot
        // (a column without the key stays image-less by design). Bodies are
        // instruction-phrased (slot rule) so fills replace them, never ship them.
        seedBlock("multi-column", {
          columns: [
            {
              imageUrl: "",
              heading: "Feature one",
              body: "Write a couple of lines that earn the click.",
            },
            {
              imageUrl: "",
              heading: "Feature two",
              body: "Give aspirational context — it lifts time spent.",
            },
          ],
          paddingY: "lg",
        }),
        // Slot-honest (THE SLOT RULE): title/body are instructions the preview
        // fill replaces — the earlier "The section band / A dark band separates
        // sections…" self-description shipped verbatim into the gallery capture.
        seedBlock("signal", {
          kicker: "From the Desk",
          title: "Name the one story this issue leads with",
          body: "Say what happened this month and why it matters — one tight, factual paragraph.",
          bgColor: "#14181C",
          paddingY: "lg",
        }),
        seedBlock("button", { label: "Read the full issue" }),
        seedBlock("footer"),
      ],
    }),
  },
];

/** Look up a seed by id (used by the "Start from" picker). */
export function seedById(id: string): SeedDoc | undefined {
  return SEED_DOCS.find((s) => s.id === id);
}

/** The default doc a fresh canvas opens with. */
export function defaultDoc(): EmailDoc {
  return SEED_DOCS[0].build();
}
