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
// Fully offline: the ZIP loader is injected, so zero lake reads, zero brain fetches, zero
// network, zero cost.
import { test, expect, describe } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { buildBackOnMarket, BACK_ON_MARKET_PROHIBITIONS } from "./back-on-market";
import { NATIONAL_FALLTHROUGH } from "@/lib/back-on-market/national-frame";
import type { RecipeBuildContext } from "./index";
import type { BackOnMarketZip } from "@/lib/back-on-market/load-zip";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

// Read from the same constant the recipe uses, so the test can't drift from the source
// when the monthly national figure is bumped.
const NATIONAL_FALLTHROUGH_ASOF = NATIONAL_FALLTHROUGH.asOf;

const { renderEmailDocHtml } = await import("@/lib/email/render-email-doc");
const { defaultDoc } = await import("@/lib/email/doc/default-docs");

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

/** A specific listing back on the market — property mode's fixture. */
const RELISTED_HOME: ListingFacts = {
  address: "410 Bayshore Dr, Cape Coral, FL 33904",
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

const buildProperty = (
  facts: ListingFacts,
  zipData: BackOnMarketZip | null,
  relist?: { daysOffMarket: number | null },
) => buildBackOnMarket(ctxProperty(facts), { loadZip: async () => zipData, relist });

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

  test("provenance names the as-of dates and stays within the 120-char footnote cap", async () => {
    const doc = (await build(CAPE))!;
    const strip = doc.blocks.find(
      (b) => b.type === "stats" && (b.props as { variant?: string }).variant === "strip",
    )!.props as { footnote?: string };
    expect(strip.footnote).toContain("03/01/2026");
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

// ── SUPPRESSED / EMPTY — never a fabricated rate, never a refusal ───────────────────

describe("AREA mode — empty-tolerance", () => {
  test("a suppressed ZIP (null rates) still builds — cells open, no invented rate", async () => {
    const doc = (await build(SUPPRESSED))!;
    expect(doc).toBeTruthy();
    // Hero value is an open slot, not a fabricated rate.
    expect(heroOf(doc)!.value).toBe("");
    // No local rate → no one-sided comparison table (area mode never has one anyway).
    expect(spine(doc).filter((s) => s === "stats:grid")).toHaveLength(0);
    // The narrative is the SAME fixed frame every area build gets — it never cited the
    // local rate to begin with (NUMBER-ONCE), so a suppressed ZIP changes nothing about it.
    const body = (doc.blocks.find((b) => b.type === "text")!.props as { body?: string }).body ?? "";
    expect(body).toContain("A home back on the market has usually fallen out of contract");
    expect(body).not.toContain("of pending deals in"); // never restates a local rate
    expect(body).toContain("13.6%"); // the cited national frame still stands
  });

  test("no ZIP on the context → null (fall through to the generic author)", async () => {
    expect(await buildBackOnMarket(ctx(undefined), { loadZip: async () => CAPE })).toBeNull();
  });

  test("the loader finds no rates → null (fall through, never an empty rate email)", async () => {
    expect(await build(null)).toBeNull();
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
// PROPERTY MODE — ctx.facts set: a specific listing back on the market (08/03/2026:
// "usually back on market is a fucking property").
// ═════════════════════════════════════════════════════════════════════════════════

describe("PROPERTY mode — a specific listing back on the market", () => {
  test("the spine wears the campaign chrome, with the ONE stats grid", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    expect(spine(doc)).toEqual([
      "header",
      "hero:ribbon",
      "image:photo",
      "hero:subject",
      "stats:strip",
      "stats:grid",
      "text",
      "agent-card",
      "button",
      "footer",
    ]);
  });

  test("the ribbon word is 'Back on the Market'", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    expect(ribbonOf(doc)!.kicker).toBe("Back on the Market");
  });

  test("the hero is the LISTING's price and address — not an area rate", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    const hero = heroOf(doc)!;
    expect(hero.value).toBe("$549,000");
    expect(hero.label).toContain("410 Bayshore Dr");
  });

  test("the photo is the listing's own", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    const img = doc.blocks.find((b) => b.type === "image");
    expect(img?.type === "image" && img.props.url).toBe(RELISTED_HOME.photos[0]);
  });

  test('"Days Off" leads the strip, primary, from the injected relist reading', async () => {
    // Label is "Days Off", not "Days off market" — a longer label measured 141px wide at
    // the real strip spec (14px uppercase +0.06em), nearly identical to "OPEN HOUSE DATE"'s
    // 144px (the string FIX 1 just shortened) against a ~97px single-line budget.
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    const cell = cellNamed(doc, "Days Off")!;
    expect(cell.value).toBe("47");
    expect(cell.emphasis).toBe("primary");
    expect(cellNamed(doc, "Beds")!.value).toBe("3");
    expect(cellNamed(doc, "Sq Ft")!.value).toBe("1,980");
  });

  test("no relist reading → Days Off is an open slot, never a zero", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE))!;
    expect(cellNamed(doc, "Days Off")!.value).toBe("");
  });

  test("the ONE stats grid sets the listing's ZIP against the national frame", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    expect(cellNamed(doc, "Cape Coral — deals that fall through")!.value).toBe("13%");
    expect(cellNamed(doc, "United States")!.value).toBe("13.6%");
  });

  test("no local rate for the listing's ZIP → the grid is dropped entirely, never one-sided", async () => {
    const doc = (await buildProperty(RELISTED_HOME, SUPPRESSED))!;
    expect(spine(doc).filter((s) => s === "stats:grid")).toHaveLength(0);
    expect(cellNamed(doc, "United States")).toBeUndefined();
  });

  test("the narrative carries NO NUMBERS AT ALL", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    const body = (doc.blocks.find((b) => b.type === "text")!.props as { body?: string }).body ?? "";
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/\d/);
    expect(body).toContain("no fault of the seller");
    expect(body).toContain("common");
    expect(body).toContain("not a red flag");
    expect(body).toContain("why this contract ended — and neither will we");
  });

  test("the CTA is 'Schedule a Showing', to the listing's own citation", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    const button = doc.blocks.find((b) => b.type === "button")!.props as {
      label?: string;
      url?: string;
    };
    expect(button.label).toBe("Schedule a Showing");
    expect(button.url).toBe(RELISTED_HOME.sourceUrl);
  });

  test("THE BUILT DOC PARSES", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    const parsed = EmailDocSchema.safeParse(doc);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });

  test("NUMBER-ONCE: the sent HTML shows the local rate exactly once", async () => {
    const html = await renderEmailDocHtml(
      (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!,
    );
    expect(countOf(html, "13%")).toBe(1);
  });

  test("the prohibitions bind property mode too — SAME banned-strings list as area mode", async () => {
    const html = (
      await renderEmailDocHtml((await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!)
    ).toLowerCase();
    expect(html).not.toContain("stigmatiz");
    for (const banned of BANNED_SUBSTRINGS) expect(html).not.toContain(banned);
  });

  test("the ONE stats grid is cited — provenance carries the local and national as-of dates", async () => {
    const doc = (await buildProperty(RELISTED_HOME, CAPE, { daysOffMarket: 47 }))!;
    const strip = doc.blocks.find(
      (b) => b.type === "stats" && (b.props as { variant?: string }).variant === "strip",
    )!.props as { footnote?: string };
    expect(strip.footnote).toContain("03/01/2026");
    expect(strip.footnote).toContain(NATIONAL_FALLTHROUGH_ASOF);
  });

  test("no local rate → no grid AND no orphaned citation", async () => {
    const doc = (await buildProperty(RELISTED_HOME, SUPPRESSED, { daysOffMarket: 47 }))!;
    const strip = doc.blocks.find(
      (b) => b.type === "stats" && (b.props as { variant?: string }).variant === "strip",
    )!.props as { footnote?: string };
    expect(strip.footnote).toBeUndefined();
  });

  test("ctx.facts wins over ctx.zip when both are present", async () => {
    const withZip: RecipeBuildContext = { ...ctxProperty(RELISTED_HOME), zip: "34142" };
    const doc = (await buildBackOnMarket(withZip, {
      loadZip: async () => CAPE,
      relist: { daysOffMarket: 47 },
    }))!;
    // Property mode's hero, not an area rate hero.
    expect(heroOf(doc)!.value).toBe("$549,000");
  });
});
