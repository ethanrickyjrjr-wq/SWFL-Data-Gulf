// lib/email/campaign-stats.ts
/**
 * Pure aggregation of STORED send/engagement rows into the hub Campaigns card.
 * Every number is a count over email_events rows (unique per recipient message
 * by the DB dedupe index) or a ratio of two such counts — nothing modeled,
 * nothing external. Campaign identity: deliverables.campaign_key groups the
 * artifacts a quick-start campaign saved together; a keyless deliverable is
 * its own campaign. Scheduled broadcast occurrences (email_sends) carry send
 * dates but no per-recipient events (probe 07/16/2026) — they add sendCount,
 * never invented rates. Pure; no Supabase, no Date.now().
 */

export interface CampaignRow {
  key: string;
  label: string;
  projectId: string | null;
  dids: string[];
  lastSentAt: string | null;
  sendCount: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  openPct: number | null;
  clickPct: number | null;
  deltaOpenVsAvg: number | null;
  hourBuckets: { label: string; opens: number; clicks: number }[] | null;
  sendOverSend: { label: string; openPct: number }[];
  asOf: string | null;
}

export interface CampaignStats {
  campaigns: CampaignRow[];
  ownAvgOpenPct: number | null;
  strongest: string | null;
}

const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 1000) / 10 : null;

const BUCKET_LABELS = ["0–4h", "4–8h", "8–12h", "12–16h", "16–20h", "20–24h"];
/** strongest-line floors — deterministic, documented: a 1-send or tiny-list
 *  campaign can't be crowned on noise. */
const STRONGEST_MIN_SENDS = 2;
const STRONGEST_MIN_DELIVERED = 5;

export function campaignStats(input: {
  blasts: { deliverable_id: string; sent_at: string | null }[];
  deliverables: {
    id: string;
    project_id: string;
    campaign_key: string | null;
    instruction: string | null;
  }[];
  events: { did: string | null; event: string; created_at: string }[];
  scheduledSends: { sent_at: string; deliverable_id: string | null }[];
}): CampaignStats {
  const delivById = new Map(input.deliverables.map((d) => [d.id, d]));

  // Per-did event tallies + raw open/click timestamps (for buckets).
  const tally = new Map<
    string,
    { counts: Record<string, number>; opens: string[]; clicks: string[] }
  >();
  for (const e of input.events) {
    if (!e.did || !delivById.has(e.did)) continue;
    const t = tally.get(e.did) ?? { counts: {}, opens: [], clicks: [] };
    t.counts[e.event] = (t.counts[e.event] ?? 0) + 1;
    if (e.event === "opened") t.opens.push(e.created_at);
    if (e.event === "clicked") t.clicks.push(e.created_at);
    tally.set(e.did, t);
  }

  // Group dids into campaigns.
  const groups = new Map<string, string[]>();
  for (const d of input.deliverables) {
    const key = d.campaign_key ?? `did:${d.id}`;
    const list = groups.get(key) ?? [];
    list.push(d.id);
    groups.set(key, list);
  }

  // Send occurrences per did.
  const sendsByDid = new Map<string, string[]>();
  const addSend = (did: string | null, at: string | null) => {
    if (!did || !at || !delivById.has(did)) return;
    const list = sendsByDid.get(did) ?? [];
    list.push(at);
    sendsByDid.set(did, list);
  };
  for (const b of input.blasts) addSend(b.deliverable_id, b.sent_at);
  for (const s of input.scheduledSends) addSend(s.deliverable_id, s.sent_at);

  const campaigns: CampaignRow[] = [];
  let totalOpened = 0;
  let totalDelivered = 0;

  for (const [key, dids] of groups) {
    const sends = dids.flatMap((did) => sendsByDid.get(did) ?? []).sort();
    if (sends.length === 0 && dids.every((did) => !tally.has(did))) continue; // never sent → not a campaign row
    const count = (ev: string) => dids.reduce((n, did) => n + (tally.get(did)?.counts[ev] ?? 0), 0);
    const delivered = count("delivered");
    const opened = count("opened");
    totalOpened += opened;
    totalDelivered += delivered;

    // 24h buckets after the LATEST blast occurrence in the campaign.
    const latestBlast = input.blasts
      .filter((b) => dids.includes(b.deliverable_id) && b.sent_at)
      .map((b) => b.sent_at as string)
      .sort()
      .at(-1);
    let hourBuckets: CampaignRow["hourBuckets"] = null;
    if (latestBlast) {
      const t0 = Date.parse(latestBlast);
      const buckets = BUCKET_LABELS.map((label) => ({ label, opens: 0, clicks: 0 }));
      let any = false;
      for (const did of dids) {
        const t = tally.get(did);
        for (const [list, field] of [
          [t?.opens ?? [], "opens"],
          [t?.clicks ?? [], "clicks"],
        ] as const) {
          for (const at of list) {
            const h = (Date.parse(at) - t0) / 3_600_000;
            if (h >= 0 && h < 24) {
              buckets[Math.floor(h / 4)][field] += 1;
              any = true;
            }
          }
        }
      }
      hourBuckets = any ? buckets : null;
    }

    // Send-over-send: one point per did that has deliveries, in first-send order.
    const sendOverSend = dids
      .map((did) => {
        const c = tally.get(did)?.counts ?? {};
        const p = pct(c["opened"] ?? 0, c["delivered"] ?? 0);
        const at = (sendsByDid.get(did) ?? []).sort()[0] ?? "";
        return p === null ? null : { at, label: at.slice(5, 10).replace("-", "/"), openPct: p };
      })
      .filter((x): x is { at: string; label: string; openPct: number } => x !== null)
      .sort((a, b) => (a.at < b.at ? -1 : 1))
      .map(({ label, openPct }) => ({ label, openPct }));

    const newest = [...sends, ...dids.flatMap((d) => tally.get(d)?.opens ?? [])].sort().at(-1);
    const first = delivById.get(dids[0]);
    campaigns.push({
      key,
      label: (first?.instruction ?? "").trim().slice(0, 60) || key.replace(/^did:/, "Campaign "),
      projectId: first?.project_id ?? null,
      dids,
      lastSentAt: sends.at(-1) ?? null,
      sendCount: sends.length,
      delivered,
      opened,
      clicked: count("clicked"),
      bounced: count("bounced"),
      unsubscribed: count("unsubscribed"),
      openPct: pct(opened, delivered),
      clickPct: pct(count("clicked"), delivered),
      deltaOpenVsAvg: null, // filled after ownAvg below
      hourBuckets,
      sendOverSend,
      asOf: newest ? newest.slice(0, 10) : null,
    });
  }

  const ownAvgOpenPct = pct(totalOpened, totalDelivered);
  for (const row of campaigns) {
    row.deltaOpenVsAvg =
      row.openPct !== null && ownAvgOpenPct !== null
        ? Math.round((row.openPct - ownAvgOpenPct) * 10) / 10
        : null;
  }
  campaigns.sort((a, b) => ((a.lastSentAt ?? "") < (b.lastSentAt ?? "") ? 1 : -1));

  const eligible = campaigns.filter(
    (r) =>
      r.sendCount >= STRONGEST_MIN_SENDS &&
      r.delivered >= STRONGEST_MIN_DELIVERED &&
      r.openPct !== null,
  );
  const top = eligible.sort((a, b) => (b.openPct ?? 0) - (a.openPct ?? 0))[0];
  const strongest = top
    ? `"${top.label}" is your strongest open rate (${Math.round(top.openPct ?? 0)}% over ${top.sendCount} sends)`
    : null;

  return { campaigns, ownAvgOpenPct, strongest };
}
