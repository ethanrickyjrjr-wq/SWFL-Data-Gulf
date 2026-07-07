// lib/email/outreach/drip-email.ts
//
// Compose ONE recurring cold-outreach drip email: a single brand-themed chart + a
// brief professional explanation + a "create your own" CTA, all skinned in the
// RECIPIENT's scraped brand. Deterministic; the chart/explanation/CTA are passed in
// (the campaign layer assembles them per recipient). NO LLM here.
//
// The unsubscribe footer is injected post-render by ensureUnsubscribeToken — the
// {{{RESEND_UNSUBSCRIBE_URL}}} token must NOT be in the shell or renderEmailTemplate's
// unfilled-token assert rejects its inner {{...}} (mirrors lib/email/activation/render.ts).

import { renderEmailTemplate, brandThemeToTokens } from "@/lib/email/templates/render-template";
import { renderChart } from "@/lib/email/templates/charts/chart-renderer";
import type { EmailChartSpec } from "@/lib/email/templates/charts/chart-types";
import { ensureUnsubscribeToken } from "@/lib/email/scheduler";
import type { ActivationBrand } from "@/lib/email/activation/types";
import { SWFL_THEME } from "@/scripts/email/types";

export interface DripEmailInput {
  /** The recipient's brand (scraped via enrichBrand, or the SWFL house brand on low confidence). */
  brand: ActivationBrand;
  /** Short uppercase eyebrow, e.g. "FORT MYERS BEACH · MARKET PULSE". */
  kicker: string;
  /** The takeaway headline, in plain English (the chart's spoken summary). */
  title: string;
  /** The one chart for this send (already built from the recipient's market data). */
  chart: EmailChartSpec;
  /** 1–3 sentences of professional "what this means" prose (plain text or simple HTML). */
  explanation: string;
  /** The "create your own" destination — the branded /welcome arrival (buildArrivalUrl). */
  ctaUrl: string;
  /** Freshness line shown under the CTA, e.g. "Live data token: SWFL-7421-v5-20260620". */
  freshness: string;
  /** Email subject line. */
  subject: string;
  /** CAN-SPAM physical postal address, appended to the footer. Required by the live-send adapters. */
  postalAddress?: string;
  // ── demo-email sections (all optional; legacy drip callers unchanged) ──
  /** Hidden inbox-preview line. */
  preheader?: string;
  /** Cited stat row (≤3 cells) rendered between explanation and buttons. */
  stats?: Array<{ label: string; value: string }>;
  /** Tappable AI questions — deep links to the branded arrival with a seeded prompt. */
  promptButtons?: Array<{ label: string; url: string }>;
  /** T2 computed "what moved" line (bold, above the stats). */
  deltaLine?: string | null;
  /** CTA button text; defaults to the legacy drip label. */
  ctaLabel?: string;
  /** Deduped source names rendered as a small muted footer line. */
  sources?: string[];
}

export interface DripEmail {
  html: string;
  subject: string;
}

/** Map the recipient brand → the chart renderer's theme (series in their accent). */
function chartThemeFromBrand(brand: ActivationBrand) {
  const theme: { primary?: string; accent?: string } = {};
  if (brand.primary) theme.primary = brand.primary;
  if (brand.accent) theme.accent = brand.accent;
  return theme;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * CAN-SPAM: append a physical postal-address line just before </body> (or at the end
 * if there's no </body>). Pure + idempotent (a no-op if the escaped address is already
 * present). The live-send adapters REFUSE to send without an address, so a real send
 * always carries one; previews render it only when configured.
 */
export function appendPostalAddress(html: string, postalAddress: string): string {
  const safe = escapeHtml(postalAddress.trim());
  if (!safe || html.includes(safe)) return html;
  const footer = `<p style="font-size:12px;color:#999;text-align:center;margin:0 0 16px">${safe}</p>`;
  const closeBody = html.lastIndexOf("</body>");
  return closeBody !== -1
    ? html.slice(0, closeBody) + footer + html.slice(closeBody)
    : html + footer;
}

// Literal font stack for body-slot HTML — body is injected AFTER token replacement,
// so a {{FONT_FAMILY}} inside it would trip the unfilled-token assert.
const FONT = "Arial, Helvetica, sans-serif";

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function statsHtml(stats: NonNullable<DripEmailInput["stats"]>): string {
  const width = Math.floor(100 / Math.max(stats.length, 1));
  const cells = stats
    .map(
      (s) => `
    <td align="center" width="${width}%" style="padding:10px 6px;">
      <div style="font-family:${FONT}; font-size:20px; font-weight:bold; color:#111827;">${escapeHtml(s.value)}</div>
      <div style="font-family:${FONT}; font-size:12px; color:#6b7280; margin-top:2px;">${escapeHtml(s.label)}</div>
    </td>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:12px 0 4px; border-top:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb;"><tr>${cells}</tr></table>`;
}

function promptButtonsHtml(
  buttons: NonNullable<DripEmailInput["promptButtons"]>,
  accent: string,
): string {
  const rows = buttons
    .map(
      (b) => `
    <tr><td align="center" style="padding:4px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td align="center" style="border:2px solid ${accent}; border-radius:8px;">
          <a href="${escapeAttr(b.url)}" style="display:block; padding:11px 16px; font-family:${FONT}; font-size:14px; font-weight:bold; color:${accent}; text-decoration:none;">${escapeHtml(b.label)}</a>
        </td></tr></table>
    </td></tr>`,
    )
    .join("");
  return `<div style="font-family:${FONT}; font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#6b7280; margin:16px 0 6px;">Ask the AI — it answers live</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>`;
}

/**
 * Render the branded drip email HTML + subject. The chart is themed with the
 * recipient's accent so the data series shows in THEIR color; the masthead/CTA use
 * brandThemeToTokens (PRIMARY/ACCENT/LOGO_URL). Absent brand fields fall back to the
 * shell's SWFL defaults — the caller decides whether a low-confidence scrape should
 * pass the SWFL house brand instead of guessed colors.
 *
 * The optional demo sections (preheader / stats / promptButtons / deltaLine /
 * ctaLabel / sources) compose into the body slot; legacy callers render unchanged.
 */
export async function renderDripEmail(input: DripEmailInput): Promise<DripEmail> {
  const brandTokens = brandThemeToTokens({
    primary: input.brand.primary ?? null,
    accent: input.brand.accent ?? null,
    logoUrl: input.brand.logoUrl ?? null,
  });

  const tokens: Record<string, string | number> = {
    ...brandTokens,
    KICKER: input.kicker,
    TITLE: input.title,
    CTA_URL: input.ctaUrl,
    // The registry default is "View Listing" — the drip ALWAYS overrides it.
    CTA_LABEL: input.ctaLabel ? escapeHtml(input.ctaLabel) : "Create your own report &rarr;",
    PREHEADER: escapeHtml(input.preheader ?? ""),
    FRESHNESS: input.freshness,
    ...(input.brand.companyName ? { COMPANY_NAME: input.brand.companyName } : {}),
  };

  const chartHtml = renderChart(input.chart, chartThemeFromBrand(input.brand));

  const accent = input.brand.accent ?? SWFL_THEME.accent;
  const body = [
    input.explanation,
    input.deltaLine
      ? `<p style="font-family:${FONT}; font-size:15px; line-height:1.55; color:#374151; margin:10px 0 0;"><strong>${escapeHtml(input.deltaLine)}</strong></p>`
      : "",
    input.stats?.length ? statsHtml(input.stats) : "",
    input.promptButtons?.length ? promptButtonsHtml(input.promptButtons, accent) : "",
    // Collapsed accordion, not an inline line — native <details> (no JS in an inbox,
    // so this is the email-safe version of the same rule components/CitationList.tsx
    // enforces everywhere else: sources are click-to-open, never inline text).
    input.sources?.length
      ? `<details style="margin:14px 0 0;"><summary style="font-family:${FONT}; font-size:11px; color:#9ca3af; cursor:pointer;">Sources (${input.sources.length})</summary><p style="font-family:${FONT}; font-size:11px; line-height:1.5; color:#9ca3af; margin:6px 0 0;">${input.sources.map(escapeHtml).join(" &middot; ")}</p></details>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const rendered = await renderEmailTemplate("outreach", tokens, {
    chart: chartHtml,
    body,
  });

  // CAN-SPAM footer: per-recipient unsubscribe link (idempotent) + the physical postal
  // address when supplied (the live-send adapters require it before sending).
  let html = ensureUnsubscribeToken(rendered);
  if (input.postalAddress) html = appendPostalAddress(html, input.postalAddress);
  return { html, subject: input.subject };
}
