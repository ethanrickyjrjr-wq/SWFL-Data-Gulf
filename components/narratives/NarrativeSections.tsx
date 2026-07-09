import type { NarrativeRow } from "../../lib/narratives/types";

/**
 * ONE narrative renderer for every report surface (spec
 * 2026-07-09-zip-page-destination-design.md §One root #2). Pages pass the row
 * (or null) — no surface contributes narrative markup of its own. Renders
 * nothing when no row exists: sections are additive, pages degrade to today's
 * layout. Styling matches the report glass cards; phone-first (single column,
 * no fixed widths, nothing hover-gated — grid-lab phone standard).
 */
export function NarrativeSections({ row }: { row: NarrativeRow | null }) {
  if (!row) return null;
  const { narration, outlook } = row.sections;
  if (!narration) return null;

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-6 py-8 sm:px-10">
      <section aria-label="What's going on here">
        <h2 className="text-lg font-bold text-white">What&rsquo;s going on here</h2>
        <div className="mt-3 rounded-xl glass-card-modern border border-white/10 px-4 py-4">
          {narration.split(/\n{2,}/).map((para, i) => (
            <p key={i} className="text-sm leading-7 text-gray-200 [&:not(:first-child)]:mt-3">
              {para}
            </p>
          ))}
        </div>
      </section>

      {outlook.length > 0 && (
        <section aria-label="Down the road">
          <h2 className="text-lg font-bold text-white">Down the road</h2>
          <div className="mt-3 space-y-3">
            {outlook.map((item, i) => (
              <div
                key={i}
                className="rounded-xl glass-card-modern border border-white/10 px-4 py-3"
              >
                <p className="text-sm leading-6 text-gray-200">{item.text}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Based on: {item.base} · Would change this read: {item.falsifier}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
