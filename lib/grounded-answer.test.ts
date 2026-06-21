import { test, expect } from "bun:test";
import {
  buildGroundedSystemPrompt,
  buildFollowupsDirective,
  FORMAT_RULE,
  SPEAK_LINE,
  ANSWER_FIRST,
} from "./grounded-answer";
import { buildGroundingContext, type GroundingBlock } from "@/lib/highlighter/grounding";
import { buildPlaceContext } from "@/lib/place-context";
import { RULES_OF_ENGAGEMENT } from "@/refinery/lib/rules-of-engagement.mts";
import { GEOGRAPHY_GAZETTEER } from "@/refinery/lib/geography-gazetteer.mts";
import type { Dossier } from "@/lib/fetch-brain";

// A minimal grounded block — enough for the assembly to render deterministically.
const dossier: Dossier = {
  freshness_token: "SWFL-7421-v5-20260613",
  conclusion: "SWFL housing is cooling.",
  direction: "bearish",
  magnitude: 0.4,
  confidence: 0.7,
  confidence_dispersion: 0.1,
  joint_integrity: 0.9,
  upstream_count: 3,
  drivers: [],
  key_metrics: [{ metric: "median_price", label: "Median price", value: "$430,000" }],
  detail_tables: [],
  conditional_claims: [],
  grain_boundary: undefined,
  contradicts: [],
  caveats: [],
};
const blocks: GroundingBlock[] = [{ label: "SWFL market data", dossier }];

// GOLDEN: buildGroundedSystemPrompt must equal the exact converse-era assembly
// (placeContext + FORMAT_RULE + buildGroundingContext + SPEAK_LINE + followups).
// Any drift in ordering or a dropped piece fails here — the refactor's safety net.
test("buildGroundedSystemPrompt matches the canonical assembly (golden)", () => {
  const fact = "Median price";
  const question = "what about 34102?";
  const selectionType = "metric";

  const expected =
    buildPlaceContext(`${fact} ${question}`) +
    FORMAT_RULE +
    buildGroundingContext({
      rules: RULES_OF_ENGAGEMENT,
      gazetteer: JSON.stringify(GEOGRAPHY_GAZETTEER, null, 2),
      blocks,
      method: null,
    }) +
    SPEAK_LINE +
    ANSWER_FIRST +
    buildFollowupsDirective(selectionType);

  const actual = buildGroundedSystemPrompt({ fact, question, selectionType, blocks });
  expect(actual).toBe(expected);
});

test("no selection_type → no follow-ups tail (email/dock path)", () => {
  const sys = buildGroundedSystemPrompt({ question: "flood risk in 33931?", blocks });
  expect(sys).not.toContain("⟦FOLLOWUPS⟧");
  // No followups tail → the prompt now ends with the ANSWER_FIRST directive (which sits
  // right after SPEAK_LINE). SPEAK_LINE is still present, just no longer the last line.
  expect(sys).toContain(SPEAK_LINE);
  expect(sys.endsWith(ANSWER_FIRST)).toBe(true);
});

test("place pin fires for a named SWFL ZIP", () => {
  const sys = buildGroundedSystemPrompt({ question: "is 33931 a good buy?", blocks });
  expect(sys).toContain("33931");
  // The freshness token from the block is carried into the grounding.
  expect(sys).toContain("SWFL-7421-v5-20260613");
});
