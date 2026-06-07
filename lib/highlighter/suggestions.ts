/**
 * Client copy of `suggestionsForMetric` from `refinery/stages/4-output.mts`.
 *
 * Dossier-carried suggestions were deferred (a type-lift on BrainOutput), so
 * the in-page popup derives its suggestion chips on the client. This is a
 * verbatim copy of the refinery body so the two stay identical; when the
 * type-lift lands, both call sites should share this one function. Kept pure
 * (no React/DOM) so it is bun-testable.
 */
export function suggestionsForMetric(
  m: { metric: string; value: string | number },
  slug: string,
): string[] {
  const label = m.metric.replace(/_/g, " ");
  const out = [
    `What's driving ${label}?`,
    `How does ${label} here compare to other SWFL areas?`,
  ];
  if (slug === "housing-swfl")
    out.push(`How does flood risk affect ${label} in this ZIP?`);
  return out.slice(0, 3);
}
