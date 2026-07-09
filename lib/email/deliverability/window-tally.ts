// lib/email/deliverability/window-tally.ts
//
// Pure event-count reducer for the bounce/spam-rate window. Only
// delivered/bounced/complained feed the rates — opened/clicked arrive AFTER
// delivery and, for an engaged list, outnumber deliveries. If they consumed
// window slots (the bounded query is ORDER BY created_at DESC LIMIT N), the
// counted `delivered` denominator would shrink and overstate both rates —
// exactly the failure mode that would false-flag a healthy bulk sender
// (5,000+/day) as failing Gmail's thresholds. The route's Supabase query
// already filters to these three event types; this function ignores anything
// else too, as a second guard if that filter is ever loosened.

export interface WindowTally {
  delivered: number;
  bounced: number;
  complained: number;
}

export function tallyRateEvents(rows: { event: string }[]): WindowTally {
  let delivered = 0;
  let bounced = 0;
  let complained = 0;
  for (const row of rows) {
    if (row.event === "delivered") delivered++;
    else if (row.event === "bounced") bounced++;
    else if (row.event === "complained") complained++;
    // opened/clicked/unsubscribed/sent (or anything unexpected): not a rate input, ignored.
  }
  return { delivered, bounced, complained };
}
