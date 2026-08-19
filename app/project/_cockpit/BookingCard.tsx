// app/project/_cockpit/BookingCard.tsx
"use client";

import Link from "next/link";
import { providerLabel } from "@/lib/booking/providers";
import type { BookingCardModel } from "@/lib/project/booking-card";

/**
 * Booking — its own aside section, chrome lifted verbatim from ShowingPrepCard
 * one block up (one-room law: the aside-section idiom is the ONE home for a hub
 * side action). Shows the agent's saved booking link (the same `booking` role
 * destination every email button resolves through) or the setup nudge pointing
 * at the brand editor — the link's ONE editing home (/account/brand). No second
 * input here: two inputs writing one destination is how they drift apart
 * (BrandingBlock.tsx's own rule).
 */
export function BookingCard({ booking }: { booking: BookingCardModel }) {
  return (
    <section className="border-b border-white/8 px-4 pb-4 pt-4">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
        Booking
      </p>
      {booking.kind === "ready" ? (
        <a
          href={booking.url}
          target="_blank"
          rel="noreferrer"
          className="group block w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06]"
          style={{ borderLeft: "3px solid var(--gulf-teal)" }}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white/90">Your booking page</span>
            <span className="shrink-0 text-xs font-semibold text-gulf-teal opacity-70 transition-opacity group-hover:opacity-100">
              Open →
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] leading-snug text-white/45">
            {providerLabel(booking.provider)} · clients pick a time on your calendar — emails offer
            it as clickable times
          </span>
        </a>
      ) : (
        <Link
          href="/account/brand"
          className="group block w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06]"
          style={{ borderLeft: "3px solid var(--gulf-teal)" }}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white/90">Add your booking link</span>
            <span className="shrink-0 text-xs font-semibold text-gulf-teal opacity-70 transition-opacity group-hover:opacity-100">
              Set up →
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-white/45">
            Paste your Calendly, Cal.com, or other scheduling link — free at cal.com if you
            don&apos;t have one. Emails and this card will use it.
          </span>
        </Link>
      )}
    </section>
  );
}
