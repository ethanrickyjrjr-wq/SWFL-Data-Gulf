// lib/listings/community-identity.ts — LAYER 4: WHICH COMMUNITY IS THIS, from geometry.
//
// Reads data_lake.parcel_community_pd — the parcel→community spatial join over Lee
// County's recorded Planned Development boundaries (writer:
// ingest/pipelines/lee_planned_developments/spatial_join.py; spec:
// docs/superpowers/specs/2026-08-12-community-crosswalk-design.md). Unlike the three
// existing community layers (inside-the-gate, nearby, subdivision), this one answers
// IDENTITY: the marketed community the parcel physically sits inside — no name
// matching anywhere in the path.
//
// SCOPE — never overclaim (spec failure mode 7): the boundary layer covers
// UNINCORPORATED Lee County only, plus some legacy incorporated polygons. Cape Coral,
// Fort Myers and Bonita Springs are NOT fully covered, and Collier holds no
// coordinates at all. A miss is the NORMAL case and stays SILENT.
//
// SILENCE RULES (spec failure modes 5, 6) — a wrong community shipped as a stated
// fact is worse than no community, because naming a community becomes MANDATORY once
// attached downstream (community-facts coherence rule):
//   - input_method Sketched / "Bad Legal" (hand-drawn or self-declared-bad
//     boundaries): silent. Mirrors LOW_TRUST_INPUT_METHODS in
//     ingest/pipelines/lee_planned_developments/constants.py.
//   - ambiguous=true (parcel inside two DIFFERENT communities; smallest-acres won
//     mechanically upstream): silent here — a flagged assignment never ships.
//   - assigned parcels of one address disagreeing on community: silent (the same
//     fan-out rule community-lookup.ts enforces for subdivisions).

// KNOWN-DEBT(data_lake): parcel_community_pd lives in the data_lake schema, which the
// typed Supabase client intentionally does not cover — same note every lake reader carries.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

const LOW_TRUST_INPUT_METHODS = new Set(["Sketched", "Bad Legal"]);
const PD_INFO_URL = "https://www.leegov.com/dcd/zoning/pd";

export interface CommunityIdentity {
  /** Normalized community display name from the PD layer (zoning suffixes stripped). */
  communityName: string;
  /** The county's raw CASE_NAME, verbatim — provenance, never displayed as the name. */
  caseNameRaw: string | null;
  /** Boundary provenance (Legal / Plats / MaB / …). Low-trust values never get here. */
  inputMethod: string | null;
  acres: number | null;
  /** ISO timestamp of the assignment run. */
  assignedAt: string | null;
}

export interface CommunityIdentityDeps {
  /** Injectable so tests run fully offline (same pattern as community-inside-the-gate). */
  readAssignments?: (parcelIds: string[]) => Promise<Record<string, unknown>[]>;
}

async function readAssignmentsFromLake(parcelIds: string[]): Promise<Record<string, unknown>[]> {
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema("data_lake")
      .from("parcel_community_pd")
      .select(
        "parcel_id, community_name_normalized, case_name_raw, zoning_category, " +
          "input_method, acres, ambiguous, assigned_at",
      )
      .in("parcel_id", parcelIds);
    return Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
  } catch {
    // A dead connection may never fail an email build (RULE 0.7).
    return [];
  }
}

/**
 * The geometry-derived community identity for a resolved address's parcels, or
 * `null`. `null` is the NORMAL answer (unincorporated-Lee coverage only) and means
 * the narrator says nothing about a marketed community. Never throws.
 */
export async function resolveCommunityIdentity(
  parcelIds: string[] | undefined,
  deps: CommunityIdentityDeps = {},
): Promise<CommunityIdentity | null> {
  const ids = (parcelIds ?? []).filter(Boolean);
  if (ids.length === 0) return null;

  const read = deps.readAssignments ?? readAssignmentsFromLake;
  let rows: Record<string, unknown>[];
  try {
    rows = await read(ids);
  } catch {
    return null;
  }
  if (!rows || rows.length === 0) return null;

  const names = new Set(rows.map((r) => r.community_name_normalized));
  if (names.size !== 1) return null; // fan-out rule: disagreement → silence

  // Every silence rule runs over ALL rows — PostgREST guarantees no row order
  // without .order(), so a rows[0]-only check would be order-dependent.
  if (rows.some((r) => r.ambiguous === true)) return null;
  if (
    rows.some(
      (r) => typeof r.input_method === "string" && LOW_TRUST_INPUT_METHODS.has(r.input_method),
    )
  ) {
    return null;
  }

  // Deterministic representative row (metadata only — the name is shared): min parcel_id.
  const row = [...rows].sort((a, b) =>
    String(a.parcel_id ?? "").localeCompare(String(b.parcel_id ?? "")),
  )[0]!;
  const name = row.community_name_normalized;
  if (typeof name !== "string" || !name.trim()) return null;
  const method = typeof row.input_method === "string" ? row.input_method : null;

  return {
    communityName: name.trim(),
    caseNameRaw: typeof row.case_name_raw === "string" ? row.case_name_raw : null,
    inputMethod: method,
    acres: typeof row.acres === "number" ? row.acres : null,
    assignedAt: typeof row.assigned_at === "string" ? row.assigned_at : null,
  };
}

function toMmDdYyyy(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

/**
 * THE ONE SENTENCE the narrator may be handed about geometry-derived community
 * identity. Identity ONLY — it grants the community's NAME and forbids everything
 * else (amenities stay gated behind insideTheGateSourceLine). Wording is
 * test-enforced: the unincorporated-Lee scope sentence may never be dropped
 * (spec failure mode 7).
 */
export function communityIdentitySourceLine(
  identity: CommunityIdentity | null | undefined,
): string | null {
  if (!identity) return null;
  const asOf = identity.assignedAt ? toMmDdYyyy(identity.assignedAt) : null;
  return (
    `THE COMMUNITY (IDENTITY): this home's parcel sits inside the recorded boundary of ` +
    `${identity.communityName} (source: Lee County Planned Development boundaries, ` +
    `${PD_INFO_URL}${asOf ? `, as of ${asOf}` : ""}). That layer covers unincorporated ` +
    `Lee County only — it is not a complete map of Lee County communities. You may say ` +
    `the home is in ${identity.communityName}; this line states nothing about golf, ` +
    `gates, fees, pools, or any other amenity, and you may not infer any.`
  );
}
