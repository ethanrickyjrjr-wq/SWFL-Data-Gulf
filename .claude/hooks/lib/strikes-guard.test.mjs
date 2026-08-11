// Positive controls for Gate 17's rules — including the REAL registry, so the
// gate's view of _ASSISTANT/STRIKES.md can never drift from what ships.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrikes, guardIsTracked, unguardedShapes } from "./strikes-guard.mjs";

const FIXTURE = `# registry
## shape: built-and-done
guard: BUILT — some hook (08/10/2026)
- strike: 08/01 a
- strike: 08/02 b
- strike: 08/03 c

## shape: owed-but-tracked
guard: OWED — needs a sweep; check open: some_tracking_key
- strike: 08/01 a
- strike: 08/02 b
- strike: 08/03 c

## shape: owed-untracked-three
guard: OWED — someone should really do something
- strike: 08/01 a
- strike: 08/02 b
- strike: 08/03 c

## shape: owed-untracked-two
guard: OWED — not yet at the threshold
- strike: 08/01 a
- strike: 08/02 b

## shape: malformed-no-guard-line
- strike: 08/01 a
- strike: 08/02 b
- strike: 08/03 c
`;

test("parseStrikes counts shapes, guards, and strike lines", () => {
  const shapes = parseStrikes(FIXTURE);
  expect(shapes.map((s) => s.slug)).toEqual([
    "built-and-done",
    "owed-but-tracked",
    "owed-untracked-three",
    "owed-untracked-two",
    "malformed-no-guard-line",
  ]);
  expect(shapes[0].strikes).toBe(3);
  expect(shapes[3].strikes).toBe(2);
  expect(shapes[4].guard).toBe("");
});

test("BUILT and OWED-with-open-check are tracked; bare OWED is not", () => {
  expect(guardIsTracked("BUILT — Gate 15 (08/10/2026)")).toBe(true);
  expect(guardIsTracked("OWED — sweep needed; check open: key_name")).toBe(true);
  expect(guardIsTracked("OWED — sweep needed; Check open: Key_Name9")).toBe(true);
  expect(guardIsTracked("OWED — someone should do something")).toBe(false);
  expect(guardIsTracked("")).toBe(false);
});

test("unguardedShapes fires ONLY at 3+ strikes with an untracked guard", () => {
  const bad = unguardedShapes(parseStrikes(FIXTURE));
  expect(bad.map((s) => s.slug)).toEqual(["owed-untracked-three", "malformed-no-guard-line"]);
});

test("THE REAL REGISTRY passes — every 3-strike shape is BUILT or tracked", () => {
  // If this test reds, a session wrote a third strike and walked away without a
  // mechanism or a tracked check — exactly the behavior RULE 2 §0b bans. Fix the
  // shape's guard line (build it, or open the check and name it), never this test.
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const md = readFileSync(join(repoRoot, "_ASSISTANT", "STRIKES.md"), "utf8");
  expect(unguardedShapes(parseStrikes(md)).map((s) => s.slug)).toEqual([]);
});
