# Industry Character System — 7 Audience Voices

## Context

The corridor character generator (Steps 0–4 shipped) proved the three-layer pattern:

- **Facts block** — sourced, deterministic, internal + web citations, no hedging
- **Chart block** — optional comparison table, fact-pack values only
- **Speculative block** — AI inference, hedged, ends with mandatory disclaimer

That pattern works for CRE brokers/investors. This system ports it to 7 distinct audiences using the same data lake, the same lint stack, and the same DB infrastructure. The only variables per voice are: (a) which brains feed the fact pack, (b) which web search queries feed the grounded pipeline, and (c) the system-prompt framing for the synthesizer.

This gives master brain "current voice" — past lake data we stand behind + Anthropic web_search data we separate from + labeled speculation. It lets Claude make better inferences because it knows what the historical numbers actually were.

---

## Hard Gate

**Phase 0 is blocked until Step 4 of the corridor character generator achieves 5/5 operator spot-check sign-off and those template files are merged to main.** Cloning `build-corridor-fact-pack.mts` or `synthesize-corridor-character.mts` before Step 4 stabilizes means any subsequent patch to the originals must also be applied in 7 downstream copies. Confirm Step 4 is green before starting Phase 0.

---

## Voice Files

| File                                               | Voice             | Audience                   | Priority                                 | New Pipes                             |
| -------------------------------------------------- | ----------------- | -------------------------- | ---------------------------------------- | ------------------------------------- |
| [01-main-street.md](01-main-street.md)             | Main Street       | Small Business / Franchise | 1 — largest audience, all data live      | None                                  |
| [02-storm-ready.md](02-storm-ready.md)             | Storm Ready       | Risk & Insurance           | 2 — unique NFIP moat                     | None                                  |
| [03-move-ready.md](03-move-ready.md)               | Move Ready        | Relocation                 | 3 — massive SWFL relocation market       | None                                  |
| [04-builders-edge.md](04-builders-edge.md)         | Builder's Edge    | Development Pipeline       | 4 — strong data, actionable              | None                                  |
| [05-lenders-view.md](05-lenders-view.md)           | Lender's View     | SBA / Commercial Lending   | 5 — underserved audience                 | None                                  |
| [06-seasonal-operator.md](06-seasonal-operator.md) | Seasonal Operator | Hospitality / STR          | 6 — TDT live; STR pricing gap manageable | Optional: `str_firecrawl` (~4 hrs)    |
| [07-local-pulse.md](07-local-pulse.md)             | Local Pulse       | Civic / Community          | 7 — needs 2 free gov pipes               | `fldoe_grades` + `fdle_ucr` (~2 days) |

---

## DB Schema

**New table `corridor_industry_characters` — do NOT add 42 columns to `corridor_profiles`.**

```sql
-- docs/sql/20260526_corridor_industry_characters.sql
CREATE TABLE IF NOT EXISTS corridor_industry_characters (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor_slug           TEXT NOT NULL,
  voice_id                TEXT NOT NULL CHECK (voice_id IN (
                            'main-street', 'storm-ready', 'move-ready',
                            'builders-edge', 'lenders-view',
                            'seasonal-operator', 'local-pulse')),
  character_facts         TEXT,
  character_chart         JSONB,
  character_speculative   TEXT,
  character_citations     JSONB,
  character_generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  character_fact_pack_vintage TEXT,
  UNIQUE (corridor_slug, voice_id)
);
CREATE INDEX idx_cic_slug  ON corridor_industry_characters (corridor_slug);
CREATE INDEX idx_cic_voice ON corridor_industry_characters (voice_id);
```

Why: normalized `(corridor_slug, voice_id)` PK supports `SELECT ... WHERE voice_id = $1` without 42-column branch logic; same 6-column shape the existing lint/synthesizer/renderer already know.

---

## Routing Logic

New file: `refinery/lib/classify-voice.mts`

**5-tier cascade (first match wins):**

1. Explicit `?voice=<id>` API param
2. Session `userType` profile match
3. Keyword regex on question text (no LLM — covers 80%+ of queries)
4. Haiku-class LLM fallback (rare; log for pattern analysis)
5. Default: `cre-corridor` (existing corridor character)

**Keyword → voice table (priority order, case-insensitive):**

| Priority | Pattern                                                                                          | Voice               |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| 1        | `franchise\|franchisee\|SBA\|small.?business\|SBDC\|7a\|504.?loan\|brand.?survival`              | `main-street`       |
| 2        | `foot.?traffic\|daily.?traffic\|AADT\|drive.?by\|vehicle.?count`                                 | `main-street`       |
| 3        | `flood\|hurricane\|storm.?surge\|NFIP\|insurance.?rate\|flood.?zone\|SFHA\|VE.?zone`             | `storm-ready`       |
| 4        | `Ian\|Irma\|storm.?claims\|named.?storm\|flood.?claim`                                           | `storm-ready`       |
| 5        | `relocat\|moving.?to\|retire.?to\|snowbird\|cost.?of.?living\|where.?to.?live`                   | `move-ready`        |
| 6        | `home.?price\|home.?value\|HPI\|FHFA\|median.?home`                                              | `move-ready`        |
| 7        | `build\|permit\|entitlement\|land.?use\|zoning\|parcel\|construction.?loan\|general.?contractor` | `builders-edge`     |
| 8        | `development.?pipeline\|ground.?up\|spec.?build\|infill`                                         | `builders-edge`     |
| 9        | `lender\|underwrite\|collateral\|LTV\|DSCR\|charge.?off\|CDR\|loan.?default`                     | `lenders-view`      |
| 10       | `SOFR\|prime.?rate\|lending.?rate\|community.?bank\|CDFI`                                        | `lenders-view`      |
| 11       | `STR\|short.?term.?rental\|Airbnb\|VRBO\|nightly.?rate\|hotel\|TDT\|tourist.?tax\|hospitality`   | `seasonal-operator` |
| 12       | `tourism\|visitor\|TDC\|destination\|resort\|season.?demand`                                     | `seasonal-operator` |
| 13       | `school\|HOA\|neighborhood.?safety\|local.?crime\|civic\|quality.?of.?life\|livability`          | `local-pulse`       |
| 14       | `FDLE\|UCR\|property.?crime\|crime.?per\|A-F.?grade\|FLDOE`                                      | `local-pulse`       |

**userType → default voice map:**

| userType                                                          | voice               |
| ----------------------------------------------------------------- | ------------------- |
| `franchisee`                                                      | `main-street`       |
| `sba-lender`, `community-bank`, `cdfi`                            | `lenders-view`      |
| `homeowner`, `insurance-agent`, `property-manager`, `re-attorney` | `storm-ready`       |
| `relocating-retiree`, `remote-worker`, `snowbird`                 | `move-ready`        |
| `general-contractor`, `land-use-attorney`, `construction-lender`  | `builders-edge`     |
| `str-operator`, `hotel-owner`, `hospitality-investor`             | `seasonal-operator` |
| `hoa-board`, `resident`, `journalist`                             | `local-pulse`       |

**Known edge-case priority collisions (document in `classify-voice.test.mts`, not bugs):**

- "construction loan for my hotel" → matches `builders-edge` (priority 7: `construction.?loan`) before `seasonal-operator` (priority 11: `hotel`). Defensible: financing intent beats asset type.
- "flood insurance for my vacation rental" → matches `storm-ready` (priority 3: `insurance`) before `seasonal-operator` (priority 11: `vacation.?rental`). Defensible: risk lens beats operator lens.
- These are conscious decisions. If the userType profile is present (`str-operator`), tier 2 overrides and routes correctly anyway.

---

## Shared Infrastructure (Phase 0 — prerequisite for all voices)

| Step | File                                                          | Notes                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0A   | `docs/sql/20260526_corridor_industry_characters.sql`          | DB migration                                                                                                                                                                          |
| 0B   | `refinery/lib/slugify-corridor.mts` + `ingest/lib/slugify.py` | **Ship first.** Single shared slug function in both languages with a cross-language test asserting identical output. Fixes the 7× slug-divergence foot-gun before any pipeline clone. |
| 0C   | `refinery/lib/classify-voice.mts`                             | Routing function + unit tests; document known edge-case priority collisions in the test file                                                                                          |
| 0D   | `refinery/tools/build-industry-fact-pack.mts`                 | Shared `IndustryFactPack` interface                                                                                                                                                   |
| 0E   | `ingest/pipelines/industry_grounded/pipeline.py`              | Parameterized clone of `corridor_grounded/pipeline.py`; accepts `--voice` and `--batch-size` flags; writes to `lake-tier1/industry_grounded/{voice_id}/{slug}/`                       |
| 0F   | `refinery/tools/synthesize-industry-character.mts`            | Parameterized clone of `synthesize-corridor-character.mts`; writes to `corridor_industry_characters` table                                                                            |
| 0G   | `refinery/validate/industry-character-lint.mts`               | Thin wrapper calling existing `lintCorridorCharacterOutput`                                                                                                                           |
| 0H   | `cadence_registry.yaml` entries (7 entries, one per voice)    | Add quarterly cadence entries for all 7 `industry_grounded` voice runs so the daily freshness probe doesn't flag them as `not_yet_running`                                            |

**Build order within Phase 0:** 0B (slug) → 0A (DB) → 0C (router) → 0D (interface) → 0E (grounded pipeline) → 0F (synthesizer) → 0G (lint) → 0H (cadence)

**Critical templates (copy, don't reinvent):**

- `refinery/tools/build-corridor-fact-pack.mts` — MetricFact / ImportantMath / FactValue pattern
- `ingest/pipelines/corridor_grounded/pipeline.py` — ALLOWED_DOMAINS, SEARCH_TOOL_VERSION (`web_search_20250305`), storage path, `_extract_citations`
- `refinery/tools/synthesize-corridor-character.mts` — TOOL_SCHEMA, `buildUserMessage`, `record_corridor_character` forcing pattern
- `refinery/validate/corridor-character-lint.mts` — lint orchestrator; operates on output shape, reusable as-is

**Invariant across all voices (do not change):**

- Tool version: `web_search_20250305` (NOT 20260209 — citation contract)
- Lint rules: facts-only-lint + smoothing-token ban + speculative disclaimer check
- Disclaimer wording: `"Speculative — based partly on inferred data. Double-check."`

---

## Build Order

### Phase 0 — Shared infra (all voices blocked until this is done)

See Phase 0 table (steps 0A–0H) above. Build order: 0B → 0A → 0C → 0D → 0E → 0F → 0G → 0H.

### Phase 1 — Voices 1–3 (all data live, no new pipes)

One PR per voice or bundle all three:

- `refinery/tools/build-main-street-fact-pack.mts`
- `refinery/tools/build-storm-ready-fact-pack.mts`
- `refinery/tools/build-move-ready-fact-pack.mts`
- Wire each to grounded pipeline + synthesizer
- GHA crons: `industry-main-street.yml`, `industry-storm-ready.yml`, `industry-move-ready.yml` — staggered week 1 of each quarter

**GHA cron stagger (do not run all 7 in one workflow — 26 × 7 = 182 Anthropic calls ≈ 4–6 hrs, exceeds GHA 6-hr ceiling):**

| Quarter Week | Voices     |
| ------------ | ---------- |
| Week 1       | Voices 1–2 |
| Week 2       | Voices 3–4 |
| Week 3       | Voices 5–6 |
| Week 4       | Voice 7    |

Each workflow accepts `--batch-size N` to rate-limit calls.

**Relevance pre-filter product decision:** Start with option (b) — let the synthesizer ship a low-signal but valid output; add a `skip_reason` gate in Phase 2 once you see which voice×corridor pairs produce thin output.

### Phase 2 — Voices 4–5 (all data live)

- `refinery/tools/build-builders-edge-fact-pack.mts`
- `refinery/tools/build-lenders-view-fact-pack.mts`
- Add staggered GHA crons (week 2 of each quarter)
- Implement relevance pre-filter if Phase 1 spot-checks reveal thin outputs

### Phase 3 — Voice 6 + optional STR pipe

- `ingest/pipelines/str_firecrawl/pipeline.py` (optional; ~4 hrs)
- `refinery/tools/build-seasonal-operator-fact-pack.mts`
- Add staggered GHA cron (week 3 of each quarter)

### Phase 4 — Voice 7 + required new pipes

- `ingest/pipelines/fldoe_grades/pipeline.py` + `fdle_ucr/pipeline.py` (~2 days total)
- `refinery/tools/build-local-pulse-fact-pack.mts`
- Add GHA cron (week 4 of each quarter)

---

## Verification

**Per-voice smoke test (before any DB write):**

```bash
# Routing
bun run refinery/lib/classify-voice.test.mts  # all keyword rows must route correctly

# Grounded pipeline
python -m ingest.pipelines.industry_grounded.pipeline \
  --voice main-street --corridor "Pine Ridge Rd Naples" --dry-run
# Expect: cited_text_count >= 4

# Synthesizer + lint
bun refinery/tools/synthesize-industry-character.mts \
  --voice=main-street --corridor="Pine Ridge Rd Naples" --preview
# Expect: lint.ok === true
# Expect: speculative_block ends with "Speculative — based partly on inferred data. Double-check."
# Expect: at least one [internal-N] AND one [web-N] in facts_block
```

**5-point acceptance rubric (same as Step 4 corridor character rubric):**

1. Facts block cites at least one internal AND one web source
2. Numeric values verbatim from fact pack — no rounding, no softening
3. Speculative block is audience-relevant + carries disclaimer + hedges inferences
4. Chart block uses only fact-pack values (or is absent with good reason)
5. Target audience would recognize the corridor from the facts block and find the speculative block actionable

**Full gate:** Run `--preview` for all 26 corridors for each voice. Operator spot-checks 5 corridors per voice (35 total). 80%+ pass (28/35) → approve DB writes.

**Slug parity check (before any grounded pipeline run):**

```bash
# TS and Python must produce identical slugs for all 26 corridors
bun refinery/lib/slugify-corridor.test.mts  # cross-language parity test
```

**GHA dry-run validation (before scheduling live crons):**

```bash
python -m ingest.pipelines.industry_grounded.pipeline \
  --voice storm-ready --corridor "Fort Myers Beach Estero Blvd" --dry-run
# Fort Myers Beach has / in common usage — confirms slug handles special chars
# Expect: cited_text_count >= 4; slug matches TS output
```
