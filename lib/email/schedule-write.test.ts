import { describe, it, expect } from "bun:test";
import { patchBodyToCommands } from "./schedule-write";

describe("patchBodyToCommands", () => {
  it("maps pause/resume/stop ops to bare commands", () => {
    for (const op of ["pause", "resume", "stop"] as const) {
      const r = patchBodyToCommands(7, { op });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.commands).toEqual([{ action: op, schedule_id: 7 }]);
    }
  });

  it("maps an edit with cadence fields to change-cadence", () => {
    const r = patchBodyToCommands(7, {
      op: "edit",
      cadence: "weekly",
      day_of_week: 1,
      send_hour_et: 8,
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.commands).toEqual([
        {
          action: "change-cadence",
          schedule_id: 7,
          cadence: "weekly",
          day_of_week: 1,
          day_of_month: undefined,
          send_hour_et: 8,
        },
      ]);
  });

  it("emits one command per changed facet, cadence first", () => {
    const r = patchBodyToCommands(7, {
      op: "edit",
      cadence: "daily",
      send_hour_et: 9,
      audience_slug: "buyers",
      template_id: "weekly-digest",
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.commands.map((c) => c.action)).toEqual([
        "change-cadence",
        "change-audience",
        "change-template",
      ]);
  });

  it("rejects an unknown op and an empty edit", () => {
    expect(patchBodyToCommands(7, { op: "delete" }).ok).toBe(false);
    expect(patchBodyToCommands(7, { op: "edit" }).ok).toBe(false);
    expect(patchBodyToCommands(7, null).ok).toBe(false);
  });
});
