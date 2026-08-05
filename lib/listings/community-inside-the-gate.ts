// lib/listings/community-inside-the-gate.ts
//
// LAYER 1 OF THREE — WHAT IS INSIDE THE GATE. Golf, a pool, tennis, a clubhouse, dining,
// a marina, and whether the community is gated at all.
//
// ── THE THREE LAYERS, AND WHY THEY MAY NEVER IMPERSONATE EACH OTHER ──────────
//   1. INSIDE THE GATE  — this file. `data_lake.community_profiles`, **81 rows** (counted
//      live 08/05/2026). Thin, named-web-sourced, per-community. Says a resident of THIS
//      community can use these things.
//   2. NEARBY           — `neighborhood-amenities.ts`. Businesses within roughly five miles.
//      A golf course in that list is a golf course a resident can DRIVE to, and the copy has
//      to say so.
//   3. THE SUBDIVISION  — `community-lookup.ts`. Home count and median ASSESSED value from
//      our own tax roll. Universal (every home in Lee and Collier) and about SIZE and VALUE,
//      never about amenities.
//
// Layers 2 and 3 already reached the narrator on the address path. **Layer 1 did not.** The
// only writer of `ListingFacts.community` was `listing-scrape.ts`, which parses a listing
// PAGE — so in-gate amenities reached an email only when the agent pasted a listing URL, and
// never when they typed an address. This file closes that, from a table we already hold, with
// no fetch of anything.
//
// ── ABSENT STAYS SILENT — THE ONE RULE THAT MATTERS HERE ─────────────────────
// 81 rows against 20,400 subdivisions means a miss is the NORMAL case. A miss means "we do
// not know", never "this community has no golf". Every field is three-valued — true, false,
// or unknown — and only a literal `true` is ever spoken. A `null` and a `false` are BOTH
// silent, because the upstream merge writes `null` for "not stated on the page we read" and
// we cannot tell that apart from a real absence for most rows. Writing "no pool" from a
// `false` would be asserting a negative we did not source.

// KNOWN-DEBT(data_lake): `community_profiles` lives in the data_lake schema, which the typed
// Supabase client intentionally does not cover — same note every lake reader carries.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { communityForSubdivision } from "@/refinery/lib/subdivision-aliases.mts";

/** What we hold about the inside of one community. Every flag is TRUE-ONLY — see the
 *  header: `false` and `null` are both "we do not know" and both stay silent. */
export interface InsideTheGate {
  /** The community's display name, as the profile row states it. */
  label: string;
  gated: boolean;
  golf: boolean;
  /** Only when the row states a real hole count — never inferred from `golf`. */
  golfHoles: number | null;
  pool: boolean;
  tennis: boolean;
  pickleball: boolean;
  fitness: boolean;
  clubhouse: boolean;
  dining: boolean;
  marina: boolean;
  /** The named web page the amenity claims came from. Required for the source line. */
  sourceUrl: string | null;
  /** MM/DD/YYYY. */
  asOf: string | null;
}

/** The shape `community_profiles.community_slug` actually holds — the label, lowercased,
 *  non-alphanumerics folded to single hyphens ("Audubon Country Club" →
 *  "audubon-country-club"). Verified against real rows 08/05/2026. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Only a literal `true` counts. See the header — `false` and `null` are both unknown. */
function yes(v: unknown): boolean {
  return v === true;
}

function positiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** ISO or Date → MM/DD/YYYY, the one as-of format (FOCUS rule 2). */
function asOfMmDdYyyy(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()}`;
}

export interface InsideTheGateDeps {
  /** Injectable so every test — and `registry-seam.test.ts`, which runs all 17 builders
   *  twice — runs fully offline and touches no database. */
  readProfile?: (slug: string) => Promise<Record<string, unknown> | null>;
}

async function readProfileFromLake(slug: string): Promise<Record<string, unknown> | null> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("community_profiles")
      .select(
        "label, gated, golf_holes, golf_courses, pool, tennis, pickleball, fitness, " +
          "clubhouse, on_site_dining, boating_marina, amenities_source_url, amenities_as_of",
      )
      .eq("community_slug", slug)
      .limit(1);
    return Array.isArray(data) && data.length
      ? (data[0] as unknown as Record<string, unknown>)
      : null;
  } catch {
    // A dead connection may never fail an email build (RULE 0.7).
    return null;
  }
}

/**
 * The in-gate profile for the subdivision this listing resolved to, or `null`.
 *
 * `null` is the NORMAL answer — 81 profiles against 20,400 subdivisions — and it means the
 * narrator must say NOTHING about golf, a pool, or a gate. It never means the community
 * lacks them.
 *
 * The join is the SAME canonical slug `community-lookup.ts` already uses to key
 * `neighborhood_stats`, so the two community layers cannot drift onto different names for
 * one place. Never throws.
 */
export async function resolveInsideTheGate(
  subdivisionName: string | undefined,
  deps: InsideTheGateDeps = {},
): Promise<InsideTheGate | null> {
  const name = subdivisionName?.trim();
  if (!name) return null;

  // TWO KEYS, TRIED IN ORDER — and the second one is not optional.
  //
  // The alias map is the CORRECT first key: it folds tax-roll subdivision names ("PELICAN
  // BAY UNIT 12") onto the one community slug, which is exactly the fold `neighborhood_stats`
  // is keyed by. But it only covers subdivisions someone has aliased, so keying on it ALONE
  // meant a profile row whose slug is just its own slugified label — which is how the
  // 08/03 merge wrote all 81 of them — could never be found. The lane would have looked
  // wired and fired approximately never.
  const slugs = [communityForSubdivision(name), slugify(name)].filter((s): s is string => !!s);

  const read = deps.readProfile ?? readProfileFromLake;
  let row: Record<string, unknown> | null = null;
  for (const slug of [...new Set(slugs)]) {
    row = await read(slug).catch(() => null);
    if (row) break;
  }
  if (!row) return null;

  const holes = positiveInt(row.golf_holes);
  const gate: InsideTheGate = {
    label: typeof row.label === "string" && row.label.trim() ? row.label.trim() : name,
    gated: yes(row.gated),
    // A stated hole or course count IS the golf fact — the 08/05 rows carry `golf_holes: 18`
    // with `golf_structure: null`, so keying off a boolean alone would have dropped real golf.
    golf: holes != null || positiveInt(row.golf_courses) != null,
    golfHoles: holes,
    pool: yes(row.pool),
    tennis: yes(row.tennis),
    pickleball: yes(row.pickleball),
    fitness: yes(row.fitness),
    clubhouse: yes(row.clubhouse),
    dining: yes(row.on_site_dining),
    marina: yes(row.boating_marina),
    sourceUrl: typeof row.amenities_source_url === "string" ? row.amenities_source_url : null,
    asOf: asOfMmDdYyyy(row.amenities_as_of),
  };

  // Nothing true and nothing sourced is not a fact — it is an empty row, and handing the
  // narrator an empty row would lift the golf/pool prohibition with nothing behind it.
  const anything =
    gate.gated ||
    gate.golf ||
    gate.pool ||
    gate.tennis ||
    gate.pickleball ||
    gate.fitness ||
    gate.clubhouse ||
    gate.dining ||
    gate.marina;
  return anything ? gate : null;
}

/**
 * THE ONE SENTENCE the narrator may be handed about the inside of a community.
 *
 * Its presence is what LIFTS the narrator's blanket prohibition on the words golf / pool /
 * gated / clubhouse — so it must list only what a real row states. Its ABSENCE keeps the
 * prohibition on, which is the correct default for the 20,300-odd subdivisions we hold no
 * profile for. Returns null when there is nothing sourced to say.
 */
export function insideTheGateSourceLine(gate: InsideTheGate | null | undefined): string | null {
  if (!gate) return null;
  const has: string[] = [];
  if (gate.golf) has.push(gate.golfHoles ? `golf (${gate.golfHoles} holes)` : "golf");
  if (gate.pool) has.push("a community pool");
  if (gate.tennis) has.push("tennis");
  if (gate.pickleball) has.push("pickleball");
  if (gate.fitness) has.push("a fitness centre");
  if (gate.clubhouse) has.push("a clubhouse");
  if (gate.dining) has.push("on-site dining");
  if (gate.marina) has.push("a marina");

  const parts: string[] = [];
  if (gate.gated) parts.push(`${gate.label} is a gated community`);
  if (has.length) {
    parts.push(
      `${parts.length ? "it" : gate.label} offers ${has.length > 1 ? `${has.slice(0, -1).join(", ")} and ${has.at(-1)}` : has[0]}`,
    );
  }
  if (!parts.length) return null;

  const cite = gate.sourceUrl
    ? ` (source: ${gate.sourceUrl}${gate.asOf ? `, as of ${gate.asOf}` : ""})`
    : "";
  return (
    `THE COMMUNITY — INSIDE THE GATE: ${parts.join(", and ")}.${cite} ` +
    `These belong to the COMMUNITY, never to this house: you may write that the community ` +
    `has them, never that the home does. Name ONLY what this line lists, and never write ` +
    `that the community lacks anything.`
  );
}
