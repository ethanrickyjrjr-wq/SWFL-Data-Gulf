/**
 * Pure popup placement math for the Highlighter.
 *
 * Given the highlighted anchor's viewport rect, the popup's measured size, and
 * the viewport, decide where to put the popup. Preference order:
 *   1. To the RIGHT of the anchor (12px gutter).
 *   2. If that overflows the right edge, flip to the LEFT.
 *   3. If neither side fits, center horizontally.
 * Vertically: align the popup top to the anchor top; if that would overflow the
 * bottom, drop it BELOW the anchor; finally clamp into the viewport so it is
 * never off-screen. All coordinates are viewport-relative (for `position:fixed`).
 */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Position {
  top: number;
  left: number;
}

const GUTTER = 12;

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(v, max));
}

export function popupPosition(
  anchor: Rect,
  popup: Size,
  viewport: Size,
): Position {
  // --- Horizontal: right, else left, else centered ---
  const rightLeft = anchor.left + anchor.width + GUTTER;
  const leftLeft = anchor.left - GUTTER - popup.width;

  let left: number;
  if (rightLeft + popup.width <= viewport.width) {
    left = rightLeft;
  } else if (leftLeft >= 0) {
    left = leftLeft;
  } else {
    left = (viewport.width - popup.width) / 2;
  }

  // --- Vertical: align to anchor top, drop below if it overflows bottom ---
  let top = anchor.top;
  if (top + popup.height > viewport.height) {
    const below = anchor.top + anchor.height + GUTTER;
    top = below;
  }

  // --- Final clamp so the popup is always fully on-screen (gutter margin) ---
  left = clamp(left, GUTTER, viewport.width - popup.width - GUTTER);
  top = clamp(top, GUTTER, viewport.height - popup.height - GUTTER);

  return { top, left };
}
