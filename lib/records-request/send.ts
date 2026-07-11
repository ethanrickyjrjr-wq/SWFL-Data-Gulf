// Thin transactional send for a §119 request. Reuses the Resend client shape
// (resend.emails.send) but NOT the marketing batch builders — a records request
// is transactional, not commercial: no unsubscribe header, no tags, plain text.

export interface RecordsRequestMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  emails: {
    send: (m: RecordsRequestMessage) => Promise<{ error: { message: string } | null }>;
  };
}

export async function sendRecordsRequest(
  client: EmailSender,
  msg: RecordsRequestMessage,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await client.emails.send(msg);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
