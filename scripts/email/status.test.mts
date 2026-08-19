// status.test.mts — the stale-status-doc tripwire. Failure mode: the fleet changes
// (registry entry, bank added, acceptance script added/removed) and the committed
// status page keeps describing the old fleet — which is exactly how a session came to
// state a wrong commentary status on 08/18/2026. This makes that drift a red test.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildStatusDoc, OUT_PATH } from "./status.mts";
import { RECIPE_KEYS } from "../../lib/deliverable/recipes";

describe("email fleet status page", () => {
  test("stale-status-doc: the committed page matches what the code derives today", () => {
    const committed = readFileSync(OUT_PATH, "utf8");
    expect(committed).toBe(buildStatusDoc());
  });

  test("every registry key appears on the page exactly once", () => {
    const doc = buildStatusDoc();
    for (const key of RECIPE_KEYS) {
      const rows = doc.split("\n").filter((l) => l.startsWith(`- ${key} ·`));
      expect(rows.length).toBe(1);
    }
  });
});
