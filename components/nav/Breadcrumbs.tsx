import Link from "next/link";
import { shouldRender, type Crumb } from "@/lib/nav/breadcrumbs";

/**
 * Location breadcrumb for the deep report/project trees (B2). RENDERED BY EACH PAGE
 * with the real, already-resolved name in hand (display.title, project.title,
 * primaryPlace) — built via the pure helpers in `@/lib/nav/breadcrumbs`. It's a plain
 * server component (no usePathname / no headers()), so it ships zero client JS and
 * never deopts static rendering. It renders nothing on a trail shorter than Home + a
 * leaf, so section indexes pass a short trail and disappear. Mounted only on the deep
 * report/project pages — NOT on `/p/*` (white-label), home, or the section indexes.
 *
 * Wayfinding chrome speaks in teal (the system color); the sentiment colors
 * (mangrove/coral/gold) stay reserved for data direction, so links hover teal — the
 * same hover the footer uses.
 */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  if (!shouldRender(trail)) return null;
  // Container-agnostic: no max-w / horizontal padding of its own — it inherits the
  // page's content column (ReportShell's <main>, the project container) so it lines
  // up with the title beneath it and never double-pads.
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm">
      <ol className="flex flex-wrap items-center gap-2">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          const isLink = Boolean(crumb.href) && !last;
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-2">
              {i > 0 && (
                <span className="text-gray-600" aria-hidden>
                  ›
                </span>
              )}
              {isLink ? (
                <Link
                  href={crumb.href!}
                  className="text-gray-400 transition-colors hover:text-teal-primary"
                >
                  <CrumbLabel crumb={crumb} />
                </Link>
              ) : (
                <span className="text-gray-200" aria-current={last ? "page" : undefined}>
                  <CrumbLabel crumb={crumb} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CrumbLabel({ crumb }: { crumb: Crumb }) {
  return (
    <>
      <span className={crumb.mono ? "font-mono" : undefined}>{crumb.label}</span>
      {crumb.keyTail ? (
        <>
          <span className="text-gray-500"> · </span>
          <span className="font-mono">{crumb.keyTail}</span>
        </>
      ) : null}
    </>
  );
}
