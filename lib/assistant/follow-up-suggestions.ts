// suggestFollowUps — static, zero-latency follow-up chips shown under a completed
// chat answer (BriefcaseChat). No LLM call: topic-keyword matched off the USER
// question that produced the answer, same doctrine as lib/highlighter/suggestions.ts
// (never definitional — don't assume the user doesn't know what a term means).
// Purely additive UI — a miss (no topic matched) still returns the generic set, so
// a follow-up row always renders once an answer completes.

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

/** Up to 3 follow-up chips for the answer to `question`. Deterministic, no model
 *  call, never empty — falls to GENERIC_FOLLOW_UPS when no topic keyword matched. */
export function suggestFollowUps(question: string): string[] {
  if (!question || typeof question !== "string") return GENERIC_FOLLOW_UPS;
  for (const { keywords, chips } of TOPIC_FOLLOW_UPS) {
    if (keywords.test(question)) return chips;
  }
  return GENERIC_FOLLOW_UPS;
}
