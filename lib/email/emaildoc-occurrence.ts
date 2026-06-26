// lib/email/emaildoc-occurrence.ts
//
// Decision core for the scheduled block-canvas EmailDoc lane (N6). Builds ONE occurrence
// of a saved Email Lab design: load the deliverable → RE-RUN the build with fresh data →
// render → derive a subject. Dependency-injected (no Supabase, no Anthropic, no react
// imports here) so it is unit-testable with mocks — same architecture as scheduler.ts /
// scoped-content.ts. The thin runner (`scripts/email/run-schedules.mts`) supplies the
// real seams (DB read, buildContentDoc, EmailDocEmail render).
//
// Returns null — caller falls back to the global digest — when the deliverable is gone,
// is not a block-canvas EmailDoc, or carries an invalid doc. Never throws for those.

import { EmailDocSchema } from "./doc/schema";
import type { EmailDoc } from "./doc/types";
import { deriveEmailDocSubject } from "./emaildoc-subject";
import type { BuildScope } from "./build-doc";

/** The deliverable fields the lane reads (a `deliverables` row is a superset). */
export interface EmailDocDeliverable {
  doc: unknown;
  instruction: string | null;
  scope_kind: string | null;
  scope_value: string | null;
  template: string;
}

export interface EmailDocOccurrenceDeps {
  /** Load the deliverable by id, or null when absent / unreadable. */
  loadDeliverable: (id: string) => Promise<EmailDocDeliverable | null>;
  /** Re-run the Email Lab build (buildContentDoc) → the (possibly re-filled) doc. The
   *  runner's impl falls back to `rawDoc` when the AI fill didn't apply, so this always
   *  resolves to a valid, brand-true doc. */
  buildDoc: (args: { prompt: string; rawDoc: EmailDoc; scope?: BuildScope }) => Promise<EmailDoc>;
  /** Render an EmailDoc to email HTML (EmailDocEmail via @react-email/render). */
  renderDoc: (doc: EmailDoc) => Promise<string>;
  log?: (line: string) => void;
}

/** The scheduler core consumes this as `{ subject, body, emailDocHtml }`; `body` is always
 *  "" (the doc owns its HTML), and `emailDocHtml` short-circuits the template renderHtml. */
export interface EmailDocOccurrence {
  subject: string;
  body: string;
  emailDocHtml: string;
}

/** Reconstruct a neutral refresh prompt when the deliverable stored none. The saved
 *  skeleton + scope still steer the fill; a stored prompt (deliverables.instruction)
 *  additionally restores chart fidelity (the chart selector keys off the prompt). */
export function refreshPrompt(scope?: BuildScope): string {
  return `Refresh this email with the latest Southwest Florida market data${scope?.value ? ` for ${scope.value}` : ""}.`;
}

export async function buildEmailDocOccurrence(
  deliverableId: string,
  deps: EmailDocOccurrenceDeps,
): Promise<EmailDocOccurrence | null> {
  const log = deps.log ?? (() => {});
  const deliv = await deps.loadDeliverable(deliverableId);
  if (!deliv || deliv.template !== "block-canvas") {
    log(
      `[emaildoc] skip — deliverable ${deliverableId} missing or not block-canvas; digest fallback.`,
    );
    return null;
  }
  const parsed = EmailDocSchema.safeParse(deliv.doc);
  if (!parsed.success) {
    log(`[emaildoc] invalid doc for deliverable ${deliverableId}; digest fallback.`);
    return null;
  }

  // Scope + prompt ride off the DELIVERABLE row (single source of truth). A whole-region
  // design has null scope; a stored instruction is the build prompt, else a neutral refresh.
  const scope: BuildScope | undefined =
    typeof deliv.scope_kind === "string" &&
    typeof deliv.scope_value === "string" &&
    deliv.scope_value
      ? { kind: deliv.scope_kind, value: deliv.scope_value }
      : undefined;
  const stored = typeof deliv.instruction === "string" ? deliv.instruction.trim() : "";
  const prompt = stored || refreshPrompt(scope);

  const freshDoc = await deps.buildDoc({ prompt, rawDoc: parsed.data, scope });
  const emailDocHtml = await deps.renderDoc(freshDoc);
  return { subject: deriveEmailDocSubject(freshDoc), body: "", emailDocHtml };
}
