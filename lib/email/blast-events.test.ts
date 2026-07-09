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
});
