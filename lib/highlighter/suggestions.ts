import type { MethodologyEntry } from "../../refinery/lib/methodology-registry.mts";

/**
 * Client FALLBACK copy of `suggestionsForMetric` from
 * `refinery/stages/4-output.mts`.
 *
 * As of the dossier-suggestions type-lift, the build PRECOMPUTES each metric's
 * suggestions into `BrainOutputMetric.suggestions` and the page carries them to
 * `HighlighterLayer` via `DisplayMetric.suggestions`. The popup prefers those.
 * This client copy is now only the FALLBACK for selections the dossier can't
 * resolve — a prose phrase with no metric row, a value whose row label didn't
 * match, or a brain rendered before the lift. It is a verbatim copy of the
 * refinery body so the two stay identical; kept pure (no React/DOM) so it is
 * bun-testable.
 */
export function suggestionsForMetric(
  m: { metric: string; value: string | number },
  slug: string,
): string[] {
  const label = m.metric.replace(/_/g, " ");
  const out = [`What's driving ${label}?`, `How does ${label} here compare to other SWFL areas?`];
  if (slug === "housing-swfl") out.push(`How does flood risk affect ${label} in this ZIP?`);
  return out.slice(0, 3);
}

/** Span-aware chips. `value` present => offer to break the specific figure down.
 *  `place` present => offer a comparison + a find-the-missing-parts action.
 *  Never definitional ("What is X?") — the doctrine: don't assume the user doesn't know. */
export function suggestionsForSpan(args: {
  entry?: MethodologyEntry | null;
  value?: string | number;
  place?: string;
}): string[] {
  const { entry, value, place } = args;
  const label = entry?.label ?? "this";
  const out: string[] = [];
  if (value != null) out.push(`Break down the ${value}`);
  else out.push(`How is ${label.toLowerCase()} derived?`);
  if (place) out.push(`Compare to Naples`);
  const need = (entry?.components ?? []).filter((c) => c.role === "need");
  if (need.length)
    out.push(
      place
        ? `Find ${place}'s ${need[0].name.toLowerCase()}`
        : `Find the ${need[0].name.toLowerCase()}`,
    );
  else out.push(`How do you find this?`);
  return out.slice(0, 3);
}
