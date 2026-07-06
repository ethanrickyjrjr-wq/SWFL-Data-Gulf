// lib/campaigns/cadence-colors.ts
//
// ONE root for the campaign cadence legend colors. Keyed off the existing
// `Cadence` type (lib/email/schedule-cadence.ts) so a fourth cadence would be a
// compile error here, never a silently-uncolored region.
//
// SEMANTIC (locked at design approval, 07/05/2026): these mark DATA-FRESHNESS,
// not send-schedule — "how often the underlying figure updates in the lake."
// The live inventory count refreshes daily, the market wrap weekly, the
// trend/theme monthly. Tinting a live count "daily" is a TRUE statement about
// the data; it is NOT a claim the campaign re-sends daily. Copy that keys off
// these colors must stay on the freshness reading (no-invention discipline).
import type { Cadence } from "@/lib/email/schedule-cadence";

export interface CadenceColor {
  /** Translucent tint for the highlighted region / legend swatch (dark surface). */
  bg: string;
  /** Readable foreground for the label on that tint. */
  fg: string;
  /** Human label — "Daily" / "Weekly" / "Monthly". */
  label: string;
}

/** Distinct, theme-aware hues — full Record so every `Cadence` is covered.
 *  "once" (lifecycle-sequence one-shots) is a SEND shape, not a data-freshness
 *  band: neutral grey, and it stays out of CADENCE_ORDER so the freshness
 *  legend never renders it. */
export const CADENCE_COLORS: Record<Cadence, CadenceColor> = {
  daily: { bg: "rgba(20,184,166,0.18)", fg: "#5eead4", label: "Daily" },
  weekly: { bg: "rgba(245,158,11,0.18)", fg: "#fcd34d", label: "Weekly" },
  monthly: { bg: "rgba(139,92,246,0.20)", fg: "#c4b5fd", label: "Monthly" },
  once: { bg: "rgba(148,163,184,0.18)", fg: "#cbd5e1", label: "One-time" },
};

/** Stable render order for the legend (freshest first). */
export const CADENCE_ORDER: Cadence[] = ["daily", "weekly", "monthly"];
