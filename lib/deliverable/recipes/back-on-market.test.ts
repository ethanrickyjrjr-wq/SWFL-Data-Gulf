// lib/deliverable/recipes/back-on-market.test.ts
//
// R · BACK ON THE MARKET — the acceptance oracle for the "send it" deliverable, TWO MODES.
//
// The failure mode here is the same one price-reduced.test.ts was built to catch: a doc
// that FAILS SCHEMA does not fail loudly — build-doc falls through to the generic author,
// silently bypassing every no-invention guard. So the load-bearing assertions are (1) the
// built doc PARSES, and (2) the no-invention checks run on the RENDERED HTML — never on the
// source file, because BACK_ON_MARKET_PROHIBITIONS legitimately contains the word
// "stigmatized" and a source-scan would self-fail on it.
//
// NUMBER-ONCE (08/03/2026): the local cancellation rate used to render four times in area
// mode (hero + strip cell + comparison table + narrative). The rewritten suite asserts the
// COUNT, not just presence, in both modes.
//
// REWRITTEN 08/06/2026 — property mode is now PRIMARY (subject flipped to "address") and
// carries a real narrator (`authorListingNarrative`, house-only) ahead of the fixed status
// paragraph, and `deps.relist` became `deps.resolveRelist` (a function, mirroring `loadZip`'s
// own injectable-default pattern — the live default is the real Lane-2 detector). The
// local-vs-national `stats:grid` is GONE — both rates now live in the status paragraph, so
// this recipe satisfies campaign-coherence's "one stats block per lifecycle email" rule.
//
// Fully offline: the ZIP loader, the relist resolver, AND the model are all injected/stubbed
// — zero lake reads, zero brain fetches, zero geocodes, zero network, zero cost.
import { test, expect, describe, mock, afterAll } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { buildBackOnMarket, BACK_ON_MARKET_PROHIBITIONS } from "./back-on-market";
import { NATIONAL_FALLTHROUGH } from "@/lib/back-on-market/national-frame";
import type { RecipeBuildContext } from "./index";
import type { BackOnMarketZip } from "@/lib/back-on-market/load-zip";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

// ── THE MODEL, STUBBED — deterministic prose, zero tokens (mirrors registry-seam.test.ts). ──
const NARRATIVE = "A well-kept home on a quiet street, priced for this market.";
/** What the stubbed model returns for the NEXT build. Mutable so the leak-guard tests can
 *  replay REAL model output verbatim (both leaks below were captured live 08/06/2026)
 *  instead of unit-testing a private helper — the guard is only worth anything at the
 *  recipe's boundary, where a leak would actually reach a reader. */
let nextNarratorText = NARRATIVE;
import * as realAnthropic from "@/refinery/agents/anthropic.mts";
const ORIG_ANTHROPIC = { ...realAnthropic };
afterAll(() => {
  mock.module("@/refinery/agents/anthropic.mts", () => ORIG_ANTHROPIC);
});
mock.module("@/refinery/agents/anthropic.mts", () => ({
  ...realAnthropic,
  getAnthropic: () => ({
    messages: {
      create: async () => ({ content: [{ type: "text", text: nextNarratorText }] }),
    },
  }),
}));

const { renderEmailDocHtml } = await import("@/lib/email/render-email-doc");
const { defaultDoc } = await import("@/lib/email/doc/default-docs");

// Read from the same constant the recipe uses, so the test can't drift from the source
// when the monthly national figure is bumped.
const NATIONAL_FALLTHROUGH_ASOF = NATIONAL_FALLTHROUGH.asOf;

/** A resolved ZIP with real sourced rates (the live 03/01/2026 seller-stress vintage shape). */
const CAPE: BackOnMarketZip = {
  zip: "33904",
  place: "Cape Coral",
  cancellationRatePct: 13,
  relistRatePct: 8,
  delistRatePct: 5,
  stressScore: 62,
  region: null,
  area: null,
  asOf: "03/01/2026",
  source: { label: "Redfin Data Center", url: "https://www.redfin.com/us-housing-market" },
};

/** A suppressed ZIP — the row exists but every rate is null (never a guessed number). */
const SUPPRESSED: BackOnMarketZip = {
  ...CAPE,
  zip: "34142",
  place: "Immokalee",
  cancellationRatePct: null,
  relistRatePct: null,
  delistRatePct: null,
};

/** A ZIP with NO resolved place name — `place` degrades to the bare digits, matching
 *  `zip`. Proves `placeOf` never prepends the word "ZIP". */
const NO_PLACE: BackOnMarketZip = { ...CAPE, zip: "33914", place: "33914" };

/** A specific listing back on the market — property mode's fixture. Carries enough
 *  (price/beds/sqft) that `authorListingNarrative` actually runs rather than opening a
 *  slot — the stubbed model above returns NARRATIVE unconditionally either way. */
const RELISTED_HOME: ListingFacts = {
  // THE STRAY COMMA IS DELIBERATE. The vendor's `formattedAddress` really does come back
  // "…, FL, 33904" (seen live 07/13 and again 08/06/2026), and `addressLineOf` is the ONE
  // root that re-punctuates it. A fixture with a clean address would prove nothing.
  address: "410 Bayshore Dr, Cape Coral, FL, 33904",
  city: "Cape Coral",
  state: "FL",
  zip: "33904",
  price: "$549,000",
  beds: "3",
  baths: "2",
  sqft: "1980",
  lotSize: "0.23 ac",
  photos: ["https://example.invalid/photos/410-bayshore.jpg"],
  sourceUrl: "https://www.swfldatagulf.com/listing/410-bayshore-dr",
};

/** THE SAME HOUSE WITH THE FACTS A PAID ROW CARRIES — the seller's own description, the
 *  year built, the HOA fee, the property type. This is the fixture for *"WHERE THE FUCK IS
 *  THE HOUSE INFORMATION? … ADD THE EXTRA STUFF, BUT GET THE DETAILS FIRST"*: those four
 *  facts reached `ListingFacts` and rendered NOWHERE on this email until 08/06/2026. */
const RELISTED_HOME_RICH: ListingFacts = {
  ...RELISTED_HOME,
  remarks:
    "Sweeping western exposure over the canal, a remodeled kitchen with quartz counters, " +
    "and a screened lanai that runs the full width of the house.",
  yearBuilt: "1998",
  hoaFee: 145,
  propertyType: "single_family",
};

function ctx(zip: string | undefined, currentDoc?: EmailDoc): RecipeBuildContext {
  return {
    recipe: { key: "back-on-market" } as never, // the builder ignores ctx.recipe
    prompt: "",
    currentDoc: currentDoc ?? defaultDoc(),
    facts: null,
    resolved: true,
    zip,
  };
}

function ctxProperty(facts: ListingFacts, currentDoc?: EmailDoc): RecipeBuildContext {
  return {
    recipe: { key: "back-on-market" } as never,
    prompt: "",
    currentDoc: currentDoc ?? defaultDoc(),
    facts,
    resolved: true,
  };
}

const build = (data: BackOnMarketZip | null, zip = "33904", doc?: EmailDoc) =>
  buildBackOnMarket(ctx(zip, doc), { loadZip: async () => data });

/** PROPERTY mode takes NO deps at all since 08/06/2026 — it reads the resolved house on
 *  `ctx.facts` and the (stubbed) narrator, nothing else. `loadZip` is still accepted by the
 *  builder for AREA mode and is injected here only to prove property mode ignores it. */
const buildProperty = (facts: ListingFacts) =>
  buildBackOnMarket(ctxProperty(facts), {
    loadZip: async () => {
      throw new Error("PROPERTY mode must never read a zip rate");
    },
  });

/** Build with a specific model output — for replaying a captured leak. Always restores the
 *  default afterwards so test order can never matter. */
async function buildWithNarrator(facts: ListingFacts, narratorText: string) {
  nextNarratorText = narratorText;
  try {
    return await buildProperty(facts);
  } finally {
    nextNarratorText = NARRATIVE;
  }
}

/** The ONE authored paragraph — the text block that is neither the seller's description
 *  slot nor chrome. "" when the narrator produced nothing shippable (an open slot). */
const authoredBodyOf = (doc: EmailDoc): string =>
  (
    (
      doc.blocks.find(
        (b) => b.type === "text" && !(b.props as { descriptionSlot?: boolean }).descriptionSlot,
      )?.props as { body?: string } | undefined
    )?.body ?? ""
  ).trim();

const statsRows = (doc: EmailDoc): StatItem[][] =>
  doc.blocks.filter((b) => b.type === "stats").map((b) => (b.props as { stats: StatItem[] }).stats);
const allCells = (doc: EmailDoc): StatItem[] => statsRows(doc).flat();
const cellNamed = (doc: EmailDoc, label: string): StatItem | undefined =>
  allCells(doc).find((c) => c.label === label);
const heroOf = (doc: EmailDoc) =>
  doc.blocks.find((b) => b.type === "hero" && !b.props.ribbon)?.props as
    { kicker?: string; value?: string; label?: string } | undefined;
const ribbonOf = (doc: EmailDoc) =>
  doc.blocks.find((b) => b.type === "hero" && b.props.ribbon)?.props as
    { kicker?: string } | undefined;
const textBodyOf = (doc: EmailDoc): string =>
  (doc.blocks.find((b) => b.type === "text")?.props as { body?: string } | undefined)?.body ?? "";
const spine = (doc: EmailDoc): string[] =>
  [...doc.blocks]
    .sort((a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0))
    .map((b) => {
      if (b.type === "hero") return b.props.ribbon ? "hero:ribbon" : "hero:subject";
      if (b.type === "stats") return b.props.variant === "strip" ? "stats:strip" : "stats:grid";
      if (b.type === "image") return `image:${String(b.props.kind ?? "?")}`;
      return b.type;
    });

/** How many times a literal substring appears in a string — the NUMBER-ONCE assertion. */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** ONE banned-strings list, run against BOTH modes — BACK_ON_MARKET_PROHIBITIONS binds
 *  both (the file's own header says so), so the test that enforces it must too. Area mode
 *  used to check 12 strings and property mode only 8, silently dropping the two fair-
 *  housing strings ("families with children" / "adults only") from property mode's
 *  coverage — the exact gap a shared constant closes. */
const BANNED_SUBSTRINGS = [
  "fell through because",
  "the seller is motivated",
  "motivated seller",
  "distressed",
  "foreclos",
  "short sale",
  "the buyer backed out",
  "won't last",
  "priced to move",
  "bargain",
  // fair-housing: no cause tied to a protected class
  "families with children",
  "adults only",
] as const;

// ── THE CAMPAIGN CHROME — a sibling of the lifecycle emails (AREA mode) ─────────────

describe("AREA mode — it wears the one campaign chrome", () => {
  test("the spine is the campaign's, in order (NO middle — NUMBER-ONCE)", async () => {
    const doc = (await build(CAPE))!;
    expect(spine(doc)).toEqual([
      "header",
      "hero:ribbon",
      "image:photo",
      "hero:subject",
      "stats:strip", // Relisted / Delisted
      "text",
      "agent-card",
      "button",
      "footer",
    ]);
  });

  test("the ribbon word is 'Back on the Market'", async () => {
    expect(ribbonOf((await build(CAPE))!)!.kicker).toBe("Back on the Market");
  });

  test("THE BUILT DOC PARSES — an invalid doc silently becomes the generic author", async () => {
    for (const data of [CAPE, SUPPRESSED]) {
      const doc = (await build(data))!;
      const parsed = EmailDocSchema.safeParse(doc);
      expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
      for (const row of statsRows(doc)) expect(row.length).toBeLessThanOrEqual(6);
    }
  });

  test("the BRAND is sticky — a user's colours are never authored over", async () => {
    const branded = defaultDoc();
    branded.globalStyle = { ...branded.globalStyle, accentColor: "#123456" };
    const doc = (await build(CAPE, "33904", branded))!;
    expect(doc.globalStyle.accentColor).toBe("#123456");
  });
});

// ── CELLS: the ZIP's real rates, each sourced, NUMBER-ONCE ──────────────────────────

describe("AREA mode — the local rates are the sourced numbers, each shown ONCE", () => {
  test("the hero is the place over its headline cancellation rate", async () => {
    const hero = heroOf((await build(CAPE))!)!;
    expect(hero.value).toBe("13%");
    expect(hero.label).toBe("How often deals fall through in Cape Coral");
  });

  test("the strip carries TWO cells — Relisted then Delisted, no cancellation restatement", async () => {
    const doc = (await build(CAPE))!;
    expect(cellNamed(doc, "Fall out of contract")).toBeUndefined();
    expect(cellNamed(doc, "Relisted")!.value).toBe("8%");
    expect(cellNamed(doc, "Relisted")!.emphasis).toBe("primary");
    expect(cellNamed(doc, "Delisted")!.value).toBe("5%");
    const strip = statsRows(doc).find((row) => row.some((c) => c.label === "Relisted"))!;
    expect(strip).toHaveLength(2);
  });

  test("no stats:grid — the local-vs-national middle is gone in area mode", async () => {
    const doc = (await build(CAPE))!;
    expect(spine(doc).filter((s) => s === "stats:grid")).toHaveLength(0);
    expect(cellNamed(doc, "United States")).toBeUndefined();
  });

  test("provenance names a MONTH LABEL (not a bare day) and stays within the 120-char cap", async () => {
    const doc = (await build(CAPE))!;
    const strip = doc.blocks.find(
      (b) => b.type === "stats" && (b.props as { variant?: string }).variant === "strip",
    )!.props as { footnote?: string };
    // The local figure is a seller-stress-swfl ROLLING-MONTHLY Redfin read — displayed as
    // "March 2026", never the raw "03/01/2026" (over-states precision; sa0718 defect).
    expect(strip.footnote).toContain("March 2026");
    expect(strip.footnote).not.toContain("03/01/2026");
    // The national figure is a single calendar-month PRINT, not rolling — stays MM/DD/YYYY,
    // matching the sibling /r/back-on-market read page's own choice.
    expect(strip.footnote).toContain(NATIONAL_FALLTHROUGH_ASOF);
    expect(strip.footnote!.length).toBeLessThanOrEqual(120);
  });

  test("placeOf NEVER writes the word 'ZIP' — a bare 5-digit ZIP reads as itself", async () => {
    const hero = heroOf((await build(NO_PLACE, "33914"))!)!;
    expect(hero.label).toBe("How often deals fall through in 33914");
    expect(hero.label.toLowerCase()).not.toContain("zip");
  });

  test("NUMBER-ONCE: the sent HTML shows the local cancellation rate exactly once", async () => {
    const html = await renderEmailDocHtml((await build(CAPE))!);
    // "13%" appears ONLY in the hero — not in the strip (dropped), not in a middle table
    // (deleted), not in the narrative (never restated).
    expect(countOf(html, "13%")).toBe(1);
  });
});

// ── THE BOUNDARY — no-invention, on the RENDERED bytes ──────────────────────────────

describe("AREA mode — the sent artifact never asserts a per-home reason, and never 'stigmatized'", () => {
  test("it cites the national frame and states the neutral truth", async () => {
    const html = await renderEmailDocHtml((await build(CAPE))!);
    expect(html).toContain("Back on the Market");
    expect(html).toContain("13%"); // the local rate — still the hero's headline number
    expect(html).toContain("13.6%"); // the national frame, cited once
    expect(html).toContain("no fault of the seller");
    expect(html).toContain("not a red flag");
  });

  test("no user-facing string uses the legal term 'stigmatized' (checked on rendered HTML)", async () => {
    // NEVER on the source file: BACK_ON_MARKET_PROHIBITIONS itself contains the word.
    const html = (await renderEmailDocHtml((await build(CAPE))!)).toLowerCase();
    expect(html).not.toContain("stigmatiz");
  });

  test("the copy never states a per-home reason, seller motivation, a value judgment, or a protected class", async () => {
    const html = (await renderEmailDocHtml((await build(CAPE))!)).toLowerCase();
    for (const banned of BANNED_SUBSTRINGS) expect(html).not.toContain(banned);
  });

  test("the prohibition checklist is a real, non-empty constant", () => {
    // The boundary is documented in code, greppable — the test enforces it on output.
    expect(BACK_ON_MARKET_PROHIBITIONS.length).toBeGreaterThan(0);
    expect(BACK_ON_MARKET_PROHIBITIONS.join(" ")).toContain("stigmatized");
  });
});

// ── DATA MISS vs SUPPRESSED — never a fabricated rate, never a refusal (RULE 0.7) ───

describe("AREA mode — empty-tolerance", () => {
  test("a suppressed ZIP (a real row, null rates) still builds — cells open, no invented rate", async () => {
    const doc = (await build(SUPPRESSED))!;
    expect(doc).toBeTruthy();
    // Hero value is an open slot, not a fabricated rate.
    expect(heroOf(doc)!.value).toBe("");
    // No local rate → no one-sided comparison table (area mode never has one anyway).
    expect(spine(doc).filter((s) => s === "stats:grid")).toHaveLength(0);
    // The narrative is the SAME fixed frame every area build gets — it never cited the
    // local rate to begin with (NUMBER-ONCE), so a suppressed ZIP changes nothing about it.
    const body = textBodyOf(doc);
    expect(body).toContain("A home back on the market has usually fallen out of contract");
    expect(body).not.toContain("of pending deals in"); // never restates a local rate
    expect(body).toContain("13.6%"); // the cited national frame still stands
  });

  test("a FULL DATA MISS (no row at all) STILL LANDS THE GRID — RULE 0.7, not a refusal", async () => {
    // Found 08/04/2026 by registry-seam.test.ts's SEAM_BYPASS_KNOWN guard — check
    // email_back_on_market_refuses_on_data_miss. This used to return null here.
    const doc = await build(null);
    expect(
      doc,
      "a ZIP data miss must still land an open-slot grid, never fall through",
    ).not.toBeNull();
    expect(EmailDocSchema.safeParse(doc!).success).toBe(true);
    // The bare ZIP digits stand in for a place we could not resolve.
    expect(heroOf(doc!)!.label).toBe("How often deals fall through in 33904");
    // Every rate is an open slot — never a guess.
    expect(heroOf(doc!)!.value).toBe("");
    expect(cellNamed(doc!, "Relisted")!.value).toBe("");
    expect(cellNamed(doc!, "Delisted")!.value).toBe("");
    // No local source to cite → the footnote is entirely absent, never orphaned.
    const strip = doc!.blocks.find(
      (b) => b.type === "stats" && (b.props as { variant?: string }).variant === "strip",
    )!.props as { footnote?: string };
    expect(strip.footnote).toBeUndefined();
    // The neutral truth still stands — it never depended on the local rate.
    expect(textBodyOf(doc!)).toContain("13.6%");
  });

  test("no ZIP on the context → null (fall through to the generic author)", async () => {
    expect(await buildBackOnMarket(ctx(undefined), { loadZip: async () => CAPE })).toBeNull();
  });
});

// ── THE CTA — the next action is the full interactive read ───────────────────────────

test("AREA mode — the CTA points at the full read for this ZIP", async () => {
  const doc = (await build(CAPE))!;
  const button = doc.blocks.find((b) => b.type === "button")!.props as {
    label?: string;
    url?: string;
  };
  expect(button.label).toBe("See the full read");
  expect(button.url).toContain("/r/back-on-market?q=33904");
});

// ═════════════════════════════════════════════════════════════════════════════════
// PROPERTY MODE — ctx.facts set: a specific listing back on the market. PRIMARY door
// since 08/06/2026 (recipes.ts subject flipped "area" → "address"; operator: "usually
// back on market is a fucking property").
//
// REWRITTEN 08/06/2026. Operator, on a real render: *"no one cares about how many days it
// was off market … lead like a new fucking listing … get rid of the stupid talk. it's
// basically a new listing."* Property mode IS `buildListingFlyer` now, with two dials
// turned (ribbon + CTA label). Every test below is named after the failure mode it stops,
// and the three deletions each get a test that goes red if they creep back.
// ═════════════════════════════════════════════════════════════════════════════════

describe("PROPERTY mode — a specific listing back on the market", () => {
  test("the spine wears the campaign chrome — ONE strip, NO grid", async () => {
    const doc = (await buildProperty(RELISTED_HOME))!;
    expect(spine(doc)).toEqual([
      "header",
      "hero:ribbon",
      "image:photo",
      "hero:subject",
      "stats:strip",
      "text",
      "agent-card",
      "button",
      "footer",
    ]);
  });

  test("the ribbon word is 'Back on the Market'", async () => {
    expect(ribbonOf((await buildProperty(RELISTED_HOME))!)!.kicker).toBe("Back on the Market");
  });

  test("the hero is the LISTING's price and address — not an area rate", async () => {
    const hero = heroOf((await buildProperty(RELISTED_HOME))!)!;
    expect(hero.value).toBe("$549,000");
    expect(hero.label).toContain("410 Bayshore Dr");
  });

  test("the address is RE-PUNCTUATED — the vendor's stray comma before the zip never ships", async () => {
    // `addressLineOf` (lib/email/listing-flyer.ts) is the ONE root; this recipe used to
    // carry a private copy of the fix and the other six emails did not get it.
    const hero = heroOf((await buildProperty(RELISTED_HOME))!)!;
    expect(hero.label).toBe("410 Bayshore Dr, Cape Coral, FL 33904");
    expect(hero.label).not.toContain("FL, 33904");
  });

  test("the photo is the listing's own", async () => {
    const doc = (await buildProperty(RELISTED_HOME))!;
    const img = doc.blocks.find((b) => b.type === "image");
    expect(img?.type === "image" && img.props.url).toBe(RELISTED_HOME.photos[0]);
  });

  // ── THE THREE DELETIONS. Each of these goes red if the old shape creeps back. ──

  test("DELETED: no 'Days Off' cell anywhere — nobody cares how long it sat", async () => {
    const doc = (await buildProperty(RELISTED_HOME_RICH))!;
    expect(cellNamed(doc, "Days Off")).toBeUndefined();
    const html = await renderEmailDocHtml(doc);
    expect(html.toLowerCase()).not.toContain("days off");
  });

  test("DELETED: NO cancellation rate, local or national, in the sent bytes", async () => {
    // "the stupid talk" — a market-statistics paragraph on an email about ONE HOUSE. Those
    // rates belong to AREA mode. Asserting ABSENCE (not "exactly once") is deliberate: it
    // is the stronger guard, and it is the one the operator actually asked for.
    const html = await renderEmailDocHtml((await buildProperty(RELISTED_HOME_RICH))!);
    expect(html).not.toContain("13.6%"); // the national frame
    expect(html).not.toContain("fall through");
    expect(html).not.toContain("no fault of the seller");
    expect(html).not.toContain("red flag");
  });

  test("DELETED: no homepage behind the button — §1.8, no real link means NO button", async () => {
    // `facts.sourceUrl` is the CITATION field and `resolve-subject.ts` hardcodes it to our
    // own site; this recipe passed it straight to the CTA until 08/06/2026. It now rides
    // `listingButtonUrl`, which returns null for our homepage.
    const homepageOnly: ListingFacts = {
      ...RELISTED_HOME,
      sourceUrl: "https://www.swfldatagulf.com",
    };
    const button = (await buildProperty(homepageOnly))!.blocks.find((b) => b.type === "button")!
      .props as { label?: string; url?: string };
    expect(button.label).toBe("Schedule a Showing");
    expect(button.url).toBeUndefined();
  });

  // ── THE DETAILS, WHICH LEAD. "get the details first." ──

  test("THE STRIP IS THE CAMPAIGN'S OWN — beds · baths · sq ft · lot · $/sq ft · type", async () => {
    const doc = (await buildProperty(RELISTED_HOME_RICH))!;
    const strip = statsRows(doc).find((row) => row.some((c) => c.label === "Beds"))!;
    expect(strip.map((c) => c.label)).toEqual(["Beds", "Baths", "Sq Ft", "Lot", "$/Sq Ft", "Type"]);
    expect(cellNamed(doc, "Beds")!.value).toBe("3");
    expect(cellNamed(doc, "Baths")!.value).toBe("2");
    expect(cellNamed(doc, "Sq Ft")!.value).toBe("1,980");
    expect(cellNamed(doc, "Lot")!.value).toBe("0.23 ac");
    expect(cellNamed(doc, "$/Sq Ft")!.value).toBe("$277"); // 549000 / 1980
    expect(cellNamed(doc, "Type")!.value).toBe("Single Family");
  });

  test("NO DOM CELL — a relisted home's vendor list_date may belong to the ORIGINAL run", async () => {
    // Printing `today − list_date` as "DOM" on a relist would state a number that quietly
    // means something else. Type keeps the sixth slot instead, so the strip is still full.
    expect(cellNamed((await buildProperty(RELISTED_HOME_RICH))!, "DOM")).toBeUndefined();
  });

  test("THE SELLER'S OWN DESCRIPTION SHIPS, verbatim, in its own block", async () => {
    const doc = (await buildProperty(RELISTED_HOME_RICH))!;
    const desc = doc.blocks.find(
      (b) => b.type === "text" && (b.props as { descriptionSlot?: boolean }).descriptionSlot,
    );
    expect(desc, "the description block must be emitted when remarks are held").toBeTruthy();
    expect((desc!.props as { body?: string }).body).toBe(RELISTED_HOME_RICH.remarks);
    // …and the authored paragraph lands BESIDE it, never over it.
    expect(await renderEmailDocHtml(doc)).toContain(NARRATIVE);
  });

  test("NO HOA CELL, EVER — even when the fee is held (operator decree 08/18/2026)", async () => {
    // "We don't want to detour any potential buyers before arriving. The agent's job is
    // to answer those questions." The fee still reaches ListingFacts (the model may see
    // it); the READER-facing cell is banned. See secondSpecRow's ⛔ block.
    const doc = (await buildProperty(RELISTED_HOME_RICH))!;
    expect(cellNamed(doc, "HOA/mo")).toBeUndefined();
    // And with HOA gone, this email's second row is Built alone — a one-cell orphan, so
    // the whole row is dropped (08/09/2026: no cell "on its own line"). Year built shows
    // only where a peer cell exists to sit beside it (new-listing, when DOM displaces
    // Type into the second row).
    expect(cellNamed(doc, "Built")).toBeUndefined();
    // Type still prints exactly once — in the FIRST strip's sixth slot.
    expect(allCells(doc).filter((c) => c.label === "Type" && c.value)).toHaveLength(1);
  });

  test("no description and no paid facts → no empty blocks, no zeros (RULE 0.7)", async () => {
    const doc = (await buildProperty(RELISTED_HOME))!;
    expect(
      doc.blocks.find(
        (b) => b.type === "text" && (b.props as { descriptionSlot?: boolean }).descriptionSlot,
      ),
      "an absent description is NO block — never an empty 'About this home' box",
    ).toBeUndefined();
    expect(cellNamed(doc, "Built")).toBeUndefined();
    expect(cellNamed(doc, "HOA/mo")).toBeUndefined();
    expect(EmailDocSchema.safeParse(doc).success).toBe(true);
  });

  // ── THE ONE PARAGRAPH ──

  test("the narrative is the HOUSE paragraph, ALONE — no status prose appended", async () => {
    const doc = (await buildProperty(RELISTED_HOME_RICH))!;
    const authored = doc.blocks.find(
      (b) =>
        b.type === "text" &&
        !(b.props as { descriptionSlot?: boolean }).descriptionSlot &&
        ((b.props as { body?: string }).body ?? "").length > 0,
    )!.props as { body?: string };
    expect(authored.body).toBe(NARRATIVE);
  });

  // ── THE NARRATOR LEAK GUARD. Both of these are REAL live outputs, 08/06/2026. ──

  test("LEAK: narration that TRAILS the real paragraph is dropped, the paragraph is kept", async () => {
    // The first cut of this guard took the LAST segment after a "---" rule, assuming the
    // narration always led. On this real output it does the opposite — so that version kept
    // the apology and threw the description away, and the email shipped with NO PROSE.
    const REAL =
      "A 0.23-acre lot gives the home meaningful separation. Three bedrooms and two baths " +
      "across 1,980 square feet.";
    const doc = (await buildWithNarrator(
      RELISTED_HOME,
      `${REAL}\n\n---\n\n*I was not given a year built or a seller's description, so I drew ` +
        `only on the lot size. Let me know and I can trim further.*`,
    ))!;
    const body = authoredBodyOf(doc);
    expect(body).toBe(REAL);
    expect(body).not.toContain("I was not given");
  });

  test("LEAK: a bracketed placeholder costs its SENTENCE, not the whole paragraph", async () => {
    // Live: "Built in [year not provided], this 0.26-acre lot gives the home…" — the model
    // reached for a fact it does not hold and left the scaffolding visible. Dropping the
    // whole paragraph over one clause is how this email ended up with no prose at all.
    const doc = (await buildWithNarrator(
      RELISTED_HOME,
      "Built in [year not provided], the home sits well back from the road. " +
        "Three bedrooms and two baths across 1,980 square feet.",
    ))!;
    const body = authoredBodyOf(doc);
    expect(body).toBe("Three bedrooms and two baths across 1,980 square feet.");
    expect(body).not.toContain("[");
  });

  test("LEAK: if EVERY paragraph is narration, the slot stays OPEN — never scaffolding", async () => {
    const doc = (await buildWithNarrator(
      RELISTED_HOME,
      "The COMMUNITY fact line is absent, so I will say nothing about amenities.",
    ))!;
    expect(authoredBodyOf(doc)).toBe("");
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("fact line");
  });

  test("the CTA is 'Schedule a Showing', to the listing's own page", async () => {
    const button = (await buildProperty(RELISTED_HOME))!.blocks.find((b) => b.type === "button")!
      .props as { label?: string; url?: string };
    expect(button.label).toBe("Schedule a Showing");
    expect(button.url).toBe(RELISTED_HOME.sourceUrl);
  });

  test("the subject line names the street, deterministically (no LLM)", async () => {
    const doc = (await buildProperty(RELISTED_HOME))!;
    expect(doc.subjectVariants?.[0]).toBe("Back on the market: 410 Bayshore Dr");
  });

  test("THE BUILT DOC PARSES", async () => {
    const parsed = EmailDocSchema.safeParse((await buildProperty(RELISTED_HOME_RICH))!);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });

  test("the prohibitions bind property mode too — SAME banned-strings list as area mode", async () => {
    const html = (
      await renderEmailDocHtml((await buildProperty(RELISTED_HOME_RICH))!)
    ).toLowerCase();
    expect(html).not.toContain("stigmatiz");
    for (const banned of BANNED_SUBSTRINGS) expect(html).not.toContain(banned);
  });

  test("ctx.facts wins over ctx.zip when both are present", async () => {
    const withZip: RecipeBuildContext = { ...ctxProperty(RELISTED_HOME), zip: "34142" };
    const doc = (await buildBackOnMarket(withZip, {
      loadZip: async () => {
        throw new Error("PROPERTY mode must never read a zip rate");
      },
    }))!;
    // Property mode's hero, not an area rate hero.
    expect(heroOf(doc)!.value).toBe("$549,000");
  });
});
