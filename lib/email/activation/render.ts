/**
 * lib/email/activation/render.ts — assemble a branded report email (deterministic).
 *
 * `reportToEmailHtml` fills the `email-report.html` shell with the prospect's brand,
 * the grounded per-ZIP facts, an optional delta block, the freshness token, and a
 * single CTA. NO LLM call here — every number comes from the AssembledReport (whose
 * facts came from the grounded dossier engine). The unsubscribe token is injected
 * AFTER the template render (the render-template assert would otherwise reject the
 * inner `{{RESEND_UNSUBSCRIBE_URL}}`), reusing the scheduler's idempotent injector.
 */

import { renderEmailTemplate, brandThemeToTokens } from "@/lib/email/templates/render-template";
import { SWFL_TOKEN_DEFAULTS } from "@/lib/email/templates/token-defaults";
import { ensureUnsubscribeToken } from "@/lib/email/scheduler";
import type { AssembledReport } from "./snapshot";
import type { ActivationBrand, ReportDelta, MetricChange } from "./types";

export interface RenderReportOptions {
  brand?: ActivationBrand | null;
  /** When present, render email #2's "what changed" block at the top. */
  delta?: ReportDelta | null;
  /** Single CTA target (default the white-label gate at /pricing). */
  ctaUrl?: string;
  /** Absolute site origin for the "view full report" link (default the live site). */
  siteOrigin?: string;
}

const MAX_METRIC_ROWS = 6;
const MAX_LINES = 5;

const GOOD = "#5bc97a"; // mangrove — favorable change (reads on the dark shell)
const BAD = "#e08158"; // coral — unfavorable change
const NEUTRAL = "#b8b4a8"; // warm dim — flat / unknown

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Light markdown → email-safe HTML for a scrubbed dossier line. */
function lineToHtml(text: string, primary: string): string {
  const paras = text.split(/\n\n+/).map((block) => {
    let h = esc(block.trim());
    h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/`([^`]+?)`/g, `<code style="font-size:11px;color:${primary};">$1</code>`);
    h = h.replace(/_(.+?)_/g, "<em>$1</em>");
    h = h.replace(/\n/g, "<br/>");
    return `<p style="margin:0 0 8px 0;font-size:13px;line-height:1.55;">${h}</p>`;
  });
  return paras.join("");
}

/** YYYYMMDD inside a freshness token → "Jun 10" (null when unparseable). */
function tokenDate(token: string | null): string | null {
  if (!token) return null;
  const m = token.match(/(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatChangeValue(v: number | null, unit: string | undefined): string {
  if (v === null) return "—";
  // Heuristic: large round numbers read as currency; the metric's own display string
  // is the source of truth, but the delta works on raw numbers, so format minimally.
  return `${v.toLocaleString("en-US")}${unit ?? ""}`;
}

function metricChangeRow(c: MetricChange): string {
  let color = NEUTRAL;
  if (c.favorable === true) color = GOOD;
  else if (c.favorable === false) color = BAD;

  let detail: string;
  if (c.direction === "appeared") detail = `now reported: ${formatChangeValue(c.to, c.unit)}`;
  else if (c.direction === "disappeared") detail = `no longer reported`;
  else {
    const arrow = c.direction === "up" ? "▲" : "▼";
    detail = `${formatChangeValue(c.from, c.unit)} → ${formatChangeValue(c.to, c.unit)} <span style="color:${color};">${arrow}</span>`;
  }
  return `<tr><td style="padding:4px 0;font-size:13px;color:#f0ede6;"><strong>${esc(c.label)}</strong></td><td align="right" style="padding:4px 0;font-size:13px;color:#f0ede6;">${detail}</td></tr>`;
}

function deltaBlock(delta: ReportDelta, accent: string): string {
  const surface = "rgba(255,255,255,0.06)";
  const since = tokenDate(delta.freshness_token_prev);
  const sincePhrase = since ? ` since ${esc(since)}` : "";

  if (!delta.has_change) {
    // No-change is first-class: lead with the moved freshness token, never a fake change.
    const reVerified = tokenDate(delta.freshness_token_current);
    return (
      `<div style="background-color:${surface};border-left:3px solid ${accent};padding:12px 16px;border-radius:4px;">` +
      `<p style="margin:0;font-size:13px;line-height:1.55;color:#f0ede6;">` +
      `<strong>Re-verified${reVerified ? ` ${esc(reVerified)}` : ""}.</strong> ` +
      `We re-pulled every figure for your area and nothing material moved this cycle — here's where it stands.` +
      `</p></div>`
    );
  }

  const rows: string[] = [];
  for (const c of delta.metric_changes) rows.push(metricChangeRow(c));
  const signals = delta.signal_changes
    .map(
      (s) =>
        `<li style="font-size:13px;line-height:1.55;margin:0 0 4px 0;color:#f0ede6;">New activity: <strong>${esc(s.label)}</strong></li>`,
    )
    .join("");

  return (
    `<div style="background-color:${surface};border-left:3px solid ${accent};padding:14px 16px;border-radius:4px;">` +
    `<p style="margin:0 0 8px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${accent};">What changed${sincePhrase}</p>` +
    (rows.length
      ? `<table width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table>`
      : "") +
    (signals ? `<ul style="margin:8px 0 0 0;padding-left:18px;">${signals}</ul>` : "") +
    `</div>`
  );
}

/**
 * Render a branded report email from already-assembled grounded facts.
 * Out-of-scope reports must not reach here — the caller assembles + scope-gates first.
 */
export async function reportToEmailHtml(
  report: AssembledReport,
  opts: RenderReportOptions = {},
): Promise<string> {
  const brand = opts.brand ?? null;
  const accent = brand?.accent || SWFL_TOKEN_DEFAULTS.ACCENT;
  const ctaUrl = opts.ctaUrl ?? "https://www.swfldatagulf.com/pricing";
  const origin = opts.siteOrigin ?? "https://www.swfldatagulf.com";

  const place = report.primaryPlace ?? `ZIP ${report.zip}`;
  const county = report.countyName ? `${report.countyName} County` : "Southwest Florida";

  // Hero = the first key figure, as a 0-or-1 repeat (empty metrics → no hero number).
  const hero = report.metrics.length
    ? [{ HERO_VALUE: esc(report.metrics[0].display), HERO_LABEL: esc(report.metrics[0].label) }]
    : [];

  const metrics = report.metrics.slice(0, MAX_METRIC_ROWS).map((m) => ({
    M_LABEL: esc(m.label),
    M_VALUE: esc(m.display),
  }));

  const reads = report.lines.slice(0, MAX_LINES).map((l) => ({
    READ_HTML: lineToHtml(l.text, accent),
  }));

  // Single-value tokens (content + brand). brandThemeToTokens omits absent keys, so
  // Object.assign keeps every token value a string (no undefined leaks into the map).
  const tokens: Record<string, string | number> = {
    PLACE: esc(place),
    COUNTY: esc(county),
    ZIP: esc(report.zip),
    FRESHNESS_TOKEN: report.freshness_token ? esc(report.freshness_token) : "",
    CTA_URL: esc(ctaUrl),
    REPORT_URL: esc(`${origin}/r/zip-report/${report.zip}`),
  };
  Object.assign(
    tokens,
    brandThemeToTokens(
      brand
        ? {
            primary: brand.primary ?? null,
            accent: brand.accent ?? null,
            logoUrl: brand.logoUrl ?? null,
          }
        : null,
    ),
  );
  if (brand?.companyName) tokens.COMPANY_NAME = brand.companyName;

  const delta = opts.delta ? deltaBlock(opts.delta, accent) : "";

  // Render the branded shell, THEN inject the unsubscribe token (email-only; the assert
  // in renderEmailTemplate would reject the inner {{RESEND_UNSUBSCRIBE_URL}} pre-render).
  const html = await renderEmailTemplate("report", tokens, {
    repeats: { hero, metrics, reads },
    delta,
  });
  return ensureUnsubscribeToken(html);
}
