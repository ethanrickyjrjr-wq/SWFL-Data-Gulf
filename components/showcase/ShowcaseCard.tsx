"use client";

import type { Showcase } from "@/lib/showcase/registry";
import { totalSteps } from "@/lib/showcase/overlay-logic";

/**
 * Thumbnail card for one showcase in the pill panel. Pure trigger — the
 * ShowcaseOverlay does the storytelling; JS-off users reach the artifacts
 * through the overlay's view-live links, so the card stays a button.
 */
export function ShowcaseCard({
  showcase,
  onOpen,
}: {
  showcase: Showcase;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(showcase.id)}
      className="block w-full overflow-hidden rounded-lg border border-white/10 bg-[#0f1d24] text-left transition-colors hover:border-white/30"
      style={{ borderLeft: `3px solid ${showcase.accent}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- committed static asset, fixed crop */}
      <img
        src={showcase.thumb}
        alt=""
        className="h-24 w-full object-cover object-top"
        loading="lazy"
      />
      <span className="block px-3 py-2">
        <span className="flex items-center justify-between gap-2">
          <span className="block text-xs font-semibold text-[#f0ede6]">{showcase.title}</span>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold text-navy-dark"
            style={{ background: showcase.accent }}
          >
            {totalSteps(showcase)} steps
          </span>
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-gray-400">{showcase.hook}</span>
      </span>
    </button>
  );
}
