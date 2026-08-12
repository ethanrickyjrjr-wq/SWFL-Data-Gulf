# PLAN — Package 4: give the live open-house narrator the guard it never had

**Written 08/12/2026. PLAN ONLY — no source edits in this session.** Package 4 of
`docs/handoff/2026-08-12-open-house-build-plan-parallel-sonnet-assignments.md`. Source of WHY:
`docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md` §1a/§1b/§1g (settled,
cited not re-derived). Research backing: `_RESEARCH/agent-behavior/2026-08-12-validator-in-the-loop-generation.md`,
`_RESEARCH/agent-behavior/2026-08-12-build-time-ai-grounding-outlines-critic-context-caching.md`,
`_RESEARCH/email-and-social/2026-08-12-open-house-invitation-craft.md`.

## ⚠️ SHARED-AUTHORITY EDIT FLAGGED UP FRONT — `lib/narratives/validate.ts` cannot literally reuse `validateNarrative()`

The package doc says "reuse `validateNarrative()`, never write a second validator." Probed the real
signature (`lib/narratives/validate.ts:85`):

```ts
export function validateNarrative(data: NarrativeSectionsData, inputs: BakeInputs): string[]
```

`NarrativeSectionsData` (`lib/narratives/types.ts:17-22`) is:

```ts
export interface NarrativeSectionsData {
  narration: string;
  outlook: OutlookItem[];   // 1–3 hedged [INFERENCE] items — MANDATORY, not optional
}
```

`validateNarrative()` unconditionally checks `outlook.length < 1 || outlook.length > 3`
(`validate.ts:109-111`) and, for each item, an `[INFERENCE]` tag, a hedge-word regex, a numeric
`base`, and a ≥20-char `falsifier` (`validate.ts:112-127`). An open-house invitation has **no
outlook concept at all** — it is two sentences, greeting + ask, nothing speculative. Calling
`validateNarrative(data, inputs)` with `outlook: []` does not skip the outlook check, it **fails
it every time** (`outlook: 0 items outside 1–3`). There is no way to satisfy this contract honestly
for an invitation without inventing a fake speculative item, which would be worse than not reusing
the function at all.

**Length is also wired wrong for this surface.** `lengthProfile(inputs.surface)`
(`lib/narratives/length.ts:38-40`) returns the EMAIL profile (300–900 **characters**, ≈50–125
**words**) only when `surface === "area-email"`; anything else — including a hypothetical
`"open-house-invitation"` surface — silently falls through to the REPORT profile (300–2000 chars,
`length.ts:23-27`), which is roughly 6× too loose for a 15–35-word invitation. `BakeInputs` also
requires a `facts: BakeFact[]` array (`label`/`display`/`sub`/`why`/`source` per item, `types.ts:41-47`)
that has no natural mapping from `ListingFacts`.

**Recommendation (this plan proceeds on this basis, flagged for operator/reviewer sign-off):** add
ONE new, small, exported sibling function to `lib/narratives/validate.ts` —
`validateInvitationCopy(text: string, opts: { minWords: number; maxWords: number }): string[]` —
living beside `validateNarrative()` in the same file, same contract shape (pure, deterministic,
returns `[]` when clean or a list of violated-rule strings), so **all narrative-shape validation
logic in the app still lives in exactly one file** (one authority for the CONCEPT, even though the
two functions check different shapes). This is additive only:

- `validateNarrative()`'s signature, body, and behavior are untouched.
- Its one direct caller in the whole repo, `scripts/bake-narratives.mts:130`, is unaffected —
  confirmed by grep (`grep -rn "validateNarrative" lib scripts`): every OTHER hit is a test file
  (`lib/narratives/narratives.test.ts`, `validate-scale.test.ts`, `area-email-inputs.test.ts`) or
  the one caller above. Nothing else calls it, so nothing else can regress.
- The word count itself is **not** reimplemented — it reuses `bodyWordCount()`
  (`lib/deliverable/language.ts:121-123`), which already exists, is already the codebase's word-count
  authority for "the email word floor" (its own docstring cites `emails.md §0.1`), and is already
  used the same way (word-count-only, no char proxy) by two sibling recipes — see next section.

If this reading of "reuse" is rejected, the fallback plan is: put `validateInvitationCopy` as a
local, unexported function inside `lib/deliverable/recipes/shared.ts` instead, and drop the
`validate.ts` edit entirely. Either way the shape of the guard (deterministic, pure, returns
violated-rule strings) is identical — only its file address changes. Flagging this choice now so a
reviewer picks one before code is written, per the assignment's instruction to flag loudly.

**Tiebreaker, stated rather than left a coin flip (advisor review):** putting the function in
`validate.ts` creates a NEW `lib/narratives/` → `lib/deliverable/` import edge (`validate.ts`
importing `bodyWordCount` from `lib/deliverable/language.ts`), the OPPOSITE direction from the one
existing edge between these two areas (`lib/deliverable/recipes/review-reply.ts` → `lib/narratives`).
Confirmed cycle-free (`language.ts` has zero imports of its own), but it is still a new
bidirectional package dependency between two areas that previously only depended on each other one
way. The `shared.ts`-local option creates NO new cross-package edge at all, and keeps every edit
inside the two files the assignment actually scoped (`shared.ts`, `render-open-house.mts`) — zero
shared-authority-file edit needed. **On balance this tiebreaker favors the shared.ts-local option**;
the `validate.ts` sibling-export option is presented above because it was the more literal reading
of "reuse," not because it wins on architecture. Recommend the operator confirm shared.ts-local
unless there's a reason (not found in this probe) to want narrative-shape checks centralized badly
enough to accept the new edge.

---

## 1. Current state, verified

### 1a. The invitation branch has NO length/ask guard today — only the invention gate

`lib/deliverable/recipes/shared.ts`, `authorListingNarrative()` (lines 404–839), the `opts.invitation`
branch (lines 580–617). The load-bearing instruction, quoted verbatim, line 602:

```
`ONE OR TWO SENTENCES. Roughly 15-35 words. A warm greeting, AT MOST ONE feature, ` +
```

Nothing after generation checks this. The function's tail (lines 733–838) runs, in order, on
**every** caller regardless of `opts.invitation`:

1. The Sonnet call (`getAnthropic("email_build").messages.create`, lines 734–740, `max_tokens: 500`).
2. Scaffolding-leak strip — sentence-level, delete-only (lines 758–778): strips first-person leaks
   and prompt-language leaks (`"is absent"`, `"fact line"`, etc.).
3. Cost-talk / negativity strip — sentence-level, delete-only (lines 789–803): drops any sentence
   containing HOA/dues/monthly-fee language or a concessive ("even though", "although", "despite").
4. **The claim gate** — `auditClaims(t, settled)` (lines 820–828): the ONLY hard fail-closed check
   today. Any numeral or claim not anchored in the settled fact lines → the WHOLE paragraph is
   dropped, function returns `null` (open slot, not an email that "looks a little off").

**None of steps 1–4 count words. None check for a call-to-action.** This is exactly what
`docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md` §1a documents (two live
generations off the same house, one closing "you really have to see it in person," one closing "is
something else" with no ask at all) — reproducible by inspection: nothing in the code path could
have caught either output.

### 1b. `validateNarrative()`'s actual shape — see the flagged section above

Signature, return type, and the outlook/length blockers are documented above; not repeated here.

### 1c. A **weaker**, already-shipped precedent for word-count exists — but it isn't wired to open-house

`bodyWordCount(text: string): number` (`lib/deliverable/language.ts:121-123`):

```ts
export function bodyWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
```

Its own docstring: *"The floor was previously enforced NOWHERE in the build path (verified
08/09/2026); the builders log through this, loudly, and never pad."* Two callers today, **neither
is open-house**:

- `lib/deliverable/recipes/price-reduced.ts:660-665` — `if (paragraph && bodyWordCount(paragraph) < 50) console.error(...)`. Floor only, no ceiling, **log-only, never blocks, never retries.**
- `lib/deliverable/recipes/just-sold.ts:723-726` — same pattern.

This is real, relevant precedent (reuse the counting primitive) but it is NOT the guard this
package builds — it has no ceiling, no ask-check, no retry, and it operates on the RECIPE's
assembled paragraph (bank sentences + narrative concatenated), not inside `authorListingNarrative`
itself. Package 4 is building something stronger and putting it at the shared-narrator layer,
scoped to `opts.invitation === true` only.

### 1d. `authorListingNarrative` has 7 live callers — the new guard must be invisible to 6 of them

Grep confirms exactly one call site passes `invitation: true`:
`lib/deliverable/recipes/open-house.ts:258`. Every other recipe on this shared narrator —
`new-listing.ts`, `price-reduced.ts`, `back-on-market.ts`, `under-contract.ts`, `coming-soon.ts`,
`market-comps.ts` (via its own `buildNarratorPrompt`, a sibling, not this function) — never sets
`opts.invitation`. **Hard constraint on the design below: the new validate→retry→fallback loop
lives strictly inside an `if (opts.invitation)` branch of the tail logic, so the other 6 recipes'
behavior, tests, and token cost are provably unchanged** (RULE 3/C2 — extend, don't grow a second
gate that could leak scope).

*(Hosted graphify `gx_callers`/`gx_impact` was attempted first per RULE 0.5 —
`ToolSearch("select:mcp__graphify__gx_callers,...")` returned no matching deferred tools this
session, so this was verified by grep instead, per RULE 0.5's stated fallback. Flagging the tool
miss rather than silently skipping the check.)*

---

## 2. The word-count conflict — both citations, not resolved here

- **15–35 words**, `lib/deliverable/recipes/shared.ts:602`. Traces to two real caught failures
  (`shared.ts:444-448`, `:590-596`): a negotiating-leverage invite ("room to have a conversation
  about terms... the $1,229 monthly HOA is worth factoring into carrying costs") and a
  GIS-printout invite ("a golf-course-and-restaurant-count sentence... No one says a fucking golf
  course .57 miles away!!!!"). Sourced from crawled real invite scripts (theclose.com,
  maestrolabs.com, digitaldreamhomes.com — `shared.ts:441-442, 582-583`).
- **50–125 words**, `docs/standards/email-build-playbook.md:397` ("BODY: 50–125 words of the
  AGENT'S OWN copy. Every length in that band returned a response rate above 50%") and encoded
  numerically at `lib/narratives/length.ts:29-36` (`EMAIL` profile, 300–900 chars ≈ 50–125 words).
  Sourced from Boomerang (`_RESEARCH/email-and-social/2026-08-03-email-length-and-per-type-benchmarks.md`),
  a GENERAL email corpus, not real-estate- or open-house-specific.
- **New evidence this session, resolving nothing:**
  `_RESEARCH/email-and-social/2026-08-12-open-house-invitation-craft.md` §5, written explicitly
  "presented, not resolved, per the calling instructions." Its one concrete data point: the sole
  currently-published real-estate-authority open-house template found (HousingWire/Coffee &
  Contracts) runs **~60–70 words including greeting, a 5-item feature bullet list, sign-off, P.S.,
  and the ask** — inside the 50–125 band, above the 15–35 range, but structured as bullets rather
  than the "one feature in prose" shape the 15–35 instruction assumes. §6 of that file states
  outright: *"No word-count-specific measured study for open-house invitations... the single
  biggest gap against the operator's actual open question."*

**This plan does not pick a number.** The constant lives in exactly one place
(`shared.ts`, see §7 below) so whichever way the operator resolves it is a one-line edit, not a
scattered find-replace — and the retry/fallback machinery, the ask-presence check, and the
acceptance script's assertion all read that same constant rather than hardcoding a second copy of
the number (this is the exact "writer told 200 words, validated at 900 chars" drift bug
`length.ts`'s own docstring names as the thing NOT to repeat).

---

## 3. Failure modes → guards

| # | Failure mode | Guard |
|---|---|---|
| 1 | Infinite retry / latency blowup | Hard cap of **one** retry (a loop counter, not a `while`); same `max_tokens: 500` on the retry call as the original — total token ceiling per invitation ≈2 calls × 500 tokens, never open-ended (finding #4, Instructor's `token_budget` alongside `max_retries`). |
| 2 | Validator rejects everything, email silently degrades with no trace | Every branch (pass-first-try / pass-on-retry / fallback) logs via `console.warn("[narrative] invitation …")` — same tag `captureNarratorDrops()` (`scripts/email/_harness.mts:125-140`) already hooks for free. A test asserts the fallback path fires and is logged (§4). |
| 3 | Length check counts the property description or the community block | Not a new filter needed — verified by construction: `authorListingNarrative` returns ONLY its own generated string `t`; the property description ships as a separate `descriptionSlot` text block (`open-house.ts:185`, `buildDescriptionBlock`) and any future community block would be its own block type (`emails.md §0.1c` — "the community block," a distinct rendered block with its own button, not prose inside the narrator's paragraph). The invitation guard runs on `t` **before** `authorListingNarrative` returns, never on rendered HTML — so it structurally cannot see either carve-out. A test pins this (§4, "length check counts only the narrator's own copy"). |
| 4 | 15–35 collides with 50–125 | Resolved per-constraint by the operator (§2), not averaged, not guessed. One named constant gates both the prompt text and the validator (§7). Everything else in this plan (retry loop, fallback shape, logging) is unaffected by which number wins. |
| 5 | Fallback rate goes unmonitored — drift is invisible | Log-and-look only, stated as such, not oversold as a live alarm (§5). |
| 6 | **(found this session)** `validateNarrative()`'s shape does not fit an invitation at all | See the flagged section at the top — additive sibling export, zero change to the existing function/caller. |
| 7 | **(found this session)** A literal "must contain '?'" ask-check would FAIL the model's own gold-standard example | The invitation branch's own worked example (`shared.ts:600-601`, modeled on real crawled scripts) is *"I wanted to personally invite you to our open house at [this home]... I'd love for you to stop by"* — no question mark. `_RESEARCH/.../open-house-invitation-craft.md` §3's real published template closes *"Reply to this email with questions... Hope to see you there!"* — also no question mark. The ask-check is a phrase-marker regex sourced from these cited real scripts (`invite`, `stop by`, `swing by`, `come by`, `join us`, `hope (?:you can|to see you)`, `would love (?:for you )?to`, `we'd love`, `please join`, `see you there`), OR a literal `?`, never `?` alone (§7 for the exact pattern). |
| 8 | Retry could pass the invitation check but reintroduce an invention violation `auditClaims` would have caught | The retry attempt re-runs the **full existing pipeline** (scaffolding strip → cost/negativity strip → `auditClaims`) before the invitation check, never a shortcut path that skips the claim gate. A test forces a retry attempt that both fixes length AND contains an unanchored numeral, and asserts it still drops to fallback, not ships. |
| 9 | A passing first attempt silently costs a second model call anyway (a latent bug making every attempt "fail") | A unit test asserts the mock model's `create` is called **exactly once** when the first attempt already satisfies both checks — not just "the right text came back eventually." |
| 10 | The fallback text itself fails the very check it exists to satisfy | A test runs `validateInvitationCopy(FALLBACK_TEXT, band)` directly and asserts `[]` (clean) — self-consistency, not assumed. |
| 11 | **(found this session)** Package 2's own acceptance-script edits (href assertion, RSVP-sole-CTA check) land on the SAME `checks: Assertion[]` array in `render-open-house.mts` this package appends to | Not a code guard — a coordination note (§8: this plan claims **assertion 9**; whichever of the two packages lands second on `main` renumbers onto the other's array in that PR, not silently overwriting). |
| 12 | Extending the fallback to cover an `auditClaims` drop (today: silent `null`/open slot) is a real product improvement but changes existing return-value semantics for the invitation branch | Named as an explicit DESIGN CHOICE below (§6), not silently folded in — a reviewer must say yes/no, since it changes "no ask on this email" (today, silent) to "a hand-authored fallback ask ships" (a real behavior change, RULE 3.5). |

---

## 4. TDD sequence — failing test per failure mode, then implement

All tests land in `lib/deliverable/recipes/shared.test.ts` (existing file, existing mock pattern —
see below) unless noted. The existing mock (`shared.test.ts:38-51`) returns ONE fixed
`nextModelText` regardless of call count — **this must change to a per-call queue** before any
retry test can exist:

```ts
// BEFORE (today, shared.test.ts:40): let nextModelText = "...";
// AFTER: a queue popped once per create() call, defaulting to repeating the last entry
// if the queue runs out (so every EXISTING test, which sets nextModelText once, keeps working
// unchanged — this is additive, not a rewrite of the mock's contract for other tests).
let nextModelTexts: string[] = ["A well-kept three-bedroom home."];
let modelCallCount = 0;
// create: async (args) => { modelCallCount++; const t = nextModelTexts[modelCallCount - 1]
//   ?? nextModelTexts.at(-1)!; return { content: [{ type: "text", text: t }] }; }

// mock.module in this file runs ONCE at import time (process-global, per the file's own
// existing comment at line 30-31) — modelCallCount is a module-scoped counter that PERSISTS
// across every test in the file, and Bun's `beforeEach` runs per-test, not per-mock-install.
// Without an explicit reset, test 7's "exactly once" assertion inherits the accumulated count
// from tests 1-6 and fails for a reason that has nothing to do with the guard. Add:
//   beforeEach(() => { modelCallCount = 0; nextModelTexts = ["A well-kept three-bedroom home."]; });
// at the top of the invitation-guard test block, mirroring how `communityResult`/`nextListingHit`
// are already reset per-test elsewhere in this same file (e.g. the `finally { nextListingHit =
// null; }` pattern at shared.test.ts:204, 222, 237).
```

Sequence (each numbered test is written RED first):

1. **"invitation guard: a passing first attempt calls the model exactly once."**
   `nextModelTexts = ["Come see this beautiful home this weekend — we'd love for you to stop by."]`
   (inside whichever band is active). Assert `modelCallCount === 1` after the call, and the
   returned text matches. Closes failure mode #9.

2. **"invitation guard: under-band text triggers exactly one retry, and the retry's system prompt
   names the specific violated rule."** `nextModelTexts = ["Come by.", "<a valid second attempt>"]`.
   Assert `modelCallCount === 2`, assert the SECOND call's captured prompt (reuse the existing
   `capturedSystem`/introduce a `capturedRetryPrompt` capture) contains a string naming the word
   count that failed (e.g. `"14 words"` or whatever the first attempt measured) — Guardrails AI's
   documented `REASK` shape (finding #3): the failure is auto-generated from the specific value,
   never a generic "try again."

3. **"invitation guard: two consecutive failures fall through to the deterministic fallback, and
   the model is called at most twice."** `nextModelTexts = ["Come by.", "Still too short."]` (both
   fail). Assert the returned text === the exact `FALLBACK_INVITATION_TEXT` constant, assert
   `modelCallCount === 2` (never 3). **This is the required hard-cap-one-retry test.**

4. **"invitation guard: the fallback path logs `[narrative]` so the harness captures it."** Spy on
   `console.warn`, assert a call containing `"[narrative]"` and `"fallback"` fired on the same run
   as test 3. **This is the required fallback-path-fires test.**

5. **"invitation guard: length is counted from the narrator's own text only, never the property
   description or a community block."** Call `authorListingNarrative` with `opts.invitation: true`
   and a long `facts.remarks` (a property description that would itself run well past 35 words) and
   `descriptionRendered: true`; assert the function's OWN validation only measures the returned
   string, by asserting a short, in-band `nextModelTexts` entry passes on attempt 1 (`modelCallCount
   === 1`) even though `facts.remarks` alone is far outside any word band — proving the description
   text is never concatenated into what gets counted. **This is the required carve-out test.**

6. **"invitation guard: a retry that passes length/ask but reintroduces an unanchored numeral still
   falls through to fallback."** `nextModelTexts = ["Come by.", "This 3.2-acre estate is a steal —
   stop by!"]` where `3.2` is not anchored in any settled fact line. Assert fallback ships, not the
   second attempt (closes failure mode #8 — the retry does not bypass `auditClaims`).

7. **"non-invitation callers are unaffected — no retry, no ask-check, no new console.warn."** Reuse
   an EXISTING passing test (e.g. `"a sentence reciting the HOA cost is deleted..."`,
   `shared.test.ts:276`) unmodified; assert `modelCallCount === 1` after it runs. Regression guard
   that the new branch is invisible outside `opts.invitation`.

8. **`validateInvitationCopy` unit tests, in `lib/narratives/validate.ts`'s own test file (new
   test, alongside `narratives.test.ts` / a new `invitation-copy.test.ts`):**
   - under band → error containing the word count and the band
   - over band → error containing the word count and the band
   - in band, no ask marker → error naming "no ask"
   - in band, with a marker phrase from the cited set → `[]`
   - in band, ending in `?` but no marker phrase → `[]` (a literal question also counts)
   - `validateInvitationCopy(FALLBACK_INVITATION_TEXT, band)` → `[]` (closes failure mode #10,
     self-consistency)
   - **regression:** `validateNarrative()`'s own existing test suite
     (`narratives.test.ts`, `validate-scale.test.ts`, `area-email-inputs.test.ts`) still passes
     unmodified — proves the additive export changed nothing about the existing function.

9. **`scripts/email/render-open-house.mts` assertion 9** (new, additive — see §7): implemented
   LAST, against the real pipe, after 1–8 are green.

Only once 1–8 are red-then-green does implementation proceed past the test file into `shared.ts`
and `validate.ts` for real.

---

## 5. Observability — the "log and look" line, honestly scoped

Every terminal outcome of the invitation guard logs through `console.warn`, matching the existing
`[narrative]` convention already in `shared.ts` (lines 807, 823-826, 836):

```
[narrative] invitation PASS-FIRST-TRY
[narrative] invitation PASS-ON-RETRY — first attempt failed: <violated rule>
[narrative] invitation FALLBACK — retry also failed: <violated rule>
```

**Where it goes, locally:** `scripts/email/_harness.mts`'s `captureNarratorDrops()` (lines 125-140)
already intercepts every `console.warn`/`console.error` line containing `"[narrative]"` — this is
a FREE hook, zero new harness code. `render-open-house.mts` already prints the captured log as a
provenance row (`printProvenance`, line 175) — extend that row to also show the guard's own
outcome for a local `bun --env-file=.env.local scripts/email/render-open-house.mts ...` run. This
is "log and look" made literal for local acceptance runs.

**Where it goes in production:** these are plain `console.warn` calls inside server code that runs
under `app/api/deliverables/*` / the send/build routes. In production they land in Vercel's
function logs (stdout/stderr), same as every other `[narrative]` line in this file today. **Nothing
currently parses, counts, or alarms on these lines** — confirmed by grep: no consumer of
`"[narrative]"` exists outside the two acceptance-script harnesses
(`scripts/email/_harness.mts`, and the sibling pattern in other `render-*.mts` scripts). This is
the honest answer to "what reads it": **nothing does yet.** Per finding #15 (the only mechanism
this research found more rigorous than raw logging is a periodic BLIND manual audit, not a live
statistical alarm), the cheapest legitimate next step — NOT built in this package, named as a
follow-up — would be either (a) a manual `vercel logs | grep "invitation FALLBACK"` spot-check on
some cadence, or (b) wiring the fallback-rate into the existing `checks` ledger as a periodic
verify-class check. Flagging this as a known dark-log risk rather than silently shipping a log line
nobody will ever read (RULE 0.85 — this is legitimately out of reach this session, since building a
log aggregator/alarm is its own build, not a five-minute fix; recommend it as a `checks` entry if
the operator wants the gap tracked).

---

## 6. Design choice requiring explicit sign-off: does the fallback ALSO cover an `auditClaims` drop?

**Today:** if `auditClaims` rejects the generated invitation (an invented fact — the one and only
hard gate that exists now), `authorListingNarrative` returns `null` for EVERY caller, including
open-house. The email ships with no narrator text at all — just the date/time card and the RSVP
button. This is the CORRECT behavior for the other 6 recipes (a missing paragraph beats a false
one) and it is arguably too weak for open-house specifically, since this package now has a safe,
hand-authored, zero-numeral fallback that trivially passes `auditClaims` (nothing in it needs
anchoring).

**Recommended (not assumed):** extend the fallback trigger so that, for `opts.invitation === true`
ONLY, an `auditClaims` drop on the FIRST attempt also counts as a reason to retry once (same reask
mechanism, "you asserted something not given"), and a drop on the retry falls through to the SAME
deterministic fallback used for length/ask failures — rather than `null`. This directly closes the
open-house-specific instance of failure mode 1a's worst case (no ask at all) in a way the length/ask
guard alone would not (an invented-fact drop is a DIFFERENT failure than a too-short/no-ask
generation, and today it silently produces the same symptom — a wordless invitation).

This is presented as a recommendation, not baked into the "must build" list, because it changes an
existing, tested, intentional contract (`shared.ts:817-819`'s own comment: *"FAIL CLOSED... A
missing paragraph is honest; a confident false one is not"*) for one caller only. A reviewer should
say yes/no explicitly (RULE 3.5 — name the break, get sign-off) before it's coded. If NO: the
`auditClaims` path is untouched, and the new guard governs only text that already survived it.

---

## 7. The pre-approved deterministic fallback copy

Never mentions date/time (already shown in its own signal card, so restating it risks contradicting
that card if the two ever drift, and the base narrator's own instruction already treats the card as
sufficient — `open-house.ts:275`, "It is also shown in its own card, so a little redundancy here is
fine" — the fallback plays it safer still and omits it entirely). Contains zero digits (so it
trivially passes `auditClaims` with no anchor lines needed). Contains a marker phrase from the same
cited set used by the ask-check, so it always self-validates (failure mode #10).

**Short variant** (in-band if 15–35 words wins the operator's decision — 24 words):

> We'd love for you to stop by our open house at {{street}}. Come take a look around — we hope to
> see you there.

**Long variant** (in-band if 50–125 words wins — 58 words):

> We'd love for you to stop by our open house at {{street}}. It's a great chance to walk through the
> home in person, see the layout, and get a feel for the neighborhood for yourself. There's no need
> to RSVP ahead of time — just come by whenever works for you during the open house hours. We hope
> to see you there.

`{{street}}` fills from `facts.address`'s street segment (already resolved and always checked
present by assertion 1 in the acceptance script); if `facts.address` is somehow absent, drop the
clause to `"our open house"` rather than leaving a blank token (same "never ship a literal blank"
discipline as `lib/deliverable/language.ts`'s `renderTemplate`).

**Whichever word-band the operator picks, the SAME constant that gates the validator also gates
which fallback variant ships** — do not let the fallback silently fall outside the band it exists to
satisfy (failure mode #10's test enforces this at build time, not just by eye).

---

## 8. Step-by-step edit list

Confined to `lib/deliverable/recipes/shared.ts`, `scripts/email/render-open-house.mts`, and (flagged
above) `lib/narratives/validate.ts`. `lib/deliverable/language.ts` is READ-ONLY reuse (`bodyWordCount`
import), not edited.

1. **`lib/narratives/validate.ts`** — add, additive only, beside `validateNarrative()`:
   `export function validateInvitationCopy(text: string, opts: { minWords: number; maxWords: number
   }): string[]`. Internally: `import { bodyWordCount } from "@/lib/deliverable/language"` (mirrors
   the exact relative-import convention `price-reduced.ts:85` already uses, adjusted for the
   cross-directory path — confirmed zero import-cycle risk: `language.ts` has NO imports of its own,
   so `validate.ts → language.ts` cannot loop back). Checks: word count against `opts.minWords`/
   `maxWords`; ask-marker regex (name it `ASK_MARKERS`, export it too, so `shared.ts` and the
   acceptance script both read the same pattern instead of each typing their own copy — see failure
   mode #7's cited phrase list). Zero changes to any existing export in this file.

2. **`lib/deliverable/recipes/shared.ts`** —
   a. **The length half of the guard is genuinely BLOCKED on §2, not defaulted.** Do not hardcode
      `INVITATION_MIN_WORDS`/`MAX_WORDS` as a working default (that would silently resolve the
      conflict this plan explicitly declines to resolve). Instead, the retry/fallback MACHINERY
      ships now with `validateInvitationCopy`'s band as a **required parameter with no default** —
      build/test everything against a band passed in at the call site, e.g. a single
      not-yet-filled-in constant:
      ```ts
      // OPERATOR TBD — docs/superpowers/plans/2026-08-12-open-house-pkg4-narrator-validator.md §2.
      // 15–35 (current prompt, shared.ts:602) vs 50–125 (email-build-playbook.md:397). Left
      // UNSET on purpose: the length half of assertion 9 does not ship until this resolves.
      const INVITATION_WORD_BAND: { min: number; max: number } | null = null;
      const FALLBACK_INVITATION_TEXT = (street: string | undefined) => `...`; // §7, picks variant
      ```
      When `INVITATION_WORD_BAND` is `null`, the guard runs **ask-presence only** (fully buildable,
      fully evidence-grounded, no conflict) and skips the length check entirely rather than
      guessing. The moment the operator answers §2, this becomes a one-line edit
      (`{ min: 15, max: 35 }` or `{ min: 50, max: 125 }`), and the length half of the guard, the
      retry-reask wording, the fallback-variant choice (§7), and assertion 9's length half all
      activate together, off the same value.
   b. Refactor the function's tail (lines 732–838) so the generate→strip→auditClaims sequence
      becomes a small inner helper callable more than once (e.g. `attemptOnce(extraSystemSuffix?:
      string): Promise<string | null>`), with NO behavior change for the non-invitation path — the
      non-invitation path calls it exactly once, exactly as today.
   c. Wrap: when `opts.invitation`, after the first `attemptOnce()`, run `validateInvitationCopy`
      (ask-check always; length check only if `INVITATION_WORD_BAND` is set) against the result.
      Clean → return it (1 model call, matches TDD test 1). Violations → build a reask suffix
      naming them, call `attemptOnce` ONE more time, re-validate; clean → return it (2 calls, test
      2); still dirty → return `FALLBACK_INVITATION_TEXT(...)` (2 calls, never 3, test 3), logging
      per §5.
   d. **§6's decision, both branches spelled out so neither is ambiguous to the next implementer:**
      - **If YES** (fallback also covers an `auditClaims` drop): `attemptOnce` returning `null`
        (a claim-gate drop) is treated exactly like a length/ask violation — it triggers the SAME
        retry-then-fallback path, logged the same way.
      - **If NO** (default, unless a reviewer explicitly says yes): `attemptOnce` returning `null`
        on the FIRST attempt is returned as `null` **immediately, with no retry and no fallback** —
        byte-for-byte the function's behavior today. The invitation guard's retry/fallback loop
        only ever runs on TEXT that already survived `auditClaims`; it never sees a `null`. Do not
        write an "otherwise" branch that still routes `null` into the retry path — that IS the YES
        behavior with a different name, and shipping it without sign-off is the exact failure §6
        exists to gate.

3. **`scripts/email/render-open-house.mts`** — append assertion 9 (additive, after the existing 8,
   `checks` array around line 235-299). **Ships as ask-present only until §2 resolves** — the
   length half is conditionally added the moment `INVITATION_WORD_BAND` is set (§8.2a), not before:
   ```
   {
     name: "9 · invitation ask present" + (INVITATION_WORD_BAND ? " + length" : " (length: BLOCKED on §2)"),
     pass: hasAsk && (INVITATION_WORD_BAND ? withinBand : true),
     detail: INVITATION_WORD_BAND
       ? `${wordCount} words (band ${MIN}–${MAX}); ask ${hasAsk ? "present" : "MISSING"}`
       : `ask ${hasAsk ? "present" : "MISSING"}; length check not built — §2 unresolved`,
   }
   ```
   Reuses `narrativeBody` (already isolated at lines 199-204 — confirmed it already excludes the
   `descriptionSlot` block, so failure mode #3's carve-out is free at the acceptance-script layer
   too, not just inside `shared.ts`). Both `hasAsk`'s regex and `INVITATION_WORD_BAND` are IMPORTED
   from `shared.ts` (or `validate.ts`, per which shared-authority answer wins), never retyped here.

   **Assertion 9 passing is NECESSARY, NOT SUFFICIENT — read it together with the provenance row.**
   The pre-approved fallback text (§7) is built to be in-band and to carry an ask marker BY
   CONSTRUCTION (failure mode #10's own self-consistency test guarantees this). That means a run
   where the narrator fails on every attempt and ALWAYS falls back produces a fully GREEN assertion
   9 — a passing assertion 9 cannot, by itself, distinguish "the model is writing well" from "the
   model is failing every time and the fallback is quietly doing all the work." The §5 provenance
   row (`PASS-FIRST-TRY` / `PASS-ON-RETRY` / `FALLBACK`) is not decoration — reading it alongside
   assertion 9 on every acceptance run is how the fallback rate stays visible instead of hiding
   behind a green checkmark. Acceptance in §9 below states this explicitly.

   **Coordination note (failure mode #11):** Package 2's acceptance-script work also extends this
   same `checks` array (an `href` assertion + an RSVP-sole-CTA check) — this plan claims assertion
   **9**; whichever package's PR lands second on `main` renumbers onto the other's additions rather
   than silently overwriting the array.

---

## 9. Acceptance

```bash
bun test lib/deliverable/recipes/shared.test.ts          # TDD sequence §4 items 1-7, all green
bun test lib/narratives/narratives.test.ts \
         lib/narratives/validate-scale.test.ts \
         lib/narratives/area-email-inputs.test.ts        # regression: validateNarrative() untouched
bun test lib/narratives/invitation-copy.test.ts           # §4 item 8, new file
bun --env-file=.env.local scripts/email/render-open-house.mts \
  "https://www.realtor.com/realestateandhomes-detail/9340-Vittoria-Ct_Fort-Myers_FL_33912_M54178-84205" \
  "Saturday, August 22" "1 to 3 PM"
# expect: "✓ 9 of 9 assertions pass." (was 8 of 8) — proves assertion 9 is wired and passing
# against the REAL pipe, not a mock. Before §2 resolves, assertion 9's name/detail reads
# "(length: BLOCKED on §2)" and checks ask-presence only — that is a legitimate pass, not a
# weaker one, and is not the same claim as "length is guarded."
```

**Do not read a green assertion 9 alone as proof the guard is working (§3's sufficiency caveat).**
The SAME run's printed provenance row (`PASS-FIRST-TRY` / `PASS-ON-RETRY` / `FALLBACK`, §5) must
also be read and quoted alongside the assertion-9 result — a `FALLBACK` outcome with a green
assertion 9 means the fallback text carried the whole email, not the model's own writing, and that
is exactly the drift this guard exists to make visible rather than hide.

Paste the real command output (not "tests pass") into the follow-up session's evidence, per RULE
0.8 — this plan does not run any of the above (plan-only, no builds this session).

---

## 10. Open questions for the operator

1. **The word-count conflict (§2), the central one.** 15–35 (current, evidence-based, tied to two
   real caught failures) vs. 50–125 (the universal email band, general-email evidence, not
   real-estate- or open-house-specific) vs. a third reading the new research raises but does not
   resolve (the one real published template runs ~60–70 words INCLUDING greeting/ask/sign-off,
   suggesting 15–35 may have been scoped too narrowly if it's meant to cover the WHOLE invitation
   rather than just a feature clause — but the current prompt already applies it to the whole
   thing, "ONE OR TWO SENTENCES," so this isn't a clean reconciliation, just a data point to weigh).
2. **§6 — should the fallback also fire on an `auditClaims` drop**, not just a length/ask failure?
   Recommended yes, not assumed; changes an existing tested contract for the invitation branch only.
3. **§0 (top) — is the `validateInvitationCopy` sibling-export-in-`validate.ts` reading of "reuse,
   don't fork" acceptable,** or should it instead be a local unexported helper in `shared.ts`
   (avoiding any edit to `validate.ts` at all)? Both are architecturally equivalent; only the file
   address differs.
4. **§5 — is a manual log-grep/`checks`-ledger follow-up sufficient for now,** or does the fallback
   rate need a real dashboard before this ships to a real send volume? (Leaning: sufficient for now,
   per the same "pre-launch volume, revisit when there's traffic to measure" reasoning already
   applied to Package 3's caching question in the source handoff §4 Step 3(a).)
5. **§8 coordination — Package 2 also extends `render-open-house.mts`'s assertion array.** No
   action needed now (both packages can build independently against today's 8), but whoever merges
   second should renumber, and that should be said out loud in that PR rather than discovered as a
   merge conflict.

## What I could not verify (RULE 0.8)

- **Hosted graphify (`gx_callers`/`gx_impact`/`gx_find`/`gx_tests_for`/`gx_rank_files`) was
  unreachable this session** — `ToolSearch` returned no matching deferred tools for three different
  query phrasings. Fell back to `Grep` per RULE 0.5's stated fallback; every callsite/caller claim
  above (`authorListingNarrative`'s 7 callers, `validateNarrative`'s 1 caller, `bodyWordCount`'s 2
  callers) is grep-verified, not graph-verified. If the graph becomes reachable, re-run
  `gx_callers` on all three symbols as a cheap confirmation before implementation starts.
- **This plan does not run any test or script** — plan-only per the task's hard constraint. Every
  "expect"/"assert" statement above is a specification for the next session to execute, not a
  result already observed.
- **The exact wording of `ASK_MARKERS`** is a first-pass design proposal grounded in the cited real
  scripts (shared.ts's own comments + the 08/12 open-house-invitation-craft research), not something
  independently tested against a corpus of model outputs — worth a quick "render five real
  invitations, eyeball the marker list against what Sonnet actually writes" pass before locking it,
  per the "RENDER IT AND LOOK" standing lesson (a green unit test on a hand-picked list of examples
  is not the same evidence as looking at real generations).
