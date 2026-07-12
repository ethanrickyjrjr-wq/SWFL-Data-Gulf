// lib/concoctions/user-bundle.ts — lane FOUR of the moat at block grain: a
// figure the user states directly, recorded with attribution. The value ships
// VERBATIM (a user-stated figure is a legitimate source — rule 1), the binding
// says exactly where it came from, and it is never refreshable (there is no
// source to re-probe — freshness reports "can't refresh", which is correct).
// PURE: the caller supplies asOf (the day the figure was stated) — never a
// Date.now() inside.
import type { EmailBlock } from "@/lib/email/doc/types";
import { BINDING_VERSION } from "@/lib/email/doc/types";

export interface UserFigure {
  /** What the number is, e.g. "My building's asking rent". */
  label: string;
  /** The figure exactly as stated, e.g. "$21.50" — never coerced or recomputed. */
  value: string;
  /** Who stated it, e.g. "operator" or the client's name. */
  attribution: string;
}

export function materializeUserFigure(
  figure: UserFigure,
  opts: { id: string; asOf: string },
): EmailBlock {
  return {
    id: opts.id,
    type: "metric-card",
    props: {
      metricValue: figure.value,
      metricLabel: figure.label,
      sub: `Provided by ${figure.attribution}`,
    },
    layout: { x: 0, y: 0, w: 12, h: 3 },
    binding: {
      v: BINDING_VERSION,
      lane: "user",
      bundleRef: "user-stated",
      slice: { measures: ["value"] },
      asOf: opts.asOf,
      sourceLine: `Figure provided by ${figure.attribution}`,
    },
  };
}
