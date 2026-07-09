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
      "Which ZIP is worst off?",
    ],
  },
  {
    keywords: /\b(commercial|office|retail|industrial|cap rate|cre|absorption|vacancy)\b/i,
    chips: [
      "How does vacancy compare across corridors?",
      "What's the asking-rent trend?",
      "Which corridor is tightest?",
    ],
  },
  {
    // The bare verb `build` used to live in this alternation, and this table matches
    // the ANSWER as well as the question — so any answer that offered to "build" a
    // chart manufactured permit chips under a conversation about something else
    // entirely (found live 07/09/2026). Keep `building` / `builds`, never the verb.
    keywords: /\b(permit|construction|building|builds|new homes?)\b/i,
    chips: [
      "What's driving the permit activity?",
      "How does this compare to last quarter?",
      "Which area has the most permits?",
    ],
  },
  {
    keywords: /\b(rent|rental|lease|asking rent|zori)\b/i,
    chips: [
      "How does this compare to home prices?",
      "What's the rent trend?",
      "Which ZIP has the highest rent?",
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
      "Which month is busiest?",
    ],
  },
  {
    // The residential catch-all. Extended (not duplicated) to cover the heat /
    // inventory / momentum vocabulary the router now reaches — a corridor-heat
    // conversation used to fall through to GENERIC_FOLLOW_UPS. A competing rule
    // would have to sit somewhere in this first-match-wins order and would shadow
    // or be shadowed by this one; extending has no ordering risk.
    keywords:
      /\b(price|value|zhvi|valuation|home price|sale price|market heat|listing|tighten(?:ing|ed)?|hotness|hottest|heating up|cooling off|days on market|dom|momentum|inventory)\b/i,
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
