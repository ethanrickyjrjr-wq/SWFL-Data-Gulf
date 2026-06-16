// scripts/email/hero-tokens.mts
//
// Turn the real DigestPayload into the email-hero content tokens. The hero
// template (templates/html/email/email-hero.html) was a STATIC mockup with
// hardcoded SWFL numbers ($412K, 62 days, "Fort Myers Beach (33931) +14.2%").
// This makes it DATA-DRIVEN: every figure is a token filled from the lake here,
// never invented (MOAT rule #1 — the system cannot invent a number).
//
// NO-FABRICATION CONTRACT:
//  - a null/absent metric renders an em-dash "—", NEVER a placeholder number;
//  - labels state the grain we actually hold (county_metrics is SWFL-wide, so
//    "Southwest Florida", never "Lee County");
//  - prose rides verbatim from master's top_line (no synthesis);
//  - there is no prior-period data in DigestPayload, so the mockup's QoQ delta
//    lines are dropped from the template, not faked.
//
// Every token is a non-empty string: renderEmailTemplate throws on an unfilled
// `{{TOKEN}}`, so a sparse digest still renders (em-dashes), never crashes.

import type { DigestPayload } from "./types.ts";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** county median → "$412K", or "—" when not held (never invented). */
function fmtPrice(v: number | null): string {
  return v === null ? "—" : `$${Math.round(v / 1000).toLocaleString("en-US")}K`;
}

/** 0–1 ratio → "96.2%", or "—". */
function fmtRatio(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

/** "Jun 2026" from an ISO date (UTC, so the day never rolls the month). */
function monthYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? "Southwest Florida"
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Build the email-hero content tokens from the real digest. Pure; deterministic;
 * every value derived from `digest`, never hardcoded.
 */
export function buildHeroTokens(digest: DigestPayload): Record<string, string> {
  const cm = digest.county_metrics;

  // SIGNAL — the lead headline is the curated top_story (subject-eligible,
  // gated upstream), else the first city voice, else a neutral non-empty line.
  const lead = digest.top_story?.title ?? digest.city_voices[0]?.title ?? null;
  const signalTitle = lead ?? "This week in Southwest Florida";
  // Body = the other real city voices (city — title), or a neutral attribution.
  const others = digest.city_voices.filter((v) => v.title !== signalTitle).slice(0, 2);
  const signalBody = others.length
    ? others.map((v) => `${v.city}: ${v.title}`).join("  ·  ")
    : "From this week's Southwest Florida city pulse.";

  return {
    HERO_KICKER: `Market Spotlight · ${monthYear(digest.date)}`,
    HERO_VALUE: fmtPrice(cm.median_sale_price),
    HERO_LABEL: "Median Sale Price · Southwest Florida",
    HERO_PROSE: esc(digest.top_line?.trim() || "Southwest Florida market pulse."),

    STAT1_VALUE: cm.dom === null ? "—" : `${Math.round(cm.dom)} days`,
    STAT1_LABEL: "Median DOM",
    STAT2_VALUE: cm.months_of_supply === null ? "—" : `${cm.months_of_supply.toFixed(1)} mo`,
    STAT2_LABEL: "Months of Supply",
    STAT3_VALUE: fmtRatio(cm.avg_sale_to_list),
    STAT3_LABEL: "Sale / List Ratio",

    SIGNAL_KICKER: "Signal to Watch",
    SIGNAL_TITLE: esc(signalTitle),
    SIGNAL_BODY: esc(signalBody),
  };
}

/** The hero content-token KEYS — exported so the defaults layer can guarantee
 *  every one has a neutral fallback (a non-digest "hero" render must not throw). */
export const HERO_TOKEN_KEYS = [
  "HERO_KICKER",
  "HERO_VALUE",
  "HERO_LABEL",
  "HERO_PROSE",
  "STAT1_VALUE",
  "STAT1_LABEL",
  "STAT2_VALUE",
  "STAT2_LABEL",
  "STAT3_VALUE",
  "STAT3_LABEL",
  "SIGNAL_KICKER",
  "SIGNAL_TITLE",
  "SIGNAL_BODY",
] as const;
