# Per-unit coverage ledgers (pipelines/brains/deliverable recipes)

**Date:** 2026-07-15

## Problem

Nobody can answer "what breaks and why" for any given pipeline, brain, or deliverable recipe
without re-auditing it from scratch — and the re-audits don't stick. Concrete evidence, not a
feeling:

- `public.checks.updated_at` had no DB trigger and `check.mjs update()` never set it either — every
  check's staleness was frozen at creation forever, including priority-1 bumps, for weeks, because
  reading the page was voluntary (`docs/superpowers/plans/2026-07-07-session-debris-and-status-blind-spots.md`).
- `docs/standards/deliverable-playbook.md` was rewritten wholesale on 07/13/2026 after real bugs
  shipped that an *earlier* version of the same document was supposed to prevent. Four workers each
  "verified it by eye" and four shipped a falsehood anyway.
- Two git worktrees sat stale for 16+ hours with unpushed commits before anyone noticed, because
  nothing pulled a human to look.

The common failure shape: every status surface we have is **pull** (a page/doc someone has to
remember to read) and **hand-attested** (a human claims it's true, nothing checks). Both properties
independently decay to silence. This spec fixes the mechanism, not just the deliverables lane.

## Research (crawl4ai, 07/14/2026 — not memory, per RULE 0.4)

- **Backstage** (github.com/backstage/backstage, Spotify → CNCF). One `catalog-info.yaml` per
  component, committed next to the code, maintained via normal git/PR flow. Confirms: metadata
  should live with the code it describes, not in a side wiki.
- **DataHub** (github.com/datahub-project/datahub, LinkedIn). Metadata is scraped from the
  pipeline's own run, not hand-typed — the mechanism that actually kills staleness, because no
  human has to remember to update it.
- **Google SRE book** (sre.google/sre-book). Two load-bearing lines: *"Signals that are collected
  but not exposed in any prebaked dashboard nor used by any alert are candidates for removal"* —
  an unread page should be deleted, not kept — and the runbook pattern: the fix for "nobody checks
  the page" is never a better page, it's that the failure carries the doc link, so it arrives at the
  moment it's relevant.
- **ADRs** (github.com/architecture-decision-record). One file per decision, in-repo — but the part
  that matters is "fitness functions": CI guardrails that fail a PR when it violates a recorded
  decision. The doc survives because breaking the rule breaks the build, not because someone read it.

## Rejected approaches

1. **A fourth metadata format.** We already have three registries that are the Backstage
   `catalog-info.yaml` equivalent — `ingest/cadence_registry.yaml` (`source_scope` blocks, 76
   registered pipelines), `refinery/packs/index.mts` `PER_PACK_REGISTRY` + `catalog.mts` (48 brains,
   Gate-5 drift-gated), `lib/deliverable/recipes.ts` (12 recipes). Building a new one duplicates
   identity data that's already correct and already enforced. **Rejected — reuse, don't reinvent.**
2. **File-existence gate ("does a playbook file exist for this unit").** This is what the
   deliverable playbook already was on 07/13 — present, correct, read, and four workers still
   shipped the exact falsehoods it warned about. A gate that checks a file exists checks
   documentation completeness, not failure prevention. It would have been GREEN the day the bugs
   shipped. **Rejected — doesn't test the thing that actually failed.**
3. **Hand-maintained "verified" freshness stamps.** Self-attestation ("I verified this against
   commit X") is the exact failure mode this codebase keeps getting burned by — LittleBird's
   phantom audits, "prod evidence not dev attestation," and 07/13's "verified by eye" four times
   over. **Rejected — replaced with an objective, unclaimed signal (see Freshness below).**

## What we're building

### 1. Registries stay authoritative. Nothing new there.

No changes to what counts as source-of-truth for ownership/source/output/cadence. The three
existing registries keep doing that job, under their existing Gate 5 / Gate 7 drift checks.

### 2. Per-unit coverage ledger — three required sections, not a landmine dump

One small file per unit, co-located with its code (Backstage's "docs live with the code"
principle, and the same convention `inject-focus.mjs` already uses for area `CLAUDE.md` files):

- Deliverable recipes: `lib/deliverable/recipes/<name>.ledger.md`
- Ingest pipelines: `ingest/pipelines/<name>/LEDGER.md`
- Brain packs: `refinery/packs/<name>.ledger.md`

**No registry field points at it — presence is convention, not a claim.** A missing ledger means
"nothing documented yet," not an error. This avoids a second self-attestation surface (a registry
saying `has_ledger: true` could itself drift from reality).

**Operator addendum (07/15/2026, mid-brainstorm):** the ledger's first required section is
**Key details** — the full scope of what the source/pipeline/unit *could* give us, not just what
we currently pull, so nobody rediscovers a gap that was already found and then buried. This is not
a new research task: for ingest, `cadence_registry.yaml`'s `source_scope` block
(`confirmed_total`/`source_ceiling`, cited `source_url` + `as_of`) already holds this for **74 of
76** registered pipelines (checked live 07/15/2026) — the FULL-SCOPE-FIRST rule (CLAUDE.md RULE
0.4 addendum) is already working. The gap isn't missing research, it's that the research is
sitting in one 900-line YAML file nobody opens per-pipeline. The ledger's Key Details section is a
**generated rendering** of that existing block — the registry stays the single source of truth
(rejected-approach #1 still holds), the ledger is what makes it visible at the moment someone
touches that pipeline. For brains and recipes, the analogous content is "what this unit currently
draws on vs. what's derivable but unbuilt" — thinner, since neither lane has an equivalent
scope-ceiling convention today; that's scoped honestly as thin-to-empty at first, not padded.

Each ledger has exactly three sections:

```markdown
## Key details
- What we pull: <confirmed_total.summary, source, as_of — generated from cadence_registry.yaml>
- What the source also offers, unpulled: <source_ceiling.summary, source_url, as_of>
- (2 of 76 pipelines have no source_scope yet — those ledgers say so explicitly, in the same
  section, instead of silently omitting it — a visible TODO beats an invisible gap.)
```

**Honesty framing (advisor round 2 correction):** `source_scope`'s `confirmed_total`/`source_ceiling`
are researched prose with an `as_of` date — self-attested, same class of claim as the "verified"
stamp this spec already refused in §6. The drift-gate proves the ledger file matches the registry;
it does **not** prove the registry's own research is still accurate against the live source. Every
Key Details section says so explicitly — *"Last researched: `<as_of>` — this is a researched
snapshot, not a live query"* — never implying a freshness guarantee the mechanism can't back. A real
worked example is at `ingest/pipelines/fred_g17/LEDGER.md` (generated 07/15/2026 from the live
registry entry): FRED publishes real Lee/Collier county-level series — house price index, county
GDP, per-capita income, median household income, poverty rate, building permits, confirmed series
IDs — **none pulled today**, sitting in the registry since 07/08/2026, now visible instead of buried.
Deriving the true unpulled-ceiling from the source's live schema/catalog instead of researched prose
is real, separate future work — flagged in Open Risks, not solved by this spec.

```markdown
## Enforced
- Claim: reduced_amount is the SIZE OF THE CUT, not the old price
  Test: lib/deliverable/recipes/price-reduced.test.ts > "the vendor's reduced_amount is the SIZE OF THE CUT, not the old price"

## Unenforced (prose only — no test catches this yet)
- [none for this unit, or list here]
```

This is deliberately NOT prose-first. "Enforced" entries point at a real, runnable test. "Unenforced"
entries are the honest residual — what's still running on hope. A unit whose ledger is 100%
"Enforced" is genuinely protected. A unit whose ledger is mostly "Unenforced" is telling you exactly
where the next 07/13 will come from.

### 3. Pilot evidence: the deliverables lane triage (done 07/15/2026, not projected)

Before writing this spec, I cross-referenced `docs/standards/deliverable-playbook.md`'s 12
per-recipe landmines against the actual recipe test files. Result:

| Recipe landmine | Status | Test |
|---|---|---|
| coming-soon: address never leaks (hero/alt/subject/CTA/narrator) | **Enforced** | `coming-soon.test.ts` — `leaksStreet`/`redactStreetLine`, "the street address never ships" |
| market-comps: vacant lot filtered (beds+sqft required) | **Enforced** | `market-comps.test.ts` — "the vacant lot never reaches the chart, the table, or the math" |
| under-contract: no days-to-contract fabrication | **Enforced** | `under-contract.test.ts` — "blocks the canonical fabricated interval + the invented event ordering" |
| just-sold: ask price never mislabeled as a close | **Enforced** | `just-sold.test.ts` — `closeFrom` "REFUSES a last-list price — an ask is not a sale" |
| open-house: date/time never defaulted | **Enforced** | `open-house.test.ts` — "the moment is TWO OPEN SLOTS on the canvas" |
| price-reduced: cut is from the MOST RECENT price, not original ask | **Enforced** | `price-reduced.test.ts` — "previous price = current + cut" / "it is NOT the reduced_amount itself" |
| agent-brand-intro: anchor city can't contaminate the farm area | **Enforced** | `agent-brand-intro.test.ts` — "the anchor listing can never hijack the farm area" |
| agent-launch: exactly one hard number, no chart | **Enforced** | `agent-launch.test.ts` — "buildAgentLaunch: NO chart, ever" |
| sphere-weekly: headline is a lane-3 fact, never our own figure | **Enforced** | `sphere-weekly.test.ts` — "THE HEADLINE — a lane-3 fact, or an open slot. Never an invention" |
| market-pulse: binds MoM, not YoY | **Enforced** | `market-pulse.test.ts` (MoM binding confirmed live) |
| market-pulse: 8-row cap on a 10-ZIP place | **Unconfirmed** | needs a direct assertion — flagged as a real gap, not assumed |
| new-listing: "it's the reference, no chart" | **Unenforced (irreducible)** | framing guidance, not a failure mode — no test needed |
| review-reply: "genuinely about numbers, so it charts" | **Unenforced (irreducible)** | framing guidance, not a failure mode — no test needed |

**9 of 12 are already enforced and already have the test.** The pilot's real work is
cross-referencing and gating what exists, plus closing the one confirmed gap (market-pulse row cap)
— not writing 9 new tests from scratch. This is a materially smaller, lower-risk first build than
"write a documentation layer," and it's proof the pattern works before it touches ingest or packs.

### 4. The enforcement gate — extends `check-prepush-gate.mjs`, same shape as Gates 2/5/7

New gate, same file, same fail-closed/fail-open contract as the existing 8:

- **Parse every ledger's `Enforced` entries.** Each names a test file + a test/describe string.
- **Block** if a named test file doesn't exist, or the named test string can no longer be found in
  it (the orphaned-claim case — a ledger asserting protection that's since been deleted or renamed
  is worse than no ledger, because it reads as safety that isn't there).
- **Block** if the named test file fails when run (mirrors Gate 5's `catalog.test.mts` pattern:
  fast, deterministic, no DB/network — these are all `bun:test` files already).
- **Block (ingest ledgers only) if a Key Details section drifts from the live `cadence_registry.yaml`
  `source_scope` block it was generated from** — same mirror-check shape as Gate 5's catalog check,
  just applied to a generated file instead of hand-written code. This is what stops the Key Details
  section from becoming exactly the kind of buried-and-stale fact the operator is frustrated by:
  regenerate-on-drift, don't let the copy silently diverge from the registry.
- **No block on "Unenforced" entries growing or shrinking** — that list is honest reporting, not a
  violation. A ledger is allowed to say "we don't protect this yet."
- Fires only on push touching a ledger file or the unit's own source (mirrors how Gate 5/7 scope
  their triggers) — never a full-repo sweep.

This is the ADR "fitness function" idea made concrete: the ledger's claims are load-bearing because
breaking them breaks the push, not because someone reads the file.

### 5. `inject-focus.mjs` — push the content inline, not a path to go read

`inject-focus.mjs` already injects "Area conventions load by location" for the 5 area `CLAUDE.md`
files. Extend it: when a session's touched files match a unit with a ledger, print the ledger's
**Key Details + Enforced summary + full Unenforced list inline** in the injected context — not a
pointer to go open the file. A path is still pull; the content itself is push. This is the direct
fix for "I keep finding out what we could have got after checking and rechecking" — the source
ceiling shows up automatically the moment anyone touches that pipeline again, not only when someone
thinks to go look it up.

**Cold-start case (the gap in the first draft of this plan):** when a session touches a unit with
**no ledger yet**, print a short nudge anyway — *"No coverage ledger yet for `<unit>`. If you learn
something surprising here, it goes in `<path-that-would-be-created>`."* This is exactly the moment
the nudge has to fire — the first landmine discovered on a previously-boring unit — and a
file-presence-only trigger would miss it by construction.

### 6. Freshness — objective diff only, no self-attestation

No "verified against commit X" language anywhere (that's the 07/13 "verified by eye" pattern
wearing a timestamp). Instead: an advisory (never blocking) note when a unit's own source has more
than N commits since the ledger file's last edit — *"this unit has moved N commits since its ledger
was last touched, the Unenforced list may be out of date."* Purely mechanical `git log` diff, no
human claim baked in. Enforced entries don't need this at all — a passing test is real verification,
not a claim of one.

### 7. Single-root migration — the ledger becomes the ONE authority for that unit's landmines

Per the existing rule (`feedback_shared-concept-one-authority`), this cannot be an added layer on
top of what exists — that worsens the exact pile the operator is frustrated by. Concretely:

- `docs/standards/deliverable-playbook.md`'s Part 6 table and the relevant Part 9 items get
  **extracted into the 12 new ledger files and deleted from the playbook**, replaced with a pointer:
  "per-recipe landmines now live at `lib/deliverable/recipes/<name>.ledger.md`."
- The playbook keeps Parts 0–5, 7–8 (the claim-gate philosophy, the open-slot contract, the proof
  process) — those are cross-cutting practice, not per-unit facts, and don't belong in a ledger.
- Ingest and packs have no prior monolithic doc to retire — their ledgers start clean.

### 7.5 Why doesn't `/ops/census` already do this? (verified, not assumed)

The operator named `/ops/census` directly as "supposed to" solve this. Checked before writing this
off as a mechanism problem: `swfldatagulf-ops/lib/census.ts` **already parses and renders
`source_scope`** (`confirmed_total`/`source_ceiling`) exactly as designed
(`docs/superpowers/plans/2026-07-07-pipeline-data-census.md`) — the mechanism is not broken. The
open check `source_totals_migration_apply` ("source_totals is APPLIED but writing 0 rows") looked
like a plausible cause and was checked directly: `data_lake.source_totals` is a **different, dead**
table — zero rows, zero code references repo-wide, belonging to an unrelated `listing_lifecycle`
reconciliation attempt, not the census page's row-count path (`rowCounts()` queries tier-2 tables
directly). Ruled out, not left hanging. The real cause is exactly the push-vs-pull diagnosis this
spec already made: the data is correct and rendering, at a URL nobody navigates to unprompted. §8
below is the fix — not a second data pipe, a delivery-mechanism change.

### 8. The ops page — decided now, not deferred

Per the SRE research and our own evidence (`checks` page was pull-only and its own freshness signal
was silently broken for weeks): **`/ops/census`'s "browse this to know what's going on" framing is
retired.** It may still exist as a read-only, auto-generated reflection of the three registries for
occasional manual audit — but it is explicitly not the enforcement mechanism and not something
anyone is expected to proactively check as part of normal work. The push mechanisms are (a) the
gate, at push time, and (b) `inject-focus`, at touch time. If a fact only lives on a page someone
has to remember to visit, per the SRE line quoted above, it's a candidate for deletion, not upkeep.

## Rollout order

Two different kinds of work move at two different speeds, and the plan splits them rather than
forcing one lane order for both:

1. **Ingest Key Details — generate-only, first, fast.** 74 of 76 pipelines already have the source
   data (`cadence_registry.yaml` `source_scope`); this section is a mechanical render, not new
   research or new judgment calls. A single generation script can produce all 74 `LEDGER.md` Key
   Details sections (plus 2 explicit TODO stubs for the missing pair) in one pass. This ships fast
   and directly answers the operator's live complaint — it does not wait on the deliverables pilot.
2. **Deliverables (Enforced/Unenforced pilot).** 12 recipes, 9 already-enforced landmines to
   cross-reference (mechanical), 1 confirmed gap to close (market-pulse row cap), 2
   irreducible-prose entries, playbook migration, gate + inject-focus wiring. This is where the real
   mechanism design gets proven — the claim-to-test cross-referencing, the orphan-claim gate, the
   inline inject-focus push — because deliverables is the one lane where that triage is already done.
3. **Ingest Enforced/Unenforced + Brain packs.** Once the deliverables pilot proves the
   claim-to-test mechanism, apply it to ingest's remaining sections and to the 48 brain packs.
   Extends Gate 7 (already mirrors `cadence_registry.yaml` against pipeline/workflow code) and
   Gate 5 (already mirrors packs against `catalog.mts`) respectively, rather than building new
   trigger logic. Packs is the largest lane — deliberately last, gets its own scoping pass once the
   pattern is proven twice, not a blind copy-paste.

Step 1 is **in scope for this spec's implementation plan** (it's mechanical and low-risk enough to
ship alongside the pilot). Step 3's ingest/packs Enforced/Unenforced triage is **out of scope** —
this spec covers the mechanism design, the deliverables pilot, and the ingest Key Details generation
in full; ingest/packs Enforced/Unenforced get their own short spec once the pilot is live.

## Testing / validation plan

- Unit tests for the new gate logic (ledger-parsing, orphan-claim detection, pass/fail wiring) —
  pure functions where possible, mirroring `classifyWorktree`'s pattern of a pure classifier +
  integration-only shelling.
- Unit tests for `inject-focus.mjs`'s new inline-print + cold-start-nudge logic — it already has
  `inject-focus.test.mjs`, extend it rather than starting a new file.
- Manual smoke: touch `price-reduced.ts`, confirm `inject-focus` prints its Enforced/Unenforced list
  inline; rename the test string it references, confirm the gate blocks the push with a clear orphan
  message; touch a recipe with no ledger, confirm the cold-start nudge fires.
- Unit tests for the ingest Key Details generation script — given a `source_scope` block, produces
  the expected Markdown; given a pipeline with no `source_scope`, produces the explicit TODO stub,
  never a silent omission. Integration smoke: run it against all 76 live entries, confirm 74 files
  render and 2 render as TODO stubs, confirm re-running is idempotent (no diff on a second run).

## Open risks

- **market-pulse's 8-row cap is an unconfirmed gap**, not a projected one — needs a direct test
  before its ledger can claim it as Enforced. Flagged, not silently assumed.
- **Ledger rot at the "Unenforced" tier is still possible** — nothing blocks a stale Unenforced
  claim from sitting untouched. The advisory commit-diff (§6) is the only signal; if it proves too
  weak in practice, revisit after the deliverables pilot has run for a few weeks.
- **Ingest/pack registry shapes differ enough** (YAML vs. two different TS registries) that the
  gate's ledger-discovery logic needs per-lane path conventions, not one generic walker — scoped
  explicitly out of this spec's implementation, called out above.
- **Key Details is researched-snapshot, not live-verified** (advisor round 2). `source_scope` is
  self-attested prose with an `as_of` date; the drift-gate only proves file↔registry consistency,
  never registry↔reality. Real fix — deriving the true unpulled ceiling from the source's live
  schema/catalog instead of researched prose — is separate future work, not this spec's scope.
  Every generated Key Details section must say "researched snapshot, not live" explicitly rather
  than imply a freshness guarantee it can't back.
- **`data_lake.source_totals`** (0 rows, 0 code references, unrelated `listing_lifecycle` table) is
  confirmed dead and should be dropped — genuinely out of scope for this spec, but worth its own
  cleanup check so the open `source_totals_migration_apply` check doesn't sit stale pointing at the
  wrong subsystem.
