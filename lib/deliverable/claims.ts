// lib/deliverable/claims.ts
//
// THE CLAIM GATE.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// On 07/13/2026 seven independent workers built seven deliverables. Four shipped a
// falsehood to the rendered artifact, and their authors had each "verified it by eye".
// The falsehoods:
//
//   market-comps    "$209/sq ft sits just BELOW the $213 median — and below the two
//                    recorded sales, which closed at $173 and $195."   ($209 is ABOVE both.)
//   under-contract  "went under contract after 75 days on market"      (no source holds
//                    a days-to-contract interval; the vendor's DOM was NULL)
//                   "the seller had reduced the price BEFORE a contract was reached"
//                    (we hold a cut AMOUNT — no cut date, no contract date, no ordering)
//   sphere-weekly   "the gap is widening"                              (given ONE national
//                    LEVEL and no trend at all)
//   market-pulse    "five of those six ZIPs"                           (the true count was four)
//   market-comps    "on the same street"                               (we hold no street
//                    relationship — only "nearby")
//
// LOOK AT WHAT THEY HAVE IN COMMON: **NOT ONE OF THEM CONTAINS AN INVENTED NUMBER.**
// Every underlying figure was correctly sourced. What was invented was the CLAIM DRAWN
// BETWEEN correctly-sourced numbers.
//
// Our no-invention lint tokenizes DIGITS. But invention is not number-shaped — it is
// CLAIM-shaped. A comparison, a trajectory, a count, a sequence of events, a spatial
// relationship: each is a hard, falsifiable, factual assertion, and each one sails
// straight through a digit lint because there is nothing numeric in it to catch.
//
// ── WHY A BANNED-WORD LIST IS NOT THE FIX ──────────────────────────────────
//
// It was tried and it lost. market-comps banned the word "street" — and the model wrote
// "on Shore Dr". A prompt that said "if the ask sits above the set, do not hide it" was
// answered by a model that hid it by asserting the opposite. You cannot enumerate your
// way out of natural language.
//
// ── THE MECHANISM: THE NARRATOR IS NEVER GIVEN ANYTHING TO COMPARE ─────────
//
// The fix is structural, not lexical:
//
//   1. CODE computes the relation, the count, the trajectory, the ordering.
//   2. The narrator receives the RESULT as a settled English sentence.
//   3. The narrator receives NO raw pair, NO raw set, NO row list — nothing it could
//      draw a NEW relation from. It cannot compare two numbers it was never given two of.
//   4. The lint is a FAIL-CLOSED BACKSTOP, not the primary defense. On any hit the
//      paragraph is dropped to an OPEN SLOT — never shipped, never "best-effort".
//
// The done-condition is greppable and structural: **the narrator receives no raw set.**
// It is not "a verifier didn't find anything" — that recursion never terminates.
//
// Liftable on purpose: the SOCIAL path has NO no-invention gate of any kind today
// (`stat.value` is a free-text field the model writes), and it is the same hole.

/** A relation computed IN CODE and handed to the narrator as a settled fact. */
export interface SettledClaim {
  /** The English sentence the narrator may restate. It may not derive another. */
  sentence: string;
  /** Every numeral appearing in `sentence` — these become the anchor allow-set. */
  anchors: string[];
}

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/**
 * Compare a subject value against a set — IN CODE. Returns the settled sentence.
 *
 * THIS IS THE FUNCTION market-comps NEEDED. Its narrator was handed the subject's
 * $209/sq ft and a list of comps and asked to make the case; it asserted the ask sat
 * "below" sales it was 7% and 21% ABOVE, inverting the entire argument of a
 * price-defense email. Every number in that sentence was correctly sourced.
 *
 * A COMPARISON IS A FACTUAL CLAIM. The narrator does not get to make one.
 */
export function compareToSet(
  subject: number,
  set: readonly number[],
  opts: { unit?: "usd" | "raw"; noun: string },
): SettledClaim | null {
  const values = set.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!Number.isFinite(subject) || subject <= 0 || values.length === 0) return null;

  const fmt = (n: number) => (opts.unit === "usd" ? usd(n) : String(Math.round(n)));
  const lo = values[0];
  const hi = values[values.length - 1];
  const above = values.filter((v) => v < subject).length;
  const below = values.filter((v) => v > subject).length;

  // The relation is decided by integer comparison. There is no room for a model here.
  let sentence: string;
  if (above === values.length) {
    sentence = `The ${opts.noun} is above every comparable in the set (which run from ${fmt(lo)} to ${fmt(hi)}).`;
  } else if (below === values.length) {
    sentence = `The ${opts.noun} is below every comparable in the set (which run from ${fmt(lo)} to ${fmt(hi)}).`;
  } else {
    sentence =
      `The ${opts.noun} sits inside the range of the set (${fmt(lo)} to ${fmt(hi)}), ` +
      `above ${above} of ${values.length} and below ${below}.`;
  }
  return { sentence, anchors: numeralsIn(sentence) };
}

/**
 * A count, computed in code. THIS IS THE FUNCTION market-pulse NEEDED — its narrator
 * wrote "five of those six ZIPs" over a set whose true answer was four. A word-count
 * carries no digits, so a digit lint sails straight past it.
 */
export function settledCount(
  matching: number,
  total: number,
  opts: { noun: string; predicate: string },
): SettledClaim {
  const sentence =
    matching === total
      ? `All ${total} ${opts.noun} ${opts.predicate}.`
      : `${matching} of ${total} ${opts.noun} ${opts.predicate}.`;
  return { sentence, anchors: numeralsIn(sentence) };
}

/** Every numeral in a string — the anchor set a narrator's digits are checked against. */
export function numeralsIn(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]$/, ""));
}

// ── THE FAIL-CLOSED BACKSTOP ───────────────────────────────────────────────
//
// Structure is the defense; this is the net under it. It does NOT try to enumerate
// natural language — it flags the SHAPES of assertion that our sources cannot support,
// and on any hit the caller drops the paragraph to an OPEN SLOT rather than shipping it.

/** A COMPARISON between two quantities. Each of these is a falsifiable factual claim,
 *  and it is FALSE if the arithmetic says otherwise — even when both numbers are
 *  perfectly sourced. This is the class that inverted market-comps' entire argument.
 *
 *  PRECISION MATTERS HERE, in both directions. A gate that fires on "a pool UNDER a
 *  covered lanai" drops an honest paragraph and the deliverable ships with a hole; a
 *  gate that misses "below the $213 median" ships a lie. So a positional word only
 *  counts as a COMPARISON when it actually relates a QUANTITY: a numeral, a currency
 *  or percent sign, or a comparison noun within the same clause. */
const QUANTITY = String.raw`(\$|\d|%|\bmedian\b|\baverage\b|\bmean\b|\bcomparable|\bcomps?\b|\bthe (set|rest|others|others')\b|\bask(ing)?\b|\bprice|\bsales?\b|\blistings?\b|\bmarket\b)`;
const COMPARATIVE_QUANT = new RegExp(
  String.raw`\b(above|below|under|over|beneath|exceeds?|higher than|lower than|more than|less than|cheaper than|pricier than)\b[^.!?]{0,40}?` +
    QUANTITY,
  "i",
);
/** Superlatives and relational phrases are comparisons on their own — no number needed. */
const COMPARATIVE_PHRASE =
  /\b(in line with|on par with|at the (low|high) end|out(performs?|paces?)|trails?|lags? behind|the (largest|smallest|biggest|highest|lowest|priciest|cheapest)\b)/i;

/** A TRAJECTORY — a claim about MOVEMENT over time. sphere-weekly asserted the gap was
 *  "widening" when it had been given exactly one national LEVEL and no trend at all.
 *  A level is not a direction. You cannot see motion in a single point. */
const TRAJECTORY =
  /\b(widening|narrowing|shrinking|growing|rising|falling|climbing|dropping|accelerat\w+|slow(ing|ed)|cooling|heating|reversing|rebound\w*|recover\w+|trending|momentum|picking up|tapering|steady(ing)?|flattening|stabiliz\w+)\b/i;

/** A COUNT stated in WORDS — the digit lint's blind spot by construction.
 *  market-pulse: "five of those six ZIPs" over a set whose true answer was four. */
const WORD_COUNT =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|most|majority|all|none|every|each|both|several|many|few)\s+(of\s+)?(the\s+|those\s+|these\s+)?\w*\s*(zips?|homes?|sales?|listings?|comps?|properties|areas?|neighborhoods?|of them)\b/i;

/** A SEQUENCE of events. under-contract asserted the price was cut "BEFORE a contract
 *  was reached" — we hold a cut AMOUNT and nothing else. No cut date, no contract date,
 *  no ordering. An invented ordering is an invented fact.
 *
 *  Scoped to MARKET EVENTS, so ordinary prose ("the primary suite sits just after the
 *  entry") doesn't cost us an honest paragraph. What we're stopping is a claimed
 *  ordering of things that happen to a LISTING. */
const MARKET_EVENT = String.raw`(contract|offer|bid|sale|sold|clos\w+|listed|listing|reduc\w+|cut|price\b|pending|under contract|market|showing|open house)`;
const SEQUENCE = new RegExp(
  String.raw`\b(before|after|since|once|following|prior to|led to|resulted in|which prompted|caused|drove|triggered|as a result|consequently)\b[^.!?]{0,40}?` +
    MARKET_EVENT,
  "i",
);

/** A SPATIAL relationship. "nearby" is the ONLY location claim the vendor's nearby
 *  endpoint supports. market-comps wrote "on the same street" — and beat a ban on the
 *  WORD "street" by writing "on Shore Dr". So match the SUFFIXES, not the noun. */
const SPATIAL =
  /\b(same street|this street|the same block|next door|across the street|down the road|same (neighborhood|community|subdivision))\b|\bon [A-Z][a-z]+ (Dr|Drive|Blvd|Boulevard|Ln|Lane|Ct|Court|Rd|Road|Ave|Avenue|Way|Ter|Terrace|Cir|Circle|Pl|Place)\b/;

/** A MOTIVE or an intention. We never hold why a seller did anything. under-contract's
 *  ancestor wrote "the builder has now committed to" a price; price-reduced's wrote
 *  "the seller is serious". Neither is a fact about a house. */
const MOTIVE =
  /\b(seller is|sellers are|owner is|builder has|motivated|serious|eager|anxious|willing to|hoping to|looking to|wants? to|committed to|priced to (move|sell)|won'?t last|rare opportunity|act (fast|now)|don'?t miss)\b/i;

export interface ClaimViolation {
  kind:
    | "comparative"
    | "trajectory"
    | "word-count"
    | "sequence"
    | "spatial"
    | "motive"
    | "unanchored-number";
  match: string;
}

/**
 * FAIL-CLOSED. Returns every unsupported claim shape in the narrator's prose.
 *
 * `settled` is the set of code-computed sentences the narrator was handed. A claim
 * shape appearing INSIDE a settled sentence is legitimate — code asserted it. The same
 * shape appearing anywhere else is the model deriving a NEW relation, which it may not do.
 *
 * A non-empty result means: DO NOT SHIP THIS PARAGRAPH. Drop it to an open slot. A
 * missing paragraph is honest; a confident false one is not.
 */
export function auditClaims(prose: string, settled: readonly SettledClaim[]): ClaimViolation[] {
  const out: ClaimViolation[] = [];
  const settledText = settled.map((s) => s.sentence.toLowerCase()).join("   ");
  const allowedNumerals = new Set(settled.flatMap((s) => s.anchors));

  // Check sentence by sentence, so a settled sentence the narrator restated verbatim
  // does not condemn the paragraph it appears in.
  for (const raw of prose.split(/(?<=[.!?])\s+/)) {
    const s = raw.trim();
    if (!s) continue;
    // A sentence that IS one of the settled facts (or a close restatement) is fine —
    // code authored that claim, and restating it is the narrator's actual job.
    if (settledText.includes(s.toLowerCase().replace(/[.!?]+$/, ""))) continue;

    const checks: [ClaimViolation["kind"], RegExp][] = [
      ["comparative", COMPARATIVE_QUANT],
      ["comparative", COMPARATIVE_PHRASE],
      ["trajectory", TRAJECTORY],
      ["word-count", WORD_COUNT],
      ["sequence", SEQUENCE],
      ["spatial", SPATIAL],
      ["motive", MOTIVE],
    ];
    for (const [kind, re] of checks) {
      const m = re.exec(s);
      if (m) out.push({ kind, match: m[0] });
    }

    // Any numeral the narrator wrote that no settled fact contains is unanchored.
    for (const n of numeralsIn(s)) {
      if (!allowedNumerals.has(n)) out.push({ kind: "unanchored-number", match: n });
    }
  }
  return out;
}

/**
 * The prohibition, printed into the narrator's system prompt. Keep this and `auditClaims`
 * in lockstep: the model is TOLD the exact rule the lint enforces, so a violation is a
 * refusal to follow an explicit instruction rather than a surprise.
 */
export const CLAIM_PROHIBITION =
  `YOU MAY NOT DRAW A CONCLUSION. You may only restate what you were given.\n\n` +
  `Specifically, you may NOT write:\n` +
  `- A COMPARISON. Not "above", "below", "in line with", "the highest", "at the low end". ` +
  `Any relation between two quantities has ALREADY been computed for you and handed to you ` +
  `as a settled fact. If you want to say one number relates to another, you may only ` +
  `restate the settled sentence that says so. You cannot compare two numbers — you were ` +
  `not given two to compare.\n` +
  `- A TRAJECTORY. Not "widening", "cooling", "rebounding", "picking up". A single value is ` +
  `a LEVEL, not a DIRECTION. You cannot see movement in one point in time.\n` +
  `- A COUNT. Not "five of the six", not "most of them", not "all". Counts are computed for ` +
  `you. Never count anything yourself.\n` +
  `- A SEQUENCE. Not "before", "after", "which led to". We know WHAT happened, almost never ` +
  `in WHAT ORDER. An invented ordering is an invented fact.\n` +
  `- A LOCATION relationship. "Nearby" is the only one we hold. Never "on the same street", ` +
  `never a road name.\n` +
  `- A MOTIVE. You never know why anyone did anything. Not "the seller is motivated", not ` +
  `"priced to move", not "won't last". Those are your words, not facts.\n\n` +
  `Every number you write must appear verbatim in the facts you were given. If a sentence ` +
  `needs something you were not given, CUT THE SENTENCE. A shorter true paragraph beats a ` +
  `longer one that guesses.`;
