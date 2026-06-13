import { test, expect, mock } from "bun:test";

mock.module("@/refinery/agents/anthropic.mts", () => ({
  TRIAGE_MODEL: "claude-haiku-4-5",
  getAnthropic: () => ({
    messages: {
      stream: () => ({
        async *[Symbol.asyncIterator]() {},
        textStream: (async function* () {
          yield "We track flood risk, permits, ";
          yield "and prices across Southwest Florida.";
        })(),
      }),
    },
  }),
}));
// Mutable cost-guard state so one file covers both cap-disabled and cap-tripped.
const welcomeState = { weekly: 0, capEnabled: false, clientId: "cid-1" };
mock.module("@/lib/welcome/chat-usage", () => ({
  recordWelcomeChat: async () => {},
  welcomeCapEnabled: () => welcomeState.capEnabled,
  welcomeChatWeeklyCount: async () => welcomeState.weekly,
}));
mock.module("@/lib/highlighter/meter", () => ({
  clientIdFromRequest: () => welcomeState.clientId,
}));

const { POST, WELCOME_SYSTEM } = await import("./route");

test("system prompt forbids inventing a SWFL number and leads with the recurring-email hook", () => {
  const lc = WELCOME_SYSTEM.toLowerCase();
  expect(lc).toContain("never"); // no-invention guardrail intact
  expect(lc).toContain("auto-email"); // leads with the recurring client-feed hook, not "sign up"
  expect(lc).toContain("client"); // the value is mailing THEIR clients
  expect(lc).not.toContain("freshness_token"); // un-grounded: no payload mechanics leak
});

test("streams the explainer text", async () => {
  const req = new Request("https://x/api/welcome/chat", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "what can you do?" }] }),
  });
  const res = await POST(req);
  expect(res.status).toBe(200);
  const body = await res.text();
  expect(body).toContain("Southwest Florida");
  expect(body).toContain('"done":true');
});

test("400 on empty/non-user-last messages", async () => {
  const req = new Request("https://x/api/welcome/chat", {
    method: "POST",
    body: JSON.stringify({ messages: [] }),
  });
  expect((await POST(req)).status).toBe(400);
});

test("400 on bad json", async () => {
  const req = new Request("https://x/api/welcome/chat", { method: "POST", body: "{not json" });
  expect((await POST(req)).status).toBe(400);
});

// --- Cost guards: per-message + aggregate bounds, and the weekly cap -------------

test("400 when a single message exceeds the per-message bound", async () => {
  const req = new Request("https://x/api/welcome/chat", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "x".repeat(4001) }] }),
  });
  expect((await POST(req)).status).toBe(400);
});

test("400 when the model-bound slice exceeds the aggregate bound", async () => {
  // 12 messages (the whole slice), each under the per-message cap, summing > 16000.
  const msgs = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? "assistant" : "user",
    content: "y".repeat(1400),
  }));
  msgs[msgs.length - 1].role = "user"; // last must be user
  const req = new Request("https://x/api/welcome/chat", {
    method: "POST",
    body: JSON.stringify({ messages: msgs }),
  });
  expect((await POST(req)).status).toBe(400);
});

test("over the weekly cap → graceful SSE message, model never streams", async () => {
  const prev = process.env.WELCOME_CHAT_FREE_WEEKLY_CAP;
  process.env.WELCOME_CHAT_FREE_WEEKLY_CAP = "5";
  welcomeState.capEnabled = true;
  welcomeState.weekly = 5;
  welcomeState.clientId = "cid-over";
  try {
    const req = new Request("https://x/api/welcome/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "what can you do?" }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("hit this week's limit");
    expect(body).not.toContain("Southwest Florida"); // model never streamed
  } finally {
    process.env.WELCOME_CHAT_FREE_WEEKLY_CAP = prev;
    welcomeState.capEnabled = false;
    welcomeState.weekly = 0;
    welcomeState.clientId = "cid-1";
  }
});
