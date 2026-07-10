// lib/email/zip-events/webhook.test.ts
import { describe, expect, test } from "bun:test";
import { extractMarketAlertEngagement } from "./webhook";

const base = {
  data: { tags: { wid: "s1", ma: "i-77", trigger: "lifecycle_burst", area: "cape-coral" } },
};

describe("extractMarketAlertEngagement", () => {
  test("maps opened/clicked with full tag context", () => {
    const got = extractMarketAlertEngagement({ ...base, type: "email.opened" });
    expect(got).toEqual({
      wid: "s1",
      issue_id: "i-77",
      trigger: "lifecycle_burst",
      area_id: "cape-coral",
      event: "opened",
    });
    expect(extractMarketAlertEngagement({ ...base, type: "email.clicked" })?.event).toBe("clicked");
  });
  test("null without the ma tag (wid-only legacy weekly-read sends untouched)", () => {
    expect(
      extractMarketAlertEngagement({ type: "email.opened", data: { tags: { wid: "s1" } } }),
    ).toBeNull();
  });
  test("null on irrelevant event types", () => {
    expect(extractMarketAlertEngagement({ ...base, type: "email.sent" })).toBeNull();
    expect(extractMarketAlertEngagement({ type: "email.opened" })).toBeNull();
  });
});
