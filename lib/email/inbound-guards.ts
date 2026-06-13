/**
 * Guards for the client auto-reply (Unit 4). All pure functions so the
 * loop-prevention logic is unit-tested with no I/O. The webhook supplies the
 * runtime counts (queried from `buyer_intent_events`) and identity flags; the
 * decision is made here.
 *
 * Guards are ORDERED — the first is identity, not headers, because an
 * unknown-sender auto-reply is a spam/forwarded-lead vector that must be shut
 * before anything else.
 */

/** v1 ceilings. Exported so the webhook and tests share one source of truth. */
export const AUTO_REPLY_LIMITS = {
  /** Gate 2 — at most this many auto-replies to one sender per window. */
  throttlePerWindow: 1,
  throttleWindowMs: 10 * 60 * 1000, // 10 min
  /** Gate 3 — at most this many auto-replies per (reply_token, sender) thread. */
  threadCap: 3,
  /** Gate 4 — at most this many auto-replies per agent per day. */
  agentPerDay: 10,
} as const;

const AUTO_LOCALPARTS = /^(noreply|no-reply|do-not-reply|donotreply|mailer-daemon|postmaster)$/i;

/** Lowercase header lookup — inbound header casing is not guaranteed. */
function headerVal(headers: Record<string, string | undefined>, name: string): string {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want && typeof v === "string") return v;
  }
  return "";
}

/**
 * RFC 3834 / common auto-responder markers. Replying to any of these is exactly
 * what starts a mail ping-pong loop, so they are a HARD skip.
 *
 * Fires when: `Auto-Submitted` present and not `no`; `Precedence` is
 * bulk/auto_reply/list/junk; `X-Auto-Response-Suppress` present; the sender
 * local-part is a no-reply/daemon address; or the sender is itself on our reply
 * domain (a loop with ourselves).
 */
export function isAutoResponder(args: {
  headers: Record<string, string | undefined>;
  fromEmail: string;
  replyDomain: string;
}): boolean {
  const { headers, fromEmail, replyDomain } = args;

  const autoSubmitted = headerVal(headers, "auto-submitted").trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;

  const precedence = headerVal(headers, "precedence").trim().toLowerCase();
  if (["bulk", "auto_reply", "list", "junk"].includes(precedence)) return true;

  if (headerVal(headers, "x-auto-response-suppress").trim() !== "") return true;

  const addr = fromEmail.trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at === -1) return true; // malformed sender → don't auto-reply
  const local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  if (AUTO_LOCALPARTS.test(local)) return true;
  if (domain === replyDomain.toLowerCase()) return true;

  return false;
}

export type GateDecision = { allow: true } | { allow: false; reason: string };

/**
 * The ordered auto-reply gate. Identity first (Gate 0), then loop signals
 * (Gate 1), then the three count-based limits (Gates 2–4). The first failing
 * gate wins and names the reason (logged on the event + surfaced to the agent).
 */
export function evaluateAutoReply(args: {
  knownContact: boolean;
  autoResponder: boolean;
  /** auto-replies already sent to this sender within the throttle window. */
  senderRecentCount: number;
  /** auto-replies already sent in this (reply_token, sender) thread. */
  threadCount: number;
  /** auto-replies already sent for this agent today. */
  agentDayCount: number;
  limits?: typeof AUTO_REPLY_LIMITS;
}): GateDecision {
  const limits = args.limits ?? AUTO_REPLY_LIMITS;

  // Gate 0 — known contact only (HARD). Unknown sender never gets a branded reply.
  if (!args.knownContact) return { allow: false, reason: "unknown_contact" };

  // Gate 1 — loop / auto-responder signals (HARD, RFC 3834).
  if (args.autoResponder) return { allow: false, reason: "auto_responder" };

  // Gate 2 — per-sender throttle.
  if (args.senderRecentCount >= limits.throttlePerWindow)
    return { allow: false, reason: "throttled" };

  // Gate 3 — thread cap (hand off to the human at peak intent).
  if (args.threadCount >= limits.threadCap) return { allow: false, reason: "thread_cap" };

  // Gate 4 — per-agent daily circuit breaker.
  if (args.agentDayCount >= limits.agentPerDay) return { allow: false, reason: "agent_breaker" };

  return { allow: true };
}
