// lib/email/bind-unsubscribe.ts
//
// The EmailDoc footer's default unsubscribeUrl is the literal "#unsubscribe"
// (lib/email/doc/default-docs.ts) — a dead link if it reaches a real send. Every
// send path binds it to its real target: the blast route to the per-recipient
// /api/unsubscribe URL, the scheduled + weekly-read broadcast lanes to the
// {{{RESEND_UNSUBSCRIBE_URL}}} token Resend (or the sender) substitutes
// per-recipient. A user-set real URL contains no "#unsubscribe" → no-op. PURE.

export function bindUnsubscribeHref(html: string, href: string): string {
  return html.split(`href="#unsubscribe"`).join(`href="${href}"`);
}
