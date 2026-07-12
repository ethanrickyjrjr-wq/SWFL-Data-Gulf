// lib/email/suppression.ts
//
// THE suppression authority for per-recipient sends (one root — spec:
// docs/superpowers/specs/2026-07-12-send-safety-floor-design.md). One human
// lives in four ledgers (contacts / email_subscribers / weekly_read_subscribers
// / outreach_recipients) plus the blast lane's append-only event history
// (email_events); before a real send, the union of all of them decides who is
// NOT sendable. Events stay append-only (blast-events.ts never flips status —
// that property is kept); this filters at send time instead.
//
// Resend's account-level suppression list is the transport backstop (a hard
// bounce or complaint suppresses delivery vendor-side — verified 07/12/2026,
// resend.com/docs/knowledge-base/why-are-my-emails-landing-on-the-suppression-list)
// but a vendor-suppressed send still burns the user's paid quota and counts as
// "sent" in our stats, and unsubscribes in our other ledgers never reach it.
// This module is what keeps quota and stats honest and consent cross-lane.
//
// Pure decision core (decideSuppressions) + thin chunked-query wrapper
// (getSuppressedContacts), mirroring the extract/decide pattern of
// blast-events.ts / outreach/lifecycle.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

export type SuppressionReason = "complained" | "bounced" | "unsubscribed";

export interface CandidateContact {
  id: string;
  email: string;
}

/** The rows the four ledgers hold for the candidate contacts. */
export interface SuppressionLedgers {
  /** email_events rows for the candidates' contact ids (blast lane history). */
  blastEvents: Array<{ contact_id: string | null; event: string }>;
  /** outreach_recipients rows matching the candidates' emails. */
  outreach: Array<{ email: string; status: string }>;
  /** weekly_read_subscribers rows matching the candidates' emails. */
  weeklyRead: Array<{ email: string; status: string }>;
  /** email_subscribers rows matching the candidates' emails. */
  subscribers: Array<{ email: string; status: string }>;
}

/** Resend's `email.bounced` is permanent-rejection only (temporary issues are
 *  `email.delivery_delayed`, which we don't log) — so any bounced row is a
 *  hard bounce and suppresses immediately. */
const EVENT_REASON: Record<string, SuppressionReason> = {
  bounced: "bounced",
  complained: "complained",
};

/** Ledger statuses that suppress. `engaged` (outreach: a click) is a positive
 *  signal, never suppression; complaint maps to `unsubscribed` in the outreach
 *  and weekly-read ledgers, so it's covered by that status. */
const STATUS_REASON: Record<string, SuppressionReason> = {
  bounced: "bounced",
  complained: "complained",
  unsubscribed: "unsubscribed",
};

/** Gravest reason wins in the report (any reason suppresses). */
const SEVERITY: Record<SuppressionReason, number> = {
  complained: 3,
  bounced: 2,
  unsubscribed: 1,
};

const norm = (email: string) => email.trim().toLowerCase();

/**
 * Decide which candidate contacts must not be sent to, given the rows the
 * ledgers hold for them. Returns contactId → gravest reason; a contact absent
 * from the map is sendable. Pure.
 */
export function decideSuppressions(
  contacts: CandidateContact[],
  rows: SuppressionLedgers,
): Map<string, SuppressionReason> {
  const out = new Map<string, SuppressionReason>();
  const add = (id: string, reason: SuppressionReason) => {
    const prior = out.get(id);
    if (!prior || SEVERITY[reason] > SEVERITY[prior]) out.set(id, reason);
  };

  const byId = new Set(contacts.map((c) => c.id));
  for (const ev of rows.blastEvents) {
    const reason = EVENT_REASON[ev.event];
    if (reason && ev.contact_id && byId.has(ev.contact_id)) add(ev.contact_id, reason);
  }

  const idsByEmail = new Map<string, string[]>();
  for (const c of contacts) {
    const key = norm(c.email);
    idsByEmail.set(key, [...(idsByEmail.get(key) ?? []), c.id]);
  }
  for (const ledger of [rows.outreach, rows.weeklyRead, rows.subscribers]) {
    for (const row of ledger) {
      const reason = STATUS_REASON[row.status];
      if (!reason) continue;
      for (const id of idsByEmail.get(norm(row.email)) ?? []) add(id, reason);
    }
  }
  return out;
}

const CHUNK = 100;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * Fetch the four ledgers' rows for the candidates (service-role client — the
 * platform ledgers have no user-facing read policy) and decide. Queries are
 * chunked ≤100 per .in() (same posture as the blast route's engagement
 * lookup) and fail open per ledger: a lookup error means "no rows from that
 * ledger", with Resend's account-level suppression as the transport backstop.
 * Email .in() filters use raw + lowercased spellings; exact matching is the
 * pure core's (case/whitespace-insensitive).
 */
export async function getSuppressedContacts(
  db: SupabaseClient<Database>,
  contacts: CandidateContact[],
): Promise<Map<string, SuppressionReason>> {
  if (contacts.length === 0) return new Map();
  const ids = contacts.map((c) => c.id);
  const emails = [...new Set(contacts.flatMap((c) => [c.email, norm(c.email)]))];

  const ledgers: SuppressionLedgers = {
    blastEvents: [],
    outreach: [],
    weeklyRead: [],
    subscribers: [],
  };

  for (const idChunk of chunks(ids)) {
    const { data } = await db
      .from("email_events")
      .select("contact_id, event")
      .in("contact_id", idChunk)
      .in("event", ["bounced", "complained"]);
    if (data) ledgers.blastEvents.push(...data);
  }
  for (const emailChunk of chunks(emails)) {
    const [outreach, weekly, subs] = await Promise.all([
      db
        .from("outreach_recipients")
        .select("email, status")
        .in("email", emailChunk)
        .in("status", ["bounced", "unsubscribed"]),
      db
        .from("weekly_read_subscribers")
        .select("email, status")
        .in("email", emailChunk)
        .in("status", ["bounced", "unsubscribed"]),
      db
        .from("email_subscribers")
        .select("email, status")
        .in("email", emailChunk)
        .in("status", ["bounced", "complained", "unsubscribed"]),
    ]);
    if (outreach.data) ledgers.outreach.push(...outreach.data);
    if (weekly.data) ledgers.weeklyRead.push(...weekly.data);
    if (subs.data) ledgers.subscribers.push(...subs.data);
  }

  return decideSuppressions(contacts, ledgers);
}
