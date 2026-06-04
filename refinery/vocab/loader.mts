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
import type { Vocabulary, VocabConcept } from "../stages/2.5-normalize.mts";

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

// ---------------------------------------------------------------------------
// Grade-config resolver — prediction grading loop (Goal 9, Phase 1)
//
// Per-slug grading config lives on each concept's optional `grade` block in
// brain-vocabulary.json. Most slugs carry NO block and inherit via two axes:
//   • window_days        ← CATEGORY_WINDOW_DAYS[concept.category]   (source cadence)
//   • epsilon/mode/basis ← VALUE_TYPE_BUCKET[concept.value_type]    (metric scale)
//   • direction_polarity ← NOTHING. Polarity is slug-only, never inherited:
//     within one category, survival-rate (higher = bullish) and charge-off
//     (higher = bearish) have opposite polarity, so a category default would
//     silently grade one backwards. A slug with no declared polarity is
//     ungradeable by the deterministic grader.
//
// Precedence: explicit slug block > category/value_type default > ungradeable.
// Never throws — returns gradeable:false with a `reason` for any non-gradeable slug.
// ---------------------------------------------------------------------------

export type DirectionPolarity =
  | "higher_is_bullish"
  | "lower_is_bullish"
  | "none";
export type GradeBasis = "delta" | "sign";
export type EpsilonMode = "absolute" | "relative";

/**
 * The two polarity tokens that make a slug directionally gradeable.
 * Anything else — absent, "none", or an out-of-enum token like "neutral" /
 * "higher_is_bearish" — is NOT a valid directional grade.
 */
const VALID_DIRECTIONAL_POLARITIES: ReadonlySet<string> = new Set([
  "higher_is_bullish",
  "lower_is_bullish",
]);

/**
 * Three-state classification of a raw `direction_polarity` token. The JSON
 * field is typed to the enum but is not runtime-validated, so a fat-fingered or
 * un-normalized token reaches here as a garbage string — this lattice separates
 * the author's intent so the grader and the sweep agree:
 *   • valid_directional ⇔ token ∈ {higher_is_bullish, lower_is_bullish}
 *   • none              ⇔ token absent or === "none" (author declined to grade)
 *   • invalid           ⇔ token present but ∉ enum ("neutral", "higher_is_bearish")
 *                          = intent-to-grade with an un-gradeable token → needs a human.
 */
export type PolarityState = "valid_directional" | "none" | "invalid";

export function classifyPolarity(
  raw: string | null | undefined,
): PolarityState {
  if (raw == null || raw === "none") return "none";
  return VALID_DIRECTIONAL_POLARITIES.has(raw) ? "valid_directional" : "invalid";
}

/**
 * window_days default by vocab category, grounded in source publish cadence
 * (ingest/cadence_registry.yaml). `qualitative` is intentionally absent —
 * qualitative concepts are non-gradeable by construction.
 */
const CATEGORY_WINDOW_DAYS: Record<string, number> = {
  macro: 90, // LAUS/FRED monthly + "two consecutive prints" falsifier
  hospitality: 120, // TDT monthly, ~2-mo lag, "two consecutive months"
  "economic-activity": 120, // FGCU RERI / FL DOR sales-tax monthly, ~2-mo lag
  "demand-signal": 90, // SWFL Inc / permit intensity weekly–monthly → ~1 quarter
  "credit-risk": 180, // SBA/QCEW quarterly → 2 quarters
  "real-estate": 180, // ZORI/FHFA indices quarterly & laggy; permits override down
  environmental: 180, // NFIP quarterly + structural AAL
  labor: 395, // BLS OEWS annual (~Apr) → next vintage, off the release boundary
  logistics: 365, // FAF5 annual
};

interface ValueTypeBucket {
  grade_basis: GradeBasis;
  epsilon_mode: EpsilonMode;
  epsilon: number;
}

/**
 * epsilon + grade_basis default by value_type. value_types absent here
 * (enum/string/categorical/date/score) are non-numeric → ungradeable.
 *   • Rate (percent-scale): absolute deadband in the native unit (0.05 = 5bp on a rate stored as 4.0).
 *   • Bounded other-scale (bps/percentile): absolute, own native defaults.
 *   • Unbounded level: relative (fraction of baseline) — ±5 permits means nothing without scale.
 *   • Change/z-score: grade the SIGN of the value, absolute deadband (relative explodes near 0).
 */
const VALUE_TYPE_BUCKET: Record<string, ValueTypeBucket> = {
  percentage: { grade_basis: "delta", epsilon_mode: "absolute", epsilon: 0.05 },
  ratio: { grade_basis: "delta", epsilon_mode: "absolute", epsilon: 0.05 },
  rate: { grade_basis: "delta", epsilon_mode: "absolute", epsilon: 0.05 },
  bps: { grade_basis: "delta", epsilon_mode: "absolute", epsilon: 5 },
  percentile: { grade_basis: "delta", epsilon_mode: "absolute", epsilon: 2 },
  count: { grade_basis: "delta", epsilon_mode: "relative", epsilon: 0.05 },
  integer: { grade_basis: "delta", epsilon_mode: "relative", epsilon: 0.05 },
  currency: { grade_basis: "delta", epsilon_mode: "relative", epsilon: 0.05 },
  currency_usd: {
    grade_basis: "delta",
    epsilon_mode: "relative",
    epsilon: 0.05,
  },
  index: { grade_basis: "delta", epsilon_mode: "relative", epsilon: 0.05 },
  days: { grade_basis: "delta", epsilon_mode: "relative", epsilon: 0.05 },
  distance_mi: {
    grade_basis: "delta",
    epsilon_mode: "relative",
    epsilon: 0.05,
  },
  elevation_ft: {
    grade_basis: "delta",
    epsilon_mode: "relative",
    epsilon: 0.05,
  },
  depth_in: { grade_basis: "delta", epsilon_mode: "relative", epsilon: 0.05 },
  percent_change: {
    grade_basis: "sign",
    epsilon_mode: "absolute",
    epsilon: 0.5,
  },
  percentage_point_change: {
    grade_basis: "sign",
    epsilon_mode: "absolute",
    epsilon: 0.5,
  },
  zscore: { grade_basis: "sign", epsilon_mode: "absolute", epsilon: 0.1 },
  z_score: { grade_basis: "sign", epsilon_mode: "absolute", epsilon: 0.1 },
};

export interface ResolvedGradeConfig {
  slug: string;
  concept_id: string | null;
  gradeable: boolean;
  window_days: number | null;
  epsilon: number | null;
  epsilon_mode: EpsilonMode | null;
  grade_basis: GradeBasis | null;
  direction_polarity: DirectionPolarity;
  /** Provenance of each resolved value — snapshotted into outcomes.grade_config for audit. */
  source: {
    window: "slug" | "category" | null;
    epsilon: "slug" | "value_type" | null;
    polarity: "slug" | null;
  };
  /** Present only when gradeable=false: which gate failed. */
  reason?: string;
}

/** Resolve a raw slug OR a canonical concept id to its concept. */
function conceptForSlug(vocab: Vocabulary, slug: string): VocabConcept | null {
  const mapped = vocab.slug_index[slug];
  if (typeof mapped === "string") return vocab.concepts[mapped] ?? null;
  return vocab.concepts[slug] ?? null; // slug may already be a canonical concept id
}

function ungradeable(
  slug: string,
  concept_id: string | null,
  reason: string,
): ResolvedGradeConfig {
  return {
    slug,
    concept_id,
    gradeable: false,
    window_days: null,
    epsilon: null,
    epsilon_mode: null,
    grade_basis: null,
    direction_polarity: "none",
    source: { window: null, epsilon: null, polarity: null },
    reason,
  };
}

/**
 * Resolve the deterministic grading rule for a metric slug via the two-axis
 * fallback. Read by capture (predictions-log deriveGradeFields) and by the
 * grader. NEVER throws — an unknown / polarity-less / non-numeric / qualitative
 * slug returns `gradeable:false` with a `reason`, so the corpus self-cleans.
 */
export function resolveGradeConfig(slug: string): ResolvedGradeConfig {
  const vocab = loadVocabularySync();
  const concept = conceptForSlug(vocab, slug);
  if (!concept) {
    return ungradeable(
      slug,
      null,
      `slug "${slug}" is not registered in the vocabulary`,
    );
  }

  const g = concept.grade;

  // Polarity — slug-only, never inherited. Read raw (the JSON field is typed to
  // the enum but not runtime-validated) and classify against the enum, so an
  // out-of-enum token is rejected here at the runtime grading source, not just
  // flagged downstream.
  const rawPolarity: string | null =
    (g?.direction_polarity as string | undefined) ?? null;
  const polarityState = classifyPolarity(rawPolarity);
  const direction_polarity: DirectionPolarity =
    polarityState === "valid_directional"
      ? (rawPolarity as DirectionPolarity)
      : "none";

  // Window — slug override, else category default.
  const window_days =
    g?.window_days ?? CATEGORY_WINDOW_DAYS[concept.category] ?? null;
  const windowSource: "slug" | "category" | null =
    g?.window_days != null ? "slug" : window_days != null ? "category" : null;

  // Epsilon / basis — slug override, else value_type bucket.
  const bucket = concept.value_type
    ? VALUE_TYPE_BUCKET[concept.value_type]
    : undefined;
  const epsilon = g?.epsilon ?? bucket?.epsilon ?? null;
  const epsilon_mode = g?.epsilon_mode ?? bucket?.epsilon_mode ?? null;
  const grade_basis = g?.grade_basis ?? bucket?.grade_basis ?? null;
  const epsilonSource: "slug" | "value_type" | null =
    g?.epsilon != null ? "slug" : bucket != null ? "value_type" : null;

  const base: ResolvedGradeConfig = {
    slug,
    concept_id: concept.id,
    gradeable: false,
    window_days,
    epsilon,
    epsilon_mode,
    grade_basis,
    direction_polarity,
    source: {
      window: windowSource,
      epsilon: epsilonSource,
      polarity: polarityState === "valid_directional" ? "slug" : null,
    },
  };

  if (polarityState === "none") {
    return {
      ...base,
      reason: "no direction_polarity declared (slug-only, never inherited)",
    };
  }
  if (polarityState === "invalid") {
    return {
      ...base,
      reason: `invalid direction_polarity "${rawPolarity}" (not in {higher_is_bullish, lower_is_bullish})`,
    };
  }
  if (window_days == null) {
    return {
      ...base,
      reason: `category "${concept.category}" has no window default (non-gradeable)`,
    };
  }
  if (epsilon == null || grade_basis == null) {
    return {
      ...base,
      reason: `value_type "${concept.value_type ?? "—"}" is non-numeric (no epsilon/basis)`,
    };
  }

  return { ...base, gradeable: true };
}

// ---------------------------------------------------------------------------
// gateVector — non-short-circuiting gate read for the grade-config sweep.
//
// resolveGradeConfig returns the FIRST failing gate as its `reason`, which is
// correct for the grader but wrong for bucketing: a slug failing two gates
// reports only one, so reason-string branching double-counts. gateVector
// evaluates each gate INDEPENDENTLY (no early return), so the sweep can route
// every slug into exactly one bucket from the full gate state. Pure read; same
// CATEGORY_WINDOW_DAYS / VALUE_TYPE_BUCKET / conceptForSlug as resolveGradeConfig.
//
// Drift pin (sweep §3): for every slug,
//   registered && polarity_state === "valid_directional" && window_ok && numeric_ok
//     ⇔  resolveGradeConfig(slug).gradeable
// ---------------------------------------------------------------------------

export interface GateVector {
  slug: string;
  concept_id: string | null;
  /** conceptForSlug(vocab, slug) !== null */
  registered: boolean;
  /** classifyPolarity(raw_polarity) — the three-state lattice. */
  polarity_state: PolarityState;
  /** (g.window_days ?? CATEGORY_WINDOW_DAYS[category]) != null */
  window_ok: boolean;
  /** epsilon != null && grade_basis != null (slug override or value_type bucket) */
  numeric_ok: boolean;
  // raw values carried for the ledger / per-slug audit:
  raw_polarity: string | null;
  category: string | null;
  value_type: string | null;
  window_days: number | null;
}

export function gateVector(slug: string): GateVector {
  const vocab = loadVocabularySync();
  const concept = conceptForSlug(vocab, slug);
  if (!concept) {
    // Unregistered: polarity/window/numeric are uncomputable without a concept.
    return {
      slug,
      concept_id: null,
      registered: false,
      polarity_state: "none",
      window_ok: false,
      numeric_ok: false,
      raw_polarity: null,
      category: null,
      value_type: null,
      window_days: null,
    };
  }

  const g = concept.grade;
  const rawPolarity: string | null =
    (g?.direction_polarity as string | undefined) ?? null;
  const window_days =
    g?.window_days ?? CATEGORY_WINDOW_DAYS[concept.category] ?? null;
  const bucket = concept.value_type
    ? VALUE_TYPE_BUCKET[concept.value_type]
    : undefined;
  const epsilon = g?.epsilon ?? bucket?.epsilon ?? null;
  const grade_basis = g?.grade_basis ?? bucket?.grade_basis ?? null;

  return {
    slug,
    concept_id: concept.id,
    registered: true,
    polarity_state: classifyPolarity(rawPolarity),
    window_ok: window_days != null,
    numeric_ok: epsilon != null && grade_basis != null,
    raw_polarity: rawPolarity,
    category: concept.category ?? null,
    value_type: concept.value_type ?? null,
    window_days,
  };
}
