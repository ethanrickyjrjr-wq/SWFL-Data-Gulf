# Refinery vocab + semantic ledger + constitution + source connectors

**Health: mostly-ok.** The semantic layer is in good shape: `bun refinery/tools/check-vocab-coverage.mts --all` passes clean (30 brains, every emitted metric resolves), no unregistered static `metric:` literals exist in pack source, the constitution/vocab test suite is green (60 pass / 0 fail), and the PostgREST-truncation defense (`selectAllPaged` + `minRows` floors) is consistently applied across the high-row source connectors. The real risks are *latent coupling* hazards that the gates do not cover: a **dual-inversion split** (Stage-2.5 reads `slug_index`, constitutions read `concept.raw_slugs` — the two can silently diverge), a **constitution registry trap** (two hard-coded import lists must be edited by hand when a new domain lands), a **cross-language/cross-repo enum coupling** for `signal_*` topics that can abort the nightly master rebuild, and **provenance drift** in the ledger (`source_brains` under-reports corridor-pulse).

---

## [HIGH] Dual slug-inversion: constitutions resolve `raw_slugs`, Stage 2.5 resolves `slug_index` — they can silently diverge

**Location:** `refinery/vocab/loader.mts:50-71` (`resolveConceptSlugs` reads `concept.raw_slugs`) vs `refinery/stages/2.5-normalize.mts:213-260` (`resolveSlug` reads `vocab.slug_index`). Live divergence example: `marketbeat_asking_rent_nnn`.

**Detail:** There are TWO independent inversions of the same vocab, keyed on two different fields:
- The Stage-2.5 orphan gate (and `check-vocab-coverage`) resolves a brain's emitted slug through `slug_index` (+ patterns + path-overload).
- A SKOS-aware constitution rule (`hospitality.mts:55,89` via `resolveConceptSlugs(["hosp_tdt_yoy_delta", ...])`) inverts by reading each concept's `raw_slugs[]` array and matching the resulting literal set against `BrainOutputMetric.metric`.

These must stay in sync but nothing enforces it. A scan found one already-divergent concept: `asking_rent_nnn_marketbeat_swfl → marketbeat_asking_rent_nnn` exists in `slug_index`, but `marketbeat_asking_rent_nnn.raw_slugs` is `[]` (it is pattern-only). Today that concept is not referenced by any constitution rule, so it is harmless — but it proves the failure mode is reachable: if a future constitution rule ever declares a concept whose real emission is registered ONLY in `slug_index` (or only via `raw_slug_patterns`, which `resolveConceptSlugs` ignores entirely), `resolveConceptSlugs` returns an empty/partial set and the override rule **silently never fires** with zero error. The `resolveConceptSlugs` doc comment claims the design "catches a rename at vocab-update time" — but it only catches an unknown *concept id*, never a concept whose `raw_slugs` drifted out of sync with what the pack actually emits or with `slug_index`.

**Fix:** Add a vocab-consistency assertion (extend `check-vocab-coverage` or add a dedicated lint) that fails if, for any concept, the union of `raw_slugs` ∪ pattern-expansions does not cover the same emission space `slug_index` maps to it — at minimum assert every `slug_index[s] = cid` has `s ∈ concepts[cid].raw_slugs` OR matches one of `cid`'s patterns. Better: make `resolveConceptSlugs` ALSO honor `raw_slug_patterns` (return a matcher, not just a literal Set) so constitution rules can't go dark on a pattern-only concept. Register the consistency check in the pre-push gate.

**Model:** opus — invariant-touching (two resolvers, the no-invention/constitution-fires guarantee), requires judgment on the right unified contract.

---

## [MEDIUM] Constitution registry trap: a new domain constitution must be hand-wired into TWO separate hard-coded import lists

**Location:** `refinery/constitution/index.mts:25-42` (REGISTRY) and `refinery/tools/semantic-ledger.mts:23-27,457-463` (imports + array). Also stale doc in `index.mts:19-21` and `types.mts:12-15`.

**Detail:** There is no single source of truth for "the set of constitutions." Adding a 6th domain constitution requires editing (1) `index.mts` REGISTRY, and (2) `semantic-ledger.mts`'s import block AND its `constitutions[]` array — with no compile-time link between them. Miss the ledger edit and the semantic ledger silently under-reports overrides (the operator's audit surface lies); the ledger's own footer at line 328 even hard-codes "real-estate, finance, hospitality" and omits macro/logistics. Separately, both `index.mts` (line 19-21) and `types.mts` (line 12-15) still carry stale "currently authored but un-called / call sites added in a later commit" comments — `loadConstitution` IS now wired into `master.mts:105`. That drift is exactly the kind the C1 audit rule warns about: a comment that says the opposite of the code.

**Fix:** Export a single `CONSTITUTIONS` array (or have the ledger import `REGISTRY` from `index.mts` and iterate `Object.values`) so there is ONE list. Update the ledger footer to derive domain names from that list instead of a hard-coded string. Delete the stale "un-called" comments in `index.mts` and `types.mts`.

**Model:** sonnet — mechanical refactor to a single export + comment cleanup, low ambiguity.

---

## [MEDIUM] `signal_*` topic enum is triple-coupled across two languages/repos with no cross-check — a 6th topic aborts the nightly master rebuild

**Location:** vocab `city_pulse_signal.raw_slug_patterns` (5 globs) ↔ `ingest/pipelines/city_pulse/distill.py:37-43` (`TTL_DAYS`/`VALID_TOPICS`) ↔ pack emission `refinery/packs/city-pulse-swfl.mts:170` (`signal_${s.topic}_${i+1}`). master consumes city-pulse (`master.mts:245,283`).

**Detail:** The pack emits `signal_<topic>_<n>` for whatever `topic` the row carries. The vocab registers exactly 5 closed patterns: `signal_{breaking,transactions,development,business,structural}_*`. I verified directly: `signal_breaking_1` resolves, but `signal_road_closure_2` and `signal_new_business_3` **orphan** (the `*` glob is single-segment, so any topic containing an underscore also orphans). Today the build is safe ONLY because the Python distiller enforces the same 5-value enum at write time (`distill.py:90` JSON-schema enum + `:118-120` skip-if-invalid). That is a real guard — but it is the ONLY thing standing between an LLM-distilled topic and a nightly-rebuild abort, and it lives in a different language with no automated parity check against the vocab. Add a 6th topic to the distiller (or let an underscore-containing topic slip the enum) and `signal_<new>_N` flows into master's claims → `[normalize] Orphan Concept error` → nightly aborts. This is the conditional-orphan-emitted-behind-data class CLAUDE.md flags as a recurring nightly breaker.

**Fix:** Pin the coupling: either (a) add a test that asserts the vocab's `signal_*` pattern set == the distiller's `VALID_TOPICS` (fixture-mirror the Python set into a JSON the TS test reads), or (b) replace the 5 closed globs with one `signal_**` pattern + a value-domain note (loses topic-specific provenance but kills the abort risk). Prefer (a) — keeps provenance, fails loud at test time instead of at 3am.

**Model:** opus — cross-repo/cross-language invariant; the right fix touches the brain-first/ship-contract guarantee and needs a judgment call between (a) and (b).

---

## [LOW] Semantic-ledger provenance drift: `city_pulse_signal.source_brains` omits corridor-pulse-swfl (which emits the same slug family)

**Location:** vocab concept `city_pulse_signal` (`source_brains: ["city-pulse-swfl"]`) vs `refinery/packs/corridor-pulse-swfl.mts:184` which emits `signal_${s.topic}_${i+1}` and resolves to the SAME concept.

**Detail:** `corridor-pulse-swfl` emits `signal_*` slugs that resolve (verified live) to `city_pulse_signal`, but that concept's `source_brains` lists only `city-pulse-swfl`. The semantic-ledger "What each brain emits" table (`semantic-ledger.mts:270-306`) inverts `source_brains`, so corridor-pulse-swfl's signal emissions are invisible in the operator's audit view — the ledger under-reports what the brain produces. It also means the data-quality "orphaned concept" / dangling-brain checks operate on incomplete provenance. (The concept id `city_pulse_signal` is itself now a misnomer since two brains share it.)

**Fix:** Add `corridor-pulse-swfl` to `city_pulse_signal.source_brains` (and consider renaming the concept to a neutral `pulse_signal` since it's shared). Re-run `bun refinery/tools/semantic-ledger.mts`.

**Model:** sonnet — one-line vocab edit + ledger regen; well-specified.

---

## [LOW] `master-source.mts` hard-codes `corpus_fact_count: 5` per sub-pack — a producer count change silently truncates or throws

**Location:** `refinery/sources/master-source.mts:88-94,120-126,155-165`.

**Detail:** The bespoke master-index aggregator slices the leading N SAVED FACTS as the "corpus summary," with N hard-coded to 5 per sub-pack (franchise-outcomes, cre-swfl). If a sub-pack's `corpusSummary` ever emits a different number of leading facts, this either silently drops facts (count too low) or throws "expected at least N" (count too high) — a coupling the file's own comment acknowledges. The connector comment says master will migrate to the generic `brain-input-source` "once the OUTPUT block has been in place across one TTL cycle"; that migration has not happened, so the legacy coupling persists for two sub-packs.

**Fix:** Finish the migration to `makeBrainInputSource` for the master index (the OUTPUT block has long been in place), or derive the corpus-fact count from a marker in the rendered file rather than a hard-coded literal. Low urgency — only 2 packs, both stable.

**Model:** sonnet — bounded, well-specified migration/derivation.

---

## [NIT] Dangling literal `slug_index` entry for a pattern-only concept

**Location:** vocab `slug_index["asking_rent_nnn_marketbeat_swfl"] → marketbeat_asking_rent_nnn`, whose `raw_slugs` is `[]` (pattern-only via `asking_rent_nnn_marketbeat_**`).

**Detail:** A single literal `slug_index` entry points at a concept that is otherwise pattern-only. Harmless to the resolver (literal hits take precedence over the pattern), but it is dead/redundant weight and a small inconsistency — the real emissions are `asking_rent_nnn_marketbeat_<place>` which the pattern already covers. It is also the exact shape that the dual-inversion HIGH finding warns about.

**Fix:** Remove the stray literal `slug_index` entry (the pattern covers the family), or add it to the concept's `raw_slugs` for consistency. Cosmetic.

**Model:** sonnet — trivial vocab edit.
