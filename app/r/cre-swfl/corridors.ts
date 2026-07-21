import { createServiceRoleClient } from "../../../utils/supabase/service-role";
import { corridorKey, displayNameFor } from "../../../refinery/lib/corridor-display.mts";
import { normalizeCorridor } from "../../../refinery/sources/cre-source.mts";

/**
 * The single source of truth for "which corridors have a live drill-down page":
 * verified, non-deleted rows of `corridor_profiles`. Both the drill-down route
 * (`app/r/cre-swfl/[corridor]/page.tsx`) and the parent-page corridor index
 * read THIS function, so the index can never link a corridor that 404s — the
 * set that proves a page exists is the same set the index renders from.
 */
export async function fetchVerifiedCorridorRows(): Promise<Record<string, unknown>[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("corridor_profiles")
    .select("*")
    .is("deleted_at", null)
    .eq("verification_status", "verified");
  if (error || !data) return [];
  return data as Record<string, unknown>[];
}

/**
 * Slug-only twin of `fetchVerifiedCorridorRows` — IDENTICAL predicate
 * (`deleted_at IS NULL AND verification_status = 'verified'`), two columns.
 *
 * `toCorridorLinks` reads exactly `corridor_name` (slug + display name) and
 * `city` (display + `cityToCounty`); every other column `normalizeCorridor`
 * touches is dropped on the floor by the link mapper. Callers that only need
 * links — the sitemap — must use THIS, not the `select("*")` above: measured
 * 07/21/2026, the full row set is 163 kB across 27 rows, of which 73 kB is
 * narrative prose (`character_speculative` 39 kB, `character_facts` 24 kB,
 * `character_chart` 10 kB) that a list of URLs never renders.
 *
 * The predicate is duplicated deliberately, not relaxed: the "index can never
 * link a corridor that 404s" invariant holds because both functions select the
 * same ROWS. Narrowing columns cannot change which rows come back. If you ever
 * change one predicate, change both.
 */
export async function fetchVerifiedCorridorSlugRows(): Promise<Record<string, unknown>[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("corridor_profiles")
    .select("corridor_name, city")
    .is("deleted_at", null)
    .eq("verification_status", "verified");
  if (error || !data) return [];
  return data as Record<string, unknown>[];
}

export interface CorridorLink {
  /** Drill-down slug — derived from the SAME corridorKey() the route matches on. */
  slug: string;
  /** User-facing name (never the raw join key). */
  name: string;
  city: string;
  county: "Lee" | "Collier" | "Unknown";
}

/**
 * One link per corridor that has a live page, sorted county → name. Display
 * fields come from `normalizeCorridor`, but the slug is computed from the RAW
 * `corridor_name` column — `corridorKey(String(r.corridor_name ?? ""))` — which
 * is byte-identical to the expression the drill-down route resolves against in
 * its `.find`. We deliberately do NOT key off any normalized/display field, so
 * no title-casing or trimming can ever make the index slug diverge from the
 * route's match key and produce a dead link.
 */
export function toCorridorLinks(rows: Record<string, unknown>[]): CorridorLink[] {
  return rows
    .map((r) => {
      const c = normalizeCorridor(r);
      return {
        // Raw column, identical to the route's `.find` — see note above.
        slug: corridorKey(String(r.corridor_name ?? "")),
        name: c.display_name ?? displayNameFor(c.name),
        city: c.city,
        county: c.county,
      };
    })
    .filter((c) => c.slug.length > 0)
    .sort((a, b) => a.county.localeCompare(b.county) || a.name.localeCompare(b.name));
}
