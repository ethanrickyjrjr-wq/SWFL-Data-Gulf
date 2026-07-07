import { Fragment } from "react";

/**
 * Five alternatives, tried in this order so a whole "protected" or "grouped"
 * token is consumed in one match instead of leaving interior digits exposed
 * to a fresh match attempt when an earlier attempt's lookahead fails and the
 * scanner backtracks one character at a time:
 *   1. DATE        — a full MM/DD/YYYY as-of date (07/01/2026). Consuming the
 *                    whole thing in one shot is what stops "2026" from
 *                    re-matching starting at its 2nd digit once the leading
 *                    "/" blocks the 1st. Not highlighted — as-of dates are
 *                    stated plainly, not decorated.
 *   2. MONTH_DATE  — a spelled-out narrative date ("August 2025",
 *                    "December 5, 2026"). Highlighted as ONE unit so month
 *                    and day/year never split into two colors (07/07/2026
 *                    operator screenshot: month white, year teal).
 *   3. MIXED_ALNUM — an alnum run containing BOTH a letter and a digit
 *                    (3yr, Q4, FY2025). Not highlighted — consumes the whole
 *                    run so "4" in "Q4" or "2025" in "FY2025" never becomes
 *                    its own match.
 *   4. ENTITY_NUM  — a capitalized word directly followed by a short bare
 *                    integer ("High 5", "Phase 2"). Highlighted as ONE unit
 *                    for the same reason as MONTH_DATE — same screenshot
 *                    showed "High" white next to a teal "5". The number must
 *                    stand alone (not fused to a letter, not the start of a
 *                    comma-grouped or decimal number, i.e. not "Lee 22,484"
 *                    or "Trailing 3yr") or this alternative doesn't match,
 *                    leaving the plain NUMBER alternative to catch it normally.
 *   5. NUMBER      — currency ($300k, $1,234.56), percentage (43.2%,
 *                    -8.86%), or a plain comma/decimal number (30,551,
 *                    65.3, -0.9), plus an optional trailing magnitude/unit
 *                    word ("$27 million", "40,000 square feet",
 *                    "75,910-square-foot") consumed into the SAME highlight
 *                    — same split-color bug as MONTH_DATE/ENTITY_NUM, just on
 *                    the trailing side. Closed unit list on purpose: unlike
 *                    the number itself, "which trailing word is a unit" has
 *                    no clean grammatical test, so this only covers the
 *                    magnitude/measurement words actually seen in narrative
 *                    answers, not general nouns ("permits", "listings").
 *                    Highlighted.
 */
const MONTH_NAMES =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const UNIT_SUFFIX = String.raw`(?:[ -](?:million|billion|thousand|percent|square[ -]feet|square[ -]foot|sq\.?[ -]?ft\.?|acres?))?`;
const TOKEN_PATTERN = new RegExp(
  String.raw`(\d{1,2}\/\d{1,2}\/\d{4})` +
    String.raw`|((?:${MONTH_NAMES})\s+(?:\d{1,2},\s+)?\d{4})` +
    String.raw`|((?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]+)` +
    String.raw`|([A-Z][a-zA-Z]*\s+\d{1,2}(?!\d)(?![A-Za-z])(?!\.\d)(?!,\d))` +
    String.raw`|(?:\$\d[\d,]*(?:\.\d+)?[kKmMbB]?|-?\d[\d,]*(?:\.\d+)?%|-?\d[\d,]*(?:\.\d+)?)${UNIT_SUFFIX}`,
  "g",
);

export interface AnswerTextToken {
  text: string;
  highlight: boolean;
}

/**
 * Pure tokenizer, exported for testing without a DOM environment (this repo
 * has none by design — see components/project/MaterialRow.test.tsx).
 */
export function tokenizeAnswerText(text: string): AnswerTextToken[] {
  const tokens: AnswerTextToken[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(TOKEN_PATTERN)) {
    const start = m.index;
    const [full, dateMatch, , mixedAlnumMatch] = m;
    if (start > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, start), highlight: false });
    }
    tokens.push({ text: full, highlight: !dateMatch && !mixedAlnumMatch });
    lastIndex = start + full.length;
  }
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), highlight: false });
  }
  return tokens;
}

/**
 * Answers are plain text (locked rule) — but when the model disobeys and emits
 * markdown anyway, the markers must not ship raw to users (07/05/2026 prod
 * screenshot: literal `**Housing Market**` on /ask). Structural guarantee at
 * this one root: strip bold/heading/inline-code/blockquote markers, keep the
 * text. Lists are left alone — a leading "- " reads naturally as prose.
 * Streaming note: an unclosed `**pair` stays visible until its closer arrives,
 * then cleans up on the next render — acceptable transient.
 */
export function stripAnswerMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*>\s?/gm, "");
}

/**
 * Renders answer/narrative text with every numeric figure in the brand teal.
 * One shared component so every answer surface (chat, /ask, /r pages, alerts,
 * project workspace) highlights numbers the same way — fix it here, not per
 * surface. Plain string in, inline fragment out; drop it inside whatever
 * wrapper already handles whitespace-pre-wrap.
 */
export function AnswerText({ text }: { text: string }) {
  if (!text) return null;
  const tokens = tokenizeAnswerText(stripAnswerMarkdown(text));
  return (
    <>
      {tokens.map((t, i) =>
        t.highlight ? (
          <span key={i} className="text-gulf-teal font-medium">
            {t.text}
          </span>
        ) : (
          <Fragment key={i}>{t.text}</Fragment>
        ),
      )}
    </>
  );
}
