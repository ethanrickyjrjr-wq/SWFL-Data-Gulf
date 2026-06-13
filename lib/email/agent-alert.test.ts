import { test, expect } from "bun:test";
import { buildAlertContent } from "./agent-alert";

const base = {
  contactEmail: "sarah@gmail.com",
  contactName: "Sarah",
  intent: { zip: "33908", place: "Fort Myers", topic: "home prices" },
  rawReply: "what about 33908?",
  knownContact: true,
  blockedReason: null,
  alertUrl: "https://www.swfldatagulf.com/alerts/42",
};

test("answered alert names the lead and the topic in the subject", () => {
  const c = buildAlertContent({ ...base, answerText: "Median is $X. SWFL-7421" });
  expect(c.subject).toBe("Sarah just asked about Fort Myers — home prices");
  expect(c.text).toContain("we sent them this grounded".toLowerCase().replace("we", "We"));
  expect(c.text).toContain("what about 33908?");
  expect(c.text).toContain("https://www.swfldatagulf.com/alerts/42");
});

test("withheld (unknown contact) alert tells the agent it may be a forwarded lead", () => {
  const c = buildAlertContent({
    ...base,
    contactName: null,
    knownContact: false,
    blockedReason: "unknown_contact",
    answerText: null,
  });
  expect(c.subject).toContain("replied");
  expect(c.text).toContain("isn't in your contacts");
});

test("falls back to email when no contact name", () => {
  const c = buildAlertContent({ ...base, contactName: null, answerText: "x" });
  expect(c.subject.startsWith("sarah@gmail.com")).toBe(true);
});
