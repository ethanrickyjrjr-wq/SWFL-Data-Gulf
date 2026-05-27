/**
 * Speculative-block lint — Step 3 of the corridor-character generator plan.
 *
 * Two new rules that ONLY apply to the speculative block:
 *
 *   1. `requires-speculative-disclaimer` — the speculative block MUST end
 *      with the verbatim disclaimer string (see SPECULATIVE_DISCLAIMER). The
 *      consumer renderer relies on that string being present so it can label
 *      the block "Speculative — double-check" inline. Missing it would let
 *      AI-inferred prose render with no visual signal it's interpolation.
 *
 *   2. `requires-hedging-around-inference` — any numeric value the
 *      speculative block introduces that did NOT come from the fact pack
 *      must sit inside (or adjacent to) a hedging token from the shared
 *      smoothing-tokens list. In the facts block, that same token list is
 *      BANNED (it would let an LLM soften deterministic numbers); in the
 *      speculative block it is REQUIRED, because hedging is exactly the
 *      signal the operator wants on inferred numbers. Same word list,
 *      inverted polarity. This is the load-bearing carve-out CLAUDE.md
 *      SWFL Protocol rule 8 calls out — do NOT re-tighten this.
 *
 * Both rules are STRING-based. They run against the raw speculative-block
 * text + the fact pack (to know which numbers are "anchored" and don't need
 * hedging) + a known list of fact-pack numbers passed in by the orchestrator.
 *
 * Pure function. No IO.
 */

import {
  SMOOTHING_TOKENS,
  type SmoothingTokenGroup,
} from "../lib/smoothing-tokens.mts";
import type { CorridorFactPack } from "../tools/build-corridor-fact-pack.mts";

/** Disclaimer string the speculative block MUST end with verbatim. */
export const SPECULATIVE_DISCLAIMER =
  "Speculative — based partly on inferred data. Double-check.";

export interface SpeculativeLintResult {
  ok: boolean;
  errors: string[];
}

/**
 * Hedging tokens are the same physical list as the smoothing-tokens ban list
 * — both groups. Polarity flips: facts block bans them, speculative block
 * requires them around inferred numbers.
 */
const HEDGING_TOKENS: ReadonlyArray<{
  token: string;
  group: SmoothingTokenGroup;
}> = (
  Object.entries(SMOOTHING_TOKENS) as Array<
    [SmoothingTokenGroup, readonly string[]]
  >
).flatMap(([group, tokens]) => tokens.map((token) => ({ token, group })));

/**
 * Additional hedging phrases the plan's speculative-block prompt fragment
 * explicitly authorizes ("most likely hovering near", "tracking toward").
 * These read as hedges in context but are not on the smoothing-tokens list
 * (which is curated for the FACTS-block ban). Authoring both lists in this
 * file would create the drift hazard the smoothing-tokens.mts comment warns
 * about — so we keep the smoothing list as canonical and ADD the
 * speculative-only phrases here.
 */
const SPECULATIVE_ONLY_HEDGES: ReadonlyArray<string> = [
  "most likely",
  "tracking toward",
  "likely hovering",
  "appears to be",
  "appears to",
  "could be",
  "may be",
  "might be",
  "would put",
  "would suggest",
  "suggests",
  "likely",
  "probably",
  "near",
];

/** Collect every numeric value mentioned anywhere in the fact pack's current/math/inputs. */
export function collectFactPackNumbers(
  pack: CorridorFactPack,
): ReadonlySet<number> {
  const out = new Set<number>();
  const add = (v: unknown): void => {
    if (typeof v === "number" && Number.isFinite(v)) out.add(v);
  };
  for (const m of Object.values(pack.metrics)) {
    add(m.current.value);
    for (const im of m.important_math) {
      add(im.value);
      for (const inp of im.inputs) add(inp.value);
    }
  }
  return out;
}

/**
 * Find every standalone numeric token in `text`. Captures integers, decimals,
 * percentages (`6.1%`), thousands-separated (`12,000`), and currency-prefixed
 * values (`$32.50`). Returns the parsed numeric value + the offset of the
 * match. References like `[internal-3]` / `[web-2]` are EXCLUDED — they're
 * citation anchors, not claims.
 */
interface NumberMatch {
  value: number;
  raw: string;
  index: number;
  end: number;
}

const NUMBER_RE =
  /(?<![\w[])\$?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|(?<![\w[])\$?-?\d+(?:\.\d+)?%?/g;

/**
 * SWFL road-vocabulary prefixes that turn a trailing integer into a route
 * identifier rather than a quantity. Mirrors the year exemption's logic:
 * identifiers, not predictions. Scope is intentionally tight to highway
 * shapes that show up in SWFL corridor prose (U.S. 41, I-75, SR-82,
 * CR-951, US-41). Anything outside this list still goes through the full
 * quantity pipeline.
 */
const HIGHWAY_PREFIX_RE = /(?:^|[^\w])(?:U\.S\.\s|US-|US\s|I-|SR[ -]|CR[ -])$/;

function findNumbers(text: string): NumberMatch[] {
  const out: NumberMatch[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = m[0];
    // Excise the citation-anchor pattern: a digit directly preceded by
    // "[internal-" / "[web-" / "[inference" should not register.
    const startIdx = m.index ?? 0;
    const pre = text.slice(Math.max(0, startIdx - 12), startIdx);
    if (/\[(internal|web|inference)-?$/.test(pre)) continue;
    // Highway-designator exemption: "U.S. 41", "I-75", "SR-82", "CR-951",
    // "US-41" — these are identifiers, not quantities. Same category-error
    // surgical fix shape as the year exemption.
    if (HIGHWAY_PREFIX_RE.test(pre)) continue;
    // Year exemption: a bare 4-digit integer in the calendar range
    // [1900-2099] is a temporal anchor, not an inferred prediction. The
    // speculative block legitimately references years ("the 2024-2025
    // stretch", "by Q2 2026"); requiring hedging tokens around them was
    // a category error in the original lint. Stays linted: anything with a
    // `%`, `$`, `.`, or `,` qualifier ("25%", "$2025", "2,025", "2025.5")
    // — those are quantities, not years.
    const isBareFourDigit = /^\d{4}$/.test(raw);
    const cleaned = raw.replace(/[$,%]/g, "");
    const n = Number(cleaned);
    if (!Number.isFinite(n)) continue;
    if (isBareFourDigit && n >= 1900 && n <= 2099) continue;
    out.push({ value: n, raw, index: startIdx, end: startIdx + raw.length });
  }
  return out;
}

/** Is `value` within tolerance of any number in the anchor set? */
function isAnchored(
  value: number,
  anchors: ReadonlySet<number>,
  tolerance = 0.05,
): boolean {
  for (const a of anchors) {
    if (a === 0) {
      if (Math.abs(value) <= tolerance) return true;
    } else if (Math.abs((value - a) / a) <= tolerance) {
      return true;
    }
    if (Math.abs(value - a) <= tolerance) return true;
  }
  return false;
}

/**
 * Compute the [start, end) offsets of the sentence containing `index`.
 * Sentences are separated by [.!?]+ + whitespace + capital letter.
 *
 * The `(?=[A-Z])` lookahead is doing the load-bearing work: it prevents
 * splits on "U.S. 41" / "U.S. and the state highway..." / "5.2% asking"
 * because the char following the punctuation+space is a digit / lowercase
 * letter / etc. — not a capital. False-positive splits on
 * "Mr. Smith" / "U.S. Government" / "the St. Johns River" do happen but
 * are the SAFE failure direction (a [web-N] in the "real" sentence may
 * not be visible to the over-split fragment containing the number →
 * exemption fails → number gets flagged → operator iterates). The unsafe
 * direction (under-splitting, a [web-N] wrongly extending coverage to a
 * number in a different sentence) doesn't happen here.
 */
function sentenceBoundsAt(
  text: string,
  index: number,
): { start: number; end: number } {
  const boundaryRe = /[.!?]+\s+(?=[A-Z])/g;
  let lastBoundaryEnd = 0;
  for (const m of text.matchAll(boundaryRe)) {
    const matchEnd = (m.index ?? 0) + m[0].length;
    if (matchEnd > index) {
      return { start: lastBoundaryEnd, end: m.index ?? text.length };
    }
    lastBoundaryEnd = matchEnd;
  }
  return { start: lastBoundaryEnd, end: text.length };
}

/**
 * Does the speculative-block text satisfy the hedging requirement for
 * the number at `match`?
 *
 * Three exemption paths, in increasing scope:
 *
 *   1. Phrase-level (±60-char window): a hedging token from the
 *      smoothing-list or SPECULATIVE_ONLY_HEDGES list within ±60 chars
 *      of the number ("most likely near 6.1%", "tracking toward 35,000").
 *      Phrase-level proximity is the right scope for hedging tokens —
 *      they're modifying-the-number signals, not block-level attribution.
 *
 *   2. Sentence-scoped — `[inference]` marker anywhere in the same
 *      sentence as the number. Operator-blessed explicit hedge: "this
 *      claim is model-inferred, no source."
 *
 *   3. Sentence-scoped — `[web-N]` (N = digits) anywhere in the same
 *      sentence as the number. Source-attribution marker. A web citation
 *      IS the disclosure; the hedging requirement was designed to gate
 *      INFERRED predictions, not quoted facts. Sentence-scope (not the
 *      ±60-char window) is the principled boundary because the model is
 *      citing a sentence, not a phrase — e.g. "365-unit redevelopment
 *      proposal for the former cinema pad faces a politically uncertain
 *      path after the Estero Planning, Zoning & Design Board's criticism
 *      [web-19][web-21]" — the [web-N] cluster clearly covers the whole
 *      claim including the 365.
 *
 * Internal-fact-pack citations (`[internal-N]`) get a separate path —
 * those numbers ARE in the fact pack and are already caught by
 * `isAnchored`, so we don't exempt them here (defense in depth: if a
 * model wrote "[internal-X]" referring to a value that isn't actually
 * in the pack, the lint still flags it).
 */
function hasNearbyHedge(text: string, match: NumberMatch): boolean {
  // Phrase-level: hedging tokens within ±60 chars of the number.
  const WINDOW = 60;
  const start = Math.max(0, match.index - WINDOW);
  const end = Math.min(text.length, match.end + WINDOW);
  const window = text.slice(start, end).toLowerCase();
  for (const { token } of HEDGING_TOKENS) {
    if (window.includes(token.toLowerCase())) return true;
  }
  for (const phrase of SPECULATIVE_ONLY_HEDGES) {
    if (window.includes(phrase)) return true;
  }
  // Sentence-scope: [inference] and [web-N] are sentence-level
  // attribution markers, not phrase-level hedges, so they get the
  // wider scope.
  const sentence = (() => {
    const b = sentenceBoundsAt(text, match.index);
    return text.slice(b.start, b.end);
  })();
  if (sentence.toLowerCase().includes("[inference]")) return true;
  if (/\[web-\d+\]/.test(sentence)) return true;
  return false;
}

/**
 * Lint the speculative block.
 *
 * @param block          The speculative block string (raw, as the model
 *                       emitted it; the orchestrator does no trimming).
 * @param factPack       The fact pack the synthesis run consumed. Used to
 *                       know which numbers are "anchored" (don't need
 *                       hedging) vs. inferred (do).
 */
export function lintSpeculativeBlock(
  block: string,
  factPack: CorridorFactPack,
): SpeculativeLintResult {
  const errors: string[] = [];

  if (typeof block !== "string") {
    return {
      ok: false,
      errors: ["speculative_block must be a string."],
    };
  }

  const trimmed = block.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      errors: ["speculative_block is empty."],
    };
  }

  // Rule 1: trailing verbatim disclaimer.
  if (!trimmed.endsWith(SPECULATIVE_DISCLAIMER)) {
    errors.push(
      `requires-speculative-disclaimer: block must end with verbatim string ` +
        `"${SPECULATIVE_DISCLAIMER}".`,
    );
  }

  // Rule 2: every non-anchored number needs a nearby hedge.
  const anchors = collectFactPackNumbers(factPack);
  // Strip the disclaimer before scanning so its literal "double-check" /
  // punctuation doesn't get tokenized as a hedge target.
  const scannable = trimmed.endsWith(SPECULATIVE_DISCLAIMER)
    ? trimmed.slice(0, trimmed.length - SPECULATIVE_DISCLAIMER.length)
    : trimmed;
  const numbers = findNumbers(scannable);
  for (const n of numbers) {
    if (isAnchored(n.value, anchors)) continue;
    if (hasNearbyHedge(scannable, n)) continue;
    errors.push(
      `requires-hedging-around-inference: inferred number "${n.raw}" ` +
        `(value ${n.value}) appears without a hedging token nearby ` +
        `(window ±60 chars). Use a token from smoothing-tokens.mts or one ` +
        `of: ${SPECULATIVE_ONLY_HEDGES.slice(0, 4).join(", ")}, ... — or ` +
        `mark the claim [inference].`,
    );
  }

  return { ok: errors.length === 0, errors };
}
