// lib/listings/property-permits.ts
//
// PER-PROPERTY BUILDING PERMITS — the consumer of `data_lake.steadyapi_property_permits_v`.
// View: docs/sql/20260804_steadyapi_property_permits_v.sql
// Playbook: docs/superpowers/plans/2026-08-02-steadyapi-raw-landing-playbook.md STEP 3, family C.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
// 79,281 permit rows across 12,946 properties have been sitting in our own database,
// unparsed, inside vendor bodies we already paid for and stored on 08/02-08/03/2026.
// This was ranked #2 on the should-get list with "ZERO new calls" beside it since
// 07/16/2026 and stayed unbuilt for 19 days. Reading it costs nothing.
//
// ── SCOPE LAW (binding, from the playbook) ───────────────────────────────────
// Steady data is LISTING-SCOPED: a permit row exists only for a property we probed
// because it was listed or sold. County rolls are FULL-BOOK. So this is the root for
// "permits on THIS listed/sold property" and NEVER the authority for a county-wide
// permit statistic — `lee_building_permits` / `collier_building_permits` stay the
// area-wide lane. `scopeNote` travels on every summary so a caller physically has the
// caveat in hand.
//
// ── POOL: DO NOT BUILD A SECOND POOL ROOT ────────────────────────────────────
// `permit_type` takes the literal value 'Pool'. That is a permit EVENT, not a
// current-state fact about the home. The ONE pool root is `lee_comp_sales_v.pool`.
// This module deliberately exposes NO boolean pool field, and its tests assert that.

/** One row of `data_lake.steadyapi_property_permits_v`. */
export interface PropertyPermitRow {
  property_id: string;
  /** Ordinal within the vendor's array. Part of identity — the vendor ships exact
   *  duplicate permit objects, so the field tuple alone is not unique. */
  permit_ordinal: number;
  permit_type: string | null;
  status: string | null;
  project_name: string | null;
  project_type_1: string | null;
  project_type_2: string | null;
  project_type_3: string | null;
  /** The stored date UNGUARDED, as ISO text — so the 4 absurd futures stay inspectable
   *  after `effective_date` NULLs them.
   *
   *  ⚠️ NOT the vendor literal. The vendor ships 'Mon D, YYYY' universally (79,281 of
   *  79,281 measured 08/04/2026, zero ISO), but the root TABLE does not store that string,
   *  and since 08/04 this view reads the table instead of re-parsing the raw JSON. Restore
   *  the literal in the PARSER if it is ever needed — never by re-parsing in a view.
   *  Check: `steadyapi_permits_vendor_date_string_not_stored`. */
  effective_date_raw: string | null;
  /** ISO date, or NULL when the view's sanity guard rejected it (4 rows carry absurd
   *  futures: 'Feb 14, 2282' and 'Aug 1, 2269' x3). */
  effective_date: string | null;
}

export interface PropertyPermit {
  permitType: string | null;
  status: string | null;
  projectTypes: string[];
  /** MM/DD/YYYY, or NULL when the source date was unusable. NEVER the raw garbage. */
  dateLabel: string | null;
  /** ISO, kept for sorting/filtering by callers. Null when unusable. */
  date: string | null;
}

export interface PropertyPermitSummary {
  permits: PropertyPermit[];
  /** Count AFTER de-duplication — the number of real permits, not vendor rows. */
  total: number;
  /** How many vendor rows were dropped as byte-identical duplicates. Surfaced rather
   *  than hidden.
   *
   *  MEASURED 08/04/2026, and the two numbers differ by 14x — read both before tuning:
   *    · 7,274 groups (12,371 rows, 15.6% of 79,281) collide on the LOOSE key
   *      property + permit_type + status + date.
   *    · 673 groups (882 rows, 1.1%) are identical on EVERY field — the only ones this
   *      collapses.
   *  The gap is real permits sharing a type and date while carrying different
   *  project_type tags (e.g. 'Single family - new home' as Hvac/New-construction/Plumbing
   *  vs New-construction/Plumbing/Residential on the same day). They MAY be one permit
   *  the vendor emitted with rotating tags, but nothing we hold proves it, so they are
   *  kept. Over-merging destroys history; double-counting only inflates a count. */
  duplicatesDropped: number;
  newestDateLabel: string | null;
  /** The listing-scope caveat, travelling with the data so it cannot be lost. */
  scopeNote: string;
}

const SCOPE_NOTE =
  "Permit history for this property only, from records tied to its listing or sale — not a count of permits in the wider area.";

/** MM/DD/YYYY (rule 2). Null-safe, and NEVER falls back to the raw vendor string:
 *  the 4 rows the view rejected carry 'Aug 1, 2269', and printing that would be
 *  worse than printing nothing. */
export function permitDateLabel(p: PropertyPermitRow): string | null {
  const iso = p.effective_date;
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

/** Identity for duplicate detection — everything the vendor actually varies, EXCLUDING
 *  `permit_ordinal` (which is what makes duplicates distinct rows in the first place).
 *
 *  BOTH date forms are in the key, deliberately. In the live view they are 1:1 (raw is
 *  the unguarded form of the same stored date), so including both is free — but keying
 *  on raw ALONE means any
 *  future feed where the parsed date differs while the string collides would silently
 *  merge two real permits into one. A dedupe that over-merges destroys history, which is
 *  strictly worse than the double-count it was written to prevent. */
function permitKey(p: PropertyPermitRow): string {
  return [
    p.property_id,
    p.permit_type ?? "",
    p.status ?? "",
    p.effective_date_raw ?? "",
    p.effective_date ?? "",
    p.project_type_1 ?? "",
    p.project_type_2 ?? "",
    p.project_type_3 ?? "",
  ]
    .join("|")
    .toLowerCase();
}

/**
 * Collapse EXACT duplicates the vendor sent.
 *
 * This is not tidying — it is a correctness fix. Property 6782488671 carries
 * 'Single family - new home' twice with an identical date and status; counting raw
 * rows would tell an owner they pulled two permits when they pulled one. A same-type
 * permit on a DIFFERENT date is a genuine second job and is kept.
 *
 * First writer wins, so the lowest ordinal survives and the result is stable.
 */
export function dedupePermits(rows: readonly PropertyPermitRow[]): PropertyPermitRow[] {
  const seen = new Set<string>();
  const out: PropertyPermitRow[] = [];
  for (const r of rows) {
    const k = permitKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * PURE. Rows for ONE property -> a reader-facing permit history.
 *
 * Newest first. An undated permit sorts LAST rather than being dropped — the permit is
 * real even when its date is not, and silently discarding it would understate a
 * property's history.
 *
 * Empty in, empty out. Never throws, never invents a date, never claims area coverage.
 */
export function summarizePropertyPermits(
  rows: readonly PropertyPermitRow[],
): PropertyPermitSummary {
  const deduped = dedupePermits(rows);

  const permits: PropertyPermit[] = deduped
    .map((r) => ({
      permitType: r.permit_type,
      status: r.status,
      projectTypes: [r.project_type_1, r.project_type_2, r.project_type_3].filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0,
      ),
      dateLabel: permitDateLabel(r),
      date: r.effective_date,
    }))
    .sort((a, b) => {
      // Undated last, in both directions, so the comparator is a total order.
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });

  return {
    permits,
    total: permits.length,
    duplicatesDropped: rows.length - deduped.length,
    newestDateLabel: permits.find((p) => p.dateLabel)?.dateLabel ?? null,
    scopeNote: SCOPE_NOTE,
  };
}

export const PROPERTY_PERMITS_VIEW = "steadyapi_property_permits_v";
export const PROPERTY_PERMITS_COLUMNS =
  "property_id, permit_ordinal, permit_type, status, project_name, project_type_1, project_type_2, project_type_3, effective_date_raw, effective_date";

/** Per-property read cap. A real property tops out around a dozen permits; 200 is far
 *  above any honest history and keeps a bad property_id from scanning the view. */
const ROW_CAP = 200;

export interface PropertyPermitDeps {
  fetchRows?: (propertyId: string) => Promise<PropertyPermitRow[]>;
}

/**
 * Fetch one property's permit history.
 *
 * EMPTY-TOLERANT BY CONTRACT: no creds, no rows, or any query error yields an empty
 * summary and never throws. 27.6% of landed bodies carry no permits at all (12,946 of
 * 17,875 measured 08/04/2026), so "none" is the ordinary answer, not a failure — and it
 * means "we hold no permit records for this property", never "this property has no
 * permit history".
 */
export async function fetchPropertyPermits(
  propertyId: string,
  deps: PropertyPermitDeps = {},
): Promise<PropertyPermitSummary> {
  const id = propertyId?.trim();
  if (!id) return summarizePropertyPermits([]);

  const fetchRows =
    deps.fetchRows ??
    (async (pid: string): Promise<PropertyPermitRow[]> => {
      // KNOWN-DEBT(data_lake: the typed Supabase client intentionally does not cover
      // this schema — see utils/supabase/service-role.ts):
      const { createServiceRoleClientUntyped } = await import("@/utils/supabase/service-role");
      const db = createServiceRoleClientUntyped();
      const { data } = await db
        .schema("data_lake")
        .from(PROPERTY_PERMITS_VIEW)
        .select(PROPERTY_PERMITS_COLUMNS)
        .eq("property_id", pid)
        .limit(ROW_CAP);
      return Array.isArray(data) ? (data as unknown as PropertyPermitRow[]) : [];
    });

  try {
    return summarizePropertyPermits(await fetchRows(id));
  } catch {
    return summarizePropertyPermits([]);
  }
}
