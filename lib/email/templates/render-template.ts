import { renderHtmlTemplate } from "@/lib/templates/render-html-template";
import type { BrandTheme } from "@/lib/deliverable/brand-theme";
import { SWFL_TOKEN_DEFAULTS } from "./token-defaults";
import type { TemplateTokens } from "./token-defaults";
import { EMAIL_TEMPLATES } from "./template-registry";
import type { TemplateSlug } from "./template-registry";

export interface TemplateData {
  chart?: string; // fills [ CHART ] placeholder if present in shell
  body?: string; // fills [ BODY TEXT ] placeholder if present in shell
  delta?: string; // fills [ DELTA ] placeholder; ALWAYS replaced (empty when absent)
  repeats?: Record<string, Array<Record<string, string | number>>>; // per-block row data
}

// NULL = no brand on file. Caller must prompt user — never fall back to SWFL colors.
export function brandThemeToTokens(theme: BrandTheme | null | undefined): Partial<TemplateTokens> {
  if (!theme) return {};
  return {
    ...(theme.primary ? { PRIMARY: theme.primary } : {}),
    ...(theme.accent ? { ACCENT: theme.accent } : {}),
    ...(theme.logoUrl ? { LOGO_URL: theme.logoUrl } : {}),
  };
}

export async function renderEmailTemplate(
  slug: TemplateSlug,
  tokens?: Record<string, string | number>,
  data?: TemplateData,
): Promise<string> {
  const resolvedSlug = EMAIL_TEMPLATES[slug];
  const merged = { ...SWFL_TOKEN_DEFAULTS, ...tokens };

  let html = await renderHtmlTemplate(resolvedSlug, merged, data?.repeats);

  // CHART/BODY/DELTA are always replaced — an absent value must not leave a
  // literal `[ CHART ]` / `[ BODY TEXT ]` / `[ DELTA ]` bracket slot.
  html = html.replace(/\[\s*CHART\s*\]/g, data?.chart ?? "");
  html = html.replace(/\[\s*BODY TEXT\s*\]/g, data?.body ?? "");
  html = html.replace(/\[\s*DELTA\s*\]/g, data?.delta ?? "");

  // Assert no uppercase tokens remain — any still-unfilled {{KEY}} is a bug.
  // Triple-brace {{{RESEND_UNSUBSCRIBE_URL}}} is NOT checked here; that guard
  // lives only at broadcast/route.ts to avoid hard-failing transactional renders.
  const remaining = html.match(/\{\{[A-Z_]+\}\}/g);
  if (remaining) throw new Error(`Unfilled tokens: ${remaining.join(", ")}`);

  return html;
}
