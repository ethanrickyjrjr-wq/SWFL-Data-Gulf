import { test, expect } from "bun:test";
import { processInboundReply, type InboundDeps, type InboundEvent } from "./process-inbound";

const TOKEN = "deadbeef00112233";
const REPLY_DOMAIN = "reply.example.com";

// A spy-able deps factory: records what was sent, with sensible defaults.
function makeDeps(over: Partial<InboundDeps> = {}): {
  deps: InboundDeps;
  sent: { autoReplies: number; alerts: number; events: number };
} {
  const sent = { autoReplies: 0, alerts: 0, events: 0 };
  const deps: InboundDeps = {
    replyDomain: REPLY_DOMAIN,
    now: new Date("2026-06-13T12:00:00Z"),
    log: () => {},
    fetchBody: async () => ({
      from: "Sarah <sarah@gmail.com>",
      subject: "re: your June issue",
      text: "what about 33908? thinking of buying",
      headers: {},
    }),
    lookupSend: async () => ({
      userId: "agent-1",
      scheduleId: 7,
      fromName: "Jane Agent",
      fromEmail: "jane@janerealty.com",
    }),
    lookupContact: async () => ({ name: "Sarah", tags: ["buyer"] }),
    countSenderRecent: async () => 0,
    countThread: async () => 0,
    countAgentDay: async () => 0,
    generateAnswer: async () => ({
      text: "Median in 33908 is $X. SWFL-7421",
      freshnessToken: "tok",
    }),
    sendAutoReply: async () => {
      sent.autoReplies++;
    },
    recordEvent: async () => {
      sent.events++;
      return 42;
    },
    sendAgentAlert: async () => {
      sent.alerts++;
    },
    ...over,
  };
  return { deps, sent };
}

const event: InboundEvent = {
  type: "email.received",
  data: { email_id: "em_1", from: "sarah@gmail.com", to: [`r-${TOKEN}@${REPLY_DOMAIN}`] },
};

test("known contact → grounded auto-reply fires AND the agent is alerted", async () => {
  const { deps, sent } = makeDeps();
  const out = await processInboundReply(event, deps);
  expect(out).toMatchObject({ kind: "processed", answerSent: true, knownContact: true });
  expect(sent.autoReplies).toBe(1);
  expect(sent.alerts).toBe(1);
  expect(sent.events).toBe(1);
});

test("unknown sender → NO auto-reply, but the agent is still alerted (forwarded lead)", async () => {
  const { deps, sent } = makeDeps({ lookupContact: async () => null });
  const out = await processInboundReply(event, deps);
  expect(out).toMatchObject({
    kind: "processed",
    answerSent: false,
    knownContact: false,
    blockedReason: "unknown_contact",
  });
  expect(sent.autoReplies).toBe(0);
  expect(sent.alerts).toBe(1); // alert-only
  expect(sent.events).toBe(1);
});

test("auto-responder → no auto-reply (loop guard), still logged + alerted", async () => {
  const { deps, sent } = makeDeps({
    fetchBody: async () => ({
      from: "noreply@bank.com",
      subject: "Out of office",
      text: "I am away",
      headers: { "Auto-Submitted": "auto-replied" },
    }),
    lookupContact: async () => ({ name: "Bank", tags: [] }),
  });
  const out = await processInboundReply(event, deps);
  expect(out).toMatchObject({ answerSent: false, blockedReason: "auto_responder" });
  expect(sent.autoReplies).toBe(0);
  expect(sent.alerts).toBe(1);
});

test("non-sensor address is ignored (no send record touched)", async () => {
  const { deps, sent } = makeDeps();
  const out = await processInboundReply(
    { type: "email.received", data: { email_id: "x", to: ["someone@elsewhere.com"] } },
    deps,
  );
  expect(out).toEqual({ kind: "ignored", reason: "not_sensor_address" });
  expect(sent.events).toBe(0);
  expect(sent.alerts).toBe(0);
});

test("unknown token is ignored", async () => {
  const { deps } = makeDeps({ lookupSend: async () => null });
  const out = await processInboundReply(event, deps);
  expect(out).toEqual({ kind: "ignored", reason: "unknown_token" });
});

test("non-received event type is ignored", async () => {
  const { deps } = makeDeps();
  const out = await processInboundReply({ type: "email.delivered" }, deps);
  expect(out).toEqual({ kind: "ignored", reason: "unhandled_event:email.delivered" });
});

test("thread cap reached → hands off (no reply), still alerts the agent", async () => {
  const { deps, sent } = makeDeps({ countThread: async () => 3 });
  const out = await processInboundReply(event, deps);
  expect(out).toMatchObject({ answerSent: false, blockedReason: "thread_cap" });
  expect(sent.autoReplies).toBe(0);
  expect(sent.alerts).toBe(1);
});

test("grounded auto-reply carries its own freshness — never discards the token it was given", async () => {
  let sentText: string | null = null;
  let alertAnswerText: string | null = null;
  const { deps } = makeDeps({
    generateAnswer: async () => ({
      text: "Median in 33908 is $410,000.",
      freshnessToken: "SWFL-7421-v12-20260701",
    }),
    sendAutoReply: async (args) => {
      sentText = args.text;
    },
    sendAgentAlert: async (args) => {
      alertAnswerText = args.answerText;
    },
  });
  await processInboundReply(event, deps);
  // The client-facing send must carry the as-of date, not just the bare answer text.
  expect(sentText).toContain("07/01/2026");
  // The agent's alert echoes the SAME text the client received (agent-alert.ts quotes
  // `answerText` verbatim) — it must carry the same freshness, not the un-captioned answer.
  expect(alertAnswerText).toContain("07/01/2026");
});

test("grounded auto-reply with an unparseable freshness token still sends (no caveat, no crash)", async () => {
  let sentText: string | null = null;
  const { deps } = makeDeps({
    generateAnswer: async () => ({ text: "Median in 33908 is $410,000.", freshnessToken: "" }),
    sendAutoReply: async (args) => {
      sentText = args.text;
    },
  });
  const out = await processInboundReply(event, deps);
  expect(out).toMatchObject({ answerSent: true });
  expect(sentText).toBe("Median in 33908 is $410,000.");
});
