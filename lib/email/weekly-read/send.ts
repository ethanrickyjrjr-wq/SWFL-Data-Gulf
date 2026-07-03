// lib/email/weekly-read/send.ts
//
// Weekly-read batch build + send. SAME SHAPE as lib/email/outreach/send.ts — chunk
// 100 (Resend's hard batch cap, re-verified 07/03/2026), per-recipient unsubscribe
// URL substituted into the token, one-click List-Unsubscribe headers — but its OWN
// types: weekly-read messages carry a `wid` tag (weekly_read_subscribers.id), never
// outreach's `rid`, and nothing here imports from lib/email/outreach/*. The token
// literal comes from the shared scheduler root, the same one the broadcast route
// and finalizeIssueHtml already use.

import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";

const CHUNK = 100;

export interface WeeklyReadBatchMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  headers: Record<string, string>;
  tags: Array<{ name: string; value: string }>;
}

export interface WeeklyReadOutgoing {
  subscriberId: string;
  email: string;
  subject: string;
  html: string;
}

export interface BuildWeeklyReadBatchesInput {
  messages: WeeklyReadOutgoing[];
  from: string;
  replyTo?: string;
  /** Absolute origin for the unsubscribe link, e.g. https://www.swfldatagulf.com */
  unsubBase: string;
}

/** Build per-subscriber Resend messages, chunked into batches of ≤100. Pure. */
export function buildWeeklyReadBatches(
  input: BuildWeeklyReadBatchesInput,
): WeeklyReadBatchMessage[][] {
  const built: WeeklyReadBatchMessage[] = input.messages.map((m) => {
    const unsubUrl = `${input.unsubBase.replace(/\/$/, "")}/api/unsubscribe?wid=${encodeURIComponent(m.subscriberId)}`;
    return {
      from: input.from,
      to: [m.email],
      subject: m.subject,
      html: m.html.split(UNSUBSCRIBE_TOKEN).join(unsubUrl),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      // wid rides on the message so the Resend webhook maps events → subscriber.
      tags: [{ name: "wid", value: m.subscriberId }],
    };
  });

  const batches: WeeklyReadBatchMessage[][] = [];
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
  batch: {
    send: (msgs: WeeklyReadBatchMessage[]) => Promise<{ error: { message: string } | null }>;
  };
}

/** Send pre-built batches. Thin I/O; a failed batch counts its whole chunk as failed. */
export async function sendWeeklyReadBatches(
  client: BatchSender,
  batches: WeeklyReadBatchMessage[][],
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
