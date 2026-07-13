import { test, expect, mock, afterAll } from "bun:test";
import * as realMarket from "@/lib/email/market-context";
import * as realAnthropic from "@/refinery/agents/anthropic.mts";
import { SEED_DOCS } from "@/lib/email/doc/default-docs";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { groupRows } from "@/lib/email/doc/row-grouping";
import { compileGrid } from "@/lib/email/compile-grid";
import { GRID_COLS, GRID_WIDTH } from "@/lib/email/grid-schema";
import type { EmailDoc, EmailBlock } from "@/lib/email/doc/types";
import type { RecipeBuildContext } from "./index";
import { RECIPES } from "@/lib/deliverable/recipes";

// mock.module is process-global (no per-file isolation) — snapshot + restore, the
// same pattern as lib/email/build-doc-listing.test.ts. Both the lake and the model
// are stubbed so this test is fully offline and deterministic.
const marketOrig = { ...realMarket };
const anthropicOrig = { ...realAnthropic };
afterAll(() => {
  mock.module("@/lib/email/market-context", () => marketOrig);
  mock.module("@/refinery/agents/anthropic.mts", () => anthropicOrig);
});

/** The real shape `zipFigures` pushes for 33904 (lib/email/market-context.ts). */
const LAKE_FIGURES: realMarket.MarketFigure[] = [
  {
    key: "rent",
    label: "Typical asking rent",
    value: "$2,100/mo",
    source: "Zillow ZORI",
    as_of: "06/30/2026",
  },
  {
    key: "home_value",
    label: "Median home value — Cape Coral (33904)",
    value: "$383,900",
    source: "Zillow ZHVI",
    as_of: "06/30/2026",
  },
  {
    key: "median_list",
    label: "Median list price",
    value: "$425,000",
    source: "SWFL Data Gulf",
    as_of: "07/12/2026",
  },
];

let modelReply = JSON.stringify({
  subject: "A note before I start sending these",
  letter:
    "You are getting this because we know each other.\n\nI work here because this is where I live, and the market moves faster than the headlines admit. The number below is what a home in Cape Coral is actually worth right now.\n\nIf you have a question, just reply.",
  next: [
    "A short read on what changed in your area",
    "The one number worth knowing that week",
    "A straight answer any time you reply",
  ],
});
let systemSeen = "";
let userSeen = "";

mock.module("@/refinery/agents/anthropic.mts", () => ({
  getAnthropic: () => ({
    messages: {
      create: async (args: { system: string; messages: { content: string }[] }) => {
        systemSeen = args.system;
        userSeen = args.messages[0].content;
        return { content: [{ type: "text", text: modelReply }] };
      },
    },
  }),
}));
mock.module("@/lib/email/market-context", () => ({
  ...marketOrig,
  loadMarketFigures: async (scope: { kind?: string; value?: string }) =>
    scope?.value === "33904" ? LAKE_FIGURES : [],
}));

const {
  buildAgentLaunch,
  areaFor,
  pickOneFigure,
  dropDigitSentences,
  headshotFrom,
  replyMailtoFrom,
} = await import("./agent-launch");

const PROMPT = RECIPES["agent-launch"].prompt.replace("[[your city or ZIP]]", "Cape Coral");

/** A branded canvas doc — what the Lab actually POSTs (applyBrand has already run on
 *  it). `skeleton-clean-white` is what every recipe arrival lands on today. */
function canvas(over?: Partial<EmailDoc>): EmailDoc {
  const doc = SEED_DOCS.find((s) => s.id === "skeleton-clean-white")!.build();
  const footer = doc.blocks.find((b) => b.type === "footer");
  if (footer && footer.type === "footer") footer.props.email = "dani@verorealty.com";
  return { ...doc, ...over };
}

/** Exactly what the dispatcher hands an "agent"-spine builder: no facts, and NO zip
 *  (the Lab door passes no scope at all — that is the door that was broken). */
function ctxFor(doc: EmailDoc, prompt = PROMPT): RecipeBuildContext {
  return {
    recipe: RECIPES["agent-launch"],
    prompt,
    currentDoc: doc,
    facts: null,
    resolved: false,
  };
}

const byType = (doc: EmailDoc, t: EmailBlock["type"]) => doc.blocks.filter((b) => b.type === t);

// ── The area: the Lab door passes nothing, so the prompt is the only source ──

test("areaFor reads the scope ZIP, a typed ZIP, then the place crosswalk", () => {
  expect(areaFor({ ...ctxFor(canvas()), zip: "33905" })).toEqual({
    place: "33905",
    zip: "33905",
  });
  expect(
    areaFor(ctxFor(canvas(), "...one real market insight about 33904, and one reply CTA.")),
  ).toEqual({
    place: "33904",
    zip: "33904",
  });
  // The Lab door: no scope, a named city in the prompt.
  expect(areaFor(ctxFor(canvas()))?.place).toBe("Cape Coral");
  // A place we hold no crosswalk entry for → null, never an invented ZIP.
  expect(areaFor(ctxFor(canvas(), "a letter about Boise"))).toBeNull();
});

test("areaFor never reads a street number as a ZIP", () => {
  expect(areaFor(ctxFor(canvas(), "a letter, 326 Shore Dr, no area named"))).toBeNull();
});

// ── The one number ──────────────────────────────────────────────────────────

test("pickOneFigure takes home value over rent, and never stacks a second", () => {
  const f = pickOneFigure(LAKE_FIGURES);
  expect(f?.key).toBe("home_value");
  expect(f?.value).toBe("$383,900");
  expect(pickOneFigure([])).toBeNull();
  // No home value held → the next real figure in priority, never the rent index.
  expect(pickOneFigure(LAKE_FIGURES.filter((x) => x.key !== "home_value"))?.key).toBe(
    "median_list",
  );
});

// ── What we lift off the canvas (brand is sticky; we never author it) ───────

test("headshotFrom reads the agent photo applyBrand already landed on the canvas", () => {
  expect(headshotFrom(canvas())).toBe(""); // skeleton-clean-white has no agent block
  const withCard = canvas();
  withCard.blocks.push({
    id: "ac2",
    type: "agent-hero",
    props: { photoUrl: "https://cdn.example/h.jpg" },
  });
  expect(headshotFrom(withCard)).toBe("https://cdn.example/h.jpg");
});

test("replyMailtoFrom only ever returns a real address", () => {
  expect(replyMailtoFrom(canvas())).toBe("mailto:dani@verorealty.com");
  const blank = canvas();
  const f = blank.blocks.find((b) => b.type === "footer")!;
  if (f.type === "footer") f.props.email = "not-an-email";
  expect(replyMailtoFrom(blank)).toBe("");
});

// ── The invention gate on the prose ─────────────────────────────────────────

test("dropDigitSentences removes any sentence carrying a digit, keeping paragraphs", () => {
  const out = dropDigitSentences(
    "I live here. Homes here sell for $412,000 on average. That is the work.\n\nJust reply.",
  );
  expect(out).toBe("I live here. That is the work.\n\nJust reply.");
  expect(out).not.toContain("412");
});

// ── The build ───────────────────────────────────────────────────────────────

test("buildAgentLaunch: NO chart, ever", async () => {
  const doc = (await buildAgentLaunch(ctxFor(canvas())))!;
  expect(doc.blocks.some((b) => b.type === "image" && b.props.kind === "chart")).toBe(false);
  expect(RECIPES["agent-launch"].chart).toBe("none");
});

test("buildAgentLaunch: the photo sits BESIDE the letter, not above it", async () => {
  const doc = canvas();
  doc.blocks.push({
    id: "ac0",
    type: "agent-card",
    props: { name: "Dani Vero", photoUrl: "https://cdn.example/dani.jpg" },
  });
  const built = (await buildAgentLaunch(ctxFor(doc)))!;
  const photo = byType(built, "image")[0];
  const letter = byType(built, "text")[0];
  expect(photo.props.kind).toBe("photo");
  // Same y-band → groupRows compiles them as one side-by-side row in BOTH engines.
  expect(photo.layout!.y).toBe(letter.layout!.y);
  expect(photo.layout!.x).toBe(0);
  expect(letter.layout!.x).toBe(photo.layout!.w);
  expect(photo.layout!.w + letter.layout!.w).toBe(12);
});

test("buildAgentLaunch: no portrait → the letter takes the full width, never a dead column", async () => {
  // compile-grid emits a ghost column for EVERY block in a y-band, even one that
  // renders to nothing — so pairing the letter with an EMPTY image slot shipped the
  // letter squeezed into the right half beside 250px of white void (seen 07/13).
  const built = (await buildAgentLaunch(ctxFor(canvas())))!;
  const photo = byType(built, "image")[0];
  const letter = byType(built, "text")[0];
  expect(photo.props.url).toBe("");
  expect(letter.layout!.w).toBe(12);
  // Different bands → the slot is its own row: a canvas dropzone that renders to
  // NOTHING in the email (single-block row → ImageBlock returns null).
  expect(photo.layout!.y + photo.layout!.h).toBeLessThanOrEqual(letter.layout!.y);
});

test("buildAgentLaunch: exactly ONE hard number, sourced, written in code", async () => {
  const doc = (await buildAgentLaunch(ctxFor(canvas())))!;
  const stats = byType(doc, "stats");
  expect(stats).toHaveLength(1);
  expect(stats[0].props.stats).toEqual([
    { value: "$383,900", label: "Median home value — Cape Coral (33904)" },
  ]);
  // Cited, collapsed, data-seeded.
  const sources = byType(doc, "sources")[0];
  expect(sources.props.sources[0].label).toContain("Zillow ZHVI");
  expect(sources.props.note).toBe("As of 06/30/2026.");
  // ...and the ONLY number in the letter's prose is none at all.
  const letter = String(byType(doc, "text")[0].props.body);
  expect(letter).not.toMatch(/\d/);
});

test("buildAgentLaunch: the narrator is handed no figure it could restate", async () => {
  await buildAgentLaunch(ctxFor(canvas()));
  expect(userSeen).toContain("Cape Coral");
  expect(userSeen).not.toContain("383,900");
  expect(systemSeen).toContain("NO NUMBERS");
  // A figure IS printed → the letter may point at it.
  expect(userSeen).toContain("A single real market figure IS printed");
});

test("buildAgentLaunch: no figure → the letter is told there is no number to point at", async () => {
  // Element coherence: the stat is an OPEN SLOT (absent from the sent email) whenever
  // the lake holds none of the priority figures — so a letter closing on "the number
  // below" would point at nothing. Fires for an in-SWFL ZIP with a thin row, not just
  // an out-of-scope place.
  await buildAgentLaunch(ctxFor(canvas(), "a launch letter about Boise"));
  expect(userSeen).toContain("THERE IS NO NUMBER IN THIS EMAIL");
  // The PROHIBITION quotes the phrase ("do not say \"the number below\""), so a bare
  // substring check would pass while the model was being told the opposite. Assert on
  // the POSITIVE instruction being absent instead.
  expect(userSeen).not.toContain("A single real market figure IS printed");
});

test("buildAgentLaunch: no headshot → an OPEN SLOT, never a stock face", async () => {
  const doc = (await buildAgentLaunch(ctxFor(canvas())))!;
  const photo = byType(doc, "image")[0];
  expect(photo.props.url).toBe("");
  // The label IS the instruction — ImageBlock renders it over the file picker.
  expect(photo.props.alt).toContain("headshot");
});

test("buildAgentLaunch: a headshot already on the canvas lands beside the letter", async () => {
  const doc = canvas();
  doc.blocks.push({
    id: "ac1",
    type: "agent-card",
    props: { name: "Dani Vero", photoUrl: "https://cdn.example/dani.jpg" },
  });
  const built = (await buildAgentLaunch(ctxFor(doc)))!;
  expect(byType(built, "image")[0].props.url).toBe("https://cdn.example/dani.jpg");
  // ...and the user's own name carries through as the signature (never re-authored).
  expect(byType(built, "agent-card")[0].props.name).toBe("Dani Vero");
});

test("signatureCard never ships the seed's house-brand placeholder copy", async () => {
  // `market-letter` seeds an agent-card with the FACTORY props — "SWFL Data Gulf",
  // "A short bio that builds trust with your readers.", "Get in touch". Lifting the
  // block wholesale sent that instruction copy to a real recipient (07/13 render).
  const doc = SEED_DOCS.find((s) => s.id === "market-letter")!.build();
  const seeded = doc.blocks.find((b) => b.type === "agent-card")!;
  expect(seeded.type === "agent-card" && seeded.props.bio).toBe(
    "A short bio that builds trust with your readers.",
  );
  const footer = doc.blocks.find((b) => b.type === "footer");
  if (footer && footer.type === "footer") footer.props.email = "dani@verorealty.com";

  const card = byType((await buildAgentLaunch(ctxFor(doc)))!, "agent-card")[0];
  expect(card.props.bio).toBe("");
  expect(card.props.name).toBe(""); // → applyBrand fills the real AGENT_NAME after
  expect(card.props.title).toBe("");
  // ONE ask per letter: the reply button. A "Get in touch →" on the signature is a second.
  expect(card.props.ctaLabel).toBe("");
  expect(card.props.ctaUrl).toBe("");
});

test("buildAgentLaunch: ONE reply CTA, and it is a real mailto", async () => {
  const doc = (await buildAgentLaunch(ctxFor(canvas())))!;
  const buttons = byType(doc, "button");
  expect(buttons).toHaveLength(1);
  expect(buttons[0].props.url).toBe("mailto:dani@verorealty.com");
});

test("buildAgentLaunch: no reply address → no button at all (never a naked CTA)", async () => {
  const doc = canvas();
  const footer = doc.blocks.find((b) => b.type === "footer")!;
  if (footer.type === "footer") footer.props.email = "";
  const built = (await buildAgentLaunch(ctxFor(doc)))!;
  expect(byType(built, "button")).toHaveLength(0);
});

test("buildAgentLaunch: an unheld area leaves the number an OPEN SLOT, never a zero", async () => {
  const built = (await buildAgentLaunch(ctxFor(canvas(), "a launch letter about Boise")))!;
  const cells = byType(built, "stats")[0].props.stats;
  expect(cells[0].value).toBe("");
  expect(cells[0].label).toBe("The one market number to lead with");
  // Nothing to cite → no accordion at all (never an empty "Sources (0)").
  expect(byType(built, "sources")).toHaveLength(0);
  // The build is NEVER refused (RULE 0.7) — the letter still ships.
  expect(String(byType(built, "text")[0].props.body).length).toBeGreaterThan(20);
});

test("buildAgentLaunch: the model's digits are stripped, not shipped", async () => {
  const saved = modelReply;
  modelReply = JSON.stringify({
    subject: "Values are up 8% here",
    letter: "You know me.\n\nHomes here run $412,000 now. I live down the street.",
    next: ["A read each week", "3 listings you should see", "A straight answer"],
  });
  const built = (await buildAgentLaunch(ctxFor(canvas())))!;
  const letter = String(byType(built, "text")[0].props.body);
  expect(letter).toBe("You know me.\n\nI live down the street.");
  // The digit-bearing list line is dropped; the clean ones survive.
  expect(byType(built, "list")[0].props.items.map((i) => i.text)).toEqual([
    "A read each week",
    "A straight answer",
  ]);
  // A subject line carrying an unsourced number is not a subject line.
  expect(built.subjectVariants).toBeUndefined();
  modelReply = saved;
});

test("buildAgentLaunch: the built doc always survives EmailDocSchema (authorDoc re-parses it)", async () => {
  const saved = modelReply;
  // A long subject is the trap: subjectVariants entries are capped at 90 in the
  // schema, and authorDoc safeParses the builder's output — one character over and
  // the WHOLE letter is discarded into the free author.
  modelReply = JSON.stringify({
    subject: "A very long subject line ".repeat(8),
    letter: "You know me.\n\nJust reply.",
    next: ["A read each week"],
  });
  const built = (await buildAgentLaunch(ctxFor(canvas())))!;
  expect(built.subjectVariants![0].length).toBeLessThanOrEqual(90);
  expect(EmailDocSchema.safeParse(built).success).toBe(true);
  modelReply = saved;
});

test("buildAgentLaunch: the narrator failing leaves open slots, never a refusal", async () => {
  const saved = modelReply;
  modelReply = "the model returned garbage";
  const built = (await buildAgentLaunch(ctxFor(canvas())))!;
  expect(built).not.toBeNull();
  // The letter is an OPEN SLOT (canvas placeholder; TextBlock drops it on emailRender).
  expect(byType(built, "text")[0].props.body).toBe("");
  // No list at all — never a titled band with nothing under it.
  expect(byType(built, "list")).toHaveLength(0);
  // The real number still ships: it was never the model's to write.
  expect(byType(built, "stats")[0].props.stats[0].value).toBe("$383,900");
  modelReply = saved;
});

test("buildAgentLaunch: brand is sticky — globalStyle and the branded footer carry through", async () => {
  const doc = canvas();
  doc.globalStyle.accentColor = "#B98F45";
  const built = (await buildAgentLaunch(ctxFor(doc)))!;
  expect(built.globalStyle.accentColor).toBe("#B98F45");
  expect(byType(built, "footer")[0].layout?.static).toBe(true);
});

// ── THE GROUPER — the assertion whose absence let a broken build "pass" ──────
//
// Every test above this line asserts layout INTENT (photo.y + h <= letter.y). Not one
// of them ran the REAL grouper, and the defect lived exactly there. `groupRows` bands
// by BAND OVERLAP, not equal y: a block joins the running row while `y < curBottom`.
// The no-headshot letter sat at {y:7,h:7} = band 7..14 while the stats ({y:9}) and the
// list ({y:12}) still carried their WITH-headshot y's — both inside 7..14. The letter
// swallowed them into ONE row of three w=12 blocks, and `compileGrid` emitted
// `<table width="1800">` with three `<td width="600">` into the Outlook ghost table:
// a 1800px three-column strip, 3x past the 600px canvas, in the SENT html.
//
// A SCREENSHOT CANNOT CATCH THIS. mso conditional comments are HTML comments;
// Chromium strips them and lays the three inline-block divs out as a clean vertical
// stack. The browser is structurally incapable of showing the defect — only the
// grouper and the compiled string can. So we assert on both, in both branches.

/** The REAL grouper over a built doc → each visual row's column widths. */
const rowWidths = (doc: EmailDoc): number[][] =>
  groupRows(doc.blocks).map((r) => r.map((e) => e.eff.w));

/** The canvas, plus the agent photo `applyBrand` lands when the account holds one. */
function canvasWithHeadshot(): EmailDoc {
  const doc = canvas();
  doc.blocks.push({
    id: "acg",
    type: "agent-card",
    props: { name: "Dani Vero", photoUrl: "https://cdn.example/dani.jpg" },
  });
  return doc;
}

test("GRID: no row exceeds 12 columns — NO HEADSHOT (the default path, the one that broke)", async () => {
  const built = (await buildAgentLaunch(ctxFor(canvas())))!;
  const widths = rowWidths(built);
  expect(widths.length).toBeGreaterThan(4); // it really did band into separate rows
  for (const row of widths) {
    expect(row.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(GRID_COLS);
  }
  // No portrait → NO multi-column row anywhere: the empty slot stands alone (a canvas
  // dropzone that renders to nothing in the email) and the letter takes the full width.
  expect(widths.every((r) => r.length === 1)).toBe(true);
});

test("GRID: no row exceeds 12 columns — WITH a headshot", async () => {
  const built = (await buildAgentLaunch(ctxFor(canvasWithHeadshot())))!;
  const widths = rowWidths(built);
  for (const row of widths) {
    expect(row.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(GRID_COLS);
  }
  // Exactly ONE deliberate two-column row — the portrait BESIDE the letter, 5 + 7 = 12.
  expect(widths.filter((r) => r.length > 1)).toEqual([[5, 7]]);
});

test("GRID: the SENT html never carries an Outlook ghost table wider than the canvas", async () => {
  // The real send path: render-email-doc.ts routes a laid-out doc through compileGrid.
  // This is the string a recipient's Outlook actually parses.
  for (const doc of [canvas(), canvasWithHeadshot()]) {
    const built = (await buildAgentLaunch(ctxFor(doc)))!;
    const html = await compileGrid(built);

    // Ghost tables carry a PIXEL width (the fluid shell tables are width="100%", which
    // this pattern does not match). 1800 was the bug; 600 is the canvas.
    const tables = [...html.matchAll(/<table[^>]*\swidth="(\d+)"/g)].map((m) => Number(m[1]));
    for (const w of tables) expect(w).toBeLessThanOrEqual(GRID_WIDTH);

    // ...and no ghost row may hold three columns.
    const tds = [...html.matchAll(/<td width="(\d+)"/g)].map((m) => Number(m[1]));
    expect(tds.length).toBeLessThanOrEqual(2);
    expect(tds.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(GRID_WIDTH);
    expect(html).not.toContain('width="1800"');
  }
});
