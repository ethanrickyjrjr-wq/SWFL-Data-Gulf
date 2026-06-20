// lib/email/outreach/send.ts
//
// Turn composed (ready) drip emails into Resend batch payloads, and send them. The
// PAYLOAD BUILDING is pure + tested (per-recipient unsubscribe URL injected, CAN-SPAM
// List-Unsubscribe headers, a `rid` tag so the webhook can map events back, chunked by
// 100 like the blast route). The SEND is a thin I/O wrapper over resend.batch.send.
//
// Model: app/api/deliverables/[id]/blast/route.ts (chunks of 100, List-Unsubscribe).

import type { ComposedMessage } from "./campaign";

/** The {{{RESEND_UNSUBSCRIBE_URL}}} placeholder ensureUnsubscribeToken leaves in the HTML. */
const UNSUB_TOKEN = "{{{RESEND_UNSUBSCRIBE_URL}}}";
const CHUNK = 100;

export interface ResendBatchMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  headers: Record<string, string>;
  tags: Array<{ name: string; value: string }>;
}

export interface BuildBatchInput {
  /** Composed messages — only `status:"ready"` (with html) are sent; others are dropped. */
  messages: ComposedMessage[];
  from: string;
  replyTo?: string;
  /** Absolute origin for the unsubscribe link, e.g. https://www.swfldatagulf.com */
  unsubBase: string;
  /** Map a message → its persisted outreach_recipients.id (drives unsub URL + the rid tag). */
  recipientId: (m: ComposedMessage) => string;
}

/** Build per-recipient Resend messages, chunked into batches of ≤100. Pure. */
export function buildBatchMessages(input: BuildBatchInput): ResendBatchMessage[][] {
  const ready = input.messages.filter((m) => m.status === "ready" && m.html);
  const built: ResendBatchMessage[] = ready.map((m) => {
    const rid = input.recipientId(m);
    const unsubUrl = `${input.unsubBase.replace(/\/$/, "")}/api/unsubscribe?rid=${encodeURIComponent(rid)}`;
    const html = (m.html as string).split(UNSUB_TOKEN).join(unsubUrl);
    return {
      from: input.from,
      to: [m.email],
      subject: m.subject,
      html,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      // rid rides on the message so the Resend webhook maps events → recipient.
      tags: [{ name: "rid", value: rid }],
    };
  });

  const batches: ResendBatchMessage[][] = [];
  for (let i = 0; i < built.length; i += CHUNK) batches.push(built.slice(i, i + CHUNK));
  return batches;
}

export interface SendResult {
  sent: number;
  failed: number;
  errors: string[];
}

/** Minimal shape of resend.batch.send we depend on (injectable for tests). */
export interface BatchSender {
  batch: { send: (msgs: ResendBatchMessage[]) => Promise<{ error: { message: string } | null }> };
}

/** Send pre-built batches. Thin I/O; a failed batch counts its whole chunk as failed. */
export async function sendBatches(
  client: BatchSender,
  batches: ResendBatchMessage[][],
): Promise<SendResult> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const batch of batches) {
    try {
      const { error } = await client.batch.send(batch);
      if (error) {
        failed += batch.length;
        errors.push(error.message);
      } else {
        sent += batch.length;
      }
    } catch (err) {
      failed += batch.length;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { sent, failed, errors };
}
