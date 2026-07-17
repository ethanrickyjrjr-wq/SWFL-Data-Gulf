// lib/deliverable/recipes/back-on-market.test.ts
//
// R · BACK ON THE MARKET — the acceptance oracle for the "send it" deliverable.
//
// The failure mode here is the same one price-reduced.test.ts was built to catch: a doc
// that FAILS SCHEMA does not fail loudly — build-doc falls through to the generic author,
// silently bypassing every no-invention guard. So the load-bearing assertions are (1) the
// built doc PARSES, and (2) the no-invention checks run on the RENDERED HTML — never on the
// source file, because BACK_ON_MARKET_PROHIBITIONS legitimately contains the word
// "stigmatized" and a source-scan would self-fail on it.
//
// Fully offline: the ZIP loader is injected, so zero lake reads, zero brain fetches, zero
// network, zero cost.
import { test, expect, describe } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { buildBackOnMarket, BACK_ON_MARKET_PROHIBITIONS } from "./back-on-market";
import { NATIONAL_FALLTHROUGH } from "@/lib/back-on-market/national-frame";
import type { RecipeBuildContext } from "./index";
import type { BackOnMarketZip } from "@/lib/back-on-market/load-zip";
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

const build = (data: BackOnMarketZip | null, zip = "33904", doc?: EmailDoc) =>
  buildBackOnMarket(ctx(zip, doc), { loadZip: async () => data });

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

// ── THE CAMPAIGN CHROME — a sibling of the lifecycle emails ──────────────────────────

describe("it wears the one campaign chrome", () => {
  test("the spine is the campaign's, in order (with the local-vs-national middle)", async () => {
    const doc = (await build(CAPE))!;
    expect(spine(doc)).toEqual([
      "header",
      "hero:ribbon",
      "image:photo",
      "hero:subject",
      "stats:strip", // the three local rates
      "stats:grid", // the local-vs-national comparison (the middle)
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

// ── CELLS: the ZIP's real rates, each sourced ───────────────────────────────────────

describe("the local rates are the sourced numbers", () => {
  test("the hero is the place over its headline cancellation rate", async () => {
    const hero = heroOf((await build(CAPE))!)!;
    expect(hero.value).toBe("13%");
    expect(hero.label).toBe("How often deals fall through in Cape Coral");
  });

  test("the strip carries the three local rates, cancellation first", async () => {
    const doc = (await build(CAPE))!;
    expect(cellNamed(doc, "Fall out of contract")!.value).toBe("13%");
    expect(cellNamed(doc, "Fall out of contract")!.emphasis).toBe("primary");
    expect(cellNamed(doc, "Relisted")!.value).toBe("8%");
    expect(cellNamed(doc, "Delisted")!.value).toBe("5%");
  });

  test("the middle sets the local rate against the national frame", async () => {
    const doc = (await build(CAPE))!;
    expect(cellNamed(doc, "Cape Coral — deals that fall through")!.value).toBe("13%");
    expect(cellNamed(doc, "United States")!.value).toBe("13.6%");
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
});

// ── THE BOUNDARY — no-invention, on the RENDERED bytes ──────────────────────────────

describe("the sent artifact never asserts a per-home reason, and never 'stigmatized'", () => {
  test("it cites the local rate and states the neutral truth", async () => {
    const html = await renderEmailDocHtml((await build(CAPE))!);
    expect(html).toContain("Back on the Market");
    expect(html).toContain("13%"); // the local rate — the design's explicit delta
    expect(html).toContain("13.6%"); // the national frame
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
    for (const banned of [
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
    ]) {
      expect(html).not.toContain(banned);
    }
  });

  test("the prohibition checklist is a real, non-empty constant", () => {
    // The boundary is documented in code, greppable — the test enforces it on output.
    expect(BACK_ON_MARKET_PROHIBITIONS.length).toBeGreaterThan(0);
    expect(BACK_ON_MARKET_PROHIBITIONS.join(" ")).toContain("stigmatized");
  });
});

// ── SUPPRESSED / EMPTY — never a fabricated rate, never a refusal ───────────────────

describe("empty-tolerance", () => {
  test("a suppressed ZIP (null rates) still builds — cells open, middle dropped, no invented rate", async () => {
    const doc = (await build(SUPPRESSED))!;
    expect(doc).toBeTruthy();
    // Hero value is an open slot, not a fabricated rate.
    expect(heroOf(doc)!.value).toBe("");
    // No local rate → no one-sided comparison table.
    expect(spine(doc).filter((s) => s === "stats:grid")).toHaveLength(0);
    // The narrative degrades to the non-local causes-frame: NO local rate is cited (there
    // is none), while the cited NATIONAL frame (13.6%) still stands — that number is a real
    // Lane-3 web source, not a fabrication.
    const body = (doc.blocks.find((b) => b.type === "text")!.props as { body?: string }).body ?? "";
    expect(body).toContain("A home back on the market has usually fallen out of contract");
    expect(body).not.toContain("of pending deals in"); // the LOCAL-rate lead never appears
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

test("the CTA points at the full read for this ZIP", async () => {
  const doc = (await build(CAPE))!;
  const button = doc.blocks.find((b) => b.type === "button")!.props as {
    label?: string;
    url?: string;
  };
  expect(button.label).toBe("See the full read");
  expect(button.url).toContain("/r/back-on-market?q=33904");
});
