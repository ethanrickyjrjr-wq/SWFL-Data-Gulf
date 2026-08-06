/**
 * Per-surface narration length, in ONE place.
 *
 * `prompt.ts` is explicitly "one prompt root for every surface — never fork this
 * per surface", and that rule is worth keeping. But a report-page narration
 * (~200 words) and an email body (50–125 words, docs/standards/emails.md §0 —
 * the FLOOR bites harder than the ceiling) are genuinely different artifacts.
 *
 * So the prompt stays ONE root and takes the length as a parameter, rather than
 * growing a second copy that drifts. The same profile drives the validator, so
 * the length the writer is ASKED for and the length it is JUDGED against can
 * never disagree — that disagreement is its own silent failure mode: a writer
 * told 200 words and validated at 900 chars fails every run for a reason no log
 * line explains.
 */
export interface LengthProfile {
  minChars: number;
  maxChars: number;
  /** Rendered verbatim into the prompt's narration rule. */
  instruction: string;
}

const REPORT: LengthProfile = {
  minChars: 300,
  maxChars: 2000,
  instruction: "2–3 short paragraphs, ABOUT 200 WORDS (1,100–1,400 characters)",
};

const EMAIL: LengthProfile = {
  // 50–125 words ≈ 300–900 characters. The floor is the load-bearing bound:
  // a two-sentence "market read" is the failure this surface exists to avoid.
  minChars: 300,
  maxChars: 900,
  instruction:
    "2 short paragraphs, 50–125 WORDS (300–900 characters) — an email body, not a report",
};

export function lengthProfile(surface: string): LengthProfile {
  return surface === "area-email" ? EMAIL : REPORT;
}
