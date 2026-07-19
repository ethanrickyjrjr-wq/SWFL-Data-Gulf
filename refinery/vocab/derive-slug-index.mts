/**
 * Derived slug_index — the ONE inversion of concepts[].raw_slugs.
 *
 * Until 2026-07-19 brain-vocabulary.json carried a hand-materialized top-level
 * `slug_index` block that every session had to mirror by hand when registering
 * a concept. The resolver reads slug_index only, pack tests validate raw_slugs
 * only — so a missed mirror row passed every local test and aborted master's
 * next rebuild with an Orphan Concept error. At least 10 "fix(vocab): register
 * X — unblocks master" commits paid that tax in the month before this module.
 *
 * Now both vocabulary loaders (`loadVocabulary` in refinery/stages/2.5-normalize.mts,
 * `loadVocabularySync` in refinery/vocab/loader.mts) call `deriveSlugIndex` after
 * parsing the JSON and overwrite `vocab.slug_index` with the result. raw_slugs is
 * the single authoring surface; there is no second block to forget.
 */

/** The minimal concept shape derivation reads — structurally satisfied by VocabConcept. */
interface DerivableConcept {
  raw_slugs?: string[];
}

/**
 * Slug strings whose canonical resolution depends on field path, not value.
 * Shared contract between the resolver (which dispatches these to
 * `raw_field_path` matching BEFORE any index lookup — see `resolveSlug` step 1)
 * and derivation (which excludes them from the literal index; a literal row for
 * an ambiguous slug could never be correct for both owners).
 */
export const PATH_AMBIGUOUS_SLUGS: ReadonlySet<string> = new Set(["direction"]);

/**
 * Invert every concept's `raw_slugs` into a literal `slug → concept_id` map.
 *
 * Slugs in `knownAmbiguous` are skipped — they resolve by field path upstream
 * of the index. Any OTHER slug claimed by two or more concepts throws with the
 * full offender list: a genuine collision is an authoring bug, and failing loud
 * at load time is the entire point of deriving (silent drift is how the
 * hand-maintained block accumulated a month of orphan-concept holds).
 */
export function deriveSlugIndex(
  concepts: Record<string, DerivableConcept>,
  knownAmbiguous: ReadonlySet<string> = PATH_AMBIGUOUS_SLUGS,
): Record<string, string> {
  const index: Record<string, string> = {};
  const claimants = new Map<string, string[]>();

  for (const [conceptId, concept] of Object.entries(concepts)) {
    for (const slug of concept.raw_slugs ?? []) {
      if (knownAmbiguous.has(slug)) continue;
      const owners = claimants.get(slug);
      if (owners) {
        owners.push(conceptId);
      } else {
        claimants.set(slug, [conceptId]);
        index[slug] = conceptId;
      }
    }
  }

  const collisions = [...claimants.entries()].filter(([, ids]) => ids.length > 1);
  if (collisions.length > 0) {
    const lines = collisions
      .map(([slug, ids]) => `  ${slug} (claimed by ${[...ids].sort().join(", ")})`)
      .sort();
    throw new Error(
      `deriveSlugIndex: ${collisions.length} raw_slug collision(s) — a slug may ` +
        `belong to exactly one concept (or be registered in PATH_AMBIGUOUS_SLUGS ` +
        `with raw_field_path resolution):\n${lines.join("\n")}`,
    );
  }

  return index;
}
