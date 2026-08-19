// lib/booking/offer-times.ts — send-time enrichment: real times into the doc.
//
// Called from the SEND lane, not the build lane, on purpose: a scheduled email
// built Monday and sending Friday must offer Friday-forward availability, so
// freshness is a send-time property. Window starts TOMORROW (a same-day slot
// can lapse between send and open) and spans 7 days.
//
// Only cal.com links carry fetchable availability today (public /v2/slots —
// _RESEARCH/competitor-and-strategy/2026-08-19-calcom-api-v2-slots.md); every
// other provider keeps its single booking button. Failure of any kind returns
// the doc UNTOUCHED — the plain button already is the fallback, and a send
// never breaks on a nicety.

import type { EmailDoc } from "@/lib/email/doc/types";
import { detectBookingProvider } from "./providers";
import { fetchCalcomSlots } from "./calcom-slots";
import { expandBookingButtonWithTimes } from "./expand-doc";

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

export async function offerTimesInDoc(
  doc: EmailDoc,
  args: { bookingUrl: string; timeZone?: string; now?: Date },
  fetchImpl: typeof fetch = fetch,
): Promise<EmailDoc> {
  if (detectBookingProvider(args.bookingUrl) !== "calcom") return doc;
  const now = args.now ?? new Date();
  const timeZone = args.timeZone ?? "America/New_York";
  const slots = await fetchCalcomSlots(
    {
      calLink: args.bookingUrl,
      startISO: isoDate(new Date(now.getTime() + DAY_MS)),
      endISO: isoDate(new Date(now.getTime() + 8 * DAY_MS)),
      timeZone,
    },
    fetchImpl,
  );
  if (slots.length === 0) return doc;
  return expandBookingButtonWithTimes(doc, {
    slotStartsISO: slots,
    bookingUrl: args.bookingUrl,
    timeZone,
  });
}
