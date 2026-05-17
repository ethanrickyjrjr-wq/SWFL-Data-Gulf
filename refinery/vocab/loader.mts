/**
 * Sync vocabulary loader + SKOS concept-to-slug resolver.
 *
 * Companion to the async `loadVocabulary()` in `refinery/stages/2.5-normalize.mts`.
 * Constitutions evaluate `OverrideRule.condition` synchronously over a
 * BrainOutput[], so the rule-time vocab lookup has to be sync.
 *
 * Cache lives for the lifetime of the process. `resetVocabularyCacheSync` is a
 * test hook only.
 *
 * Design note (P5.5): constitutions used to hard-code raw slug strings on the
 * trigger side of a rule (see the pre-P5.5 history of refinery/constitution/
 * real-estate.mts). That coupled every rule to one brain's slug-naming choices
 * and meant a metric rename in an upstream brain silently broke the rule.
 * Declaring rules by SKOS concept ID and resolving via `slug_index` at module
 * init means a rename is caught at vocab-update time, not at synthesis time.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Vocabulary } from "../stages/2.5-normalize.mts";

const VOCAB_PATH = path.join(
  process.cwd(),
  "refinery",
  "vocab",
  "brain-vocabulary.json",
);

let cached: Vocabulary | null = null;

export function loadVocabularySync(): Vocabulary {
  if (cached) return cached;
  const raw = readFileSync(VOCAB_PATH, "utf-8");
  cached = JSON.parse(raw) as Vocabulary;
  return cached;
}

/** Test hook — clear the cached vocab so a fresh read happens next call. */
export function resetVocabularyCacheSync(): void {
  cached = null;
}

/**
 * Invert `slug_index`: given canonical concept IDs, return the union of every
 * `raw_slug` those concepts register. Throws if any concept ID is unknown — a
 * typo in a constitution rule should fail loud at module-init time, not
 * silently fall through to "the rule never fires."
 */
export function resolveConceptSlugs(
  conceptIds: readonly string[],
): Set<string> {
  const vocab = loadVocabularySync();
  const slugs = new Set<string>();
  const missing: string[] = [];
  for (const id of conceptIds) {
    const concept = vocab.concepts[id];
    if (!concept) {
      missing.push(id);
      continue;
    }
    for (const slug of concept.raw_slugs) slugs.add(slug);
  }
  if (missing.length > 0) {
    throw new Error(
      `resolveConceptSlugs: unknown concept id(s) [${missing.join(", ")}] — ` +
        `add them to refinery/vocab/brain-vocabulary.json or fix the caller.`,
    );
  }
  return slugs;
}
