/**
 * Corridor-character lint orchestrator — Step 3 of the corridor-character
 * generator plan.
 *
 * Runs the three per-block lint stacks against a synthesizer output and
 * aggregates errors. C1 (synthesize-corridor-character.mts) calls this
 * BEFORE any DB write — a malformed run must leave the DB untouched (this
 * is the explicit Step 3 acceptance criterion).
 *
 * Block-specific stacks (per plan Step 3):
 *
 *   - Facts block:
 *       - facts-only-lint (no second-person, no imperatives)
 *       - smoothing-token ban (numeric_softening + prose_confidence_translation)
 *       - citation-presence check (every facts block must carry at least one
 *         [internal-N] OR [web-N] marker — rule 2: provenance per claim)
 *
 *   - Speculative block:
 *       - trailing verbatim disclaimer required
 *       - hedging required around any number not in the fact pack
 *
 *   - Chart block:
 *       - structural validation only ({title, columns, rows} or null)
 *
 * Note re: spec-validator: the plan lists spec-validator on the facts-block
 * stack, but spec-validator targets the brain-markdown surface (frontmatter,
 * --- OUTPUT ---, ```reference fence) — it does not apply to a free-form
 * corridor-character facts paragraph. Treating it as a no-op for this lint
 * surface (the orchestrator does not synthesize a fake brain markdown to
 * feed it). If a future change moves corridor-character into the brain
 * pipeline proper, wire spec-validator at that boundary, not here.
 */

import { lintFactsOnly } from "./facts-only-lint.mts";
import { lintSmoothing } from "./smoothing-lint.mts";
import {
  lintSpeculativeBlock,
  SPECULATIVE_DISCLAIMER,
} from "./speculative-block-lint.mts";
import { lintChartBlock, type ChartBlock } from "./chart-block-lint.mts";
import type { CorridorFactPack } from "../tools/build-corridor-fact-pack.mts";

export { SPECULATIVE_DISCLAIMER };

/** Citation payload that mirrors the corridor_profiles.character_citations JSONB shape. */
export interface InternalCite {
  ref: string;
  source_url: string;
}
export interface WebCite {
  ref: string;
  url: string;
  title: string;
  cited_text: string;
}
export interface CharacterCitations {
  internal: InternalCite[];
  web: WebCite[];
}

/** The output payload C1 emits and the orchestrator lints. */
export interface CorridorCharacterOutput {
  facts_block: string;
  chart_block: ChartBlock | null;
  speculative_block: string;
  citations: CharacterCitations;
}

export interface CorridorCharacterLintResult {
  ok: boolean;
  /** Errors keyed by block — helpful for the operator-facing reject message. */
  errors: {
    facts: string[];
    speculative: string[];
    chart: string[];
  };
  /** All errors flattened with a `[block] ` prefix for one-line logging. */
  flat_errors: string[];
}

/** Wrap a free-form prose block in the minimal ```reference fence the existing linters expect. */
function wrapForRefenceLinter(block: string): string {
  return [
    "```reference",
    "--- HOW THE USER LIKES TO WORK ---",
    block,
    "",
    "--- RECENT NOTES ---",
    "- nothing",
    "```",
  ].join("\n");
}

const CITATION_REF_RE = /\[(internal|web)-\d+\]/i;
const ANCHOR_RE = /\[(internal|web)-\d+\]/gi;

/**
 * Cross-check every [internal-N] / [web-N] anchor in `block` against the
 * citations payload. Dangling anchors (no matching row) are returned as
 * errors. Pure — no IO, no shared state. Used by BOTH facts-block and
 * speculative-block lint paths because either block can produce a dangling
 * ref and either would break the renderer downstream.
 */
function findDanglingAnchorErrors(
  blockName: "facts_block" | "speculative_block",
  block: string,
  citations: CharacterCitations,
): string[] {
  const errors: string[] = [];
  const internalRefs = new Set(
    citations.internal.map((c) => c.ref.toLowerCase()),
  );
  const webRefs = new Set(citations.web.map((c) => c.ref.toLowerCase()));
  for (const m of block.matchAll(ANCHOR_RE)) {
    const anchor = m[0].toLowerCase();
    const kind = anchor.startsWith("[internal") ? "internal" : "web";
    const set = kind === "internal" ? internalRefs : webRefs;
    const bareRef = anchor.slice(1, -1);
    if (!set.has(bareRef)) {
      errors.push(
        `${blockName} cites "${anchor}" but no matching ${kind} citation row was supplied.`,
      );
    }
  }
  return errors;
}

export function lintCorridorCharacterOutput(
  output: CorridorCharacterOutput,
  factPack: CorridorFactPack,
): CorridorCharacterLintResult {
  const factsErrors: string[] = [];
  const speculativeErrors: string[] = [];
  const chartErrors: string[] = [];

  // ── Facts block ────────────────────────────────────────────────────────
  if (
    typeof output.facts_block !== "string" ||
    output.facts_block.trim().length === 0
  ) {
    factsErrors.push("facts_block must be a non-empty string.");
  } else {
    const wrapped = wrapForRefenceLinter(output.facts_block);

    // 1. facts-only-lint (no second-person, no imperatives, etc.).
    const factsOnly = lintFactsOnly(wrapped);
    if (!factsOnly.ok) {
      for (const v of factsOnly.violations) {
        factsErrors.push(`facts-only-lint: ${v.pattern} — "${v.text}"`);
      }
    }

    // 2. smoothing-token ban (numeric_softening + prose_confidence_translation).
    const smoothing = lintSmoothing(wrapped);
    if (!smoothing.ok) {
      for (const v of smoothing.violations) {
        factsErrors.push(
          `smoothing-lint (${v.group}): "${v.token}" in "${v.text}"`,
        );
      }
    }

    // 3. Citation presence — at least one [internal-N] or [web-N] anchor.
    //    Per plan rule 2: provenance per claim. We don't try to parse every
    //    claim here (LLM prose is too varied); we require at minimum that
    //    the block carries one citation marker that the citations payload
    //    backs. The combination of "block has at least one anchor" + "every
    //    anchor in the block resolves to a citation row" is what gives the
    //    operator coverage without false positives on continuation prose.
    if (!CITATION_REF_RE.test(output.facts_block)) {
      factsErrors.push(
        "facts_block has no citation marker ([internal-N] or [web-N]). " +
          "Per plan rule 2, every claim in the facts block must trace to " +
          "an internal data row or a web citation.",
      );
    }

    // 4. Dangling-anchor cross-check (facts block).
    factsErrors.push(
      ...findDanglingAnchorErrors(
        "facts_block",
        output.facts_block,
        output.citations,
      ),
    );
  }

  // ── Speculative block ──────────────────────────────────────────────────
  if (typeof output.speculative_block !== "string") {
    speculativeErrors.push("speculative_block must be a string.");
  } else {
    const sp = lintSpeculativeBlock(output.speculative_block, factPack);
    if (!sp.ok) speculativeErrors.push(...sp.errors);

    // Dangling-anchor cross-check (speculative block). The plan's REJECT
    // contract requires this: a model can emit [web-99] in the speculative
    // block, hedge it properly, and otherwise pass — but the renderer would
    // break trying to resolve a citation that was never supplied. Same
    // helper as facts block; presence of a marker is NOT required here
    // (the speculative block can be pure inference with [inference] tags),
    // but any web/internal anchor that DOES appear must resolve.
    speculativeErrors.push(
      ...findDanglingAnchorErrors(
        "speculative_block",
        output.speculative_block,
        output.citations,
      ),
    );
  }

  // ── Chart block ────────────────────────────────────────────────────────
  const ch = lintChartBlock(output.chart_block);
  if (!ch.ok) chartErrors.push(...ch.errors);

  const flat = [
    ...factsErrors.map((e) => `[facts] ${e}`),
    ...speculativeErrors.map((e) => `[speculative] ${e}`),
    ...chartErrors.map((e) => `[chart] ${e}`),
  ];

  return {
    ok: flat.length === 0,
    errors: {
      facts: factsErrors,
      speculative: speculativeErrors,
      chart: chartErrors,
    },
    flat_errors: flat,
  };
}
