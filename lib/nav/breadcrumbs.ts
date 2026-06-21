/**
 * Pure breadcrumb data + trail builders for the deep report/project trees (B2).
 *
 * Breadcrumbs are rendered BY EACH PAGE with the real name it already resolved
 * (`display.title`, `project.title`, `primaryPlace`, …) — never reverse-engineered
 * from the URL. So this module is plain data/functions (no "use client", no React):
 * the page calls a builder with its in-hand name, hands the result to <Breadcrumbs/>.
 * Keeping the logic here (not in the component) means it unit-tests deterministically,
 * the way nav-config does — the repo has no component-render test harness.
 *
 * Labels mirror the nav vocabulary (Search, Projects) so the two never drift.
 */

export interface Crumb {
  label: string;
  /** A crumb with an href renders as a link (except the last/current crumb). */
  href?: string;
  /** Render the label in the mono "data key" face (e.g. a bare slug). */
  mono?: boolean;
  /** A trailing data key shown after " · " in mono — e.g. label "Fort Myers Beach" + keyTail "33931". */
  keyTail?: string;
}

export const HOME_CRUMB: Crumb = { label: "Home", href: "/" };
export const SEARCH_CRUMB: Crumb = { label: "Search", href: "/r" };
export const PROJECTS_CRUMB: Crumb = { label: "Projects", href: "/project" };

/** ZIP Reports has no index route (`/r/zip-report` is dynamic-only) → point at search. */
const ZIP_REPORTS_CRUMB: Crumb = { label: "ZIP Reports", href: "/r/search" };

/** A breadcrumb earns its place only when there's a leaf beyond Home — section
 *  indexes (`/r`, `/project`) and unknown routes produce a 1-crumb (or empty) trail
 *  and render nothing. The component calls this; exported so it's unit-testable. */
export function shouldRender(trail: Crumb[]): boolean {
  return trail.length >= 2;
}

/** `/r/[slug]` — the report's customer title (display.title), e.g. "Lee County — Parcel Velocity". */
export function reportTrail(title: string): Crumb[] {
  return [HOME_CRUMB, SEARCH_CRUMB, { label: title }];
}

/** `/r/zip-report/[zip]` — place + ZIP as one crumb: "Fort Myers Beach · 33931" (ZIP in mono). */
export function zipReportTrail(place: string | null | undefined, zip: string): Crumb[] {
  return [HOME_CRUMB, SEARCH_CRUMB, ZIP_REPORTS_CRUMB, { label: place || "ZIP", keyTail: zip }];
}

/** `/r/cre-swfl/[corridor]` — corridor display name, e.g. "US-41 / Bonita Springs".
 *  The parent crumb links back to the CRE report (replaces the page's ad-hoc back-link). */
export function corridorTrail(displayName: string): Crumb[] {
  return [
    HOME_CRUMB,
    SEARCH_CRUMB,
    { label: "Commercial Real Estate", href: "/r/cre-swfl" },
    { label: displayName },
  ];
}

/** `/r/source/[table]` — provenance table label. */
export function sourceTrail(label: string): Crumb[] {
  return [HOME_CRUMB, SEARCH_CRUMB, { label: "Sources" }, { label }];
}

/** `/r/method/[metric]` — methodology entry label. */
export function methodTrail(label: string): Crumb[] {
  return [HOME_CRUMB, SEARCH_CRUMB, { label: "Methods" }, { label }];
}

/** `/project/[id]` — the user's own project title; "Project" only if it's somehow unnamed. */
export function projectTrail(title: string | null | undefined): Crumb[] {
  return [HOME_CRUMB, PROJECTS_CRUMB, { label: title || "Project" }];
}
