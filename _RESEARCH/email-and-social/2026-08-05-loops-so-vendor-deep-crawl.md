# Loops.so — deep crawl4ai pass (vendor eval, paid-fallback lane)

**Source:** https://loops.so/docs (+ pricing, product, and marketing pages). BFS deep crawl,
241 distinct pages, via the pinned crawl4ai venv. Raw dump (90k lines) is local-only at
`scratchpad/loops-docs/loops-docs-deep.md` (gitignored, not filed — this is the distilled read).
**As-of:** 08/05/2026.

**Why this was pulled:** operator asked for New Listing email vendor research —
*"try for least expensive inhouse with paid fall back... find out what, where, how and how much
we can get."* Loops.so is a transactional+marketing email API/SMTP vendor candidate for the
paid-fallback lane on top of our in-house send path.

## Pricing (loops.so/pricing)

- Priced on **subscribed contacts synced to Loops**, not on send volume. "We do not charge
  separately for sending."
- **Free plan:** up to 4,000 sends/month, up to 1,000 stored subscribed contacts, 10 emails/sec
  rate limit, adds a "Powered by Loops" footer to outgoing emails.
- **Paid plans:** contact-count-tiered (exact $/tier is rendered by a JS slider, not present in
  the static HTML the crawler captured — needs a live browser read or contact-form quote to get
  numeric breakpoints). No per-seat charge. Sends are "unlimited" (rate-limited to 1,000
  emails/sec on paid, 10/sec on free — overflow queues rather than errors).
- No answer captured on committed sold-listing-email volume vs their tier breakpoints — that's
  the next question if this vendor gets shortlisted.

## How sending works

Two paths, both requiring a template built in **their editor** first (transactionalId is
mandatory — you cannot send arbitrary raw HTML through either path without registering it as a
transactional email in their system):

1. **REST API** — `POST https://app.loops.so/api/v1/transactional`, bearer token auth. Body:
   `email`, `transactionalId`, `addToAudience`, `dataVariables` (template variable injection),
   `attachments[]` (filename/contentType/base64 data). SDKs: JS/TS, Ruby, PHP, Go, plus
   Next.js-specific guide.
2. **SMTP** — `smtp.loops.so:587`, username `loops`, password = API key. Distinctive: **the SMTP
   body isn't the email content** — you still send a JSON-shaped payload
   (`transactionalId` + `email` + `dataVariables`) as the message body, and Loops resolves it
   against the pre-built template server-side. This is NOT a drop-in SMTP relay for
   already-rendered HTML; it's the same templated-send model as the API, just tunneled over
   SMTP for platforms that only expose an SMTP hook (Supabase auth emails, Django, Laravel,
   Rails, Nodemailer call out explicitly).

**Implication for us:** Loops is not a "send my rendered HTML" fallback — it wants ownership of
the template. If New Listing emails stay authored/rendered in our own pipeline
(`lib/email/build-doc.ts`), Loops would need either (a) the email rebuilt in their editor/LMX
format, or (b) the whole rendered HTML jammed into one big `dataVariables` string with a
template that just interpolates it raw (workable, but fights their model rather than using it).

## Deliverability / guardrails features

- **Guardian** (`docs/creating-emails/guardian`) — a pre-send spam/deliverability check baked
  into the editor; page nav confirms it exists as a distinct step alongside styling/personalizing,
  full rubric not captured in this pass (JS-rendered body past what the crawler pulled — worth a
  targeted follow-up crawl if Guardian's exact checks matter to the decision).
- Dedicated sending IPs available (`api-reference/dedicated-sending-ips`), DMARC/DKIM setup,
  BIMI guide, sending-reputation/optimization/bounce-rate guides, transactional-group inbox
  separation (keeps transactional sending reputation isolated from marketing sending).
- Attachments supported natively on the transactional send call (relevant if a New Listing email
  variant ever wants a PDF spec sheet attached rather than just inline images).

## Where it fits / doesn't

- **Fits:** paid fallback for deliverability (dedicated IPs, DKIM/DMARC tooling, bounce/reputation
  guides) if our in-house SMTP send starts landing in spam at volume.
- **Doesn't fit cleanly:** it wants to own the template. Our stack owns rendering
  (`lib/email/build-doc.ts`, recipe registry) — bridging Loops as a pure delivery relay for
  already-rendered HTML is possible but works against their design, not with it. A vendor that
  accepts raw rendered HTML per-send (no pre-registered template) would be a cleaner fallback fit
  — not established here; needs its own crawl if pursued (e.g. Resend, Postmark, SES direct).

## Not yet checked (gap, flag before deciding)

- Numeric pricing tiers above the free plan — slider is JS-rendered, not in static crawl output.
- Guardian's actual check list.
- Send-time SLA / actual deliverability track record (no independent benchmark pulled — this pass
  is vendor's own docs only, not third-party deliverability comparisons).
