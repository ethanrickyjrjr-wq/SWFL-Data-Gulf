// lib/listings/free-lanes-first.ts
//
// ═══════════════════════════════════════════════════════════════════════════════
// *** EXHAUST FREE AND IN-HOUSE BEFORE ANYONE RUNS APIFY. ***
// ═══════════════════════════════════════════════════════════════════════════════
//
// Operator decree 08/05/2026, verbatim: *"First make sure we are checking all free lanes
// and in-house data before anyone runs fucking apify and then build. We will change that
// when people are actually building if we need it faster and know we don't have broad data
// on a field/category, like baths. But we aren't running extra fucking runs for shit we
// already have!!!!!!"*
//
// ── WHY THIS FILE EXISTS — COUNTED LIVE 08/05/2026, OUR OWN DATABASE ─────────
//
// `data_lake.apify_property_records` — **383 rows WE HAVE ALREADY PAID FOR**:
//   property_url  100.0%   style        99.5%   year_built  98.7%   baths_total 98.2%
//   beds           98.4%   sqft         95.3%   primary_photo 94.5% alt_photos  94.0%
//   description    93.5%
//
// `data_lake.listing_state` — the FREE spine, 35,202 rows:
//   photo_url      98.5%   beds         73.7%   sqft        70.6%   **baths 31.2%**
//
// So PHOTOS ARE A SOLVED PROBLEM FOR FREE, and the single genuinely thin field is BATHS —
// exactly the field the operator named. Meanwhile the comp lane was buying a ~200-record ZIP
// month (~$1.95) to answer questions our own rows answer 93–100% of the time.
//
// ── THE RUNG WE WERE SKIPPING, AND IT IS FREE ────────────────────────────────
// `paid-record-lane.ts` reads the cache with the EXACT `listingAddressKey`, then falls back
// to a LOOSE key (`fetchCachedRecordLoose`) — because the daily sweep writes
// "12554 Kellysands Way" and the paid row writes "12554 Kelly Sands Way". Counted 08/05/2026:
// the exact key reaches 8 of 26 rows; loose reaches **5 MORE**. The comp lane — the one that
// actually spends — only ever tried the exact key. We skipped a free rung worth ~60% more
// cache hits and then bought a ZIP month.
//
// ── WHAT THIS MODULE IS ──────────────────────────────────────────────────────
// The accounting step between "free lanes ran" and "may we spend": given what the free lanes
// produced, what is *genuinely* still missing — PER HOUSE and PER FIELD. It issues no calls
// and reads no database; it is pure so the rule is testable and cannot drift.
//
// *** PER FIELD IS THE POINT. *** The $14 incident happened because ONE uncovered comp
// re-bought an entire area. A caller that knows "house B is missing only baths" can buy that
// one field for ~$0.007 instead of buying a month for ~$1.95. Buy the FIELD, never the area.

/** What the FREE lanes (free spine + rows we already bought) produced for one house.
 *  `null`/absent = the free lanes did not cover it. */
export interface FreeLaneCoverage {
  addressLine: string;
  photoUrl?: string | null;
  listingUrl?: string | null;
  /** Total baths. **A ZERO IS NOT A BATH COUNT** — see `isCovered` below. */
  baths?: number | null;
  style?: string | null;
  description?: string | null;
}

/** Which cells this build actually needs. A field nobody asked for can never justify a
 *  purchase — the "we bought 200 records to fill a cell the email does not print" failure. */
export interface NeededFields {
  photoUrl?: boolean;
  listingUrl?: boolean;
  baths?: boolean;
  style?: boolean;
  description?: boolean;
}

export type CoverableField = keyof NeededFields;

/** One house's genuine remaining gap, after everything free has been tried. */
export interface StillMissing {
  addressLine: string;
  /** ONLY the needed fields the free lanes did not cover. Never empty (such a row is dropped). */
  fields: CoverableField[];
}

/** Only ever an absolute http(s) URL. A blank, a relative path, or a `javascript:` string is
 *  NOT a covered field — it is an open slot that would otherwise reach an `href`/`<img src>`. */
function isHttpUrl(v: unknown): boolean {
  return typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim());
}

/**
 * Is this field genuinely covered by the free lanes?
 *
 * **A ZERO OR A BLANK IS AN OPEN SLOT, NEVER A VALUE** (playbook §1.14, and the same call
 * already made for `hoa_fee` and every spec in `paid-record-lane.ts`). A `0` bath count is
 * the vendor's unfilled field, not a fact about a house — treating it as covered would print
 * a fabricated figure AND suppress the one lookup that could have filled it honestly.
 */
function isCovered(cov: FreeLaneCoverage, field: CoverableField): boolean {
  switch (field) {
    case "photoUrl":
      return isHttpUrl(cov.photoUrl);
    case "listingUrl":
      return isHttpUrl(cov.listingUrl);
    case "baths":
      return typeof cov.baths === "number" && Number.isFinite(cov.baths) && cov.baths > 0;
    case "style":
      return typeof cov.style === "string" && cov.style.trim().length > 0;
    case "description":
      return typeof cov.description === "string" && cov.description.trim().length > 0;
  }
}

/**
 * What is STILL missing after every free and in-house lane has run — per house, per field.
 *
 * An empty array means **no vendor call is justified for this build**. That is the whole
 * contract: a caller may not reach for the paid lane without first asking this function and
 * getting a non-empty answer, and what it may then buy is the named FIELDS, not an area.
 */
export function stillMissingAfterFreeLanes(
  coverage: readonly FreeLaneCoverage[],
  needed: NeededFields,
): StillMissing[] {
  const wanted = (Object.keys(needed) as CoverableField[]).filter((f) => needed[f]);
  if (wanted.length === 0) return [];

  const out: StillMissing[] = [];
  for (const cov of coverage) {
    if (!cov.addressLine?.trim()) continue;
    const fields = wanted.filter((f) => !isCovered(cov, f));
    if (fields.length) out.push({ addressLine: cov.addressLine, fields });
  }
  return out;
}

/** The line a build prints before it is allowed to spend. Written so a reader can see the
 *  free lanes did their job — the opposite of the old receipt, which reported a row delta and
 *  told the operator a purchase was free. */
export function freeLaneReport(
  coverage: readonly FreeLaneCoverage[],
  needed: NeededFields,
): string {
  const missing = stillMissingAfterFreeLanes(coverage, needed);
  const covered = coverage.length - missing.length;
  if (missing.length === 0) {
    return (
      `[free-lanes] ${covered} of ${coverage.length} house(s) fully covered by FREE lanes ` +
      `(free spine + rows already bought). NO VENDOR CALL IS JUSTIFIED — nothing to buy.`
    );
  }
  const fieldCounts = new Map<string, number>();
  for (const m of missing)
    for (const f of m.fields) fieldCounts.set(f, (fieldCounts.get(f) ?? 0) + 1);
  const byField = [...fieldCounts.entries()].map(([f, n]) => `${f}×${n}`).join(", ");
  return (
    `[free-lanes] ${covered} of ${coverage.length} house(s) fully covered free; ` +
    `${missing.length} still short — ${byField}. Buy THESE FIELDS for THESE HOUSES only, ` +
    `never an area sweep.`
  );
}
