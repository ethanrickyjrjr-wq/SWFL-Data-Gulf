# Generic viz archetypes — recipe builds + AI commentary

**Date:** 2026-07-12
**Check:** `viz_archetypes_live_verify`

## Problem

The 5 showcase visual templates (`templates/html/viz/*.html`) were shipped as v1 with a
deliberate scope cut: brand (`brand_primary`/`brand_secondary`) and scalar headline KPIs are
`{{tokens}}`, but the actual chart data is hardcoded per shell — `const CORRIDORS = [...]`
in corridor-positioning and seasonal-exposure, `const STORMS = [...]` in storm-year-timeline
(the shell comments say so explicitly: "full data-array tokenization is out of scope for v1").
Flood-exposure and freight-nowcast are already fully scalar-token-driven but their copy is
domain-baked ("Lee County land split…", "FDOT freight activity…").

Result: today the cards can be re-branded and re-headlined, but the scatter always draws the
same 8 SWFL corridors. The showcase copy promises "ready for your data" — the layouts can't
yet honor it.

## Goal

Any data that goes together can wear any of the five layouts, with brand injected, and with
AI commentary written against the exact numbers on the card:

1. The five shells become **generic archetypes**: quadrant scatter, composition + focus,
   baseline gauge, banded bars, event timeline. All copy tokenized; data arrays tokenized.
2. A **curated recipe registry** defines ~2 named builds per archetype from real lake data
   (e.g. scatter runs as corridors cap × vacancy AND as ZIPs median price × days-on-market).
3. A **build runner** (cron-wrapped) fills each recipe's contract, has Sonnet write the
   commentary slots from the filled rows, and stores the payload; the public render surface
   serves stored builds — zero model calls, zero lake queries per request.
4. The **showcase previews go real**: each card lists its recipe variants; Preview opens the
   live build. Sample fallback if no build exists yet.

## Operator decisions (07/12/2026 brainstorm)

- Builds are defined by a **curated recipe registry**; freeform data still enters through the
  same validated contract (POST). Not recipes-only.
- AI commentary lives **in-template**: per-item `note` fields (detail panels, timeline notes)
  plus one labeled card-level "read" block per card. No separate commentary page.
- **All five** cards generalize, including flood (→ composition + multiplier + focus) and
  freight (→ value vs own rolling baseline gauge).
- **Showcase previews go real** (public GET serving stored recipe builds).
- Commentary is written **at build time, cached, refreshed when the data rebuilds** — public
  traffic never triggers a model call. ("AI talks about the data right in front of it" — one
  Sonnet call per recipe build over the filled rows.)
- Mechanism: **A — `data_json` token** per shell + per-archetype contracts (chosen over
  `repeat:` HTML expansion, which would force precomputed geometry and a shell rewrite, and
  over a Vega-Lite-style generic grammar, which rebuilds a charting library and contradicts
  architecture rule C2).

## Research findings (crawl4ai, 07/12/2026)

- **WHATWG HTML spec** (https://html.spec.whatwg.org/multipage/scripting.html — script
  content restrictions): `<!--` and `<script` sequences inside a `<script>` element must be
  balanced or the parser never closes the block — what looks like `</script>` in a data
  string is still part of the script. The sanctioned fix is escaping `<` as `\x3C`/`\u003c`.
  Consequence: our renderer substitutes tokens verbatim, so the data serializer MUST escape
  `<` after `JSON.stringify`. That single escape neutralizes `</script`, `<script`, and
  `<!--` at once.
- **Vega-Lite** (https://vega.github.io/vega-lite/ — view specification docs): the canonical
  generic-chart grammar separates `data` / `mark` / `encoding` / `config`. Considered and
  rejected as the contract model: our value is art-directed cards with mark+encoding baked
  in; only data, labels, and brand vary. Per-archetype contracts, not a grammar.

## What we're building

### 1. Shells (`templates/html/viz/*.html`)

Slugs stay unchanged (nothing breaks: manifest, showcase links, dsCard registry). Manifest
`name`/`description` shift to archetype language.

Per shell:
- Inline data array → `const DATA = {{data_json}};` (serialized server-side, below).
- All remaining copy → scalar tokens: eyebrow, title, subtitle, frame title/sub, axis
  labels, quadrant labels, band labels, legend caption, source line. `{{source_line}}` and
  an `{{as_of}}` date (rendered MM/DD/YYYY) appear in the footer of every card. The current
  `Last computed · {{freshness_token}}` footer slot is REMOVED — the raw token is internal
  and never ships on a user-facing card (as-of rule); `as_of` replaces it in every contract.
- Axis ranges/ticks computed from DATA (min/max + padding, nice ticks) instead of hardcoded
  constants. A `format` hint per axis (`percent` | `currency` | `number`) drives a tiny
  formatter in the shell — no library.
- Per-item colors become semantic: rows carry `category` (mapped through a per-card
  category→color map where `{{brand_primary}}`/`{{brand_secondary}}` occupy two slots, plus
  the fixed mangrove/gold accents) and/or `emphasis: true` (timeline peak → brand secondary).
  Callers NEVER pass raw colors — brand stays exactly two tokens.
- One labeled card-level read block (e.g. eyebrow "THE READ") above the footer on all five
  cards, filled by `{{card_read}}`; empty value → block hides (empty-tolerant, like the
  homepage demo's AI slot).
- Label-density decisions currently hardcoded (e.g. which scatter bubbles get text labels)
  become data-driven: `labeled: true` on the row.

### 2. Serializer (`lib/templates/serialize-data-json.ts`)

`serializeDataJson(rows): string` = `JSON.stringify(rows)` then escape `<` → `\u003c`,
U+2028 → `\u2028`, U+2029 → `\u2029` (the latter two are belt-and-suspenders for old JS
engines; `\u003c` is the load-bearing one per the WHATWG finding). Every fill path uses it;
callers hand ROWS to the API, never a pre-serialized string.

### 3. Contracts (`lib/templates/token-contracts.ts` + zod schemas)

Per-archetype TS interface + zod schema (zod already in the repo — `projectItemsSchema`
pattern). Shapes (abridged; exact fields finalized in the plan):

- Quadrant scatter rows: `{ id, label, sublabel?, x, y, size, category, labeled?, note?,
  metrics?: [{label, value, dir?}] (≤4) }` + tokens: axis labels/formats, quadrant labels,
  median x/y, legend caption.
- Banded bars rows: `{ id, label, sublabel?, value, category, note? }` + tokens: band
  thresholds + band labels (the 0.30/0.60 cut points become tokens), value format.
- Event timeline rows: `{ when, title, badge?, value, note?, emphasis? }` + tokens: baseline
  label/value, value format. Peak computed in-shell.
- Baseline gauge: stays scalar (existing FreightNowcastTokens generalized: label tokens for
  what the value/baseline/stat-rail mean).
- Composition + focus: stays scalar (existing FloodExposureTokens generalized: segment
  labels, focus-card labels, prose sentence templates → tokens).

Every contract keeps `brand_primary`, `brand_secondary`, gains `source_line`, `as_of`,
`card_read`, and drops `freshness_token` (internal token, never user-facing).

Validation: POST `/api/templates/render` validates body against the slug's zod schema →
400 with zod error detail on mismatch; nothing renders. The build runner validates before
store (validators gate writes — a failed build never replaces a good one).

### 4. Recipe registry (`lib/templates/recipes.ts`)

`RecipeDef = { id, slug, label, scope, load(): Promise<rows/scalars>, map(): contract
tokens, source_line, commentary: { instructions } }`. ~2 recipes per archetype (~10 total);
loaders reuse existing lake/brain read paths (typed Supabase client / existing loaders —
no new ingest; four-lane lane 1). Every recipe names its source; a recipe whose loader
returns empty → build skipped, prior build stays.

Recipe list is finalized in the implementation plan against what the lake actually holds
(RULE 0.5 probe before naming datasets), e.g.: scatter = corridors cap×vac + ZIPs
price×DOM; bars = corridor seasonal index + another ranked 0→1 index; timeline = NFIP named
storms + permit/notice event series; gauge = FDOT freight + another value-vs-baseline
series; composition = flood bands + another part-to-whole with focus.

### 5. Build runner + storage

`scripts/templates/build-recipes.mts` (bun): for each recipe (or `--recipe <id>`):
load → map → zod validate → **one Sonnet call** writes `card_read` + per-item `note`s from
the filled payload (spend-guarded like every other Anthropic call path) → **digit guard**:
every digit-bearing figure in commentary must already appear in the token payload
(gateNarrative-style structural check; violation → drop commentary, keep data) → upsert row
in `template_builds` (Supabase: `recipe_id pk, slug, tokens jsonb, built_at, as_of`).
Idempotent SQL migration run directly (creds in `.dlt/secrets.toml`), row-count verified.

Ships in the same PR: GHA cron wrapper + `--dry-run` mode (pipeline-freshness rule).
Cadence: piggyback the daily rebuild window; TTL-fresh skip like brains.

Failure behavior: loader empty / zod fail / DB error → that recipe's build aborts, prior
stored build keeps serving. Commentary call fails → fresh data ships with empty note slots
(cards render fine without notes; retry next cron). No half-broken artifact replaces a
good one.

### 6. Render surface (`app/api/templates/render/route.ts`)

- `GET ?recipe=<id>` (new): read latest `template_builds` row → `renderHtmlTemplate(slug,
  tokens)` → HTML. Public, no auth (same posture as `?slug=`), no model calls, one DB read.
  Unknown recipe / no build yet → 404 JSON.
- `GET ?slug=` (existing): unchanged sample-preview path. Manifest `previewData` absorbs the
  ex-inline arrays as sample rows (serialized at render time) so previews still render
  pixel-equivalent sample cards.
- `POST` (existing, authed): body gains structured `data` rows; server validates via zod +
  serializes via `serializeDataJson`. This is the seam the AI fill flow plugs into later.

### 7. Showcase (`app/showcase/page.tsx`)

Each template card lists its recipe variants (label + Preview → `?recipe=<id>`); if a
recipe has no stored build, its Preview falls back to the sample render — never a broken
card. Section copy updates to archetype language.

## Out of scope (follow-up builds)

- The AI chat fill flow ("build the scatter against Cape Coral retail" in the assistant) —
  plugs into the POST seam; own brainstorm.
- PDF rendering (existing 501 stub stays).
- New ingest: recipes only read data the lake already holds.

## Testing

- Serializer unit tests: `</script>` breakout string, `<!--`, `<script`, U+2028/9, plain
  rows round-trip via `JSON.parse`.
- Zod contract tests: accept/reject fixtures per archetype (missing fields, wrong types,
  raw-color smuggling rejected).
- Mapper tests per recipe: fixture lake rows → expected contract tokens (deterministic
  math in code — no LLM in the numbers path).
- Render smoke per shell: sample + one recipe fixture render with (a) no leftover
  `{{token}}`, (b) brand hexes present in SVG output, (c) `DATA` parseable from the emitted
  HTML.
- Commentary digit-guard tests: minted number → dropped commentary; cited number → passes.
- Build runner `--dry-run` test; `bunx next build` gate before any push.

## Verification (closes `viz_archetypes_live_verify`)

Prod: showcase card → Preview opens a recipe build rendered from real lake data with the
operator brand pair, source line + MM/DD/YYYY as-of visible, commentary present in the read
block, and a POST with custom rows + custom brand returns a branded render. Served-bytes
check, not diff check.
