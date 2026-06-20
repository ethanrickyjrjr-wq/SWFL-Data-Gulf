/**
 * Smoothing-language lint (Lane 1D per `cosmic-rolling-brook.md` v2): a brain
 * payload's prose must not soften the deterministic numbers Stage 4 computes.
 * Vague quantifiers ("approximately", "smoothed") and hand-wavy confidence
 * verbalizations ("fairly confident", "high confidence") let an LLM re-encode
 * the engine's hard-won numbers into ambiguous English — the exact failure
 * mode the thin-pipe contract exists to prevent.
 *
 * This lint scans ONLY the content inside the ```reference fence (same scope
 * as `facts-only-lint.mts`). The framing paragraph outside the fence is fixed
 * boilerplate and intentionally not scanned.
 *
 * Stage 4 runs this before writing; a violation aborts the run.
 *
 * Token list lives in `refinery/lib/smoothing-tokens.mts` — single source of
 * truth, shared with the Lane 2C consumption-contract rewrite (Coupling 3).
 */

import {
  SMOOTHING_TOKENS,
  type SmoothingTokenGroup,
} from "../lib/smoothing-tokens.mts";
import { isQuotedSourceLine } from "./facts-only-lint.mts";

export interface SmoothingViolation {
  /** 1-based line number within the reference block */
  line: number;
  text: string;
  token: string;
  group: SmoothingTokenGroup;
}

export interface SmoothingLintResult {
  ok: boolean;
  violations: SmoothingViolation[];
}

/**
 * Compiled patterns: one regex per token, in deterministic group/token order.
 * Each pattern is a case-insensitive whole-token match. Multi-word tokens
 * (e.g. "on the order of") are matched as a single regex with word boundaries
 * around the first and last word and `\s+` between interior words so the
 * linter survives an extra space without false-negative.
 */
interface CompiledPattern {
  group: SmoothingTokenGroup;
  token: string;
  re: RegExp;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileTokenRegex(token: string): RegExp {
  const parts = token.split(/\s+/).map(escapeRegex);
  // Word-boundary on the outer edges. For tokens like "we're" the apostrophe
  // breaks JS's \b semantics, so we use a permissive boundary that accepts
  // any non-letter (or start/end of string) on either side.
  const body = parts.join("\\s+");
  return new RegExp(`(^|[^A-Za-z])(${body})(?=$|[^A-Za-z])`, "i");
}

const PATTERNS: CompiledPattern[] = Object.entries(SMOOTHING_TOKENS).flatMap(
  ([group, tokens]) =>
    (tokens as readonly string[]).map((token) => ({
      group: group as SmoothingTokenGroup,
      token,
      re: compileTokenRegex(token),
    })),
);

/**
 * Only "approximately"/"roughly" can faithfully qualify a reported figure
 * ("approximately $6.2 million") — the source itself reported it as approximate
 * and the number stays visible. The other numeric_softening tokens describe the
 * brain's own number-derivation ("smoothed", "interpolated", "estimated from",
 * "on the order of", "in the range of", "ballpark") and ALWAYS smell of smoothing,
 * so they are never figure-exempt.
 */
const FIGURE_QUALIFIER_TOKENS = new Set(["approximately", "roughly"]);

/**
 * True when the text immediately AFTER a matched token is a numeric quantity
 * ("$6.2 million", "55 acres", "~5%"). That keeps the number visible — the
 * opposite of the failure mode this lint targets (re-encoding a known-exact
 * number, or softening a non-numeric claim like "approximately rising").
 */
function qualifiesAFigure(line: string, afterTokenIdx: number): boolean {
  const rest = line.slice(afterTokenIdx).replace(/^[\s:=]+/, "");
  return (
    /^[~$(]?\s*\$?\s*[\d]/.test(rest) ||
    /^(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(rest)
  );
}

export function lintSmoothing(md: string): SmoothingLintResult {
  const m = md.match(/```reference\n([\s\S]*?)\n```/);
  // A missing reference block is the spec-validator's problem, not ours.
  if (!m) return { ok: true, violations: [] };

  const violations: SmoothingViolation[] = [];
  m[1].split("\n").forEach((line, idx) => {
    const trimmed = line.trim();
    if (isQuotedSourceLine(trimmed)) return; // pass-through: verbatim quoted source
    for (const { group, token, re } of PATTERNS) {
      // Global scan so a number-qualified occurrence early in the line doesn't
      // mask a genuine softening occurrence later.
      const g = new RegExp(re.source, "gi");
      let flagged = false;
      // exec advances g.lastIndex (read below); the match object itself is unused.
      while (g.exec(line) !== null) {
        if (
          group === "numeric_softening" &&
          FIGURE_QUALIFIER_TOKENS.has(token) &&
          qualifiesAFigure(line, g.lastIndex)
        ) {
          continue; // faithful figure qualifier — not the softening this lint bans
        }
        flagged = true;
        break;
      }
      if (flagged) {
        violations.push({ line: idx + 1, text: trimmed, token, group });
      }
    }
  });

  return { ok: violations.length === 0, violations };
}
