// lib/project/booking-card.ts — the cockpit Booking card's data shape.
//
// PURE resolve from a brand/branding blob to what the card renders:
// - "ready" with a cal.com link → the card can mount the official inline embed
//   (no API key needed — the public calLink path is the whole contract;
//   _RESEARCH/competitor-and-strategy/2026-08-19-calcom-embed-options.md).
// - "ready" with any other provider → a branded "Book time" link button.
// - "unset" → the setup nudge. The email ladder may fall back to the website
//   for a booking BUTTON; a booking CARD may not — a homepage is not a booking
//   page, and a card that pretends it is misleads (§1.8's "no real link means
//   no button", applied to the cockpit).
import { roleDestinationsFromBrand } from "@/lib/email/button-destinations";
import { detectBookingProvider, type BookingProvider } from "@/lib/booking/providers";
import { parseCalLink } from "@/lib/booking/calcom-slots";

export type BookingCardModel =
  | {
      kind: "ready";
      url: string;
      provider: BookingProvider;
      /** "username" or "username/event-slug" for @calcom/embed-react's calLink
       *  prop; null for every non-cal.com provider. */
      calLink: string | null;
    }
  | { kind: "unset" };

export function bookingCardModel(brand: unknown): BookingCardModel {
  const url = roleDestinationsFromBrand(brand).booking;
  if (!url) return { kind: "unset" };
  const provider = detectBookingProvider(url);
  const parts = provider === "calcom" ? parseCalLink(url) : null;
  const calLink = parts
    ? parts.eventSlug
      ? `${parts.username}/${parts.eventSlug}`
      : parts.username
    : null;
  return { kind: "ready", url, provider, calLink };
}
