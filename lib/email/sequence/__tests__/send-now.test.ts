import { describe, expect, test } from "bun:test";
import { sendOnceNow } from "@/lib/email/sequence/send-now";
import type { ScheduleRow } from "@/lib/email/scheduler";

const row = { id: 42, user_id: "u1", cadence: "once" } as ScheduleRow;
const NOW = new Date("2026-07-06T15:00:00Z");

describe("sendOnceNow", () => {
  test("claims then processes, returns the outcome", async () => {
    const out = await sendOnceNow(
      42,
      {
        claimRow: async (id, nowIso) => {
          expect(id).toBe(42);
          expect(nowIso).toBe(NOW.toISOString());
          return row;
        },
        process: async (r) => ({ kind: "sent", scheduleId: r.id, recipients: 3 }),
      },
      NOW,
    );
    expect(out.kind).toBe("sent");
  });
  test("lost claim → queued (cron owns the send), never processes", async () => {
    let processed = false;
    const out = await sendOnceNow(
      42,
      {
        claimRow: async () => null,
        process: async () => {
          processed = true;
          return { kind: "sent", scheduleId: 42, recipients: 1 };
        },
      },
      NOW,
    );
    expect(out).toEqual({ kind: "queued", scheduleId: 42 });
    expect(processed).toBe(false);
  });
});
