// lib/format-number.ts
//
// THE ONE ROOT for turning a loose numeric string into a display figure.
//
// *** DO NOT WRITE A SECOND withCommas. ***
//
// There were EIGHT of them, counted 08/06/2026: six recipes (under-contract, open-house,
// just-sold, coming-soon, back-on-market, agent-brand-intro) plus lib/email/showing-prep-doc.ts
// and lib/email/listing-flyer.ts. Four different spellings — early-return vs ternary,
// `(n ?? "")` vs `String(n ?? "")` — and all eight returned the same output for every input,
// so nothing had drifted YET. That is the point: eight copies that agree today are eight
// chances to disagree tomorrow, and the copy is always the one nobody updates.
//
// Sibling roots, deliberately NOT merged into this file: `lib/format-date.ts` (dates) and
// `lib/format-metric.ts` (units + magnitudes).

/**
 * Digits of a loose money/number string → a comma-grouped figure. `"1234567"` → `"1,234,567"`,
 * `"$1,234,567"` → `"1,234,567"`.
 *
 * Returns undefined when there is no digit to show, so a caller can leave an honest OPEN SLOT
 * rather than printing a zero it does not hold. Never invents, never rounds, never back-solves —
 * it strips non-digits and regroups, nothing more.
 */
export function withCommas(n?: string | null): string | undefined {
  const digits = String(n ?? "").replace(/[^\d]/g, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : undefined;
}
