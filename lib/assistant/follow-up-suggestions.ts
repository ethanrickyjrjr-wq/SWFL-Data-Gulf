// suggestFollowUps — static, zero-latency follow-up chips shown under a completed
// chat answer (BriefcaseChat). No LLM call: topic-keyword matched off the question
// AND the answer that produced it, same doctrine as lib/highlighter/suggestions.ts
// (never definitional — don't assume the user doesn't know what a term means).
// Purely additive UI — a miss (no topic matched) still returns the generic set, so
// a follow-up row always renders once an answer completes.
//
// Matching the answer text (not just the question) matters because the chips
// themselves get fed back in: clicking a GENERIC_FOLLOW_UPS chip resubmits its own
// literal text as the next "question" ("What's driving this?" etc contain no topic
// keyword by design), so question-only matching can never escape the generic bucket
// once it's hit, no matter how specific the conversation has become.

const TOPIC_FOLLOW_UPS: Array<{ keywords: RegExp; chips: string[] }> = [
  {
    keywords: /\b(flood|insurance|aal|nfip|storm|surge|hurricane)\b/i,
    chips: [
      "How does this compare to nearby ZIPs?",
      "What's the flood-risk trend over time?",
      "Chart this by ZIP",
    ],
  },
  {
    keywords: /\b(commercial|office|retail|industrial|cap rate|cre|absorption|vacancy)\b/i,
    chips: [
      "How does vacancy compare across corridors?",
      "What's the asking-rent trend?",
      "Chart this by corridor",
    ],
  },
  {
    keywords: /\b(permit|construction|build(?:ing|s)?|new homes?)\b/i,
    chips: [
      "What's driving the permit activity?",
      "How does this compare to last quarter?",
      "Chart permits by area",
    ],
  },
  {
    keywords: /\b(rent|rental|lease|asking rent|zori)\b/i,
    chips: [
      "How does this compare to home prices?",
      "What's the rent trend?",
      "Chart rents by ZIP",
    ],
  },
  {
    keywords: /\b(job|jobs|wage|wages|employ|labor|workforce)\b/i,
    chips: [
      "What sectors are hiring most?",
      "How does this compare to the state?",
      "What's the wage trend?",
    ],
  },
  {
    keywords: /\b(tourism|tourist|hotel|hospitality|tdt|visitor)\b/i,
    chips: [
      "How does this compare to last season?",
      "What's driving visitor numbers?",
      "Chart this by month",
    ],
  },
  {
    keywords: /\b(price|value|zhvi|valuation|home price|sale price|market heat|listing)\b/i,
    chips: ["How does this compare to last year?", "Show me this by ZIP", "What's driving this?"],
  },
];

const GENERIC_FOLLOW_UPS = [
  "What's driving this?",
  "How does this compare to nearby areas?",
  "What should I watch next?",
];

/** Up to 3 follow-up chips for the answer to `question`. `answer` is the assistant's
 *  reply text — pass it so topic drift the answer surfaces (e.g. a generic question
 *  that got a flood-risk answer) still matches, instead of only matching the question
 *  that triggered it. Deterministic, no model call, never empty — falls to
 *  GENERIC_FOLLOW_UPS when neither matched a topic keyword. */
export function suggestFollowUps(question: string, answer?: string): string[] {
  const haystack = [question, answer].filter((s): s is string => typeof s === "string").join(" ");
  if (!haystack) return GENERIC_FOLLOW_UPS;
  for (const { keywords, chips } of TOPIC_FOLLOW_UPS) {
    if (keywords.test(haystack)) return chips;
  }
  return GENERIC_FOLLOW_UPS;
}
