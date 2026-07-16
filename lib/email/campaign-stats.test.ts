// lib/email/campaign-stats.test.ts
import { describe, expect, test } from "bun:test";
import { campaignStats } from "./campaign-stats";

const D = (id: string, campaign_key: string | null, instruction = "Weekly Naples update") => ({
  id,
  project_id: "p1",
  campaign_key,
  instruction,
});
const E = (did: string, event: string, created_at: string) => ({ did, event, created_at });

describe("campaignStats", () => {
  test("rates are unique-count/delivered; solo deliverable keys as did:<id>", () => {
    const s = campaignStats({
      blasts: [{ deliverable_id: "d1", sent_at: "2026-07-10T14:00:00Z" }],
      deliverables: [D("d1", null)],
      events: [
        E("d1", "delivered", "2026-07-10T14:01:00Z"),
        E("d1", "delivered", "2026-07-10T14:01:10Z"),
        E("d1", "delivered", "2026-07-10T14:01:20Z"),
        E("d1", "delivered", "2026-07-10T14:01:30Z"),
        E("d1", "opened", "2026-07-10T15:00:00Z"),
        E("d1", "opened", "2026-07-10T20:00:00Z"),
        E("d1", "clicked", "2026-07-10T15:05:00Z"),
      ],
      scheduledSends: [],
    });
    const row = s.campaigns[0];
    expect(row.key).toBe("did:d1");
    expect(row.delivered).toBe(4);
    expect(row.openPct).toBe(50);
    expect(row.clickPct).toBe(25);
    expect(row.sendCount).toBe(1);
    expect(row.asOf).toBe("2026-07-10");
  });

  test("campaign_key groups dids; sendOverSend is chronological per did", () => {
    const s = campaignStats({
      blasts: [
        { deliverable_id: "d1", sent_at: "2026-07-01T14:00:00Z" },
        { deliverable_id: "d2", sent_at: "2026-07-08T14:00:00Z" },
      ],
      deliverables: [D("d1", "market-update"), D("d2", "market-update")],
      events: [
        E("d1", "delivered", "2026-07-01T14:01:00Z"),
        E("d1", "opened", "2026-07-01T15:00:00Z"),
        E("d2", "delivered", "2026-07-08T14:01:00Z"),
        E("d2", "delivered", "2026-07-08T14:01:05Z"),
        E("d2", "opened", "2026-07-08T15:00:00Z"),
      ],
      scheduledSends: [],
    });
    expect(s.campaigns).toHaveLength(1);
    const row = s.campaigns[0];
    expect(row.key).toBe("market-update");
    expect(row.dids).toEqual(["d1", "d2"]);
    expect(row.sendOverSend.map((x) => x.openPct)).toEqual([100, 50]);
    expect(row.delivered).toBe(3);
  });

  test("hourBuckets: 6×4h unique opens/clicks after the LATEST blast; empty events → null buckets", () => {
    const s = campaignStats({
      blasts: [{ deliverable_id: "d1", sent_at: "2026-07-10T00:00:00Z" }],
      deliverables: [D("d1", null)],
      events: [
        E("d1", "delivered", "2026-07-10T00:01:00Z"),
        E("d1", "opened", "2026-07-10T01:00:00Z"), // bucket 0 (0–4h)
        E("d1", "opened", "2026-07-10T13:00:00Z"), // bucket 3 (12–16h)
        E("d1", "clicked", "2026-07-10T05:00:00Z"), // bucket 1
        E("d1", "opened", "2026-07-12T09:00:00Z"), // >24h — excluded
      ],
      scheduledSends: [],
    });
    const b = s.campaigns[0].hourBuckets!;
    expect(b).toHaveLength(6);
    expect(b[0]).toEqual({ label: "0–4h", opens: 1, clicks: 0 });
    expect(b[1].clicks).toBe(1);
    expect(b[3].opens).toBe(1);
    const empty = campaignStats({
      blasts: [{ deliverable_id: "d9", sent_at: "2026-07-10T00:00:00Z" }],
      deliverables: [D("d9", null)],
      events: [],
      scheduledSends: [],
    });
    expect(empty.campaigns[0].hourBuckets).toBeNull();
  });

  test("scheduled sends count as occurrences without inventing stats", () => {
    const s = campaignStats({
      blasts: [],
      deliverables: [D("d1", null)],
      events: [],
      scheduledSends: [{ sent_at: "2026-07-14T12:00:00Z", deliverable_id: "d1" }],
    });
    const row = s.campaigns[0];
    expect(row.sendCount).toBe(1);
    expect(row.lastSentAt).toBe("2026-07-14T12:00:00Z");
    expect(row.openPct).toBeNull(); // delivered 0 → null, never 0/0 invented
  });

  test("strongest needs ≥2 sends and ≥5 delivered; deltaOpenVsAvg is points vs own average", () => {
    const mk = (did: string, key: string, opens: number, sentDay: number) => ({
      blasts: [{ deliverable_id: did, sent_at: `2026-07-0${sentDay}T14:00:00Z` }],
      deliverables: [D(did, key, key)],
      events: [
        ...Array.from({ length: 10 }, (_, i) =>
          E(did, "delivered", `2026-07-0${sentDay}T14:01:${String(i).padStart(2, "0")}Z`),
        ),
        ...Array.from({ length: opens }, (_, i) =>
          E(did, "opened", `2026-07-0${sentDay}T15:0${i}:00Z`),
        ),
      ],
      scheduledSends: [],
    });
    const a = mk("d1", "newsletter", 6, 1);
    const b = mk("d2", "newsletter", 6, 2);
    const c = mk("d3", "just-sold", 2, 3);
    const s = campaignStats({
      blasts: [...a.blasts, ...b.blasts, ...c.blasts],
      deliverables: [...a.deliverables, ...b.deliverables, ...c.deliverables],
      events: [...a.events, ...b.events, ...c.events],
      scheduledSends: [],
    });
    // newsletter: 12/20 = 60% over 2 sends; just-sold: 2/10 = 20% over 1 send (below floor)
    expect(s.strongest).toBe('"newsletter" is your strongest open rate (60% over 2 sends)');
    expect(s.ownAvgOpenPct).toBeCloseTo(46.7, 1); // 14/30
    const news = s.campaigns.find((r) => r.key === "newsletter")!;
    expect(news.deltaOpenVsAvg).toBeCloseTo(13.3, 1);
  });
});
