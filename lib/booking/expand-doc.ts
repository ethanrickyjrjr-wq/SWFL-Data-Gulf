// lib/booking/expand-doc.ts — swap a doc's booking button for the time stack.
//
// The researched email pattern (2026-08-19-email-time-slot-cta-patterns.md):
// the stack REPLACES the single booking CTA — one ask, several concrete times —
// never sits beside it, which would be a second CTA (§1.8 of the playbook:
// "ONE call to action per email"). Runs at SEND time, AFTER the brand overlay
// and BEFORE the link ladder (the blast route, its one production caller) —
// availability must be fresh at send, and the expanded doc is never persisted,
// so stored docs and /p pages keep the plain button. The overlay's Guard 3
// (isDestinationRefinement) protects any FUTURE path that re-overlays a doc
// already carrying deep links; today's caller never does.
//
// PURE: slots come in as data. The fetch half lives beside it (offer-times.ts).

import type { EmailBlock, EmailDoc } from "@/lib/email/doc/types";
import { createBlock } from "@/lib/email/doc/default-docs";
import { buildTimeSlotButtons } from "./time-buttons";

/**
 * Replace the FIRST engine-owned booking-role button with slot buttons + the
 * "see all times" fallback. Returns the doc UNCHANGED (same reference) when
 * there is nothing to do — no booking button, no slots, or the button is
 * user-typed (a human's URL is theirs; the overlay's Guard 2 contract).
 */
export function expandBookingButtonWithTimes(
  doc: EmailDoc,
  args: { slotStartsISO: string[]; bookingUrl: string; timeZone?: string; max?: number },
): EmailDoc {
  if (args.slotStartsISO.length === 0) return doc;
  const idx = doc.blocks.findIndex(
    (b) =>
      b.type === "button" &&
      (b.props as { role?: string }).role === "booking" &&
      (b.props as { urlSource?: string }).urlSource !== "user",
  );
  if (idx === -1) return doc;
  const stack: EmailBlock[] = buildTimeSlotButtons({
    slotStartsISO: args.slotStartsISO,
    bookingUrl: args.bookingUrl,
    timeZone: args.timeZone,
    max: args.max,
  }).map((props) => ({ ...createBlock("button"), props }));
  const blocks = [...doc.blocks.slice(0, idx), ...stack, ...doc.blocks.slice(idx + 1)];
  return { ...doc, blocks };
}
