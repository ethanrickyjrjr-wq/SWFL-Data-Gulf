// lib/email/voice-wiring.test.ts — THE END-TO-END CLAIM: picking a voice CHANGES
// the build. Not "the preset module works" (voice-presets.test.ts) — that suite was
// green while the picker was wired to nothing (second-order finding
// `voice_presets_not_consumed`, 08/01/2026: recipeId flowed shell → API → stopped).
// These tests fail whenever the pick has no effect on what the fill model is told,
// which is exactly the failure the green unit suite could not see.

import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import * as anthropicModule from "@/refinery/agents/anthropic.mts";
import * as chartForQuestionModule from "@/lib/assistant/chart-for-question";
import { SEED_DOCS } from "./doc/default-docs";

// mock.module is process-global (no per-file isolation) — snapshot + restore, same
// pattern as build-doc.test.ts. Model + chart stubbed so the run is fully offline;
// builds carry no `scope`, so the lake-figure loaders short-circuit on their own.
const anthropicOrig = { ...anthropicModule };
const chartForQuestionOrig = { ...chartForQuestionModule };
const fetchOrig = globalThis.fetch;
afterAll(() => {
  mock.module("@/refinery/agents/anthropic.mts", () => anthropicOrig);
  mock.module("@/lib/assistant/chart-for-question", () => chartForQuestionOrig);
  globalThis.fetch = fetchOrig;
});
globalThis.fetch = (async () => {
  throw new Error("network disabled in voice-wiring.test.ts");
}) as typeof fetch;
mock.module("@/lib/assistant/chart-for-question", () => ({
  buildChartForQuestion: async () => null,
}));

// Capture every system prompt the (mocked) fill model receives. The response is a
// deliberately empty patch — these tests assert what the model was TOLD, not what
// it said back.
let capturedSystems: string[] = [];
mock.module("@/refinery/agents/anthropic.mts", () => ({
  ...anthropicOrig,
  getAnthropic: () => ({
    messages: {
      create: async (args: { system?: string }) => {
        capturedSystems.push(String(args.system ?? ""));
        return { content: [{ type: "text", text: "{}" }], stop_reason: "end_turn" };
      },
    },
  }),
}));

beforeEach(() => {
  capturedSystems = [];
});

// Late imports so the mocks above are what build-doc binds to.
const { buildContentDoc, authorDoc } = await import("./build-doc");

const seedDoc = () => SEED_DOCS.find((s) => s.id === "market-spotlight")!.build();

// Distinctive phrases that exist ONLY inside the agent-voice presets' guidance text.
const NEIGHBOR_MARK = "NEIGHBORHOOD AGENT";
const LUXURY_MARK = "LUXURY SPECIALIST";
const VOICE_HEADER = "VOICE —";

test("fill lane: an agent-voice pick reaches the fill model's system prompt", async () => {
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
    recipeId: "neighborhood-agent",
  });
  expect(capturedSystems.length).toBeGreaterThan(0);
  expect(capturedSystems.some((s) => s.includes(NEIGHBOR_MARK))).toBe(true);
});

test("fill lane: a RETIRED editorial id still lands on its agent voice end-to-end (FM2)", async () => {
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
    recipeId: "editorial-letter", // saved pre-08/10 brand blobs hold this
  });
  expect(capturedSystems.some((s) => s.includes(NEIGHBOR_MARK))).toBe(true);
});

test("fill lane: plain (and absent) pick adds NO voice section — byte-identical builds", async () => {
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
    recipeId: "plain",
  });
  const plainSystems = [...capturedSystems];
  capturedSystems = [];
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
  });
  expect(plainSystems.length).toBeGreaterThan(0);
  for (const s of [...plainSystems, ...capturedSystems]) {
    expect(s).not.toContain(VOICE_HEADER);
    expect(s).not.toContain(NEIGHBOR_MARK);
  }
  // The pick must be the ONLY difference: plain and absent produce the same prompts.
  expect(capturedSystems).toEqual(plainSystems);
});

test("fill lane: the pick is a real difference — same build, different voice, different prompt", async () => {
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
    recipeId: "plain",
  });
  const plainSystems = [...capturedSystems];
  capturedSystems = [];
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
    recipeId: "neighborhood-agent",
  });
  expect(capturedSystems).not.toEqual(plainSystems);
});

test("author lane: a keyless organic ask carries the pick through default-grid's sourced fill", async () => {
  await authorDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
    recipeId: "luxury-specialist",
  });
  expect(capturedSystems.some((s) => s.includes(LUXURY_MARK))).toBe(true);
});

test("stale legacy ids degrade to plain — no voice section, never a throw (FM4)", async () => {
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
    recipeId: "monthly-newsletter", // type-shaped legacy id: structure, not voice
  });
  expect(capturedSystems.length).toBeGreaterThan(0);
  for (const s of capturedSystems) expect(s).not.toContain(VOICE_HEADER);
});

// ── GROUNDING WIRING (ONE AI, TWO FEEDS — 08/12/2026) ────────────────────────
// Same claim shape as the voice tests above, for the same reason: a green
// build-grounding.test.ts proves the PREFIX COMPOSES and says nothing about whether
// it reaches the model. `voice_presets_not_consumed` is the precedent — recipeId
// flowed shell → API → stopped, under a fully green unit suite. "Built, not wired"
// is this repo's most repeated failure; these are the tests that can see it.

test("grounding reaches the fill model's system prompt", async () => {
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
    grounding: "WHAT YOU ARE WORKING ON — GROUNDING_WIRING_MARK",
  });
  expect(capturedSystems.length).toBeGreaterThan(0);
  expect(capturedSystems.some((s) => s.includes("GROUNDING_WIRING_MARK"))).toBe(true);
});

test("grounding is PREPENDED — it sits ahead of the writer instructions, for caching", async () => {
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
    grounding: "GROUNDING_WIRING_MARK",
  });
  const s = capturedSystems.find((x) => x.includes("GROUNDING_WIRING_MARK"))!;
  expect(s.indexOf("GROUNDING_WIRING_MARK")).toBeLessThan(
    s.indexOf("You are an email content writer"),
  );
});

test("no grounding = byte-identical system prompt (the prefix is additive only)", async () => {
  await buildContentDoc({
    prompt: "a short note about how the season is going",
    rawDoc: seedDoc(),
  });
  const without = [...capturedSystems];
  expect(without.length).toBeGreaterThan(0);
  for (const s of without) expect(s).not.toContain("WHAT YOU ARE WORKING ON");
  expect(without.some((s) => s.startsWith("You are an email content writer"))).toBe(true);
});
