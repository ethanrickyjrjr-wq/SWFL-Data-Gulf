// lib/project/nudge-copy.ts
//
// Pure copy builder for the arc nudge chip (spec
// 2026-07-06-platform-arc-auto-advance-nudges-design.md). Every line is either purely structural
// ("it's been 14 days") or built from a REAL held number (price_delta) — never a general market
// claim we can't source. departed_holding is deliberately hedged: the lake genuinely cannot tell
// under-contract from a temporary pull.

import type { NudgeEventKind } from "./lifecycle-nudge";

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

export function nudgeChipText(eventKind: NudgeEventKind, priceDelta: number | null): string {
  switch (eventKind) {
    case "appeared":
      return "This listing is now live in the MLS — build the New Listing announcement?";
    case "departed_holding":
      return "This listing left the active market — it may have gone under contract (or was pulled). Worth checking before you send.";
    case "resolved_sold":
      return priceDelta != null
        ? `County records show this sold (${fmtUsd(priceDelta)} vs list) — build the Sold announcement?`
        : "County records show this sold — build the Sold announcement?";
    case "time_elapsed":
      return "It's been 14 days since your New Listing send — a Market Comps update might keep attention on this listing.";
  }
}
