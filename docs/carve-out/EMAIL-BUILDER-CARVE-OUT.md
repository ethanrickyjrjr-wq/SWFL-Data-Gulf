# EMAIL BUILDER — CARVE-OUT PLAN

**Started 07/30/2026. Planning document. NOTHING IS BEING BUILT FROM THIS YET.**

Goal: stand up the email builder as its own product, in its own folder, running on **whatever data a
user hands us** — no lake, no brains, no ingest pipelines, no SWFL. List everything out before
touching a thing, so the build is right from the start instead of guarded incident-by-incident.

## How to use this file

- **Harness/process guards are NOT in here.** They live in `docs/standards/new-project-playbook.md`
  (10 sections, written 07/25/2026 to be copy-pasted into a new repo's root as `PLAYBOOK.md`). That
  file is the day-0 install order for hooks, tracking, and the rules-vs-mechanisms discipline. This
  file is the *product* half: what code moves, what stays, what gets written fresh.
- Evidence rule: every "copy this" claim names a real path, verified by reading it. Anything not yet
  verified says so.
- **Cite by phrase, never by section number or list ordinal.** Two parallel sessions once claimed
  the same item numbers in the same file within an hour (playbook §7.8). Say "the tenancy guard,"
  not "§4 item 3."

---

## §0 — THE SECTION CONTRACT — how to read this file without getting lost

Every section below carries the same four-line header. A session opening this file cold reads only
that header to know whether the section is settled and what it blocks. **If you change a section,
you change its header in the same edit** — a header that disagrees with its body is the one-law
failure (existence accepted as function) reproduced inside the plan itself.

- **PURPOSE** — the single question this section answers.
- **DONE WHEN** — the verifiable exit condition. Not "written up." Something you can check.
- **GATES** — what cannot start until this section closes. This is the dependency graph; it is
  the reason the sections are not independently pickable.
- **STATUS** — one of: **OPEN** (named question, no answer) · **DRAFTED** (thought through, not
  verified) · **DECIDED** (answer chosen, exit condition met) · **AUDITED** (verified against code
  or a live source this session, with the date).

**Do not treat a heading as covered because it exists.** That is the one law of the playbook, and
it applies to this document more than to anything it describes.

### Current state at a glance

- §1 positioning — **DECIDED**
- §2 inventory — **AUDITED 07/30/2026** (import graph run; three claims corrected)
- §3 product-shaped failures — **DECIDED**
- §4 day-0 guards — **DECIDED** (13 guards, each with failure mode, typed mechanism, test name)
- §5 parser + provenance — **DECIDED** (vendor install channel verified live 07/30/2026)
- §6 the claim we make — **DECIDED**
- §7 repo shape + first running thing — **DECIDED**
- §8 kill list — **DECIDED**
- §9 data discipline (collide / mix up / forget / redo) — **DECIDED**
- §10 the acting half — **DECIDED**

---

## §1 — WHAT THIS IS, AND WHAT IT IS NOT

- **PURPOSE** — name the square on the market map we occupy, and the three we refuse.
- **DONE WHEN** — the one-line wedge is written and no competitor in the scan occupies it.
- **GATES** — everything. A section that contradicts this one is wrong, not this one.
- **STATUS** — **DECIDED.**

**The product:** a user drops in their own file. They get back a designed email where every number
traces to the cell it came from, and their writing is either preserved exactly or made better —
their choice, explicitly.

**Positioning, from the 07/30/2026 competitor scan**
(`_RESEARCH/email-and-social/2026-07-30-email-creation-on-user-data-competitor-scan.md`):

- Email builders (Beefree, beehiiv, Stripo) ship AI that writes **copy**. Beefree's MCP server —
  the most advanced agentic email surface shipping — has **zero data tools**. No CSV, no figures,
  no chart, no provenance.
- Deck builders (Gamma) do file → designed artifact **with charts**, at scale. But their own docs
  say chart generation is "non-deterministic — results may vary across runs, even with identical
  inputs," there are no chart-type parameters, and a label like `$100` "may be interpreted as data."
- Chart tools (Datawrapper) do data → beautiful chart, with no document and no send.

**The unoccupied square is ours: Gamma prompts charts, we bind them.**

**What it is NOT:**
- Not a SWFL product. No county scope, no ZIP grain, no market brains.
- Not a data company. We do not produce, host, or vouch for the numbers. The user's numbers are the
  user's. Our claim is **faithful to your source**, never **true** — see the claim section.
- Not a Gamma clone. We are not chasing 40+ image models, 60+ languages, 50-page microsites, or
  per-viewer analytics. (Playbook rule: borrowed hyperscaler patterns must justify themselves at our
  volume.)

---

## §2 — THE INVENTORY: COMES / STAYS / GETS WRITTEN

- **PURPOSE** — per-path classification of every candidate file, backed by its real import graph.
- **DONE WHEN** — every named path carries a verdict derived from reading its imports, not from
  reading its docstring.
- **GATES** — the repo-shape section (you cannot lay out a repo before you know what lands in it)
  and the day-0 guard list (three guards below exist only because the audit found the tangle).
- **STATUS** — **AUDITED 07/30/2026.** Import graph run one level deep on every named path, plus a
  second level on every hit, plus a full sweep of `lib/email/blocks/`. **Three claims in the
  pre-audit draft were wrong and are corrected below.** Not traced: `lib/project/signed-upload-url`
  (no static imports found; confirm at move time) and the `app/` route handlers, which are being
  rewritten anyway.

### 2a. AUDIT RESULT — the corrections first

These are the three places the pre-audit draft was optimistic. They matter because each one was
about to become a "copy this file" instruction that silently drags the lake behind it.

**CORRECTION 1 — `bind-frame.ts` is the moat AND the most tangled file in the move.** The draft
listed it as a clean copy and called it "the moat." Both halves are true and they conflict.
`lib/deliverable/bind-frame.ts` imports, verified by reading it:
`refinery/types/brain-output.mts` · `refinery/lib/chart-from-metrics.mts` ·
`refinery/validate/chart-block-lint.mts` · `components/charts/registry/registry.ts` ·
`components/charts/registry/pick-frames.ts` · `./ranked-delta-bind` · plus frame-specific types.
Two of those are **runtime** imports into `refinery/` — the directory the plan says stays behind in
full. `brain-output.mts` is a type island (it imports only two other refinery *types*, so it erases
at compile), but `chart-from-metrics.mts` exports functions and itself imports `chart-block-lint.mts`.
**Consequence: the moat cannot be copied. It has to be extracted** — the shape-detection and binding
logic lifted out of the refinery type vocabulary into a standalone figure/series contract owned by
the new product. Budget this as real work, not a file move. It is the highest-value and
highest-effort item in the whole carve-out.

**CORRECTION 2 — `pick-frames.ts` has two blockers, not one.** The draft named the React-bundling
blocker (`registry.ts` imports 12 frame components as *values* — confirmed: `ChartBlockFrame`,
`ZHVIAreaChartFrame`, `CorridorMarketScatterFrame`, `CompositionFrame`, `ZGaugeFrame`,
`SeasonalRadialFrame`, `TimelineFrame`, `RankedDeltaFrame`, `DonutShareFrame`, `DotPlotFrame`,
`SparkGridFrame`, `LineBandFrame`). The second blocker was missed: `pick-frames.ts` also imports
`refinery/types/brain-output.mts` and `refinery/lib/chart-from-metrics.mts` directly. So the
extraction is **two** extractions — a pure `frame-meta.ts` carrying `{fixtureOnly, accepts, label}`,
*and* a decoupling from the `BrainOutputDetailTable` / `BrainOutputMetric` vocabulary. The claim
"keys off data shape, not the lake" is semantically true and structurally false today.

**CORRECTION 3 — the "comes over" file list was incomplete.** `author-doc.ts` imports six modules
the draft never mentioned: `./doc/default-docs`, `./doc/block-contract`, `./doc/finalize-doc`,
`./inject-chart`, `./inject-photo`, and `@/lib/deliverable/narrative-lint`. The first five are
clean (they bottom out in `doc/types` and `doc/schema`). **`narrative-lint.ts` is not** — it imports
`refinery/lib/smoothing-tokens.mts` and `lib/reconcile/types`. So `author-doc.ts`, the file the plan
calls the most important in the move, is transitively refinery-coupled through its lint import.
Small and severable, but invisible until the graph was run.

### 2b. VERIFIED CLEAN — copy as-is, zero SWFL reach

Each of these was read; the import list is the whole import list.

- `lib/email/doc/types.ts` — **zero imports.** Genuinely pure, exactly as claimed. 17 block types.
  (`listing`, `agent-card`, `agent-hero` are real-estate-shaped and get renamed or dropped.)
- `lib/email/csv-escape.ts` — **zero imports.** OWASP CSV-injection escaping at the exit, never on
  import. Store raw, escape when generating. Copy the rule with the code.
- `lib/email/segments/filter.ts` — **zero imports.** Pure filter engine.
- `lib/email/author-recipes.ts` — **zero imports.** The draft flagged this as a "split"; the audit
  says the *file* is dependency-free and only its *content* is real-estate-specific. Mechanism
  copies clean (advisory prose appended to the system prompt, digit-free by test so it can never
  smuggle a figure); the 11 recipes get rewritten for whatever verticals we serve.
- `lib/email/doc/schema.ts` — zod + `./types`.
- `lib/email/grid-schema.ts` — `./doc/types` only. 12 columns, 600px canvas, rowHeight 30, margin
  [8,8], Full/⅔/½/⅓ presets so a user never counts columns.
- `lib/email/doc/block-contract.ts`, `default-docs.ts`, `saved-layout.ts`, `history.ts`,
  `row-grouping.ts`, `grid-layouts.ts`, `finalize-doc.ts` — all bottom out in `doc/types` +
  `doc/schema` + `grid-schema`.
- `lib/email/inject-chart.ts`, `lib/email/inject-photo.ts` — `doc/schema` + `doc/types` only.
- `lib/email/doc/preview-fill.ts` — `doc/types`, `default-docs`, `chart-coherence`.
- `lib/deliverable/chart-coherence.ts` — one type import from `chart-spec`. `assertHeroChartCoherence`
  (a chart's magnitude must cohere with its headline) travels clean.
- `lib/email/social/platforms.ts` — `doc/types` only. 8 platforms, one root, favicon→globe fallback.
  **No paid logo vendor** (Logo.dev was killed; do not re-propose).
- `lib/email/lab/capabilities.ts` — `doc/types` only. The *pattern* copies (every feature declares
  one target, capability sets are derived, a test enforces it). Every value is re-decided.
- `lib/email/brand/apply-brand.ts` + `apply-brand-style.ts` — reach only `social/platforms`,
  `doc/types`, and `lib/brand/fonts.ts`. **Fold `fonts.ts` into the move** (it was not in the draft
  inventory; it imports `node:path`, which is the thread to pull on the browser-only defect below).
  **Known defect to fix during the move, not after:** `applyBrand` is browser-only, so every
  non-lab send path ships unbranded with an empty CAN-SPAM footer address (open defect, 07/26/2026).
- `lib/pdf/extract.ts` — zero static imports.
- **`lib/email/blocks/` — the whole directory, swept 07/30/2026: clean.** Every renderer
  (`HeaderBlock`, `HeroBlock`, `FooterBlock`, `ButtonBlock`, `DividerBlock`, `ImageBlock`,
  `AgentCardBlock`, `AgentHeroBlock`, `BlockRenderer`, `EmailDocRenderer`, `editable-text`,
  `email-head`, `scale.ts`, `styles.ts`) reaches only `@react-email/*`, `react`, and its own
  `../doc/types`. A targeted grep for `refinery` / `lib/listings` / `market-context` /
  `why-not-selling` / `data_lake` / `reconcile` / `api/b/` across the directory returned **zero
  hits**. The render lane is the largest genuinely clean block in the move.
  **Two edges to fold in, both previously unlisted:** `email-head.ts` imports `@/lib/brand/fonts`
  (already added above), and `FooterBlock.tsx` imports `@/components/email-lab/social-icons` —
  a component outside `lib/`, so the move is `lib/email/blocks/` **plus** that icon component.

### 2c. CLEAN OF SWFL, BUT PLATFORM-COUPLED — copy the logic, rewrite the plumbing

Nothing here reaches the lake. All of it reaches Next.js or Supabase, so "copy" means "port the
persistence/runtime layer to whatever the new repo picks."

- `lib/email/compile-grid.ts` and `render-email-doc.ts` — React + `@react-email`. Grid positions →
  email-safe columns. Framework-bound by nature; that is fine, but it constrains the stack choice.
- `lib/email/doc/layout-store.ts` — `next/headers` + Supabase server client.
- `lib/project/uploads-text.ts` — `next/headers` + Supabase server client.
- `components/project/UploadDrop.tsx` — React + Supabase browser client + `signed-upload-url`.
  Drag-and-drop already built.
- `lib/email/segments/resolve.ts` — Supabase wrapper over the pure `filter.ts`.
- `lib/reso/` — **self-contained.** Nine files (`boards`, `client`, `sync`, `pull-agent-listings`,
  `pull-zip-stats` + tests); the only outside import in the whole directory is
  `@supabase/supabase-js`. This is the closest existing thing to "a user brings their own data and
  we write it per connection," and the earlier correction was right to flag it. **Verdict: the
  *shape* comes over — per-user credential → per-user pull → per-user table — and the RESO/MLS
  specifics stay.** Read `sync.ts` before designing the upload-ownership model; it already solved
  per-user write isolation once.

### 2d. SPLIT — reusable core welded to SWFL wiring

- `lib/email/author-doc.ts` — **the most important file in the move.** Reusable: `buildFigureMenu`,
  `renderFigureMenu`, `buildAssetMenu`, `renderAssetMenu`, `clampProse`, `assembleAuthoredDoc`,
  `collectAnchorNumbers`, `figureCitations`, `fillEmptySourcesBlock`, `lintAuthoredProse`, and the
  accent budget. Not reusable: the dossier section, the SWFL vocabulary, and lake-specific grounding
  inside `authorSystem()`. **Plus the audit finding:** its `MarketFigure` type comes from
  `./market-context`, a file explicitly on the stays-behind list, and its `narrative-lint` import
  reaches `refinery/`. Both severable; neither was visible before the graph was run.
- `lib/email/build-doc.ts` — the draft said "`docSkeleton` and the build spine come over." The audit
  says treat this as a **rewrite with reference**, not a split: it carries **40+ imports** including
  `refinery/agents/anthropic.mts`, `lib/listings/select`, `lib/listings/resolve-subject`,
  `lib/concoctions/*`, `lib/assistant/comp-helper`, `lib/assistant/chart-for-question`,
  `lib/assistant/web-fallback`, `lib/assistant/freshness`, `market-context`, `address-context`,
  `place-from-prompt`, `listing-scrape`, `listing-flyer`, `sold-comp-blocks`. This file is the hub
  of the SWFL email product. Read it for the spine's *shape*; do not plan to move it.
- `lib/assistant/compose-chart.ts` — holds the proven upload-scan lane, wired to SWFL brains
  (`fetchBrain`, `brain-output.mts`, `chart-block-lint.mts`, `highlighter/reach`, `gap-fill`).
  The upload-scan *contract* is the valuable part: scan the user's document for the needed figure
  **before** going to the web.
- `lib/deliverable/build.ts` — `gateNarrative` (the no-invention output lint) is at line 444 of a
  file that imports `BrainOutput`, `loadParsedBrain`, `RULES_OF_ENGAGEMENT`, and the whole
  `lib/reconcile/` lane. **Extract the function; leave the file.** The rule comes, the SWFL
  geography exemptions do not.

### 2e. STAYS BEHIND — all of it

`ingest/` (every Python pipeline, dlt, DuckDB, `cadence_registry.yaml`) · `refinery/` (41 packs,
stages 1–4, the DAG, all brains, rules-of-engagement) · every `data_lake.*` table ·
`lib/email/market-context.ts` · `lib/listings/` · `lib/why-not-selling/` · `lib/reconcile/` ·
`lib/concoctions/` · corridor/ZIP/county logic · `docs/standards/data-roots.md` · `/api/b/*` and
the MCP surface · the GHA rebuild workflows and their tripwires.

**Note for the decision, not an argument for it:** a large share of the lake was never wired to a
consumer at all, so leaving it behind costs less than its size suggests. The prior draft put a
figure on this — "72 proven-but-never-pulled source ceilings as of 07/22/2026." **Do not carry that
number.** `source_ceiling` appears on 75 lines of the registry as of 07/30/2026, so the count has
moved and the 07/22 figure is stale; a line count is also not the same as a populated ceiling. If
this number is ever spoken, re-count it live first. (This document's own rule, applied to this
document — it was quoting a dated figure exactly the way the floored-listings incident did.)

**The catalog precedent — read firsthand 07/30/2026, not relayed.** An earlier draft said there is
no precedent for user-supplied data in the catalog. Verified both halves directly:

- **True of `docs/standards/data-roots.md`.** A search for upload / user-supplied / BYO returns two
  hits, both Parquet-upload *watches* on the corridor pulse. No user-upload root exists.
- **False of the registry.** `ingest/cadence_registry.yaml` lines 2355–2361, read directly, carry a
  `client_upload_surface` reason code over two tables. `data_lake.user_mls_listings`, verbatim:
  "Client RESO/MLS upload surface — lib/reso/sync.ts writes it per user connection
  (migrations/20260625_user_mls_data_lake.sql). App-side, not ingest."

**The half the relayed version missed, and it is the useful half.** The second entry,
`data_lake.user_mls_stats`, reads verbatim: "Aggregates over user_mls_listings — same lib/reso
writer, same class." So the pattern already covers **derived aggregates over user-supplied data**,
not just the raw upload — which is exactly what our figure records are. There is a registered
precedent for both tiers of what this product produces. Copy the reason-code idea (app-side writer,
no cadence, do not expect a cron) into the new product's catalog from day 0 rather than inventing
one, and register the raw upload and its derived figures as the two classes the registry already
distinguishes.

### 2f. GETS WRITTEN FRESH — this is the actual build

1. **Tabular parser: CSV / XLSX → figures.** Re-verified 07/30/2026: `package.json` has no `xlsx`,
   no `papaparse`, no `csv-parse`, no `exceljs`. Nothing tabular exists today. The upload lane is
   text-only — a PDF is extracted to prose and a model reads a number out of a sentence. **This is
   the single missing feeder and the highest-risk piece.** Decided in the parser section.
2. **The provenance string for a messy real sheet** — merged cells, a header three rows down, an
   unlabeled total row. Nobody scanned has solved this.
3. **The figure-menu feeder** that replaces `fetchLakeParts()` — parsed upload → the same
   id-addressable menu shape `authorSystem` and `bindFrameSpec` already consume.
4. **The extracted binder** — the corrected version of "copy `bind-frame.ts`." Shape detection plus
   deterministic binding, on a figure/series contract that owes nothing to `refinery/`.
5. **The composition brief** — the orchestrator artifact. Gamma exposes the equivalent as a
   first-class `pages[]` array (≤50, each with its own text, mode, length, tone, images). Ours is
   sections, not pages.
6. **The checker pass.** Two independent sources say quality comes from a checker, not a smarter
   writer: our own 07/01/2026 design-quality research (closed design-token enums, fixed type scale,
   8pt spacing, deterministic post-generation validator) and Beefree shipping
   `beefree_check_template` / `beefree_check_section` as agent-callable tools.
7. **The text-mode dial** — preserve / improve / condense, as a **visible user choice**. Gamma ships
   this as `textMode`, and on `preserve` it ignores tone/audience/length entirely because the user's
   text is being kept. This is the operator's "say exactly what they say" requirement, as a mode
   rather than a guard.

---

## §3 — WHERE WE SCREWED UP THE FIRST TIME

- **PURPOSE** — the product-shaped subset of this project's failures: the ones that will recur in an
  email builder on user data specifically.
- **DONE WHEN** — every entry names a dated real instance, how it was found, how it recurs here, and
  a typed guard with a test name.
- **GATES** — the day-0 guard list. Every guard there traces to an entry here.
- **STATUS** — **DECIDED.**

The generic version is `new-project-playbook.md` §1 and §4. **Do not restate it.** What follows is
product-shaped, and each entry is written in four beats: the real instance → how we found it → how
it comes back in this product → the typed guard.

**1. Built the recording half, never the acting half.**
*Instance:* 72 source ceilings recorded, never read back; `ceilings-to-checks.mjs` built, committed,
wired into zero workflows; the checks ledger had an automatic opener and no automatic closer and hit
722 open with 8 carrying a signal.
*How found:* the operator asked why the count only ever goes up — *"NOTHING BUT PROBLEMS AND NOTHING
WORKS CORRECTLY, SO WHAT IS THE POINT?"*
*Here:* a parsed sheet produces a figure inventory. If nothing reads that inventory back — no "you
uploaded 240 cells, this email uses 6" surface — we have rebuilt the same asymmetry on day 1.
*Guard (gate):* every registry ships its reader in the same change. Test: `inventory-has-a-reader`.

**2. Guards shipped reactively, one incident at a time.**
*Instance:* build breaks → bolt on a guard → breaks differently → bolt on another; root-caused
07/20/2026 to a pre-build process that listed "error handling" as one word with no forcing function.
*Here:* the failure-modes-before-build discipline applies to every section of this document. A
design with a hand-waved failure list is not approved.
*Guard (gate):* the day-0 guard list is a precondition of the first commit, not a follow-up.

**3. A label that lies about the grain of a true number.**
*Instance, 07/25/2026:* the live page read *"Homesteaded owners in Cape Coral typically have 37.9%…"*
over a 33904-only median. Operator: *"you said 33904 is cape coral. that makes no sense. cape coral
is many zip codes."* Root cause: `place = cityForZip(zip)` flowed one bare label into every
attribution sentence.
*How found:* the operator pasted the 8 Cape Coral ZIPs precisely to expose it.
*Here:* this is the **highest-severity product failure in the whole carve-out.** The invention gates
verify a FIGURE traces to a source; **nothing verifies the WORDS around the figure describe it
correctly.** A user's cell B14 is "Q3 revenue, West region." If our headline says "Q3 revenue"
unqualified, the number is true and the email is false. The operator's own conclusion stands:
*"A true number under a wrong label is functionally fake and nothing catches it."*
*Guard (validation):* the label travels **with** the figure as one record — never as a separate
prop a template can mismatch. Test: `label-travels-with-figure`.

**4. Data before consumer.**
*Instance:* a pipeline pulled 7 of 120 available fields for over a week while sale price, living
area, year built, and land value sat unused in the same already-open response.
*Here:* generalizes to **no parser lands without the surface that reads it.** Parse the whole sheet
or record what you skipped; never quietly read 6 of 240 cells.
*Guard (gate):* parser PR must include the figure-menu surface. Test: `parser-ships-with-consumer`.

**5. The same surface "fixed" five times without ever being driven live.**
*Instance, 07/26/2026:* the Issue 001 preview shipped with no `<meta charset="utf-8">` (mojibake
through every em-dash and chart title) and both bar charts' labels collapsed into a smudge, because
the rect-position recovery regex matched non-bar rects. Operator: *"You fucking kidding me?? What is
this shit?"* The session had audited every number and never opened the rendered file.
*How found:* the operator, on his own phone.
*Here:* an email builder's output is a rendered artifact. **A token audit structurally cannot see a
rendering defect.**
*Guard (validation):* evidence class matches failure class — the session opens and looks at the
rendered email before the user does. Test: `render-smoke-opens-the-artifact`.

**6. Concurrency shipped without a lock.**
*Instance, 07/20/2026:* the under-contract flyer for 8348 Southwind Bay Cir was **sent twice,
identical, 4:04 PM**. Separately, two background campaign runs were reported killed, survived, and a
resume was started on top of two live senders — the operator received the same email three times.
*Here:* any send path gets a lock and a re-read of state before it fires, from day 0. Config kill is
not process kill.
*Guard (gate + detector):* send lock keyed on (user, doc, content-hash); presence scan by command
line, never process name. Test: `double-send-is-refused`.

**7. A placeholder shipped to a real recipient.**
*Instance, the same 07/20 flyer:* the CAN-SPAM footer went out carrying its literal placeholder
*"Physical mailing address required (CAN-SPAM) — add one in Branding."* The same email shipped the
raw enum `single_family` in a TYPE cell and the string "metro area metro" (the metro string already
ends in "metro area"; the builder appended " metro").
*How found:* an audit of a sent email, days later, on operator request.
*Here:* three distinct shapes, one guard family — placeholder text, raw enum, and double-suffix
concat all reach the reader through a template that never asserted its own output.
*Guard (lint):* a pre-send lint over the **rendered string**, not over the helper that produced it.
Test: `no-placeholder-reaches-the-wire` · `no-raw-enum-in-rendered-output`.

**8. Dead code with zero importers, undetected.**
*Instance:* five tested modules under `lib/why-not-selling/checks/` have no importers at all; a lake
comp feed built, tested, live-probed, green, imported by nothing but its own test files.
*Here:* nothing goes red for silence, so an importer check has to be a mechanism, not a habit.
*Guard (lint):* zero-inbound-import scan, run repo-wide — the first version of that measurement in
this repo searched only `app/` and `components/` and reported a false zero the day after a module
shipped. Test: `no-orphan-modules`.

**9. Hand-authoring what the builder exists to build.**
*Instance, 07/26/2026:* a bare-text post went to Bluesky when the entire social lab exists to build
the image — *"we have a fucking social lab and claude writes fucking words on a social site."*
Same week: the wrong showcase emails were substituted for the ones the operator actually meant, and
a hand-drawn wave squiggle shipped in place of the real logo asset.
*Here:* in a product whose whole thesis is the builder, **every artifact must be produced by the
builder or it is not evidence the builder works.** Never improvise a brand mark; pull the asset.
*Guard (gate):* demo and marketing artifacts are generated through the product's own pipeline, and
the generation is recorded. Test: `showcase-artifacts-are-builder-output`.

**10. Design narrated instead of shown.**
*Instance:* footnotes explaining arithmetic the reader can do in their head — *"why the fuck are we
writing equations???"* — read as a spreadsheet export, not an agent. The fix that "killed" them
verified one helper returned undefined; **four producers existed and three still emitted.**
*Here:* derived cells earn a note only when the reader can't check them — and any claim that a
producer is dead is proven against the rendered string, not the helper.
*Guard (lint):* the checker flags explanatory footnotes on single-step arithmetic.

**11. A computed value silently overwritten by a later merge.**
*Instance, 07/26/2026:* the baths enrichment lane fired correctly and `distill.upsert_state`'s
nightly MERGE overwrote every column with the sweep row (`baths = EXCLUDED.baths`). Every enriched
value was erased the next night — 34,139 of 34,478 rows NULL. Only `listed_date` had ever been given
the COALESCE survive-the-merge fix, and it was never generalized.
*How found:* the operator saw an email card with no baths — *"WHY WOULD WE NOT HAVE BATHS???????"* —
twice, months apart, which is exactly what the scratchpad rule exists to prevent.
*Here:* this is **re-upload invalidation** wearing a different hat. A user re-uploads a corrected
sheet mid-compose. A naive re-parse silently rebinds; a naive merge silently erases their edits.
*Guard (validation + test):* every write states which fields it may overwrite and which survive.
Test: `reupload-preserves-user-edits` · `reupload-marks-stale-bindings`.

**12. Quoting a document's number as a served fact.**
*Instance:* asked how many listings were floored, a session quoted **9.9%** from a spec one day old.
Live truth: **54.2%** (18,098 of 33,373) — off by 5.5×, and the wrong number then propagated into a
plan doc and shaped its sequencing.
*Here:* every number in *this* file is a hypothesis with a date. Re-query, never re-quote.
*Guard (rule, honestly labeled as a rule):* any count or share spoken to a user is queried live first.

**13. A cross-tenant leak that passed every "do we have RLS?" check.**
*Instance:* `public.deliverables` carried a blanket `SELECT USING (true)` — proven with a real
anon-key request against production: **all 58 rows, 3 distinct users, 53 real user documents.** The
dashboard's 57 INFO warnings were all safe; the one table *with* a policy was the hole.
*How found:* a reachability probe with an unprivileged credential. The catalog read said the
opposite.
*Here:* **the entire input to this product is other people's files.** This is the most severe
failure available to us, and the pre-audit guard list did not mention it at all.
*Guard (validation):* tenancy verified by a real unprivileged request, on a schedule, not by
counting policies. Test: `anon-cannot-read-another-tenants-upload`.

**14. A credential dump left on disk by our own tooling.**
*Instance, 07/18/2026:* a 36-agent workflow left `/tmp/noai.env` — a complete plaintext copy of
`.env.local` including a Stripe live key, a GitHub PAT with push access to `main`, and the Supabase
service-role key. Files were deleted and verified gone; **rotation was still owed 7 days later.**
*How found:* only because a gate blocked an answer and forced the skipped research lane to be read.
*Here:* this product holds other people's business data. Deletion is not the fix; rotation is.
*Guard (detector):* scan every checkout and temp dir on the machine, not just `cwd`.

---

## §4 — GUARDS ON DAY 0

- **PURPOSE** — the product-specific guard list. Harness guards are the playbook's install order;
  do not re-derive them here.
- **DONE WHEN** — every guard has a named failure mode, a typed mechanism
  (validation / gate / test / lint / detector), and a test name.
- **GATES** — the first commit. None of these is a follow-up.
- **STATUS** — **DECIDED.** 13 guards, ordered by severity, not by build order.

**G1 — Cross-tenant read. (validation)**
*Fails as:* one user's uploaded file, figures, or draft email is readable by another user, or by
anon. Precedent: 58 rows across 3 users, live, proven.
*Mechanism:* deny-by-default at the row level, plus a scheduled reachability probe using a real
unprivileged credential against production. Audit the predicate, never count policies —
`USING(true)` is a policy and passes every "has RLS?" check.
*Test:* `anon-cannot-read-another-tenants-upload` · `probe-runs-against-prod-not-a-fixture`.

**G2 — Figure ids must be content-derived, never ordinal. (validation)**
*Fails as:* the model selects `[f7]`, the user re-uploads, the parser renumbers, and `[f7]` now
binds a different cell. The email still renders, every number still "traces," and the traces are
wrong. This is the platform's own unstable-identifier failure pointed directly at the moat.
*Mechanism:* a figure id is derived from its location and content (`file:sheet!B14` plus a hash of
the header path), never from position in a list. Stable across re-parse by construction.
*Test:* `figure-id-survives-reparse` · `figure-id-changes-when-the-cell-changes`.

**G3 — The label travels with the figure. (validation)**
*Fails as:* a true number under a wrong label. See the Cape Coral instance. The number passes every
invention gate and the sentence is still false.
*Mechanism:* one record carries value + unit + label + grain + source location. Templates consume
the record, never a value plus a separately-authored caption.
*Test:* `label-travels-with-figure` · `template-cannot-supply-its-own-caption`.

**G4 — No number without provenance enters the menu. (gate)**
*Fails as:* a figure with no traceable cell reaches the model, and the whole claim collapses.
*Mechanism:* the figure menu is the no-invention mechanism — the model selects an id, the **system**
writes the value and that figure's own label. A model cannot type a digit that is not on the menu.
Provenance is required for menu entry, not checked afterwards.
*Test:* `figure-without-source-is-refused` · `authored-prose-contains-no-unanchored-digit`.

**G5 — Re-upload invalidation. (detector)**
*Fails as:* the user fixes their sheet, re-uploads, and the in-progress email keeps rendering old
values — or silently adopts new ones under old prose. Precedent: the nightly merge that erased every
enriched value.
*Mechanism:* each binding records the source file's content hash. On re-upload, every binding whose
hash moved is marked stale and surfaced. Nothing silently rebinds; nothing silently persists.
*Test:* `reupload-marks-stale-bindings` · `reupload-preserves-user-edits`.

**G6 — Duplicate upload / the same figure twice. (validation)**
*Fails as:* the user uploads `Q3-final.xlsx` and `Q3-final(2).xlsx`; two menus, two ids, one number,
and an email citing the same fact to two different files.
*Mechanism:* content-hash dedupe at ingest, with an explicit "this is the same file you uploaded on
MM/DD/YYYY" prompt. Never silently merge, never silently duplicate.
*Test:* `identical-upload-is-recognized` · `near-identical-upload-asks`.

**G7 — Send lock plus state re-read. (gate)**
*Fails as:* the same email sent twice. Precedent: 07/20/2026, identical, 4:04 PM.
*Mechanism:* a lock keyed on (user, doc, content-hash), taken before the send and released after
confirmed dispatch, with the state re-read **inside** the lock. Config kill is not process kill —
verify the process is gone, then verify the config change is committed.
*Test:* `double-send-is-refused` · `send-rereads-state-inside-the-lock`.

**G8 — Nothing placeholder-shaped reaches the wire. (lint)**
*Fails as:* placeholder footer text, a raw enum in a reader-facing cell, a double-suffixed string.
All three shipped in one real send.
*Mechanism:* a pre-send lint over the **rendered output string**. Grep the artifact — killing one
producer proves nothing when four exist.
*Test:* `no-placeholder-reaches-the-wire` · `no-raw-enum-in-rendered-output`.

**G9 — Headline-vs-chart magnitude coherence. (test)**
*Fails as:* a headline claiming one magnitude over a chart showing another.
*Mechanism:* `assertHeroChartCoherence`, already written and clean to copy. Red CI test at
author-time, soft drop at runtime.
*Test:* `hero-chart-magnitude-coheres-with-headline`.

**G10 — Closed design-token enums plus the checker. (lint)**
*Fails as:* freeform style props, and the output drifts to generic on every generation. Two
independent sources — our 07/01/2026 design research and Beefree's Checker tools — agree quality
comes from a checker, not a smarter writer.
*Mechanism:* closed enums, fixed type scale, 8pt spacing with internal ≤ external, plus a
deterministic post-generation validator that runs before anything renders.
*Test:* `no-freeform-style-prop` · `checker-runs-before-render`.

**G11 — CSV escaping at the exit. (lint)**
*Fails as:* CSV injection. Store raw, escape when generating; escaping on import corrupts the user's
own data and destroys the provenance claim.
*Mechanism:* `csv-escape.ts`, copied with its rule.
*Test:* `csv-escapes-at-exit-not-on-import`.

**G12 — One catalog entry per source of truth. (gate)**
*Fails as:* a new root created and never catalogued — three times in a single day, in this repo.
*Mechanism:* a PR introducing a new table or view fails without a catalog entry in the same commit.
Use the `client_upload_surface` reason-code pattern for app-side writers with no cadence.
*Test:* `new-root-requires-catalog-entry`.

**G13 — Zero-importer detection. (lint)**
*Fails as:* tested, committed, green, imported by nothing.
*Mechanism:* repo-wide inbound-import scan that **fails loud** if it cannot confirm its own token —
a scan that cannot verify itself reports RED, never green.
*Test:* `no-orphan-modules` · `import-scan-fails-loud`.

**Meta-guard, and it is step 0 of everything above:** a test asserting every hook file on disk is
either registered in settings or explicitly declared PARKED with a reason. Without it, all 13 guards
are unverified. This repo proved that twice with the same file — a hook that documented five
failures, quoted the operator's decree, and **had never executed once.**

---

## §5 — THE PARSER AND THE PROVENANCE STRING

- **PURPOSE** — decide file types, header detection, ambiguity handling, the correction path, and
  the exact shape of the provenance string.
- **DONE WHEN** — a user can point at any number in a rendered email and be shown the cell.
- **GATES** — the figure-menu feeder, and therefore the entire first running slice.
- **STATUS** — **DECIDED.** Vendor install channel verified live 07/30/2026.

**Vendor fact, crawl4ai'd live 07/30/2026 — exactly the class of thing the playbook's
`actions/checkout@v6` incident is about.** SheetJS is **not installed from the npm registry.**
From `https://docs.sheetjs.com/docs/getting-started/installation/nodejs` and `/bun`, verbatim:
"Package tarballs are available on https://cdn.sheetjs.com" and
"https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz is the URL for version 0.20.3". The documented
command **begins by removing the registry package**: `bun rm xlsx`, then
`bun install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Their own recommendation is to
**vendor the tarball** into a `vendor/` folder committed to the repo and install
`file:vendor/xlsx-0.20.3.tgz`. They also state "Bun support is considered experimental." Anyone who
writes `bun add xlsx` from memory installs a different, stale package. **Re-verify before
installing** — the version above is a fact as of 07/30/2026, not a permanent one.

**Decisions:**

- **File types at launch: CSV and XLSX only.** PDF stays on the existing text lane (extract to prose,
  model reads a figure out of a sentence) and is explicitly **not** claimed as a cited-cell source.
  Two formats, one claim each, no ambiguity about which lane a number came from.
- **Header detection is proposed, never assumed.** The parser scores candidate header rows (type
  homogeneity below the row, string-ness of the row itself, non-emptiness) and **shows the user its
  pick with a one-click correction.** It never silently picks row 1. A wrong header row is the
  cheapest possible way to make every downstream figure wrong while every guard passes.
- **Merged cells resolve to the anchor cell's value, and the merge is recorded in the provenance.**
  A figure from a merged range says so.
- **Unlabeled totals are not figures.** A row with no label cannot enter the menu — G4 applied at the
  parser. It is surfaced as "3 unlabeled rows skipped," never dropped in silence.
- **Ambiguity degrades; it does not refuse and it does not guess.** An ambiguous sheet produces a
  *partial* menu plus an explicit list of what could not be read and why. Never a blank success page
  — this platform shipped a 200 OK with a green pulsing "Live" badge and zero content during an
  outage, and the honest version already existed one route over.
- **Correction without editing the file.** The user retypes a label or moves the header in our UI;
  the correction is stored against the file's content hash and **re-applies on re-upload of the same
  file.** They should never fix the same mis-parse twice — the scratchpad rule, turned into a product
  feature.

**The provenance string — the exact shape.**
Reader-facing, one line, no jargon: `Q3-numbers.xlsx · Summary · B14`.
Stored alongside it and never shown unless asked: file content hash, parse timestamp, header-row
index, merge origin if any, and the correction id if the user overrode anything. The reader-facing
string is the **claim**; the stored record is the **proof**. Both are required for a figure to
exist — a figure with the string and no record is "existence accepted as function" at figure grain.

---

## §6 — "FAITHFUL TO YOUR SOURCE," NOT "TRUE"

- **PURPOSE** — fix the exact claim, its wording, and where it appears, before anyone can complain.
- **DONE WHEN** — the sentence is written and no surface makes a stronger one.
- **GATES** — marketing copy, terms, and the in-product footer.
- **STATUS** — **DECIDED.**

The moment the data is theirs, we cannot verify it. If their sheet is wrong we render the wrong
number faithfully.

**The claim, verbatim, and nothing stronger anywhere:**
*"Every figure in this email traces to a cell in the file you supplied. We do not verify your
data — we make sure we quote it exactly."*

**Where it appears:** the upload screen (before they commit), the send confirmation (before it
leaves), and the email's own sources block (after it arrives). Three places, one sentence, no
variants — divergent copies of one rule is a named failure shape, and it cost this project 11
invisible days on a records request.

**No figure ever gets a stronger claim than "as supplied."** Hard product line, with a precedent:
the operator's own 07/25/2026 correction — *"STOP OVERCLAIMING THE PITCH… the honest claim is
narrower: 'every figure traces to a source.' Attribution correctness is NOT yet guaranteed."* Do not
sell the stronger sentence until the label guard (G3) exists and is proven.

---

## §7 — REPO SHAPE, STACK, AND WHAT THE FIRST RUNNING THING IS

- **PURPOSE** — folder layout, stack, and the smallest end-to-end slice that proves the thesis.
- **DONE WHEN** — one file in, one designed email out, one number the user can trace to their cell.
- **GATES** — every line of code.
- **STATUS** — **DECIDED**, with every vendor surface flagged for in-session re-verification at
  install time (global rule 1 — the versions here are dated facts, not permanent ones).

**Stack: the same one, and the reason is the inventory, not preference.** `compile-grid.ts` and
`render-email-doc.ts` are React + `@react-email`; the upload UI, the layout store, and the segment
resolver are Next + Supabase. Picking a different framework converts the largest verified-clean
block in the inventory from a copy into a rewrite. Next.js App Router + Supabase + Vercel, and
re-verify each version live before the first install.

**Folder layout — flat, by lane, so a session can locate anything from the lane name alone:**

- `parse/` — CSV/XLSX → figures. The vendored SheetJS tarball lives in `vendor/`.
- `figures/` — the figure record (value, unit, label, grain, source location, hash), the menu
  builder, dedupe, and re-upload invalidation. **The moat lives here.**
- `bind/` — the extracted shape-detection and binding logic, owing nothing to `refinery/`.
- `doc/` — block types, schema, grid, layouts, finalize. The verified-clean core, copied.
- `render/` — blocks, compile-grid, email HTML.
- `brand/` — apply-brand plus fonts, with the browser-only defect fixed **during** the move.
- `author/` — the system prompt, figure-menu rendering, the recipes mechanism, the text-mode dial.
- `check/` — the checker pass and every lint. Guards live in one place so the meta-guard can find them.
- `send/` — the lock, the state re-read, the pre-send lint.
- `catalog/` — the one catalog, using the `client_upload_surface` reason-code pattern.

**The first running thing — one slice, no branches:**
Upload a CSV → parse it → show the header-row pick with a correction → build the figure menu →
author one section against that menu with `textMode: preserve` → bind one chart → render → **open
the rendered email and look at it** → point at one number and see `sales.csv · Sheet1 · B14`.

No send in slice one. No XLSX in slice one. No improve/condense in slice one. The thesis is
provenance, and the smallest honest proof of it is one number and one cell.

**What must exist before that slice is written:** the meta-guard (hooks registered or PARKED),
session-start injection, the append-only log plus its push gate, and the obligation ledger **with a
closer**. Playbook install order, steps 0 through 3, no substitutions.

---

## §8 — WHAT WE DELIBERATELY DO NOT BUILD

- **PURPOSE** — the kill list, written up front so it stops getting re-proposed.
- **DONE WHEN** — each entry names why, so a future session can't relitigate it from scratch.
- **GATES** — nothing. This section unblocks by existing.
- **STATUS** — **DECIDED.**

- **40+ image models.** Gamma's surface, not our volume. One image source, chosen once.
- **60+ languages.** Same reason.
- **Multi-page microsites.** We make emails.
- **Per-viewer engagement analytics.** A different product with a different data-protection posture,
  and this whole document is a promise that we don't hold anyone's data loosely.
- **A paid logo vendor.** Logo.dev was killed. Favicon → globe fallback is the answer. Do not
  re-propose.
- **Per-tenant brain DAGs.** 32 global brains cost a paid model call per rebuild. The general
  product needs ONE universal upload→figures path, not N hand-authored packs per tenant.
- **Runtime clustering / k-means anything.** Two documented rejections already; at our N it is
  theater.
- **A second company.** The operator's own baseline, 07/25/2026: no company, no users, execution
  trust low. Stop proposing companies; build this one.

---

## §9 — HOW WE WORK WITH DATA SO NOTHING COLLIDES, MIXES UP, OR GETS REDONE

- **PURPOSE** — what keeps a session from mixing up, colliding, forgetting, or redoing work.
- **DONE WHEN** — each rule is a mechanism in the new repo, not a sentence in this file.
- **GATES** — nothing blocks on it; everything degrades without it.
- **STATUS** — **DECIDED.**

**Don't mix up — one identity per thing, derived from content.**
Every figure, upload, and draft is identified by a content-derived id: never by position, never by a
sequence number, never by "the latest one." Ordinals are unstable identifiers in any artifact two
writers touch — this repo proved it with parallel sessions claiming the same list numbers within an
hour, and it is the same failure that would silently rebind `[f7]` after a re-parse. **If you can
renumber it, you can't cite it.**

**Don't collide — one writer per record, and the lock is taken before the read that decides.**
The double-send happened because state was read, a decision was made, and the write happened
afterward with nothing holding the gap. Re-read inside the lock. And when you disable something,
verify the *process* is gone and the config change is *committed* — a renamed key that still runs
the same command is not a disabled thing, and an uncommitted fix leaves no trace for the next
session to find.

**Don't forget — put it on an event Claude actually sees.**
Only `SessionStart`, `UserPromptSubmit`, and `UserPromptExpansion` write into context. A rule in a
markdown file survives until the first compaction, then it's a coin flip. The A/B test is already
run: the session log has a hook and a push gate and gets touched a dozen times a day; the scratchpad
had a rule and sat 68 lines uncommitted, unreadable by the next session. **Write hooks, not rules.**
And a rule loader must never fail open — this repo's injector silently substituted a 7-rule constant
for a 12-rule file, and rules 8 through 12 vanished from every prompt with no error.

**Don't redo — the obligation ledger has a closer on day one.**
An opener without a closer only grows, and a ledger that only grows gets abandoned at 722 entries.
When this project finally built the sweeper, its first run closed 8 of 8 with zero human decisions —
all had been done for weeks. Equally: the moment you park a finding, open the obligation in the same
session. A prose line in a log is *"not deferral, it's forgetting on a delay"* — three data-grain
gaps found on three separate days were each logged and never promoted, and each was rediscovered
from scratch instead of connected.

**Don't answer from the first file you opened.**
"We don't have X" is a claim about the catalog, not about the file in front of you. Name which of
the three you checked — catalog, source ceiling, live query — inside the answer. This project told
the operator it had no beds/baths, no flood data, no sold-side DOM, and no vendor sale dates, and
every one of those was false, all in a single day, each from reading exactly one artifact.

**Don't verify against your own record of having done it.**
Match the evidence class to the failure class. Rendered output → grep the rendered artifact.
Interactive or time-domain → drive the real interaction. Data → query live. A screenshot cannot see
a camera jump; a token audit cannot see mojibake; a green unit test cannot see that the detector
never ran.

**Don't speak a number you didn't just query.**
Every count, share, and percentage in a spec, plan, or README — **including every number in this
file** — is a hypothesis with a timestamp. 9.9% versus 54.2%, one day apart, is the standing example.

**And the one that governs the others:** when the operator says do it, do it. A concern gets one
sentence, then execute. Never answer a decision with a competing plan — *"every fucking idea leads
to another idea that says the last idea sucks."*

---

## §10 — THE ACTING HALF: WHAT THIS DOCUMENT TRIGGERS

- **PURPOSE** — close this file's own one-law gap. Everything above is a recording half.
- **DONE WHEN** — the new repo exists and its day-0 obligations are open in *its* ledger.
- **GATES** — nothing after it. This is the last section.
- **STATUS** — **DECIDED.**

By its own law, this document is pure recording: nothing reads it, nothing acts on it. That is
closed **inside the new product**, not by opening entries in this repo — the checks ledger is at 718
open and "the ledger only grows" is a live operator gripe, so adding to it is the wrong move.

**The executable version of the list below is `docs/carve-out/DAY-0-CLAUDE-SETUP.md`** — ordered
steps with the command and the proof for each, plus the Claude Code hook contract re-verified live
07/30/2026. That runbook also records two places where `new-project-playbook.md` §7.1 and §8 are
already stale. Read the runbook while typing; read the list below to know what the steps are for.

**Install order for day 0 of the new repo, in sequence, before the first feature:**

1. **The meta-guard.** A test asserting every hook on disk is registered in settings or explicitly
   PARKED with a reason. Also assert the CI glob reaches every test directory — this repo's stopped
   one level short and two suites never ran.
2. **Session-start injection.** Last N log entries, open obligations, unresolved scratchpad items.
   The single highest-leverage mechanism available.
3. **The append-only session log plus its pre-push gate.** Newest-first, never rewritten;
   corrections go on top. Push blocked if no commit touched it.
4. **The obligation ledger with a closer.** Owner, key, label, class. Discriminating signals — a
   loose `contains` check that closes a broken thing is worse than leaving it open.
5. **The scratchpad plus its gate.** Every gripe lands before the answer.
6. **The catalog**, with the `client_upload_surface` reason-code pattern.
7. **The 13 product guards**, each with its named test.

**Then, and only then**, the first slice: one CSV in, one designed email out, one number traceable
to `sales.csv · Sheet1 · B14`.

**Open the file, look at the email, and point at the number before telling anyone it works.**
