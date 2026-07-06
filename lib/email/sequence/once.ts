/** lib/email/sequence/once.ts — identity + idempotency-key helpers for
 *  sequence one-shot rows. Shared by the cron runner and the send-now route so
 *  the two paths can never derive different keys. */

export function isSequenceOnceRow(row: {
  cadence?: string | null;
  template_id?: string | null;
  deliverable_id?: string | null;
}): boolean {
  return row.cadence === "once" && row.template_id === "block-canvas" && !!row.deliverable_id;
}

/** DATE-FREE by design: a one-shot fires at most once EVER. The digest lane's
 *  date-suffixed key would double-send a crash-orphan healed past midnight. */
export function onceClaimKey(row: { id: number }): string {
  return `once:${row.id}`;
}
