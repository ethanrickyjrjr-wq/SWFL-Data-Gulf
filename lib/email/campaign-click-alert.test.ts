import { test, expect } from "bun:test";
import { buildClickAlertContent, extractCampaignClick } from "./campaign-click-alert";

test("extractCampaignClick reads broadcast_id + recipient + link off an email.clicked event", () => {
  const c = extractCampaignClick({
    type: "email.clicked",
    data: {
      broadcast_id: "8b146471-e88e-4322-86af-016cd36fd216",
      to: ["Sarah@Gmail.com"],
      click: { link: "https://www.swfldatagulf.com/p/abc?ctx=schedule-showing" },
    },
  });
  expect(c).toEqual({
    broadcastId: "8b146471-e88e-4322-86af-016cd36fd216",
    email: "sarah@gmail.com",
    link: "https://www.swfldatagulf.com/p/abc?ctx=schedule-showing",
  });
});

test("null on a non-click event", () => {
  expect(
    extractCampaignClick({ type: "email.opened", data: { broadcast_id: "x", to: ["a@b.com"] } }),
  ).toBeNull();
});

test("null when there's no broadcast_id — not a broadcast send, a different lane owns it", () => {
  expect(extractCampaignClick({ type: "email.clicked", data: { to: ["a@b.com"] } })).toBeNull();
});

test("null when there's no recipient address", () => {
  expect(extractCampaignClick({ type: "email.clicked", data: { broadcast_id: "x" } })).toBeNull();
});

test("link is null when Resend didn't include one (never invented)", () => {
  const c = extractCampaignClick({
    type: "email.clicked",
    data: { broadcast_id: "x", to: ["a@b.com"] },
  });
  expect(c?.link).toBeNull();
});

const base = {
  contactEmail: "sarah@gmail.com",
  contactName: "Sarah",
  projectTitle: "326 Shore Dr",
  link: "https://www.swfldatagulf.com/p/abc",
};

test("click alert names the lead and the campaign in the subject", () => {
  const c = buildClickAlertContent(base);
  expect(c.subject).toBe("Sarah clicked into your 326 Shore Dr campaign");
  expect(c.text).toContain("real interest");
  expect(c.text).toContain(base.link);
});

test("falls back to email when no contact name", () => {
  const c = buildClickAlertContent({ ...base, contactName: null });
  expect(c.subject.startsWith("sarah@gmail.com")).toBe(true);
});

test("omits the link line when Resend didn't report one", () => {
  const c = buildClickAlertContent({ ...base, link: null });
  expect(c.text).not.toContain("What they clicked");
});
