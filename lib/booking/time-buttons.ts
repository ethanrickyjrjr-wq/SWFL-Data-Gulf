// lib/booking/time-buttons.ts — "offer different times to click" as plain buttons.
//
// The researched pattern (Calendly/Mixmax/HubSpot/SavvyCal all converge on it —
// _RESEARCH/email-and-social/2026-08-19-email-time-slot-cta-patterns.md): 3–5
// stacked plain links, each one concrete time deep-linked into the booking page
// (never auto-booking — link scanners auto-click), timezone printed in the copy,
// and ALWAYS a "see all times" fallback that absorbs staleness.
//
// Emits standard `button` block props (role: "booking") so all three render
// engines and the brand overlay work unchanged — no new block type (RULE C2:
// extend the existing seam). PURE: slots come from the caller
// (fetchCalcomSlots or a hand-picked list), never from a clock read here.

import type { ButtonProps } from "@/lib/email/doc/types";
import { slotDeepLink } from "./providers";

const DEFAULT_MAX = 3;
/** Researched band: fewer than 1 offers nothing; more than 5 reads as a wall. */
const MAX_FLOOR = 1;
const MAX_CEIL = 5;

export const FALLBACK_LABEL = "See all available times";

/** "Tue, Aug 25 · 2:00 PM ET" — day + date + time in the DISPLAY zone, zone
 *  named in copy (there is no JS in email to localize later). */
function slotLabel(iso: string, timeZone: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(d)
    .replace(/\bEDT\b|\bEST\b/, "ET"); // one stable name for our home zone, DST-proof
  return `${day} · ${time}`;
}

/**
 * Button props for a time-offer stack: up to `max` slot buttons plus exactly one
 * fallback pointing at the bare booking link. Providers that cannot deep-link a
 * time still get the times PRINTED (the reader knows what to pick on the page).
 */
export function buildTimeSlotButtons(args: {
  slotStartsISO: string[];
  bookingUrl: string;
  timeZone?: string;
  max?: number;
}): ButtonProps[] {
  const timeZone = args.timeZone ?? "America/New_York";
  const max = Math.min(MAX_CEIL, Math.max(MAX_FLOOR, args.max ?? DEFAULT_MAX));
  const out: ButtonProps[] = [];
  for (const iso of args.slotStartsISO) {
    if (out.length >= max) break;
    const label = slotLabel(iso, timeZone);
    if (!label) continue; // a bad instant is skipped, never printed as Invalid Date
    out.push({
      label,
      url: slotDeepLink({ bookingUrl: args.bookingUrl, slotStartISO: iso, timeZone }),
      role: "booking",
    });
  }
  out.push({ label: FALLBACK_LABEL, url: args.bookingUrl, role: "booking" });
  return out;
}
