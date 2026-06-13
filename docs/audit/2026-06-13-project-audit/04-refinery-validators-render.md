# Lane 04 — Refinery validators + render/speaker + rules-of-engagement

**Health: mostly-ok.** The write-gate is genuinely structural: all four CLAUDE.md gate-lints (`spec-validator`, `facts-only-lint`, `inference-bait-lint`, `smoothing-lint`) plus `grain-guard-lint` and the live-fixture-leak check run in `refinery/stages/4-output.mts` (lines 543–584) and a single failure throws before `writeFile`, leaving the prior `.md` intact. The speaker/`DisplayBrain` chokepoint is well-built and type-guarded against slug/tier/brain-id leaks (`display-leak.test.mts`). The real soft spots are (a) the lean `RULES_OF_ENGAGEMENT` block does NOT actually reach the model on the primary MCP host (claude.ai drops `_meta`), so the binding contract is the separate, hand-maintained `RESPONSE_CONTRACT` string that omits several rule-5/rule-7 guards; (b) the smoothing figure-qualifier carve-out can let a brain soften its OWN deterministic number; and (c) `facts-only-lint`'s `\byour\b` / imperative scan runs over the whole OUTPUT JSON, a latent build-breaker for any future user-facing route/conclusion prose.

---

## [HIGH] The lean rules block never reaches the model on the primary host; the real contract is a divergent hand-maintained string

**Location:** `app/api/mcp/server.ts:86–116` (`RESPONSE_CONTRACT`), `:278–342` (`_meta.rules`); `refinery/lib/rules-of-engagement.mts`

**Detail:** `RULES_OF_ENGAGEMENT` is shipped in `_meta.rules` on every MCP response and `?format=json` on `/api/b`. But the code's own comment (server.ts:90–97) documents that claude.ai's connector does NOT inject tool-result `_meta` into the model context — only `content` text. So on the flagship surface the lean block is dead weight; the contract that actually binds is `RESPONSE_CONTRACT`, prepended to text. That string is a SEPARATE, independently-authored copy of the reply rules and it is NOT covered by the four-mirror drift test (`rules-of-engagement.test.mts` guards consumption-contract.md / THE-CONTRACT.md / CLAUDE.md, not RESPONSE_CONTRACT). Concretely, RESPONSE_CONTRACT drops: the `[INFERENCE]` tag requirement (rule 2 / SWFL protocol rule 7 — it says "marked as estimates (~, roughly, could)" instead), the rule-5 NNN/`triple-net` jargon + place-name-misread guard, and the rule-7 "never invent a SWFL number below ZIP" guard. So the one channel that reaches the model carries a looser, drift-prone contract than the one that is tested. This is the exact failure class the four-copy drift test was built to kill, reintroduced one layer down.

**Fix:** Either (1) derive RESPONSE_CONTRACT's invariant clauses from shared constants and add it to the drift-guard test set, or (2) explicitly document RESPONSE_CONTRACT as the binding surface and fold the missing rule-2/5/7 guards (`[INFERENCE]` tag, NNN meaning, no-invention-below-ZIP) into it. At minimum add a test asserting RESPONSE_CONTRACT contains the `[INFERENCE]` literal and a below-ZIP no-invention clause.

**Model:** opus — cross-cutting contract-integrity question spanning two payload channels and an invariant the whole no-invention guarantee rests on.

---

## [MEDIUM] Smoothing figure-qualifier carve-out lets a brain soften its OWN deterministic number

**Location:** `refinery/validate/smoothing-lint.mts:81–95` (`FIGURE_QUALIFIER_TOKENS`, `qualifiesAFigure`)

**Detail:** `approximately` / `roughly` are exempted whenever the token is immediately followed by a numeric quantity ("approximately $6.2 million"). The justification (and the test at smoothing-lint.test.mts:60–75) is "a reporter quoting a source's approximate figure is faithful." But the lint cannot distinguish a source-quoted approximate figure from the brain softening a number Stage 4 computed deterministically. SWFL data-protocol rule 8 / CLAUDE.md is explicit: "quantify projections numerically, don't re-encode deterministic numbers into vague English." A pack's `conclusion` or a non-quoted `caveat` that says "approximately $6,231,400 in modeled annual loss" — a number the engine computed exactly — sails through. The `isQuotedSourceLine` exemption already handles the legitimate faithful-source case (citation/cited_text fields + the `local context [...]:` caveat prefix), so the additional blanket figure-qualifier exemption over ALL prose is broader than the stated need and pokes a hole in the no-smoothing invariant for the platform's own numbers.

**Fix:** Scope the figure-qualifier exemption to lines that are already source-quoted (i.e. fold it into / gate it behind `isQuotedSourceLine`), or restrict it to `key_metrics[*].citation`-bearing lines. Engine-synthesized `conclusion`/`caveats` prose should not be allowed to prepend "approximately" to a deterministic figure.

**Model:** opus — touches a non-negotiable invariant (deterministic math, no smoothing) and requires judgment on the faithful-source vs. self-softening boundary.

---

## [MEDIUM] `facts-only-lint` scans the OUTPUT JSON for `\byour\b` / imperatives — a latent build-breaker for user-facing route/conclusion prose

**Location:** `refinery/validate/facts-only-lint.mts:22–41, 70–87`; consumed over the full reference fence in `4-output.mts:544`

**Detail:** The lint scans every line inside the ```reference fence, which includes the `--- OUTPUT ---` BrainOutput JSON (conclusion, caveats, `grain_boundary.not_available`, `grain_boundary.routes`, `conditional_claims`). The pattern set includes `\byour\b` (any "your"), `\byou (must|should|...|are|can|may)\b`, and an imperative-line-start rule (`^(always|never|do not|...)`). Today's packs happen not to trip it, but `grain_boundary.routes` is rendered to the user verbatim as "**You can also ask:**" invitations and the natural authoring of such an invitation ("Ask about your ZIP", "you can also pull the per-ZIP read") would abort the entire Stage-4 write with a `facts-only` violation — and the previous brain `.md` is left stale with no obvious cause. The exemptions (`isQuotedSourceLine`) only cover citation/cited_text and the `local context [...]:` prefix, not route/conclusion prose. This is a sharp edge: the linter polices the brain's synthesized instruction-shaped text, but the OUTPUT block now legitimately carries user-directed invitation prose that is allowed to address the reader.

**Fix:** Either narrow the facts-only scan to exclude the user-facing OUTPUT fields that are designed to address the reader (`grain_boundary.routes`, and arguably `conclusion`), or document the constraint loudly in the pack-authoring guide and add a guard test so a "your"/imperative in a route string fails fast in a pack unit test rather than silently at nightly rebuild. Preferred: scan only the SAVED-FACTS + preferences regions for second-person directives, not the OUTPUT JSON.

**Model:** opus — requires deciding which OUTPUT fields are "brain instruction surface" vs. "user-facing copy," an invariant-shaping call.

---

## [LOW] `grain-guard-lint.finest_grain` regex forbids multi-word units like "named-place-month"

**Location:** `refinery/validate/grain-guard-lint.mts:33` (`FINEST_GRAIN_RE = /^[a-z]+-[a-z]+$/`)

**Detail:** The finest-grain shape is locked to exactly `<unit>-<period>` with single hyphens and lowercase. The product's whole pitch is ZIP / named-place grain ("Fort Myers Beach = 33931"), yet a `finest_grain` of `zip-month`, `place-month`, or `parcel-month` passes while anything needing two tokens on either side (`named-place-month`, `census-tract-month`) hard-fails the gate and aborts master's write. The test (grain-guard-lint.test.mts:32–44) even asserts `county-month-day` must fail. This is fine as long as master only ever emits single-token grains, but it is an unstated coupling: a future grain refinement to "census-tract" or "named-place" silently can't be expressed and will abort the build with a cryptic format error.

**Fix:** Allow `[a-z]+(?:-[a-z]+)*-[a-z]+` (multi-token unit + single period), or document that grain units must be single-token and reserve a canonical token (`tract`, `place`, `zip`) for each finer grain. Add a positive test for `zip-month` / `place-month` so the intended grains are pinned.

**Model:** sonnet — well-specified regex/enum change with a clear shape; low ambiguity once the allowed grain vocabulary is chosen.

---

## [LOW] Citation-table parse is whitespace/pipe-fragile — a `|` in a source string desyncs the spec-validator

**Location:** `refinery/render/citation-table.mts:9–25` (renderer) vs. `refinery/validate/spec-validator.mts:160–180` (parser)

**Detail:** The renderer space-pads cells and joins with ` | `; the validator splits each row on `|` and trims, then requires exactly 4 columns. If any source citation string contains a literal `|` (entirely plausible in a scraped source title or a "A | B" publisher string), the row splits into 5+ columns and the spec-validator throws "row needs 4 columns," aborting the write — or worse, in a non-validated read path, the citation id resolution silently shifts. There is no escaping or delimiter-collision guard on the `source` field anywhere between `citationMeta()` and the rendered table.

**Fix:** Sanitize/replace `|` in the `source` field at render time (e.g. swap to `/` or U+2502), or switch the citation table to a JSON block like SAVED FACTS / OUTPUT so the delimiter is structural rather than positional.

**Model:** sonnet — localized, well-specified sanitization at one render boundary.

---

## [LOW] `scrubCaveatTechnical` is the only scrub on the one ungated prose channel (caveats); its regex stack is brittle and order-dependent

**Location:** `refinery/render/speaker.mts:301–338` (`scrubCaveatTechnical`)

**Detail:** Caveats are explicitly called out (speaker.mts:292–300) as "the only ungated prose channel" — the facts-only/smoothing linters guard the reference fence, but `caveats` carry arbitrary pack/source text to the customer. The scrub is a hand-tuned cascade of ~8 regexes whose correctness depends on ordering (the schema-qualified-identifier rule must run before the generic `[config]` underscore rule; the comment at :308–313 admits `data_lake.permits` would leak the table half if the order were wrong) and on negative assumptions about domain acronyms (SOFR/NFIP/FEMA must have "no underscore, no slash-path, no 7+ hex run"). This works today but is a fragile single point of customer-facing leak protection with no fuzz/property test asserting "no `data_lake.*`, no `refinery/`, no commit hash, no `T[1-4]` survives" across a corpus of real caveats. A new pack emitting `data_lake.new_table_2026` (digits + underscore) or an all-lowercase 7-char hex-looking word would test the seams.

**Fix:** Add a property/corpus test that runs every shipped pack's real caveats through `scrubCaveatTechnical` and asserts none of the banned token shapes survive; consider consolidating the scrub onto the same allowlist-vetted path the `DisplayBrain` type-guard uses so it is harder to bypass.

**Model:** opus — security-adjacent leak surface with subtle ordering invariants and false-negative risk; worth high-judgment review.

---

## [LOW] Corridor-character speculative carve-out is correctly inverted, but its disclaimer survival through `sanitizeProse` is unverified at the customer boundary

**Location:** `refinery/validate/speculative-block-lint.mts:36,295` (`SPECULATIVE_DISCLAIMER`); `refinery/render/speaker.mts:200–230` (`sanitizeProse` strips `[internal-N]`/`[web-N]`)

**Detail:** The speculative-block lint requires the verbatim trailing disclaimer "Speculative — based partly on inferred data. Double-check." and requires hedging around inferred numbers — the intended inversion of the smoothing ban (CLAUDE.md rule 8 carve-out), correctly implemented. But corridor-character prose carries `[internal-N]`/`[web-N]` anchors that `sanitizeProse` strips for display, and the facts block is REQUIRED by the lint to contain at least one such anchor. The lint validates the block at synthesis time; nothing in the audited render path re-asserts that the load-bearing disclaimer string survives intact when the speculative block is shown to a customer (the only consumers found are `app/r/cre-swfl/[corridor]/page.tsx` and the embed chart page, not the speaker). If a future display path runs the speculative block through `sanitizeProse` or a truncation, the "Speculative — double-check" signal — the single visual cue that the prose is interpolation — could be silently dropped while the hedged numbers remain.

**Fix:** Add a render-boundary assertion/test that the speculative block reaches the customer with the disclaimer intact (or that any sanitizer applied to it preserves the verbatim `SPECULATIVE_DISCLAIMER`), mirroring how the freshness token is pinned in `speak`.

**Model:** sonnet — a focused guard test at a known boundary; the design is already settled.

---

## [NIT] `defaultOutputProducer` emits a placeholder `source.url = "pack:<id>"` that is not a real citation URL

**Location:** `refinery/stages/4-output.mts:279–315` (`defaultOutputProducer`)

**Detail:** A pack with no custom `outputProducer` gets metrics whose `source.url` is `pack:<id>` and a citation "Default-producer metric synthesized from fact ...". This passes the spec-validator (it only checks `url` is a non-empty string) and would render on a customer surface as a source label / `sourceUrl` with a non-navigable `pack:` scheme. CLAUDE.md rule 3 (data provenance) wants every data point to carry a source citation URL. Today this is latent because production packs ship real producers, but the default is a provenance hole if any new brain ships on the default lift.

**Fix:** Either reject `pack:`-scheme source URLs in the spec-validator (force every shipped metric to a real URL) or have the default producer omit metrics entirely rather than synthesize placeholder provenance.

**Model:** sonnet — a small validator/producer tightening with a clear rule.
