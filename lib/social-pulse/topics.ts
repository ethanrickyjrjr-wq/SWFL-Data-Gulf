// lib/social-pulse/topics.ts
// v1 caption topic buckets (spec §2). Deterministic keyword rules, first match wins.
export type PulseTopic =
  | "waterfront"
  | "new-construction"
  | "open-house"
  | "market-stats"
  | "lifestyle"
  | "listing-tour"
  | "other";

export const TOPIC_LABELS: Record<PulseTopic, string> = {
  waterfront: "Waterfront & canal",
  "new-construction": "New construction",
  "open-house": "Open house",
  "market-stats": "Market stats",
  lifestyle: "Lifestyle & community",
  "listing-tour": "Listing tours",
  other: "Other",
};

const RULES: [PulseTopic, RegExp][] = [
  ["waterfront", /\b(waterfront|gulf[- ]access|canal|dock|boat|sailboat|intersecting)\b/i],
  ["new-construction", /\b(new construction|new build|spec home|builder|under construction|CO)\b/i],
  ["open-house", /\bopen house\b/i],
  [
    "market-stats",
    /\b(median|market (update|report|stats)|inventory|days on market|price(s)? (rose|fell|dropped))\b/i,
  ],
  ["lifestyle", /\b(beach(es)?|sunset|lifestyle|living|community|downtown|farmers market)\b/i],
  ["listing-tour", /\b(just listed|new listing|walkthrough|tour|listed at)\b/i],
];

export function classifyTopic(caption: string | null): PulseTopic {
  if (!caption) return "other";
  for (const [topic, re] of RULES) if (re.test(caption)) return topic;
  return "other";
}
