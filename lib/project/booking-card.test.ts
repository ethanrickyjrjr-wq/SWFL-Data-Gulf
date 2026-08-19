// lib/project/booking-card.test.ts
//
// Failure modes: a card that renders a "Book time" button aimed at a homepage
// misleads (the email ladder may fall back to website; a BOOKING CARD may not);
// a cal.com link must be recognized so the card can render the real inline
// booker; a malformed blob must yield the setup nudge, never a crash.
import { describe, test, expect } from "bun:test";
import { bookingCardModel } from "./booking-card";

const withBooking = (url: string): Record<string, unknown> => ({
  website_url: "https://jane-realty.example",
  button_destinations: { booking: url },
});

describe("bookingCardModel", () => {
  test("saved cal.com link: ready, provider calcom, calLink parsed for the embed", () => {
    const m = bookingCardModel(withBooking("https://cal.com/jane/tour"));
    expect(m).toEqual({
      kind: "ready",
      url: "https://cal.com/jane/tour",
      provider: "calcom",
      calLink: "jane/tour",
    });
  });

  test("saved non-cal.com link: ready as a plain link, no embed path", () => {
    const m = bookingCardModel(withBooking("https://calendly.com/jane/30min"));
    expect(m).toEqual({
      kind: "ready",
      url: "https://calendly.com/jane/30min",
      provider: "calendly",
      calLink: null,
    });
  });

  test("no saved booking link: unset — the website is NOT a booking page", () => {
    expect(bookingCardModel({ website_url: "https://jane-realty.example" })).toEqual({
      kind: "unset",
    });
  });

  test("jsonb arriving as TEXT (raw driver path) still resolves", () => {
    const m = bookingCardModel({
      button_destinations: JSON.stringify({ booking: "https://cal.com/jane/tour" }),
    });
    expect(m.kind).toBe("ready");
  });

  test("null/garbage blobs yield unset, never a throw", () => {
    expect(bookingCardModel(null)).toEqual({ kind: "unset" });
    expect(bookingCardModel(undefined)).toEqual({ kind: "unset" });
    expect(bookingCardModel({ button_destinations: 42 })).toEqual({ kind: "unset" });
  });

  test("bare cal.com profile link (no event slug) still embeds by username", () => {
    const m = bookingCardModel(withBooking("https://cal.com/jane"));
    expect(m).toEqual({
      kind: "ready",
      url: "https://cal.com/jane",
      provider: "calcom",
      calLink: "jane",
    });
  });
});
