/**
 * Brand color palettes — account-level "schemes" a user builds over time.
 *
 * A palette is the four brand colors mapped to the four BrandingBlock save
 * slots — the same four `EmailGlobalStyle` colors deliverables render:
 *   colors[0] = primary    (→ branding.primary_color, read by brand-theme.ts)
 *   colors[1] = accent     (→ branding.accent_color)
 *   colors[2] = text       (→ branding.text_color → globalStyle.textColor)
 *   colors[3] = background (→ branding.backdrop_color → globalStyle.backdropColor)
 *
 * Palettes live on `user_brand_profiles.color_palettes` (jsonb) so they carry
 * to NEW projects (pre-fill) without rewriting branding already saved on past
 * projects. This module is the single place that defines the shape + validates
 * it, so the API route, the workspace, and the picker all agree. (Legacy
 * 3-color palettes read colors[3]="" — backward-compatible.)
 */

export interface BrandPalette {
  id: string;
  name: string;
  colors: [string, string, string, string]; // [primary, accent, text, background]
}

/** The four branding-blob keys the four palette colors map onto, in order. */
export const PALETTE_SLOT_KEYS = [
  "primary_color",
  "accent_color",
  "text_color",
  "backdrop_color",
] as const;

const MAX_PALETTES = 24;
const MAX_NAME = 40;

/** Normalize loose hex (`abc`, `#ABC`, `001122`) to `#rrggbb`, or null. */
export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let v = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v))
    v = v
      .split("")
      .map((c) => c + c)
      .join("");
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

/** The four slot colors currently set on a branding blob (empty string if unset). */
export function schemeFromBranding(
  branding: Record<string, string> | null | undefined,
): [string, string, string, string] {
  const b = branding ?? {};
  return PALETTE_SLOT_KEYS.map((k) => normalizeHex(b[k]) ?? "") as [string, string, string, string];
}

/** True when a scheme has at least one real color. */
export function schemeHasColor(scheme: [string, string, string, string]): boolean {
  return scheme.some((c) => !!c);
}

/** Two schemes are the same palette when all four slots match (case-insensitive). */
export function schemesEqual(a: string[], b: string[]): boolean {
  return [0, 1, 2, 3].every((i) => (a[i] ?? "").toLowerCase() === (b[i] ?? "").toLowerCase());
}

/**
 * The default scheme to seed a NEW project's colors with: the first saved
 * palette if any, else the primary/accent/text/backdrop columns. Empty slots
 * stay "" when a column is unset.
 */
export function defaultScheme(
  profile: Record<string, unknown> | null | undefined,
): [string, string, string, string] {
  const pals = sanitizePalettes(profile?.color_palettes);
  if (pals.length) return pals[0].colors;
  const p = normalizeHex(profile?.primary_color) ?? "";
  const a = normalizeHex(profile?.accent_color) ?? "";
  const t = normalizeHex(profile?.text_color) ?? "";
  const bg = normalizeHex(profile?.backdrop_color) ?? "";
  return [p, a, t, bg];
}

/** Stable id for a new palette (browser/runtime crypto, falls back to time+rand). */
export function newPaletteId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `pal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate/clean an untrusted palettes array (request body or DB row). Drops
 * malformed entries, normalizes colors, caps count + name length, and dedupes
 * by scheme so the library never grows unbounded or stores junk.
 */
export function sanitizePalettes(input: unknown): BrandPalette[] {
  if (!Array.isArray(input)) return [];
  const out: BrandPalette[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const rawColors = Array.isArray(r.colors) ? r.colors : [];
    const colors = [0, 1, 2, 3].map((i) => normalizeHex(rawColors[i]) ?? "") as [
      string,
      string,
      string,
      string,
    ];
    if (!schemeHasColor(colors)) continue;
    const key = colors.map((c) => c.toLowerCase()).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const id = typeof r.id === "string" && r.id.trim() ? r.id.trim().slice(0, 64) : newPaletteId();
    const name =
      typeof r.name === "string" && r.name.trim()
        ? r.name.trim().slice(0, MAX_NAME)
        : `Palette ${out.length + 1}`;
    out.push({ id, name, colors });
    if (out.length >= MAX_PALETTES) break;
  }
  return out;
}
