import type { BakeInputs } from "./types";

/**
 * ONE prompt root for every surface's narrative bake (spec §One root #3).
 * A wording or rule change here propagates to all surfaces on their next
 * bake — never fork this per surface.
 */

export const NARRATIVE_MAX_TOKENS = 1400;

export function buildNarrativePrompt(inputs: BakeInputs): { system: string; user: string } {
  const placeName = inputs.place ? `${inputs.place} (${inputs.key})` : inputs.key;
  const system = [
    "You write short market reads for a Southwest Florida data site. Plain English for a",
    "curious local reader — no hype, no hedging on hard numbers, no internal jargon of any",
    "kind (never words like pack, brain, tier, freshness, or section symbols).",
    "",
    "HARD RULES:",
    "1. Use ONLY the figures provided below, each restated verbatim (same digits, same",
    "   rounding). Never compute, add, subtract, total, average, or round a NEW number —",
    "   not even from two provided figures. If a number isn't in the list, don't write it.",
    "2. State the as-of date exactly once in the narration, formatted exactly as given.",
    "   For any other time reference use 'a year ago', 'now', or 'currently' — NEVER write a",
    "   bare calendar year (like 2022 or 2025) unless it appears in the figures below.",
    "3. Narration: 2–3 short paragraphs, ABOUT 200 WORDS (1,100–1,400 characters), on what",
    "   most sets this area apart right now and what just moved, weaving the strongest",
    "   signals together. Conversational, concrete, zero filler. This same read is what a",
    "   reader gets in their inbox, so it must stand on its own.",
    "4. Outlook: 1–3 items looking down the road. Each item's text MUST begin with",
    '   "[INFERENCE]", use hedged language (could / may / would / watch), and rest on one',
    "   provided figure. Each item carries: text, base (COPY the exact provided figure,",
    "   including its number, that this rests on — base must contain that number verbatim),",
    "   falsifier (one concrete observation that would prove it wrong). Produce only as many",
    "   items as you have DISTINCT provided figures to rest on — one strong numeric item is",
    "   better than three; never pad with an item whose base has no number.",
    "5. Respond with STRICT JSON only, no markdown fences:",
    '   {"narration": string, "outlook": [{"text": string, "base": string, "falsifier": string}]}',
  ].join("\n");

  const factLines = inputs.facts.map((f) => {
    const bits = [`${f.label}: ${f.display}`];
    if (f.sub) bits.push(f.sub);
    if (f.why) bits.push(f.why);
    bits.push(`(source: ${f.source})`);
    return `- ${bits.join(" · ")}`;
  });

  const user = [
    `Area: ${placeName}${inputs.county ? `, ${inputs.county} County, Florida` : ""}`,
    `As-of date (state once, exactly as written): ${inputs.asOf ?? "not available — omit any date"}`,
    "",
    "FIGURES (the complete allowed set):",
    ...factLines,
    "",
    inputs.context.length
      ? "BACKGROUND (already-published context, cite no new numbers from memory):"
      : "",
    ...inputs.context.map((c) => `- ${c}`),
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}
