# Per-Listing Days on Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 20 files, keywords: migration, schema, architecture

**Goal:** Every listing can say "62 days on market" (exact) or "15+ days on market" (honest floor), computed from facts we already hold — one SQL view, one formatter, probe-on-use healing, and a nightly calibration contract.

**Architecture:** Facts stay stored (`listed_date`, `first_seen`, relist transitions); days are computed at read time in ONE view (`data_lake.listing_dom`). One TS formatter owns the wording. Sold comps get their spell length for zero extra vendor calls (the tax-history body we already fetch carries the "Listed" events). Censored rows heal one probe at a time, only when actually surfaced.

**Tech Stack:** Postgres view (Bun.SQL migration), TypeScript (bun:test), Python (pytest, shared fixture parity), quality-registry YAML.

**Spec:** `docs/superpowers/specs/2026-07-16-listing-dom-design.md` (operator-approved 07/16/2026).

## Global Constraints

- Never store a computed day-count; the RentCast-era `listing_state.days_on_market` column stays untouched.
- The vendor access layer is NEVER named in any user-facing string, citation, or source_tag (existing rule; provenance = "SWFL Data Gulf" / realtor.com).
- All new fetch paths: empty-tolerant, never-throw, hour-cached — same shape as the existing client in `lib/listings/steadyapi.ts`.
- Dates render MM/DD/YYYY; DOM wording comes ONLY from `lib/listings/dom.ts`.
- TS tests: `bun test <file>`. Python tests: `python -m pytest <path> -q` from repo root. Full-app check at the end: `bunx next build` (never `npx tsc`).
- Commit per task with explicit paths (`git add <paths>` — never `-A`). NO `git push` anywhere in this plan — the operator pushes.
- Censor boundary literal `DATE '2026-07-03'` appears in exactly two places: the view and the calibration contract, each commented.

---

### Task 1: The formatter — `lib/listings/dom.ts`

**Files:**
- Create: `lib/listings/dom.ts`
- Test: `lib/listings/dom.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `formatDom({domDays, isFloor, cdomDays}): string | null`, `formatSoldSpell(days: number | null): string | null`, `daysBetweenIso(fromIso, toIso): number | null`, `todayIso(now?: Date): string` — used by Tasks 5, 6, 7, 8.

- [ ] **Step 1: Write the failing test**

```ts
// lib/listings/dom.test.ts
import { describe, expect, test } from "bun:test";
import { daysBetweenIso, formatDom, formatSoldSpell, todayIso } from "./dom";

describe("formatDom", () => {
  test("exact spell", () => {
    expect(formatDom({ domDays: 62, isFloor: false })).toBe("62 days on market");
  });
  test("floor renders a plus", () => {
    expect(formatDom({ domDays: 15, isFloor: true })).toBe("15+ days on market");
  });
  test("singular exact day", () => {
    expect(formatDom({ domDays: 1, isFloor: false })).toBe("1 day on market");
  });
  test("zero days", () => {
    expect(formatDom({ domDays: 0, isFloor: false })).toBe("0 days on market");
  });
  test("relist context appended only when cdom - dom >= 14", () => {
    expect(formatDom({ domDays: 12, isFloor: false, cdomDays: 140 })).toBe(
      "12 days on market (relisted — 140 days total)",
    );
    expect(formatDom({ domDays: 12, isFloor: false, cdomDays: 20 })).toBe("12 days on market");
  });
  test("floor never gets relist context (the floor is already fuzzy)", () => {
    expect(formatDom({ domDays: 15, isFloor: true, cdomDays: 200 })).toBe("15+ days on market");
  });
  test("null/negative → null (caller omits the line)", () => {
    expect(formatDom({ domDays: null, isFloor: false })).toBeNull();
    expect(formatDom({ domDays: -3, isFloor: false })).toBeNull();
  });
});

describe("formatSoldSpell", () => {
  test("plural / singular / null", () => {
    expect(formatSoldSpell(79)).toBe("sold in 79 days");
    expect(formatSoldSpell(1)).toBe("sold in 1 day");
    expect(formatSoldSpell(0)).toBe("sold in 0 days");
    expect(formatSoldSpell(null)).toBeNull();
    expect(formatSoldSpell(-1)).toBeNull();
  });
});

describe("daysBetweenIso", () => {
  test("plain dates and datetime prefixes", () => {
    expect(daysBetweenIso("2026-04-02", "2026-06-20")).toBe(79);
    expect(daysBetweenIso("2026-04-02T14:00:00Z", "2026-06-20")).toBe(79);
    expect(daysBetweenIso("2026-06-20", "2026-06-20")).toBe(0);
  });
  test("garbage → null", () => {
    expect(daysBetweenIso(null, "2026-06-20")).toBeNull();
    expect(daysBetweenIso("not-a-date", "2026-06-20")).toBeNull();
  });
});

describe("todayIso", () => {
  test("UTC date of the injected clock", () => {
    expect(todayIso(new Date("2026-07-16T03:00:00Z"))).toBe("2026-07-16");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings/dom.test.ts`
Expected: FAIL — module `./dom` not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/listings/dom.ts — THE one authority for days-on-market wording + date math.
//
// Semantics (spec 2026-07-16-listing-dom-design.md, research 07/16/2026):
//   headline = CURRENT SPELL, matching realtor.com's own counter (resets on relist,
//   keeps counting through pending); cumulative rides along only when it changes
//   the story. No other file may compose DOM wording.

export interface DomFields {
  /** Days in the current listing spell; null = unknown. */
  domDays: number | null;
  /** True when the count is a censored-first-seen floor → renders "N+ days". */
  isFloor: boolean;
  /** Cumulative days across relists (≥ domDays); undefined/null = unknown. */
  cdomDays?: number | null;
}

/** "62 days on market" / "15+ days on market" / relist context; null → omit the line. */
export function formatDom({ domDays, isFloor, cdomDays }: DomFields): string | null {
  if (domDays == null || domDays < 0) return null;
  const unit = domDays === 1 && !isFloor ? "day" : "days";
  const base = `${domDays}${isFloor ? "+" : ""} ${unit} on market`;
  if (!isFloor && cdomDays != null && cdomDays - domDays >= 14) {
    return `${base} (relisted — ${cdomDays} days total)`;
  }
  return base;
}

/** The closed-spell phrase for a sold property: "sold in 79 days". null → omit. */
export function formatSoldSpell(days: number | null): string | null {
  if (days == null || days < 0) return null;
  return `sold in ${days} ${days === 1 ? "day" : "days"}`;
}

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

/** Whole days from `fromIso` to `toIso` (date or datetime strings); null on garbage. */
export function daysBetweenIso(fromIso: string | null, toIso: string | null): number | null {
  const f = fromIso ? ISO_DATE.exec(fromIso)?.[1] : null;
  const t = toIso ? ISO_DATE.exec(toIso)?.[1] : null;
  if (!f || !t) return null;
  const ms = Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/** UTC calendar date of `now` as YYYY-MM-DD (injectable for tests). */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/listings/dom.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/listings/dom.ts lib/listings/dom.test.ts
git commit -m "feat(listings): dom.ts - the one authority for days-on-market wording" -- lib/listings/dom.ts lib/listings/dom.test.ts
```

---

### Task 2: Vendor parse — shared fixture, `parseListedEvent`, `SoldEvent.listedDate`, `fetchListedDate`

**Files:**
- Create: `ingest/tests/pipelines/listing_lifecycle/fixtures/property_history_two_spells.json`
- Modify: `lib/listings/steadyapi.ts` (the `SoldEvent`/`parseSoldEvent`/`fetchSoldEvent` block, currently lines ~445–487)
- Modify: `ingest/tests/pipelines/listing_lifecycle/test_extract_api.py` (append one test)
- Test: `lib/listings/steadyapi.listed-date.test.ts` (new, keeps the existing steadyapi tests untouched)

**Interfaces:**
- Consumes: `steadyGet`, `SteadyFetchDeps` (already in `steadyapi.ts`).
- Produces: `parseListedEvent(body: unknown, at?: string): string | null`; `SoldEvent` gains optional `listedDate?: string | null` (filled by `parseSoldEvent`); `fetchListedDate(propertyId: string, deps?): Promise<string | null>` — used by Tasks 6 and 7.

- [ ] **Step 1: Create the shared fixture** (two spells; the parity anchor for TS and Python)

```json
{
  "meta": { "current_status": "sold" },
  "body": {
    "property_history": [
      { "date": "2026-06-20", "event_name": "Sold", "price": 372000,
        "listing": { "list_date": "2026-04-02T14:00:00Z" } },
      { "date": "2026-04-02", "event_name": "Listed", "price": 379000,
        "listing": { "list_date": "2026-04-02T14:00:00Z" } },
      { "date": "2025-09-10", "event_name": "Listing removed", "price": 385000,
        "listing": { "list_date": "2025-06-15T09:30:00Z" } },
      { "date": "2025-06-15", "event_name": "Listed", "price": 385000,
        "listing": { "list_date": "2025-06-15T09:30:00Z" } }
    ]
  }
}
```

Save as `ingest/tests/pipelines/listing_lifecycle/fixtures/property_history_two_spells.json`.

- [ ] **Step 2: Write the failing TS test**

```ts
// lib/listings/steadyapi.listed-date.test.ts
import { describe, expect, test } from "bun:test";
import fixture from "../../ingest/tests/pipelines/listing_lifecycle/fixtures/property_history_two_spells.json";
import { fetchListedDate, parseListedEvent, parseSoldEvent } from "./steadyapi";

describe("parseListedEvent (parity fixture — Python test_pick_listed_date_parity asserts the same values)", () => {
  test("most recent Listed event at-or-before `at` — current spell", () => {
    expect(parseListedEvent(fixture, "2026-07-16")).toBe("2026-04-02");
  });
  test("an `at` inside the FIRST spell picks the first spell's date", () => {
    expect(parseListedEvent(fixture, "2025-12-31")).toBe("2025-06-15");
  });
  test("garbage body → null", () => {
    expect(parseListedEvent({}, "2026-07-16")).toBeNull();
    expect(parseListedEvent(null, "2026-07-16")).toBeNull();
  });
});

describe("parseSoldEvent carries the sold spell's listedDate", () => {
  test("listedDate = most recent Listed at-or-before the sold date", () => {
    const ev = parseSoldEvent(fixture);
    expect(ev).not.toBeNull();
    expect(ev!.soldPrice).toBe(372000);
    expect(ev!.soldDate).toBe("2026-06-20");
    expect(ev!.listedDate).toBe("2026-04-02");
  });
});

describe("fetchListedDate", () => {
  test("no key → null, no fetch", async () => {
    const prev = process.env.PHOTOS_API;
    delete process.env.PHOTOS_API;
    try {
      expect(await fetchListedDate("P1")).toBeNull();
    } finally {
      if (prev !== undefined) process.env.PHOTOS_API = prev;
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test lib/listings/steadyapi.listed-date.test.ts`
Expected: FAIL — `parseListedEvent` / `fetchListedDate` not exported.

- [ ] **Step 4: Implement in `lib/listings/steadyapi.ts`**

Add `listedDate` to `SoldEvent` (OPTIONAL — existing test fakes stay valid):

```ts
/** The exact recorded sale for one property (from `/property-tax-history`). */
export interface SoldEvent {
  soldPrice: number;
  soldDate: string;
  /** Vendor list date of the SOLD spell (most recent "Listed" event ≤ soldDate);
   *  null/absent when the history carries none. Rides the SAME response — free. */
  listedDate?: string | null;
}
```

Add `parseListedEvent` directly below `parseSoldEvent`, and attach it inside `parseSoldEvent`'s return:

```ts
/** Most recent "Listed" event's `listing.list_date` at-or-before `at` (default today) —
 *  the start of the spell being tracked. MIRRORS Python `_pick_listed_date`
 *  (ingest/pipelines/listing_lifecycle/extract_api.py) — the shared fixture
 *  property_history_two_spells.json pins both to identical outputs. Pure. */
export function parseListedEvent(body: unknown, at?: string): string | null {
  const history = (body as { body?: { property_history?: unknown } })?.body?.property_history;
  if (!Array.isArray(history)) return null;
  const cutoff = at ?? new Date().toISOString().slice(0, 10);
  let best: string | null = null;
  for (const row of history) {
    const r = row as { event_name?: unknown; listing?: { list_date?: unknown } };
    if (typeof r.event_name !== "string" || !/listed/i.test(r.event_name)) continue;
    const raw = r.listing?.list_date;
    const d = typeof raw === "string" ? raw.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > cutoff) continue;
    if (!best || d > best) best = d;
  }
  return best;
}
```

In `parseSoldEvent`, change the final `return best;` to:

```ts
  return best ? { ...best, listedDate: parseListedEvent(body, best.soldDate) } : null;
```

Add `fetchListedDate` below `fetchSoldEvent` (same never-throw shape):

```ts
/**
 * One `/property-tax-history` call — the current spell's vendor list date for a
 * property (probe-on-use healing of censored DOM floors). Empty-tolerant: no key,
 * non-200, no Listed event, or bad body → null, never throws.
 */
export async function fetchListedDate(
  propertyId: string,
  deps: SteadyFetchDeps = {},
): Promise<string | null> {
  const key = process.env.PHOTOS_API;
  if (!key || !propertyId) return null;
  const params = new URLSearchParams({ propertyId });
  try {
    const res = await steadyGet(`property-tax-history?${params}`, key, deps);
    if (!res) return null;
    return parseListedEvent(await res.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run TS tests**

Run: `bun test lib/listings/steadyapi.listed-date.test.ts && bun test lib/listings`
Expected: PASS, including all pre-existing steadyapi tests.

- [ ] **Step 6: Append the Python parity test**

In `ingest/tests/pipelines/listing_lifecycle/test_extract_api.py`, append (match the file's existing import style — `_pick_listed_date` is already imported by the listed_date tests added 07/16; if not, import it from `ingest.pipelines.listing_lifecycle.extract_api`):

```python
def test_pick_listed_date_parity_with_ts_fixture():
    """Shared fixture parity: lib/listings/steadyapi.listed-date.test.ts asserts these
    exact values off the same JSON — the two implementations cannot drift silently."""
    import json
    from pathlib import Path
    fx = json.loads(
        (Path(__file__).parent / "fixtures" / "property_history_two_spells.json").read_text()
    )
    hist = fx["body"]["property_history"]
    assert _pick_listed_date(hist, at="2026-07-16") == "2026-04-02"
    assert _pick_listed_date(hist, at="2025-12-31") == "2025-06-15"
```

- [ ] **Step 7: Run the Python tests**

Run: `python -m pytest ingest/tests/pipelines/listing_lifecycle/test_extract_api.py -q`
Expected: PASS (all, including the new parity test).

- [ ] **Step 8: Commit**

```bash
git add lib/listings/steadyapi.ts lib/listings/steadyapi.listed-date.test.ts ingest/tests/pipelines/listing_lifecycle/fixtures/property_history_two_spells.json ingest/tests/pipelines/listing_lifecycle/test_extract_api.py
git commit -m "feat(listings): parseListedEvent + fetchListedDate + SoldEvent.listedDate, fixture-pinned to Python _pick_listed_date" -- lib/listings/steadyapi.ts lib/listings/steadyapi.listed-date.test.ts ingest/tests/pipelines/listing_lifecycle/fixtures/property_history_two_spells.json ingest/tests/pipelines/listing_lifecycle/test_extract_api.py
```

---

### Task 3: The view — `data_lake.listing_dom`

**Files:**
- Create: `docs/sql/20260717_listing_dom.sql`
- Create: `scripts/verify-listing-dom.mts`

**Interfaces:**
- Consumes: `data_lake.listing_state`, `data_lake.listing_transitions` (existing tables).
- Produces: view `data_lake.listing_dom` = all `listing_state` columns + `last_relist_at`, `spell_anchor`, `dom_is_floor`, `dom_days`, `cdom_days` — read by Tasks 5/6 and the calibration follow-ups.

- [ ] **Step 1: Write the migration**

```sql
-- docs/sql/20260717_listing_dom.sql
-- ONE AUTHORITY for per-listing days on market (spec 2026-07-16-listing-dom-design.md).
-- Facts stay stored (listed_date / first_seen / transitions); days are COMPUTED here,
-- at read time — never materialized, so they can never go stale.
--
-- Semantics: headline = CURRENT SPELL, matching realtor.com's own counter (resets on
-- relist, keeps counting through pending — realtor.com spokesperson via Brick
-- Underground, fetched 07/16/2026). cdom_days = cumulative across relists, never
-- resets (earliest evidence we hold).
--
-- spell_anchor precedence: vendor listed_date (when from the current spell)
--   > last relist we observed (from_state='holding' transition)
--   > first_seen (exact for arrivals after full sweep coverage 07/03/2026;
--     a censored FLOOR for the ~30k back-catalog rows first seen before that).
--
-- Apply via Bun.SQL (psql not installed):
--   bun scripts/run-migration.ts docs/sql/20260717_listing_dom.sql

CREATE OR REPLACE VIEW data_lake.listing_dom AS
WITH relists AS (
  SELECT source_name, address_key, sale_or_rent, max(at) AS last_relist_at
  FROM data_lake.listing_transitions
  WHERE from_state = 'holding'   -- leaving holding = back on market = a relist
  GROUP BY source_name, address_key, sale_or_rent
),
anchored AS (
  SELECT
    s.*,
    r.last_relist_at,
    CASE
      WHEN s.listed_date IS NOT NULL
           AND (r.last_relist_at IS NULL OR s.listed_date::date >= r.last_relist_at::date)
        THEN s.listed_date::date                      -- vendor truth for the current spell
      WHEN r.last_relist_at IS NOT NULL
        THEN r.last_relist_at::date                   -- we saw the relist; vendor date is stale/absent
      ELSE s.first_seen::date                         -- our observation clock
    END AS spell_anchor,
    LEAST(COALESCE(s.listed_date::date, s.first_seen::date), s.first_seen::date) AS cdom_anchor,
    (s.listed_date IS NULL
     AND r.last_relist_at IS NULL
     -- CENSOR BOUNDARY (one of two occurrences; the other: quality_registry.yaml
     -- listing_dom_first_seen_calibration): sweep coverage completed 07/03/2026 —
     -- rows first seen on/before it were already live, so first_seen is a FLOOR.
     AND s.first_seen::date <= DATE '2026-07-03'
    ) AS dom_is_floor
  FROM data_lake.listing_state s
  LEFT JOIN relists r USING (source_name, address_key, sale_or_rent)
  WHERE s.source_name = 'api_feed'
)
SELECT
  anchored.*,
  (CURRENT_DATE - spell_anchor)::int AS dom_days,
  (CURRENT_DATE - cdom_anchor)::int  AS cdom_days
FROM anchored;

GRANT SELECT ON data_lake.listing_dom TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Write the verify script** (also serves the `listing_dom_live_verify` check after tonight's run)

```ts
// scripts/verify-listing-dom.mts — read-only smoke of data_lake.listing_dom.
// Usage: bun scripts/verify-listing-dom.mts
// Creds from .dlt/secrets.toml, same as scripts/run-migration.ts.
import { readFileSync } from "fs";

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
const tomlStr = (key: string): string => {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`Could not find ${key} in .dlt/secrets.toml`);
  return m[1];
};
const port = secrets.match(/^port\s*=\s*(\d+)/m)?.[1] ?? "5432";
const connStr = `postgres://${tomlStr("username")}:${encodeURIComponent(tomlStr("password"))}@${tomlStr("host")}:${port}/${tomlStr("database")}?sslmode=require`;
const sql = new Bun.SQL(connStr);

const [counts] = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE dom_is_floor)::int AS floored,
         count(*) FILTER (WHERE dom_days < 0)::int AS negative_dom,
         count(*) FILTER (WHERE cdom_days < dom_days)::int AS cdom_lt_dom
  FROM data_lake.listing_dom`;
console.log("listing_dom:", counts);

const fresh = await sql`
  SELECT address_key, first_seen::date AS first_seen, listed_date, dom_days, dom_is_floor, cdom_days
  FROM data_lake.listing_dom
  WHERE first_seen::date > DATE '2026-07-03'
  ORDER BY first_seen DESC LIMIT 3`;
console.log("fresh sample:", fresh);

const healed = await sql`
  SELECT address_key, listed_date, dom_days, dom_is_floor
  FROM data_lake.listing_dom
  WHERE listed_date IS NOT NULL
  ORDER BY listed_date DESC LIMIT 3`;
console.log("vendor-dated sample (empty until the first nightly run lands):", healed);

await sql.end();
```

- [ ] **Step 3: Apply and verify**

Run: `bun scripts/run-migration.ts docs/sql/20260717_listing_dom.sql`
Expected: `✓ done` / `Migrations complete.`

Run: `bun scripts/verify-listing-dom.mts`
Expected: `total` ≈ 31,900+, `floored` ≈ 30,000 (the censored back catalog), `negative_dom` = 0, `cdom_lt_dom` = 0. `fresh sample` rows show small `dom_days` with `dom_is_floor: false`. `vendor-dated sample` is likely EMPTY today — `listed_date` starts landing with the first nightly run after commit `81e203f6`; that's expected, not a failure.

- [ ] **Step 4: Commit**

```bash
git add docs/sql/20260717_listing_dom.sql scripts/verify-listing-dom.mts
git commit -m "feat(lake): data_lake.listing_dom view - per-listing DOM computed at read time, never stored" -- docs/sql/20260717_listing_dom.sql scripts/verify-listing-dom.mts
```

---

### Task 4: The narrow write — `persistListedDate`

**Files:**
- Create: `lib/listings/listed-date-write.ts`
- Test: `lib/listings/listed-date-write.test.ts`

**Interfaces:**
- Consumes: `createServiceRoleClientUntyped` from `@/utils/supabase/service-role`.
- Produces: `persistListedDate(key: {sourceName, addressKey, saleOrRent}, isoDate: string, deps?): Promise<boolean>` — used by Task 6.

- [ ] **Step 1: Write the failing test** (injected fake client, same DI pattern as `lib/concoctions/seed-authored.ts`)

```ts
// lib/listings/listed-date-write.test.ts
import { describe, expect, test } from "bun:test";
import { persistListedDate } from "./listed-date-write";

function fakeSb() {
  const calls: Record<string, unknown[]> = { update: [], eq: [], or: [] };
  const chain = {
    schema: (s: string) => ((calls.schema = [s]), chain),
    from: (t: string) => ((calls.from = [t]), chain),
    update: (v: unknown) => (calls.update.push(v), chain),
    eq: (c: string, v: unknown) => (calls.eq.push([c, v]), chain),
    or: (expr: string) => (calls.or.push(expr), Promise.resolve({ error: null })),
  };
  return { chain, calls };
}

describe("persistListedDate", () => {
  test("updates ONLY listed_date, keyed on the full identity, guarded null-or-older", async () => {
    const { chain, calls } = fakeSb();
    const ok = await persistListedDate(
      { sourceName: "api_feed", addressKey: "14977RIVERSEDGECTUNIT217:33908", saleOrRent: "sale" },
      "2026-05-15",
      { sb: chain as never },
    );
    expect(ok).toBe(true);
    expect(calls.from).toEqual(["listing_state"]);
    expect(calls.update).toEqual([{ listed_date: "2026-05-15" }]); // single column, ever
    expect(calls.eq).toEqual([
      ["source_name", "api_feed"],
      ["address_key", "14977RIVERSEDGECTUNIT217:33908"],
      ["sale_or_rent", "sale"],
    ]);
    expect(calls.or).toEqual(["listed_date.is.null,listed_date.lt.2026-05-15"]);
  });

  test("rejects a non-ISO date without touching the client", async () => {
    const { chain, calls } = fakeSb();
    expect(await persistListedDate(
      { sourceName: "api_feed", addressKey: "X:33908", saleOrRent: "sale" },
      "05/15/2026",
      { sb: chain as never },
    )).toBe(false);
    expect(calls.update).toEqual([]);
  });

  test("client error → false, never throws", async () => {
    const bad = {
      schema: () => bad, from: () => bad, update: () => bad, eq: () => bad,
      or: () => Promise.resolve({ error: { message: "boom" } }),
    };
    expect(await persistListedDate(
      { sourceName: "api_feed", addressKey: "X:33908", saleOrRent: "sale" },
      "2026-05-15",
      { sb: bad as never },
    )).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings/listed-date-write.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/listings/listed-date-write.ts — the ONE write path from the web app into
// data_lake.listing_state, deliberately a single column: probe-on-use healing of
// censored DOM floors (spec 2026-07-16-listing-dom-design.md §3). Guarded
// null-or-older so a re-probe after a relist can advance the spell but a stale
// concurrent probe can never regress a newer date.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface ListingStateKey {
  sourceName: string;
  addressKey: string;
  saleOrRent: string;
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function persistListedDate(
  key: ListingStateKey,
  isoDate: string,
  deps: { sb?: ReturnType<typeof createServiceRoleClientUntyped> } = {},
): Promise<boolean> {
  if (!ISO_DATE_ONLY.test(isoDate)) return false;
  try {
    const sb = deps.sb ?? createServiceRoleClientUntyped();
    const { error } = await sb
      .schema("data_lake")
      .from("listing_state")
      .update({ listed_date: isoDate })
      .eq("source_name", key.sourceName)
      .eq("address_key", key.addressKey)
      .eq("sale_or_rent", key.saleOrRent)
      .or(`listed_date.is.null,listed_date.lt.${isoDate}`);
    return !error;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/listings/listed-date-write.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/listings/listed-date-write.ts lib/listings/listed-date-write.test.ts
git commit -m "feat(listings): persistListedDate - single-column guarded write for probe-on-use healing" -- lib/listings/listed-date-write.ts lib/listings/listed-date-write.test.ts
```

---

### Task 5: Lake reads carry DOM — `select.ts` swaps to the view

**Files:**
- Modify: `lib/listings/rentcast.ts` (the `Listing` interface, line ~14–35)
- 🔴 Modify: `lib/listings/select.ts` (`LakeListingRow`, `lakeRowToListing`, `LAKE_LISTING_COLUMNS`, `fetchLakeListings` — lines ~215–302)
- 🔴 Modify: `lib/listings/select.test.ts` (`SAMPLE_ROW` + the lake-read test, lines ~50–90)

**Interfaces:**
- Consumes: view `data_lake.listing_dom` (Task 3).
- Produces: `Listing.daysOnMarket` now real (spell days from the view), plus new optional `Listing.domIsFloor?: boolean` and `Listing.cdomDays?: number | null` — consumed by deliverable preview paths and Task 8's follow-ups.

- [ ] **Step 1: Extend the failing test first**

In `lib/listings/select.test.ts`, add to `SAMPLE_ROW` (after `days_on_market: 30,`):

```ts
  dom_days: 45,
  dom_is_floor: false,
  cdom_days: 45,
  address_key: "123MAINST:33901",
  property_id: "P123",
```

Rename the lake-read test and assert the new mapping (replace the existing test body at line ~76):

```ts
test("loadListingContext reads data_lake.listing_dom, never calls a live vendor API", async () => {
  rowsForNextCall = [SAMPLE_ROW];
  const ctx = await loadListingContext({ kind: "county", value: "Lee" }, new Date("2026-07-01"));
  expect(ctx.ranked).toHaveLength(1);
  expect(ctx.ranked[0].photoUrl).toBe("https://rdcpix.example/photo.jpg");
  expect(ctx.ranked[0].price).toBe(340000);
  expect(ctx.ranked[0].daysOnMarket).toBe(45); // from the view's dom_days, NOT the dead column
  expect(ctx.ranked[0].domIsFloor).toBe(false);
  expect(ctx.ranked[0].cdomDays).toBe(45);
  expect(ctx.figures.length).toBeGreaterThan(0);
});
```

Also update the mock's table assertion if the file's supabase mock pins the table name (check the `mock.module` block at the top of the file for a `"listing_state"` literal; if present, change it to `"listing_dom"`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings/select.test.ts`
Expected: FAIL — `daysOnMarket` is 30 (old column) / `domIsFloor` undefined.

- [ ] **Step 3: Implement**

In `lib/listings/rentcast.ts`, extend `Listing` after `daysOnMarket: number | null;`:

```ts
  /** True when daysOnMarket is a censored-first-seen FLOOR — render "N+ days". */
  domIsFloor?: boolean;
  /** Cumulative days across relists (≥ daysOnMarket); undefined when unknown. */
  cdomDays?: number | null;
```

In `lib/listings/select.ts`:

1. Extend `LakeListingRow` after `days_on_market: number | null;`:

```ts
  dom_days: number | null;
  dom_is_floor: boolean | null;
  cdom_days: number | null;
  address_key: string | null;
  property_id: string | null;
```

2. Extend `LAKE_LISTING_COLUMNS`:

```ts
const LAKE_LISTING_COLUMNS =
  "listing_id, street_address, city, county, zip_code, lat, lon, property_type, beds, baths, " +
  "sqft, lot_acres, status, list_price, listed_date, last_seen, days_on_market, mls_name, " +
  "mls_number, photo_url, dom_days, dom_is_floor, cdom_days, address_key, property_id";
```

3. In `lakeRowToListing`, replace `daysOnMarket: row.days_on_market,` with:

```ts
    daysOnMarket: row.dom_days ?? row.days_on_market,
    domIsFloor: row.dom_is_floor === true,
    cdomDays: row.cdom_days,
```

(`address_key`/`property_id` are read for Task 6's healer only — they are NOT mapped onto `Listing`; the MLS-scrub discipline holds.)

4. In `fetchLakeListings`, change `.from("listing_state")` to `.from("listing_dom")` and drop the now-redundant `.eq("source_name", "api_feed")` line (the view is already api_feed-scoped) — keep `.eq("state", "active")` and `.eq("sale_or_rent", "sale")`.

- [ ] **Step 4: Run tests**

Run: `bun test lib/listings/select.test.ts && bun test lib/listings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/listings/rentcast.ts lib/listings/select.ts lib/listings/select.test.ts
git commit -m "feat(listings): lake reads flow through listing_dom - Listing carries real spell DOM + floor flag + cdom" -- lib/listings/rentcast.ts lib/listings/select.ts lib/listings/select.test.ts
```

---

### Task 6: Probe-on-use healing in the lake read

**Files:**
- 🔴 Modify: `lib/listings/select.ts` (add the healer + wire into `fetchLakeListings`)
- 🔴 Modify: `lib/listings/select.test.ts`

**Interfaces:**
- Consumes: `fetchListedDate` (Task 2), `persistListedDate` (Task 4), `daysBetweenIso`/`todayIso` (Task 1).
- Produces: `healFlooredRows(rows, deps?)` (exported for tests); `fetchLakeListings` heals ≤3 floored rows per request before mapping.

- [ ] **Step 1: Write the failing test**

Add to `lib/listings/select.test.ts`:

```ts
const { healFlooredRows } = await import("./select");

test("healFlooredRows probes ≤3 floored rows, persists, and recomputes in place", async () => {
  const rows = [
    { ...SAMPLE_ROW, address_key: "A:33901", property_id: "P1", dom_is_floor: true, dom_days: 15, listed_date: null },
    { ...SAMPLE_ROW, address_key: "B:33901", property_id: "P2", dom_is_floor: false, dom_days: 4 },
    { ...SAMPLE_ROW, address_key: "C:33901", property_id: null, dom_is_floor: true, dom_days: 15 },
  ] as Parameters<typeof healFlooredRows>[0];
  const probed: string[] = [];
  const persisted: string[] = [];
  await healFlooredRows(rows, {
    fetchListedDate: async (pid) => (probed.push(pid), "2026-05-15"),
    persistListedDate: async (key, iso) => (persisted.push(`${key.addressKey}=${iso}`), true),
    now: new Date("2026-07-16T12:00:00Z"),
  });
  expect(probed).toEqual(["P1"]); // floored+keyed only; no propertyId → skipped
  expect(persisted).toEqual(["A:33901=2026-05-15"]);
  expect(rows[0].dom_days).toBe(62);
  expect(rows[0].dom_is_floor).toBe(false);
  expect(rows[1].dom_days).toBe(4); // untouched
});

test("healFlooredRows: probe failure keeps the floor — degraded, never broken", async () => {
  const rows = [
    { ...SAMPLE_ROW, address_key: "A:33901", property_id: "P1", dom_is_floor: true, dom_days: 15, listed_date: null },
  ] as Parameters<typeof healFlooredRows>[0];
  await healFlooredRows(rows, {
    fetchListedDate: async () => null,
    persistListedDate: async () => true,
    now: new Date("2026-07-16T12:00:00Z"),
  });
  expect(rows[0].dom_is_floor).toBe(true);
  expect(rows[0].dom_days).toBe(15);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings/select.test.ts`
Expected: FAIL — `healFlooredRows` not exported.

- [ ] **Step 3: Implement in `select.ts`**

Add imports at the top:

```ts
import { daysBetweenIso, todayIso } from "./dom";
import { fetchListedDate } from "./steadyapi";
import { persistListedDate, type ListingStateKey } from "./listed-date-write";
```

Add above `fetchLakeListings`:

```ts
/** Probe-on-use healing (spec §3): a censored floor row being SURFACED gets one
 *  `/property-tax-history` call for its true list date, persisted forever via the
 *  guarded single-column write. Capped; failures keep the floor; never throws. */
const DOM_HEAL_LIMIT = 3;

export interface DomHealDeps {
  fetchListedDate?: (propertyId: string) => Promise<string | null>;
  persistListedDate?: (key: ListingStateKey, isoDate: string) => Promise<boolean>;
  now?: Date;
}

export async function healFlooredRows(rows: LakeListingRow[], deps: DomHealDeps = {}): Promise<void> {
  const fetchLd = deps.fetchListedDate ?? fetchListedDate;
  const persist = deps.persistListedDate ?? persistListedDate;
  const today = todayIso(deps.now);
  const targets = rows
    .filter((r) => r.dom_is_floor === true && r.property_id && r.address_key)
    .slice(0, DOM_HEAL_LIMIT);
  await Promise.all(
    targets.map(async (r) => {
      try {
        const ld = await fetchLd(String(r.property_id));
        const days = daysBetweenIso(ld, today);
        if (!ld || days == null || days < 0) return; // failure keeps the honest floor
        r.listed_date = ld;
        r.dom_days = days;
        r.dom_is_floor = false;
        await persist(
          { sourceName: "api_feed", addressKey: String(r.address_key), saleOrRent: "sale" },
          ld,
        );
      } catch {
        /* keep the floor */
      }
    }),
  );
}
```

In `fetchLakeListings`, after the `if (!Array.isArray(data)) return [];` line, insert:

```ts
    const rows = data as unknown as LakeListingRow[];
    await healFlooredRows(rows);
    return rows.map(lakeRowToListing).filter((l): l is Listing => l !== null);
```

(replacing the existing `return (data as unknown as LakeListingRow[])...` block).

- [ ] **Step 4: Run tests**

Run: `bun test lib/listings`
Expected: PASS. (The existing "never calls a live vendor API" test still passes because `SAMPLE_ROW.dom_is_floor` is false — no heal target, no fetch. If it fails on an unexpected live-call guard, inject `dom_is_floor: false` rows only.)

- [ ] **Step 5: Commit**

```bash
git add lib/listings/select.ts lib/listings/select.test.ts
git commit -m "feat(listings): probe-on-use DOM healing - floored rows surfaced in lake reads heal via one guarded probe" -- lib/listings/select.ts lib/listings/select.test.ts
```

---

### Task 7: Chat comps say it — `comp-helper.ts`

**Files:**
- Modify: `lib/assistant/comp-helper.ts` (`RenderComp`, `compsForAddress` comp mapping ~line 296, `pricePhrase` ~line 388)
- Modify: `lib/assistant/comp-helper.test.ts` (add cases; this file exists — if its name differs, it's the module's sibling `*.test.ts`)

**Interfaces:**
- Consumes: `SoldEvent.listedDate` (Task 2), `daysBetweenIso`/`formatSoldSpell` (Task 1).
- Produces: `RenderComp.soldInDays: number | null`; sold-comp lines gain "· sold in N days".

- [ ] **Step 1: Write the failing test**

Add to `lib/assistant/comp-helper.test.ts` (follow the file's existing DI pattern — every test injects `fetchNearby`/`fetchSold`/`geocode`):

```ts
test("an enriched sold comp carries soldInDays and the rendered line says 'sold in N days'", async () => {
  const result = await compsForAddress("123 Main St, Fort Myers", {
    geocode: async () => ({
      lat: 26.6, lon: -81.9, countyFips: "12071", matchedAddress: "123 Main St, Fort Myers, FL",
    }) as never,
    fetchNearby: async () => [
      {
        addressLine: "125 Main St", city: "Fort Myers", state: "FL", zip: "33901",
        beds: 3, baths: 2, sqft: 1500, lotSqft: null, status: "sold",
        listPrice: null, estimateValue: null, estimateDate: null,
        propertyId: "P9", sourceUrl: null,
      },
    ],
    fetchSold: async () => ({ soldPrice: 372000, soldDate: "2026-06-20", listedDate: "2026-04-02" }),
    now: new Date("2026-07-16T12:00:00Z"),
  });
  expect(result.comps[0].soldInDays).toBe(79);
  const block = renderCompBlock(result);
  expect(block).toContain("sold in 79 days");
});

test("a sold event without listedDate leaves soldInDays null and the line unchanged", async () => {
  const result = await compsForAddress("123 Main St, Fort Myers", {
    geocode: async () => ({
      lat: 26.6, lon: -81.9, countyFips: "12071", matchedAddress: "123 Main St, Fort Myers, FL",
    }) as never,
    fetchNearby: async () => [
      {
        addressLine: "125 Main St", city: "Fort Myers", state: "FL", zip: "33901",
        beds: 3, baths: 2, sqft: 1500, lotSqft: null, status: "sold",
        listPrice: null, estimateValue: null, estimateDate: null,
        propertyId: "P9", sourceUrl: null,
      },
    ],
    fetchSold: async () => ({ soldPrice: 372000, soldDate: "2026-06-20" }),
    now: new Date("2026-07-16T12:00:00Z"),
  });
  expect(result.comps[0].soldInDays).toBeNull();
  expect(renderCompBlock(result)).not.toContain("sold in");
});
```

(Adjust the `geocode` return to the file's existing `GeocodedAddress` fake shape — copy it from a neighboring test rather than inventing fields.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/assistant/comp-helper.test.ts`
Expected: FAIL — `soldInDays` does not exist on `RenderComp`.

- [ ] **Step 3: Implement**

In `comp-helper.ts`:

1. Import (top of file, with the other lib imports):

```ts
import { daysBetweenIso, formatSoldSpell } from "@/lib/listings/dom";
```

2. `RenderComp` gains (after `priceDate`):

```ts
  /** Closed-spell length for a RECORDED sale (sold date − vendor list date, same
   *  response, zero extra calls); null for estimates/last-list or missing history. */
  soldInDays: number | null;
```

3. In `compsForAddress`'s comp mapping (the `const comps: RenderComp[] = surfaced.map...` block), compute and carry it — inside the `if (sold)` branch add `soldInDays`, and default it `null` on the other branches. Replace the mapping body's price block with:

```ts
    let price: number | null;
    let priceKind: PriceKind;
    let priceDate: string | null;
    let soldInDays: number | null = null;
    if (sold) {
      price = sold.soldPrice;
      priceKind = "sold";
      priceDate = sold.soldDate;
      soldInDays = daysBetweenIso(sold.listedDate ?? null, sold.soldDate);
      if (soldInDays != null && soldInDays < 0) soldInDays = null;
    } else if (c.estimateValue != null) {
      price = c.estimateValue;
      priceKind = "estimate";
      priceDate = c.estimateDate;
    } else {
      price = c.listPrice;
      priceKind = "last_list";
      priceDate = null;
    }
```

and add `soldInDays,` to the returned object literal.

4. In `pricePhrase`, extend the sold branch:

```ts
  if (c.priceKind === "sold") {
    const d = isoToMDY(c.priceDate);
    const spell = formatSoldSpell(c.soldInDays);
    return `sold ${usd(c.price)}${d ? ` on ${d}` : ""}${spell ? ` · ${spell}` : ""}`;
  }
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/assistant/comp-helper.test.ts && bun test lib/assistant`
Expected: PASS, including all pre-existing comp-helper tests (the new field is additive; existing fakes without `listedDate` produce `soldInDays: null`).

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/comp-helper.ts lib/assistant/comp-helper.test.ts
git commit -m "feat(assistant): sold comps carry their spell - 'sold in 79 days' for zero extra vendor calls" -- lib/assistant/comp-helper.ts lib/assistant/comp-helper.test.ts
```

---

### Task 8: One deliverable proves the seam — `market-comps` evidence rows

**Files:**
- Modify: `lib/deliverable/recipes/market-comps.ts`
- Modify: `lib/deliverable/recipes/market-comps.test.ts`

**Interfaces:**
- Consumes: `RenderComp.soldInDays` (Task 7), `formatSoldSpell` (Task 1).
- Produces: the evidence table's sold rows read "Sold 06/20/2026 · sold in 79 days".

Before editing, read `lib/email/CLAUDE.md` (area conventions) and this recipe's header comment in full — it carries the claims-gate rules.

- [ ] **Step 1: Locate the sold-row composer**

Run: `grep -n "Sold " lib/deliverable/recipes/market-comps.ts` — find the function that renders each evidence-table row's `"Sold MM/DD/YYYY"` / `"Estimated value MM/DD/YYYY"` line (the recipe's header comment names these exact strings as one of its four MIX surfaces).

- [ ] **Step 2: Write the failing test**

In `market-comps.test.ts`, find the existing test that asserts a rendered `"Sold "` row line (grep `Sold` in the test file) and add beside it, reusing that test's fixture comp but with `soldInDays: 79`:

```ts
test("a sold evidence row carries the spell when known", () => {
  // reuse the neighboring test's builder/fixture; set soldInDays: 79 on the sold comp
  // and assert the rendered row contains BOTH the sale date line and the spell:
  expect(rendered).toContain("sold in 79 days");
});

test("a sold row with unknown spell renders exactly as before", () => {
  // same fixture with soldInDays: null — assert "sold in" is ABSENT
  expect(rendered).not.toContain("sold in");
});
```

(These two tests must use the recipe's real render entry point exactly as the neighboring tests do — copy their setup verbatim; only the comp's `soldInDays` differs. If the recipe's comp fixtures now fail TypeScript because `RenderComp.soldInDays` is required, add `soldInDays: null` to each existing fixture literal in the same commit.)

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test lib/deliverable/recipes/market-comps.test.ts`
Expected: FAIL — "sold in 79 days" not found.

- [ ] **Step 4: Implement**

In the row composer found in Step 1, where the sold line is built (the string that begins `Sold ${...}`), append the spell:

```ts
import { formatSoldSpell } from "@/lib/listings/dom";
// ... in the sold-row branch:
const spell = formatSoldSpell(comp.soldInDays);
// append `${spell ? ` · ${spell}` : ""}` to the existing "Sold MM/DD/YYYY" line
```

Touch NOTHING else in this recipe — the claims gate (`buildNarratorPrompt` never sees the comp array) is load-bearing; the spell is a code-computed figure riding an existing code-computed line, so the no-invention lint is satisfied by construction.

- [ ] **Step 5: Run tests**

Run: `bun test lib/deliverable/recipes/market-comps.test.ts && bun test lib/deliverable`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/deliverable/recipes/market-comps.ts lib/deliverable/recipes/market-comps.test.ts
git commit -m "feat(deliverable): market-comps evidence rows carry the sold spell" -- lib/deliverable/recipes/market-comps.ts lib/deliverable/recipes/market-comps.test.ts
```

---

### Task 9: Calibration contract — the "how far off were we" tracker

**Files:**
- Modify: `ingest/quality/quality_registry.yaml` (the `data_lake.listing_state:` entry's `content_contracts:` list)

**Interfaces:**
- Consumes: `listing_state.listed_date` + `first_seen` (facts).
- Produces: a nightly red/green signal in check_data_quality / doctor; promotion to `error` later closes check `listing_dom_from_first_seen`.

Before editing, read `ingest/CLAUDE.md` if not already read this session.

- [ ] **Step 1: Add the contract**

Under `data_lake.listing_state:` → `content_contracts:` append:

```yaml
      # DOM CALIBRATION (spec 2026-07-16-listing-dom-design.md §5). Every probed
      # fresh-cohort row measures our arrival clock: |vendor listed_date − our
      # first_seen| should be ~0–1 days. Fresh cohort = first_seen AFTER the
      # CENSOR BOUNDARY 2026-07-03 (sweep full-coverage date — second of the two
      # occurrences; the other: docs/sql/20260717_listing_dom.sql). Judges only
      # once ≥20 samples exist. severity=warn at ship; PROMOTE to error once it
      # has held green ~2 weeks — that promotion closes check
      # `listing_dom_from_first_seen`.
      - name: listing_dom_first_seen_calibration
        type: sql_expectation
        locus: probe
        policy: report
        severity: warn
        failing_rows_sql: |
          WITH deltas AS (
            SELECT abs(listed_date::date - first_seen::date) AS d
            FROM data_lake.listing_state
            WHERE source_name = 'api_feed'
              AND listed_date IS NOT NULL
              AND first_seen::date > DATE '2026-07-03'
          )
          SELECT count(*) AS samples,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY d) AS median_delta_days
          FROM deltas
          HAVING count(*) >= 20
             AND percentile_cont(0.5) WITHIN GROUP (ORDER BY d) > 1
```

(If `data_lake.listing_state` has no `content_contracts:` key yet, add it under the table's existing entry; if the table has no entry at all, create one with only `content_contracts:` — do NOT invent value_tests.)

- [ ] **Step 2: Run the quality suite**

Run: `python -m pytest ingest/tests/quality/ -q`
Expected: PASS — the registry parse/replay tests accept the new contract (0 samples today → HAVING filters to zero rows → green).

- [ ] **Step 3: Commit**

```bash
git add ingest/quality/quality_registry.yaml
git commit -m "feat(quality): listing_dom_first_seen_calibration - nightly median-delta contract on the fresh cohort" -- ingest/quality/quality_registry.yaml
```

---

### Task 10: Wrap-up — build check, checks ledger, SESSION_LOG, hand-off

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)
- Modify: `_AUDIT_AND_ROADMAP/build-queue.md` (sync per RULE 1 "Always")

- [ ] **Step 1: Full verification**

Run: `bunx next build`
Expected: build succeeds (this is the verify channel — never `npx tsc`).

Run: `bun test lib/listings lib/assistant lib/deliverable/recipes/market-comps.test.ts && python -m pytest ingest/tests/pipelines/listing_lifecycle/ ingest/tests/quality/ -q`
Expected: all green (18 pre-existing failures in UNRELATED ingest pipelines are known — anything new in listing_lifecycle/quality is yours).

- [ ] **Step 2: Open the follow-up checks** (spec §6 — these are the operator-requested "everywhere else + charts/tracking" follow-ups)

```bash
node scripts/check.mjs open listing_lifecycle listing_active_stats_dom_repoint "listing_active_stats.avg_days_on_market averages the dead RentCast column (NULL on every api_feed row) - re-point to listing_dom.dom_days"
node scripts/check.mjs open listing_lifecycle active_listings_brain_dom "Inventory DOM stats into the active-listings brain with discrepancy framing vs the two vendor aggregates (market-temperature, market-heat)"
node scripts/check.mjs open listing_lifecycle dom_in_charts_and_algos "DOM as a chart shape + model/algo input (operator 07/16: 'DOM is a big indicator in the right algos')"
node scripts/check.mjs open listing_lifecycle dom_in_remaining_recipes "Roll sold-spell + subject DOM into the remaining recipes (new-listing, just-sold, under-contract, listing-flyer) via formatDom/formatSoldSpell"
node scripts/check.mjs open listing_lifecycle desk_dom_calibration_line "Optional desk line for the calibration deltas once the quality contract has data"
```

- [ ] **Step 3: SESSION_LOG entry** (append at TOP, before any push — RULE 0)

1–3 lines: what shipped (view + formatter + probe-on-use + comp/recipe wiring + calibration contract), the commit range, and what's next (`listing_dom_live_verify` closes after tonight's run via `bun scripts/verify-listing-dom.mts`; calibration promotes warn→error in ~2 weeks).

- [ ] **Step 4: Commit the log + queue sync**

```bash
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(session-log): per-listing DOM shipped - view + formatter + probe-on-use + calibration" -- SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
```

- [ ] **Step 5: STOP — show, don't push**

Show `git log --oneline origin/main..HEAD` to the operator and ask for the push decision (`node scripts/safe-push.mjs` is the channel WHEN approved). Do not close `listing_dom_live_verify` or `listing_dom_from_first_seen` — both close later, on live evidence, per their check text.

---

## Plan-level notes for the executor

- `listed_date` is populated on ZERO rows until the first nightly `listing-lifecycle-daily` run after commit `81e203f6` (pushed 07/16 12:38 ET). Tasks are ordered so nothing here depends on live `listed_date` rows existing; the live verify happens after tonight's run, outside this plan.
- If `bun test` for a touched module fails on something clearly unrelated (the flaky proposal-nonce class), loop that single test locally before blaming your diff (CLAUDE.md RULE 1 "Flaky tests").
- Every `git add` in this plan lists explicit paths — the git index is shared with concurrent sessions; never widen it.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 5, Task 6 | `lib/listings/select.ts`, `lib/listings/select.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
