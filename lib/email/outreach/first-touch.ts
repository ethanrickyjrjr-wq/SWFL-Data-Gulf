// lib/email/outreach/first-touch.ts
//
// The PLAIN first-touch cold email: a 50–120-word note in Ricky's voice, one cited
// number in the first line, one UTM-tagged link to Issue 001, a question, signed "Ricky".
// Deliberately NOT the branded chart drip (drip-email.ts) — a first touch reads like a
// person wrote it (playbook §1.20's flagged LeadSites conflict, taken as the cold lane's
// bet). What it shares with the drip is the send floor: the per-recipient unsubscribe
// token (ensureUnsubscribeToken) and the CAN-SPAM postal address (appendPostalAddress),
// so the SAME Resend batch builder (send.ts) carries it.
//
// Pure — no I/O. The CLI (scripts/email/outreach-first-touch.mts) reads the drafts JSON,
// validates every draft through validateFirstTouchDraft (the compliance floor lives in
// code, not in a reviewer's notes — playbook §1.7, §1.9, §1.9a, §1.10, §1.14), renders,
// and sends.

import type { ComposedMessage } from "./campaign";
import { appendPostalAddress } from "./drip-email";
import { text } from "@/lib/email/blocks/scale";
import { ensureUnsubscribeToken } from "@/lib/email/scheduler";

export interface FirstTouchDraft {
  email: string;
  name: string;
  zip?: string | null;
  subject: string;
  /** Plain text. Paragraphs separated by blank lines; the link on its own line. */
  body: string;
  /** The exact figure string the body carries (guards against an altered number). */
  number_used: string;
  /** The one allowed link: /insiders with the four UTM params. */
  link: string;
}

/** The ONLY link a first touch may carry: Issue 001 with source/medium/campaign/content UTMs. */
export const FIRST_TOUCH_LINK_RE =
  /^https:\/\/www\.swfldatagulf\.com\/insiders\?utm_source=outreach&utm_medium=email&utm_campaign=[a-z0-9-]+&utm_content=[a-z0-9-]+$/;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const WORD_FLOOR = 50; // playbook §1.9 — a 25-word email performs like a 2000-word one
const WORD_LIMIT = 120; // operator: "under 120 words"
const SUBJECT_LIMIT = 60;
/**
 * Full name, optional phone line, company in caps — the last lines of every first touch.
 * Operator 09/02/2026: "first and last name. COME ON MAN / SWFL DATA GULF".
 */
const SIGN_OFF_RE = /\bRicky Cooper\n(?:[+(\d][\d\s().-]{6,}\n)?SWFL DATA GULF\s*$/;
/** Same stack the drip uses; the scale (size/weight/leading) comes from blocks/scale.ts. */
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/** Vendor descriptors quoted in a citation, never authored (§1.9a exception). */
const CAPS_ALLOWED = new Set(["ZHVI", "ZORI", "FEMA", "NFIP", "SWFL", "USD", "NAICS"]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Word count excluding the link line (the URL is not prose). */
function wordCount(body: string): number {
  return body
    .replace(URL_RE, "")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/**
 * The compliance floor. Returns [] when the draft may be sent; else every reason it
 * may not. Mirrors the reviewer's checklist so a reviewer's miss cannot reach Resend.
 */
export function validateFirstTouchDraft(d: FirstTouchDraft): string[] {
  const errs: string[] = [];
  const subject = d.subject ?? "";
  const body = d.body ?? "";
  const prose = body.replace(URL_RE, "");

  if (!EMAIL_RE.test(d.email ?? "")) errs.push("invalid email");
  if (!d.name?.trim()) errs.push("missing name");
  if (!subject.trim()) errs.push("missing subject");
  if (subject.length > SUBJECT_LIMIT) errs.push("subject over 60 chars");
  if (/\bfree\b/i.test(subject)) errs.push("subject contains 'free'");
  if (/^\s*(re|fw|fwd):/i.test(subject)) errs.push("subject fakes a reply/forward");

  const words = wordCount(body);
  if (words > WORD_LIMIT) errs.push("body over 120 words");
  if (words < WORD_FLOOR) errs.push("body under 50 words");
  if (!/\?/.test(prose)) errs.push("no question asked");
  if (/!/.test(subject) || /!/.test(body)) errs.push("exclamation mark");
  if (/\bZIP\b/.test(subject) || /\bZIP\b/.test(prose)) errs.push("says ZIP — write zip code");
  // The sign-off's company line is the one sanctioned all-caps phrase; check the prose above it.
  const aboveSignOff = prose.replace(SIGN_OFF_RE, "");
  const caps = aboveSignOff.match(/\b[A-Z]{4,}\b/g) ?? [];
  if (caps.some((w) => !CAPS_ALLOWED.has(w))) errs.push("all-caps word");

  const links = body.match(URL_RE) ?? [];
  if (links.length === 0) errs.push("missing link");
  if (links.length > 1) errs.push("more than one link");
  if (!FIRST_TOUCH_LINK_RE.test(d.link ?? "")) errs.push("link is not the insiders UTM link");
  if (links.length === 1 && links[0] !== d.link) errs.push("body link differs from link field");

  if (!d.number_used?.trim() || !body.includes(d.number_used)) {
    errs.push("number_used not present verbatim in body");
  }
  // Playbook §1.7: the sign-off carries name + company (a phone line may sit between them —
  // none is on file, so it is optional, never invented). A stranger has to know who wrote this.
  if (!SIGN_OFF_RE.test(body.trim())) errs.push("not signed Ricky Cooper / SWFL DATA GULF");
  if (/\b(guarantee|act now|limited time|risk[- ]free|click here|100%)\b/i.test(body)) {
    errs.push("spam-trigger phrase");
  }
  return errs;
}

/** The body role from the ONE type scale, serialized for an inline email style. */
function bodyStyle(): string {
  const t = text("body");
  return `font-family:${FONT}; font-size:${t.fontSize}; line-height:${t.lineHeight}; font-weight:${t.fontWeight}; color:#111827; margin:0 0 16px`;
}

/**
 * Plain paragraphs → minimal HTML, then the two footer lines the send floor requires.
 * Throws without a postal address: a first touch never renders non-compliant.
 */
export function renderFirstTouchHtml(d: FirstTouchDraft, postalAddress: string): string {
  if (!postalAddress?.trim()) {
    throw new Error("renderFirstTouchHtml: a CAN-SPAM postal address is required");
  }
  const style = bodyStyle();
  const paras = d.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const safe = escapeHtml(p).replace(/\n/g, "<br>");
      const linked = safe.replace(
        /https?:\/\/[^\s<>"']+/g,
        (u) => `<a href="${u.replace(/&amp;/g, "&")}" style="color:#0a3d62">${u}</a>`,
      );
      return `<p style="${style}">${linked}</p>`;
    })
    .join("\n");
  const shell = `<!doctype html><html><body style="margin:0; padding:24px; background:#ffffff"><div style="max-width:560px">${paras}</div></body></html>`;
  return appendPostalAddress(ensureUnsubscribeToken(shell), postalAddress);
}

/** Shape a rendered first touch as the ComposedMessage the batch builder + recipient ledger expect. */
export function toComposedMessage(d: FirstTouchDraft, postalAddress: string): ComposedMessage {
  return {
    email: d.email.trim(),
    name: d.name,
    zip: d.zip ?? undefined,
    status: "ready",
    brandSource: "house",
    brandConfidence: 0,
    usedHouseBrand: true,
    primary: null,
    arrivalUrl: d.link,
    subject: d.subject,
    html: renderFirstTouchHtml(d, postalAddress),
  };
}
