import { test, expect, mock, afterAll } from "bun:test";
import {
  tryParsePatch,
  dropSuperseded,
  unfilledPlaceholderMiss,
  cityZipsFor,
  docSkeleton,
  applyPatch,
  unfilledFigureSlots,
} from "./build-doc";
import { BlockContentPatchSchema } from "./doc/schema";
import type { EmailDoc } from "./doc/types";
import type { MarketFigure } from "@/lib/email/market-context";
import * as anthropicModule from "@/refinery/agents/anthropic.mts";
import * as chartForQuestionModule from "@/lib/assistant/chart-for-question";
import { SEED_DOCS } from "./doc/default-docs";

// mock.module is process-global (no per-file isolation) — snapshot + restore, same
// pattern as build-doc-listing.test.ts / lib/assistant/report-path.test.ts. Stubs the
// author model call so this integration test stays fully offline/deterministic, and
// stubs chart-for-question so buildPromptChart's ALWAYS-tries-a-fallback-brain path
// (chart-for-question.ts's CHART_FALLBACKS) never reaches the real PNG-render/upload
// step. authorDoc is called with no `scope`, so the lake-figure loaders
// (loadMarketFigures/loadLifecycleDigest/loadAddressFigures) short-circuit on their
// own `!scope?.value` guards — no DB access needed there.
const anthropicOrig = { ...anthropicModule };
const chartForQuestionOrig = { ...chartForQuestionModule };
const fetchOrig = globalThis.fetch;
afterAll(() => {
  mock.module("@/refinery/agents/anthropic.mts", () => anthropicOrig);
  mock.module("@/lib/assistant/chart-for-question", () => chartForQuestionOrig);
  globalThis.fetch = fetchOrig;
});
globalThis.fetch = (async () => {
  throw new Error("network disabled in build-doc.test.ts");
}) as typeof fetch;
mock.module("@/lib/assistant/chart-for-question", () => ({
  buildChartForQuestion: async () => null,
}));

// The authored payload the mocked model "returns" — a clean text block (so the
// no-invention/voiceGuard repair loop never triggers) plus a subject_variants entry
// carrying a banned corporate-AI tell, proving the variant clean runs on the
// UNCONDITIONAL path (right before finalParse), not just inside the repair branch.
const AUTHORED_WITH_TELL = {
  blocks: [{ type: "text", body: "The market held steady again this period." }],
  subject_variants: ["Don't hesitate to see your new report", "Your market update"],
};
mock.module("@/refinery/agents/anthropic.mts", () => ({
  ...anthropicOrig,
  getAnthropic: () => ({
    messages: {
      create: async () => ({
        content: [
          { type: "tool_use", id: "t1", name: "author_email_doc", input: AUTHORED_WITH_TELL },
        ],
      }),
    },
  }),
}));

const { authorDoc } = await import("./build-doc");

test("authorDoc voice-cleans subject variants the same way it cleans body prose", async () => {
  const current = SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();
  const result = await authorDoc({
    prompt: "Write a friendly market update email with a strong subject line.",
    rawDoc: current,
  });
  expect(result.payload.applied).toBe(true);
  const doc = result.payload.doc as { subjectVariants?: string[] };
  expect(doc.subjectVariants?.length).toBeGreaterThan(0);
  expect(doc.subjectVariants?.[0]).not.toMatch(/don.t hesitate/i);
  expect(doc.subjectVariants?.[0]).toBe("See your new report");
  expect(doc.subjectVariants?.[1]).toBe("Your market update");
});

// CHOKEPOINT GUARD: an unfilled recipe [[blank]] must NEVER reach the model. Every
// build path (empty hero fill, recipe auto-built before its address popup, a bot
// POSTing the raw recipe) funnels through buildContentDoc/authorDoc, which call
// this first. It stops with an ask instead of shipping the literal "[[...]]" token
// (the "word the AI didn't know") and building unscoped, place-less content.
test("unfilledPlaceholderMiss stops a prompt still holding a [[blank]]", () => {
  const miss = unfilledPlaceholderMiss(
    "Build a monthly market-pulse email for [[your city or ZIP]] — every ZIP's move.",
  );
  expect(miss).not.toBeNull();
  expect(miss!.payload.applied).toBe(false);
  expect(miss!.payload.message).toContain("your city or ZIP");
  // The literal placeholder token must NEVER be what ships to the author.
  expect(miss!.payload.doc).toBeUndefined();
});

test("unfilledPlaceholderMiss passes a real, filled prompt through (null = build)", () => {
  expect(
    unfilledPlaceholderMiss(
      "Build a monthly market-pulse email for Cape Coral — every ZIP's move.",
    ),
  ).toBeNull();
  expect(unfilledPlaceholderMiss("build me anything")).toBeNull();
});

// The resilient content-patch parser: one over-limit field must NOT nuke the whole
// fill (the bug that returned "try rephrasing" on a real Sonnet response with 4 stats).

test("extracts JSON from a ```json-fenced response", () => {
  const r = tryParsePatch('```json\n{ "b1": { "prose": "hi" } }\n```');
  expect(r).toEqual({ b1: { prose: "hi" } });
});

test("clamps a too-long stats array to 3 instead of rejecting the whole patch", () => {
  const r = tryParsePatch(
    JSON.stringify({
      b1: {
        stats: [
          { value: "1", label: "a" },
          { value: "2", label: "b" },
          { value: "3", label: "c" },
          { value: "4", label: "d" },
          { value: "5", label: "e" },
        ],
      },
    }),
  );
  expect(r).not.toBeNull();
  expect(r!.b1.stats!.length).toBe(3);
});

test("keeps valid blocks and drops only the unsalvageable one", () => {
  // b2's value blows past the 24-char max → b2 dropped, b1 kept (never nuke everything)
  const r = tryParsePatch(JSON.stringify({ b1: { prose: "good" }, b2: { value: "x".repeat(50) } }));
  expect(r).toEqual({ b1: { prose: "good" } });
});

test("strips a style/link key but keeps the block (no-restyle held)", () => {
  const r = tryParsePatch(
    JSON.stringify({ b1: { prose: "ok", bgColor: "#000", url: "http://x" } }),
  );
  expect(r).toEqual({ b1: { prose: "ok" } });
});

test("returns null when there is no JSON object at all", () => {
  expect(tryParsePatch("Sorry, I can't help with that.")).toBeNull();
});

// FRESHNESS: a stale held figure that the web lane refreshed must be DROPPED from the
// held context, so the AI can't see both the stale April number and the fresh web number
// and pick the wrong one. Match is by exact label (the forced request reuses the figure's
// label, so the verified web point carries the same label back).
const figs: MarketFigure[] = [
  {
    key: "home_value",
    label: "Median home value — Cape Coral",
    value: "$390,000",
    source: "Zillow ZHVI",
    as_of: "04/30/2026",
  },
  {
    key: "rent",
    label: "Typical asking rent",
    value: "$2,100/mo",
    source: "Zillow ZORI",
    as_of: "05/31/2026",
  },
  {
    key: "population",
    label: "Population",
    value: "204,000",
    source: "U.S. Census ACS",
    as_of: "12/31/2025",
  },
];

test("dropSuperseded removes held figures the web refreshed, keeps the rest", () => {
  const survivors = dropSuperseded(figs, ["Median home value — Cape Coral"]);
  expect(survivors.map((f) => f.key)).toEqual(["rent", "population"]);
});

test("dropSuperseded is a no-op when nothing was refreshed", () => {
  expect(dropSuperseded(figs, [])).toHaveLength(3);
});

test("dropSuperseded matches by exact label only (no partial collisions)", () => {
  // "Population" must not drop because of an unrelated "Median home value" refresh
  const survivors = dropSuperseded(figs, ["Median home value"]); // not an exact label
  expect(survivors).toHaveLength(3);
});

// cityZipsFor: the fail-closed allowlist gate for the ZIP-by-ZIP city chart. Only an
// allowlisted, USPS+Mapbox-verified multi-ZIP city returns its ZIP set; everything
// else (single-ZIP place, Estero, explicit scope, undefined) → undefined → the
// existing single-scope chart, never a wrong-city chart.
test("cityZipsFor returns the ZIP list for an allowlisted multi-ZIP city", () => {
  const zips = ["33904", "33914", "33990", "33991", "33993", "33909"];
  expect(cityZipsFor({ place: "Cape Coral", zip: "33904", zips })).toEqual(zips);
});

test("cityZipsFor returns undefined for Estero (single ZIP, corrected 07/06/2026)", () => {
  expect(cityZipsFor({ place: "Estero", zip: "33928", zips: ["33928"] })).toBeUndefined();
});

test("cityZipsFor returns undefined for a single-ZIP place, an off-list place, and undefined", () => {
  expect(cityZipsFor({ place: "Sanibel", zip: "33957", zips: ["33957"] })).toBeUndefined();
  // Off the allowlist even though it has multiple zips → fail-closed.
  expect(
    cityZipsFor({ place: "Somewhere", zip: "00001", zips: ["00001", "00002"] }),
  ).toBeUndefined();
  expect(cityZipsFor(undefined)).toBeUndefined();
});

// ── docSkeleton: the AI's VIEW of the doc ───────────────────────────────────
// The held, number-bearing fields (metricValue/price/…) sit outside the content-patch
// allowlist so the AI can never WRITE them — but they were also missing from the AI's
// READ, so a metric-card serialized as blank and the writer composed prose about an
// email whose headline numbers it couldn't see. Read yes, write no (07/13/2026).

function docWith(blocks: EmailDoc["blocks"]): EmailDoc {
  return { globalStyle: {} as EmailDoc["globalStyle"], blocks };
}

test("docSkeleton SHOWS the AI a metric card's held value (it used to serialize blank)", () => {
  const skeleton = docSkeleton(
    docWith([
      {
        id: "m1",
        type: "metric-card",
        props: {
          metricValue: "645",
          metricLabel: "Active Inventory",
          rankText: "#2 of 54 SWFL ZIPs",
        },
      },
    ] as unknown as EmailDoc["blocks"]),
  );
  expect(skeleton).toContain("645");
  expect(skeleton).toContain("Active Inventory");
  expect(skeleton).toContain("#2 of 54 SWFL ZIPs");
  expect(skeleton).toContain("READ ONLY");
});

test("docSkeleton shows a listing's held price so prose can talk about the home", () => {
  const skeleton = docSkeleton(
    docWith([
      { id: "l1", type: "listing", props: { price: "$525,000", beds: "3", address: "12 Gulf Bl" } },
    ] as unknown as EmailDoc["blocks"]),
  );
  expect(skeleton).toContain("$525,000");
  expect(skeleton).toContain("12 Gulf Bl");
});

test("a USER-EDITED card value is what the AI sees — its prose tracks the user's number", () => {
  // BlockInspector writes metricValue directly (lane 4: the user's own figure).
  const skeleton = docSkeleton(
    docWith([
      { id: "m1", type: "metric-card", props: { metricValue: "$1.2M", metricLabel: "My Listing" } },
    ] as unknown as EmailDoc["blocks"]),
  );
  expect(skeleton).toContain("$1.2M");
  expect(skeleton).toContain("My Listing");
});

test("READ does not become WRITE — a patch aimed at a held figure is still stripped", () => {
  const patch = BlockContentPatchSchema.parse({
    body: "new prose",
    metricValue: "$999K", // the AI trying to rewrite a held number
    price: "$1",
  });
  expect(patch.body).toBe("new prose");
  expect(patch).not.toHaveProperty("metricValue");
  expect(patch).not.toHaveProperty("price");

  // …and applying it leaves the held value untouched on the block.
  const doc = docWith([
    { id: "m1", type: "metric-card", props: { metricValue: "645", body: "old" } },
  ] as unknown as EmailDoc["blocks"]);
  const out = applyPatch(doc, { m1: patch }) as EmailDoc;
  const props = out.blocks[0].props as Record<string, unknown>;
  expect(props.metricValue).toBe("645");
  expect(props.body).toBe("new prose");
});

test("a block with no held figures gets no READ ONLY annotation (no noise)", () => {
  const skeleton = docSkeleton(
    docWith([
      { id: "t1", type: "text", props: { body: "just prose" } },
    ] as unknown as EmailDoc["blocks"]),
  );
  expect(skeleton).toContain("just prose");
  expect(skeleton).not.toContain("READ ONLY");
});

// ── Open slots: the $0 regression (deliverable ae316e1f, 07/16/2026) ─────────
// A hero shipped with value:"" — the AI quoted the real $299,650 median in its
// prose but never filled the headline slot, because docSkeleton OMITTED empty
// fields: an open slot was invisible to the model, and nothing checked it got
// filled. The editor then rendered the empty value as a "$0" placeholder.

test("docSkeleton marks an EMPTY (open-slot) field explicitly instead of hiding it", () => {
  const skeleton = docSkeleton(
    docWith([
      {
        id: "h1",
        type: "hero",
        props: { kicker: "Cape Coral Market Snapshot", value: "", label: "500 active listings" },
      },
    ] as unknown as EmailDoc["blocks"]),
  );
  expect(skeleton).toContain("OPEN SLOTS");
  expect(skeleton).toContain("value");
  expect(skeleton).toContain("Cape Coral Market Snapshot"); // filled fields still shown
});

test("docSkeleton stays quiet for a block with no empty fields (no noise)", () => {
  const skeleton = docSkeleton(
    docWith([
      { id: "h1", type: "hero", props: { kicker: "K", value: "$299,650", label: "L" } },
    ] as unknown as EmailDoc["blocks"]),
  );
  expect(skeleton).not.toContain("OPEN SLOTS");
});

test("an undefined field is NOT an open slot — only an authored empty string is", () => {
  // The SLOT RULE (lib/email/CLAUDE.md): "" is a deliberate open slot; a key the
  // block never carried is simply not part of its design.
  const skeleton = docSkeleton(
    docWith([
      { id: "t1", type: "text", props: { body: "prose" } },
    ] as unknown as EmailDoc["blocks"]),
  );
  expect(skeleton).not.toContain("OPEN SLOTS");
});

test("unfilledFigureSlots reports a hero value that was empty before the patch and still is", () => {
  const before = docWith([
    { id: "h1", type: "hero", props: { kicker: "K", value: "", label: "L" } },
    { id: "s1", type: "stats", props: { stats: [{ value: "", label: "Median price" }] } },
  ] as unknown as EmailDoc["blocks"]);
  const after = before; // nothing filled
  const missing = unfilledFigureSlots(before, after);
  expect(missing.length).toBe(2);
  expect(missing.join(" ")).toContain("headline");
  expect(missing.join(" ")).toContain("Median price");
});

test("unfilledFigureSlots is empty when the patch filled the figures", () => {
  const before = docWith([
    { id: "h1", type: "hero", props: { kicker: "K", value: "", label: "L" } },
  ] as unknown as EmailDoc["blocks"]);
  const after = docWith([
    { id: "h1", type: "hero", props: { kicker: "K", value: "$299,650", label: "L" } },
  ] as unknown as EmailDoc["blocks"]);
  expect(unfilledFigureSlots(before, after)).toEqual([]);
});

test("unfilledFigureSlots ignores slots that were already filled before the build", () => {
  const before = docWith([
    { id: "h1", type: "hero", props: { value: "$500,000" } },
  ] as unknown as EmailDoc["blocks"]);
  expect(unfilledFigureSlots(before, before)).toEqual([]);
});

test("docSkeleton SHOWS a list's rows and a multi-column's cards (stats was the only array it saw)", () => {
  const skeleton = docSkeleton(
    docWith([
      {
        id: "li1",
        type: "list",
        props: { title: "Top ZIPs", items: [{ lead: "33914", text: "525,000 median ask" }] },
      },
      {
        id: "mc1",
        type: "multi-column",
        props: {
          columns: [
            { heading: "Buyers", body: "more room to negotiate" },
            { heading: "Sellers", body: "price to the comps" },
          ],
        },
      },
    ] as unknown as EmailDoc["blocks"]),
  );
  expect(skeleton).toContain("33914");
  expect(skeleton).toContain("525,000 median ask");
  expect(skeleton).toContain("Buyers");
  expect(skeleton).toContain("price to the comps");
});
