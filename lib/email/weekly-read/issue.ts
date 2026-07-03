// lib/email/weekly-read/issue.ts
//
// One weekly-read issue, routed through the FULL deliverable engine (operator
// ruling 07/03/2026): the runner injects the real seams — buildContentDoc (the
// ONE Email Lab build root: lake context, stale-figure web refresh, chart,
// authored-prose lint) and renderEmailDocHtml (the ONE EmailDoc→HTML root) —
// and this module decides. Mirrors lib/email/emaildoc-occurrence.ts with one
// deliberate inversion: the scheduled lane ships the saved doc when the AI fill
// falls through (applied:false); weekly-read SKIPS the ZIP instead — an unfilled
// house skeleton is not a market read, and a skipped week is honest.
//
// Pure + dependency-injected; no Supabase, no Anthropic, no react imports here.

import { seedById, defaultDoc } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";
import { deriveEmailDocSubject } from "@/lib/email/emaildoc-subject";
import { ensureUnsubscribeToken } from "@/lib/email/scheduler";
import type { BuildScope } from "@/lib/email/build-doc";

const FONT = "Arial, Helvetica, sans-serif";

/** The authoring instruction for one ZIP's issue. Content only — the engine owns
 *  sourcing (cited figures quoted verbatim) and the no-invention lint. */
export function weeklyReadPrompt(zip: string, place: string | null): string {
  const where = place ? `${place} (ZIP ${zip})` : `ZIP ${zip}`;
  return (
    `Write this week's short market read for ${where}. ` +
    `Lead with the most notable cited change this week; then 2-3 short paragraphs of ` +
    `plain-English commentary on what it means for people who own, rent, or invest there, ` +
    `quoting cited figures verbatim. Keep it tight — this is a one-minute weekly email.`
  );
}

/** A fresh house seed doc per build — the "market-letter" editorial canvas with the
 *  hero re-labeled for this ZIP's weekly read. seedById().build() constructs a new
 *  doc each call, so mutation here never leaks across builds. */
export function weeklyReadSeedDoc(zip: string, place: string | null): EmailDoc {
  const doc = seedById("market-letter")?.build() ?? defaultDoc();
  for (const b of doc.blocks) {
    if (b.type === "hero") {
      const props = b.props as { kicker?: string; label?: string };
      props.kicker = "This Week in SWFL";
      props.label = place ? `${place} · ${zip}` : `ZIP ${zip}`;
    }
  }
  return doc;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/** Insert `fragment` just before </body> (or append when there is none). */
function beforeCloseBody(html: string, fragment: string): string {
  const closeBody = html.lastIndexOf("</body>");
  return closeBody !== -1
    ? html.slice(0, closeBody) + fragment + html.slice(closeBody)
    : html + fragment;
}

export interface FinalizeOpts {
  /** "Build your own" destination — the zip-report page hosting OpenProjectCta. */
  ctaUrl: string;
  /** CAN-SPAM physical postal address. The runner refuses a live send without one. */
  postalAddress?: string;
}

/**
 * Weekly-read presentation footer over the engine-rendered doc: the funnel CTA,
 * the unsubscribe token (shared root — idempotent when the doc already carries
 * one), and the postal address. send.ts substitutes the per-subscriber URL.
 */
export function finalizeIssueHtml(html: string, opts: FinalizeOpts): string {
  const cta =
    `<div style="text-align:center;margin:24px 0 8px;">` +
    `<a href="${escapeAttr(opts.ctaUrl)}" style="font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;background:#0d9488;text-decoration:none;padding:12px 28px;border-radius:8px;display:inline-block;">Build your own version &rarr;</a>` +
    `<p style="font-family:${FONT};font-size:12px;color:#6b7280;margin:10px 0 0;">Free to build — seed a branded project for your patch, style it, send it when you&#39;re ready.</p>` +
    `</div>`;
  let out = ensureUnsubscribeToken(beforeCloseBody(html, cta));
  if (opts.postalAddress?.trim()) {
    out = beforeCloseBody(
      out,
      `<p style="font-family:${FONT};font-size:12px;color:#999;text-align:center;margin:0 0 16px;">${escapeHtml(opts.postalAddress.trim())}</p>`,
    );
  }
  return out;
}

export interface WeeklyIssueDeps {
  /** The Email Lab build root (buildContentDoc mode:"quality") — `applied` MUST reflect
   *  whether the AI fill landed; weekly-read never ships an unfilled skeleton. */
  buildDoc: (args: {
    prompt: string;
    rawDoc: EmailDoc;
    scope?: BuildScope;
  }) => Promise<{ doc: EmailDoc; applied: boolean }>;
  /** The ONE EmailDoc→HTML root (renderEmailDocHtml). */
  renderDoc: (doc: EmailDoc) => Promise<string>;
}

export interface WeeklyIssue {
  html: string;
  subject: string;
}

/** Build ONE ZIP's weekly issue through the full engine. null = skip this ZIP
 *  (fill didn't apply) — every subscriber in it waits for next week's run. */
export async function buildWeeklyIssue(
  zip: string,
  place: string | null,
  deps: WeeklyIssueDeps,
  opts: FinalizeOpts,
): Promise<WeeklyIssue | null> {
  const rawDoc = weeklyReadSeedDoc(zip, place);
  const prompt = weeklyReadPrompt(zip, place);
  const { doc, applied } = await deps.buildDoc({
    prompt,
    rawDoc,
    scope: { kind: "zip", value: zip },
  });
  if (!applied) return null;
  const rendered = await deps.renderDoc(doc);
  return {
    html: finalizeIssueHtml(rendered, opts),
    subject: deriveEmailDocSubject(doc) || `${place ?? `ZIP ${zip}`} weekly read`,
  };
}
