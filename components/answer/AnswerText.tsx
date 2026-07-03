import { Fragment } from "react";

/**
 * Three alternatives, tried in this order so a whole "protected" token is
 * consumed in one match instead of leaving interior digits exposed to a
 * fresh (wrong) match attempt when the first attempt's lookahead fails and
 * the scanner backtracks one character at a time:
 *   1. DATE       — a full MM/DD/YYYY as-of date (07/01/2026). Consuming the
 *                   whole thing in one shot is what stops "2026" from
 *                   re-matching starting at its 2nd digit once the leading
 *                   "/" blocks the 1st.
 *   2. MIXED_ALNUM — an alnum run containing BOTH a letter and a digit
 *                   (3yr, Q4, FY2025). Same reasoning: consume the whole
 *                   run so "4" in "Q4" or "2025" in "FY2025" never becomes
 *                   its own match.
 *   3. NUMBER      — currency ($300k, $1,234.56), percentage (43.2%,
 *                   -8.86%), or a plain comma/decimal number (30,551,
 *                   65.3, -0.9). This is the only alternative that highlights.
 */
const TOKEN_PATTERN =
  /(\d{1,2}\/\d{1,2}\/\d{4})|((?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]+)|(\$\d[\d,]*(?:\.\d+)?[kKmMbB]?|-?\d[\d,]*(?:\.\d+)?%|-?\d[\d,]*(?:\.\d+)?)/g;

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
    const [full, dateMatch, mixedAlnumMatch] = m;
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
 * Renders answer/narrative text with every numeric figure in the brand teal.
 * One shared component so every answer surface (chat, /ask, /r pages, alerts,
 * project workspace) highlights numbers the same way — fix it here, not per
 * surface. Plain string in, inline fragment out; drop it inside whatever
 * wrapper already handles whitespace-pre-wrap.
 */
export function AnswerText({ text }: { text: string }) {
  if (!text) return null;
  const tokens = tokenizeAnswerText(text);
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
