/**
 * lib/email/activation/render.ts — assemble a branded report email (deterministic).
 *
 * `reportToEmailHtml` is now a thin wrapper over the convergence spine
 * (`lib/email/grounded-report.ts`): it maps the activation `AssembledReport` into the
 * general `GroundedReportModel`, renders the email skin, then injects the unsubscribe
 * token AFTER the render (the render-template assert would otherwise reject the inner
 * `{{RESEND_UNSUBSCRIBE_URL}}`), reusing the scheduler's idempotent injector. All
 * body-building logic — hero/metrics/reads repeats, the dark delta block, the brand
 * tokens — lives in the spine so every lane shares one grounded render path. NO LLM
 * here: every number comes from the `AssembledReport` (whose facts came from the
 * grounded dossier engine). The email output is byte-identical to the pre-spine render
 * (golden-equivalence test in `lib/email/grounded-report.test.ts`).
 */

import { ensureUnsubscribeToken } from "@/lib/email/scheduler";
import { renderGroundedReport, assembledReportToModel } from "@/lib/email/grounded-report";
import type { AssembledReport } from "./snapshot";
import type { ActivationBrand, ReportDelta } from "./types";

export interface RenderReportOptions {
  brand?: ActivationBrand | null;
  /** When present, render email #2's "what changed" block at the top. */
  delta?: ReportDelta | null;
  /** Single CTA target (default the white-label gate at /pricing). */
  ctaUrl?: string;
  /** Absolute site origin for the "view full report" link (default the live site). */
  siteOrigin?: string;
}

/**
 * Render a branded report email from already-assembled grounded facts.
 * Out-of-scope reports must not reach here — the caller assembles + scope-gates first.
 */
export async function reportToEmailHtml(
  report: AssembledReport,
  opts: RenderReportOptions = {},
): Promise<string> {
  const model = assembledReportToModel(report, {
    delta: opts.delta,
    ctaUrl: opts.ctaUrl,
    siteOrigin: opts.siteOrigin,
  });
  const html = await renderGroundedReport(model, { skin: "email", brand: opts.brand ?? null });
  // Inject the unsubscribe token (email-only; the assert in renderEmailTemplate would
  // reject the inner {{RESEND_UNSUBSCRIBE_URL}} pre-render).
  return ensureUnsubscribeToken(html);
}
