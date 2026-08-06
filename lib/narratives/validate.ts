import type { BakeInputs, NarrativeSectionsData } from "./types";
import { lengthProfile } from "./length";

/**
 * Deterministic gates a baked narrative must clear before its row is written
 * (spec §Phase B quality gate). A failed bake keeps the previous row — same
 * failure posture as brains. The load-bearing rule is the no-invention lint:
 * every numeric token in the output must already exist somewhere in the
 * supplied inputs.
 */

/** Numeric tokens, comma-stripped: "1,204" → "1204"; "$485K" → "485". */
export function numericTokens(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((t) => t.replace(/,/g, ""));
}

/**
 * Same VALUE, one spelling. Strips a decimal tail that carries no information:
 * "3.0" → "3", "3.50" → "3.5", "300000" → "300000".
 *
 * This is deliberately the ONLY notation liberty taken. It does NOT round: an
 * input of "1.04" canonicalizes to "1.04", so a narrative writing "1.0" still
 * fails, which is correct — that is a different number (validate-scale.test.ts
 * B3). Measured 08/06/2026: of 11 real bake failures, 3 were pure notation and
 * 8 were rounding or arithmetic. Only the notation cases are absorbed here.
 */
export function canonicalNumber(token: string): string {
  if (!token.includes(".")) return token;
  const trimmed = token.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" ? token : trimmed;
}

/** `$637K` → 637000, `$89M` → 89000000. Fires ONLY when the suffix is literally
 *  present in the source text, so a bare count of 300 never licenses 300,000. */
const SCALED = /(\d[\d,]*(?:\.\d+)?)\s*([KkMm])\b/g;
function scaleExpansions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SCALED)) {
    const n = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const mult = m[2]!.toLowerCase() === "k" ? 1_000 : 1_000_000;
    out.push(String(n * mult));
  }
  return out;
}

export function buildNumberWhitelist(inputs: BakeInputs): Set<string> {
  const allow = new Set<string>();
  const feed = (s: string | null | undefined) => {
    if (!s) return;
    for (const t of numericTokens(s)) {
      allow.add(t);
      allow.add(canonicalNumber(t));
    }
    // A "$300K" bucket label legitimately licenses "$300,000" in prose.
    for (const e of scaleExpansions(s)) allow.add(e);
  };
  for (const f of inputs.facts) {
    feed(f.label);
    feed(f.display);
    feed(f.sub);
    feed(f.why);
    feed(f.source);
  }
  for (const line of inputs.context) feed(line);
  feed(inputs.asOf);
  feed(inputs.key);
  feed(inputs.place);
  feed(inputs.county);
  return allow;
}

const HEDGE = /\b(could|may|might|would|if|watch|likely|unless)\b/i;
/** Internal-noun leak guard — narrative prose never names the machinery. */
const JARGON = /(§|\bpack\b|\bbrains?\b|freshness[_ ]token|SWFL-[A-Z-]*\d{8})/i;

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) n++;
  return n;
}

/** Returns [] when clean; otherwise every violation found (never throws). */
export function validateNarrative(data: NarrativeSectionsData, inputs: BakeInputs): string[] {
  const errors: string[] = [];
  const allow = buildNumberWhitelist(inputs);
  const checkNumbers = (text: string, where: string) => {
    for (const t of numericTokens(text)) {
      if (allow.has(t) || allow.has(canonicalNumber(t))) continue;
      errors.push(`${where}: number "${t}" not present in inputs (invented)`);
    }
  };

  const narration = data.narration ?? "";
  const len = lengthProfile(inputs.surface);
  if (narration.length < len.minChars || narration.length > len.maxChars) {
    errors.push(`narration: length ${narration.length} outside ${len.minChars}–${len.maxChars}`);
  }
  if (inputs.asOf) {
    const n = occurrences(narration, inputs.asOf);
    if (n !== 1)
      errors.push(`narration: as-of date "${inputs.asOf}" appears ${n}× (must be exactly once)`);
  }
  checkNumbers(narration, "narration");
  if (JARGON.test(narration)) errors.push("narration: internal jargon leaked");

  const outlook = data.outlook ?? [];
  if (outlook.length < 1 || outlook.length > 3) {
    errors.push(`outlook: ${outlook.length} items outside 1–3`);
  }
  outlook.forEach((item, i) => {
    const at = `outlook[${i}]`;
    if (!item.text?.includes("[INFERENCE]")) errors.push(`${at}: missing [INFERENCE] tag`);
    if (item.text && !HEDGE.test(item.text)) errors.push(`${at}: no hedge language`);
    if (!item.base || numericTokens(item.base).length === 0) {
      errors.push(`${at}: base must restate a held figure`);
    }
    if (!item.falsifier || item.falsifier.trim().length < 20) {
      errors.push(`${at}: falsifier missing or too thin`);
    }
    for (const field of [item.text, item.base, item.falsifier]) {
      if (field && JARGON.test(field)) errors.push(`${at}: internal jargon leaked`);
    }
    if (item.text) checkNumbers(item.text, `${at}.text`);
    if (item.base) checkNumbers(item.base, `${at}.base`);
  });

  return errors;
}
