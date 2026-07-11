import type { ReactNode } from "react";

/**
 * Shared zone chrome for /desk — each zone is a standalone card reading one
 * loader (SPEC-B SEAM: the embeddable widget lifts a single zone unchanged).
 * The footer stamp renders the zone's OWN as-of + named source; the `actions`
 * slot is the shared CTA seam ("turn this into a report" / pin buttons) that
 * Spec B reuses for its email-capture and deep-link variants.
 */
export function DeskZone({
  id,
  title,
  note,
  asOf,
  sourceLabel,
  actions,
  children,
  className = "",
}: {
  id: string;
  title: string;
  /** Honesty caption (window note, sampling caveat) — rendered, never hidden. */
  note?: string;
  asOf?: string;
  sourceLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-[#22414f] bg-[#0f1d24] p-4 sm:p-6 text-[#f0ede6] ${className}`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{title}</h2>
          {note ? <p className="mt-1 text-xs text-gray-500">{note}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
      {asOf || sourceLabel ? (
        <p className="mt-4 text-[11px] text-gray-500 font-mono">
          {asOf ? `as of ${asOf}` : ""}
          {asOf && sourceLabel ? " · " : ""}
          {sourceLabel ?? ""}
        </p>
      ) : null}
    </section>
  );
}
