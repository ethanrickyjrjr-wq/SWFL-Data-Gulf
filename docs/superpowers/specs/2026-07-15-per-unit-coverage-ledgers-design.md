# Per-unit coverage ledgers (pipelines/brains/deliverable recipes)

**Date:** 2026-07-15

## CORRECTION LOG (read this first)

This spec was wrong twice in its first draft, both times because I verified the code instead of
the deployed/actual reality. Corrected in place, not silently — per this codebase's own precedent
(`docs/standards/deliverable-playbook.md` Part 8.5) a wrong claim that shipped stays visible, not
rewritten as if it was always right.

1. **I claimed `/ops/census` "isn't broken, just unread" without ever looking at it rendered.**
   First I misread a Next.js internal framework payload as a live 404 (wrong — that string is
   boilerplate present on every route). Then, once actually screenshotted (see §7.5), it turned out
   **not to be a thin, unread page at all** — it's an extremely rich, actively-researched system:
   76 pipelines, 71 with `confirmed_total` researched, 69 with `source_ceiling` researched,
   column-level gap detail, live-verified dates, crawl4ai-sourced vendor ceilings, and it already
   flags cross-pipeline duplication (`collier_parcels_parcel_subdivision_redundant_scrape`). I had
   proposed **generating a parallel, thinner copy of this per pipeline** (`ingest/pipelines/<name>/LEDGER.md`)
   and had already committed one for `fred_g17` before catching it. That file is deleted
   (`f672d8ef`). Ingest Key Details is **struck from this spec entirely** — the system already
   exists, is good, and the actual gap is that nothing pushes it into the workflow before new
   research starts (§8, corrected).
2. **I told the operator "only under-contract consumes community facts, the other six recipes
   don't" without checking `shared.ts`.** Wrong — the shared narrator (`authorListingNarrative`,
   `lib/deliverable/recipes/shared.ts:183`) already includes `facts.community` (the vendor
   listing-scrape kind) for all six recipes that call it; only `market-comps` excludes it by design.
   What's actually true and narrower: **zero recipes** use the newer `community-lookup.ts` resolver
   (parcel/tax-roll data, 604,362 rows) — confirmed by grep, it's referenced nowhere outside its own
   file and test. See the case study in §9.

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

**Ingest has NO Key Details section — struck (see CORRECTION LOG #1).** `/ops/census`
(`swfldatagulf-ops`, `app/census/page.tsx` + `lib/census.ts`, live at
`https://swfldatagulf-ops.vercel.app/census`) already renders exactly this — offered-upstream vs.
pulled vs. live-rows, per pipeline, generated from `cadence_registry.yaml`'s `source_scope` block —
and does it with more depth than this spec proposed (column-level gaps, not summary sentences; see
§7.5). Building a second, file-per-pipeline copy would be the exact "same information in two
places, nobody wrote it down once" failure this whole spec exists to prevent. Ingest pipelines get
**no ledger file** — the registry + census stays the one root, and §8 (corrected) covers how it
gets pushed into the workflow instead of duplicated.

Deliverable recipes and brain packs still get a ledger — but **two sections, not three**, since
neither has a census-equivalent scope-ceiling system to point at:

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
- **No block on "Unenforced" entries growing or shrinking** — that list is honest reporting, not a
  violation. A ledger is allowed to say "we don't protect this yet."
- Fires only on push touching a ledger file or the unit's own source (mirrors how Gate 5/7 scope
  their triggers) — never a full-repo sweep.

This is the ADR "fitness function" idea made concrete: the ledger's claims are load-bearing because
breaking them breaks the push, not because someone reads the file.

### 5. `inject-focus.mjs` — push the content inline, not a path to go read

`inject-focus.mjs` already injects "Area conventions load by location" for the 5 area `CLAUDE.md`
files. Extend it with two independent triggers (corrected 07/15/2026 — these are two different
mechanisms now, not one, since ingest has no ledger file — see CORRECTION LOG #1):

- **Deliverable recipe / pack ledgers:** touched file matches a unit with a ledger → print its
  **Enforced summary + full Unenforced list inline** — not a pointer to go open the file.
- **Ingest pipelines:** touched file matches a registered pipeline → print that pipeline's
  `source_scope` PULLED/AVAILABLE rows (the same data `/ops/census` renders) inline, pulled straight
  from `cadence_registry.yaml` — no ledger file, no generation step, §8.

A path is still pull; the content itself is push. This is the direct fix for "I keep finding out
what we could have got after checking and rechecking" — the source ceiling shows up automatically
the moment anyone touches that pipeline again, not only when someone thinks to go look it up.

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

### 7.5 Why doesn't `/ops/census` already do this? (verified live, by screenshot — not code-read)

The operator named `/ops/census` directly as "supposed to" solve this and reported 3 failed
attempts to build it. First pass (wrong, see CORRECTION LOG #1): read `census.ts`'s source, saw it
parses `source_scope`, concluded "it works." That's a code-read, not a verification — this
codebase's own memory (`feedback_code-fix-is-not-live-until-brain-rebuilds`,
`feedback_verify-built-with-claims-at-artifact-level`) exists specifically to ban that shortcut, and
it was made anyway.

**Actually screenshotted the live page 07/15/2026** (`https://swfldatagulf-ops.vercel.app/census`,
Chrome extension, after an initial permission block and one false "confirmed 404" — that string was
a Next.js internal framework payload, not a real error, corrected in the same investigation before
it was reported). What's actually there: *"76 pipelines tracked (73 active, 3 parked) · 71/76
confirmed-total researched · 69/76 source-ceiling researched · 0/76 vendor-benchmark applicable."*
Every pipeline has a PULLED row and an AVAILABLE row with real, dated, cited, often
crawl4ai-verified detail down to the column level — e.g. Lee Permits: *"Lee County's own ArcGIS org
has 9,386 unincorporated-Lee permits, 719 commercial permits, 2,192 Cape Coral residential permits,
a 93,976-row code-enforcement layer, two manufactured-home layers, a subdivisions/plats layer, a
ZoningCases layer — none ingested."* It already self-flags cross-pipeline duplication:
`Collier Parcels` and `Parcel Subdivision` both cite the open check
`collier_parcels_parcel_subdivision_redundant_scrape` for hitting the identical FDOR layer.

The `data_lake.source_totals` open check ("writing 0 rows") looked like a plausible cause and was
ruled out directly: it's a different, dead table (zero rows, zero code references, belongs to an
unrelated `listing_lifecycle` reconciliation attempt) — not the census page's actual data path
(`rowCounts()` queries tier-2 tables directly).

**So the mechanism is not just "not broken" — it's excellent, and the "3 failed attempts" the
operator remembers are real (9 commits on the census page, 2 explicitly titled "fix... actually
render this time") but predate its current state.** The actual, now-confirmed cause of "we keep
rediscovering what we already have" is exactly the push-vs-pull diagnosis, nothing more exotic: the
data is correct, thorough, and current, at a URL nothing forces anyone to visit before starting new
research. §8 (corrected) is the fix — push what exists, don't rebuild it.

### 8. The ops page — push it into the workflow, do not touch it otherwise

**Corrected 07/15/2026 — this section originally recommended retiring `/ops/census`'s browse
framing. That was backwards, built on the wrong diagnosis in the first draft of §7.5, and is struck.**
The page is not thin, not stale, and not a candidate for the SRE "delete an unread signal" line —
it's actively researched (dated citations through 07/15/2026, live crawl4ai probes) and richer than
anything this spec proposed building. Deleting or de-emphasizing it would destroy real, current work.

The fix is exactly the `inject-focus` mechanism (§5), pointed at the EXISTING page's data instead of
a new file: when a session touches an ingest pipeline, or before any new source research begins,
`inject-focus` (or a dedicated pre-research check) pulls that pipeline's PULLED/AVAILABLE rows from
`/ops/census`'s underlying data (`cadence_registry.yaml` `source_scope`, same source the page
already reads — no new data path) and prints them inline. That is the entire fix for this lane: a
push wire into something that already exists and is already good. No new file, no generation
script, no drift gate — there is nothing to drift against because nothing new is being generated.

## Rollout order

**Corrected 07/15/2026** — the original step 1 ("generate ingest Key Details files") is struck; see
CORRECTION LOG #1. Two things ship instead, in this order:

1. **Push `/ops/census` into the workflow — first, fast, no new files.** Wire `inject-focus` (§5) to
   pull the touched pipeline's existing PULLED/AVAILABLE rows (same `cadence_registry.yaml`
   `source_scope` data the census page already renders) and print them inline the moment a session
   touches that pipeline, or before new source research starts. This is the actual fix for the
   operator's live complaint, and it's smaller than the original plan — no generation script, no new
   file format, no drift gate, because nothing new is being created.
2. **Deliverables (Enforced/Unenforced pilot).** 12 recipes, 9 already-enforced landmines to
   cross-reference (mechanical), 1 confirmed gap to close (market-pulse row cap), 2
   irreducible-prose entries, playbook migration, gate + inject-focus wiring. This is where the real
   mechanism design gets proven — the claim-to-test cross-referencing, the orphan-claim gate, the
   inline inject-focus push — because deliverables is the one lane where that triage is already done.
   **The community-stats-deliverable-wiring work (§9) is a live candidate first real ledger entry**
   for `under-contract`/the six shared-narrator recipes once it ships.
3. **Brain packs.** 48 packs, extends Gate 5 (already mirrors packs against `catalog.mts`).
   Deliberately last — gets its own scoping pass once the pattern is proven on deliverables, not a
   blind copy-paste. (Ingest's Enforced/Unenforced tier, if it turns out to be wanted at all beyond
   step 1's Key Details push, is a separate future scoping question — not assumed here.)

Step 1 and step 2 are **in scope for this spec's implementation plan**. Step 3 (packs) is **out of
scope** — its own short spec once the deliverables pilot is live.

## Testing / validation plan

- Unit tests for the new gate logic (ledger-parsing, orphan-claim detection, pass/fail wiring) —
  pure functions where possible, mirroring `classifyWorktree`'s pattern of a pure classifier +
  integration-only shelling.
- Unit tests for `inject-focus.mjs`'s new inline-print + cold-start-nudge logic — it already has
  `inject-focus.test.mjs`, extend it rather than starting a new file.
- Manual smoke: touch `price-reduced.ts`, confirm `inject-focus` prints its Enforced/Unenforced list
  inline; rename the test string it references, confirm the gate blocks the push with a clear orphan
  message; touch a recipe with no ledger, confirm the cold-start nudge fires.
- Unit tests for the `inject-focus` census-push logic (§8): given a touched ingest pipeline path,
  pulls the right `source_scope` block and formats it inline; given a pipeline with no `source_scope`
  (2 of 76 today), prints an explicit "not yet researched" line, never a silent omission.

## 9. Case study — the exact failure this spec exists to prevent, found live, same session

While writing this spec, the operator asked why `parcel_subdivision_orphaned_no_readers` was closed
07/15/2026. Traced through `SESSION_LOG.md` and the actual code: it closed because
`lib/listings/community-lookup.ts` was built and unit-tested that day — a real resolver, 9/9 tests,
matching a street address to `data_lake.parcel_subdivision`'s 604,362 rows and pulling neighborhood
stats. **But nothing outside its own file and its own test imports it** (confirmed by grep across
the repo) — the check's own name, "orphaned, no readers," is still literally true in production.

There is already a same-day, thorough, ready-to-execute fix for this:
`docs/superpowers/specs/2026-07-15-community-stats-deliverable-wiring-design.md` +
`docs/superpowers/plans/2026-07-15-community-stats-deliverable-wiring.md` (1,168 lines, full
task-by-task plan, not started as of this writing — verified live by grep, `communityStats`/
`neighborhoodStatsSourceLine` exist nowhere in `lib/`). It correctly separates two different
"community" concepts that were getting conflated in conversation — the older vendor-scrape
`facts.community` (already wired into 6 of 7 recipes via the shared narrator) and the new
tax-roll-based `communityStats` (wired into none) — and specs the join-key lockstep bug an advisor
pass already caught (the alias reconciler and the resolver must agree on canonical-vs-raw
subdivision names or matches silently miss).

**This is the exact "built twice, wired to nothing, and the check ledger doesn't say so precisely
enough to catch it" pattern this whole spec is about — found live, in this session, independent of
the spec's own design work.** Once the Enforced/Unenforced pilot (§3) ships, the
community-stats-deliverable-wiring plan is a strong first real ledger entry for the six
shared-narrator recipes: "community facts are Enforced via the shared narrator's existing wiring;
neighborhood tax-roll stats are Unenforced — resolver built, zero recipes call it" is precisely the
shape §2 describes, and would have made this exact gap visible without an operator having to ask
"why was this closed?" and a session having to re-derive the answer from git history.

**Open, unresolved as of this writing — do not silently pick one:** the check
`community_facts_remaining_recipes` currently reads "only under-contract consumes them," which
contradicts a direct grep of `shared.ts` showing all six non-`market-comps` recipes call the shared
narrator with `facts.community` already wired in. The community-stats-deliverable-wiring spec's own
§4 already flags this check as needing "verify against current code... close or correct during
implementation" — that verification did not happen as part of writing THIS spec, and shouldn't be
guessed at a third time in one session. Whoever implements that plan resolves it for real, once,
with a passing test — not with another prose read of the code.

## Open risks

- **market-pulse's 8-row cap is an unconfirmed gap**, not a projected one — needs a direct test
  before its ledger can claim it as Enforced. Flagged, not silently assumed.
- **Ledger rot at the "Unenforced" tier is still possible** — nothing blocks a stale Unenforced
  claim from sitting untouched. The advisory commit-diff (§6) is the only signal; if it proves too
  weak in practice, revisit after the deliverables pilot has run for a few weeks.
- **`cadence_registry.yaml`'s `source_scope` is researched-snapshot, not live-verified.** This was
  already true of `/ops/census` before this spec existed — `confirmed_total`/`source_ceiling` are
  researched prose with an `as_of` date, not a live query against the source. Pushing it via
  `inject-focus` (§8) doesn't change that; it's the existing, accepted honesty limit of the system
  this spec now points at instead of duplicating.
- **`data_lake.source_totals`** (0 rows, 0 code references, unrelated `listing_lifecycle` table) is
  confirmed dead and should be dropped — genuinely out of scope for this spec, but worth its own
  cleanup check so the open `source_totals_migration_apply` check doesn't sit stale pointing at the
  wrong subsystem.
- **The `community_facts_remaining_recipes` check text vs. code discrepancy (§9) is unresolved.**
  Flagged for whoever implements the community-stats-deliverable-wiring plan, not decided here.
