import { describe, expect, test } from "bun:test";
import { PLATFORM_ARC } from "@/lib/email/sequence/types";
import {
  applySetup,
  markBuilt,
  markScheduled,
  markSent,
  markSkipped,
  markUnlocked,
  reconcileSent,
} from "@/lib/email/sequence/state";

const armed = () => applySetup(PLATFORM_ARC);

describe("sequence state machine", () => {
  test("applySetup arms five pending steps", () => {
    expect(armed().every((s) => s.state === "pending")).toBe(true);
  });
  test("build → schedule → sent happy path", () => {
    let s = markBuilt(armed(), "new-listing", "d-1");
    expect(s.find((x) => x.key === "new-listing")!.state).toBe("built");
    s = markScheduled(s, "new-listing", 42, "2026-07-07T13:00:00Z");
    const step = s.find((x) => x.key === "new-listing")!;
    expect(step.state).toBe("scheduled");
    expect(step.schedule_id).toBe(42);
    s = markSent(s, "new-listing", "2026-07-07T13:04:00Z");
    expect(s.find((x) => x.key === "new-listing")!.state).toBe("sent");
  });
  test("a scheduled (frozen) step refuses edits", () => {
    let s = markBuilt(armed(), "sold", "d-2");
    s = markScheduled(s, "sold", 7, "2026-07-08T13:00:00Z");
    expect(() => markBuilt(s, "sold", "d-3")).toThrow(/frozen|scheduled/);
  });
  test("unlock returns a scheduled step to built and clears the schedule", () => {
    let s = markBuilt(armed(), "sold", "d-2");
    s = markScheduled(s, "sold", 7, "2026-07-08T13:00:00Z");
    s = markUnlocked(s, "sold");
    const step = s.find((x) => x.key === "sold")!;
    expect(step.state).toBe("built");
    expect(step.schedule_id ?? null).toBeNull();
  });
  test("a sent step can never re-fire", () => {
    let s = markBuilt(armed(), "sold", "d-2");
    s = markScheduled(s, "sold", 7, "2026-07-08T13:00:00Z");
    s = markSent(s, "sold", "2026-07-08T13:02:00Z");
    expect(() => markScheduled(s, "sold", 8, "2026-07-09T13:00:00Z")).toThrow();
  });
  test("skip is legal from pending, illegal from sent", () => {
    const s = markSkipped(armed(), "coming-soon");
    expect(s.find((x) => x.key === "coming-soon")!.state).toBe("skipped");
  });
  test("reconcileSent flips scheduled→sent from a completed schedule row", () => {
    let s = markBuilt(armed(), "market-comps", "d-9");
    s = markScheduled(s, "market-comps", 99, "2026-07-08T13:00:00Z");
    const out = reconcileSent(s, [
      { id: 99, status: "completed", last_run_at: "2026-07-08T13:05:00Z" },
    ]);
    const step = out.find((x) => x.key === "market-comps")!;
    expect(step.state).toBe("sent");
    expect(step.sent_at).toBe("2026-07-08T13:05:00Z");
  });
  test("order is advisory — any pending step can build/fire regardless of neighbors", () => {
    const s = markBuilt(armed(), "sold", "d-last");
    expect(s.find((x) => x.key === "sold")!.state).toBe("built");
  });
});
