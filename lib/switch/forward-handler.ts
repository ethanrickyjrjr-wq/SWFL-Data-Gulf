/**
 * Forward-lane orchestration core (Task 10, redesigned per the 07/17/2026
 * security review). Same split as lib/email/process-inbound.ts: ALL decision
 * logic lives here behind injected deps, so the account-match / classify /
 * stash / apply flow is unit-testable with no DB and no network. The routes
 * (app/api/webhooks/resend/route.ts, app/api/switch/apply-forward/route.ts)
 * build the real seams and are adapter-only.
 *
 * SECURITY: STASH-THEN-CONFIRM (Critical a, 07/17/2026 review). The inbound
 * `From` address is attacker-claimable -- Resend/SMTP never authenticates it.
 * The original design matched `From` to an account and WROTE (contacts,
 * agent_profile_facts, switch_passes) directly from the webhook, which let a
 * forged `From` inject fake data onto (or spuriously activate a pass on) a
 * real account with zero proof of control over that inbox, and risked
 * backscatter (auto-replying to a forged/third-party address). The webhook
 * now ONLY stashes what it parsed, `status: 'pending'`, into
 * `switch_forwards`. Nothing is written to contacts / agent_profile_facts /
 * switch_passes until the OWNER applies it from an authenticated session
 * (`processForwardEmail` -> stash; `applyForward`, called from
 * app/api/switch/apply-forward, -> the actual writes). A forged `From` can at
 * worst stash junk on someone else's pending-forwards list and trigger one
 * reply email to that (real, since it matched) account's real inbox -- never
 * a direct write, and reply-loop guards (below) keep it from becoming
 * backscatter to a third party.
 *
 * The arc, per forwarded email:
 *   1. is this addressed to switch@? (isSwitchInbound, Task 9) -- the route
 *      already gates on this before calling in, but this function re-checks
 *      so it's independently testable/callable.
 *   2. `from` -> an auth user. No match -> polite reply (loop-guarded), ack.
 *   3. fetch body (webhook is metadata-only) + classify (Task 9).
 *   4. contact_export -> CSV attachment(s) only (oversized/XLSX declined) ->
 *      normalize -> parse -> validate -> cap at MAX_STASH_ROWS -> STASH
 *      (status 'pending') -> "sign in and Apply" reply.
 *   5. campaign -> footer About-text + platform/domain -> STASH (status
 *      'pending', html tail-capped) -> "sign in and Apply" reply. NOTHING is
 *      written to agent_profile_facts here anymore.
 *   6. unknown -> polite reply listing the two things we accept -> ack.
 *   7. `applyForward` (called from the authed apply-forward route): loads a
 *      pending row BY ID, verifies ownership + pending status (404-shaped
 *      refusal otherwise, never leaking existence), then does the ACTUAL
 *      write for that one row -- upsert + pass activation for
 *      contact_export, one agent_profile_facts row for campaign -- and marks
 *      the row applied (or dismissed, on request).
 */
import {
  isSwitchInbound,
  classifyForward,
  detectPlatform,
  extractFooterAbout,
  senderDomain,
  MAX_FORWARD_HTML,
  type ForwardBody,
} from "@/lib/switch/forward-inbound";
import { normalizeCompetitorCsv } from "@/lib/switch/export-columns";
import { parseContactsCsv } from "@/lib/email/parse-contacts-csv";
import { isValidEmail } from "@/lib/email/validation";
import type { SwitchProof } from "@/lib/switch/activate";
import type { ContactRow } from "@/lib/contacts/types";
import type { Json } from "@/database.types";

/** The minimal webhook event shape this module acts on -- a superset of what
 *  `isSwitchInbound` needs, matching lib/email/process-inbound.ts's
 *  `InboundEvent` field names (email_id, from, to, subject) so the route can
 *  pass its already-parsed event straight through with no re-shaping. */
export interface ForwardEvent {
  type: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
  };
}

export interface ForwardAttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  /** Bytes, from Resend's attachment metadata (`InboundAttachment.size`).
   *  Undefined only for a hand-built fixture that omits it -- real Resend
   *  payloads always carry it. */
  size?: number;
}

/** The fetched body + headers + attachment METADATA (subset of Resend's
 *  GetReceivingEmailResponse -- the webhook itself carries metadata only). */
export interface ForwardEmailBody {
  from: string;
  html: string | null;
  text: string;
  headers: Record<string, string | undefined>;
  attachments: ForwardAttachmentMeta[];
}

const CSV_EXTENSION = /\.csv$/i;
const XLSX_EXTENSION = /\.xlsx$/i;
const CSV_CONTENT_TYPES = new Set(["text/csv", "application/csv"]);
const XLSX_CONTENT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
// A file Mailchimp's native per-status export naming convention marks as an
// opt-out list (e.g. "unsubscribed_members_export.csv", "cleaned_members_export.csv")
// -- see export-columns.ts's header comment: Mailchimp's UI export splits
// subscribed/unsubscribed/non-subscribed/cleaned into SEPARATE files, so the
// signal lives in the FILENAME, not a column this module's CSV normalizer can
// see. Checked here, where the attachment metadata (filename) is available.
const UNSUB_FILENAME_PATTERN = /unsub|cleaned/i;

/** Hard byte cap on an attachment we'll fetch (security review, Important b,
 *  07/17/2026): no documented inbound size limit exists (Task 9's carry-
 *  forward note), so refuse anything over this rather than pulling an
 *  unbounded download into memory. Checked twice: here against Resend's
 *  metadata `size` (cheap, before any fetch), and again in the route adapter
 *  against the download response's `Content-Length` (defense in depth, in
 *  case the metadata was missing or understated). */
export const MAX_ATTACHMENT_BYTES = 10_000_000;

/** Hard cap on rows accepted into one stash payload (security review,
 *  matches the same 5000 ceiling app/api/contacts/import/route.ts already
 *  uses for a direct upload -- see the comment fixed in
 *  lib/email/parse-contacts-csv.ts, which never bounded this itself). Rows
 *  past the cap are dropped and counted as skipped, not rejected outright --
 *  an unattended email pipeline has no client to show a "too many rows"
 *  error to, so truncate-and-report beats bouncing the whole import. */
export const MAX_STASH_ROWS = 5000;

function isCsvAttachment(a: ForwardAttachmentMeta): boolean {
  return CSV_EXTENSION.test(a.filename) || CSV_CONTENT_TYPES.has(a.contentType.toLowerCase());
}
function isXlsxAttachment(a: ForwardAttachmentMeta): boolean {
  return XLSX_EXTENSION.test(a.filename) || XLSX_CONTENT_TYPES.has(a.contentType.toLowerCase());
}

// ── reply-loop / backscatter guard (security review, Minor f) ──────────────

const BOUNCE_LOCALPARTS = /^(mailer-daemon|postmaster|no-?reply|bounce)$/i;

/** Lowercase header lookup -- inbound header casing is not guaranteed. */
function headerVal(headers: Record<string, string | undefined>, name: string): string {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want && typeof v === "string") return v;
  }
  return "";
}

/**
 * True when an automated reply to `fromEmail` would risk a mail loop or
 * backscatter to a third party (security review, Minor f, 07/17/2026): the
 * inbound `From` is attacker-claimable, so blindly auto-replying to it can
 * bounce forever against another auto-responder, or land as unsolicited
 * "backscatter" on someone who never sent us anything. Mirrors the shape of
 * lib/email/inbound-guards.ts's `isAutoResponder` (RFC 3834 markers -- kept
 * as a separate, local check rather than imported: that module's local-part
 * list and single-reply-domain signature don't cover "bounce" or a list of
 * OUR domains, both needed here).
 */
export function shouldSuppressReply(
  headers: Record<string, string | undefined>,
  fromEmail: string,
  ourDomains: string[],
): boolean {
  const autoSubmitted = headerVal(headers, "auto-submitted").trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;

  const precedence = headerVal(headers, "precedence").trim().toLowerCase();
  if (["bulk", "junk", "list"].includes(precedence)) return true;

  const at = fromEmail.lastIndexOf("@");
  if (at === -1) return true; // malformed sender -- never auto-reply to it
  const local = fromEmail.slice(0, at).toLowerCase();
  const domain = fromEmail.slice(at + 1).toLowerCase();
  if (BOUNCE_LOCALPARTS.test(local)) return true;
  if (ourDomains.some((d) => d.toLowerCase() === domain)) return true;

  return false;
}

// ── the stash a pending forward becomes ─────────────────────────────────────

export interface StashForwardRow {
  messageId: string;
  kind: "contact_export" | "campaign";
  platform: string | null;
  senderDomain: string | null;
  html: string;
  payload: Json;
}

export interface ForwardDeps {
  log: (line: string) => void;

  /** OUR own sending/reply domains (reply.swfldatagulf.com, the platform
   *  send domain, ...) -- an inbound `From` on one of these is either a loop
   *  with ourselves or a spoof; never auto-reply to it. */
  ourDomains: string[];
  /** Site origin for the "sign in at <site>/contacts/upload" reply copy. */
  siteUrl: string;

  /** `from` address -> matched auth user id, or null when no account matches.
   *  Pagination + any hard cap live in the adapter (no email->user lookup
   *  helper exists anywhere else in the repo -- grepped listUsers/
   *  getUserByEmail/profiles, none found). */
  findUserIdByEmail: (email: string) => Promise<string | null>;

  /** Fetch the full body (webhook is metadata-only). */
  fetchBody: (emailId: string) => Promise<ForwardEmailBody>;

  /** Fetch one attachment's decoded text content (the 3-hop Resend flow:
   *  receiving.attachments.get -> signed download_url -> fetch(url)). Null on
   *  any failure -- degrade gracefully, never throw. The adapter re-checks
   *  Content-Length against MAX_ATTACHMENT_BYTES too (defense in depth). */
  fetchAttachmentText: (emailId: string, attachmentId: string) => Promise<string | null>;

  /** STASH a pending forward. "duplicate" = message_id already stashed
   *  (Svix at-least-once redelivery, unique-index 23505) -- skip, don't
   *  re-reply. "error" = a real write failure. */
  stashForward: (
    userId: string,
    row: StashForwardRow,
  ) => Promise<"inserted" | "duplicate" | "error">;

  /** Send a short plain-text reply. Callers gate this through the
   *  `shouldSuppressReply` check themselves (see `processForwardEmail`'s
   *  internal `reply` wrapper) -- this dep is the raw send only. */
  sendReply: (to: string, subject: string, text: string) => Promise<void>;
}

export type ForwardOutcome =
  | { kind: "ignored"; reason: string }
  | { kind: "unmatched_sender" }
  | { kind: "export_no_csv" }
  | { kind: "export_too_large" }
  | {
      kind: "contact_export";
      stashed: boolean;
      rowCount: number;
      skipped: number;
      duplicate?: boolean;
    }
  | { kind: "campaign"; stashed: boolean; duplicate?: boolean }
  | { kind: "unknown" };

/** Lowercase + strip a display-name wrapper to a bare address. */
function normalizeFrom(raw: string): string {
  const angled = /<([^>]+)>/.exec(raw);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

/** Map a parsed CSV row (lib/email/parse-contacts-csv's ContactRow shape:
 *  {email, name, tags, attribs?}) into the canonical upsert's ContactRow
 *  shape (lib/contacts/types.ts: {name, email, phone, tags, attribs,
 *  unsubscribed?}), translating the `switch_unsubscribed` attrib (from
 *  export-columns.ts) into the one-way `unsubscribed` flag and folding in a
 *  filename-level opt-out override (Mailchimp's separate-file convention). */
function toCanonicalContactRow(
  row: { email: string; name: string | null; tags: string[]; attribs?: Record<string, string> },
  filenameForcesUnsub: boolean,
): ContactRow {
  const attribs = { ...(row.attribs ?? {}) };
  const columnSaysUnsub = attribs.switch_unsubscribed === "true";
  delete attribs.switch_unsubscribed;

  return {
    name: row.name,
    email: row.email,
    phone: null,
    tags: row.tags,
    attribs,
    ...(columnSaysUnsub || filenameForcesUnsub ? { unsubscribed: true as const } : {}),
  };
}

function buildContactTags(platform: string | null): string[] {
  return platform ? ["switch-forward", platform] : ["switch-forward"];
}

export async function processForwardEmail(
  event: ForwardEvent,
  deps: ForwardDeps,
): Promise<ForwardOutcome> {
  if (event.type !== "email.received") {
    return { kind: "ignored", reason: `unhandled_event:${event.type}` };
  }
  if (!isSwitchInbound(event)) {
    return { kind: "ignored", reason: "not_switch_address" };
  }

  const emailId = event.data?.email_id;
  if (!emailId) return { kind: "ignored", reason: "missing_email_id" };

  const body = await deps.fetchBody(emailId);
  const fromEmail = normalizeFrom(body.from || event.data?.from || "");
  if (!fromEmail) return { kind: "ignored", reason: "missing_from" };

  // Backscatter / mail-loop guard wraps every reply site in this function
  // (security review, Minor f) -- an attacker-claimable `From` must never be
  // auto-replied to when it looks like a bounce/auto-responder/one of our
  // own domains.
  async function reply(subject: string, text: string): Promise<void> {
    if (shouldSuppressReply(body.headers, fromEmail, deps.ourDomains)) {
      deps.log(
        `[switch] suppressing reply to ${fromEmail} -- auto-responder/loop/backscatter guard.`,
      );
      return;
    }
    await deps.sendReply(fromEmail, subject, text);
  }

  const userId = await deps.findUserIdByEmail(fromEmail);
  if (!userId) {
    deps.log(`[switch] no account match for ${fromEmail} -- polite bounce.`);
    await reply(
      "We couldn't match your email",
      "We couldn't match this email to a SWFL Data Gulf account — send it from the address you signed up with.",
    );
    return { kind: "unmatched_sender" };
  }

  const forwardBody: ForwardBody = {
    text: body.text,
    html: body.html,
    headers: body.headers,
    attachments: body.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
    })),
  };
  const classification = classifyForward(forwardBody);
  const platform = detectPlatform(body.headers, body.html);

  if (classification.kind === "contact_export") {
    const csvAttachments = body.attachments.filter(isCsvAttachment);
    const xlsxOnly = csvAttachments.length === 0 && body.attachments.some(isXlsxAttachment);

    if (csvAttachments.length === 0) {
      if (xlsxOnly) {
        deps.log(`[switch] ${fromEmail} forwarded XLSX-only export -- v1 supports CSV only.`);
      }
      await reply(
        "CSV exports work best",
        "We got your file, but CSV exports work best for us right now — export as CSV from your platform and forward it again.",
      );
      return { kind: "export_no_csv" };
    }

    const rows: ContactRow[] = [];
    let skipped = 0;
    let anyOversize = false;
    let anyFetched = false;

    for (const attachment of csvAttachments) {
      if (typeof attachment.size === "number" && attachment.size > MAX_ATTACHMENT_BYTES) {
        deps.log(
          `[switch] attachment ${attachment.filename} is ${attachment.size} bytes -- over the ${MAX_ATTACHMENT_BYTES}-byte cap, declining without fetching it.`,
        );
        anyOversize = true;
        continue;
      }

      const text = await deps.fetchAttachmentText(emailId, attachment.id);
      if (text === null) {
        deps.log(`[switch] attachment fetch failed for ${attachment.filename} -- skipping it.`);
        continue;
      }
      anyFetched = true;

      const normalized = normalizeCompetitorCsv(text);
      const parsed = parseContactsCsv(normalized, buildContactTags(platform));
      skipped += parsed.skippedCount;
      const filenameForcesUnsub = UNSUB_FILENAME_PATTERN.test(attachment.filename);

      for (const row of parsed.rows) {
        if (!isValidEmail(row.email)) {
          skipped++;
          continue;
        }
        if (rows.length >= MAX_STASH_ROWS) {
          skipped++;
          continue;
        }
        rows.push(toCanonicalContactRow(row, filenameForcesUnsub));
      }
    }

    if (rows.length === 0) {
      if (anyOversize && !anyFetched) {
        await reply(
          "That file's too large",
          `That file's a bit large for us right now (max ${Math.floor(MAX_ATTACHMENT_BYTES / 1_000_000)}MB) — try exporting a smaller batch and forwarding it again.`,
        );
        return { kind: "export_too_large" };
      }
      await reply(
        "We couldn't find any contacts",
        "We opened your file but didn't find any valid contacts in it — double check the export and try forwarding again.",
      );
      return { kind: "contact_export", stashed: false, rowCount: 0, skipped };
    }

    const stashResult = await deps.stashForward(userId, {
      messageId: emailId,
      kind: "contact_export",
      platform,
      senderDomain: senderDomain(fromEmail),
      html: "",
      payload: { rows, skipped, platform } as unknown as Json,
    });

    if (stashResult === "duplicate") {
      deps.log(
        `[switch] duplicate delivery for message ${emailId} -- already stashed, skipping reply.`,
      );
      return {
        kind: "contact_export",
        stashed: false,
        rowCount: rows.length,
        skipped,
        duplicate: true,
      };
    }
    if (stashResult === "error") {
      await reply(
        "We hit a problem",
        "We hit a problem saving your export — please try forwarding it again.",
      );
      return { kind: "contact_export", stashed: false, rowCount: rows.length, skipped };
    }

    await reply(
      "Your export is ready to apply",
      `We got your export — sign in at ${deps.siteUrl}/contacts/upload and click Apply to finish the switch.`,
    );
    return { kind: "contact_export", stashed: true, rowCount: rows.length, skipped };
  }

  if (classification.kind === "campaign") {
    const about = extractFooterAbout(body.html);
    const domain = senderDomain(fromEmail);
    const cappedHtml = body.html
      ? body.html.length > MAX_FORWARD_HTML
        ? body.html.slice(-MAX_FORWARD_HTML)
        : body.html
      : "";

    const stashResult = await deps.stashForward(userId, {
      messageId: emailId,
      kind: "campaign",
      platform,
      senderDomain: domain,
      html: cappedHtml,
      payload: { about, platform, senderDomain: domain } as unknown as Json,
    });

    if (stashResult === "duplicate") {
      deps.log(
        `[switch] duplicate delivery for message ${emailId} -- already stashed, skipping reply.`,
      );
      return { kind: "campaign", stashed: false, duplicate: true };
    }
    if (stashResult === "error") {
      await reply(
        "We hit a problem",
        "We hit a problem saving your campaign — please try forwarding it again.",
      );
      return { kind: "campaign", stashed: false };
    }

    await reply(
      "Got your campaign",
      "Got your campaign — sign in to apply your info and see it rebuilt.",
    );
    return { kind: "campaign", stashed: true };
  }

  await reply(
    "Let's get your migration started",
    "We couldn't tell what this was — forward either a campaign email from your current platform, or your platform's contact-export file (CSV), and we'll take it from there.",
  );
  return { kind: "unknown" };
}

// ── applyForward: the ONLY place a pending forward becomes a real write ────
// Called from the authenticated app/api/switch/apply-forward route. The
// caller already knows `authUserId` from a real signed-in session (never
// from an email's `From` header) -- this is the proof the stash-then-confirm
// redesign was missing.

export interface SwitchForwardRow {
  id: string;
  userId: string;
  kind: "contact_export" | "campaign";
  status: "pending" | "applied" | "dismissed";
  messageId: string;
  payload: unknown;
}

export interface ApplyForwardDeps {
  log: (line: string) => void;
  loadForward: (forwardId: string) => Promise<SwitchForwardRow | null>;
  markApplied: (forwardId: string) => Promise<void>;
  markDismissed: (forwardId: string) => Promise<void>;
  upsertContacts: (
    userId: string,
    rows: ContactRow[],
  ) => Promise<{ added: number; error: string | null }>;
  activatePass: (
    userId: string,
    proof: SwitchProof,
  ) => Promise<{ activated: boolean; reason?: string }>;
  insertProfileFact: (
    userId: string,
    value: string,
    messageId: string,
  ) => Promise<"inserted" | "duplicate" | "error">;
}

export type ApplyForwardOutcome =
  | { kind: "not_found"; reason: "no_row" | "not_yours" | "not_pending" }
  | { kind: "dismissed" }
  | { kind: "apply_failed"; reason: string }
  | {
      kind: "applied_contact_export";
      added: number;
      skipped: number;
      passActivated: boolean;
      passReason?: string;
      partial: boolean;
    }
  | { kind: "applied_campaign"; factWritten: boolean };

interface ContactExportPayload {
  rows: ContactRow[];
  skipped: number;
  platform: string | null;
}

interface CampaignPayload {
  about: string | null;
  platform: string | null;
  senderDomain: string | null;
}

/**
 * Apply (or dismiss) ONE pending forward, owned by `authUserId`. This is
 * where the writes the webhook used to do directly now happen -- gated on a
 * real authenticated session, never on a `From` header. Ownership + status
 * are checked BEFORE any write; a mismatch on either returns the same
 * `not_found` shape (the route maps every `not_found` reason to a uniform
 * 404 -- never leaking whether a forward exists for someone else).
 */
export async function applyForward(
  forwardId: string,
  authUserId: string,
  dismiss: boolean,
  deps: ApplyForwardDeps,
): Promise<ApplyForwardOutcome> {
  const row = await deps.loadForward(forwardId);
  if (!row) return { kind: "not_found", reason: "no_row" };
  if (row.userId !== authUserId) {
    deps.log(`[switch] apply-forward ${forwardId} requested by a non-owner -- refusing.`);
    return { kind: "not_found", reason: "not_yours" };
  }
  if (row.status !== "pending") {
    return { kind: "not_found", reason: "not_pending" };
  }

  if (dismiss) {
    await deps.markDismissed(row.id);
    return { kind: "dismissed" };
  }

  if (row.kind === "contact_export") {
    const payload = row.payload as ContactExportPayload;
    const rows = payload.rows ?? [];
    const upsert = await deps.upsertContacts(authUserId, rows);
    const added = upsert.added;

    // Partial-import honesty (established pattern): upsert error + added>0
    // still counts as real progress; only a pure failure (nothing landed)
    // skips activation and leaves the row pending so the agent can retry.
    const pureFailure = upsert.error !== null && added === 0;
    if (pureFailure) {
      deps.log(
        `[switch] apply-forward ${forwardId} upsert failed with nothing added: ${upsert.error}`,
      );
      return { kind: "apply_failed", reason: upsert.error ?? "unknown" };
    }

    const passResult = await deps.activatePass(authUserId, {
      lane: "forwarded_email",
      platform: payload.platform ?? "unknown",
      contactsImported: added,
      detail: { messageId: row.messageId } as Json,
    });

    await deps.markApplied(row.id);
    return {
      kind: "applied_contact_export",
      added,
      skipped: payload.skipped ?? 0,
      passActivated: passResult.activated,
      passReason: passResult.reason,
      partial: upsert.error !== null,
    };
  }

  // campaign
  const payload = row.payload as CampaignPayload;
  let factWritten = false;
  if (payload.about && payload.about.trim().length > 0) {
    const result = await deps.insertProfileFact(authUserId, payload.about, row.messageId);
    factWritten = result === "inserted";
    if (result === "duplicate") {
      deps.log(
        `[switch] apply-forward ${forwardId}: a live agent_profile_facts row already exists -- first forward wins, skipping.`,
      );
    } else if (result === "error") {
      deps.log(`[switch] apply-forward ${forwardId}: agent_profile_facts insert failed.`);
    }
  }

  await deps.markApplied(row.id);
  return { kind: "applied_campaign", factWritten };
}
