import { test, expect, mock, afterAll } from "bun:test";
import * as realMarket from "@/lib/email/market-context";
import * as realAnthropic from "@/refinery/agents/anthropic.mts";
import { SEED_DOCS, DEFAULT_BLOCK_PROPS } from "@/lib/email/doc/default-docs";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { groupRows } from "@/lib/email/doc/row-grouping";
import { compileGrid } from "@/lib/email/compile-grid";
import { GRID_COLS } from "@/lib/email/grid-schema";
import { CLAIM_PROHIBITION, auditClaims } from "@/lib/deliverable/claims";
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
    "You are getting this because we know each other.\n\nI work in Cape Coral, and I do it because the people buying and selling here deserve someone paying close attention. The one number in this note is what a home here is actually worth right now.\n\nIf you have a question, just reply. I read every response.",
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
  gateLetterProse,
  settledFacts,
  headshotFrom,
  replyMailtoFrom,
} = await import("./agent-launch");

const PROMPT = RECIPES["agent-launch"].prompt.replace("[[your city or ZIP]]", "Cape Coral");
const HEADSHOT = "https://cdn.example/dani.jpg";

/** A branded canvas doc — what the Lab actually POSTs (applyBrand has already run on
 *  it). `skeleton-clean-white` is what every recipe arrival lands on today. */
function canvas(over?: Partial<EmailDoc>): EmailDoc {
  const doc = SEED_DOCS.find((s) => s.id === "skeleton-clean-white")!.build();
  const footer = doc.blocks.find((b) => b.type === "footer");
  if (footer && footer.type === "footer") footer.props.email = "dani@verorealty.com";
  return { ...doc, ...over };
}

/** The canvas, plus the agent photo `applyBrand` lands when the account holds one. */
function canvasWithHeadshot(): EmailDoc {
  const doc = canvas();
  doc.blocks.push({
    id: "acg",
    type: "agent-card",
    props: { name: "Dani Vero", photoUrl: HEADSHOT },
  });
  return doc;
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
  const withHero = canvas();
  withHero.blocks.push({
    id: "ah2",
    type: "agent-hero",
    props: { photoUrl: "https://cdn.example/h.jpg" },
  });
  expect(headshotFrom(withHero)).toBe("https://cdn.example/h.jpg");
});

test("replyMailtoFrom only ever returns a real address", () => {
  expect(replyMailtoFrom(canvas())).toBe("mailto:dani@verorealty.com");
  const blank = canvas();
  const f = blank.blocks.find((b) => b.type === "footer")!;
  if (f.type === "footer") f.props.email = "not-an-email";
  expect(replyMailtoFrom(blank)).toBe("");
});

// ══ THE CLAIM GATE ══════════════════════════════════════════════════════════
//
// Four of seven deliverables shipped a falsehood on 07/13 and NOT ONE contained an
// invented NUMBER — the invention was the CLAIM DRAWN BETWEEN sourced numbers. The
// narrator here is handed NO number at all, so it has nothing to draw a relation from;
// `auditClaims` is the fail-closed backstop under that, and it drops a whole paragraph.

test("settledFacts: the ONLY fact the narrator gets is the area's name — and it anchors its numerals", () => {
  expect(settledFacts(null)).toEqual([]);
  const named = settledFacts("Cape Coral");
  expect(named[0].sentence).toBe("The agent's farm area is Cape Coral, in Southwest Florida.");
  expect(named[0].anchors).toEqual([]); // no numeral to anchor → every digit is unanchored
  // A farm area that IS a bare ZIP anchors that one numeral, and nothing else.
  expect(settledFacts("33904")[0].anchors).toEqual(["33904"]);
});

test("gateLetterProse: a paragraph carrying an unanchored number is DROPPED WHOLE", () => {
  const settled = settledFacts("Cape Coral");
  const out = gateLetterProse(
    "I work here.\n\nHomes here sell for $412,000 on average.\n\nJust reply.",
    settled,
  );
  // Not trimmed to the clean sentence — the whole paragraph dies. The narrator was
  // handed no figure, so any figure it produced is invented by construction.
  expect(out).toBe("I work here.\n\nJust reply.");
  expect(out).not.toContain("412");
});

test("gateLetterProse: the ZIP the letter is ABOUT survives; any other numeral does not", () => {
  const settled = settledFacts("33904");
  expect(gateLetterProse("I work in 33904.", settled)).toBe("I work in 33904.");
  expect(gateLetterProse("I work in 33904.\n\nValues rose 8 percent.", settled)).toBe(
    "I work in 33904.",
  );
});

test("gateLetterProse: the four claim SHAPES that shipped — comparison, trajectory, count, sequence", () => {
  const s = settledFacts("Cape Coral");
  // COMPARISON (market-comps inverted one and shipped it as the whole argument)
  expect(gateLetterProse("Homes here sit below the market average.", s)).toBe("");
  // TRAJECTORY (sphere-weekly called a single LEVEL a widening gap)
  expect(gateLetterProse("Prices in Cape Coral are climbing.", s)).toBe("");
  // COUNT (market-pulse wrote "five of those six ZIPs"; it was four)
  expect(gateLetterProse("Most of the homes here are worth more than you think.", s)).toBe("");
  // SEQUENCE (under-contract invented an ordering we hold no dates for)
  expect(gateLetterProse("I called them before the price was cut.", s)).toBe("");
  // MOTIVE (we never hold why anyone did anything)
  expect(gateLetterProse("The sellers here are motivated.", s)).toBe("");
  // ...and an honest paragraph is untouched.
  expect(gateLetterProse("You know me, and I read every reply.", s)).toBe(
    "You know me, and I read every reply.",
  );
});

test("the narrator is TOLD the exact rule the lint enforces (CLAIM_PROHIBITION is printed)", async () => {
  await buildAgentLaunch(ctxFor(canvas()));
  expect(systemSeen).toContain(CLAIM_PROHIBITION);
  expect(systemSeen).toContain("NO NUMBERS");
});

test("THE STRUCTURAL DONE-CONDITION: the narrator receives no raw set, no pair, no figure", async () => {
  await buildAgentLaunch(ctxFor(canvas()));
  // It is told the PLACE and a BOOLEAN. It cannot compare two numbers it was never
  // given two of — the one figure is written into the stats cell in CODE, downstream.
  expect(userSeen).toContain("Cape Coral");
  expect(userSeen).not.toContain("383,900"); // the figure it would have restated
  expect(userSeen).not.toContain("425,000"); // the second figure it could have compared to
  expect(userSeen).not.toContain("2,100"); // the rent index — a third number to relate
  // No numeral of ANY lake figure reaches it. The set does not exist on this path.
  for (const f of LAKE_FIGURES) expect(userSeen).not.toContain(f.value);
  expect(userSeen).toContain("you may not state it, round it, describe it");
});

test("the model's claims are dropped, not shipped — letter, list lines, and subject", async () => {
  const saved = modelReply;
  modelReply = JSON.stringify({
    subject: "Values are up 8% here", // an unanchored number in the subject
    letter:
      "You know me.\n\nHomes here run $412,000 now.\n\nPrices are cooling fast.\n\nI read every reply.",
    next: ["A read each week", "3 listings you should see", "A straight answer"],
  });
  const built = (await buildAgentLaunch(ctxFor(canvas())))!;
  const letter = String(byType(built, "text")[0].props.body);
  // The $ paragraph (unanchored number) AND the "cooling" paragraph (trajectory) are
  // both gone — a digit lint would have caught only the first.
  expect(letter).toBe("You know me.\n\nI read every reply.");
  expect(letter).not.toContain("cooling");
  // The digit-bearing list line is dropped; the clean ones survive.
  expect(byType(built, "list")[0].props.items.map((i) => i.text)).toEqual([
    "A read each week",
    "A straight answer",
  ]);
  // A subject line carrying an unsourced number is not a subject line.
  expect(built.subjectVariants).toBeUndefined();
  modelReply = saved;
});

test("END TO END: no prose that reaches the artifact carries an unsupported claim", async () => {
  // The backstop, asserted on the BUILT DOC — not on a helper in isolation. Every string
  // the model wrote that survives into the deliverable is re-audited here: if any claim
  // shape ever gets through the gate, this fails on the artifact itself.
  const settled = settledFacts("Cape Coral");
  const built = (await buildAgentLaunch(ctxFor(canvas())))!;
  const prose = [
    String(byType(built, "text")[0].props.body),
    ...byType(built, "list").flatMap((b) =>
      b.type === "list" ? b.props.items.map((i) => i.text) : [],
    ),
    ...(built.subjectVariants ?? []),
  ];
  for (const p of prose) expect(auditClaims(p, settled)).toEqual([]);

  // The ONE hard number lives in the stats cell — written in CODE, never in the prose.
  expect(prose.join(" ")).not.toContain("383,900");
  expect(byType(built, "stats")[0].props.stats[0].value).toBe("$383,900");
});

// ── The build ───────────────────────────────────────────────────────────────

test("buildAgentLaunch: NO chart, ever", async () => {
  const doc = (await buildAgentLaunch(ctxFor(canvas())))!;
  expect(doc.blocks.some((b) => b.type === "image" && b.props.kind === "chart")).toBe(false);
  expect(RECIPES["agent-launch"].chart).toBe("none");
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

test("buildAgentLaunch: no figure → the letter is told there is no number to point at", async () => {
  // Element coherence: the stat is an OPEN SLOT (absent from the sent email) whenever
  // the lake holds none of the priority figures — so a letter pointing at "the one
  // number in this note" would point at nothing.
  await buildAgentLaunch(ctxFor(canvas(), "a launch letter about Boise"));
  expect(userSeen).toContain("THERE IS NO NUMBER IN THIS EMAIL");
  expect(userSeen).not.toContain("A single real market figure IS printed");
});

test("buildAgentLaunch: the agent's face is in the SIGNATURE — and there is no second copy", async () => {
  const built = (await buildAgentLaunch(ctxFor(canvasWithHeadshot())))!;
  expect(byType(built, "agent-card")[0].props.photoUrl).toBe(HEADSHOT);
  // NO letterhead portrait block exists at all — it was a DUPLICATE of the signature's
  // face, and being a second block in the letter's band is what created the Outlook
  // ghost table. `AgentCardBlock` is the only component that renders a headshot with a
  // real `width` attribute (96), which is the only thing Outlook's engine obeys.
  expect(byType(built, "image")).toHaveLength(0);
  // ...and the user's own name carries through as the signature (never re-authored).
  expect(byType(built, "agent-card")[0].props.name).toBe("Dani Vero");
});

test("buildAgentLaunch: no headshot → no photo, and NEVER a placeholder box", async () => {
  const built = (await buildAgentLaunch(ctxFor(canvas())))!;
  expect(byType(built, "agent-card")[0].props.photoUrl).toBe("");
  expect(byType(built, "image")).toHaveLength(0);
  // agent-hero would ship a 300px near-black "Agent photo" box to real recipients.
  expect(byType(built, "agent-hero")).toHaveLength(0);
});

test("signatureCard never ships a template's instruction copy to a recipient", async () => {
  // NOT asserted against a seed's CURRENT contents — `default-docs.ts` is a shared file
  // and its factory bio already moved to "" underneath this recipe, which is precisely
  // how a factory-default check goes quietly blind. Assert the INVARIANT instead, against
  // the real placeholder copy the `minimal` seed ships today.
  const doc = canvas();
  doc.blocks.push({
    id: "acp",
    type: "agent-card",
    props: {
      name: DEFAULT_BLOCK_PROPS["agent-card"].name, // "SWFL Data Gulf" — the HOUSE brand
      title: "Your title and brokerage", // ← the `minimal` seed's instruction copy…
      bio: "A short bio that builds trust — years of experience, what makes you different.",
      ctaLabel: "See my listings",
      ctaUrl: "https://example.com",
    },
  });
  const card = byType((await buildAgentLaunch(ctxFor(doc)))!, "agent-card")[0];

  // …and NONE of it survives. Title and bio are account-only: emitted empty, then
  // overwritten by applyBrand with the account's real AGENT_TITLE / AGENT_BIO if it has
  // them (apply-brand.ts:41-42). A factory-default comparison would have passed both of
  // these through — the factory title is "Market Intelligence", not "Your title and…".
  expect(card.props.title).toBe("");
  expect(card.props.bio).toBe("");
  expect(card.props.name).toBe(""); // the HOUSE brand is not an agent's name
  // ONE ask per letter: the reply button. A "Get in touch →" on the signature is a second.
  expect(card.props.ctaLabel).toBe("");
  expect(card.props.ctaUrl).toBe("");
});

test("signatureCard carries the agent's OWN name and phone through untouched", async () => {
  const doc = canvasWithHeadshot(); // agent-card: name "Dani Vero" (what applyBrand landed)
  const card = byType((await buildAgentLaunch(ctxFor(doc)))!, "agent-card")[0];
  expect(card.props.name).toBe("Dani Vero");
  expect(card.props.photoUrl).toBe(HEADSHOT);
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

// ══ THE LAYOUT, PROVEN MECHANICALLY — NOT BY A SCREENSHOT ═══════════════════
//
// A PICTURE THAT LOOKS RIGHT IN A BROWSER IS NOT PROOF FOR AN EMAIL. Chromium strips
// mso conditional comments (they ARE HTML comments), so it is STRUCTURALLY INCAPABLE of
// showing the markup that breaks Outlook. Two defects shipped past two screenshots:
//
//   1. A `<table width="1800">` with three `<td width="600">` — 3× past the 600px
//      canvas — because the no-headshot letter's band (7..14) swallowed the stats (y:9)
//      and the list (y:12): `groupRows` bands by OVERLAP, not equal y.
//   2. The same headshot TWICE (identical src), the letterhead copy sitting in a ghost
//      `<td width="250">` held there only by `max-width` + `aspect-ratio` + `object-fit`
//      — all three ignored by Outlook's Word engine.
//
// So we run the REAL grouper and the REAL compileGrid over BOTH branches and assert on
// the BYTES a recipient's Outlook actually parses. Every block is w=12 in its own band,
// so `compileGrid` never takes its multi-column path and no ghost table can exist.

/** The REAL grouper over a built doc → each visual row's column widths. */
const rowWidths = (doc: EmailDoc): number[][] =>
  groupRows(doc.blocks).map((r) => r.map((e) => e.eff.w));

const BRANCHES: [string, () => EmailDoc][] = [
  ["no headshot (the default path — the one that broke)", canvas],
  ["with a headshot", canvasWithHeadshot],
];

for (const [label, makeCanvas] of BRANCHES) {
  test(`GRID · ${label}: every row is ONE block and sums to <= 12 columns`, async () => {
    const built = (await buildAgentLaunch(ctxFor(makeCanvas())))!;
    const widths = rowWidths(built);
    expect(widths.length).toBeGreaterThan(4); // it really did band into separate rows
    for (const row of widths) {
      expect(row.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(GRID_COLS);
    }
    // ONE block per band. This is the whole defense: `compileGrid` only builds a ghost
    // table for a row of 2+, so a doc that never bands two blocks together can never
    // emit one. A multi-column row added here fails this test immediately.
    expect(widths.every((r) => r.length === 1)).toBe(true);
    // ...and full width, so the canvas shows what the email actually sends (a lone
    // w<12 block renders FULL-BLEED in compileGrid — the canvas would be lying).
    expect(widths.every((r) => r[0] === GRID_COLS)).toBe(true);
  });

  test(`SENT HTML · ${label}: zero ghost tables, zero ghost <td>s, no width="1800"`, async () => {
    // The real send path: render-email-doc.ts routes any laid-out doc through
    // compileGrid. This is the string a recipient's Outlook parses.
    const built = (await buildAgentLaunch(ctxFor(makeCanvas())))!;
    const html = await compileGrid(built);

    // A ghost table is the ONLY thing that carries a PIXEL width — every shell table
    // react-email emits is width="100%". There must be none, at any width.
    expect([...html.matchAll(/<table[^>]*\swidth="(\d+)"/g)].map((m) => m[1])).toEqual([]);
    expect([...html.matchAll(/<td[^>]*\swidth="(\d+)"/g)].map((m) => m[1])).toEqual([]);
    expect(html).not.toContain('width="1800"');

    // ...and assert on the ghost row's exact SIGNATURE (compile-grid.ts `ghostRowHtml`),
    // because `[if mso]` on its own is NOT a defect: the msoFontPin <style> and the
    // Button's mso spacer <i> are both legitimate conditionals that every one of these
    // emails carries. What must not exist is a conditional TABLE or a conditional <td>.
    expect(html).not.toContain("<!--[if mso]><table");
    expect(html).not.toContain("<!--[if mso]><td");
    // The Cerberus column div (`display:inline-block;width:100%;max-width:NNNpx`) is
    // emitted only inside a ghost row. (Bare `display:inline-block` is NOT a signal —
    // react-email's Button uses it for the CTA pill.)
    expect(html).not.toMatch(/display:inline-block;width:100%;max-width:\d+px/);
  });
}

test("SENT HTML: the agent's face appears EXACTLY ONCE (it shipped twice on 07/13)", async () => {
  const built = (await buildAgentLaunch(ctxFor(canvasWithHeadshot())))!;
  const html = await compileGrid(built);

  // COUNT THE FACE, NOT THE IMAGES. The header carries a brand logo, so an "<img> count"
  // assertion would have sailed straight past the duplicate headshot — which is exactly
  // how it shipped: two identical <img src> in one letter, and the screenshot showed both.
  const faces = [...html.matchAll(/<img[^>]*>/g)]
    .map((m) => m[0])
    .filter((t) => t.includes(HEADSHOT));
  expect(faces).toHaveLength(1);
  // ...and it carries the HTML width ATTRIBUTE — the one width Outlook's Word engine
  // obeys. `max-width` / `aspect-ratio` / `object-fit` are all ignored there, which is
  // exactly why the letterhead copy (which had only those) could not be trusted.
  expect(faces[0]).toMatch(/\swidth="?96"?/);
  expect(faces[0]).not.toContain("object-fit");

  // No headshot on the canvas → the face appears ZERO times. Never a placeholder box.
  const bare = await compileGrid((await buildAgentLaunch(ctxFor(canvas())))!);
  expect(bare).not.toContain(HEADSHOT);
  expect(bare).not.toContain("Agent photo"); // AgentHeroBlock's near-black placeholder
});
