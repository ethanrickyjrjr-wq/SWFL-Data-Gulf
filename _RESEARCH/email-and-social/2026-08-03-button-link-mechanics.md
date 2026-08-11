# Button link mechanics — how a linked CTA should actually be built

**Crawled 08/03/2026 via crawl4ai.** Companion to `2026-08-03-strongest-real-estate-email-concepts-structure.md`,
which covers CTA *copy and placement*. This file covers the *link mechanics* that file does not:
rendering, tap targets, and what a link's DESTINATION does to deliverability.

**Honest source count: 2 of 4 URLs returned content.** Email on Acid and Mailgun both 404'd on their
URL-shortener articles (their blogs have been folded into Sinch and the old paths are dead). So the
shortener question below is stated as UNVERIFIED, not as a finding.

---

## 1. Litmus — "Your Guide to Bulletproof Email Buttons that Work" (04/03/2025)

`https://www.litmus.com/blog/a-guide-to-bulletproof-buttons-in-email-design`

- **Never use an image-based button.** It disappears under image-blocking and is invisible to screen
  readers. Litmus' own line: the only *truly* pixel-identical button is an image, and you should still
  never use one. Both failure cases are **untrackable** — you cannot measure who had the bad experience.
- **Button height 42–72px** (~11–19mm) is the mobile-clickable band. Smaller is hard to hit; larger
  stops reading as a button.
- **Whitespace around the button matters** — bunched links produce mis-taps, worst on mobile.
- **Label = 1–5 words**, actionable. More context goes in a headline *above* the button, not in it.
- **Five bulletproof coding methods**: conditional-padding (Litmus' own pick, credited to Mark Robbins),
  VML, padding, border, padding+border. The conditional-padding form styles the `<a>` for every client
  and adds Outlook-only padding via `<!--[if mso]-->`, so Outlook padding can be tuned without touching
  the others.

**Where we already comply:** `lib/email/blocks/ButtonBlock.tsx` renders a real `<a>`/`Button` with
`padding: pad(16,32)`, `borderRadius: 8px`, `display: inline-block` — a coded button, not an image,
and inside the 42–72px band. No change needed.

---

## 2. Gmail — Email sender guidelines (Google, current)

`https://support.google.com/a/answer/81126`

The load-bearing line for link *destinations*, verbatim:

> **"Web links in the message body should be visible and easy to understand. Recipients should know
> what to expect when they click a link."**

Also relevant:
- Google names the **payload domain** (the domain your links point at) alongside authenticating,
  envelope-from, reply-to, and sender domains as an identity surface it evaluates.
- **"Don't use HTML and CSS to hide content"** — hidden content can be marked spam.
- Bulk senders (>5,000/day) need SPF + DKIM + DMARC, one-click unsubscribe, spam rate <0.30%.

**Why this governs the button-destination build:** a button labeled "Find Out More About This
Community" that resolves to the agent's *homepage* fails "recipients should know what to expect."
This is the outside authority behind `usesWebsiteDefault: false` for the `community` and `listing`
roles in `lib/email/button-destinations.ts` — a generic homepage may not silently stand in for a
specific promise. It is a deliverability constraint, not a taste preference.

---

## 3. UNVERIFIED — URL shorteners

Both sources 404'd. The widely-repeated claim is that shorteners (bit.ly et al.) hurt deliverability
because they share reputation with abusive senders and obscure the destination — the second half is at
least *consistent* with Gmail's "recipients should know what to expect" line above. **Do not cite this
as established until a live source is crawled.** If we ever accept agent-supplied shortened URLs,
research it first.

---

## 4. What we did with this

Built `lib/email/button-destinations.ts` (19 tests green, `bun test lib/email/button-destinations.test.ts`):
role-keyed destinations, ours as the LAST rung, and no house fallback at all for `listing`. The
Gmail line above is quoted in that file's header so the constraint travels with the code.
