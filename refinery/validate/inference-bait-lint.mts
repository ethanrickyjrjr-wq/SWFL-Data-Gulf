/**
 * Inference-bait lint — two rules, both targeted at LLM failure modes.
 *
 * Rule 1: `ambiguous denominator` (SAVED FACTS values).
 *   A fact value must not pair an explicit percentage with a second count a
 *   reader could mistake for an alternative denominator. Historical bug: the
 *   charge-off summary listed each brand as
 *     `Zoom Room (0% survival — 1 of 1 resolved charged off, 2 total)`
 *   and models anchored on "1 ... 2 total", computed 1/2 = 50%, and discarded
 *   the explicit "0% survival". This rule flags any parenthetical group `(...)`
 *   carrying BOTH a percentage AND a "<number> total" count.
 *
 * Rule 2: `causal-chain-across-brains` (OUTPUT.conclusion). Roadmap §6.1.3.
 *   Master's OUTPUT.conclusion may attribute reads to upstream brains via
 *   explicit citation syntax ("per macro-us"), but it must NOT chain two
 *   different brain IDs together with causal English ("X because Y", "X
 *   leading to Y", etc.). Hallucinated causation across brains is the LLM
 *   weaving a story that the deterministic synthesizer never asserted —
 *   exactly the failure mode the thin-pipe contract exists to prevent.
 *   Brain IDs preceded by "per " or "according to " are treated as citation
 *   anchors and do not participate in the causal-pair detection.
 *
 * Stage 4 runs both rules before writing; a violation aborts the run.
 */

import type { LintResult, LintViolation } from "./facts-only-lint.mts";

const PERCENT = /\d+(?:\.\d+)?\s*%/;
const COUNT_TOTAL = /\b\d+\s+total\b/i;
const PAREN_GROUP = /\(([^()]*)\)/g;

/** Causal triggers that flag a cross-brain chain when two brain IDs flank them. */
const CAUSAL_TRIGGERS = [
  "because",
  "due to",
  "leading to",
  "which is why",
  "as a result",
];

/** Window (in chars) on each side of a trigger to look for brain IDs. */
const CAUSAL_WINDOW = 80;

/** Pull a named `--- SECTION ---` body out of the ```reference fence. */
function extractSection(
  md: string,
  sectionName: string,
): { body: string; refLines: string[] } | null {
  const fence = md.match(/```reference\n([\s\S]*?)\n```/);
  if (!fence) return null;
  const refLines = fence[1].split("\n");
  const start = refLines.indexOf(`--- ${sectionName} ---`);
  if (start === -1) return null;
  const body: string[] = [];
  for (let i = start + 1; i < refLines.length; i++) {
    if (/^--- .* ---$/.test(refLines[i])) break;
    body.push(refLines[i]);
  }
  return { body: body.join("\n").trim(), refLines };
}

/**
 * Find every brain-id occurrence in `text` for the given ids. Returns matches
 * sorted by index. A brain id immediately preceded by "per " or "according to "
 * (case-insensitive, within 16 chars) is tagged `citation: true` and excluded
 * from causal-pair detection — it is a footnote-style attribution, not a
 * causal claim.
 */
interface BrainIdMatch {
  id: string;
  index: number;
  end: number;
  citation: boolean;
}
function findBrainIdsInText(text: string, brainIds: string[]): BrainIdMatch[] {
  const matches: BrainIdMatch[] = [];
  for (const id of brainIds) {
    // Word-boundary on both sides, escape kebab regex-safe (only [a-z-] used today).
    const re = new RegExp(`\\b${id.replace(/-/g, "\\-")}\\b`, "gi");
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0;
      const pre = text.slice(Math.max(0, index - 16), index).toLowerCase();
      const citation = /(^|\W)(per|according to)\s+$/.test(pre);
      matches.push({ id, index, end: index + id.length, citation });
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

/** Find every causal-trigger occurrence in `text`. */
interface TriggerMatch {
  trigger: string;
  index: number;
  end: number;
}
function findTriggers(text: string): TriggerMatch[] {
  const out: TriggerMatch[] = [];
  for (const t of CAUSAL_TRIGGERS) {
    const re = new RegExp(`\\b${t}\\b`, "gi");
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0;
      out.push({ trigger: t, index, end: index + t.length });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * For each causal trigger, look at non-citation brain-id matches within
 * CAUSAL_WINDOW chars on each side. If there's at least one id on each side
 * and the left and right sides include DIFFERENT ids, flag the trigger.
 */
function detectCausalChains(
  conclusion: string,
  brainIds: string[],
): LintViolation[] {
  const ids = findBrainIdsInText(conclusion, brainIds).filter(
    (m) => !m.citation,
  );
  if (ids.length < 2) return [];
  const triggers = findTriggers(conclusion);
  const violations: LintViolation[] = [];
  for (const t of triggers) {
    const left = ids.filter(
      (m) => m.end <= t.index && t.index - m.end <= CAUSAL_WINDOW,
    );
    const right = ids.filter(
      (m) => m.index >= t.end && m.index - t.end <= CAUSAL_WINDOW,
    );
    if (left.length === 0 || right.length === 0) continue;
    const leftIds = new Set(left.map((m) => m.id));
    const rightIds = new Set(right.map((m) => m.id));
    const cross = [...rightIds].some((id) => !leftIds.has(id));
    if (!cross) continue;
    // Snippet centered on the trigger for the violation text.
    const snipStart = Math.max(0, t.index - CAUSAL_WINDOW);
    const snipEnd = Math.min(conclusion.length, t.end + CAUSAL_WINDOW);
    const snippet = conclusion.slice(snipStart, snipEnd).trim();
    violations.push({
      line: 0,
      text: `OUTPUT.conclusion: "${snippet}" (trigger: "${t.trigger}")`,
      pattern: "causal-chain-across-brains",
    });
  }
  return violations;
}

export function lintInferenceBait(
  md: string,
  brainIds: string[] = [],
): LintResult {
  const violations: LintViolation[] = [];

  // --- Rule 1: ambiguous denominator in SAVED FACTS values --------------
  const factsBlock = extractSection(md, "SAVED FACTS");
  if (factsBlock) {
    let facts: unknown = null;
    try {
      facts = JSON.parse(factsBlock.body);
    } catch {
      facts = null;
    }
    if (Array.isArray(facts)) {
      for (const f of facts) {
        const fact = f as Record<string, unknown>;
        const id = typeof fact.id === "string" ? fact.id : "?";
        const value = typeof fact.value === "string" ? fact.value : "";
        for (const m of value.matchAll(PAREN_GROUP)) {
          const inner = m[1];
          if (PERCENT.test(inner) && COUNT_TOTAL.test(inner)) {
            const lineIdx = factsBlock.refLines.findIndex((l) =>
              l.includes(`"id":"${id}"`),
            );
            violations.push({
              line: lineIdx === -1 ? 0 : lineIdx + 1,
              text: `${id}: (${inner})`,
              pattern: "ambiguous denominator",
            });
          }
        }
      }
    }
  }

  // --- Rule 2: causal-chain-across-brains in OUTPUT.conclusion ----------
  // Only runs when the caller supplied the brain-id set (Stage 4 always does;
  // legacy unit-test callers that pass no ids get back-compat behavior).
  if (brainIds.length > 0) {
    const outputBlock = extractSection(md, "OUTPUT");
    if (outputBlock) {
      let output: unknown = null;
      try {
        output = JSON.parse(outputBlock.body);
      } catch {
        output = null;
      }
      if (output && typeof output === "object" && !Array.isArray(output)) {
        const conclusion = (output as Record<string, unknown>).conclusion;
        if (typeof conclusion === "string" && conclusion.length > 0) {
          violations.push(...detectCausalChains(conclusion, brainIds));
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
