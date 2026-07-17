/**
 * Forward-lane classifier — pure functions only (Task 9). No DB, no fetch, no
 * route changes: the webhook branch that CALLS these is Task 10. An operator
 * forwards a competitor-export email or a rival's campaign email to
 * `switch@<reply-domain>`; these five functions turn the raw Resend inbound
 * shapes into a decision the Task 10 adapter can act on.
 *
 * RULE 0.4 vendor verification (crawl4ai, live, 07/16/2026 — output kept
 * local, never committed, matches the `*crawl4ai*` gitignore):
 *
 * - https://resend.com/docs/webhooks/emails/received.md — the `email.received`
 *   webhook body: `data.to` is an ARRAY of recipient addresses (confirmed by
 *   both the field doc, "Array of impacted recipient email addresses", and the
 *   response example, `"to": ["delivered@resend.dev"]`) — never a bare
 *   string on the wire, but this module's `isSwitchInbound` still accepts
 *   `string[] | string` per the brief for defensive robustness (a hand-built
 *   test fixture or a future SDK type widening shouldn't break it).
 *   Confirmed: the webhook payload's `data.attachments[]` carries METADATA
 *   ONLY (`id`, `filename`, `content_type`, `content_disposition`,
 *   `content_id` — no bytes, no base64) — "Webhooks do not include the email
 *   body, headers, or attachments, only their metadata."
 * - https://resend.com/docs/api-reference/emails/retrieve-received-email.md —
 *   `resend.emails.receiving.get(emailId)` returns `html`, `text`, and
 *   `headers` (a flattened `Record<string,string>` of LOWERCASE header names,
 *   e.g. `{"from": "...", "return-path": "...", "mime-version": "1.0"}`) plus
 *   the SAME `attachments[]` metadata shape (now also carrying `size`) — still
 *   NO inline content.
 * - https://resend.com/docs/api-reference/emails/retrieve-received-email-attachment.md
 *   + .../list-received-email-attachments.md — actual attachment BYTES require
 *   a THIRD call: `resend.emails.receiving.attachments.get({id, emailId})` (or
 *   `.list({emailId})`) returns a signed `download_url` (expires in 1 hour)
 *   that must be `fetch()`-ed separately. So the real shape is a 3-tier fetch:
 *   webhook (metadata) -> receiving.get (body/headers/text/html + attachment
 *   metadata) -> receiving.attachments.get (download_url) -> fetch(url)
 *   (bytes). This module's `classifyForward` only ever needs
 *   `{filename, contentType}` — constructible at EITHER the webhook stage or
 *   the receiving.get stage, no download_url / bytes required — so the
 *   brief's assumed input shape holds with NO contract change. Flagged for
 *   Task 10: Resend's field is `content_type` (snake_case) — the adapter must
 *   map it to this module's `contentType` when constructing the input.
 * - No inbound-attachment SIZE LIMIT is documented anywhere in Resend's
 *   receiving docs (checked: email.received, receiving/introduction,
 *   receiving/attachments, receiving/get-email-content,
 *   retrieve-received-email, retrieve-received-email-attachment,
 *   account-quotas-and-limits, chat-sdk-attachments). The one concrete number
 *   in Resend's docs is for SENDING
 *   (https://resend.com/docs/dashboard/emails/attachments.md, "Attachment
 *   Limitations": "Emails can be no larger than 40MB (including attachments
 *   after Base64 encoding)") — NOT confirmed to apply symmetrically to
 *   receiving. Task 10 should not assume a specific inbound cap; degrade
 *   gracefully (log + ack 200, per this route's existing house rule) if a
 *   download ever fails or is unexpectedly large.
 * - Platform link markers verified live 07/16/2026 (web search, since these
 *   are the vendors' own infrastructure domains, not Resend's):
 *   Mailchimp uses `mcsv.net` / `mailchimpapp.net` / `rsgsv.net` for
 *   Return-Path and sending infra, and `list-manage.com` for hosted
 *   signup/unsubscribe pages + click-tracking redirects
 *   (community discussion + mailchimp.com/help/my-campaign-from-name-shows-mcsvnet/,
 *   mailchimp.com/about/mcsv-static); `mailchimp.com` itself shows up in the
 *   "powered by Mailchimp" campaign-footer badge. Constant Contact's
 *   click-tracking domain is `rs6.net` (e.g. `r20.rs6.net`), confirmed via
 *   Constant Contact's own community forum threads; `constantcontact.com`
 *   itself appears in their hosted unsubscribe/manage-preferences pages.
 *   Follow Up Boss's own domain (`followupboss.com`) is confirmed live at
 *   docs.followupboss.com (used for Task 7's connector).
 *
 * DELTA vs. the brief: none to the INPUT contract — every shape this module
 * consumes (`to: string[]`, `headers: Record<string,string|undefined>`,
 * `html`/`text`, `attachments: {filename, contentType}[]`) is directly
 * constructible from real `resend.emails.receiving.get()` output. The only
 * delta is procedural (Task 10 needs the extra attachments-download-url hop
 * to get CSV bytes — noted above for that task, not a change here).
 */

// ── isSwitchInbound ─────────────────────────────────────────────────────────

/** The local-part every forward-lane inbound address routes through, e.g.
 *  `switch@r.swfldatagulf.com` — domain-agnostic so the reply domain can vary
 *  (staging vs. prod, or a future custom receiving domain) without this
 *  breaking. */
export const SWITCH_ADDRESS_LOCAL = "switch";

/** Unwraps a `Name <email@domain.com>` address down to the bare email; passes
 *  a bare address through unchanged. Resend's top-level `to`/`from` fields are
 *  documented as bare addresses, but `headers.from` (and any hand-built
 *  fixture) can carry the display-name-wrapped form, so every address read in
 *  this module goes through this first. */
function extractAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim();
}

/** The local-part (before `@`) of an address, lowercased. An address with no
 *  `@` at all is treated as all-local-part (defensive; never throws). */
function localPartOf(address: string): string {
  const at = address.indexOf("@");
  return (at < 0 ? address : address.slice(0, at)).trim().toLowerCase();
}

/**
 * True when ANY recipient's local-part is exactly `switch` (case-insensitive,
 * exact match only — `switchy@` / `notswitch@` do not count). Domain-agnostic
 * by design (spec): the reply domain the switch address lives on isn't
 * fixed here.
 */
export function isSwitchInbound(event: { data?: { to?: string[] | string } }): boolean {
  const raw = event.data?.to;
  const recipients = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return recipients.some((addr) => localPartOf(extractAddress(addr)) === SWITCH_ADDRESS_LOCAL);
}

// ── classifyForward ─────────────────────────────────────────────────────────

const CSV_EXTENSION = /\.csv$/i;
const XLSX_EXTENSION = /\.xlsx$/i;
const CSV_CONTENT_TYPES = new Set(["text/csv", "application/csv"]);
// IANA-registered OOXML spreadsheet type (verified against the IANA media-types
// registry, iana.org/assignments/media-types, 07/16/2026) — not a Resend- or
// vendor-specific claim, so no ESP doc lookup applies here.
const XLSX_CONTENT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function isContactExportAttachment(a: { filename: string; contentType: string }): boolean {
  const type = a.contentType.toLowerCase();
  return (
    CSV_EXTENSION.test(a.filename) ||
    XLSX_EXTENSION.test(a.filename) ||
    CSV_CONTENT_TYPES.has(type) ||
    XLSX_CONTENT_TYPES.has(type)
  );
}

export interface ForwardBody {
  text: string;
  html: string | null;
  headers: Record<string, string | undefined>;
  attachments: { filename: string; contentType: string }[];
}

/**
 * contact_export: any attachment is CSV/XLSX by extension OR content-type
 * (either signal alone qualifies — a forward often strips or genericizes one
 * of the two). campaign: no export attachment, but HTML is present and
 * non-blank (an ESP campaign is basically always HTML). unknown: neither —
 * e.g. a plain-text-only reply with no attachment, nothing to classify as a
 * competitor's data or campaign.
 */
export function classifyForward(body: ForwardBody): {
  kind: "contact_export" | "campaign" | "unknown";
} {
  if (body.attachments.some(isContactExportAttachment)) {
    return { kind: "contact_export" };
  }
  if (body.html && body.html.trim().length > 0) {
    return { kind: "campaign" };
  }
  return { kind: "unknown" };
}

// ── detectPlatform ──────────────────────────────────────────────────────────

interface PlatformMarker {
  slug: string;
  /** Domains verified live per the file-header RULE 0.4 note above. */
  domains: string[];
}

// Slugs match the ones already live elsewhere in the codebase
// (app/api/email/contacts/mailchimp/callback/route.ts uses "mailchimp",
// app/api/email/contacts/fub/route.ts uses "followupboss") — one naming
// authority for a platform slug, not a second spelling invented here.
const PLATFORM_MARKERS: PlatformMarker[] = [
  { slug: "mailchimp", domains: ["mailchimp.com", "mcsv.net", "list-manage.com"] },
  { slug: "constantcontact", domains: ["constantcontact.com", "rs6.net"] },
  { slug: "followupboss", domains: ["followupboss.com"] },
];

function matchMarker(haystack: string): string | null {
  const lower = haystack.toLowerCase();
  for (const marker of PLATFORM_MARKERS) {
    if (marker.domains.some((domain) => lower.includes(domain))) return marker.slug;
  }
  return null;
}

/**
 * Marker-table platform detection. Two signals, BODY LINKS CHECKED FIRST
 * (first-class, not a fallback — review-pinned 07/16/2026):
 *   1. Body links — in a FORWARDED email, the headers belong to the
 *      FORWARDER, not the original platform (Gmail's "Forwarded message"
 *      rewrites From/Reply-To and typically drops List-Unsubscribe
 *      entirely), while the ORIGINAL campaign HTML is quoted verbatim in the
 *      new message body, so the platform's own tracking/unsubscribe/branding
 *      links survive even when every header does not. Body links are the
 *      DURABLE signal for forwarded mail, so they're checked first, not
 *      second.
 *   2. Headers — fallback only, for the less common case where a header
 *      happens to carry a platform's domain (e.g. a non-forwarded direct
 *      send) and the body has no matching link.
 * Returns the platform slug, or null when nothing in the marker table
 * matches — never guessed. When both signals point to DIFFERENT platforms
 * (a stale/reused header vs. the actual quoted body), the body link wins.
 */
export function detectPlatform(
  headers: Record<string, string | undefined>,
  html: string | null,
): string | null {
  if (html) {
    const fromBody = matchMarker(html);
    if (fromBody) return fromBody;
  }

  const headerHaystack = Object.values(headers)
    .filter((v): v is string => Boolean(v))
    .join(" ");
  return matchMarker(headerHaystack);
}

// ── extractFooterAbout ──────────────────────────────────────────────────────

const ABOUT_PATTERN = /about\s+(me|[A-Z][a-z]+)/i;
const LONG_BLOCK_MIN_CHARS = 120;

/**
 * Hard cap on how much HTML `extractFooterAbout` will scan (review-pinned
 * 07/16/2026 — CRITICAL: the original backtracking regex
 * `/<(p|td)[^>]*>([\s\S]*?)<\/\1>/gi` is O(n^2) on adversarial input, e.g.
 * thousands of unclosed `<p>` openers, benchmarked at 143ms per 80KB by the
 * reviewer; inbound mail has NO documented size cap (see the file-header
 * RULE 0.4 note) and this runs on the live webhook thread once Task 10 wires
 * it in). A genuine bio/footer lives at the END of a forwarded message — a
 * campaign's marketing content leads, the sender's signature/bio trails — so
 * when the HTML exceeds this cap, only the TAIL is scanned. That preserves
 * this function's purpose (real footers are still found) while bounding
 * worst-case work; only a hostile or badly-broken payload ever hits it (a
 * normal newsletter's full HTML is tens of KB, nowhere near 250,000 chars).
 */
export const MAX_FORWARD_HTML = 250_000;

function stripTags(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** All start indices of a fixed literal substring (case-insensitive, caller
 *  passes an already-lowercased haystack + lowercased needle), in increasing
 *  order. A single forward pass: each `indexOf` call's scan window is only
 *  the gap since the previous hit, so total work across every call is O(n)
 *  in the haystack length — NOT O(n) per call, which is what made the old
 *  backtracking regex quadratic on a run of near-adjacent matches (e.g.
 *  thousands of unclosed `<p>` openers each triggering a fresh scan to the
 *  end of the string). */
function findAllCI(lowerHaystack: string, lowerNeedle: string): number[] {
  const indices: number[] = [];
  let idx = lowerHaystack.indexOf(lowerNeedle, 0);
  while (idx !== -1) {
    indices.push(idx);
    idx = lowerHaystack.indexOf(lowerNeedle, idx + lowerNeedle.length);
  }
  return indices;
}

/** True when the character code sits right after a tag NAME and legitimately
 *  ends it (whitespace, `>`, `/`, or end-of-string) rather than continuing it
 *  — so matching `<p` doesn't false-hit `<pre>`/`<param>`, and `<td` doesn't
 *  false-hit some future `<tdfoo>`-shaped tag. */
function isTagNameBoundary(code: number): boolean {
  return (
    Number.isNaN(code) ||
    code === 32 /* space */ ||
    code === 9 /* tab */ ||
    code === 10 /* \n */ ||
    code === 13 /* \r */ ||
    code === 62 /* > */ ||
    code === 47 /* / */
  );
}

/** All start indices of valid `<p`/`<td` open tags (boundary-checked, see
 *  above), in increasing order — same linear find-all-occurrences shape as
 *  `findAllCI`. */
function findAllOpenTags(lowerHtml: string, tagName: "p" | "td"): number[] {
  const needle = `<${tagName}`;
  const opens: number[] = [];
  let idx = lowerHtml.indexOf(needle, 0);
  while (idx !== -1) {
    if (isTagNameBoundary(lowerHtml.charCodeAt(idx + needle.length))) opens.push(idx);
    idx = lowerHtml.indexOf(needle, idx + needle.length);
  }
  return opens;
}

/**
 * Plain-text of every top-level `<p>`/`<td>` block, in document order — a
 * LINEAR scan (review-pinned 07/16/2026, replacing a backtracking regex that
 * was O(n^2) on hostile input; see `MAX_FORWARD_HTML` above). Every open tag
 * of each type is found once (`findAllOpenTags`), every close tag of each
 * type is found once (`findAllCI`), then a monotonic two-pointer merge pairs
 * each open with the nearest FOLLOWING close of the same type — the pointer
 * only ever moves forward, so the whole pairing pass is also O(n), never
 * O(n) per open tag.
 *
 * Simple by design (per the brief): does not track real nesting depth, so a
 * `<td>` nested inside another `<td>` pairs the OUTER open with the INNER
 * close (same "nearest following close" semantics the original non-greedy
 * regex had) — acceptable for the flat, non-nested footer/campaign-block
 * shapes this targets; not a regression introduced by the linear rewrite.
 */
function blockTexts(html: string): string[] {
  const lower = html.toLowerCase();

  type Open = { pos: number; tag: "p" | "td" };
  const opens: Open[] = [
    ...findAllOpenTags(lower, "p").map((pos): Open => ({ pos, tag: "p" })),
    ...findAllOpenTags(lower, "td").map((pos): Open => ({ pos, tag: "td" })),
  ].sort((a, b) => a.pos - b.pos);
  if (opens.length === 0) return [];

  const closes: Record<"p" | "td", number[]> = {
    p: findAllCI(lower, "</p"),
    td: findAllCI(lower, "</td"),
  };
  const closePtr: Record<"p" | "td", number> = { p: 0, td: 0 };

  const blocks: string[] = [];
  for (const open of opens) {
    const gt = lower.indexOf(">", open.pos);
    if (gt === -1) continue; // truncated open tag (e.g. right at a tail-slice boundary)
    const contentStart = gt + 1;

    const list = closes[open.tag];
    let ptr = closePtr[open.tag];
    while (ptr < list.length && list[ptr] < contentStart) ptr++;
    closePtr[open.tag] = ptr;
    if (ptr >= list.length) continue; // no matching close ahead — unclosed tag, skip

    const text = stripTags(html.slice(contentStart, list[ptr]));
    if (text) blocks.push(text);
  }

  return blocks;
}

/**
 * The last `<p>`/`<td>` block matching /about\s+(me|Name)/i, e.g. an
 * "About Jane Smith — ..." bio block. Falls back to the last `<p>`/`<td>`
 * block over 120 plain-text characters when no about-pattern block exists.
 * Absent means absent: returns null rather than inventing a bio when nothing
 * qualifies (e.g. a forward with only short pleasantries).
 *
 * HTML over `MAX_FORWARD_HTML` chars is capped to its TAIL before scanning
 * (see that constant's doc) — bounds worst-case work on hostile/oversized
 * input while a real footer, which lives at the end, still gets found.
 */
export function extractFooterAbout(html: string | null): string | null {
  if (!html) return null;
  const bounded = html.length > MAX_FORWARD_HTML ? html.slice(-MAX_FORWARD_HTML) : html;
  const blocks = blockTexts(bounded);
  if (blocks.length === 0) return null;

  const aboutBlocks = blocks.filter((b) => ABOUT_PATTERN.test(b));
  if (aboutBlocks.length > 0) return aboutBlocks[aboutBlocks.length - 1];

  const longBlocks = blocks.filter((b) => b.length > LONG_BLOCK_MIN_CHARS);
  if (longBlocks.length > 0) return longBlocks[longBlocks.length - 1];

  return null;
}

// ── senderDomain ─────────────────────────────────────────────────────────────

/**
 * The domain part of a `from` address, lowercased, trailing dot stripped
 * (mirrors `lib/email/work-email-filter.ts`'s `emailDomain` normalization,
 * kept as a SEPARATE local helper here rather than imported — this module is
 * declared pure/dependency-free, per the brief, and additionally needs the
 * `Name <email>` unwrap `emailDomain` doesn't do since it operates on
 * already-bare `ContactRow` emails). Null when there's no `@` or the domain
 * part is empty (e.g. `"jane@"`) — never a guessed domain.
 */
export function senderDomain(from: string): string | null {
  const address = extractAddress(from);
  const at = address.lastIndexOf("@");
  if (at < 0) return null;
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  return domain.length > 0 ? domain : null;
}
