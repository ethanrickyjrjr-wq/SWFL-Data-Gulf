/**
 * lib/email/sequence/frozen-occurrence.ts — ONE occurrence of a sequence
 * one-shot: render the SAVED doc verbatim. No buildDoc, no AI refill, no figure
 * swap — "what they saw when they scheduled is what goes out" (spec, operator-
 * locked 07/05/2026). Send-now uses it too: what you see is what sends.
 * DI mirror of emaildoc-occurrence.ts minus the rebuild.
 */
import { EmailDocSchema } from "@/lib/email/doc/schema";
import type { EmailDoc } from "@/lib/email/doc/types";
import { deriveEmailDocSubject } from "@/lib/email/emaildoc-subject";
import type { EmailDocDeliverable, EmailDocOccurrence } from "@/lib/email/emaildoc-occurrence";
import { bindUnsubscribeHref } from "@/lib/email/bind-unsubscribe";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";
import { applyLinkFallbacks, subjectListingUrl } from "@/lib/email/link-audit";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";

export interface FrozenOccurrenceDeps {
  loadDeliverable: (id: string) => Promise<EmailDocDeliverable | null>;
  renderDoc: (doc: EmailDoc) => Promise<string>;
  /** The deliverable's hosted /p/<id> page — terminal link-ladder rung (see
   *  EmailDocOccurrenceDeps.hostedUrl). Optional. */
  hostedUrl?: string | null;
  log?: (line: string) => void;
}

export async function buildFrozenOccurrence(
  deliverableId: string,
  deps: FrozenOccurrenceDeps,
): Promise<EmailDocOccurrence | null> {
  const log = deps.log ?? (() => {});
  const deliv = await deps.loadDeliverable(deliverableId);
  if (!deliv || deliv.template !== "block-canvas") {
    log(`[sequence] frozen skip — deliverable ${deliverableId} missing or not block-canvas.`);
    return null;
  }
  const parsed = EmailDocSchema.safeParse(deliv.doc);
  if (!parsed.success) {
    log(`[sequence] frozen skip — invalid doc for deliverable ${deliverableId}.`);
    return null;
  }
  // Dead-link floor: the frozen CONTENT is untouchable (operator-locked freeze-at-
  // schedule), but a click-promising slot with no destination is a defect, not
  // content — the ladder fills it from the doc's own links / the hosted page.
  const ladder = applyLinkFallbacks(parsed.data, {
    listingUrl: subjectListingUrl(parsed.data),
    brandWebsiteUrl: brandWebsiteUrl(parsed.data),
    replyMailto: null,
    hostedUrl: deps.hostedUrl ?? null,
  });
  for (const a of ladder.applied) {
    log(`[sequence] link-fallback applied: block=${a.blockId} rung=${a.rung}`);
  }

  const rendered = await deps.renderDoc(ladder.doc);
  const emailDocHtml = bindUnsubscribeHref(rendered, UNSUBSCRIBE_TOKEN);
  return { subject: deriveEmailDocSubject(ladder.doc), body: "", emailDocHtml };
}
