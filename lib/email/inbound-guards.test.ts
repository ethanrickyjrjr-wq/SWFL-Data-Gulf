import { test, expect } from "bun:test";
import { isAutoResponder, evaluateAutoReply, AUTO_REPLY_LIMITS } from "./inbound-guards";

const REPLY_DOMAIN = "reply.swfldatagulf.com";

test("isAutoResponder flags Auto-Submitted, Precedence, and suppress headers", () => {
  const base = { fromEmail: "sarah@gmail.com", replyDomain: REPLY_DOMAIN };
  expect(isAutoResponder({ ...base, headers: { "Auto-Submitted": "auto-replied" } })).toBe(true);
  expect(isAutoResponder({ ...base, headers: { Precedence: "bulk" } })).toBe(true);
  expect(isAutoResponder({ ...base, headers: { "X-Auto-Response-Suppress": "OOF" } })).toBe(true);
  // Auto-Submitted: no is the explicit "this is a real message" marker.
  expect(isAutoResponder({ ...base, headers: { "Auto-Submitted": "no" } })).toBe(false);
});

test("isAutoResponder flags no-reply / daemon local-parts and our own reply domain", () => {
  const h = {};
  expect(
    isAutoResponder({ headers: h, fromEmail: "no-reply@bank.com", replyDomain: REPLY_DOMAIN }),
  ).toBe(true);
  expect(
    isAutoResponder({ headers: h, fromEmail: "MAILER-DAEMON@x.com", replyDomain: REPLY_DOMAIN }),
  ).toBe(true);
  expect(
    isAutoResponder({ headers: h, fromEmail: `loop@${REPLY_DOMAIN}`, replyDomain: REPLY_DOMAIN }),
  ).toBe(true);
  expect(
    isAutoResponder({ headers: h, fromEmail: "garbage-no-at", replyDomain: REPLY_DOMAIN }),
  ).toBe(true);
});

test("isAutoResponder passes a normal human reply", () => {
  expect(
    isAutoResponder({
      headers: { Subject: "re: your June issue" },
      fromEmail: "sarah@gmail.com",
      replyDomain: REPLY_DOMAIN,
    }),
  ).toBe(false);
});

const ok = {
  knownContact: true,
  autoResponder: false,
  senderRecentCount: 0,
  threadCount: 0,
  agentDayCount: 0,
};

test("evaluateAutoReply allows a clean known-contact first reply", () => {
  expect(evaluateAutoReply(ok)).toEqual({ allow: true });
});

test("Gate 0 — unknown contact is rejected before any other gate", () => {
  // Unknown AND auto-responder AND throttled: identity reason must win (ordered).
  expect(
    evaluateAutoReply({ ...ok, knownContact: false, autoResponder: true, senderRecentCount: 99 }),
  ).toEqual({ allow: false, reason: "unknown_contact" });
});

test("Gate 1 — auto-responder rejected", () => {
  expect(evaluateAutoReply({ ...ok, autoResponder: true })).toEqual({
    allow: false,
    reason: "auto_responder",
  });
});

test("Gate 2 — sender throttle", () => {
  expect(
    evaluateAutoReply({ ...ok, senderRecentCount: AUTO_REPLY_LIMITS.throttlePerWindow }),
  ).toEqual({ allow: false, reason: "throttled" });
});

test("Gate 3 — thread cap hands off at peak intent", () => {
  expect(evaluateAutoReply({ ...ok, threadCount: AUTO_REPLY_LIMITS.threadCap })).toEqual({
    allow: false,
    reason: "thread_cap",
  });
});

test("Gate 4 — agent daily breaker", () => {
  expect(evaluateAutoReply({ ...ok, agentDayCount: AUTO_REPLY_LIMITS.agentPerDay })).toEqual({
    allow: false,
    reason: "agent_breaker",
  });
});
