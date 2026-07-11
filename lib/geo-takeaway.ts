// lib/geo-takeaway.ts — the ONE authority for the GEO quotable-takeaway
// sentence. Both /desk (lib/desk/loaders.ts, re-exported via
// lib/desk/mappers.ts for backward-compat imports) and /r/* report pages
// (app/r/[slug]/page.tsx) call this — do not re-derive it per-consumer.

/**
 * A GEO-optimized quotable one-liner for a figure: answer-first, with the
 * number, its OWN as-of, and the brand — the Cite-Sources + Statistics-Addition
 * shape the Princeton GEO study links to +30-41% AI-citation lift. `scope` is
 * injected ONLY when passed: region figures get "in Southwest Florida"; a
 * national rate (30-yr mortgage) must NOT wear a regional label (geography
 * honesty) — callers signal that via `d.national`/omitting `scope`, never a
 * label-text regex. `d.plural` picks "are" over "is" for a plural subject
 * ("Active listings are…") — also explicit, never inferred. Empty display →
 * empty string (a dead feed never ships a hollow sentence).
 */
export function makeTakeaway(
  d: { label: string; display: string; asOf?: string; sourceLabel: string; plural?: boolean },
  scope?: string,
): string {
  if (!d.display) return "";
  const where = scope ? ` in ${scope}` : "";
  const asOf = d.asOf ? ` as of ${d.asOf}` : "";
  const verb = d.plural ? "are" : "is";
  return `${d.label}${where} ${verb} ${d.display}${asOf}, per ${d.sourceLabel}.`;
}
