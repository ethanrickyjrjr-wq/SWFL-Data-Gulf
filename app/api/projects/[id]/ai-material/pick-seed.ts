// Maps a free-text intent to a SEED_DOCS id. First match wins; default market-spotlight.
const RULES: { id: string; words: string[] }[] = [
  { id: "just-sold", words: ["sold", "closed", "under contract"] },
  {
    id: "listing-feature",
    words: ["listing", "listed", "for sale", "open house", "new on market"],
  },
  { id: "welcome", words: ["welcome", "subscribe", "subscriber", "onboard"] },
  { id: "market-letter", words: ["update", "letter", "this month", "newsletter", "monthly"] },
  { id: "market-spotlight", words: ["spotlight", "stats", "numbers", "snapshot"] },
];

export function pickSeedId(intent: string): string {
  const t = (intent ?? "").toLowerCase();
  for (const r of RULES) if (r.words.some((w) => t.includes(w))) return r.id;
  return "market-spotlight";
}
