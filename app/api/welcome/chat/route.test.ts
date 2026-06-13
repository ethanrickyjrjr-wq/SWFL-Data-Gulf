import { test, expect, mock } from "bun:test";
import type { LocationDossier } from "@/lib/zip-dossier";

// Capture the system prompt handed to Haiku + a sentinel proving the model streamed.
const captured: { system?: string } = {};
const MODEL_SENTINEL = "We track flood risk"; // appears only when the model actually streams
mock.module("@/refinery/agents/anthropic.mts", () => ({
  TRIAGE_MODEL: "claude-haiku-4-5",
  getAnthropic: () => ({
    messages: {
      stream: (args: { system?: string }) => {
        captured.system = args?.system;
        return {
          async *[Symbol.asyncIterator]() {},
          textStream: (async function* () {
            yield "We track flood risk, permits, ";
            yield "and prices across Southwest Florida.";
          })(),
        };
      },
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
// Mock the guarded fan-out so route tests never read real brains/*.md.
const guardState: { result: { dossier?: LocationDossier; capped: boolean; fromCache: boolean } } = {
  result: { capped: false, fromCache: false },
};
mock.module("@/lib/welcome/dossier-cache", () => ({
  assembleGuardedDossier: async () => guardState.result,
}));

function dossierWith(lines: LocationDossier["lines"]): LocationDossier {
  return {
    resolved_as: "zip",
    zip: "33913",
    in_scope: true,
    resolution: null,
    lines,
    freshness_tokens: { "housing-swfl": "SWFL-7421-v9-20260601" },
    coverage_caveats: [],
  };
}

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

// --- Grounded path -----------------------------------------------------------

const post = (content: string) =>
  POST(
    new Request("https://x/api/welcome/chat", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content }] }),
    }),
  );

test("an in-scope ZIP grounds Haiku on the real dossier (cited, no-math floor, clean source)", async () => {
  captured.system = undefined;
  guardState.result = {
    capped: false,
    fromCache: false,
    dossier: dossierWith([
      {
        brain_id: "housing-swfl",
        domain: "real-estate",
        grain: "zip",
        coverage_label: "ZIP 33913",
        is_true_zip: true,
        text: "**Median value** — $512,000.\n\nSource: Redfin Data Center weekly metrics",
        source_citation: "Redfin Data Center weekly metrics",
        source_url: "https://www.redfin.com",
      },
    ]),
  };
  const res = await post("what's the housing read for 33913?");
  const body = await res.text();
  expect(body).toContain(MODEL_SENTINEL); // the model streamed (grounded answer)
  // the dossier + guardrails reached the system prompt
  expect(captured.system).toContain("$512,000");
  expect(captured.system).toContain("Source: redfin.com"); // cleaned, not the verbose citation
  expect(captured.system).toContain("arithmetic"); // no-math floor
  expect(captured.system).toContain("ZIP 33913 ="); // ground truth pinned, ZIP not raw-interpolated
});

test("an out-of-scope ZIP → honest gap, no fetch, no model", async () => {
  const res = await post("what about 90210?");
  const body = await res.text();
  expect(body).toContain("outside the six Southwest Florida counties");
  expect(body).not.toContain(MODEL_SENTINEL); // model never streamed
});

test("in-scope ZIP with no covering reads → honest no-coverage line, no model", async () => {
  guardState.result = {
    capped: false,
    fromCache: false,
    dossier: { ...dossierWith([]), lines: [] },
  };
  const res = await post("anything for 33913?");
  const body = await res.text();
  expect(body).toContain("No covering reads");
  expect(body).not.toContain(MODEL_SENTINEL);
});

test("daily ceiling tripped → busy message, no model", async () => {
  guardState.result = { capped: true, fromCache: false };
  const res = await post("housing in 33913?");
  const body = await res.text();
  expect(body).toContain("paused live reads");
  expect(body).not.toContain(MODEL_SENTINEL);
});
