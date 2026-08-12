// Positive controls for Gate 17's rules — including the REAL registry, so the
// gate's view of _ASSISTANT/STRIKES.md can never drift from what ships.
import { test } from "node:test";
import assert from "node:assert/strict";
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
  assert.deepStrictEqual(
    shapes.map((s) => s.slug),
    [
      "built-and-done",
      "owed-but-tracked",
      "owed-untracked-three",
      "owed-untracked-two",
      "malformed-no-guard-line",
    ],
  );
  assert.strictEqual(shapes[0].strikes, 3);
  assert.strictEqual(shapes[3].strikes, 2);
  assert.strictEqual(shapes[4].guard, "");
});

test("BUILT and OWED-with-open-check are tracked; bare OWED is not", () => {
  assert.strictEqual(guardIsTracked("BUILT — Gate 15 (08/10/2026)"), true);
  assert.strictEqual(guardIsTracked("OWED — sweep needed; check open: key_name"), true);
  assert.strictEqual(guardIsTracked("OWED — sweep needed; Check open: Key_Name9"), true);
  assert.strictEqual(guardIsTracked("OWED — someone should do something"), false);
  assert.strictEqual(guardIsTracked(""), false);
});

test("unguardedShapes fires ONLY at 3+ strikes with an untracked guard", () => {
  const bad = unguardedShapes(parseStrikes(FIXTURE));
  assert.deepStrictEqual(
    bad.map((s) => s.slug),
    ["owed-untracked-three", "malformed-no-guard-line"],
  );
});

test("THE REAL REGISTRY passes — every 3-strike shape is BUILT or tracked", () => {
  // If this test reds, a session wrote a third strike and walked away without a
  // mechanism or a tracked check — exactly the behavior RULE 2 §0b bans. Fix the
  // shape's guard line (build it, or open the check and name it), never this test.
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const md = readFileSync(join(repoRoot, "_ASSISTANT", "STRIKES.md"), "utf8");
  assert.deepStrictEqual(
    unguardedShapes(parseStrikes(md)).map((s) => s.slug),
    [],
  );
});
