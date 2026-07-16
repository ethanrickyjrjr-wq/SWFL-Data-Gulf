import { describe, expect, it } from "bun:test";
import { extractBlastAction } from "./blast-events";

// Resend delivers tags as a plain object {"key":"value"} in webhook payloads
// even though the send API accepts [{name,value}] arrays (blastTags() sends
// did/tpl/campaign/variant — same shape as outreach's rid).
describe("extractBlastAction", () => {
  const bounced = {
    type: "email.bounced",
    data: { email_id: "re_123", tags: { did: "dlv-abc", tpl: "trend-snapshot" } },
  };

  it("maps a tagged bounced event to did + bounced", () => {
    expect(extractBlastAction(bounced)).toEqual({
      did: "dlv-abc",
      emailId: "re_123",
      event: "bounced",
    });
  });

  it("maps a tagged complained event to did + complained", () => {
    expect(
      extractBlastAction({
        type: "email.complained",
        data: { email_id: "re_456", tags: { did: "dlv-abc" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_456", event: "complained" });
  });

  it("maps delivered/opened/clicked too (denominator + engagement, no suppression ledger)", () => {
    for (const [type, event] of [
      ["email.delivered", "delivered"],
      ["email.opened", "opened"],
      ["email.clicked", "clicked"],
    ] as const) {
      expect(
        extractBlastAction({ type, data: { email_id: "x", tags: { did: "dlv-abc" } } }),
      ).toEqual({ did: "dlv-abc", emailId: "x", event });
    }
  });

  it("returns null when the event carries no did tag (not a blast send)", () => {
    expect(
      extractBlastAction({ type: "email.bounced", data: { email_id: "x", tags: {} } }),
    ).toBeNull();
  });

  it("returns null for inbound / untracked types even if tagged", () => {
    expect(
      extractBlastAction({ type: "email.received", data: { tags: { did: "dlv-abc" } } }),
    ).toBeNull();
  });

  it("tolerates a missing email_id (emailId null)", () => {
    expect(
      extractBlastAction({ type: "email.delivered", data: { tags: { did: "dlv-abc" } } }),
    ).toEqual({ did: "dlv-abc", emailId: null, event: "delivered" });
  });

  it("ignores an rid-tagged (outreach) or wid-tagged (weekly-read) event even without did", () => {
    expect(
      extractBlastAction({ type: "email.bounced", data: { tags: { rid: "rid-abc" } } }),
    ).toBeNull();
    expect(
      extractBlastAction({ type: "email.bounced", data: { tags: { wid: "wid-abc" } } }),
    ).toBeNull();
  });

  it("carries the variant tag when present", () => {
    expect(
      extractBlastAction({
        type: "email.clicked",
        data: { email_id: "re_1", tags: { did: "dlv-abc", variant: "1" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "clicked", variant: "1" });
  });

  it("omits variant when the tag is absent", () => {
    expect(
      extractBlastAction({
        type: "email.clicked",
        data: { email_id: "re_1", tags: { did: "dlv-abc" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "clicked" });
  });

  it('carries variant "0" (cohort 0 is 0-based, present in every split test)', () => {
    expect(
      extractBlastAction({
        type: "email.clicked",
        data: { email_id: "re_1", tags: { did: "dlv-abc", variant: "0" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "clicked", variant: "0" });
  });

  it("carries the cid tag when present (per-contact engagement linkage)", () => {
    expect(
      extractBlastAction({
        type: "email.opened",
        data: { email_id: "re_1", tags: { did: "dlv-abc", cid: "contact-1" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "opened", contactId: "contact-1" });
  });

  it("omits contactId when the cid tag is absent (pre-linkage sends)", () => {
    expect(
      extractBlastAction({
        type: "email.opened",
        data: { email_id: "re_1", tags: { did: "dlv-abc" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "opened" });
  });
});

// ── extractBroadcastEvent (hub mission-control Task 12, 07/16/2026) ─────────
import { extractBroadcastEvent } from "./blast-events";

describe("extractBroadcastEvent", () => {
  const base = (over: Record<string, unknown>) => ({
    type: "email.opened",
    data: { email_id: "re_1", broadcast_id: "bc_1", tags: {}, ...over },
  });

  it("maps a broadcast open through; complained maps to unsubscribed", () => {
    expect(extractBroadcastEvent(base({}))).toEqual({
      broadcastId: "bc_1",
      emailId: "re_1",
      event: "opened",
    });
    expect(extractBroadcastEvent({ ...base({}), type: "email.complained" })?.event).toBe(
      "unsubscribed",
    );
  });

  it("maps sent/delivered/clicked/bounced; drops untracked types", () => {
    for (const [type, event] of [
      ["email.sent", "sent"],
      ["email.delivered", "delivered"],
      ["email.clicked", "clicked"],
      ["email.bounced", "bounced"],
    ] as const) {
      expect(extractBroadcastEvent({ ...base({}), type })?.event).toBe(event);
    }
    expect(extractBroadcastEvent({ ...base({}), type: "email.received" })).toBeNull();
    expect(extractBroadcastEvent({ ...base({}), type: "email.delivery_delayed" })).toBeNull();
  });

  it("returns null for did/rid/wid-tagged events (they route to their own branches)", () => {
    expect(extractBroadcastEvent(base({ tags: { did: "d1" } }))).toBeNull();
    expect(extractBroadcastEvent(base({ tags: { rid: "r1" } }))).toBeNull();
    expect(extractBroadcastEvent(base({ tags: { wid: "w1" } }))).toBeNull();
  });

  it("returns null without a broadcast_id or email_id", () => {
    expect(extractBroadcastEvent(base({ broadcast_id: undefined }))).toBeNull();
    expect(extractBroadcastEvent(base({ email_id: undefined }))).toBeNull();
  });
});
