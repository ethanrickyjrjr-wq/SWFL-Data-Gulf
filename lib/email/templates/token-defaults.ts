import { SWFL_THEME } from "@/scripts/email/types";

// Derived from: grep -oh "{{[A-Z_]*}}" templates/html/email/*.html | sort -u
export type TokenKey =
  | "PRIMARY"
  | "ACCENT"
  | "SURFACE"
  | "TEXT"
  | "FONT_FAMILY"
  | "BORDER_RADIUS"
  | "COMPANY_NAME"
  | "LOGO_URL"
  | "TAGLINE"
  | "WEBSITE_URL"
  | "DISCLAIMER";

// PRIMARY/ACCENT/LOGO_URL derive from SWFL_THEME — never hardcoded.
export const SWFL_TOKEN_DEFAULTS: Record<TokenKey, string> = {
  PRIMARY: SWFL_THEME.primary,
  ACCENT: SWFL_THEME.accent,
  LOGO_URL: SWFL_THEME.logoUrl ?? "",
  SURFACE: "#ffffff",
  TEXT: "#111827",
  FONT_FAMILY: "'Inter', sans-serif",
  BORDER_RADIUS: "8px",
  COMPANY_NAME: "SWFL Data Gulf",
  TAGLINE: "Southwest Florida Intelligence",
  WEBSITE_URL: "https://www.swfldatagulf.com",
  DISCLAIMER:
    "You are receiving this email because you subscribed to SWFL Data Gulf. To unsubscribe, use the link below.",
};

export type TemplateTokens = Partial<Record<TokenKey, string>>;
