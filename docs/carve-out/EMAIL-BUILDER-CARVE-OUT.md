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
- Sections get filled over multiple sessions. A section marked DRAFTED has been thought through;
  a section marked OPEN is a named question with no answer yet. **Do not treat an OPEN heading as
  covered** — that is the one law in the playbook (existence is not evidence of function).
- Evidence rule: every "copy this" claim names a real path, verified by reading it. Anything not yet
  verified says so.

---

## §1 — WHAT THIS IS, AND WHAT IT IS NOT — DRAFTED

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
  user's. Our claim is **faithful to your source**, never **true** — see §6.
- Not a Gamma clone. We are not chasing 40+ image models, 60+ languages, 50-page microsites, or
  per-viewer analytics. (Playbook rule: borrowed hyperscaler patterns must justify themselves at our
  volume.)

---

## §2 — THE INVENTORY: COMES / STAYS / GETS WRITTEN — DRAFTED, NOT AUDITED

**Honest status:** the paths below were verified by reading them this session. A full import-graph
audit has NOT been run — several "copy" candidates almost certainly drag SWFL imports behind them.
Running that audit is the first task of the next session, and it is §2's own exit condition.

### 2a. COMES OVER — the engine, already source-agnostic

- `lib/email/doc/types.ts` — 17 block types (header, hero, stats, signal, text, image, listing,
  multi-column, list, metric-card, agent-card, agent-hero, social-icons, button, divider, footer,
  sources). **Pure — imports from no one.** Cleanest possible copy. (`listing`, `agent-card`,
  `agent-hero` are real-estate-shaped and get renamed or dropped — see §3 open question.)
- `lib/email/doc/schema.ts` — runtime validation conforming to those types.
- `lib/email/grid-schema.ts` — 12 columns, 600px canvas, rowHeight 30, margin [8,8], plus the
  Full/⅔/½/⅓ width presets so a user never counts columns. Imports only `doc/types`.
- `lib/email/compile-grid.ts` — grid positions → email-safe columns.
- `lib/email/doc/` — `grid-layouts.ts`, `row-grouping.ts`, `finalize-doc.ts`, `saved-layout.ts`,
  `layout-store.ts`, `history.ts`, `preview-fill.ts`.
- `lib/email/blocks/` — the renderers, plus `scale.ts`, `styles.ts`, `email-head.ts`.
- `lib/email/render-email-doc.ts`.
- `lib/email/brand/apply-brand.ts` + `apply-brand-style.ts` — brand application. **Known defect to
  fix during the move, not after:** `applyBrand` is browser-only, so every non-lab send path ships
  unbranded with an empty CAN-SPAM footer address (open defect, filed 07/26/2026).
- `lib/email/lab/capabilities.ts` — the tier dial. The *pattern* copies (every feature declares one
  target, capability sets are derived, a test enforces it). The values are all re-decided.
- `lib/email/social/platforms.ts` — 8 platforms, one root, favicon→globe fallback. No paid logo
  vendor (Logo.dev was killed; do not re-propose).
- `lib/email/segments/` — `filter.ts` (pure engine) + `resolve.ts` (DB wrapper).
- `lib/email/csv-escape.ts` — OWASP CSV-injection escaping **at the exit**, never on import. Store
  raw, escape when generating. Copy this rule with the code.
- `lib/deliverable/chart-coherence.ts` — `assertHeroChartCoherence`: a chart's magnitude must cohere
  with its headline. Red CI test at author-time, soft drop at runtime.
- `components/charts/registry/pick-frames.ts` — the 5-rung data-shape → chart-type ladder, verified
  1:1 against Atlassian's chart guide and the FT Visual Vocabulary. **Keys off data shape, not the
  lake.** Ships with its known blocker: the registry imports React frame components as values, so
  the ladder transitively bundles React and can't run server-side until `{fixtureOnly, accepts,
  label}` is extracted into a pure `frame-meta.ts`. **Do that extraction as part of the move.**
- `bind-frame.ts` — deterministic binding, stamps as-of, carries citation verbatim, returns null
  when it can't bind. No LLM touches a number. This is the moat.
- `components/project/UploadDrop.tsx` — drag-and-drop already built.
- `lib/pdf/extract.ts` + `app/api/projects/[id]/extract-pdf/route.ts` — PDF → text.
- `lib/project/uploads-text.ts`.
- `.claude/hooks/` — take the guard set per playbook §5 install order, not wholesale.

### 2b. SPLIT — reusable core tangled with SWFL wiring

- `lib/email/author-doc.ts` — **the most important file in the move.** Reusable: `buildFigureMenu`,
  `renderFigureMenu`, `buildAssetMenu`, `renderAssetMenu`, `clampProse`, `assembleAuthoredDoc`,
  `collectAnchorNumbers`, `figureCitations`, `fillEmptySourcesBlock`, `lintAuthoredProse`, and the
  accent budget. Not reusable: the dossier section, the SWFL vocabulary, and lake-specific grounding
  inside `authorSystem()`.
- `lib/email/build-doc.ts` — `docSkeleton` and the build spine come over; `fetchLakeParts()`,
  `loadMarketFigures`, and the `/api/b/master` dossier fetch do not.
- `lib/email/author-recipes.ts` — 11 deliverable recipes. The *mechanism* copies (advisory prose
  appended to the system prompt, digit-free by test so it can never smuggle a figure). The recipe
  content is real-estate-specific and gets rewritten for whatever verticals we actually serve.
- `lib/assistant/compose-chart.ts` — holds the proven upload-scan lane but is wired to SWFL brains.
- `lib/deliverable/build.ts` — `gateNarrative`, the no-invention output lint. Rule comes; SWFL
  geography exemptions do not.

### 2c. STAYS BEHIND — all of it

`ingest/` (every Python pipeline, dlt, DuckDB, `cadence_registry.yaml`) · `refinery/` (41 packs,
stages 1–4, the DAG, all brains, rules-of-engagement) · every `data_lake.*` table ·
`lib/email/market-context.ts` · `lib/listings/` · `lib/why-not-selling/` · corridor/ZIP/county
logic · `docs/standards/data-roots.md` · `/api/b/*` and the MCP surface · the GHA rebuild
workflows and their tripwires.

**Note for the decision, not an argument for it:** the roots catalog records 72 proven-but-never-
pulled source ceilings as of 07/22/2026. A large share of the lake was never wired to a consumer at
all, so leaving it behind costs less than its size suggests.

**CORRECTION 07/30/2026 (catalog lane, run after this section was first written).** An earlier draft
said there is no precedent for user-supplied data in the catalog. That is true of
`docs/standards/data-roots.md` (its only "upload" entries are Parquet-upload *watches* on the
corridor pulse — unrelated), but it is NOT true of the registry. `ingest/cadence_registry.yaml`
lines 2355–2361 carry a `client_upload_surface` reason code over `data_lake.user_mls_listings` and
`data_lake.user_mls_stats`, noted verbatim: "Client RESO/MLS upload surface — `lib/reso/sync.ts`
writes it per user connection (`migrations/20260625_user_mls_data_lake.sql`). App-side, not ingest."

Two consequences for this plan:
1. **There is already a working pattern for registering user-supplied data without pretending it is
   a pipeline** — a reason code that says "app-side writer, no cadence, do not expect a cron." Copy
   that idea into the new product's catalog from day 0 rather than inventing one.
2. **`lib/reso/` was missing from §2 and belongs in the inventory** — it is the closest existing
   thing we have to "a user brings their own data and we write it per connection." Classify it
   (comes / splits / stays) during the §2 import-graph audit; do not assume, read it.

### 2d. GETS WRITTEN FRESH — this is the actual build

1. **Tabular parser: CSV / XLSX → figures.** Verified 07/30/2026: `package.json` has no `xlsx`, no
   `papaparse`, no `csv-parse`, no `exceljs`. Nothing tabular exists today. The upload lane is
   text-only — a PDF is extracted to prose and a model reads a number out of a sentence. **This is
   the single missing feeder and the highest-risk piece.**
2. **The provenance string for a messy real sheet** — merged cells, a header three rows down, an
   unlabeled total row. Nobody scanned has solved this. §5.
3. **The figure-menu feeder** that replaces `fetchLakeParts()` — parsed upload → the same
   id-addressable menu shape `authorSystem` and `bindFrameSpec` already consume.
4. **The composition brief** — the orchestrator artifact. Gamma exposes the equivalent as a
   first-class `pages[]` array (≤50, each with its own text, mode, length, tone, images). Ours is
   sections, not pages.
5. **The checker pass.** Two independent sources say quality comes from a checker, not a smarter
   writer: our own 07/01/2026 design-quality research (closed design-token enums, fixed type scale,
   8pt spacing, deterministic post-generation validator) and Beefree shipping
   `beefree_check_template` / `beefree_check_section` as agent-callable tools.
6. **The text-mode dial** — preserve / improve / condense, as a **visible user choice**. Gamma ships
   this as `textMode`, and on `preserve` it ignores tone/audience/length entirely because the user's
   text is being kept. This is the operator's "say exactly what they say" requirement, as a mode
   rather than a guard.

---

## §3 — WHERE WE SCREWED UP THE FIRST TIME — DRAFTED

The generic version of this is `new-project-playbook.md` §1 and §4. Do not restate it here. What
follows is the **product-shaped** subset — the mistakes that will recur in an email builder
specifically if nobody names them now.

1. **Built the recording half, never the acting half.** Ceilings recorded and never read back.
   `ceilings-to-checks.mjs` built, committed, and never plugged into a workflow or hook. The checks
   ledger had an automatic opener and no automatic closer, so the count could only rise — it hit
   722 open with 8 carrying a signal before anyone noticed the asymmetry was structural. **Test for
   every new artifact: what reads this, and what acts on it?**
2. **Guards shipped reactively, one incident at a time.** Build breaks → bolt on a guard → breaks
   differently → bolt on another. Root cause named 07/20/2026: the pre-build process listed "error
   handling" as one word with no forcing function. The fix now in force — **name every failure mode
   and its guard before a design is approved** — applies to every section of this document.
3. **A new root created and never catalogued.** Nothing converted "I built a root" into a catalog
   edit. In the new product there is exactly one catalog of where each concept's value comes from,
   and creating a source without an entry fails a check.
4. **Data before consumer.** Pipelines pulled 7 of 120 available fields for over a week while sale
   price, living area, year built, and land value sat unused in the same already-open response. The
   guard that came out of it — no bulk ingest without its consumer in the same change — generalizes:
   **no parser lands without the surface that reads it.**
5. **The same surface "fixed" five times without ever being driven live.** A code fix is not live
   until the thing that renders it actually runs. Verify against the real artifact — the inbox, the
   rendered email — never against the program's own record of having done it.
6. **Concurrency shipped without a lock.** Three concurrent processes once sent the operator the same
   "Under Contract" email three times. Any send path gets a lock and a re-read of state before it
   fires, from day 0.
7. **Dead code with zero importers, undetected.** Five tested modules under `lib/why-not-selling/
   checks/` have no importers at all. A lake comp feed has zero consumers. Nothing goes red for
   silence — so an importer check has to be a mechanism, not a habit.
8. **Design narrated instead of shown.** A footnote explaining arithmetic the reader can do in their
   head reads as a spreadsheet export, not an agent. Applies directly here: derived cells earn a note
   only when the reader can't check them.
9. **Hand-authoring what the builder exists to build.** Repeatedly, the lab was bypassed and content
   hand-written. In a product whose whole thesis is the builder, every artifact must be produced by
   the builder or it is not evidence the builder works.

---

## §4 — GUARDS ON DAY 0 — OPEN

Install order for harness guards is `new-project-playbook.md` §5 — follow it, do not re-derive it.
This section is the **product-specific** guard list, and each one needs a named failure mode, a
named mechanism, and a test before it counts. Candidates so far:

- The figure menu itself as the no-invention mechanism (model selects an id, the system writes the
  value and its label — a model cannot type a digit that isn't on the menu).
- Provenance required on every figure; a figure without a source cannot enter the menu.
- Headline-vs-chart magnitude coherence.
- Closed design-token enums instead of freeform style props.
- The checker pass, run before anything renders.
- CSV escaping at the exit, never on import.
- One catalog entry per source of truth, enforced.
- A send lock plus state re-read before every send.
- An importer check so a module with zero consumers goes red.

**Not done:** each of these needs its failure mode written out and a test named. That is §4's work.

---

## §5 — THE PARSER AND THE PROVENANCE STRING — OPEN

The highest-risk piece and the one with no prior art in the scan. Questions to answer before code:
what file types at launch; how a header row is detected when it isn't row 1; what happens to merged
cells and unlabeled totals; what the provenance string looks like so it is meaningful to a user
("Q3-numbers.xlsx, sheet Summary, cell B14"); what happens when the sheet is ambiguous — refuse,
ask, or degrade; and how a user corrects a mis-parse without editing their file.

---

## §6 — "FAITHFUL TO YOUR SOURCE," NOT "TRUE" — OPEN

The moment the data is theirs, we cannot verify it. If their sheet is wrong we render the wrong
number faithfully. The receipt says "your file, cell B14," which is survivable — but the claim we
make in the product, the marketing, and the terms has to be designed in from the start, not bolted
on after someone complains. Needs: the exact user-facing wording, where it appears, and whether any
figure ever gets a stronger claim than "as supplied."

---

## §7 — REPO SHAPE, STACK, AND WHAT THE FIRST RUNNING THING IS — OPEN

Folder layout, framework version, database, auth, hosting, and the smallest end-to-end slice that
proves the thesis (one file in, one designed email out, one number traceable). Nothing decided.

---

## §8 — WHAT WE DELIBERATELY DO NOT BUILD — OPEN

The kill list, written up front so it doesn't get re-proposed every quarter. Seed entries from the
scan: 40+ image models, 60+ languages, multi-page microsites, per-viewer engagement analytics,
a paid logo vendor.
