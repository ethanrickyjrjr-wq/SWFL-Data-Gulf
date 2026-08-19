// lib/booking/calendar-links.test.ts
//
// Failure modes: the eventedit Google form breaks on Android (render is the safe
// action); Outlook params replayed live pinned the exact names; encoding by hand
// invents a contract. Facts:
// _RESEARCH/email-and-social/2026-08-19-add-to-calendar-and-propose-times.md.
import { describe, test, expect } from "bun:test";
import { googleCalendarUrl, outlookComposeUrl } from "./calendar-links";

const EVENT = {
  title: "Showing — 123 Palm Ave, Cape Coral",
  startISO: "2026-08-25T18:00:00.000Z",
  endISO: "2026-08-25T18:30:00.000Z",
  timeZone: "America/New_York",
  location: "123 Palm Ave, Cape Coral, FL",
  description: "Private showing with Jane Agent.",
};

describe("googleCalendarUrl", () => {
  test("uses render?action=TEMPLATE (not eventedit) with UTC basic-format dates and ctz", () => {
    const u = new URL(googleCalendarUrl(EVENT));
    expect(u.hostname).toBe("calendar.google.com");
    expect(u.pathname).toBe("/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20260825T180000Z/20260825T183000Z");
    expect(u.searchParams.get("ctz")).toBe("America/New_York");
    expect(u.searchParams.get("text")).toBe(EVENT.title);
    expect(u.searchParams.get("location")).toBe(EVENT.location);
  });
});

describe("outlookComposeUrl", () => {
  test("live-replayed param names: path, rru, startdt/enddt ISO, subject, body, location", () => {
    const u = new URL(outlookComposeUrl(EVENT));
    expect(u.hostname).toBe("outlook.live.com");
    expect(u.searchParams.get("path")).toBe("/calendar/action/compose");
    expect(u.searchParams.get("rru")).toBe("addevent");
    expect(u.searchParams.get("startdt")).toBe(EVENT.startISO);
    expect(u.searchParams.get("enddt")).toBe(EVENT.endISO);
    expect(u.searchParams.get("subject")).toBe(EVENT.title);
    expect(u.searchParams.get("location")).toBe(EVENT.location);
  });
});
