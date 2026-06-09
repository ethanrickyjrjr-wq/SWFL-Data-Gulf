import { test, expect, mock } from "bun:test";
import { buildGroundingContext } from "@/lib/highlighter/grounding";
import { RULES_OF_ENGAGEMENT } from "@/refinery/lib/rules-of-engagement.mts";

// Capture the last recordAsk meta so gap-logging can be asserted.
type AskMeta = {
  report_id: string;
  fact?: string;
  question: string;
  reach: string[];
  answered: boolean;
  needed_components?: string[];
};
let lastAsk: AskMeta | null = null;

mock.module("@/refinery/agents/anthropic.mts", () => ({
  TRIAGE_MODEL: "claude-haiku-4-5",
  agentsAreMocked: () => false,
  getAnthropic: () => ({
    messages: {
      stream: () => ({
        async *[Symbol.asyncIterator]() {},
        textStream: (async function* () {
          yield "Median in 34102 is ";
          yield "$1.85M [Naples housing].";
        })(),
      }),
    },
  }),
}));
mock.module("@/lib/highlighter/meter", () => ({
  recordUse: async () => 1,
  recordAsk: async (meta: AskMeta) => {
    lastAsk = meta;
  },
  weeklyCount: async () => 0,
  capEnabled: () => false,
}));

const { POST } = await import("./route");

// The dead-end phrases the doctrine bans from the converse system prompt. Demoted
// from a runtime answer-parser to this regression guard (Task 4).
const DEAD_END = [
  "don't have that data",
  "no data available",
  "can't find that",
  "cannot find that",
];

test("converse system prompt never instructs a dead-end (regression guard)", () => {
  const sys = buildGroundingContext({
    rules: RULES_OF_ENGAGEMENT,
    gazetteer: "G",
    blocks: [],
  });
  const lc = sys.toLowerCase();
  expect(DEAD_END.some((p) => lc.includes(p))).toBe(false);
});

test("streams grounded text for a known report", async () => {
  const req = new Request("https://x/api/converse", {
    method: "POST",
    body: JSON.stringify({
      report_id: "master",
      fact: "median price",
      question: "what is 34102 median?",
    }),
  });
  const res = await POST(req);
  expect(res.status).toBe(200);
  const body = await res.text();
  expect(body).toContain("$1.85M");
});

test("404 on a slug with no brain file (not 400 — viewing-gated, not catalog-gated)", async () => {
  const req = new Request("https://x/api/converse", {
    method: "POST",
    body: JSON.stringify({
      report_id: "nope-not-real",
      fact: "x",
      question: "y",
    }),
  });
  const res = await POST(req);
  expect(res.status).toBe(404);
});

test("400 on a missing report_id", async () => {
  const req = new Request("https://x/api/converse", {
    method: "POST",
    body: JSON.stringify({ question: "y" }),
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
});

test("a need-bearing slug logs needed_components and answered=false", async () => {
  lastAsk = null;
  const req = new Request("https://x/api/converse", {
    method: "POST",
    body: JSON.stringify({
      report_id: "master",
      fact: "$27.51",
      slug: "asking_rent_psf_median",
      question: "break it down",
    }),
  });
  const res = await POST(req);
  await res.text(); // drain the stream so the start() body runs recordAsk
  const ask = lastAsk as AskMeta | null;
  expect(ask?.answered).toBe(false);
  expect(ask?.needed_components).toContain("Property taxes");
});

test("no slug => floor path: answered=true, no logged components", async () => {
  lastAsk = null;
  const req = new Request("https://x/api/converse", {
    method: "POST",
    body: JSON.stringify({
      report_id: "master",
      fact: "median price",
      question: "what is it?",
    }),
  });
  const res = await POST(req);
  await res.text();
  const ask = lastAsk as AskMeta | null;
  expect(ask?.answered).toBe(true);
  expect(ask?.needed_components).toEqual([]);
});
