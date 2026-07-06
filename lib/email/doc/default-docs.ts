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
  hero: {
    kicker: "Market Spotlight",
    value: "$485K",
    label: "Median Sale Price · Lee County",
    prose: "A quick read on where the local market is heading this month.",
  },
  stats: {
    stats: [
      { value: "34", label: "Median DOM" },
      { value: "3.2 mo", label: "Months of Supply" },
      { value: "↑ 4%", label: "YoY Price" },
    ],
  },
  signal: {
    kicker: "Signal to Watch",
    title: "Inventory is ticking up",
    body: "More listings are reaching the market while demand holds — a shift worth watching.",
  },
  text: { body: "Write your message here.", align: "left" },
  image: { url: "", alt: "", caption: "" },
  listing: {
    photoUrl: "",
    price: "$489,000",
    beds: "3",
    baths: "2",
    sqft: "1,840",
    address: "4521 Surfside Blvd, Cape Coral",
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
    metricValue: "$485K",
    metricLabel: "Median Home Value",
    sub: "90-day median sale price",
    rankText: "#12 of 57 SWFL ZIPs",
    movementText: "↑ 4% YoY",
    barPct: 62,
  },
  "agent-card": {
    name: HOUSE_BRAND.companyName,
    title: "Market Intelligence",
    bio: "A short bio that builds trust with your readers.",
    phone: "",
    ctaLabel: "Get in touch",
  },
  "agent-hero": {
    photoUrl: "",
    alt: "Agent photo",
    name: HOUSE_BRAND.companyName,
    designation: HOUSE_BRAND.tagline,
    tagline: "Tell readers what makes you the right agent for them.",
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

/**
 * Linear "start from" seeds. These cover the single-column templates; the 5
 * structural templates (shell-two-col, email-compare, email-hbar, email-table,
 * email-ranked) stay on the legacy token rail (spec → Template regression).
 */
export const SEED_DOCS: SeedDoc[] = [
  {
    id: "market-spotlight",
    name: "Market Spotlight",
    description: "Big headline number, KPIs, and a signal to watch.",
    build: () => ({
      globalStyle: style(),
      blocks: [
        seedBlock("header"),
        seedBlock("hero"),
        seedBlock("stats"),
        seedBlock("signal"),
        seedBlock("button"),
        seedBlock("footer"),
      ],
    }),
  },
  {
    id: "just-sold",
    name: "Just Sold",
    description: "Lead with the win, back it with numbers, sign off as the agent.",
    build: () => ({
      globalStyle: style(),
      blocks: [
        seedBlock("header"),
        seedBlock("hero", {
          kicker: "Just Sold",
          value: "$512K",
          label: "Sale Price · Cape Coral",
          prose: "Another home closed above asking — here's what the numbers say.",
        }),
        seedBlock("stats"),
        seedBlock("agent-card"),
        seedBlock("footer"),
      ],
    }),
  },
  {
    id: "market-letter",
    name: "Market Letter",
    description: "An editorial note: intro, narrative, a signal, and your sign-off.",
    build: () => ({
      globalStyle: style(),
      blocks: [
        seedBlock("header"),
        seedBlock("hero", { kicker: "This Month in SWFL", label: "Lee & Collier Counties" }),
        seedBlock("text", {
          body: "Open with the story behind the month's numbers — what shifted and why it matters to your readers.",
        }),
        seedBlock("signal"),
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
      globalStyle: style(),
      blocks: [
        seedBlock("header"),
        seedBlock("hero", { kicker: "Featured Listing", value: "", label: "" }),
        seedBlock("image", { alt: "Featured property", caption: "Add a caption for this photo." }),
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
      globalStyle: style(),
      blocks: [
        seedBlock("header"),
        seedBlock("hero", {
          kicker: "Welcome",
          value: "",
          label: "",
          prose: "Thanks for subscribing — here's what you can expect from us each month.",
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
      globalStyle: style(),
      blocks: [
        seedBlock("header", {
          companyName: "Coastal Realty Group",
          tagline: "Southwest Florida Real Estate",
        }),
        seedBlock("hero", {
          kicker: "Meet Your Agent",
          value: "Sarah Mitchell",
          label: "Realtor® · Lee & Collier Counties",
          prose:
            "I specialize in luxury waterfront and investment properties across Southwest Florida — and I bring the market data to back every recommendation.",
        }),
        seedBlock("agent-card", {
          photoUrl: "https://randomuser.me/api/portraits/women/44.jpg",
          name: "Sarah Mitchell",
          title: "Realtor® · Coastal Realty Group",
          bio: "15+ years in SWFL real estate. Whether you're buying your first home or selling an investment property, I'll make sure you move with confidence.",
          phone: "(239) 555-0182",
          ctaUrl: "https://www.swfldatagulf.com",
          ctaLabel: "See my listings",
        }),
        seedBlock("stats", {
          stats: [
            { value: "127", label: "Homes Sold" },
            { value: "$2.4M", label: "Avg Sale Price" },
            { value: "98%", label: "List-to-Sale" },
          ],
        }),
        seedBlock("button", { label: "Schedule a Consultation" }),
        seedBlock("footer", { companyName: "Coastal Realty Group" }),
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
      "Full-bleed photo hero, headline + stat side-by-side, market chart, two listing cards.",
    build: () => ({
      globalStyle: {
        ...style(),
        backdropColor: "#F0ECE6",
        primaryColor: "#1a1006",
        accentColor: "#B8860B",
        textColor: "#2C2010",
      },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        // hero photo — full bleed
        seedBlockGrid(
          "image",
          { x: 0, y: 2, w: 12, h: 5 },
          { alt: "Property hero photo", kind: "photo" },
        ),
        // headline left, median-price stat right — same row
        seedBlockGrid(
          "hero",
          { x: 0, y: 7, w: 8, h: 4 },
          {
            kicker: "Luxury Market Report",
            value: "$1.2M",
            label: "Median Sale Price · Lee County",
            prose: "The luxury tier is moving — here's a look at what the numbers say this month.",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 8, y: 7, w: 4, h: 4 },
          {
            stats: [
              { value: "18", label: "Days on Market" },
              { value: "↑ 6%", label: "YoY Price" },
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
          {
            price: "$1,295,000",
            beds: "4",
            baths: "3.5",
            sqft: "3,200",
            address: "100 Gulf Shore Dr, Naples",
            badge: "Featured",
          },
        ),
        seedBlockGrid(
          "listing",
          { x: 6, y: 16, w: 6, h: 7 },
          {
            price: "$980,000",
            beds: "3",
            baths: "3",
            sqft: "2,650",
            address: "200 Bay Colony Dr, Naples",
            badge: "New",
          },
        ),
        seedBlockGrid("footer", { x: 0, y: 23, w: 12, h: 3, static: true }),
      ],
    }),
  },

  {
    id: "new-listing",
    name: "New Listing",
    description:
      "Hero property photo, price + address headline, beds/baths/sqft stats, AI paragraph, CTA.",
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
        seedBlockGrid(
          "image",
          { x: 0, y: 2, w: 12, h: 6 },
          { alt: "Property photo", kind: "photo" },
        ),
        seedBlockGrid(
          "hero",
          { x: 0, y: 8, w: 12, h: 4 },
          {
            kicker: "Just Listed",
            value: "$549,000",
            label: "4521 Surfside Blvd, Cape Coral",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 12, w: 12, h: 3 },
          {
            stats: [
              { value: "3", label: "Beds" },
              { value: "2", label: "Baths" },
              { value: "1,840", label: "Sq Ft" },
            ],
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 15, w: 12, h: 4 },
          {
            body: "Describe what makes this home stand out — the backyard, the finishes, the neighborhood.",
          },
        ),
        seedBlockGrid("button", { x: 0, y: 19, w: 12, h: 2 }, { label: "Schedule a Showing" }),
        seedBlockGrid("footer", { x: 0, y: 21, w: 12, h: 3, static: true }),
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
              { value: "$485K", label: "Median Price" },
              { value: "34", label: "Median DOM" },
              { value: "3.2 mo", label: "Supply" },
            ],
          },
        ),
        // two charts side-by-side via multi-column
        seedBlockGrid(
          "multi-column",
          { x: 0, y: 9, w: 12, h: 6 },
          {
            columns: [
              {
                imageUrl: "",
                heading: "Price Trend",
                body: "12-month median sale price movement in your target area.",
              },
              {
                imageUrl: "",
                heading: "Inventory Trend",
                body: "Months of supply over the same window — a leading indicator of price direction.",
              },
            ],
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 0, y: 15, w: 12, h: 4 },
          {
            kicker: "ZIP Comparison",
            title: "How your ZIP stacks up",
            body: "Side-by-side data for the ZIPs your clients care about most.",
          },
        ),
        seedBlockGrid("button", { x: 0, y: 19, w: 12, h: 2 }, { label: "See Full Report" }),
        seedBlockGrid("footer", { x: 0, y: 21, w: 12, h: 3, static: true }),
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
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("image"),
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
        textColor: "#e8e4dc",
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("image"),
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
        backdropColor: "#F5F0EB",
        primaryColor: "#2C1810",
        accentColor: "#C17B3E",
        textColor: "#3D2414",
      },
      blocks: [
        seedBlock("header", { companyName: "", tagline: "" }),
        seedBlock("image"),
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
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "image",
          { x: 0, y: 2, w: 12, h: 6 },
          { alt: "Property exterior", kind: "photo" },
        ),
        seedBlockGrid(
          "hero",
          { x: 0, y: 8, w: 12, h: 4 },
          {
            kicker: "You're Invited · Open House",
            value: "Sunday, July 13",
            label: "2:00 PM – 4:00 PM · 4521 Surfside Blvd, Cape Coral",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 12, w: 12, h: 3 },
          {
            stats: [
              { value: "$549,000", label: "Asking Price" },
              { value: "3 / 2", label: "Beds / Baths" },
              { value: "1,840", label: "Sq Ft" },
            ],
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 15, w: 7, h: 4 },
          {
            body: "Step inside and see why this home stands out — great light, updated kitchen, and a backyard made for entertaining.",
          },
        ),
        seedBlockGrid("button", { x: 7, y: 15, w: 5, h: 4 }, { label: "Get Directions" }),
        seedBlockGrid("agent-card", { x: 0, y: 19, w: 12, h: 4 }),
        seedBlockGrid("footer", { x: 0, y: 23, w: 12, h: 3, static: true }),
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
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }, { companyName: "", tagline: "" }),
        seedBlockGrid(
          "hero",
          { x: 0, y: 2, w: 6, h: 4 },
          {
            kicker: "Price Reduced",
            value: "$489,000",
            label: "New Asking Price",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 6, y: 2, w: 6, h: 4 },
          {
            stats: [
              { value: "$525,000", label: "Original Price" },
              { value: "$36,000", label: "Price Drop" },
              { value: "47", label: "Days on Market" },
            ],
          },
        ),
        seedBlockGrid(
          "image",
          { x: 0, y: 6, w: 12, h: 5 },
          { alt: "Property photo", kind: "photo" },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 11, w: 12, h: 3 },
          {
            body: "This price reduction makes it one of the best values in the neighborhood right now — and motivated sellers are ready to move.",
          },
        ),
        seedBlockGrid("button", { x: 0, y: 14, w: 12, h: 2 }, { label: "See the New Price" }),
        seedBlockGrid("footer", { x: 0, y: 16, w: 12, h: 3, static: true }),
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
        seedBlockGrid("image", { x: 0, y: 2, w: 7, h: 5 }, { alt: "Sold property", kind: "photo" }),
        seedBlockGrid(
          "hero",
          { x: 7, y: 2, w: 5, h: 5 },
          {
            kicker: "Just Sold",
            value: "$512,000",
            label: "Cape Coral · Closed July 2026",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 7, w: 12, h: 3 },
          {
            stats: [
              { value: "$512,000", label: "Sale Price" },
              { value: "11", label: "Days on Market" },
              { value: "102%", label: "List-to-Sale" },
            ],
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 10, w: 12, h: 3 },
          {
            body: "Another happy family in their new home — and another data point that proves the right pricing strategy still wins fast.",
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
            kicker: "Cape Coral · 33914 Market Update",
            value: "$432,000",
            label: "Median Sale Price · June 2026",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 6, w: 12, h: 3 },
          {
            stats: [
              { value: "$432K", label: "Median Price" },
              { value: "28", label: "Avg Days on Market" },
              { value: "14", label: "Homes Sold" },
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
            title: "Inventory tightening fast",
            body: "Active listings dropped 18% month-over-month — homes priced right are moving in under two weeks.",
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 14, w: 12, h: 3 },
          {
            body: "If you've been watching this area, the window to buy before prices reset is narrowing. Here's what I'm seeing on the ground.",
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
          { alt: "Investment property", kind: "photo" },
        ),
        seedBlockGrid(
          "hero",
          { x: 6, y: 2, w: 6, h: 5 },
          {
            kicker: "Investment Opportunity",
            value: "6.2% Cap Rate",
            label: "4-Unit · Fort Myers · $620,000",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 7, w: 12, h: 3 },
          {
            stats: [
              { value: "$3,800/mo", label: "Gross Monthly Rent" },
              { value: "6.2%", label: "Cap Rate" },
              { value: "14.5×", label: "Gross Rent Multiplier" },
            ],
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 0, y: 10, w: 12, h: 3 },
          {
            kicker: "Why Now",
            title: "Rents up 9% YoY, inventory down",
            body: "The combination of rising rents and low supply is compressing cap rates across SWFL — this one is priced ahead of the correction.",
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
            kicker: "Rate Watch · July 2026",
            value: "6.75%",
            label: "30-Year Fixed · National Average",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 7, y: 2, w: 5, h: 4 },
          {
            stats: [
              { value: "$2,590/mo", label: "Payment on $400K" },
              { value: "↑ 4.2%", label: "Price YoY" },
              { value: "3.1 mo", label: "Months of Supply" },
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
            title: "Less competition, more room to negotiate",
            body: "Higher rates pushed 22% of buyers to the sidelines — but qualified buyers who act now face less competition and more willing sellers.",
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 14, w: 12, h: 3 },
          {
            body: "Three things every buyer should know right now: how to use rate buydowns, why seller concessions are up, and when to lock.",
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
    description: "Monthly KPIs, 12-month chart, insight + commentary side-by-side, agent sign-off.",
    build: () => ({
      globalStyle: { ...style() },
      blocks: [
        seedBlockGrid("header", { x: 0, y: 0, w: 12, h: 2 }),
        seedBlockGrid(
          "hero",
          { x: 0, y: 2, w: 12, h: 3 },
          {
            kicker: "July 2026 · SWFL Market Digest",
            value: "$475,000",
            label: "Median Sale Price · Lee & Collier Counties",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 5, w: 12, h: 3 },
          {
            stats: [
              { value: "$475K", label: "Median Price" },
              { value: "31", label: "Median DOM" },
              { value: "3.4 mo", label: "Months of Supply" },
            ],
          },
        ),
        seedBlockGrid(
          "image",
          { x: 0, y: 8, w: 12, h: 5 },
          {
            alt: "12-month price trend",
            caption: "12-Month Median Sale Price · SWFL",
          },
        ),
        seedBlockGrid(
          "signal",
          { x: 0, y: 13, w: 6, h: 4 },
          {
            kicker: "Key Signal",
            title: "Supply stabilizing",
            body: "Months of supply held flat for the third consecutive month — the first sign the correction may be leveling.",
          },
        ),
        seedBlockGrid(
          "text",
          { x: 6, y: 13, w: 6, h: 4 },
          {
            body: "My take: we're at an inflection point. Buyers still have leverage but the window is narrowing. Sellers who priced right closed fast; those who didn't are still sitting.",
          },
        ),
        seedBlockGrid("divider", { x: 0, y: 17, w: 12, h: 1 }),
        seedBlockGrid("agent-card", { x: 0, y: 18, w: 12, h: 4 }),
        seedBlockGrid("footer", { x: 0, y: 22, w: 12, h: 3, static: true }),
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
            kicker: "2026 Year in Review",
            value: "SWFL Market",
            label: "A Full-Year Look at What Moved, What Stalled, and What's Next",
            prose: "",
          },
        ),
        seedBlockGrid(
          "stats",
          { x: 0, y: 5, w: 12, h: 3 },
          {
            stats: [
              { value: "$481K", label: "Median Price · Full Year" },
              { value: "↑ 3.8%", label: "Annual Price Growth" },
              { value: "4,217", label: "Homes Sold" },
            ],
          },
        ),
        seedBlockGrid(
          "image",
          { x: 0, y: 8, w: 12, h: 5 },
          {
            alt: "Full-year price trend",
            caption: "2026 Median Sale Price · Month by Month",
          },
        ),
        seedBlockGrid(
          "multi-column",
          { x: 0, y: 13, w: 12, h: 5 },
          {
            columns: [
              {
                heading: "What Moved",
                body: "Waterfront and luxury led the year — sub-$500K sat longest as affordability pressured first-time buyers.",
              },
              {
                heading: "What Stalled",
                body: "New construction deliveries outpaced absorption in Lee County, softening prices in newer communities.",
              },
              {
                heading: "What's Next",
                body: "Rate relief in H2 2026 should unlock pent-up demand — expect a faster spring market than 2025.",
              },
            ],
          },
        ),
        seedBlockGrid(
          "text",
          { x: 0, y: 18, w: 12, h: 3 },
          {
            body: "It's been a year of recalibration. The excess of 2021–2022 has fully unwound, and we're building on a more honest foundation heading into 2027.",
          },
        ),
        seedBlockGrid(
          "button",
          { x: 0, y: 21, w: 12, h: 2 },
          { label: "See the Full Year Report" },
        ),
        seedBlockGrid("footer", { x: 0, y: 23, w: 12, h: 3, static: true }),
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
            value: "4 Homes",
            label: "Just Listed This Week · Lee & Collier Counties",
            prose: "",
          },
        ),
        seedBlockGrid(
          "listing",
          { x: 0, y: 5, w: 6, h: 7 },
          {
            photoUrl: "",
            price: "$489,000",
            beds: "3",
            baths: "2",
            sqft: "1,840",
            address: "4521 Surfside Blvd, Cape Coral",
            badge: "New",
          },
        ),
        seedBlockGrid(
          "listing",
          { x: 6, y: 5, w: 6, h: 7 },
          {
            photoUrl: "",
            price: "$625,000",
            beds: "4",
            baths: "3",
            sqft: "2,400",
            address: "1205 Estero Blvd, Fort Myers Beach",
            badge: "Waterfront",
          },
        ),
        seedBlockGrid(
          "listing",
          { x: 0, y: 12, w: 6, h: 7 },
          {
            photoUrl: "",
            price: "$319,000",
            beds: "2",
            baths: "2",
            sqft: "1,200",
            address: "8800 Merano Dr, Naples",
            badge: "Pool",
          },
        ),
        seedBlockGrid(
          "listing",
          { x: 6, y: 12, w: 6, h: 7 },
          {
            photoUrl: "",
            price: "$1,195,000",
            beds: "5",
            baths: "4",
            sqft: "3,800",
            address: "200 Gulf Shore Blvd, Naples",
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
            title: "Prices up 4% in your ZIP",
            body: "Your neighborhood appreciated above the county average this year — your equity is working.",
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
        fontFamily: "BOOK_SERIF",
        displayFontFamily: "PLAYFAIR_SERIF",
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
        seedBlock("multi-column", {
          columns: [
            { heading: "Feature one", body: "A couple of lines that earn the click." },
            { heading: "Feature two", body: "Aspirational context lifts time spent." },
          ],
          paddingY: "lg",
        }),
        seedBlock("signal", {
          kicker: "From the Desk",
          title: "The section band",
          body: "A dark band separates sections; text flips to light automatically.",
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
