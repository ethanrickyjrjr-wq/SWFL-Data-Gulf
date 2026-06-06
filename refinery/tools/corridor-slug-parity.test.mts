/**
 * Slug parity test (TS side).
 *
 * Loads `fixtures/corridor-slug-parity.json` and verifies that the
 * TypeScript `slug()` produces the expected slug for every entry. The
 * Python `slug()` in `ingest/pipelines/corridor_grounded/pipeline.py` is
 * verified against the same fixture in `test_pipeline.py::test_slug_parity`.
 *
 * If either suite trips, the two slug implementations have drifted and
 * Stage C's grounded-NDJSON lookup will silently miss for any corridor
 * whose slug diverges.
 */

import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { slug } from "./synthesize-corridor-character.mts";

interface SlugCase {
  input: string;
  expected: string;
}
interface SlugFixture {
  cases: SlugCase[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(
  __dirname,
  "..",
  "..",
  "fixtures",
  "corridor-slug-parity.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf-8")) as SlugFixture;

test("slug parity (TS): fixture loads with cases", () => {
  assert.ok(
    Array.isArray(fixture.cases) && fixture.cases.length >= 27,
    `expected at least 27 cases (one per verified corridor); got ${fixture.cases?.length}`,
  );
});

for (const c of fixture.cases) {
  test(`slug parity (TS): "${c.input}" → "${c.expected}"`, () => {
    assert.equal(
      slug(c.input),
      c.expected,
      `TS slug() diverged from the fixture. If you changed the rule, update ` +
        `the Python copy in ingest/pipelines/corridor_grounded/pipeline.py ` +
        `AND regenerate the fixture's "expected" values.`,
    );
  });
}
