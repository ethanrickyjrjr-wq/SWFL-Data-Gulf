// lib/brand/brandfetch.ts
//
// THE Brandfetch root (Task 11, docs/superpowers/plans/2026-07-16-competitor-switch-onboarding-p1.md).
// Endpoint + response shape verified live via crawl4ai against
// https://docs.brandfetch.com/reference/brand-api-domain (fetched 2026-07-16):
//   GET https://api.brandfetch.io/v2/brands/domain/{domain}
//   Authorization: Bearer <token>   (required)
//   200 -> { name, domain, logos:[{formats:[{src,background,...}]}],
//            colors:[{hex,brightness}], fonts:[{name,originId,weights}],
//            qualityScore, ... }
//   400 -> {message:"Bad Request"} · 401 -> {message:"Unauthorized"} ·
//   404 -> {message:"<Not Found> or <Invalid Domain Name>"} (no brand for
//     this domain -- NOT an empty 200 payload) · 429 -> {message:"API key
//     quota exceeded"}.
//   qualityScore is CONFIRMED "a score between 0-1" per the live reference
//   page (the outreach pilot's original comment hedged this as "unconfirmed"
//   before this pass -- now pinned).
//   `type`/`theme` discriminators on logos/colors/fonts (e.g. colors[].type
//   "brand"/"accent"/"dark"/"light") are REAL in practice but ELIDED from
//   Brandfetch's own published response schema -- pinned instead against the
//   committed probe fixture scripts/outreach/__fixtures__/brandfetch-sample.json
//   (a real quota-free fetch of brandfetch.com's own brand).
//
// ONE root: scripts/outreach/pilot-lib.mts (operator outreach pilot) imports
// BrandfetchBrand + mapBrandfetchResponse from HERE rather than forking its
// own copy. app/api/switch/apply-forward's campaign branch (this task) is
// the other consumer, via fetchBrandKit + fillEmptyBrandFields. Never fork
// this mapping a second time -- extend it here.
//
// fetchBrandKit is best-effort: missing env key, non-OK response, malformed
// JSON, or a thrown network error all resolve null. Brand fill is a nicety,
// never a gate on anything that calls it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { bankBrandFields } from "@/lib/brand/bank-brand-fields";

export interface BrandfetchLogo {
  type?: string;
  theme?: string;
  formats?: { src?: string; format?: string; background?: string }[];
}

export interface BrandfetchColor {
  hex?: string;
  type?: string;
  brightness?: number;
}

export interface BrandfetchFont {
  name?: string;
  type?: string;
}

export interface BrandfetchBrand {
  name?: string;
  domain?: string;
  logos?: BrandfetchLogo[];
  colors?: BrandfetchColor[];
  fonts?: BrandfetchFont[];
  qualityScore?: number;
}

/** The trimmed-down shape every consumer of a Brandfetch lookup actually
 *  wants -- never the raw vendor payload. `colors` is ordered [primary,
 *  accent, ...rest] using the same type-aware preference as the outreach
 *  pilot's fixture-mapper (type:"brand" wins primary, type:"accent" wins
 *  second) so both consumers agree on what "the" brand color is. Empty
 *  arrays / null logoUrl are valid results, not failures -- a brand with a
 *  logo but no confirmed palette (or vice versa) is still worth a partial
 *  fill. We never invent a color or font that isn't in the response. */
export interface BrandKit {
  logoUrl: string | null;
  colors: string[];
  fonts: string[];
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Pure mapper -- no network, no env. Fixture-driven tests pin this against
 *  scripts/outreach/__fixtures__/brandfetch-sample.json. */
export function mapBrandfetchResponse(raw: BrandfetchBrand): BrandKit {
  const validColors = (raw.colors ?? []).filter(
    (c): c is BrandfetchColor & { hex: string } => typeof c.hex === "string" && HEX6.test(c.hex),
  );
  const primary = validColors.find((c) => c.type === "brand") ?? validColors[0];
  const accent =
    validColors.find((c) => c !== primary && c.type === "accent") ??
    validColors.find((c) => c !== primary);
  const rest = validColors.filter((c) => c !== primary && c !== accent);
  const colors = [primary, accent, ...rest]
    .filter((c): c is BrandfetchColor & { hex: string } => c !== undefined)
    .map((c) => c.hex);

  let logoUrl: string | null = null;
  for (const logo of raw.logos ?? []) {
    for (const f of logo.formats ?? []) {
      if (!f.src) continue;
      if (!logoUrl) logoUrl = f.src;
      if (f.background === "transparent" && (f.src.endsWith(".svg") || f.src.endsWith(".png"))) {
        logoUrl = f.src;
        break;
      }
    }
  }

  const fonts = (raw.fonts ?? []).map((f) => f.name).filter((n): n is string => !!n);

  return { logoUrl, colors, fonts };
}

/** Live fetch + map. Reuses `process.env.brandfetch_key` VERBATIM -- the one
 *  live key this repo already has (scripts/outreach/brand-pilot.mts reads
 *  the same name out of .env.local; yes, lowercase, not our usual SCREAMING
 *  convention). Returns null on any failure: unset key, non-2xx response
 *  (400/401/404/429/5xx), a body that isn't valid JSON, or a thrown network
 *  error -- never throws itself. */
export async function fetchBrandKit(domain: string): Promise<BrandKit | null> {
  const key = process.env.brandfetch_key;
  if (!key) return null;

  try {
    const res = await fetch(`https://api.brandfetch.io/v2/brands/domain/${domain}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as BrandfetchBrand;
    return mapBrandfetchResponse(raw);
  } catch {
    return null;
  }
}

/** Writes ONLY the `user_brand_profiles` fields that are currently
 *  NULL/empty -- never clobbers a value an agent typed themselves. Delegates
 *  to `bankBrandFields` (lib/brand/bank-brand-fields.ts), the same
 *  blank-only-upward-bank helper the account brand panel already uses, so
 *  there is ONE empty-fields-only write path rather than a second copy of
 *  that logic. `bankBrandFields` is already best-effort (never throws), so
 *  this stays a thin adapter: build the candidate patch from the kit, hand
 *  it off.
 *
 *  Fonts are intentionally NOT written here: `font_display`/`font_body`
 *  store FontFamily enum keys (MODERN_SANS, LATO_SANS, ...; see
 *  lib/brand/fonts.ts), not raw vendor font names ("Inter", "Poppins") --
 *  writing the raw name would be an invented enum value, not a real one.
 *  `kit.fonts` is still returned by `fetchBrandKit` for whatever consumer
 *  needs the raw names (e.g. a rebuilt-campaign render, not the account
 *  profile). */
export async function fillEmptyBrandFields(
  db: SupabaseClient,
  userId: string,
  kit: BrandKit,
): Promise<void> {
  const patch: Record<string, string> = {};
  if (kit.logoUrl) patch.logo_url = kit.logoUrl;
  if (kit.colors[0]) patch.primary_color = kit.colors[0];
  if (kit.colors[1]) patch.accent_color = kit.colors[1];
  if (Object.keys(patch).length === 0) return;
  await bankBrandFields(db, userId, patch);
}
