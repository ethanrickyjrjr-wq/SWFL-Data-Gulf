import type { BakeInputs, NarrativeSectionsData } from "./types";

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

export function buildNumberWhitelist(inputs: BakeInputs): Set<string> {
  const allow = new Set<string>();
  const feed = (s: string | null | undefined) => {
    if (s) for (const t of numericTokens(s)) allow.add(t);
  };
  for (const f of inputs.facts) {
    feed(f.label);
    feed(f.display);
    feed(f.sub);
    feed(f.why);
  }
  for (const line of inputs.context) feed(line);
  feed(inputs.asOf);
  feed(inputs.key);
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
      if (!allow.has(t)) errors.push(`${where}: number "${t}" not present in inputs (invented)`);
    }
  };

  const narration = data.narration ?? "";
  if (narration.length < 300 || narration.length > 2000) {
    errors.push(`narration: length ${narration.length} outside 300–2000`);
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
