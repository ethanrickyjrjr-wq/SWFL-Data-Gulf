# Community Stats → Deliverable Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 14 files, keywords: refactor, schema, architecture

**Goal:** Get our own address-resolved, tax-roll-backed neighborhood stats (home count, median assessed value) flowing from `data_lake.parcel_subdivision` into every listing-lifecycle deliverable — closing the gap where that data existed but reached zero emails — while fixing a real cross-subsystem join-key bug the advisor caught before it shipped.

**Architecture:** Two independent fixes that share one join key. Fix 1 (ingest) folds aliased raw subdivision names to a canonical marketed-community label inside the `neighborhood_stats` DuckDB aggregation, in SQL, before `median()` runs. Fix 2 (app) resolves a listing's street address to its neighborhood via the existing `lib/listings/community-lookup.ts`, and must apply the identical alias transform before querying `neighborhood_stats` — otherwise it silently misses every row Fix 1 folds. Both sides read the one shared `fixtures/community-aliases.json`. The resolved stats then ride through the existing shared subject-resolver and shared narrator (`lib/deliverable/recipes/shared.ts`) into six listing-lifecycle recipes, using the SAME settled-claim/anchor mechanism (`lib/deliverable/claims.ts`) already proven correct for every other cited number in this codebase.

**Tech Stack:** Python (dlt-adjacent DuckDB aggregation, psycopg), TypeScript (Next.js app, Supabase service-role client, Bun test).

## Global Constraints

- No new ingest columns this round — `home_count`/`median_just_value`/`count_by_type` are already fully supplied by the live `parcel_subdivision` pull (26 columns landed 07/14/2026; see Task 4's source-supply comment for the full list of what's available but not yet rolled up).
- No `community_profiles` Tier-2 scrape work, no `master` resync dispatch, no Gap 2 build (only a handoff doc + tracking check, Task 10).
- Never invent a number — every new figure traces to `data_lake.parcel_subdivision`/`data_lake.neighborhood_stats`, cited with its `source_url` + `as_of` (MM/DD/YYYY in any customer-facing text).
- `median_just_value` is FDOR **assessed** value — never relabeled a sale or list price, anywhere it's surfaced.
- Absence is always silent (no match, no stats, no line) — never a guess, never "no data for this neighborhood."
- `market-comps` stays excluded from all of this — same reasoning as its existing "community"/"neighborhood"/"subdivision" word ban.
- Full spec: `docs/superpowers/specs/2026-07-15-community-stats-deliverable-wiring-design.md`.

---

### Task 1: `ingest/lib/community_aliases.py` — canonical-label lookup

**Files:**
- Modify: `ingest/lib/community_aliases.py`
- Test: `ingest/lib/test_community_aliases.py`

**Interfaces:**
- Consumes: `load_community_aliases()`, `build_pattern_index()` (both already exist in this file).
- Produces: `label_by_pattern(aliases: dict | None = None) -> dict[str, str]` — a direct `stemmed-raw-name -> canonical-label` map. Task 2 (`agg.py`) and Task 3 (`pipeline.py`) both import this.

- [ ] **Step 1: Write the failing tests**

Append to `ingest/lib/test_community_aliases.py`:

```python
def test_label_by_pattern_maps_known_pattern_to_its_label():
    labels = label_by_pattern()
    assert labels["HERITAGE BAY"] == "Heritage Bay"


def test_label_by_pattern_omits_unknown_names():
    labels = label_by_pattern()
    assert "SOME UNKNOWN NAME" not in labels
```

Update the import line at the top of the file to:

```python
from ingest.lib.community_aliases import (
    build_pattern_index,
    community_for_subdivision,
    label_by_pattern,
    load_community_aliases,
)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest ingest/lib/test_community_aliases.py -v`
Expected: FAIL with `ImportError: cannot import name 'label_by_pattern'`

- [ ] **Step 3: Implement `label_by_pattern`**

Append to `ingest/lib/community_aliases.py` (after `community_for_subdivision`):

```python
def label_by_pattern(aliases: dict | None = None) -> dict[str, str]:
    """Build a direct STEMMED-NAME -> canonical LABEL map (not slug) -- what
    ingest/duckdb_pipelines/neighborhood_stats/agg.py needs to fold an aliased
    raw subdivision_name to its marketed-community label before grouping.
    Mirrors the TS side's `communityForSubdivision` + `COMMUNITY_ALIASES[slug].label`
    lookup (refinery/lib/subdivision-aliases.mts, via lib/listings/community-lookup.ts's
    `canonicalCommunityKey`) so both readers resolve a given raw name to the identical
    label string -- the join-key lockstep the address resolver depends on.
    """
    aliases = aliases if aliases is not None else load_community_aliases()
    index = build_pattern_index(aliases)
    return {pattern: aliases[slug]["label"] for pattern, slug in index.items()}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest ingest/lib/test_community_aliases.py -v`
Expected: PASS (5 tests: the 3 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add ingest/lib/community_aliases.py ingest/lib/test_community_aliases.py
git commit -m "feat(ingest): add label_by_pattern for the neighborhood_stats alias fold"
```

---

### Task 2: `agg.py` — fold aliased names in SQL, before `median()`

**Files:**
- Modify: `ingest/duckdb_pipelines/neighborhood_stats/agg.py`
- Test: `ingest/duckdb_pipelines/neighborhood_stats/test_agg.py`

**Interfaces:**
- Consumes: `label_by_pattern()` from Task 1 (imported by the test file and, in Task 3, by `pipeline.py`).
- Produces: `aggregate_stats(con, alias_label_by_pattern: dict[str, str] | None = None) -> list[dict]` — same return shape as before (`county`, `subdivision_name`, `home_count`, `count_by_type`, `median_just_value`, `source_url`, `as_of`), with `subdivision_name` now the canonical label when the alias map resolves it, else the raw stemmed name unchanged. **Backward compatible**: calling with no second argument (or `None`) folds nothing — every existing caller and existing test keeps working unmodified.

- [ ] **Step 1: Write the failing tests**

Append to `ingest/duckdb_pipelines/neighborhood_stats/test_agg.py`:

```python
def test_alias_fold_collapses_two_raw_names_into_one_canonical_row():
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE parcel_subdivision(parcel_id TEXT, county TEXT, property_type TEXT, "
        "just_value DOUBLE, subdivision_name TEXT)"
    )
    con.execute("""INSERT INTO parcel_subdivision VALUES
        ('1','collier','condominium',300000,'HERITAGE BAY GOLF ESTATES'),
        ('2','collier','single-family',900000,'HERITAGE BAY GOLF ESTATES'),
        ('3','collier','single-family',500000,'HERITAGE BAY COUNTRY CLUB')""")
    alias_map = {
        "HERITAGE BAY GOLF ESTATES": "Heritage Bay",
        "HERITAGE BAY COUNTRY CLUB": "Heritage Bay",
    }
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con, alias_map)}
    assert ("collier", "HERITAGE BAY GOLF ESTATES") not in rows
    assert ("collier", "HERITAGE BAY COUNTRY CLUB") not in rows
    hb = rows[("collier", "Heritage Bay")]
    assert hb["home_count"] == 3
    # median of [300000, 900000, 500000] = 500000 -- computed over the FOLDED group,
    # never merged from two separate per-raw-name medians (which would be undefined).
    assert hb["median_just_value"] == 500000
    assert hb["count_by_type"]["single-family"] == 2
    assert hb["count_by_type"]["condominium"] == 1


def test_alias_fold_leaves_unresolved_names_grouped_by_their_raw_name():
    con = duckdb.connect()
    _seed(con)
    alias_map = {"HERITAGE BAY": "Heritage Bay"}  # LELY RESORT is not in the map
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con, alias_map)}
    assert ("collier", "Heritage Bay") in rows
    assert ("collier", "LELY RESORT") in rows  # unresolved name: falls back unchanged, no guess


def test_alias_fold_with_no_map_matches_pre_fix_behavior():
    con = duckdb.connect()
    _seed(con)
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con)}
    assert ("collier", "HERITAGE BAY") in rows  # default: no map -> raw name, unchanged


def test_alias_fold_against_the_real_shared_fixture():
    # Cross-subsystem check (advisor-caught): reads the SAME fixtures/community-aliases.json
    # lib/listings/community-lookup.ts's resolver reads, proving the Python ingest side and
    # the TS resolver side land on the identical canonical label for a known raw name --
    # the lockstep resolveCommunityStats() depends on to find what this pipeline lands.
    from ingest.lib.community_aliases import label_by_pattern

    con = duckdb.connect()
    _seed(con)
    rows = {(r["county"], r["subdivision_name"]): r for r in aggregate_stats(con, label_by_pattern())}
    assert ("collier", "Heritage Bay") in rows
    assert rows[("collier", "Heritage Bay")]["home_count"] == 3
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest ingest/duckdb_pipelines/neighborhood_stats/test_agg.py -v`
Expected: FAIL — `aggregate_stats()` currently takes only one argument (`con`), so every new test errors with a `TypeError: aggregate_stats() takes 1 positional argument but 2 were given`.

- [ ] **Step 3: Implement the SQL-side fold**

Replace the entire `aggregate_stats` function in `ingest/duckdb_pipelines/neighborhood_stats/agg.py`:

```python
def aggregate_stats(
    con: duckdb.DuckDBPyConnection,
    alias_label_by_pattern: dict[str, str] | None = None,
) -> list[dict]:
    """Home count / count-by-type / median just-value per (county, subdivision_name)
    -- aggregate-at-source in DuckDB (communities-swfl Phase 1 T4, name-join variant).

    Reads a `parcel_subdivision` table already loaded into the connection (the
    pipeline glue loads it from `data_lake.parcel_subdivision` via the Postgres
    attach; kept out of this pure function so it's testable with an in-memory
    DuckDB table, no network/DB). Grouped on (county, subdivision_name) -- the
    name-join has no spatial subdivision_id, so that pair is the aggregation key.

    `alias_label_by_pattern` maps a stemmed raw subdivision_name -> its marketed
    community's canonical label (built from fixtures/community-aliases.json via
    ingest.lib.community_aliases.label_by_pattern() -- see pipeline.py). A raw
    name absent from the map keeps its own stemmed name, unchanged -- no guess,
    no invention, purely additive folding of names we hold real alias data for.

    THE FOLD RUNS IN SQL, BEFORE median() -- median_just_value is non-composable,
    so two raw names that alias to one community must be grouped together before
    the median is computed, never merged as a post-pass over two already-computed
    per-raw-name medians.
    """
    alias_label_by_pattern = alias_label_by_pattern or {}
    con.execute("DROP TABLE IF EXISTS _alias_map")
    con.execute("CREATE TEMP TABLE _alias_map(raw_name TEXT, canonical_label TEXT)")
    if alias_label_by_pattern:
        con.executemany(
            "INSERT INTO _alias_map VALUES (?, ?)",
            list(alias_label_by_pattern.items()),
        )
    con.execute("DROP TABLE IF EXISTS _resolved")
    con.execute("""
        CREATE TEMP TABLE _resolved AS
        SELECT p.*, COALESCE(a.canonical_label, p.subdivision_name) AS resolved_name
        FROM parcel_subdivision p
        LEFT JOIN _alias_map a ON a.raw_name = p.subdivision_name
    """)
    base = con.execute("""
        SELECT county, resolved_name, COUNT(*) AS home_count,
               median(just_value) AS median_just_value
        FROM _resolved
        GROUP BY county, resolved_name
    """).fetchall()
    by_type = con.execute("""
        SELECT county, resolved_name, property_type, COUNT(*) AS n
        FROM _resolved
        GROUP BY county, resolved_name, property_type
    """).fetchall()
    con.execute("DROP TABLE _resolved")
    con.execute("DROP TABLE _alias_map")

    types: dict[tuple[str, str], dict[str, int]] = {}
    for county, name, ptype, n in by_type:
        types.setdefault((county, name), {})[ptype or "unknown"] = int(n)

    today = date.today().isoformat()
    out = []
    for county, name, home_count, median_just_value in base:
        out.append({
            "county": county,
            "subdivision_name": name,
            "home_count": int(home_count),
            "count_by_type": types.get((county, name), {}),
            "median_just_value": (float(median_just_value) if median_just_value is not None else None),
            "source_url": "https://www.swfldatagulf.com/r/source/neighborhood_stats",
            "as_of": today,
        })
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest ingest/duckdb_pipelines/neighborhood_stats/test_agg.py -v`
Expected: PASS (all 8 tests — 4 existing + 4 new)

- [ ] **Step 5: Commit**

```bash
git add ingest/duckdb_pipelines/neighborhood_stats/agg.py ingest/duckdb_pipelines/neighborhood_stats/test_agg.py
git commit -m "feat(ingest): fold aliased subdivision names in SQL before median() in neighborhood_stats"
```

---

### Task 3: `pipeline.py` — wire the real fixture, replace instead of upsert

**Files:**
- Modify: `ingest/duckdb_pipelines/neighborhood_stats/pipeline.py`

**Interfaces:**
- Consumes: `label_by_pattern()` (Task 1), `aggregate_stats(con, alias_label_by_pattern)` (Task 2), `assert_min_rows` from `ingest/lib/guards.py` (already exists, unmodified).
- Produces: `main()`'s behavior — no importable interface change for other modules (no other module imports `pipeline.py`).

There is no existing test file for `pipeline.py` (only `agg.py` is unit tested; `pipeline.py` is a thin psycopg glue layer, consistent with existing practice in this pipeline). Verification is the `--dry-run` smoke step below, not a pytest step.

- [ ] **Step 1: Wire the real alias map into `_aggregate`**

In `ingest/duckdb_pipelines/neighborhood_stats/pipeline.py`, add to the imports:

```python
from ingest.lib.community_aliases import label_by_pattern
from ingest.lib.guards import assert_min_rows
```

Change the `_aggregate` function's return line:

```python
def _aggregate(rows: list[dict]) -> list[dict]:
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE parcel_subdivision(parcel_id TEXT, county TEXT, property_type TEXT, "
        "just_value DOUBLE, subdivision_name TEXT)"
    )
    if rows:
        con.executemany(
            "INSERT INTO parcel_subdivision VALUES (?, ?, ?, ?, ?)",
            [(r["parcel_id"], r["county"], r["property_type"], r["just_value"], r["subdivision_name"]) for r in rows],
        )
    return aggregate_stats(con, label_by_pattern())
```

- [ ] **Step 2: Replace `_upsert` with a guarded `_replace_all`**

Replace the `_UPSERT` constant and `_upsert` function with:

```python
_DELETE_ALL = "DELETE FROM data_lake.neighborhood_stats"

_INSERT = """
    INSERT INTO data_lake.neighborhood_stats
        (county, subdivision_name, home_count, count_by_type, median_just_value, source_url, as_of, updated_at)
    VALUES
        (%(county)s, %(subdivision_name)s, %(home_count)s, %(count_by_type)s, %(median_just_value)s, %(source_url)s, %(as_of)s, now())
"""


def _replace_all(conn, stats: list[dict]) -> None:
    # FULL REPLACE, NOT UPSERT (07/15/2026) -- this pipeline recomputes the COMPLETE set
    # every run from a full data_lake.parcel_subdivision scan (no incremental read), so a
    # plain upsert on (county, subdivision_name) would ORPHAN any row whose key changed
    # since the last run -- e.g. an alias fold that newly collapses two raw names under one
    # canonical label leaves the OLD raw-keyed row sitting alongside the new one, double-
    # counting those homes. Guarded by assert_min_rows so a near-empty `stats` (a broken
    # run) aborts loud before wiping the table -- see ingest/lib/guards.py.
    assert_min_rows(len(stats), 1, "neighborhood_stats")
    with conn.cursor() as cur:
        cur.execute(_DELETE_ALL)
        for s in stats:
            cur.execute(_INSERT, {**s, "count_by_type": json.dumps(s["count_by_type"])})
    conn.commit()
```

- [ ] **Step 3: Update `main()`'s call site**

Change the write step in `main()`:

```python
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Aggregate parcel_subdivision -> neighborhood_stats.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read + aggregate only; print counts + sample; skip the neighborhood_stats write.",
    )
    args = parser.parse_args(argv)

    conn = _get_connection()
    try:
        rows = _load_parcel_subdivision_rows(conn)
        stats = _aggregate(rows)
        print(f"neighborhood_stats: {len(rows)} parcel rows -> {len(stats)} (county, subdivision) groups")
        if stats:
            print("sample:", stats[0])
        if args.dry_run:
            return 0
        _replace_all(conn, stats)
        print(f"neighborhood_stats: replaced with {len(stats)} rows")
        return 0
    finally:
        conn.close()
```

- [ ] **Step 4: Smoke-test with `--dry-run`**

Run: `python -m ingest.duckdb_pipelines.neighborhood_stats.pipeline --dry-run`
Expected: prints `neighborhood_stats: 604362 parcel rows -> N (county, subdivision) groups` (N should now be at or below the pre-fix 31,110 — the alias fold can only collapse rows, never add new ones) and a sample row whose `subdivision_name` is `"Heritage Bay"` (not `"HERITAGE BAY"`) if any Heritage Bay parcel is in that sample. No write happens on `--dry-run`, so this is safe to run against production Postgres credentials.

- [ ] **Step 5: Commit**

```bash
git add ingest/duckdb_pipelines/neighborhood_stats/pipeline.py
git commit -m "feat(ingest): wire the real alias fixture into neighborhood_stats + replace instead of upsert"
```

---

### Task 4: `lib/listings/community-lookup.ts` — join-key lockstep + citation line

**Files:**
- Modify: `lib/listings/community-lookup.ts`
- Test: `lib/listings/community-lookup.test.ts`

**Interfaces:**
- Consumes: `communityForSubdivision`, `COMMUNITY_ALIASES` from `@/refinery/lib/subdivision-aliases.mts` (both already exist, already exported).
- Produces:
  - `canonicalCommunityKey(rawSubdivisionName: string): string` — the TS-side twin of Task 1's `label_by_pattern`.
  - `ResolvedCommunityStats` type — `{ subdivisionName: string; homeCount: number | null; medianJustValue: number | null; countByType: Record<string, number> | null; sourceUrl: string; asOf: string | null }`. Task 5 (`ListingFacts.communityStats`) and Task 7 (`under-contract.ts`) both import this.
  - `neighborhoodStatsSourceLine(stats: ResolvedCommunityStats | undefined): string | null`. Task 6 (`shared.ts`) and Task 7 (`under-contract.ts`) both import this.
  - `resolveCommunityStats` and `resolveCommunityForListing` behavior changes (same exported names, same call signatures) — both now apply the alias transform before touching `neighborhood_stats`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/listings/community-lookup.test.ts` (after the existing `resolveCommunityForAddress` tests, same file, same imports style — add `canonicalCommunityKey`, `neighborhoodStatsSourceLine` to the existing `await import("./community-lookup")` destructure at the top):

```ts
// ── canonicalCommunityKey (pure, reads the REAL shared fixture) ─────────────────────────

test("canonicalCommunityKey rolls a known raw name up to its canonical label", () => {
  expect(canonicalCommunityKey("HERITAGE BAY")).toBe("Heritage Bay");
});

test("canonicalCommunityKey passes an unresolved raw name through unchanged", () => {
  expect(canonicalCommunityKey("SOME UNMAPPED SUBDIVISION")).toBe("SOME UNMAPPED SUBDIVISION");
});

// ── neighborhoodStatsSourceLine (pure) ───────────────────────────────────────────────────

test("neighborhoodStatsSourceLine cites home count and median assessed value", () => {
  const line = neighborhoodStatsSourceLine({
    subdivisionName: "Heritage Bay",
    homeCount: 1900,
    medianJustValue: 612000,
    countByType: null,
    sourceUrl: "https://www.swfldatagulf.com/r/source/neighborhood_stats",
    asOf: "2026-07-14",
  });
  expect(line).toContain("Heritage Bay");
  expect(line).toContain("1,900");
  expect(line).toContain("$612,000");
  expect(line).toContain("07/14/2026");
  expect(line).toMatch(/assessed/i);
});

test("neighborhoodStatsSourceLine is null when stats are absent", () => {
  expect(neighborhoodStatsSourceLine(undefined)).toBeNull();
});

test("neighborhoodStatsSourceLine is null when either figure is missing -- never a partial guess", () => {
  expect(
    neighborhoodStatsSourceLine({
      subdivisionName: "Heritage Bay",
      homeCount: 1900,
      medianJustValue: null,
      countByType: null,
      sourceUrl: "x",
      asOf: "2026-07-14",
    }),
  ).toBeNull();
});

// ── resolveCommunityForListing (impure orchestrator) -- still resolves through the mock ──

test("resolveCommunityForListing returns the canonical label, not the raw name, when matched", async () => {
  rowsForNextCall = [
    { county: "collier", subdivision_name: "HERITAGE BAY", zip: "34119", phy_addr1: "100 BAY LN" },
  ];
  const result = await resolveCommunityForListing("100 Bay Ln", "34119");
  expect(result.matched).toBe(true);
  if (result.matched) {
    expect(result.subdivisionName).toBe("Heritage Bay");
  }
});
```

Also update the destructuring import line near the top of the test file:

```ts
const { matchSubdivision, houseNumberToken, resolveCommunityForAddress, resolveCommunityForListing, canonicalCommunityKey, neighborhoodStatsSourceLine } =
  await import("./community-lookup");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/listings/community-lookup.test.ts`
Expected: FAIL — `canonicalCommunityKey`/`neighborhoodStatsSourceLine`/`resolveCommunityForListing` (new export usage) are undefined or don't exist yet.

- [ ] **Step 3: Implement the lockstep transform, the citation line, and the source-supply comment**

Add near the top of `lib/listings/community-lookup.ts`, right after the existing file-header comment block (before the `import` statements is fine, or right after them — place after the existing imports):

```ts
import { communityForSubdivision, COMMUNITY_ALIASES } from "@/refinery/lib/subdivision-aliases.mts";
```

Add this comment block right after the imports, before `const SCHEMA = "data_lake";`:

```ts
// SOURCE-SUPPLY NOTE (07/15/2026): data_lake.parcel_subdivision (queried below) carries MORE
// than county/subdivision_name/zip/phy_addr1 -- the FDOR ingest (ingest/pipelines/
// parcel_subdivision/) also pulls sale_price_1/2 + sale dates + qualification codes,
// living_area_sqft, actual_year_built, effective_year_built, land_value, building_count,
// residential_unit_count, neighborhood_code, market_area, and assessment_year. NONE of that
// rolls into neighborhood_stats or ResolvedCommunityStats today -- home_count/
// median_just_value/count_by_type only. Extending the rollup (e.g. "typical year built" or
// "average living area" per neighborhood) is a one-line SQL change to agg.py's queries, NOT a
// new ingest decision -- check here before reaching for crawl4ai or a new scrape for anything
// that turns out to already be a tax-roll concept. True marketing/amenity concepts (golf,
// gate, pool, HOA fee, clubhouse) are NOT in any government parcel layer and genuinely need
// the named-web-source lane (see the deferred community_profiles scrape, check
// community_profiles_zero_coverage).
```

Add this function right before `resolveCommunityStats`:

```ts
/** Roll a raw stemmed subdivision_name up to its marketed-community CANONICAL LABEL when
 *  the alias map resolves it (e.g. "HERITAGE BAY" -> "Heritage Bay"), else return the raw
 *  name unchanged. MUST match the fold `ingest/duckdb_pipelines/neighborhood_stats/agg.py`
 *  applies before grouping (both read the same fixtures/community-aliases.json) -- this is
 *  the join-key lockstep the resolver below depends on: neighborhood_stats stores rows keyed
 *  by this same canonical-or-raw label, so a lookup that skipped this step would silently
 *  miss every row the ingest side folds. */
export function canonicalCommunityKey(rawSubdivisionName: string): string {
  const slug = communityForSubdivision(rawSubdivisionName);
  return slug && COMMUNITY_ALIASES[slug] ? COMMUNITY_ALIASES[slug].label : rawSubdivisionName;
}
```

Modify `resolveCommunityStats` — change only the lookup line, keep everything else identical:

```ts
export async function resolveCommunityStats(
  county: string,
  subdivisionName: string,
): Promise<CommunityStats | null> {
  if (!county || !subdivisionName) return null;
  const key = canonicalCommunityKey(subdivisionName);
  try {
    const db = createServiceRoleClientUntyped();
    const { data } = await db
      .schema(SCHEMA)
      .from(NEIGHBORHOOD_TABLE)
      .select("home_count, count_by_type, median_just_value, source_url, as_of")
      .eq("county", county)
      .eq("subdivision_name", key)
      .limit(1);
    if (!Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as NeighborhoodStatRow;

    let countByType: Record<string, number> | null = null;
    if (row.count_by_type && typeof row.count_by_type === "object") {
      countByType = row.count_by_type;
    } else if (typeof row.count_by_type === "string") {
      try {
        countByType = JSON.parse(row.count_by_type) as Record<string, number>;
      } catch {
        countByType = null;
      }
    }

    return {
      homeCount: row.home_count,
      countByType,
      medianJustValue: row.median_just_value,
      sourceUrl: row.source_url ?? "",
      asOf: row.as_of,
    };
  } catch {
    return null;
  }
}
```

Modify `resolveCommunityForListing` — report the canonical name in the result:

```ts
export async function resolveCommunityForListing(
  street: string,
  zip: string,
): Promise<CommunityForListing> {
  const resolution = await resolveCommunityForAddress(street, zip);
  if (!resolution.matched) {
    return { matched: false, reason: resolution.reason };
  }
  const stats = await resolveCommunityStats(resolution.county, resolution.subdivisionName);
  return {
    matched: true,
    county: resolution.county,
    subdivisionName: canonicalCommunityKey(resolution.subdivisionName),
    homeCount: stats?.homeCount ?? null,
    countByType: stats?.countByType ?? null,
    medianJustValue: stats?.medianJustValue ?? null,
    sourceUrl: stats?.sourceUrl ?? "",
    asOf: stats?.asOf ?? null,
  };
}
```

Add these two exports at the end of the file:

```ts
/** The shape `ListingFacts.communityStats` carries -- a listing's resolved-address
 *  neighborhood stats, ready to cite in a deliverable. */
export type ResolvedCommunityStats = {
  subdivisionName: string;
  homeCount: number | null;
  medianJustValue: number | null;
  countByType: Record<string, number> | null;
  sourceUrl: string;
  asOf: string | null;
};

function toMmDdYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

/** THE NEIGHBORHOOD, from our own tax-roll parcel data -- universal (every home in Lee +
 *  Collier), unlike `communitySourceLine`'s opportunistic per-listing vendor scrape. ONE
 *  AUTHORITY -- every recipe that cites the resolved neighborhood stats reads it from here.
 *  `median_just_value` is FDOR ASSESSED value, never a sale or list price -- the wording
 *  below is the only phrasing a narrator may use for that number. Returns null when either
 *  figure is absent -- absence stays SILENT, never "no data for this neighborhood". */
export function neighborhoodStatsSourceLine(
  stats: ResolvedCommunityStats | undefined,
): string | null {
  if (!stats || stats.homeCount == null || stats.medianJustValue == null) return null;
  const homes = stats.homeCount.toLocaleString("en-US");
  const value = `$${Math.round(stats.medianJustValue).toLocaleString("en-US")}`;
  const asOf = stats.asOf ? ` as of ${toMmDdYyyy(stats.asOf)}` : "";
  return (
    `THE NEIGHBORHOOD (${stats.subdivisionName}), from the tax roll${asOf}: ${homes} homes, ` +
    `median ASSESSED value ${value}. This is an assessed value, not a sale or list price -- ` +
    `never call it "median home price" or say homes "sell for" this figure.`
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/listings/community-lookup.test.ts`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Commit**

```bash
git add lib/listings/community-lookup.ts lib/listings/community-lookup.test.ts
git commit -m "feat(listings): join-key lockstep for the neighborhood-stats resolver + citation line"
```

---

### Task 5: `lib/email/listing-scrape.ts` — `ListingFacts.communityStats`

**Files:**
- Modify: `lib/email/listing-scrape.ts`

**Interfaces:**
- Consumes: `ResolvedCommunityStats` (Task 4).
- Produces: `ListingFacts.communityStats?: ResolvedCommunityStats` — Task 6 and Task 7 both read/write this field.

No dedicated test for a type-only change — Task 6's test exercises it end to end.

- [ ] **Step 1: Add the field and its import**

In `lib/email/listing-scrape.ts`, add to the imports:

```ts
import type { ResolvedCommunityStats } from "@/lib/listings/community-lookup";
```

Add to the `ListingFacts` interface, right after the existing `community?: ListingDetailFacts;` field:

```ts
  /** THE NEIGHBORHOOD -- home count + median ASSESSED value, resolved from this listing's
   *  street address against our own tax-roll parcel data (universal: every home in Lee +
   *  Collier, unlike `community` above which only covers listings we could scrape). Absent
   *  when the address didn't resolve to exactly one subdivision (no parcel found, or an
   *  address that spans 2+ distinct subdivisions -- e.g. a condo tower -- never a guess).
   *  Different provenance from `community`; never merged into it, never let one impersonate
   *  the other in citation language. */
  communityStats?: ResolvedCommunityStats;
```

- [ ] **Step 2: Typecheck**

Run: `bunx next build` (this repo's standard verification command — never `npx tsc`, which misses Next.js-specific type errors this build catches)
Expected: build succeeds, no new type errors introduced by this field addition.

- [ ] **Step 3: Commit**

```bash
git add lib/email/listing-scrape.ts
git commit -m "feat(email): add ListingFacts.communityStats"
```

---

### Task 6: `lib/deliverable/recipes/shared.ts` — resolve + narrate

**Files:**
- Modify: `lib/deliverable/recipes/shared.ts`
- Test (new): `lib/deliverable/recipes/shared.test.ts`

**Interfaces:**
- Consumes: `resolveCommunityForListing` (Task 4), `ListingFacts.communityStats` (Task 5), `neighborhoodStatsSourceLine` (Task 4).
- Produces: `resolveSubject()`'s behavior change (same signature `(address: string, prompt: string) => Promise<ResolvedSubject>`) — now populates `facts.communityStats` when the address resolves. `authorListingNarrative()`'s behavior change (same signature) — now cites the neighborhood stats when present. Every recipe that already calls these two functions (new-listing, coming-soon, just-sold, open-house, price-reduced, under-contract) gets this automatically, with zero changes to those recipe files.

- [ ] **Step 1: Write the failing tests**

Create `lib/deliverable/recipes/shared.test.ts`:

```ts
// lib/deliverable/recipes/shared.test.ts
import { test, expect, mock, afterAll } from "bun:test";

const realResolveSubject = await import("@/lib/listings/resolve-subject");
const realCommunityLookup = await import("@/lib/listings/community-lookup");

afterAll(() => {
  mock.module("@/lib/listings/resolve-subject", () => realResolveSubject);
  mock.module("@/lib/listings/community-lookup", () => realCommunityLookup);
});

let communityResult: unknown = { matched: false, reason: "no_parcel_at_address" };

mock.module("@/lib/listings/resolve-subject", () => ({
  ...realResolveSubject,
  resolveSubjectListing: async () => null,
}));
mock.module("@/lib/listings/community-lookup", () => ({
  ...realCommunityLookup,
  resolveCommunityForListing: async () => communityResult,
}));

const { resolveSubject } = await import("./shared");

test("resolveSubject attaches communityStats when the address resolves to a neighborhood", async () => {
  communityResult = {
    matched: true,
    county: "collier",
    subdivisionName: "Heritage Bay",
    homeCount: 1900,
    medianJustValue: 612000,
    countByType: { "single-family": 1200, condominium: 700 },
    sourceUrl: "https://www.swfldatagulf.com/r/source/neighborhood_stats",
    asOf: "2026-07-14",
  };
  const { facts } = await resolveSubject("123 Main St, Naples, FL 34102", "");
  expect(facts.communityStats).toEqual({
    subdivisionName: "Heritage Bay",
    homeCount: 1900,
    medianJustValue: 612000,
    countByType: { "single-family": 1200, condominium: 700 },
    sourceUrl: "https://www.swfldatagulf.com/r/source/neighborhood_stats",
    asOf: "2026-07-14",
  });
});

test("resolveSubject leaves communityStats undefined when the address does not resolve", async () => {
  communityResult = { matched: false, reason: "no_parcel_at_address" };
  const { facts } = await resolveSubject("123 Main St, Naples, FL 34102", "");
  expect(facts.communityStats).toBeUndefined();
});

test("resolveSubject leaves communityStats undefined when the address string carries no ZIP", async () => {
  communityResult = {
    matched: true,
    county: "collier",
    subdivisionName: "Heritage Bay",
    homeCount: 1900,
    medianJustValue: 612000,
    countByType: null,
    sourceUrl: "x",
    asOf: "2026-07-14",
  };
  const { facts } = await resolveSubject("123 Main St", "");
  // No comma segment carrying a 5-digit ZIP -> the community lookup is never called
  // (short-circuits to Promise.resolve(null)), regardless of what the mock above returns.
  expect(facts.communityStats).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/deliverable/recipes/shared.test.ts`
Expected: FAIL — `facts.communityStats` is `undefined` in the first test (the field is never set yet).

- [ ] **Step 3: Wire `resolveSubject()`**

In `lib/deliverable/recipes/shared.ts`, add to the imports:

```ts
import { resolveCommunityForListing } from "@/lib/listings/community-lookup";
```

Replace the `resolveSubject` function body:

```ts
// A 5-digit ZIP, optionally with a +4 suffix, read from the LAST comma-segment of the raw
// address string (typically "..., FL 34102") -- independent of geocoding, so this can run
// in PARALLEL with the vendor listing lookup below rather than waiting on its result. Only
// searches the last segment, not the whole string, so a 5-digit HOUSE NUMBER (e.g.
// "10500 Main St, Naples, FL 34102") is never mistaken for the ZIP.
function zip5From(address: string): string {
  const lastSegment = String(address ?? "").split(",").pop() ?? "";
  const m = /\b(\d{5})(?:-\d{4})?\b/.exec(lastSegment);
  return m ? m[1] : "";
}

export async function resolveSubject(address: string, prompt: string): Promise<ResolvedSubject> {
  const zip = zip5From(address);
  const [hit, communityForListing] = await Promise.all([
    resolveSubjectListing(address).catch(() => null),
    zip ? resolveCommunityForListing(address, zip).catch(() => null) : Promise.resolve(null),
  ]);
  const facts: ListingFacts = hit ?? { address, photos: [], sourceUrl: BASE_URL };
  if (communityForListing && (communityForListing as { matched: boolean }).matched) {
    const c = communityForListing as {
      matched: true;
      subdivisionName: string;
      homeCount: number | null;
      medianJustValue: number | null;
      countByType: Record<string, number> | null;
      sourceUrl: string;
      asOf: string | null;
    };
    facts.communityStats = {
      subdivisionName: c.subdivisionName,
      homeCount: c.homeCount,
      medianJustValue: c.medianJustValue,
      countByType: c.countByType,
      sourceUrl: c.sourceUrl,
      asOf: c.asOf,
    };
  }

  // LANE 2 — the agent's own words. Never overwrites a description the record
  // already carries; it fills the gap the feed leaves.
  if (!facts.remarks) {
    const pasted = listingDescriptionFromPrompt(prompt);
    if (pasted) facts.remarks = pasted;
  }

  if (facts.photos[0]) {
    const mirrored = await mirrorHeroPhoto(facts.photos[0]).catch(() => null);
    if (mirrored) facts.photos[0] = mirrored;
  }

  return { facts, resolved: Boolean(hit) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/deliverable/recipes/shared.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Wire `authorListingNarrative`'s lines array and system prompt**

Add to the imports:

```ts
import { neighborhoodStatsSourceLine } from "@/lib/listings/community-lookup";
```

In `authorListingNarrative`'s `lines` array, add `neighborhoodStatsSourceLine(facts.communityStats)` right after the existing `communitySourceLine(facts.community)` line:

```ts
    communitySourceLine(facts.community),
    neighborhoodStatsSourceLine(facts.communityStats),
    opts.context && `Background context (NOT the subject of this email):\n${opts.context}`,
```

In the system prompt string, right after the existing `` `THE COMMUNITY. If — and ONLY if — a "THE COMMUNITY" fact line is present above, ...` `` block (ending `...Return ONLY the paragraph.`), insert a new block BEFORE the final `Return ONLY the paragraph.` line:

```ts
    // The community line is the ONE thing that lifts the golf/pool/gate prohibition above —
    // and only for the community, only when the fact is actually present.
    `THE COMMUNITY. If — and ONLY if — a "THE COMMUNITY" fact line is present above, you may ` +
    `say that the COMMUNITY has golf, a pool, a clubhouse, tennis, or that it is gated. Name ` +
    `only what that line lists. These belong to the COMMUNITY, never to this house: "the ` +
    `community has a pool" is allowed, "the home has a pool" is a fabrication and the ` +
    `paragraph is thrown away. If there is NO community line, say NOTHING about golf, a pool, ` +
    `a gate or amenities — its absence means we could not read the page, NOT that the ` +
    `community lacks them. Never write that a community lacks something.\n\n` +
    `THE NEIGHBORHOOD. If — and ONLY if — a "THE NEIGHBORHOOD" fact line is present above, you ` +
    `may restate ONLY the home count and median value it states, word for word. This is an ` +
    `ASSESSED value from the tax roll, not a sale or list price — never call it "median home ` +
    `price" or say homes in this neighborhood "sell for" this figure. Never invent a trend, a ` +
    `comparison to another neighborhood, or a characterization of whether the value is high or ` +
    `low — that is a claim, not a restatement. If there is NO "THE NEIGHBORHOOD" line, say ` +
    `NOTHING about neighborhood home counts or values.\n\n` +
    `Return ONLY the paragraph.`;
```

(This replaces the existing block that ends `...Never write that a community lacks something.\n\n` + `` `Return ONLY the paragraph.`; `` — the new "THE NEIGHBORHOOD" paragraph is inserted between them.)

- [ ] **Step 6: Run the full recipe test suite to confirm no regression**

Run: `bun test lib/deliverable/recipes/`
Expected: PASS — every existing recipe test (new-listing, coming-soon, just-sold, open-house, price-reduced, under-contract, market-comps) still passes. `neighborhoodStatsSourceLine(facts.communityStats)` returns `null` whenever `facts.communityStats` is `undefined` (the case in every existing fixture-based test, since none of them set that field), and `authorListingNarrative`'s `.filter(Boolean)` on `lines` already drops `null` entries — so no existing test's narrator input or expected output changes.

- [ ] **Step 7: Commit**

```bash
git add lib/deliverable/recipes/shared.ts lib/deliverable/recipes/shared.test.ts
git commit -m "feat(deliverable): wire resolved neighborhood stats into the shared subject resolver + narrator"
```

---

### Task 7: `lib/deliverable/recipes/under-contract.ts` — settled-claim wiring

**Files:**
- Modify: `lib/deliverable/recipes/under-contract.ts`
- Test: `lib/deliverable/recipes/under-contract.test.ts`

**Interfaces:**
- Consumes: `neighborhoodStatsSourceLine`, `ResolvedCommunityStats` (Task 4), `ListingFacts.communityStats` (Task 5).
- Produces: `settleCommunityStats(stats: ResolvedCommunityStats | undefined): SettledClaim | null` (new export). `settleAll(facts, timing)` — same signature, now also includes the neighborhood-stats claim in its returned array when present.

**Note on divergence from the spec doc:** the spec described this as "patch under-contract's `inventedAttributes` sourceText." Reading the actual code (`narratorSources()`, `settleAll()`, `NarratorInput`) shows the correct integration point is `settleAll()`/`SettledClaim`, not `inventedAttributes` — `inventedAttributes` only checks a fixed word list (`ATTRIBUTE_CLAIMS`: dock, pool, waterfront, etc.), and a home count / dollar figure was never going to trip it. Numbers in this recipe are gated by `auditClaims` against `NarratorInput.settled`, which `narratorSources()` already renders into the prompt via its own `input.settled.map(...)` line — so adding a `SettledClaim` to `settleAll`'s output is sufficient; `NarratorInput` needs no new field, and the call site building `NarratorInput` needs no change.

- [ ] **Step 1: Write the failing tests**

Add to `lib/deliverable/recipes/under-contract.test.ts` (add `settleCommunityStats` to the existing import list from `"./under-contract"`, alongside `narratorSources`, `proseViolations`, `settleAll` — add `settleAll` and `settleStatus` to that import list too if not already present):

```ts
describe("settleCommunityStats — the neighborhood-stats settled claim", () => {
  const STATS = {
    subdivisionName: "Heritage Bay",
    homeCount: 1900,
    medianJustValue: 612000,
    countByType: null,
    sourceUrl: "https://www.swfldatagulf.com/r/source/neighborhood_stats",
    asOf: "2026-07-14",
  };

  it("settles the fact and anchors both numerals when present", () => {
    const claim = settleCommunityStats(STATS);
    expect(claim).not.toBeNull();
    expect(claim!.anchors).toContain("1900");
    expect(claim!.anchors).toContain("612000");
    expect(claim!.sentence).toContain("Heritage Bay");
  });

  it("returns null when absent", () => {
    expect(settleCommunityStats(undefined)).toBeNull();
  });

  it("settleAll includes it when facts.communityStats is present", () => {
    const facts = {
      address: "123 Main St",
      photos: [],
      sourceUrl: "x",
      communityStats: STATS,
    } as unknown as ListingFacts;
    const settled = settleAll(facts, null);
    expect(settled.some((s) => s.sentence.includes("Heritage Bay"))).toBe(true);
  });

  it("a paragraph restating the settled neighborhood numbers survives proseViolations", () => {
    const settled = [settleStatus(), settleCommunityStats(STATS)!];
    const sourceText = narratorSources({ settled, community: undefined }).join(" ");
    const paragraph =
      "This home is under contract. The tax roll counts 1,900 homes in this neighborhood, " +
      "with a median assessed value of $612,000.";
    expect(proseViolations(paragraph, sourceText, settled)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/deliverable/recipes/under-contract.test.ts`
Expected: FAIL — `settleCommunityStats` is not exported yet.

- [ ] **Step 3: Implement**

Add to the imports in `lib/deliverable/recipes/under-contract.ts`:

```ts
import { neighborhoodStatsSourceLine } from "@/lib/listings/community-lookup";
import type { ResolvedCommunityStats } from "@/lib/listings/community-lookup";
```

Add this function right after `settleNewConstruction` (before `settlePriceCut`):

```ts
/** THE NEIGHBORHOOD, as a SETTLED SENTENCE — home count + median ASSESSED value from our
 *  own tax-roll parcel data, resolved from the listing's street address. Its two numerals
 *  become ANCHORS the same way `settlePriceCut`'s do, so `auditClaims` accepts the narrator
 *  restating them and rejects anything else numeric it might add. PURE. */
export function settleCommunityStats(
  stats: ResolvedCommunityStats | undefined,
): SettledClaim | null {
  const line = neighborhoodStatsSourceLine(stats);
  if (!line) return null;
  return { sentence: line, anchors: numeralsIn(line) };
}
```

Modify `settleAll`:

```ts
export function settleAll(facts: ListingFacts, timing: MarketTiming | null): SettledClaim[] {
  return [
    settleStatus(),
    settleNewConstruction(facts),
    settlePriceCut(facts),
    settleAreaTiming(timing),
    settleCommunityStats(facts.communityStats),
  ].filter((s): s is SettledClaim => s !== null);
}
```

The call site building `NarratorInput` (around the existing `const input: NarratorInput = { settled: settleAll(facts, timing), remarks: facts.remarks, community: facts.community };`) needs **no change** — it already calls `settleAll(facts, timing)`, which now includes the new claim automatically.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/deliverable/recipes/under-contract.test.ts`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Commit**

```bash
git add lib/deliverable/recipes/under-contract.ts lib/deliverable/recipes/under-contract.test.ts
git commit -m "feat(deliverable): settle the neighborhood-stats claim in under-contract's narrator"
```

---

### Task 8: `market-comps.test.ts` — confirm zero exposure

**Files:**
- Modify: `lib/deliverable/recipes/market-comps.test.ts`

No production code change in this task. `market-comps.ts`'s ONLY funnel of `ListingFacts` into the narrator is `narratorClaims(facts, pc)` (confirmed by reading the file — it enumerates specific fields it reads: `facts.price`, `facts.beds`, `facts.baths`, `facts.sqft`, `facts.lotSize`; it never reads `facts.communityStats`), and `buildNarratorPrompt(facts, pc)` builds its `settled` array from that same `narratorClaims` call. So there is structurally no path for `communityStats` to reach market-comps' model prompt today. This task adds a regression test that proves it, so a future refactor of `narratorClaims` can't accidentally wire it in without a test catching it.

- [ ] **Step 1: Write the test**

Add to `lib/deliverable/recipes/market-comps.test.ts`. Add `narratorClaims` and `buildPriceCase` to the existing import list from `"./market-comps"` at the top of the file if not already present (both already appear in that file's existing imports per its current content):

```ts
describe("market-comps stays excluded from communityStats — same reasoning as its community-word ban", () => {
  it("narratorClaims never surfaces facts.communityStats, even when present", () => {
    const subjectWithStats: ListingFacts = {
      ...SUBJECT,
      communityStats: {
        subdivisionName: "Heritage Bay",
        homeCount: 1900,
        medianJustValue: 612000,
        countByType: null,
        sourceUrl: "x",
        asOf: "2026-07-14",
      },
    };
    const pc = buildPriceCase(subjectWithStats, HOMES);
    if (!pc) throw new Error("no case");
    const claims = narratorClaims(subjectWithStats, pc);
    expect(claims.some((c) => c.sentence.includes("Heritage Bay"))).toBe(false);
    expect(claims.some((c) => /\b612,000\b/.test(c.sentence))).toBe(false);
  });
});
```

(`SUBJECT` and `HOMES` are this file's own existing top-level fixtures — `SUBJECT` is the known-good subject `ListingFacts` defined near the top of the file, `HOMES` is `NEARBY.filter(...)` a few lines below it. `buildPriceCase(facts, HOMES)` and `narratorClaims(facts, pc)` are both already imported and already used elsewhere in this file — e.g. `const pc = buildPriceCase(SUBJECT, HOMES);` — reuse that exact call shape.)

- [ ] **Step 2: Run the test**

Run: `bun test lib/deliverable/recipes/market-comps.test.ts`
Expected: PASS — since `market-comps.ts`'s narrator-context builder never reads `facts.communityStats` to begin with, this passes without any production code change.

- [ ] **Step 3: Commit**

```bash
git add lib/deliverable/recipes/market-comps.test.ts
git commit -m "test(deliverable): lock in market-comps' zero exposure to communityStats"
```

---

### Task 9: Correct the `community_facts_remaining_recipes` check

**Files:** none (check-ledger only, via `scripts/check.mjs`)

- [ ] **Step 1: Verify current behavior against the code**

By this point in the plan, Tasks 6–8 have already proven (via passing tests) that `new-listing`, `coming-soon`, `just-sold`, `open-house`, `price-reduced`, and `under-contract` all consume `facts.community` (the vendor-scrape line) through the shared `authorListingNarrative`/`settleAll` paths, and `market-comps` deliberately excludes it. This directly contradicts the open check's claim that "only under-contract consumes them."

- [ ] **Step 2: Close or correct the check with evidence**

Run:

```bash
node scripts/check.mjs close community_facts_remaining_recipes --evidence "Verified against code 07/15/2026: new-listing.ts, coming-soon.ts, just-sold.ts, open-house.ts, price-reduced.ts, and under-contract.ts all call the shared authorListingNarrative (lib/deliverable/recipes/shared.ts) with the full facts object, so facts.community already rides through via communitySourceLine — confirmed by shared.ts's own comment ('Every recipe on this shared narrator... gets it from this one line') and by every recipe's authorListingNarrative(facts, ...) call site passing the unmodified facts object. market-comps.ts excludes it by design (absolute location-claim ban). This check predates that consolidation or was opened against a stale read; the wiring it asks for is already in place. Closed during the community-stats-deliverable-wiring build."
```

Expected: `close` succeeds (the check requires `--evidence`, matching the pattern used earlier this session to close `fdor_parcel_layer_only_7_of_120_fields`).

If the evidence step instead surfaces a real, still-open gap (e.g., one specific recipe turns out not to call the shared narrator after all), do NOT close the check — correct its text instead via `node scripts/check.mjs open <project> community_facts_remaining_recipes "<corrected description>"` is not idempotent for re-opening the same key, so in that case leave the check open and note the discrepancy for the operator rather than silently closing it.

---

### Task 10: Gap 2 handoff doc + follow-up check

**Files:**
- Create: `docs/handoff/2026-07-15-community-lookup-by-name-gap2-handoff.md`

This is documentation only, written after every code task above is complete — per the operator's explicit instruction ("make sure you add a handoff and open a follow up at the end for gap 2").

- [ ] **Step 1: Write the handoff doc**

Create `docs/handoff/2026-07-15-community-lookup-by-name-gap2-handoff.md`:

```markdown
# Gap 2 — a name-keyed community lookup surface (handoff, 07/15/2026)

**What this is NOT:** the address-resolved neighborhood stats now flowing into deliverables
(this session's build — see `docs/superpowers/specs/2026-07-15-community-stats-deliverable-
wiring-design.md` and `docs/superpowers/plans/2026-07-15-community-stats-deliverable-wiring.md`).
That work is done: a listing's street address resolves to its neighborhood's home count and
median assessed value via `lib/listings/community-lookup.ts`, and it now rides into every
listing-lifecycle email through the shared narrator.

**What this IS:** a different consumer, a different shape. `data_lake.neighborhood_stats` holds
~31,000 rows (one per Lee/Collier subdivision, alias-folded where the fixture covers it — see
Task 2 of the plan above). Only ~300 of those are the marketed golf/gated communities
`communities-swfl`'s `detail_tables` surfaces today (and that table, `data_lake.community_profiles`,
is still 0 rows — separate, tracked gap: `community_profiles_zero_coverage`). The other ~30,800
rows have NO lookup path by name at all today — nothing in `lib/` or `app/` lets a chat/MCP answer
resolve "what's the deal with Livingston Woods" to a real row, the way an address resolves for a
listing.

## Why this wasn't built this round

It serves a different consumer (chat/MCP general-knowledge answers) than what this round's build
served (a specific listing's deliverable, which only ever needs ITS OWN resolved address — Gap 1 +
the wiring above is sufficient for that). Building a general name-keyed lookup is a genuinely
different design decision with real tradeoffs, not a mechanical extension of the address resolver.

## Two shapes to brainstorm (per RULE 3.5 — do not skip straight to building)

1. **Extend `communities-swfl`'s `detail_tables`** (`refinery/packs/communities-swfl.mts`) to also
   emit rows from `neighborhood_stats` directly, keyed on `(county, subdivision_name)`, for
   communities absent from `community_profiles`. Keeps everything in the one brain's output; the
   tradeoff is `detail_tables` growing from ~300 rows to ~31,000, which may need its own pagination/
   grain thinking before it fits the existing `BrainOutput` contract.
2. **A dedicated single-community "drill" read**, mirroring the existing per-ZIP detail-row drill
   pattern already live in `app/api/mcp/server.ts` (`resolveOrigin()` / single-brain drill, Fix B) —
   same shape, different key (`community_slug`/subdivision name instead of ZIP). Keeps
   `communities-swfl`'s own output small; the tradeoff is a new route/surface to build and maintain.

## Before building either shape: check the source-supply note

`lib/listings/community-lookup.ts` carries a 07/15/2026 comment listing exactly what
`data_lake.parcel_subdivision` already supplies beyond `home_count`/`median_just_value`
(sale price/date, living area, year built, land value, building count, etc.) — real tax-roll data,
zero extra ingest. Whichever shape gets built, check that comment (and `cadence_registry.yaml`'s
`parcel_subdivision` `source_scope`, which renders on `/ops/census`) before reaching for crawl4ai
for anything that turns out to already be sitting in that table.
```

- [ ] **Step 2: Open the follow-up check**

Run:

```bash
node scripts/check.mjs open communities-swfl gap2_community_lookup_by_name "A name-keyed lookup surface for the ~30,800 non-marketed neighborhood_stats rows is still missing (chat/MCP consumer, distinct from the address-resolved deliverable wiring shipped 07/15/2026). Two candidate shapes brainstormed but not decided: extend communities-swfl's detail_tables, or a dedicated single-community drill route mirroring the per-ZIP pattern in app/api/mcp/server.ts. Needs its own RULE-3.5 brainstorm before building -- see docs/handoff/2026-07-15-community-lookup-by-name-gap2-handoff.md."
```

- [ ] **Step 3: Commit the handoff doc**

```bash
git add docs/handoff/2026-07-15-community-lookup-by-name-gap2-handoff.md
git commit -m "docs: Gap 2 handoff -- name-keyed community lookup surface, not built this round"
```

---

## Final verification (after all 10 tasks)

- [ ] Run the full TS test suite touched by this plan: `bun test lib/listings/ lib/email/listing-scrape.test.ts lib/deliverable/recipes/` — all green.
- [ ] Run the full Python test suite touched by this plan: `python -m pytest ingest/lib/test_community_aliases.py ingest/duckdb_pipelines/neighborhood_stats/ -v` — all green.
- [ ] Run `bunx tsc --noEmit` (or this repo's standard typecheck) — no new errors.
- [ ] Confirm `node scripts/check.mjs list` no longer shows `community_facts_remaining_recipes` as open (Task 9), and shows the new `gap2_community_lookup_by_name` check (Task 10).
- [ ] Report back to the operator: ready to fire the `master` resync dispatch they asked to hold off on, now that this is done.
