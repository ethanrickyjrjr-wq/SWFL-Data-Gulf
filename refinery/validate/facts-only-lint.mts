/**
 * The facts-only contract (spec v1.1): a brain payload carries data, never
 * instructions. This lint scans ONLY the content inside the ```reference
 * fence for instruction-shaped language. The framing paragraph (fixed
 * boilerplate, outside the fence) is intentionally not scanned.
 *
 * Stage 4 runs this before writing; a violation aborts the run.
 */

export interface LintViolation {
  /** 1-based line number within the reference block */
  line: number;
  text: string;
  pattern: string;
}

export interface LintResult {
  ok: boolean;
  violations: LintViolation[];
}

const PATTERNS: { name: string; re: RegExp }[] = [
  {
    name: "second-person directive",
    re: /\byou\s+(must|should|shall|will|need to|have to|are|can|may)\b/i,
  },
  { name: "second-person possessive", re: /\byour\b/i },
  {
    name: "override instruction",
    re: /\bignore\s+(all|any|previous|the|everything)\b/i,
  },
  { name: "temporal directive", re: /\bfrom now on\b/i },
  {
    name: "imperative line start",
    re: /^(always|never|do not|don't|make sure|ensure|remember to)\b/i,
  },
  {
    name: "injected preference",
    re: /\bthe user now (wants|prefers|needs|requires)\b/i,
  },
];

/**
 * Verbatim quoted-source field lines (citation receipts) are exempt from the
 * synthesized-claim checks: a source listing that says "your dream home" or a
 * news article quoted verbatim is faithful reporting, not an instruction the
 * brain injected. The checks police the brain's OWN claim text (fact/value/
 * conclusion), never the quoted span it cites. Matches the JSON render where
 * citation text always lands on its own `"citation": "…"` line.
 */
export function isQuotedSourceLine(trimmed: string): boolean {
  return /^"(citation|cited_text|quoted_text|quote)"\s*:/.test(trimmed);
}

export function lintFactsOnly(md: string): LintResult {
  const m = md.match(/```reference\n([\s\S]*?)\n```/);
  // A missing reference block is the spec-validator's problem, not ours.
  if (!m) return { ok: true, violations: [] };

  const violations: LintViolation[] = [];
  m[1].split("\n").forEach((line, idx) => {
    const trimmed = line.trim();
    if (isQuotedSourceLine(trimmed)) return; // pass-through: verbatim quoted source
    for (const { name, re } of PATTERNS) {
      if (re.test(trimmed)) {
        violations.push({ line: idx + 1, text: trimmed, pattern: name });
      }
    }
  });

  return { ok: violations.length === 0, violations };
}
