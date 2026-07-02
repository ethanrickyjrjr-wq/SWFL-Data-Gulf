// lib/email/outreach/demo-cadence.test.ts
import { describe, expect, test } from "bun:test";
import {
  afterSend,
  jitterDays,
  nextTrialSendAt,
  onDemoEvent,
  retireIfStale,
  touchForStage,
  TRIAL_CAP,
} from "./demo-cadence";

const RID = "3f6c2a1e-9b4d-4e6f-8a2b-1c5d7e9f0a1b";
const NOW = new Date("2026-07-06T15:30:00.000Z"); // a Monday, after 13:00 UTC

describe("touchForStage", () => {
  test("cold stages map to their touch; cooldown due = the one re-engagement", () => {
    expect(touchForStage("cold_t1")).toBe("t1");
    expect(touchForStage("cold_t4")).toBe("t4");
    expect(touchForStage("trial_active")).toBe("trial");
    expect(touchForStage("cooldown")).toBe("reengage");
  });
  test("terminal stages never send", () => {
    for (const s of ["reengaged", "retired", "converted"] as const)
      expect(touchForStage(s)).toBeNull();
  });
});

describe("cold spacing (spec: T2 d3-4, T3 ~d10, T4 d18-21, varied not identical)", () => {
  test("jitter is deterministic and in range", () => {
    const d = jitterDays(RID, 3, 4);
    expect(d).toBe(jitterDays(RID, 3, 4));
    expect(d === 3 || d === 4).toBe(true);
  });
  test("full cold path lands inside the spec windows", () => {
    let cur = { stage: "cold_t1", next_send_at: null, trial_sends: 0 } as Parameters<
      typeof afterSend
    >[0];
    let clock = NOW;
    let elapsed = 0;
    const windows: Record<string, [number, number]> = {
      cold_t2: [3, 4],
      cold_t3: [9, 11],
      cold_t4: [18, 21],
    };
    for (const expectStage of ["cold_t2", "cold_t3", "cold_t4"] as const) {
      const next = afterSend(cur, RID, clock);
      expect(next.stage).toBe(expectStage);
      const days = (new Date(next.next_send_at!).getTime() - clock.getTime()) / 86_400_000;
      elapsed += days;
      expect(elapsed).toBeGreaterThanOrEqual(windows[expectStage][0]);
      expect(elapsed).toBeLessThanOrEqual(windows[expectStage][1]);
      clock = new Date(next.next_send_at!);
      cur = next;
    }
  });
  test("T4 send parks in cooldown 30 days out; cooldown send -> reengaged terminal", () => {
    const cooled = afterSend({ stage: "cold_t4", next_send_at: null, trial_sends: 0 }, RID, NOW);
    expect(cooled.stage).toBe("cooldown");
    expect((new Date(cooled.next_send_at!).getTime() - NOW.getTime()) / 86_400_000).toBe(30);
    const done = afterSend(cooled, RID, NOW);
    expect(done).toEqual({ stage: "reengaged", next_send_at: null, trial_sends: 0 });
  });
});

describe("daily trial", () => {
  test("next trial send is the next 13:00 UTC strictly after now", () => {
    expect(nextTrialSendAt(new Date("2026-07-06T15:30:00Z"))).toBe("2026-07-07T13:00:00.000Z");
    expect(nextTrialSendAt(new Date("2026-07-06T09:00:00Z"))).toBe("2026-07-06T13:00:00.000Z");
  });
  test("trial advances daily and retires at the 30-send cap", () => {
    let cur = {
      stage: "trial_active",
      next_send_at: null,
      trial_sends: TRIAL_CAP - 2,
    } as Parameters<typeof afterSend>[0];
    cur = afterSend(cur, RID, NOW);
    expect(cur.stage).toBe("trial_active");
    expect(cur.trial_sends).toBe(TRIAL_CAP - 1);
    const capped = afterSend(cur, RID, NOW);
    expect(capped).toEqual({ stage: "retired", next_send_at: null, trial_sends: TRIAL_CAP });
  });
});

describe("onDemoEvent", () => {
  test("click earns the trial from any pre-conversion cold/cooldown/reengaged stage", () => {
    for (const s of ["cold_t1", "cold_t3", "cooldown", "reengaged"] as const) {
      const r = onDemoEvent(s, "clicked", NOW);
      expect(r?.stage).toBe("trial_active");
      expect(r?.next_send_at).toBe(nextTrialSendAt(NOW));
    }
  });
  test("click is a no-op on trial_active / converted / retired", () => {
    for (const s of ["trial_active", "converted", "retired"] as const)
      expect(onDemoEvent(s, "clicked", NOW)).toBeNull();
  });
  test("complaint / unsubscribe / bounce retire permanently; claimed converts", () => {
    expect(onDemoEvent("cold_t2", "complained", NOW)).toEqual({
      stage: "retired",
      next_send_at: null,
    });
    expect(onDemoEvent("trial_active", "unsubscribed", NOW)).toEqual({
      stage: "retired",
      next_send_at: null,
    });
    expect(onDemoEvent("cold_t1", "bounced", NOW)).toEqual({
      stage: "retired",
      next_send_at: null,
    });
    expect(onDemoEvent("trial_active", "claimed", NOW)).toEqual({
      stage: "converted",
      next_send_at: null,
    });
  });
});

describe("retireIfStale", () => {
  test("reengaged goes retired after 30 quiet days; other stages never", () => {
    expect(retireIfStale("reengaged", "2026-06-01T00:00:00Z", NOW)).toBe(true);
    expect(retireIfStale("reengaged", "2026-07-01T00:00:00Z", NOW)).toBe(false);
    expect(retireIfStale("trial_active", "2026-01-01T00:00:00Z", NOW)).toBe(false);
  });
});
