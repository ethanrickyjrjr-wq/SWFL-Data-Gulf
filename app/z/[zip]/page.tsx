import { redirect } from "next/navigation";

/**
 * `/z/[zip]` is retired. It used to render the homepage map's MOCK fixture
 * (`lib/landing/home-map-data` — "mock data; swap for live lake later") as a
 * standalone ZIP card, with NO grounding bridge. That made it the one canonical
 * ZIP surface (map + hero search both route here) where the assistant met a
 * fabricated number with no real source — so it interrogated the user instead of
 * explaining it.
 *
 * The fix: redirect to the REAL, fully-wired report at `/r/zip-report/[zip]`,
 * which reads live brains (housing-swfl, env-swfl), renders every number as a
 * sourced chip, and mounts the report-context bridge so the AI is grounded.
 * One ZIP truth, no mock data on a user-facing page.
 *
 * Temporary (307) on purpose — Hero pages are being reworked and `/z/` may return
 * with real, grounded data; a 308 would be cached hard by browsers and painful to
 * undo. The grounding-coverage guard keeps any future `/z/` from shipping ungrounded.
 */
type Props = { params: Promise<{ zip: string }> };

export default async function ZipRedirect({ params }: Props) {
  const { zip } = await params;
  redirect(`/r/zip-report/${zip}`);
}
