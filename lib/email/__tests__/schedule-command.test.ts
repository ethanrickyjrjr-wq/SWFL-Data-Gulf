import { describe, expect, test } from "bun:test";
import {
  validateToolInput,
  summarizeCommand,
  buildSystemPrompt,
  describeExisting,
  SCHEDULE_COMMAND_TOOL,
  type ExistingSchedule,
} from "../schedule-command";

describe("validateToolInput — create", () => {
  test("weekly without day_of_week fails", () => {
    const r = validateToolInput({ action: "create", cadence: "weekly", send_hour_et: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("day_of_week");
  });

  test("weekly with day_of_week passes", () => {
    const r = validateToolInput({
      action: "create",
      cadence: "weekly",
      day_of_week: 2,
      send_hour_et: 7,
    });
    expect(r.ok).toBe(true);
  });

  test("monthly without day_of_month fails", () => {
    const r = validateToolInput({ action: "create", cadence: "monthly", send_hour_et: 9 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("day_of_month");
  });

  test("daily with hour passes", () => {
    const r = validateToolInput({ action: "create", cadence: "daily", send_hour_et: 9 });
    expect(r.ok).toBe(true);
  });

  test("missing send_hour_et fails", () => {
    const r = validateToolInput({ action: "create", cadence: "daily" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("send_hour_et");
  });

  test("hour 0 (midnight) is valid, not treated as missing", () => {
    const r = validateToolInput({ action: "create", cadence: "daily", send_hour_et: 0 });
    expect(r.ok).toBe(true);
  });

  test("day_of_week 0 (Sunday) is valid, not treated as missing", () => {
    const r = validateToolInput({
      action: "create",
      cadence: "weekly",
      day_of_week: 0,
      send_hour_et: 8,
    });
    expect(r.ok).toBe(true);
  });

  test("out-of-range hour fails", () => {
    const r = validateToolInput({ action: "create", cadence: "daily", send_hour_et: 24 });
    expect(r.ok).toBe(false);
  });
});

describe("validateToolInput — mutations", () => {
  test("change-template requires template_id", () => {
    expect(validateToolInput({ action: "change-template", schedule_id: 1 }).ok).toBe(false);
    expect(
      validateToolInput({ action: "change-template", schedule_id: 1, template_id: "viz" }).ok,
    ).toBe(true);
  });

  test("change-audience requires audience_slug", () => {
    expect(validateToolInput({ action: "change-audience", schedule_id: 1 }).ok).toBe(false);
    expect(
      validateToolInput({ action: "change-audience", schedule_id: 1, audience_slug: "vip" }).ok,
    ).toBe(true);
  });

  test("change-cadence requires cadence + hour", () => {
    expect(
      validateToolInput({ action: "change-cadence", schedule_id: 1, cadence: "daily" }).ok,
    ).toBe(false);
    expect(
      validateToolInput({
        action: "change-cadence",
        schedule_id: 1,
        cadence: "daily",
        send_hour_et: 8,
      }).ok,
    ).toBe(true);
  });

  test("pause/stop are valid with no extra params (target resolved by route)", () => {
    expect(validateToolInput({ action: "pause" }).ok).toBe(true);
    expect(validateToolInput({ action: "stop", schedule_id: 3 }).ok).toBe(true);
  });

  test("unknown action is rejected", () => {
    expect(validateToolInput({ action: "delete" }).ok).toBe(false);
  });

  test("non-object input is rejected", () => {
    expect(validateToolInput("nope").ok).toBe(false);
    expect(validateToolInput(null).ok).toBe(false);
  });
});

describe("summarizeCommand", () => {
  test("weekly create reads naturally", () => {
    const s = summarizeCommand({
      action: "create",
      cadence: "weekly",
      day_of_week: 2,
      send_hour_et: 7,
      audience_slug: "newsletter",
    });
    expect(s).toBe('Create a weekly schedule that sends every Tuesday at 7am ET to "newsletter".');
  });

  test("daily create with pm hour", () => {
    const s = summarizeCommand({ action: "create", cadence: "daily", send_hour_et: 17 });
    expect(s).toBe("Create a daily schedule that sends every day at 5pm ET.");
  });

  test("pause references the schedule id", () => {
    expect(summarizeCommand({ action: "pause", schedule_id: 9 })).toBe("Pause schedule #9.");
  });

  test("change-audience", () => {
    expect(
      summarizeCommand({ action: "change-audience", schedule_id: 4, audience_slug: "vip" }),
    ).toBe('Change schedule #4 to send to audience "vip".');
  });
});

describe("prompt + tool surface", () => {
  test("system prompt embeds existing schedules JSON", () => {
    const existing: ExistingSchedule[] = [
      {
        id: 7,
        status: "active",
        cadence: "weekly",
        day_of_week: 1,
        day_of_month: null,
        send_hour_et: 10,
        audience_slug: "all",
        template_id: null,
      },
    ];
    const p = buildSystemPrompt(existing);
    expect(p).toContain('"id":7');
    expect(p).toContain("EXISTING SCHEDULES");
  });

  test("tool schema only requires action and forbids extra props", () => {
    expect(SCHEDULE_COMMAND_TOOL.input_schema.required).toEqual(["action"]);
    expect(SCHEDULE_COMMAND_TOOL.input_schema.additionalProperties).toBe(false);
  });

  test("describeExisting is readable", () => {
    const s = describeExisting({
      id: 1,
      status: "active",
      cadence: "weekly",
      day_of_week: 2,
      day_of_month: null,
      send_hour_et: 7,
      audience_slug: "newsletter",
      template_id: null,
    });
    expect(s).toContain("weekly (Tuesday)");
    expect(s).toContain("7am ET");
    expect(s).toContain("newsletter");
  });
});
