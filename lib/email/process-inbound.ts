/**
 * Inbound-reply orchestration core for the Buyer-Intent Reply Sensor.
 *
 * Same split as the scheduler (lib core + route adapter): ALL decision logic
 * lives here behind injected `InboundDeps`, so the known-contact / unknown-sender
 * / loop-guard / throttle flow is unit-testable with no DB and no network. The
 * route `app/api/webhooks/resend/route.ts` builds the real seams (Resend body
 * fetch, Supabase lookups, the grounded engine, transactional sends).
 *
 * The arc, per reply:
 *   1. is it a `email.received` to one of OUR r-{token}@ addresses? else ignore.
 *   2. token → `email_sends` → agent + schedule. Unknown token → ignore.
 *   3. fetch body; identify the client by `from` vs `email_contacts`.
 *   4. run the ordered Unit-4 gates (identity → loop → throttle → thread → breaker).
 *   5. PASS → grounded auto-reply to the client (thread stays sensing).
 *   6. ALWAYS → log a `buyer_intent_events` row + alert the agent (even on no-reply:
 *      an unknown sender is a possible forwarded lead the agent still wants).
 */
import { pickReplyEntry, buildReplyAddress } from "./reply-token";
import { isAutoResponder, evaluateAutoReply, AUTO_REPLY_LIMITS } from "./inbound-guards";
import { parseReplyIntent, describeIntent, type ReplyIntent } from "./parse-intent";
import { asOfFromToken } from "@/lib/project/as-of";

/** The minimal webhook event shape we act on (subset of Resend's EmailReceivedEvent). */
export interface InboundEvent {
  type: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
  };
}

/** The fetched body + headers (subset of Resend's GetReceivingEmailResponse). */
export interface InboundBody {
  from: string;
  subject: string;
  text: string;
  headers: Record<string, string | undefined>;
}

/** The send a token resolves to, plus the agent's branded sender identity. */
export interface ResolvedSend {
  userId: string;
  scheduleId: number | null;
  fromName: string;
  fromEmail: string;
}

export interface InboundContact {
  name: string | null;
  tags: string[];
}

export interface InboundDeps {
  replyDomain: string;
  now: Date;
  log: (line: string) => void;

  /** Fetch the reply body for an inbound email id (webhook is metadata-only). */
  fetchBody: (emailId: string) => Promise<InboundBody>;
  /** token → send + agent sender. null when the token is unknown/expired. */
  lookupSend: (token: string) => Promise<ResolvedSend | null>;
  /** Identify the client by (agent, from). null = not in the agent's contacts. */
  lookupContact: (userId: string, email: string) => Promise<InboundContact | null>;

  /** Count auto-replies already sent to this sender since `sinceIso` (throttle). */
  countSenderRecent: (userId: string, email: string, sinceIso: string) => Promise<number>;
  /** Count auto-replies already sent in this (token, sender) thread (thread cap). */
  countThread: (token: string, email: string) => Promise<number>;
  /** Count auto-replies already sent for this agent since `sinceIso` (breaker). */
  countAgentDay: (userId: string, sinceIso: string) => Promise<number>;

  /** Grounded answer to the client's question (buffered). */
  generateAnswer: (message: string) => Promise<{ text: string; freshnessToken: string }>;
  /** Send the branded auto-reply to the client, FROM the agent, replyTo the token. */
  sendAutoReply: (args: {
    to: string;
    fromName: string;
    fromEmail: string;
    replyTo: string;
    subject: string;
    text: string;
  }) => Promise<void>;

  /** Persist the buyer-intent event; returns the new row id (for the alert link). */
  recordEvent: (row: {
    userId: string;
    replyToken: string;
    scheduleId: number | null;
    contactEmail: string;
    contactName: string | null;
    contactTags: string[];
    intent: ReplyIntent;
    rawReply: string;
    answerSent: boolean;
  }) => Promise<number | null>;

  /** Alert the agent in their REAL inbox: what was asked + raw reply + link. */
  sendAgentAlert: (args: {
    userId: string;
    eventId: number | null;
    contactEmail: string;
    contactName: string | null;
    intent: ReplyIntent;
    rawReply: string;
    answerText: string | null;
    knownContact: boolean;
    blockedReason: string | null;
  }) => Promise<void>;
}

export type InboundOutcome =
  | { kind: "ignored"; reason: string }
  | {
      kind: "processed";
      answerSent: boolean;
      knownContact: boolean;
      blockedReason: string | null;
      eventId: number | null;
    };

/** Lowercase + strip a display-name wrapper to a bare address. */
function normalizeFrom(raw: string): string {
  const angled = /<([^>]+)>/.exec(raw);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

export async function processInboundReply(
  event: InboundEvent,
  deps: InboundDeps,
): Promise<InboundOutcome> {
  if (event.type !== "email.received") {
    return { kind: "ignored", reason: `unhandled_event:${event.type}` };
  }

  // 1. Is this addressed to one of our sensor addresses? Parse the token.
  const entry = pickReplyEntry(event.data?.to, deps.replyDomain);
  if (!entry) return { kind: "ignored", reason: "not_sensor_address" };

  // 2. token → send + agent.
  const send = await deps.lookupSend(entry.token);
  if (!send) {
    deps.log(`[inbound] unknown token ${entry.token} — ignoring.`);
    return { kind: "ignored", reason: "unknown_token" };
  }

  const emailId = event.data?.email_id;
  if (!emailId) return { kind: "ignored", reason: "missing_email_id" };

  // 3. Fetch the body (the webhook carries metadata only).
  const body = await deps.fetchBody(emailId);
  const fromEmail = normalizeFrom(body.from || event.data?.from || "");
  if (!fromEmail) return { kind: "ignored", reason: "missing_from" };

  const subject = body.subject || event.data?.subject || "";
  const rawReply = body.text?.trim() || "";
  const intent = parseReplyIntent(`${subject}\n${rawReply}`);

  // 4. Identify the client + run the ordered gates.
  const contact = await deps.lookupContact(send.userId, fromEmail);
  const knownContact = contact !== null;

  const autoResponder = isAutoResponder({
    headers: body.headers ?? {},
    fromEmail,
    replyDomain: deps.replyDomain,
  });

  const throttleSinceIso = new Date(
    deps.now.getTime() - AUTO_REPLY_LIMITS.throttleWindowMs,
  ).toISOString();
  const dayStartIso = new Date(
    Date.UTC(deps.now.getUTCFullYear(), deps.now.getUTCMonth(), deps.now.getUTCDate()),
  ).toISOString();

  const [senderRecentCount, threadCount, agentDayCount] = await Promise.all([
    deps.countSenderRecent(send.userId, fromEmail, throttleSinceIso),
    deps.countThread(entry.token, fromEmail),
    deps.countAgentDay(send.userId, dayStartIso),
  ]);

  const decision = evaluateAutoReply({
    knownContact,
    autoResponder,
    senderRecentCount,
    threadCount,
    agentDayCount,
  });

  // 5. PASS → grounded auto-reply. The reply keeps the SAME monitored reply-to so
  //    a follow-up keeps sensing (until the thread cap hands off to the human).
  let answerText: string | null = null;
  // Distinguishes a genuine send/model failure from "nothing needed blocking" so
  // blockedReason below doesn't collapse both into the same null value.
  let answerFailedReason: string | null = null;
  if (decision.allow && rawReply) {
    try {
      const answer = await deps.generateAnswer(rawReply);
      // The answer is a buffered snapshot of the dossier at generation time — it must
      // carry its own as-of date into the sent text, the same way every other grounded
      // answer surface does, instead of discarding `freshnessToken` on the floor.
      const asOf = asOfFromToken(answer.freshnessToken);
      const text = asOf ? `${answer.text}\n\n(Figures as of ${asOf}.)` : answer.text;
      await deps.sendAutoReply({
        to: fromEmail,
        fromName: send.fromName,
        fromEmail: send.fromEmail,
        replyTo: buildReplyAddress(entry.token, deps.replyDomain),
        subject: subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
        text,
      });
      answerText = text;
      deps.log(`[inbound] auto-replied to ${fromEmail} (${describeIntent(intent)}).`);
    } catch (err) {
      // A send/model failure must NOT lose the lead signal — fall through to the
      // alert with answerSent=false so the agent still gets the warm-lead ping.
      deps.log(
        `[inbound] auto-reply FAILED for ${fromEmail}: ${err instanceof Error ? err.message : String(err)}`,
      );
      answerText = null;
      answerFailedReason = "send_failed";
    }
  } else if (!decision.allow) {
    deps.log(`[inbound] no auto-reply to ${fromEmail} — ${decision.reason}.`);
  }

  const answerSent = answerText !== null;
  const blockedReason = decision.allow ? answerFailedReason : decision.reason;

  // 6. ALWAYS log the event + alert the agent (a forwarded/unknown lead still counts).
  const eventId = await deps.recordEvent({
    userId: send.userId,
    replyToken: entry.token,
    scheduleId: send.scheduleId,
    contactEmail: fromEmail,
    contactName: contact?.name ?? null,
    contactTags: contact?.tags ?? [],
    intent,
    rawReply,
    answerSent,
  });

  await deps.sendAgentAlert({
    userId: send.userId,
    eventId,
    contactEmail: fromEmail,
    contactName: contact?.name ?? null,
    intent,
    rawReply,
    answerText,
    knownContact,
    blockedReason,
  });

  return { kind: "processed", answerSent, knownContact, blockedReason, eventId };
}
