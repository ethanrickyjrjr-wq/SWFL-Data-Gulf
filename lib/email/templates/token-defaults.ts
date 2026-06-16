import { SWFL_THEME } from "@/scripts/email/types";

// Derived from: grep -oh "{{[A-Z_]*}}" templates/html/email/*.html | sort -u
export type TokenKey =
  | "PRIMARY" // brand background: header, circles, bars, body bg
  | "ACCENT" // brand highlight: links, numbers, accent lines
  | "MANGROVE" // positive delta indicator (up arrows, growth)
  | "CORAL" // caution/softening indicator (not red, not gold)
  | "TEXT_PRIMARY" // primary body text (warm white on dark; dark navy on print)
  | "TEXT_DIM" // secondary text on dark backgrounds
  | "BAR_TRACK" // empty bar track background
  | "BAR_ACCENT2" // second distinct bar color (3rd tier — teal/cyan on print)
  | "BAR_MID" // mid-tier bar fill
  | "BAR_LOW" // low-tier bar fill
  | "BADGE_DIM" // dimmed rank badge / circle background
  | "MAP_URL" // static map image URL (Mapbox or similar)
  | "SURFACE" // kept for backward-compat; unused in dark templates
  | "TEXT" // kept for backward-compat; unused in dark templates
  | "FONT_FAMILY"
  | "BORDER_RADIUS"
  | "COMPANY_NAME"
  | "LOGO_URL"
  | "TAGLINE"
  | "WEBSITE_URL"
  | "CONTACT_EMAIL" // reply-to / contact address shown in footer
  | "CONTACT_PHONE" // phone number shown in footer
  | "DISCLAIMER"
  // ── email-hero CONTENT tokens (data-driven digest; filled by buildHeroTokens) ──
  // Neutral fallbacks below so a hero render WITHOUT digest data (report-digest
  // fallback, scoped, or a plain hero send) stays valid + sparse — renderEmailTemplate
  // throws on any unfilled {{TOKEN}}, so every one must have a default. "—" = not held
  // this run (never an invented number).
  | "HERO_KICKER"
  | "HERO_VALUE"
  | "HERO_LABEL"
  | "HERO_PROSE"
  | "STAT1_VALUE"
  | "STAT1_LABEL"
  | "STAT2_VALUE"
  | "STAT2_LABEL"
  | "STAT3_VALUE"
  | "STAT3_LABEL"
  | "SIGNAL_KICKER"
  | "SIGNAL_TITLE"
  | "SIGNAL_BODY";

// PRIMARY/ACCENT/LOGO_URL derive from SWFL_THEME — never hardcoded.
export const SWFL_TOKEN_DEFAULTS: Record<TokenKey, string> = {
  PRIMARY: SWFL_THEME.primary,
  ACCENT: SWFL_THEME.accent,
  MANGROVE: "#5bc97a", // mangrove green — positive, growth, bullish
  CORAL: "#e08158", // sunset coral — caution, softening (not red, not gold)
  TEXT_PRIMARY: "#f0ede6", // primary body text (swap to dark for print variant)
  TEXT_DIM: "#b8b4a8", // warm secondary text on dark backgrounds
  BAR_TRACK: "rgba(255,255,255,0.10)",
  BAR_ACCENT2: "rgba(255,255,255,0.48)", // 3rd bar tier — override per theme
  BAR_MID: "rgba(255,255,255,0.35)",
  BAR_LOW: "rgba(255,255,255,0.20)",
  BADGE_DIM: "rgba(255,255,255,0.15)",
  MAP_URL: "",
  LOGO_URL: SWFL_THEME.logoUrl ?? "",
  SURFACE: "#ffffff",
  TEXT: "#111827",
  FONT_FAMILY: "'Inter', sans-serif",
  BORDER_RADIUS: "8px",
  COMPANY_NAME: "SWFL Data Gulf",
  TAGLINE: "Southwest Florida Intelligence",
  WEBSITE_URL: "https://www.swfldatagulf.com",
  CONTACT_EMAIL: "hello@swfldatagulf.com",
  CONTACT_PHONE: "(239) 555-5555",
  DISCLAIMER:
    "You are receiving this email because you subscribed to SWFL Data Gulf. To unsubscribe, use the link below.",
  // email-hero content fallbacks — "—" never reads as an invented figure.
  HERO_KICKER: "Market Spotlight",
  HERO_VALUE: "—",
  HERO_LABEL: "Southwest Florida",
  HERO_PROSE: "Southwest Florida market intelligence.",
  STAT1_VALUE: "—",
  STAT1_LABEL: "Median DOM",
  STAT2_VALUE: "—",
  STAT2_LABEL: "Months of Supply",
  STAT3_VALUE: "—",
  STAT3_LABEL: "Sale / List Ratio",
  SIGNAL_KICKER: "Signal to Watch",
  SIGNAL_TITLE: "This week in Southwest Florida",
  SIGNAL_BODY: "From this week's Southwest Florida city pulse.",
};

export type TemplateTokens = Partial<Record<TokenKey, string>>;
