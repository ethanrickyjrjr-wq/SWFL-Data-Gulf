/** Pure gradient helpers for ZIP choropleth coloring. No mock data imported here. */

function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
function lerpColor(c1: string, c2: string, t: number) {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(lerp(b1, b2, t))})`;
}

const FALLBACK_COLOR = "#2a3942";

/** Flood gradient — matches the homepage MapCanvas palette. */
export const FLOOD_GRADIENT = {
  low: 600,
  high: 30074,
  c0: "#33525e",
  c1: "#d4b370",
  c2: "#e08158",
} as const;

/**
 * Compute a choropleth fill color for a value along a three-stop gradient.
 * Returns FALLBACK_COLOR when val is undefined (no data for this ZIP).
 */
export function computeZipGradient(
  val: number | undefined,
  low: number,
  high: number,
  c0: string,
  c1: string,
  c2: string,
): string {
  if (val === undefined) return FALLBACK_COLOR;
  const t = Math.max(0, Math.min(1, (val - low) / (high - low)));
  return t < 0.5 ? lerpColor(c0, c1, t * 2) : lerpColor(c1, c2, (t - 0.5) * 2);
}
