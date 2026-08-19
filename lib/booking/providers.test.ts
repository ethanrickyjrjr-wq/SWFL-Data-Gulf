// lib/booking/providers.test.ts
//
// Named for their failure modes (RULE 3.5): a mis-detected provider deep-links a
// param the vendor never reads; a deep link that MUTATES the path books the wrong
// page; an unknown provider must degrade to the untouched link, never to nothing.
// Param facts are sourced, not remembered:
// _RESEARCH/competitor-and-strategy/2026-08-19-calcom-booking-url-params.md,
// 2026-08-19-calendly-embed-and-params.md, 2026-08-19-booking-link-provider-landscape.md.
import { describe, test, expect } from "bun:test";
import {
  detectBookingProvider,
  slotFidelity,
  slotDeepLink,
  prefillLink,
  providerLabel,
} from "./providers";

const SLOT = "2026-08-25T18:00:00.000Z"; // 2:00 PM ET on Tue 08/25/2026
const ET = "America/New_York";

describe("detectBookingProvider — by host, never by substring", () => {
  test("cal.com in any form", () => {
    expect(detectBookingProvider("https://cal.com/jane/tour")).toBe("calcom");
    expect(detectBookingProvider("https://app.cal.com/jane")).toBe("calcom");
  });
  test("calendly", () => {
    expect(detectBookingProvider("https://calendly.com/jane/30min")).toBe("calendly");
  });
  test("acuity both domains", () => {
    expect(detectBookingProvider("https://app.acuityscheduling.com/schedule.php?owner=1")).toBe(
      "acuity",
    );
    expect(detectBookingProvider("https://jane.as.me/consult")).toBe("acuity");
  });
  test("savvycal / tidycal / google / zoho / square / microsoft", () => {
    expect(detectBookingProvider("https://savvycal.com/jane/chat")).toBe("savvycal");
    expect(detectBookingProvider("https://tidycal.com/jane/15")).toBe("tidycal");
    expect(detectBookingProvider("https://calendar.app.google/AbC123")).toBe("google");
    expect(detectBookingProvider("https://calendar.google.com/calendar/appointments/x")).toBe(
      "google",
    );
    expect(detectBookingProvider("https://bookings.zoho.com/portal/jane")).toBe("zoho");
    expect(detectBookingProvider("https://jane-realty.square.site/book")).toBe("square");
    expect(detectBookingProvider("https://outlook.office.com/bookings/jane@x.com/svc")).toBe(
      "microsoft",
    );
  });
  test("lookalike host that merely CONTAINS a vendor domain is unknown", () => {
    expect(detectBookingProvider("https://cal.com.evil.co/jane")).toBe("unknown");
    expect(detectBookingProvider("https://notcalendly.com/jane")).toBe("unknown");
  });
  test("garbage and empties are unknown, never a throw", () => {
    expect(detectBookingProvider("not a url")).toBe("unknown");
    expect(detectBookingProvider("")).toBe("unknown");
  });
});

describe("slotFidelity — what a plain link can preselect, per vendor docs", () => {
  test("cal.com and acuity deep-link an exact time; savvycal a date; the rest only the page", () => {
    expect(slotFidelity("calcom")).toBe("slot");
    expect(slotFidelity("acuity")).toBe("slot");
    expect(slotFidelity("savvycal")).toBe("date");
    expect(slotFidelity("calendly")).toBe("page");
    expect(slotFidelity("unknown")).toBe("page");
  });
});

describe("slotDeepLink — adds query params ONLY; the path is never touched", () => {
  test("cal.com gets date+month+slot, date/month in the display timezone", () => {
    const url = slotDeepLink({
      bookingUrl: "https://cal.com/jane/tour",
      slotStartISO: SLOT,
      timeZone: ET,
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://cal.com/jane/tour");
    expect(u.searchParams.get("date")).toBe("2026-08-25");
    expect(u.searchParams.get("month")).toBe("2026-08");
    expect(u.searchParams.get("slot")).toBe(SLOT);
  });
  test("a slot late in the ET evening lands on the ET date, not the UTC date", () => {
    // 11:00 PM ET on 08/25 is 03:00 UTC on 08/26 — the date param must say 08/25.
    const url = slotDeepLink({
      bookingUrl: "https://cal.com/jane/tour",
      slotStartISO: "2026-08-26T03:00:00.000Z",
      timeZone: ET,
    });
    expect(new URL(url).searchParams.get("date")).toBe("2026-08-25");
  });
  test("acuity gets datetime=, savvycal gets from=", () => {
    const a = new URL(
      slotDeepLink({ bookingUrl: "https://jane.as.me/consult", slotStartISO: SLOT, timeZone: ET }),
    );
    expect(a.searchParams.get("datetime")).toBe(SLOT);
    const s = new URL(
      slotDeepLink({
        bookingUrl: "https://savvycal.com/jane/chat",
        slotStartISO: SLOT,
        timeZone: ET,
      }),
    );
    expect(s.searchParams.get("from")).toBe("2026-08-25");
  });
  test("a page-fidelity provider returns the link untouched — degrade, never refuse", () => {
    expect(
      slotDeepLink({
        bookingUrl: "https://calendly.com/jane/30min",
        slotStartISO: SLOT,
        timeZone: ET,
      }),
    ).toBe("https://calendly.com/jane/30min");
  });
  test("existing query params on the saved link survive", () => {
    const url = slotDeepLink({
      bookingUrl: "https://cal.com/jane/tour?theme=dark",
      slotStartISO: SLOT,
      timeZone: ET,
    });
    const u = new URL(url);
    expect(u.searchParams.get("theme")).toBe("dark");
    expect(u.searchParams.get("slot")).toBe(SLOT);
  });
  test("an unparseable booking url comes back unchanged, never a throw", () => {
    expect(slotDeepLink({ bookingUrl: "not a url", slotStartISO: SLOT, timeZone: ET })).toBe(
      "not a url",
    );
  });
});

describe("prefillLink — invitee name/email only where the vendor documents it", () => {
  test("calendly and cal.com accept name+email as query params", () => {
    for (const base of ["https://calendly.com/jane/30min", "https://cal.com/jane/tour"]) {
      const u = new URL(prefillLink(base, { name: "Sam Buyer", email: "sam@example.com" }));
      expect(u.searchParams.get("name")).toBe("Sam Buyer");
      expect(u.searchParams.get("email")).toBe("sam@example.com");
    }
  });
  test("undocumented providers pass through untouched — a guessed param is an invented contract", () => {
    const base = "https://calendar.app.google/AbC123";
    expect(prefillLink(base, { name: "Sam", email: "s@x.com" })).toBe(base);
  });
  test("blank prefill values are omitted, not sent as empty params", () => {
    const u = new URL(prefillLink("https://cal.com/jane/tour", { name: "", email: undefined }));
    expect(u.searchParams.has("name")).toBe(false);
    expect(u.searchParams.has("email")).toBe(false);
  });
});

describe("providerLabel — a human name for the card, never the enum key", () => {
  test("known providers get their brand name; unknown says nothing vendor-y", () => {
    expect(providerLabel("calcom")).toBe("Cal.com");
    expect(providerLabel("calendly")).toBe("Calendly");
    expect(providerLabel("google")).toBe("Google Calendar");
    expect(providerLabel("unknown")).toBe("your scheduler");
  });
});
