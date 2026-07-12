# 08f — Code surface: contract loci · caveat-TTL boundary · doctor integration

**As-of:** 07/11/2026 · **Source:** research fan-out for `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` §13 (25 opus + 2 sonnet agents, read-only).
**Status:** evidence for Fable 5's build. Every claim below was produced by an agent that read the live files / queried the live DB (SELECT-only) / fetched live vendor docs. Numbers anchored to `03-lake-live-state.md` as the canonical 07/11/2026 fixture.

The three exact-insertion-point studies. Every gate site, import, and boundary line Fable 5 needs, read from the live files. **Each section contains at least one correction to the spec — read the FINDING/DRIFT callouts.**

---


## Contract loci — exact insertion points

**As-of 2026-07-11. Every claim below is `file:line` against the working tree or a live `information_schema` SELECT. Verified against spec §5 (`docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md:46`); no drift found from the spec's locus correction — but three things it doesn't say are load-bearing, marked FINDING.**

---

### Locus A-1 — `active_listings` → `data_lake.active_listings_residential`

| | |
|---|---|
| **Gate site** | `ingest/pipelines/active_listings/pipeline.py:61` |
| **Enclosing fn** | `def run(args: argparse.Namespace) -> None:` (`pipeline.py:33`) |
| **Batch variable** | `normed` — materialized at `pipeline.py:60` (`normed = normalize(raw)`) |
| **Merge call it precedes** | `written = upsert_rows(normed, dry_run=args.dry_run)` (`pipeline.py:62`) |
| **Writer (do NOT gate here)** | `def upsert_rows(rows: list[dict[str, Any]], *, dry_run: bool = False) -> int:` (`distill.py:169`); merge SQL `INSERT … ON CONFLICT (source_name, mls_id) DO UPDATE` at `distill.py:185-213`, executed `distill.py:216-219` |
| **`table` arg for `evaluate_batch(rows, table)`** | `"data_lake.active_listings_residential"` (`distill.py:19` `_TABLE`) |

Insert between `:60` and `:62`, inside the `for county in counties:` loop (`:54`):
```
normed = normalize(raw)                       # :60  ← batch exists
# evaluate_batch(normed, "data_lake.active_listings_residential") → clean / quarantined / stats
if normed:                                    # :61  ← GATE HERE
    written = upsert_rows(normed, ...)        # :62  ← merge
```

---

### Locus A-2 — `listing_lifecycle` → `data_lake.listing_state`

| | |
|---|---|
| **Gate site** | `ingest/pipelines/listing_lifecycle/pipeline.py:135` (blank line immediately before the merge) |
| **Enclosing fn** | `def run(*, dry_run: bool = False, only_county: str \| None = None, today: str \| None = None, source: str = "api", catchup: bool = False) -> dict:` (`pipeline.py:56-57`) |
| **Batch variables** | `ups`, `trans` — produced by `diff_states(...)` at `pipeline.py:107`, then **mutated** by the county-level enrichment at `:108-115` and the off-market hook `apply_off_market_resolutions(ups, trans, …)` at `:126` |
| **Merge call it precedes** | `n_u = distill.upsert_state(ups, source_name=src_name, dry_run=dry_run)` (`pipeline.py:136`) |
| **Writer (do NOT gate here)** | `def upsert_state(upserts: list[dict[str, Any]], *, source_name: str = SOURCE_NAME, dry_run: bool = False) -> int:` (`distill.py:172-174`); merge SQL `INSERT … ON CONFLICT (source_name, address_key, sale_or_rent) DO UPDATE` at `distill.py:188-198`, executed `distill.py:201-204` |
| **`table` arg** | `"data_lake.listing_state"` (`distill.py:69` `_STATE_TABLE`) |

**The gate must sit at `:135`, not at the `diff_states` line `:107`** — `ups`/`trans` are mutated in place between them (`:108-115` sets `county`/`days_on_market`; `:126` rewrites states to `sold`/`withdrawn` and attaches `sold_price`). Gating at `:107` would evaluate a batch that is not the one that lands.

**Contract scope for the $20k range floor here** must mirror the live view predicate exactly — `sale_or_rent = 'sale' AND property_type <> 'land'` → `list_price >= 20000` (source: `docs/sql/20260711_listing_active_stats_homes_only.sql:39-44`).

---

### Locus A-3 — `market_aggregates` → `data_lake.market_details_swfl`

| | |
|---|---|
| **Gate site** | `ingest/pipelines/market_aggregates/pipeline.py:62` |
| **Enclosing fn** | `def run_details(*, dry_run: bool = False, today: str \| None = None) -> dict:` (`pipeline.py:53`) |
| **Batch variable** | `rows` — accumulated across all ZIPs in the loop `:58-62` (`rows.append(res["row"])` at `:61`) |
| **Merge call it precedes** | `n = db.upsert(_DET_TABLE, _DET_COLS, _DET_CONFLICT, rows, dry_run=dry_run)` (`pipeline.py:63`) |
| **Writer (generic; do NOT gate here)** | `def upsert(table, cols, conflict, rows, *, dry_run=False) -> int:` (`market_aggregates/db.py:39-46`); merge SQL built `db.py:57-63`, executed `db.py:65-68` |
| **`table` arg** | `"data_lake.market_details_swfl"` (`pipeline.py:29` `_DET_TABLE`) |

Sibling: `run_histogram` (`pipeline.py:37`) builds `rows` at `:41-44` and merges at `:45` into `data_lake.listing_price_histogram_swfl` (`:24`). Since `db.upsert` already takes `table` as its first arg — the same signature shape as `evaluate_batch(rows, table)` — **one gate inside `db.py:upsert` at line 50 (after the `if not rows: return 0`, before the `dry_run` branch) would cover both resources with a single insertion.** That is an implementer's choice against spec §5's "in the orchestrator" wording; the orchestrator sites are `:62` (details) and `:44/45` (histogram).

---

### FINDING 1 — the batch grain differs across the three loci; the abort-share model only holds at one of them

Spec §5 (`:52`) sizes `abort` as "violating *share* > threshold → whole feed changed shape" and gives "91 bad of 34k → drop 91" as the quarantine case. That assumes the gate sees the **whole load**. It does not, at two of three sites:

- **`active_listings`** — `upsert_rows` is called **inside the per-county loop** (`pipeline.py:54-64`). The batch at the gate is one county. The per-county merge is *deliberate*: `pipeline.py:49-50` — *"a later county's 403/throttle must never discard the counties already gathered — the bug that lost the first 4,691-row seed."*
- **`listing_lifecycle`** — same shape: `upsert_state` is called inside `for county in counties:` (`pipeline.py:75-145`), merge at `:136`.
- **`market_aggregates`** — the opposite: `rows` accumulates across every ZIP into one list and merges **once** at `:63`. This is the only clean whole-batch site.

Consequence: at A-1/A-2, an `abort` raised on county #2 leaves county #1 **already committed and un-rollback-able** (each `upsert_*` opens its own connection and `conn.commit()`s — `active_listings/distill.py:216-219`, `listing_lifecycle/distill.py:201-204`). Open decision for the implementer (not resolvable read-only): *accumulate-then-gate* (defeats the deliberate per-county durability above) vs *per-county abort semantics* (a partial run is a real, accepted outcome). The contamination-share threshold means something different under each.

### FINDING 2 — `listing_lifecycle` has two more write paths carrying the same contamination class, neither covered by gating `upsert_state`

1. `distill.append_transitions(trans, …)` — `pipeline.py:137` → `distill.py:208`. `_TRANS_COLS` (`distill.py:97-102`) includes `price`, `price_delta`, `sold_price` — the same price class the range contract targets, landing in `data_lake.listing_transitions`.
2. `distill.update_sold_price(applied["upgrades"], …)` — `pipeline.py:158` → `distill.py:269`. A **targeted out-of-band `UPDATE`** (`distill.py:281-284`), not the MERGE. Its only price guard today is a positivity check: `if isinstance(u.get("sold_price"), int) and u["sold_price"] > 0` (`distill.py:289`) — no floor, no scope. A recovered $1 nominal-consideration close price lands unchecked.

Gating only `upsert_state` at `:136` leaves both open. Report as a coverage gap, not a blocker for the three named loci.

### FINDING 3 — a pre-existing reclassifier already sits upstream of A-1, at a different threshold

`active_listings/distill.py:32` defines `_RENT_PRICE_FLOOR = 50000` and `normalize()` at `:137-143` **reclassifies** sub-$50k residential rows to `listing_type='rent'` rather than quarantining them. This is *not* a drift from the view's $20k floor — different table (`active_listings_residential`, source `active_listings_seed`) vs (`listing_state`, source `api_feed`). But a range contract authored at A-1 must account for the reclassifier already having run inside `normalize()` (`pipeline.py:60`) before the gate at `:61`, and spec §13's "nail the exact contract thresholds" must reconcile **$50,000 (feed A, reclassify) vs $20,000 (feed B, exclude)** rather than pick one from memory.

---

### (a) `listing_active_stats` — VIEW, no pipeline. Locus-B only. CONFIRMED.

- **Live:** `SELECT table_schema, table_name, table_type FROM pg.information_schema.tables …` → `data_lake.listing_active_stats` = **`VIEW`** (the other five listing tables all return `BASE TABLE`).
- **Definition:** `CREATE OR REPLACE VIEW data_lake.listing_active_stats AS …` — `docs/sql/20260711_listing_active_stats_homes_only.sql:34`. It reads `data_lake.listing_state` (`:37`), i.e. it is downstream of Locus A-2.
- **No pipeline writes it:** grep of `ingest/` for `listing_active_stats` returns exactly **one** hit — `cadence_registry.yaml:1511`, and that is a *consumer* comment (`# Consumer brain: refinery/packs/active-listings-swfl.mts (via data_lake.listing_active_stats).`). No `freshness_table:`/`count_table:` points at it; no `INSERT`/`upsert` targets it.

→ There is no candidate batch, no merge call, no Locus A. **Locus B (at-rest) is the only gate available**, exactly as spec §5 (`:53`) states. No drift.

**And Locus B needs no new machinery to reach it:** `information_schema.columns` exposes the view's columns (live: `cols_visible = 7`), so `read_live_schema` (`check_data_quality.py:196`) and the count(*)-style failing-row builders (`:82-118`) work against a view unchanged. It only needs the key `data_lake.listing_active_stats` added under `tables:` in `ingest/quality/quality_registry.yaml`.

---

### (b) `ContentContractError` — exact slot in `ingest/lib/guards.py`

The file already holds **three** sibling exception classes, all bare `RuntimeError` subclasses with a docstring stating *what tripped, why it is distinct, and the cron-classification verb*:

- `class VolumeGuardError(RuntimeError)` — **`guards.py:15-18`**. Full body:
  ```python
  class VolumeGuardError(RuntimeError):
      """Raised pre-promote when a volume assertion fails. Named for unambiguous GHA log parsing."""

      pass
  ```
- `class ContentStaleError(RuntimeError)` — `guards.py:21-31` (docstring names the classification verb: *"CONTENT_STALE -> investigate source/scraper, do NOT retry"*)
- `class FetchHealthError(RuntimeError)` — `guards.py:34-45` (*"FETCH_BLOCKED -> investigate source/WAF, do NOT blind-retry"*)

**Insert `ContentContractError` at `guards.py:46`** — after `FetchHealthError`'s closing `pass` (`:45`), before the first assert helper `def assert_content_fresh(` (`:48`). Same shape: `RuntimeError` subclass, `pass` body, docstring that (i) names the class it catches (rental-priced rows in a sales table / land blended into a homes median), (ii) says why it is **not** `VolumeGuardError` (the row *count* is healthy — 34k landed; the row *content* is wrong, which every existing guard here is blind to), and (iii) supplies the prescription verb for the doctor enum in spec §11 (`:110`) — a content violation is `should_retry = false`, the feed shape changed; retrying re-lands the same bad rows.

Import path for both A-loci: `from ingest.lib.guards import ContentContractError` — matching the existing `from ingest.lib.guards import assert_county_coverage, assert_min_rows, assert_vs_baseline` at `active_listings/pipeline.py:18`. (Note `listing_lifecycle/pipeline.py` imports **no** guards today — grep of its imports `:14-27` shows zero `ingest.lib.guards`; A-2 adds the first one.)

---

### (c) `check_data_quality.py` — Locus-B reads the same `content_contracts` block. Structure confirmed.

`ingest/scripts/check_data_quality.py` (513 lines) is already a registry-driven, table-keyed, pure-builder + runner + ledger-sync probe. Locus B extends it along the existing seams — **four** touch points:

1. **Builder table** — `_BUILDERS = {"not_null": …, "unique": …, "accepted_values": …}` at **`:121-125`**, each `lambda t, spec: build_*_sql(...)`. The three new types (`enum`, `range`, `sql_expectation`, spec §5 `:50`) get their SQL builders in the NEW `ingest/quality/contracts.py` — **confirmed not to exist** (`ingest/quality/` holds zero `.py` files today; only `quality_registry.yaml` + `schema_baselines/`) — and `check_data_quality.py` imports them so **both loci share one authority** rather than re-deriving the predicate.
2. **Runner** — `def run_value_tests(conn, registry: dict) -> list[dict]:` at **`:128`** iterates `for table, cfg in (registry.get("tables") or {}).items():` → `for spec in cfg.get("value_tests", []) or []:` (`:135-136`), with per-query `try`/`conn.rollback()` so a missing table can never break the run (`:150-162`). Add a parallel `run_content_contracts(conn, registry)` reading `cfg.get("content_contracts")` and filtering on `locus ∈ {probe, both}`; keep the same result-dict shape (`{table, col, test, severity, failing_rows, status}`) so the formatter and ledger sync compose.
3. **Ledger sync — the one spot that silently fails if missed.** `sync_quality_checks(conn, value_results, schema_results)` at **`:277`** builds `want{}` from `_QUALITY_PREFIX = "quality_fail_"` (`:51`) and `_SCHEMA_PREFIX = "schema_drift_"` (`:52`). The **auto-close** query at **`:339-344`** hardcodes exactly **two** `LIKE` params:
   ```python
   " AND (check_key LIKE %s OR check_key LIKE %s)",
   (_QUALITY_PROJECT, _QUALITY_PREFIX + "%", _SCHEMA_PREFIX + "%"),
   ```
   A third prefix (e.g. `_CONTRACT_PREFIX = "contract_fail_"`) **must be added to this OR-list**, or contract checks will open and then never auto-close when the condition clears — the failure mode is silent (a permanently-open stale check, i.e. exactly the false-RED class the diagnosis is trying to kill).
4. **Output + main** — `format_value_tests` (`:363`) / `format_schema_drift` (`:385`); `main()` calls both at `:469-470` and appends to `summary` at `:497-499`. Add `format_content_contracts` + one `summary +=` line. CLI already carries `--dry-run` (read-only: SELECTs run, ledger/baseline writes suppressed — `:26-30`, `:428-429`); spec §5 (`:54`) adds `--contracts-backfill` and `--purge` to the same `argparse` block at `:427-432`.

**Invariant to preserve:** the probe's stated contract is *"Always exits 0 — observability, not gating"* (`:21-22`, restored by the blanket `except` at `:482-490`). Locus B must not change that. Blocking is Locus A's job (`ContentContractError`); Locus B reports.

---


Empirically airtight. The naive design drops **34 of 40** dated caveats — including both live permits degradations — and **still keeps the phantom it was built to kill**. Writing the deliverable.

## Caveat-TTL — exact boundary + real date formats

**Scope:** spec §7 3e (`docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md:78`). Read-only. As-of **2026-07-11**, TTL=14d. All caveat strings extracted with the engine's own parse contract (`refinery/lib/brain-output-reader.mts:47-64` — ` ```reference ` fence → `--- OUTPUT ---` → next `--- X ---`), so every string below is byte-identical to what Stage 4 sees. **37 of 42 brains carry caveats; 307 caveats total; 40 carry an absolute calendar day.**

---

### 0. Headline — the specced mechanism is inverted, not merely imperfect

Spec §7 3e says: *"regex the date already in the caveat string, drop if older than TTL."* Run against the live fleet, that rule:

| | naive date-regex | template-anchored |
|---|---|---|
| Absolute-dated caveats examined | 40 | 40 |
| **DROPPED** | **34** | **0** |
| False positives | **34** | 0 |
| **Phantom killed today?** | **NO** | **NO** |

**It drops 34 of 40 — including both live, currently-true permits degradations — and still misses its one target.** The macro-florida phantom is dated `2026-06-29` = **12 days old < 14d TTL**, so *no* correctly-implemented 14-day TTL drops it today (it starts dropping 07-13; macro-swfl self-heals ~07-29 at its 30d TTL anyway).

The two caveats a naive regex would silently delete are the exact ones that must ship (`04-brains-consumers.md` finding #2 flags the first as a real, unresolved degradation):

- `permits-swfl` / `master`: *"Most recent Naples permit issued **2026-04-30**; monthly XLSX has not refreshed for 68 days (cadence 30d). Collier signal in this build is stale."* → embedded date is **72d** old → naive **DROP**.
- `permits-swfl` / `master`: *"Most recent Lee permit issued **2026-06-16**; daily Accela scrape may be stalled (21 days since last issue)."* → **25d** → naive **DROP**.

These get **more true** as their date recedes — the date is a *last-source-event* date, not an emission date. A date-keyed TTL on them is backwards. Ditto 14 `cre-swfl` local-context **facts** (Aldi grocery `2025-12-01`/222d; Corkscrew Rd Widening `2026-01-01`/191d; Bay Oaks Park `2025-08-01`/344d) and `env-swfl`'s methodology note (*"Storm-year list … last reviewed 2026-05-17"*, 55d) — a maintenance note that must never expire.

**→ The regex must be anchored to the engine's caveat TEMPLATE, never to "a date somewhere in the string."**

---

### 1. Drift from the evidence docs (flagged per instructions)

Both the task framing and spec §7 3e state that **`4-output.mts` / `harvestUpstreams` re-lifts each upstream's baked `caveats[]`**. **This is wrong on mechanism.** I read `harvestUpstreams` in full (`refinery/stages/4-output.mts:152-213`): it never reads `read.output.caveats`. It *generates* new caveats from the `degradedIds` set. The real chain:

```
refinery/packs/master.mts:188   passing.flatMap((p) => p.upstream.caveats)   ← THE re-lift
refinery/packs/master.mts:198   dedupeCaveats([...cascade, ...floor, ...upstreamCaveats])
        ↓ returned as distilled.caveats
refinery/stages/4-output.mts:438  const caveats = [...distilled.caveats];    ← where it ARRIVES
```

`04-brains-consumers.md` finding #3 got the *symptom* right but attributed the lift to `harvestUpstreams`; the correct locus for the lift is `master.mts:188`. **`4-output.mts:438` is still the right place to filter** — it is the engine-wide chokepoint every pack's caveats pass through (producer-authored, re-lifted, and hand-written alike), which is precisely what the spec's "catches hand-written caveats too" requires.

**Blast radius bound (empirical): `master` is the ONLY re-lifter.** master's 20 absolute-dated caveats decompose exactly as cre-swfl 16 + permits-swfl 2 + env-swfl 1 + macro-swfl 1 = 20. No other brain carries a caveat originating upstream — `cre-swfl` has `brain-input` edges to permits-swfl/corridor-pulse yet carries none of their caveats.

---

### 2. (a) The exact insertion line

**`refinery/stages/4-output.mts:438`**

```ts
438:  const caveats = [...distilled.caveats];        // ← FILTER HERE
...
458:  caveats.push(...stalenessCaveats);             // this build's, minted today
459:  caveats.push(...degradationCaveats);           // this build's, minted today
```

Insert as: `const caveats = distilled.caveats.filter((c) => caveatIsFresh(c, now, 14));`

**Why 438 and not after 459:** at 438 the list is exactly the *inherited + producer-authored* set; the freshly-minted staleness/degradation caveats aren't appended yet. For a *template-anchored* filter both positions are functionally correct (caveats minted this build are 0 days old and pass either way) — but 438 scopes the filter to inherited caveats conceptually, and it is **load-bearing against the naive variant**: the L182 template embeds `expired ${status.expires_at}`, an expiry date that is *by definition in the past*, so a naive filter placed after 459 would delete a freshly-generated, true staleness caveat. Another nail in the naive coffin.

**Because 438 is engine-wide, anchoring is mandatory, not advisable** — a bare-date filter there strips cre-swfl's 16 local-context facts on every single build.

**The anchored predicate.** Only three caveat templates are engine-generated, all in this file:

| Line | Template | Embedded date semantic | TTL-able? |
|---|---|---|---|
| `4-output.mts:191` | `Upstream brain '{id}' failed to rebuild on {today}; using last good read from {lastDate} (v{n}).` | **emission date** (`today` = that build's run date) | **YES — the target** |
| `4-output.mts:182-183` | `Upstream brain '{id}' was stale at build time (expired {expires_at}).` | an **expiry**, always past | No — date-TTL is semantically wrong |
| `4-output.mts:171` | `Upstream brain '{id}' was unavailable at build time (no last-good read).` | **no date at all** | No — un-TTL-able by regex |

```ts
const DEGRADE_CAVEAT =
  /^Upstream brain '[^']+' failed to rebuild on (\d{4}-\d{2}-\d{2}); using last good read from \d{4}-\d{2}-\d{2} \(v\d+\)\.$/;
```
Capture group 1 is the only date in the fleet whose value means "when this caveat was born." Everything else keeps.

**Structural limit to name in the spec:** a date-TTL cleanly solves the **L191 class only**. L182 and L171 have the identical freeze-and-re-lift failure mode (0 instances today, but the same latent bug) and are unreachable by date math. The stronger backstop invariant — *engine-template `Upstream brain '…'` caveats state DAG state, which is recomputed every build, so they should never be inherited across a re-lift at all* — kills all three classes with zero date parsing and zero false positives. Flagging it as the better fix; **not** overriding the spec, since TTL was chosen deliberately to dodge the `BrainOutput` type-lift (§14).

---

### 3. (b) Observed caveat-date formats — grounded, not guessed

Across all 307 caveats. **The task's hinted `"as of MM/DD/YYYY"` form does not occur in any caveat** — `MM/DD/YYYY` exists only in the speaker's rendered `_Freshness:_ as of 07/11/2026` line, which is not a caveat. Caveats say "as of **2026-07-05**" (ISO).

| Format | Regex | Hits | Brains | Day-pinnable? | In scope for TTL? |
|---|---|---|---|---|---|
| **ISO date `YYYY-MM-DD`** | `\b\d{4}-\d{2}-\d{2}\b` | **40** | 5 — cre-swfl, master, permits-swfl, env-swfl, macro-swfl | **YES** | **Yes — the only one.** But only when it sits in the L191 template |
| Bare year `YYYY` | `\b(19\|20)\d{2}\b` | 50 | 11 | No | No |
| Relative `N days` | `\b\d+\s+days?\b` | 13 | 7 | No | No |
| `Month YYYY` | `January…December \d{4}` | 6 | 3 | No | No |
| Year-month `YYYY-MM` | `\b\d{4}-\d{2}\b` | 4 | 3 | No | No |
| BLS period `YYYY-Mnn` | `\b\d{4}-M\d{2}\b` | 2 | 2 (macro-swfl, master) | No | No |
| ISO-8601 timestamp | `…T..:..:..Z` | 0 | — | — | — |
| `MM/DD/YYYY` | `\b\d{1,2}/\d{1,2}/\d{4}\b` | **0** | — | — | — |

**Exactly one absolute format exists: ISO `YYYY-MM-DD`.** The coarse tokens are present but not day-pinnable — **do NOT widen the regex to reach them.** `2026-M04` in particular is a BLS *reference period*, not a date.

---

### 4. (c) Brains carrying a datestamped caveat, with verdicts

Age as-of 2026-07-11, TTL=14d. "L191?" = matches the emission-date template.

| Brain | Caveat (truncated) | Date | Age | L191? | Naive | **Anchored** |
|---|---|---|---|---|---|---|
| **macro-swfl** | `Upstream brain 'macro-florida' failed to rebuild on 2026-06-29; using last good read from 2026-06-29 (v23).` | 2026-06-29 | 12d | **YES** | keep | keep *(12 < 14)* |
| **master** | same string, re-lifted via `master.mts:188` | 2026-06-29 | 12d | **YES** | keep | keep *(12 < 14)* |
| **permits-swfl** | `Most recent Naples permit issued 2026-04-30; … not refreshed for 68 days … Collier signal … stale.` | 2026-04-30 | 72d | no | **DROP** ❌ | **keep** ✅ |
| **permits-swfl** | `Most recent Lee permit issued 2026-06-16; daily Accela scrape may be stalled…` | 2026-06-16 | 25d | no | **DROP** ❌ | **keep** ✅ |
| **env-swfl** | `Storm-year list (Charley 2004 … Milton 2024) was last reviewed 2026-05-17. Requires update in …` | 2026-05-17 | 55d | no | **DROP** ❌ | **keep** ✅ |
| **cre-swfl** | 2 × Crexi "as of 2026-07-05" disclosure | 2026-07-05 | 6d | no | keep | keep |
| **cre-swfl** | 14 × `[fmb_planning]` / `[estero_edc]` local-context **facts** (Bay Oaks Park, Aldi, Corkscrew Rd Widening, Times Square Pier…) | 2025-08-01 → 2026-05-01 | 55–344d | no | **DROP ×14** ❌ | **keep** ✅ |
| **master** | the above 17 re-lifted (14 cre-swfl facts + env-swfl + 2 permits) | — | 25–344d | no | **DROP ×17** ❌ | **keep** ✅ |

Totals: **naive DROP = 34/40, all 34 false positives. Anchored DROP = 0/40.** Only `macro-swfl` + `master` carry the L191 template (2 instances of 1 unique string). Age ladder of unique dates: `2025-08-01`→344d, `2025-12-01`→222d, `2026-01-01`→191d, `2026-04-08`→94d, `2026-04-30`→72d, `2026-05-01`→71d, `2026-05-17`→55d, `2026-06-16`→25d, `2026-06-29`→**12d**, `2026-07-05`→6d.

---

### 5. Build-time vs serve-time — 438 alone does not stop the bleed

`4-output.mts:438` runs at **build** time. `macro-swfl` is `skipped-fresh` (30d TTL from 06-29 → next rebuild ~**2026-07-29**), so it never re-enters Stage 4. A filter at 438 cleans **master** (rebuilt daily → re-lifts → filtered), but `brains/macro-swfl.md` keeps the frozen string on disk and **`/api/b/macro-swfl?view=speak&tier=2` keeps serving the phantom for ~18 more days.**

The spec says "parse-at-**render**." The true render chokepoint is the speaker:

- `refinery/render/speaker.mts:828` — `isDisplayableCaveat(scrubbed: string): boolean`, the existing caveat-drop predicate
- applied at `speaker.mts:500-502` (chat `speak()`) and `speaker.mts:862-864` (`toDisplayBrain()` → web report)

It is a pure `(string) => boolean`, and since `caveatIsFresh` parses its date out of the string it slots in with one added `now` argument — no `BrainOutput` type-lift, exactly the constraint §14 protects.

**Recommendation: both loci, one shared anchored predicate.** `4-output.mts:438` stops *propagation* (the phantom stops entering newly-baked artifacts); `speaker.mts:828` stops *serving* an already-baked caveat from a brain that won't rebuild for weeks. Build-only is a partial fix by construction.

---

### 6. What to change in the spec (§7 3e)

1. **Correct the mechanism**: the re-lift is `refinery/packs/master.mts:188`, not `4-output.mts`/`harvestUpstreams`. Keep `4-output.mts:438` as the filter locus (it's the engine-wide chokepoint), but for the right reason.
2. **Replace "regex the date already in the caveat string"** with the template-anchored `DEGRADE_CAVEAT` regex. As written, the spec ships a rule that deletes 34 true caveats including two live degradations.
3. **State the only real format is ISO `YYYY-MM-DD`** — `MM/DD/YYYY` never appears in a caveat.
4. **Add the serve-time locus** (`speaker.mts:828`) or explicitly accept that a skipped-fresh brain keeps serving its frozen caveat until its own TTL expires.
5. **Note the TTL's structural ceiling**: it can only ever fix the L191 class; L182 (embeds an expiry) and L171 (no date) share the bug and are unreachable by date math.
6. **Acceptance test must include negative cases** — the 2 permits-swfl caveats, env-swfl's storm-year note, and a cre-swfl `[estero_edc]` fact must all **survive** a build at TTL=14. Those are the regression the naive design would ship.

**Files:** `C:\Users\ethan\dev\brain-platform\refinery\stages\4-output.mts` (:171, :182-183, :191, **:438**, :458-459) · `C:\Users\ethan\dev\brain-platform\refinery\packs\master.mts` (:188, :198) · `C:\Users\ethan\dev\brain-platform\refinery\render\speaker.mts` (:828, :500-502, :862-864) · `C:\Users\ethan\dev\brain-platform\refinery\lib\brain-output-reader.mts` (:47-64, parse contract used for this scan).

---


## Doctor + assert_landed integration surface

**Scope:** the importable surface of `ingest/scripts/check_freshness.py` (951 ln) and `ingest/scripts/check_data_quality.py` (513 ln), so `doctor.py` + `assert_landed.py` (spec §7 3c, §8) **import** rather than re-query. As-of 2026-07-11. Every claim cites `file:line` or a live `query_lake` SELECT.

---

### 1. The import precedent (use the package form, not the path hack)

Three modules already reuse `check_freshness` — two of them via a `sys.path` hack that doctor should **not** copy:

| Importer | Form | Verdict |
|---|---|---|
| `ingest/scripts/generate_data_targets.py:19` | `from ingest.scripts.check_freshness import _get_connection, load_registry, run_probe` | **CANONICAL — copy this.** Absolute package import; runs as `python -m ingest.scripts.generate_data_targets` (:8-9) |
| `ingest/scripts/rebuild_due.py:58-64` | `sys.path.insert(...)` + `from check_freshness import _get_connection, check_tier1_entry, check_tier2_entry, load_registry` | works only because of the path insert |
| `ingest/scripts/check_data_quality.py:47-48` | `sys.path.insert(...)` + `from check_freshness import _get_connection, _slug` | same hack |
| `ingest/tests/scripts/test_check_freshness.py:9-11` | `sys.path.insert(repo_root)` + `from ingest.scripts.check_freshness import ...` | test-side precedent for the package form |

Both `ingest/__init__.py` and `ingest/scripts/__init__.py` exist, so `ingest.scripts.*` is a real package. **Doctor's import block:**

```python
from ingest.scripts.check_freshness import (
    _get_connection, load_registry, run_probe, check_sla_violations,
    check_tier1_entry, check_tier2_entry, check_odd_window_entry,
    check_volume_entry, check_view_liveness, collect_views_manifest,
    check_structural_gaps, _slug,
)
from ingest.scripts.check_data_quality import (
    load_quality_registry, run_value_tests, run_schema_drift, diff_schema, read_live_schema,
)
```
Invoke as `python -m ingest.scripts.doctor` / `python -m ingest.scripts.assert_landed`.
Deps are already satisfied: `ingest/requirements-probe.txt` = `psycopg[binary]>=3.2` + `pyyaml>=6.0` — **no HTTP lib, no GitHub client** (see §4c).

---

### 2. `check_freshness.py` — reusable functions

**Connection + registry (the (a) confirmation the task asks for — doctor reuses both, writes neither):**

| Signature | Returns |
|---|---|
| `_get_connection()` — :46-74 | live `psycopg.Connection`. `DESTINATION__POSTGRES__CREDENTIALS` env first; else parses `.dlt/secrets.toml` `[*credentials*]` sections. `sslmode=require`, `connect_timeout=15`. Private-by-name but **already an established cross-module import** (`check_data_quality.py:48`, `rebuild_due.py:60`, `generate_data_targets.py:19`) — reusing it is the precedent, not a violation. |
| `load_registry(path: str \| Path) -> dict[str, Any]` — :80-82 | raw `yaml.safe_load` of `cadence_registry.yaml`. Top-level keys: `pipelines:` (:42) and `not_yet_running:` (:1602). Callers resolve the path as `Path(__file__).parent.parent / "cadence_registry.yaml"` (:871). |
| `load_quality_registry(path=_REGISTRY_PATH) -> dict` — `check_data_quality.py:61-63` | `ingest/quality/quality_registry.yaml`, keyed by **physical table** (`tables:` → 4 tables today). |

**Per-entry probes** (all take `(conn, entry)` where `entry` is one `pipelines:` dict):

| Signature | Returns |
|---|---|
| `check_tier1_entry(conn, entry) -> dict` — :278-347 | `{name, lane, last_run: date\|None, age_days, cadence_days, threshold_days, status}`. `status ∈ FRESH\|STALE\|MISSING`. Queries `data_lake._tier1_inventory` by `inventory_id` (exact or `prefix`). Rolls back + returns `MISSING` on any DB error (:302-323). |
| `check_tier2_entry(conn, entry) -> dict` — :411-441 | same shape, `lane: "tier-2"`. Delegates to `_fetch_max_freshness`. |
| `check_odd_window_entry(conn, entry, _today=None) -> dict` — :458-514 | same shape + `expected_date`. `status ∈ FRESH\|WAITING\|WINDOW_OPEN\|OVERDUE`. For `probe_mode: odd_window`. |
| `_fetch_max_freshness(conn, entry) -> date \| None` — :224-275 | The **lane-aware freshness resolver** — the single most reusable primitive. `freshness_table` present → `SELECT MAX(<freshness_column>) FROM <schema>.<table> [WHERE source_name=%s]`; else → `SELECT MAX(inserted_at) FROM data_lake._dlt_loads WHERE schema_name=%s AND status=0`. Returns `None` on missing table (rollback-swallowed, :265-271). |
| `check_volume_entry(conn, entry) -> dict \| None` — :350-408 | `{landed: int, min_rows: int, status: "OK"\|"LOW_VOLUME", table: str}` **or `None`**. Table-resolution order (:373-377): `count_table` → `freshness_table` → `data_lake.<dlt_schema_name>`. Applies optional `source_name` filter. |
| `check_view_liveness(liveness_view: str) -> dict` — :102-195 | `{view, status: VIEW_FRESH\|VIEW_STALE, http_status, detail}`. **PostgREST REST** GET, not psycopg — the only path that catches a missing `GRANT` (:19-23, :96-97). Needs `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`; returns `VIEW_STALE` if unset. |
| `collect_views_manifest(registry) -> list[str]` — :198-210 | sorted set of all `liveness_view` values. |

**Aggregate runner + SLA:**

| Signature | Returns |
|---|---|
| `run_probe(conn, registry) -> tuple[list[dict], list[dict]]` — :627-662 | `(pipeline_results, view_results)`. Dispatches per entry on `probe_mode`/`lane`, then **merges the volume result into each pipeline dict** as `volume_status` / `volume_landed` / `volume_min`, and attaches `freshness_sla` (:647-651). This is doctor's one-call fan-out for the whole Postgres domain. |
| `check_sla_violations(results) -> tuple[list[str], list[str]]` — :668-691 | `(sla_error_names, sla_warn_names)`. Opt-in: only entries carrying `freshness_sla`; skips `age_days is None`. |

**Checks-ledger writers (doctor should reuse the *pattern*, and may reuse the fns directly):**

| Signature | Returns |
|---|---|
| `check_structural_gaps(conn) -> list[str]` — :539-556 | cities with `city_pulse` news but 0 verified corridors. |
| `sync_gap_checks(conn, gap_cities) -> {"opened": [...], "closed": [...]}` — :559-618 | **Proves `public.checks` is writable over the same psycopg conn** (`INSERT INTO public.checks (project, check_key, label, detail, priority, state)`, :575-589). Idempotent; respects a human `dropped`; auto-closes cleared keys. |
| `_slug(s) -> str` — :534-536 | stable `check_key` suffix. Already imported by `check_data_quality.py:48`. |

**Formatters (reusable for `doctor` default report):** `format_sla_section` :694-730 · `format_summary` :747-782 · `format_view_liveness` :785-824 · `format_gaps` :827-851. Status icon maps at :735-744.

---

### 3. `check_data_quality.py` — reusable functions (the content-health domain)

| Signature | Returns |
|---|---|
| `run_value_tests(conn, registry) -> list[dict]` — :128-168 | one dict per test: `{table, col, test, severity, failing_rows, status: PASS\|FAIL\|SKIP}`. Dispatches via `_BUILDERS` (:121-125). **This is doctor's content signal today.** |
| `build_not_null_sql(table, col)` :82-89 · `build_unique_sql(table, col)` :92-102 · `build_accepted_values_sql(table, col, values)` :104-118 | each → `(psycopg.sql.Composable, params)`. **Pure, DB-free, unit-testable** — the exact shape Phase-1 `contracts.py` builders should mirror. Note the locked psycopg3 idiom at :107-110: `{col}::text <> ALL(%s::text[])`, *not* `NOT IN %s`. |
| `run_schema_drift(conn, registry) -> list[dict]` — :228-263 | per table: `{table, status: CLEAN\|DRIFT\|BASELINE_MISSING\|SKIP, deltas}`. |
| `diff_schema(baseline: dict, live: dict) -> list[dict]` — :174-193 | `{col, change: ADDED\|REMOVED\|TYPE_CHANGED, baseline_type, live_type}`. **Pure — two dicts in, list out.** |
| `read_live_schema(conn, table) -> dict[str,str]` — :196-205 | `{column_name: data_type}` from `information_schema.columns`. |
| `load_baseline(table)` :212-217 · `write_baseline(table, live)` :220-224 | checked-in JSON under `ingest/quality/schema_baselines/`. |
| `sync_quality_checks(conn, value_results, schema_results) -> {"opened","closed"}` — :277-355 | opens/auto-closes `public.checks` rows under `project="data-quality"`. Doctor should **not** call this (double-write); it reads the same ledger. |
| `format_value_tests` :363-382 · `format_schema_drift` :385-411 · `_emit(msg, dry_run)` :417-423 | report rendering; `_emit` handles the `$GITHUB_STEP_SUMMARY`-vs-stdout switch. |

**Honest scope note:** the richer `content_contracts` (`enum` / `range` / `sql_expectation` via `contracts.py::evaluate_batch`) named in spec §5 **do not exist yet**. Today's content surface is exactly `not_null` / `unique` / `accepted_values` over **4 tables** (`quality_registry.yaml` — `news_articles_swfl`, `zhvi_swfl`, `zori_swfl`, `leepa_parcels`), **none of them the listing tables** — matching `00-DIAGNOSIS.md:34`. Doctor imports `run_value_tests` today and gains the contract types when Phase 1 lands; the registry key is the **physical table**, while `cadence_registry` keys by **pipeline name** — doctor must join them itself (no existing crosswalk).

---

### 4. (c) The three cred domains doctor must join — and where each lives

| # | Domain | Signal | Cred | Where it lives |
|---|---|---|---|---|
| **A** | **Postgres (psycopg)** | freshness · volume · content-contracts · **checks ledger** | `DESTINATION__POSTGRES__CREDENTIALS`, else `.dlt/secrets.toml` | `_get_connection()` — `check_freshness.py:46-74`. Wired in `freshness-probe-daily.yml` (env block on both steps). |
| **B** | **GitHub Actions (`gh`)** | last-run · last-success · conclusion · enabled/disabled | `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` | `tripwire-hourly.yml:40`. Commands proven in `scripts/tripwire-scan.mjs`: `gh run list --limit 100 --json workflowName,event,conclusion,createdAt,url` (:129) and `gh workflow list --all` (:103). |
| **C** | **Supabase PostgREST (REST)** | view liveness / missing-GRANT | `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | `check_view_liveness()` — `check_freshness.py:102-195`. Wired in `freshness-probe-daily.yml`. |

**The reuse precision that matters (this is the (a) answer):** domains A and the checks ledger **collapse onto one psycopg connection** — `public.checks` lives in the *same* Postgres DB and is written over the `_get_connection()` conn (`sync_gap_checks`, :559-618). So doctor opens **one** psycopg conn for freshness + volume + content + ledger. C is genuinely separate *only* because PostgREST catches a missing GRANT that psycopg structurally bypasses (:19-23).

**B is the one真 gap:** the gh domain is implemented **in JavaScript** (`tripwire-scan.mjs`), and `requirements-probe.txt` carries no HTTP or GitHub client. Doctor (Python) must reach it via `subprocess.run(["gh", ...])` — precedent exists in-repo (`backfill_lee_permits.py:13,50`; `faf5_to_parquet.py:14,70`). `gh` is preinstalled+authenticated on GHA runners when `GH_TOKEN` is set. Doctor's workflow must add `GH_TOKEN` to the env block — **`freshness-probe-daily.yml` does not carry it today.** Spec §7 3a's `_watch-manifest.json` becomes the shared, language-neutral seam between the JS watchers and Python doctor.

---

### 5. (b) `assert_landed.py` — the nightly row gate, built on these helpers

**Contract (spec §8):** for each `nightly: true` entry — `last_run == today (UTC)` **AND** `count(*) >= min_rows`. Name every failure → exit 1 → skip rebuild.

```python
# python -m ingest.scripts.assert_landed [--dry-run]
from datetime import datetime, timezone
from ingest.scripts.check_freshness import (
    _get_connection, load_registry, _fetch_max_freshness, check_volume_entry,
    check_tier1_entry, check_tier2_entry,
)

def assert_landed(conn, registry, today=None) -> list[dict]:
    """One result per `nightly: true` entry:
       {name, last_run, landed, min_rows, status: LANDED|STALE|LOW_ROWS|UNRESOLVED}"""
    today = today or datetime.now(timezone.utc).date()   # UTC, NOT date.today()
    ...
```

**Step 1 — freshness.** Call `_fetch_max_freshness(conn, entry)` (tier-2) or `check_tier1_entry(conn, entry)["last_run"]` (tier-1) for the **`last_run` value**, then apply assert_landed's **own** comparison `last_run == today_utc`.

> **DO NOT reuse the `status` field.** `check_tier2_entry:432` computes `FRESH` when `age_days <= cadence * tolerance`. For `active_listings` that is `1 × 3.0 = 3 days` (registry :1473-1474) — a source that last landed **two days ago is "FRESH"** and would sail through a nightly gate. Reusing `status` here rebuilds root-cause-1 ("green ≠ data") *inside the fix*. Same for `listing_lifecycle` (tolerance 3.0, :1494-1495).

**Step 2 — rows.** Call `check_volume_entry(conn, entry)` for the `landed` count and its table-resolution (`count_table` → `freshness_table` → `data_lake.<dlt_schema_name>`, :373-377), but **apply the `min_rows` threshold in assert_landed** — the helper keys its own pass/fail off `expected_rows_min` (:365), which is the *loose observability* floor, not the new nightly `min_rows`.

**Step 3 — the None trap (load-bearing).** `check_volume_entry` returns `None` for **three indistinguishable reasons**: no `expected_rows_min` (:365-367), a tier-1 lane (:369-371), or **any DB error incl. a missing table** (:399-404, rollback-swallowed). A ghost table therefore returns `None`. **Map `None` → `UNRESOLVED` → RED for a `nightly: true` entry — never "skip."** Treating it as not-applicable would pass a nonexistent table, which is exactly the `redfin_city_swfl` class (`00-DIAGNOSIS.md:17`).

**Step 4 — set reconciliation.** Every `nightly: true` entry must produce a result row. `run_probe`'s lane filter ends in `else: continue` (:645-646), silently dropping any entry that is neither tier-1 nor tier-2 — so **a nightly entry with no result is itself a RED**, not a pass.

**Exit contract:** `assert_landed` **inverts** both probes' "always exit 0 / observability, never gate" invariant (`check_freshness.py:30-31`, `check_data_quality.py:21-22`). It is a *gate*: any `STALE` / `LOW_ROWS` / `UNRESOLVED` → print the named list → **exit 1**. Ship report-only first (spec §15 step 6). Doctor keeps the exit-0 contract until flipped to `--fail-on red`.

---

### 6. Drift found against the spec / evidence (flag, don't re-derive)

1. **`nightly:` and `min_rows:` do not exist in the registry** — `grep -cE '^\s+(nightly|min_rows):' ingest/cadence_registry.yaml` = **0**. Spec §3 lists them as new Spine fields; **assert_landed is hard-blocked on the Spine.** Interim bootstrap: `expected_rows_min` exists on **51** entries.
2. **`city_pulse` cannot satisfy the spec's own nightly gate.** Spec §3 names city-pulse one of the 4 `nightly: true` sources. But registry :444-449 has `lane: tier-1`, **`cadence_days: 7`** ("WEEKLY cost mode 07/05/2026"), `inventory_id` only — **no `count_table`, no `freshness_table`, no `expected_rows_min`.** `check_volume_entry` **early-returns `None` for every tier-1 lane** (:369-371), so a `count(*) >= min_rows` check on city_pulse is *unreachable* through the existing helper. Fix requires adding `count_table: data_lake.city_pulse` to the entry **and** relaxing the tier-1 early-return (or a doctor-local counter). Live: **207 rows**, last `captured_at` **2026-07-11**.
3. **`daily_truth` is shared by two registry entries with no discriminator.** `live_search_daily_median_price` (:46-52) and `live_search_daily_mortgage` (:82-88) both point at `freshness_table: data_lake.daily_truth` / `freshness_column: retrieved_at` with **no `source_name`** (deliberately removed 07/05 — :51-53). So `_fetch_max_freshness` and `check_volume_entry` return **table-wide** values for both. Live: `median_sale_price` **60 rows**, `mortgage_30yr_fixed` **4 rows** (both last `retrieved_at` 2026-07-11). **Mortgage is masked by median_price's daily write** — if mortgage never ran again, both entries would still read fresh, and `expected_rows_min: 1` is trivially met by the other metric's 64-row total. A per-metric nightly gate **cannot** ride `check_volume_entry` for these; it needs a `metric_key`-scoped count.
4. **UTC vs local date.** Both probes compute age with `date.today()` (:337, :431) — **local**, not UTC. Coincides on GHA (TZ=UTC), diverges locally (EDT). `assert_landed` must use `datetime.now(timezone.utc).date()`; its contract is explicitly UTC. Related: `_to_date` (:216-221) calls `.astimezone(timezone.utc)` on the value, which assumes **local** tz for a naive `timestamp` column.
5. **Stale comment.** `check_freshness.py:526-528` states the probe runner "carries only `DESTINATION__POSTGRES__CREDENTIALS` — no Supabase REST creds." **False today** — `freshness-probe-daily.yml` passes `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` to both steps (added for the view-liveness probe).
6. **No `GH_TOKEN` in the probe workflow** — doctor's gh domain (§4B) requires adding it; `tripwire-hourly.yml:40` is the only place it's wired.

---

### 7. Live grounding for `min_rows` (SELECT-only, `query_lake`, 2026-07-11)

| Registry entry | Table (source filter) | Live rows | Last landed | Suggested `min_rows` (~90%) |
|---|---|---|---|---|
| `active_listings` | `active_listings_residential` (`source_name='active_listings_seed'`) | **39,050** | 2026-07-11 | ~35,000 (registry floor is **2,000** — :1476, self-flagged stale) |
| `listing_lifecycle` | `listing_state` (`source_name='api_feed'`) | **34,637** | 2026-07-11 | ~31,000 (registry floor is **9,000** — :1500, self-flagged "PLACEHOLDER") |
| `live_search_daily_median_price` | `daily_truth` (`metric_key='median_sale_price'`) | **60** | 2026-07-11 | needs metric-scoped count — see drift #3 |
| `live_search_daily_mortgage` | `daily_truth` (`metric_key='mortgage_30yr_fixed'`) | **4** | 2026-07-11 | needs metric-scoped count — see drift #3 |
| `city_pulse` | `city_pulse` (`captured_at`) | **207** | 2026-07-11 | unreachable via `check_volume_entry` — see drift #2 |

All four nightly sources **did** land today, so a report-only `assert_landed` run against the current snapshot should come back green on freshness — making today a clean baseline to seed the gate from.

**Files:** `C:\Users\ethan\dev\brain-platform\ingest\scripts\check_freshness.py` · `C:\Users\ethan\dev\brain-platform\ingest\scripts\check_data_quality.py` · `C:\Users\ethan\dev\brain-platform\ingest\scripts\generate_data_targets.py` (import precedent) · `C:\Users\ethan\dev\brain-platform\ingest\lib\guards.py` (`VolumeGuardError` — `ContentContractError`'s sibling, spec §5) · `C:\Users\ethan\dev\brain-platform\scripts\tripwire-scan.mjs` (gh domain) · `C:\Users\ethan\dev\brain-platform\.github\workflows\freshness-probe-daily.yml` · `C:\Users\ethan\dev\brain-platform\ingest\quality\quality_registry.yaml` · `C:\Users\ethan\dev\brain-platform\ingest\cadence_registry.yaml`
