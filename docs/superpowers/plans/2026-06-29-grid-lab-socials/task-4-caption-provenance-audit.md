## Task 4: Confirm (don't rebuild) caption provenance

**Goal:** A confirmation pass, not a build. REVIEW A5 found captions are ALREADY cited — `build-week.ts` runs the four-lane prompt, reuses `refreshStaleLakeContext`, and `webSources` ride back on `WeeklyCalendar`. This task PROVES that holds and adds a regression test so it can't silently rot. The moat: if a caption states a figure, it names a source; an invented number is the only hard block.

**Parallel-safe:** read + test only. No shell conflict.

**Files:**
- Read (audit): `lib/email/social-calendar/build-week.ts`, `app/api/email-lab/social-calendar/route.ts`, `lib/email/social-calendar/themes.ts`.
- Create: `lib/email/social-calendar/__tests__/provenance.test.ts` — the regression guard.

**Interfaces:**
- Consumes: `buildWeek` output `WeeklyCalendar` (`webSources`, per-post captions); the four-lane prompt constant in `build-week.ts`.
- Produces: a test asserting the no-invention contract + a one-paragraph audit note appended to this file's "Findings".

- [x] **Step 1** — Trace one path: route → `buildWeek` → per-post caption. Confirm every figure-bearing caption traces to (a) a lake value via `refreshStaleLakeContext`, (b) an upload, (c) a `webSources` entry, or (d) is gated `[Need: …]`. Record the exact prompt lines that enforce it.
- [x] **Step 2: Failing test** — ~~feed `buildWeek` a mocked lake context~~ **(corrected against actual code, RULE 0.5):** there is no Anthropic mock to mirror and no code-level scrub to test — captions are **prompt-enforced**. The deterministic guard is on the prompt contract itself: `socialPostSystem("", …)` (empty lake = "no value for a metric") still carries the four-lane block, the hard no-invention rule, and the `[Need: …]` gate.
- [x] **Step 3** — Test passes immediately → moat holds → **VERIFIED** (see Findings). No leak; no escalation.
- [x] **Step 4: Run** — `bun test lib/email/social-calendar/__tests__/provenance.test.ts` → **3 pass / 0 fail / 22 assertions**; full `social-calendar` suite **18 pass / 0 fail**.
- [x] **Step 5: Commit** — `test(social-calendar): regression guard for four-lane caption provenance`.

### Findings

**VERIFIED — captions are sourced, and the moat is PROMPT-enforced (not code-enforced).** Traced route → `buildWeek` → `buildSocialPost` → `socialPostSystem` (system prompt) → Haiku → `tryParseSocial` → `assembleDraft`. The model's `captionText` is passed through **verbatim**: `tryParseSocial` / `assembleDraft` / `buildVariants` never inject, strip, or validate a figure. The only thing between the model and a fabricated number is the four-lane block in `socialPostSystem` (`lib/email/social-calendar/build-week.ts`), which is present in the prompt regardless of whether lake data exists:

```
DATA SOURCING — four lanes, in order. NEVER leave a requested field empty because you "don't have the number":
1. LAKE DATA above — use verbatim (value · source · as-of).
2. User's uploaded doc or figure — if the user pasted a number, use it exactly.
3. Internet / publicly known figure — use it; note the source inline (e.g. "per Realtor.com").
4. Can't source it at all — write [Need: brief description of the exact figure] so the user can supply it.
ONLY block: an invented number with no real source. Build is NEVER blocked.
```

When `lakeContext` is empty, `dataBlock` collapses to `""` (no `REAL LAKE DATA` header is injected), so the "no value for a metric" case routes the model to lane-4 `[Need: …]` rather than invention — exactly Step 2's intent. The regression guard `lib/email/social-calendar/__tests__/provenance.test.ts` pins this for the empty-lake path, across the Task-3 `opts` layering, and for every day theme.

**One caveat (not a leak — by design):** this is weaker than `renderSocialImage`, which structurally OMITS a missing-stat block; captions rely on the instruction layer (README line 21 names the prompt as the mechanism). A future reader should not assume a post-parse, code-level scrub exists for captions. Adding one would be a new build, out of scope for this audit.
