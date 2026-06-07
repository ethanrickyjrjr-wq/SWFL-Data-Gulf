import { test, expect, mock } from "bun:test";

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
  weeklyCount: async () => 0,
  capEnabled: () => false,
}));

const { POST } = await import("./route");

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
