import { describe, expect, test } from "bun:test";
import { recipeSignature, signatureFilters, signaturesEqual } from "./schedule-signature";
import type { ParsedCommand } from "./schedule-command";

function cmd(over: Partial<ParsedCommand> = {}): ParsedCommand {
  return {
    action: "create",
    cadence: "weekly",
    day_of_week: 2,
    send_hour_et: 7,
    template_id: "report",
    scope_kind: "zip",
    scope_value: "33901",
    audience_slug: "buyers",
    ...over,
  };
}

describe("recipeSignature", () => {
  test("extracts the canonical recipe tuple, undefined optionals become null", () => {
    const sig = recipeSignature(cmd({ day_of_month: undefined, topic: undefined }));
    expect(sig).toEqual({
      template_id: "report",
      scope_kind: "zip",
      scope_value: "33901",
      topic: null,
      audience_slug: "buyers",
      cadence: "weekly",
      day_of_week: 2,
      day_of_month: null,
      send_hour_et: 7,
      deliverable_id: null,
    });
  });

  test("ignores non-recipe fields (action, schedule_id)", () => {
    const sig = recipeSignature(cmd({ schedule_id: 99 }));
    expect("action" in sig).toBe(false);
    expect("schedule_id" in sig).toBe(false);
  });
});

describe("signatureFilters — IS NOT DISTINCT FROM expressed for PostgREST", () => {
  test("a null column yields an `is null` filter, never `eq null`", () => {
    const sig = recipeSignature(cmd({ audience_slug: undefined, day_of_month: undefined }));
    const filters = signatureFilters(sig);
    const audience = filters.find((f) => f.col === "audience_slug");
    expect(audience).toEqual({ col: "audience_slug", op: "is", value: null });
    // The operator's locked correction: nullable columns must NEVER use `eq` against null.
    for (const f of filters) {
      if (f.value === null) expect(f.op).toBe("is");
    }
  });

  test("a non-null column yields an `eq` filter with the value", () => {
    const filters = signatureFilters(recipeSignature(cmd()));
    expect(filters).toContainEqual({ col: "scope_value", op: "eq", value: "33901" });
    expect(filters).toContainEqual({ col: "cadence", op: "eq", value: "weekly" });
    expect(filters).toContainEqual({ col: "send_hour_et", op: "eq", value: 7 });
  });

  test("covers all ten signature columns exactly once", () => {
    const filters = signatureFilters(recipeSignature(cmd()));
    const cols = filters.map((f) => f.col).sort();
    expect(cols).toEqual(
      [
        "audience_slug",
        "cadence",
        "day_of_month",
        "day_of_week",
        "deliverable_id",
        "scope_kind",
        "scope_value",
        "send_hour_et",
        "template_id",
        "topic",
      ].sort(),
    );
  });

  test("deliverable_id distinguishes two saved EmailDoc designs on the same cadence", () => {
    // Two block-canvas schedules with an identical cadence/scope but DIFFERENT saved
    // designs must be distinct recipes — else createOrTouchSchedule would reactivate the
    // first row for the second design, silently sending the wrong email.
    const a = recipeSignature(cmd({ template_id: "block-canvas", deliverable_id: "deliv-A" }));
    const b = recipeSignature(cmd({ template_id: "block-canvas", deliverable_id: "deliv-B" }));
    expect(signaturesEqual(a, b)).toBe(false);
    const aFilter = signatureFilters(a).find((f) => f.col === "deliverable_id");
    expect(aFilter).toEqual({ col: "deliverable_id", op: "eq", value: "deliv-A" });
  });
});

describe("signaturesEqual — NULL-equal semantics", () => {
  test("two identical all-optional-null recipes are equal", () => {
    const a = recipeSignature(
      cmd({
        scope_kind: undefined,
        scope_value: undefined,
        audience_slug: undefined,
        template_id: undefined,
        cadence: "daily",
        day_of_week: undefined,
      }),
    );
    const b = recipeSignature(
      cmd({
        scope_kind: undefined,
        scope_value: undefined,
        audience_slug: undefined,
        template_id: undefined,
        cadence: "daily",
        day_of_week: undefined,
      }),
    );
    expect(signaturesEqual(a, b)).toBe(true);
  });

  test("recipes differing only in a NULL-vs-value optional are NOT equal", () => {
    const withAud = recipeSignature(cmd({ audience_slug: "buyers" }));
    const noAud = recipeSignature(cmd({ audience_slug: undefined }));
    expect(signaturesEqual(withAud, noAud)).toBe(false);
  });

  test("recipes differing in send_hour are not equal", () => {
    expect(
      signaturesEqual(
        recipeSignature(cmd({ send_hour_et: 7 })),
        recipeSignature(cmd({ send_hour_et: 8 })),
      ),
    ).toBe(false);
  });
});
