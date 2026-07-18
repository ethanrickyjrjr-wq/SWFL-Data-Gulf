/**
 * Build the agent's buyer-intent alert email — the private "your cold contact
 * just warmed up" ping that goes to the agent's REAL inbox (not the newsletter
 * sender). Pure content builder so the copy is unit-tested; the route owns the
 * actual send + recipient lookup.
 */
import { describeIntent, type ReplyIntent } from "./parse-intent";

export interface AlertInput {
  contactEmail: string;
  contactName: string | null;
  intent: ReplyIntent;
  rawReply: string;
  /** The grounded answer we auto-sent the client, when one fired. */
  answerText: string | null;
  knownContact: boolean;
  /** Why the auto-reply was withheld, when it was (e.g. "unknown_contact"). */
  blockedReason: string | null;
  /** Absolute link to the alert detail page, when the event persisted. */
  alertUrl: string | null;
}

export interface AlertContent {
  subject: string;
  text: string;
}

function who(input: AlertInput): string {
  return input.contactName?.trim() || input.contactEmail;
}

/** A short, human reason line for a withheld auto-reply. */
function blockedNote(reason: string): string {
  switch (reason) {
    case "unknown_contact":
      return "This sender isn't in your contacts — it may be a forwarded email or a new lead. We did NOT auto-reply; reach out yourself.";
    case "auto_responder":
      return "This looked like an out-of-office / auto-responder, so we did not auto-reply.";
    case "throttled":
      return "We recently auto-replied to this person, so we held off to avoid over-emailing.";
    case "thread_cap":
      return "You've had a few exchanges already — time to take this one personally. We stopped auto-replying.";
    case "agent_breaker":
      return "Daily auto-reply limit reached; we logged this but did not auto-reply.";
    case "send_failed":
      return "We tried to send an automated answer but it failed (a system error on our end) — reply to this person yourself.";
    default:
      return "We did not auto-reply to this one.";
  }
}

export function buildAlertContent(input: AlertInput): AlertContent {
  const name = who(input);
  const topic = describeIntent(input.intent);

  const subject = input.answerText
    ? `${name} just asked about ${topic}`
    : `${name} replied — ${topic}`;

  const lines: string[] = [];
  lines.push(`${name} replied to your branded market-data email.`);
  lines.push("");
  lines.push(`What they're asking about: ${topic}`);
  lines.push("");
  lines.push("Their message:");
  lines.push(input.rawReply ? `  "${input.rawReply}"` : "  (no text)");
  lines.push("");

  if (input.answerText) {
    lines.push("We sent them this grounded, cited answer on your behalf:");
    lines.push(`  ${input.answerText}`);
  } else {
    lines.push(blockedNote(input.blockedReason ?? ""));
  }

  lines.push("");
  lines.push(`Reply to ${input.contactEmail} to take it from here.`);
  if (input.alertUrl) {
    lines.push(`Full context → ${input.alertUrl}`);
  }

  return { subject, text: lines.join("\n") };
}
