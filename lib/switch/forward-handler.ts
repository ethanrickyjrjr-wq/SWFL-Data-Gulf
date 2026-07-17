/**
 * Forward-lane orchestration core (Task 10). Same split as
 * lib/email/process-inbound.ts: ALL decision logic lives here behind an
 * injected `ForwardDeps`, so the account-match / classify / export-import /
 * campaign-facts / reply flow is unit-testable with no DB and no network.
 * The route (app/api/webhooks/resend/route.ts) builds the real seams
 * (Resend body + attachment fetch, Supabase lookups/writes, the
 * transactional reply send) and is adapter-only.
 *
 * The arc, per forwarded email:
 *   1. is this addressed to switch@? (isSwitchInbound, Task 9) -- the route
 *      already gates on this before calling in, but this function re-checks
 *      so it's independently testable/callable.
 *   2. `from` -> an auth user. No match -> polite reply, ack.
 *   3. fetch body (webhook is metadata-only) + classify (Task 9).
 *   4. contact_export -> CSV attachment(s) -> normalize -> parse -> upsert ->
 *      activate pass (partial-import honest) -> confirmation reply.
 *   5. campaign -> footer About-text -> ONE agent_profile_facts row (first
 *      forward wins on a live-row conflict) -> stash for Tasks 11-12 -> ack.
 *   6. unknown -> polite reply listing the two things we accept -> ack.
 */
import {
  isSwitchInbound,
  classifyForward,
  detectPlatform,
  extractFooterAbout,
  senderDomain,
  type ForwardBody,
} from "@/lib/switch/forward-inbound";
import { normalizeCompetitorCsv } from "@/lib/switch/export-columns";
import { parseContactsCsv } from "@/lib/email/parse-contacts-csv";
import { isValidEmail } from "@/lib/email/validation";
import { MIN_SWITCH_IMPORT, type SwitchProof } from "@/lib/switch/activate";
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

function isCsvAttachment(a: ForwardAttachmentMeta): boolean {
  return CSV_EXTENSION.test(a.filename) || CSV_CONTENT_TYPES.has(a.contentType.toLowerCase());
}
function isXlsxAttachment(a: ForwardAttachmentMeta): boolean {
  return XLSX_EXTENSION.test(a.filename) || XLSX_CONTENT_TYPES.has(a.contentType.toLowerCase());
}

export interface ForwardDeps {
  log: (line: string) => void;

  /** `from` address -> matched auth user id, or null when no account matches.
   *  Pagination + any hard cap live in the adapter (no email->user lookup
   *  helper exists anywhere else in the repo -- grepped listUsers/
   *  getUserByEmail/profiles, none found). */
  findUserIdByEmail: (email: string) => Promise<string | null>;

  /** Fetch the full body (webhook is metadata-only). */
  fetchBody: (emailId: string) => Promise<ForwardEmailBody>;

  /** Fetch one attachment's decoded text content (the 3-hop Resend flow:
   *  receiving.attachments.get -> signed download_url -> fetch(url)). Null on
   *  any failure -- degrade gracefully, never throw (no documented inbound
   *  size cap; a bad/huge/expired download must not break the whole email). */
  fetchAttachmentText: (emailId: string, attachmentId: string) => Promise<string | null>;

  /** Upsert parsed rows into public.contacts for the matched user. */
  upsertContacts: (
    userId: string,
    rows: ContactRow[],
  ) => Promise<{ added: number; error: string | null }>;

  /** Grant the Switch Pass on verified proof (no-op below MIN_SWITCH_IMPORT). */
  activatePass: (
    userId: string,
    proof: SwitchProof,
  ) => Promise<{ activated: boolean; reason?: string }>;

  /** Insert ONE agent_profile_facts row. "duplicate" = a live row already
   *  exists for (user_id, key) -- first forward wins, not an error. */
  insertProfileFact: (
    userId: string,
    value: string,
    messageId: string,
  ) => Promise<"inserted" | "duplicate" | "error">;

  /** Stash the forwarded campaign for Tasks 11 (brand) / 12 (rebuild). */
  stashForward: (
    userId: string,
    row: { messageId: string; platform: string | null; senderDomain: string | null; html: string },
  ) => Promise<void>;

  /** Send a short plain-text reply. */
  sendReply: (to: string, subject: string, text: string) => Promise<void>;
}

export type ForwardOutcome =
  | { kind: "ignored"; reason: string }
  | { kind: "unmatched_sender" }
  | {
      kind: "contact_export";
      added: number;
      skipped: number;
      passActivated: boolean;
      passReason?: string;
    }
  | { kind: "export_no_csv" }
  | {
      kind: "campaign";
      factWritten: boolean;
      factReason: "written" | "duplicate" | "absent" | "error";
    }
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

  const userId = await deps.findUserIdByEmail(fromEmail);
  if (!userId) {
    deps.log(`[switch] no account match for ${fromEmail} -- polite bounce.`);
    await deps.sendReply(
      fromEmail,
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
      await deps.sendReply(
        fromEmail,
        "CSV exports work best",
        "We got your file, but CSV exports work best for us right now — export as CSV from your platform and forward it again.",
      );
      return { kind: "export_no_csv" };
    }

    const rows: ContactRow[] = [];
    let skipped = 0;
    for (const attachment of csvAttachments) {
      const text = await deps.fetchAttachmentText(emailId, attachment.id);
      if (text === null) {
        deps.log(`[switch] attachment fetch failed for ${attachment.filename} -- skipping it.`);
        continue;
      }
      const normalized = normalizeCompetitorCsv(text);
      const parsed = parseContactsCsv(normalized, buildContactTags(platform));
      skipped += parsed.skippedCount;
      const filenameForcesUnsub = UNSUB_FILENAME_PATTERN.test(attachment.filename);
      for (const row of parsed.rows) {
        if (!isValidEmail(row.email)) {
          skipped++;
          continue;
        }
        rows.push(toCanonicalContactRow(row, filenameForcesUnsub));
      }
    }

    const upsert = await deps.upsertContacts(userId, rows);
    const added = upsert.added;

    // Partial-import honesty: an upsert error with SOME rows added still
    // activates the pass with the partial count; only a pure failure (no
    // rows landed at all) skips activation entirely.
    const pureFailure = upsert.error !== null && added === 0;
    const passResult = pureFailure
      ? { activated: false, reason: "error" as const }
      : await deps.activatePass(userId, {
          lane: "forwarded_email",
          platform: platform ?? "unknown",
          contactsImported: added,
          detail: { messageId: emailId } as Json,
        });

    const parts: string[] = [];
    if (upsert.error && added > 0) {
      parts.push(
        `We imported ${added} contact${added === 1 ? "" : "s"} (a few rows had an issue partway through).`,
      );
    } else if (upsert.error) {
      parts.push(
        "We ran into a problem importing your contacts — nothing was saved. Please try forwarding again.",
      );
    } else {
      parts.push(
        `Imported ${added} contact${added === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped)` : ""}.`,
      );
    }
    if (passResult.activated) {
      parts.push("You've got 60 days of Starter running — enjoy the switch.");
    } else if (passResult.reason === "below_minimum") {
      parts.push(
        `Once you're at ${MIN_SWITCH_IMPORT}+ imported contacts we'll auto-activate your 60 days of Starter.`,
      );
    } else if (passResult.reason === "already_active") {
      parts.push("Your Switch Pass is already active.");
    }

    await deps.sendReply(fromEmail, "Your contacts are in", parts.join(" "));

    return {
      kind: "contact_export",
      added,
      skipped,
      passActivated: passResult.activated,
      passReason: passResult.reason,
    };
  }

  if (classification.kind === "campaign") {
    const about = extractFooterAbout(body.html);
    let factReason: "written" | "duplicate" | "absent" | "error" = "absent";
    if (about !== null) {
      const result = await deps.insertProfileFact(userId, about, emailId);
      factReason = result === "inserted" ? "written" : result;
      if (result === "duplicate") {
        deps.log(
          `[switch] agent_profile_facts already has a live 'forwarded_campaign_about' for ${userId} -- first forward wins, skipping.`,
        );
      } else if (result === "error") {
        deps.log(`[switch] agent_profile_facts write failed for ${userId}.`);
      }
    }

    await deps.stashForward(userId, {
      messageId: emailId,
      platform,
      senderDomain: senderDomain(fromEmail),
      html: body.html ?? "",
    });

    await deps.sendReply(
      fromEmail,
      "Got it — rebuilding your campaign",
      "Got it — we're rebuilding your campaign with live data; check your drafts shortly.",
    );

    return { kind: "campaign", factWritten: factReason === "written", factReason };
  }

  await deps.sendReply(
    fromEmail,
    "Let's get your migration started",
    "We couldn't tell what this was — forward either a campaign email from your current platform, or your platform's contact-export file (CSV), and we'll take it from there.",
  );
  return { kind: "unknown" };
}
