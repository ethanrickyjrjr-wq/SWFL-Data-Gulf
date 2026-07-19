import { test } from "bun:test";
import assert from "node:assert/strict";
import { deriveSlugIndex, PATH_AMBIGUOUS_SLUGS } from "./derive-slug-index.mts";

const AMBIG = new Set(["direction"]);

test("deriveSlugIndex: inverts every concept's raw_slugs, multi-slug concepts included", () => {
  const index = deriveSlugIndex(
    {
      cap_rate: { raw_slugs: ["cap_rate_median", "cap_rate_median_swfl"] },
      vacancy: { raw_slugs: ["vacancy_rate"] },
    },
    AMBIG,
  );
  assert.deepEqual(index, {
    cap_rate_median: "cap_rate",
    cap_rate_median_swfl: "cap_rate",
    vacancy_rate: "vacancy",
  });
});

test("deriveSlugIndex: pattern-only concepts (no raw_slugs) contribute nothing", () => {
  const index = deriveSlugIndex(
    {
      templated: { raw_slug_patterns: ["swfl_zip_*_aal"] } as { raw_slugs?: string[] },
      literal: { raw_slugs: ["a_slug"] },
    },
    AMBIG,
  );
  assert.deepEqual(index, { a_slug: "literal" });
});

test("deriveSlugIndex: known path-ambiguous slugs are excluded, even when claimed twice", () => {
  const index = deriveSlugIndex(
    {
      qual_sentiment_direction: { raw_slugs: ["direction"] },
      qual_metric_trajectory: { raw_slugs: ["direction"] },
      other: { raw_slugs: ["momentum"] },
    },
    AMBIG,
  );
  assert.deepEqual(index, { momentum: "other" });
});

test("deriveSlugIndex: an unexpected collision throws naming the slug and every claimant", () => {
  assert.throws(
    () =>
      deriveSlugIndex(
        {
          concept_a: { raw_slugs: ["shared_slug"] },
          concept_b: { raw_slugs: ["shared_slug"] },
        },
        AMBIG,
      ),
    /shared_slug.*concept_a.*concept_b/s,
  );
});

test("deriveSlugIndex: empty concepts yield an empty index", () => {
  assert.deepEqual(deriveSlugIndex({}, AMBIG), {});
});

test("PATH_AMBIGUOUS_SLUGS: contains exactly the direction family", () => {
  assert.deepEqual([...PATH_AMBIGUOUS_SLUGS].sort(), ["direction"]);
});
