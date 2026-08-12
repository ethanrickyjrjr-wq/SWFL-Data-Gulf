# Package 1 — Capture open-house date/time in the UI (implementation plan)

**Written 08/12/2026.** Source of truth for WHY: `docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md`
§1c, §1g (cite, don't re-derive). Source of truth for the split: `docs/handoff/2026-08-12-open-house-build-plan-parallel-sonnet-assignments.md`
Package 1. This document is PLAN ONLY — no source file was edited to produce it.

---

## ⚠ COLLISION RISK — READ BEFORE ANY PARALLEL SESSION STARTS PACKAGE 2/3/4

The assignment's file list (`AddressPopup.tsx`, `EmailLabGridShell.tsx`, the `ArrivalPlan`/
`planSeedStart` path, `ListingFacts.openHouseDate`/`openHouseTime`) is NOT sufficient to thread a
real captured value from the popup to the rendered email. Tracing the real call chain end-to-end
(client → `/api/email-lab/ai` → `authorDoc` → `resolveSubject` → the keyed builder) surfaces **one
file no package owns**:

- **`lib/email/build-doc.ts` — owned by NO package in the collision table.** This is where
  `resolveSubject()` resolves `ListingFacts` and hands them to `buildOpenHouse` (`build-doc.ts:1262–1299`,
  detailed below). There is no other place in the server-side pipe to inject an agent-typed
  date/time before the recipe builder runs. **This plan claims it**, with the smallest possible
  edit (one interface widen + one 4-line call, both additive/read-only for every other consumer —
  detailed in the Edit List). Flagging this explicitly per the task's instruction: "if your plan
  NEEDS a file outside that list, do not quietly widen — flag it loudly."

Two files this plan considered and **deliberately avoids touching**, so they are NOT collision
risks despite looking like natural extension points:

- `lib/deliverable/recipes/shared.ts` — Package 4 owns this file (the `opts.invitation` branch,
  ~580–617). `resolveSubject()` also lives in this file, at line 174 — far from Package 4's zone,
  but it's the same file. This plan does **not** edit `resolveSubject()` at all; the injection
  happens one layer up, in `build-doc.ts`, at the exact point `render-open-house.mts:87–90` already
  does it for the CLI path. Zero edits to `shared.ts`.
- `lib/showcase/recipe.ts` (`ShowcaseRecipe.needs: readonly BrandNeed[]`, `BrandNeed` type) — not
  owned by any package, but also not touched. Widening `BrandNeed` to include event fields would
  conflate a permanent profile field with a one-event, per-build fact, and would ripple into every
  consumer of `BrandNeed`/`NEED_LABELS` (the ledger-backed brand system). This plan instead adds a
  **separate, recipe-key-keyed check inside `EmailLabGridShell.tsx` only** (`recipe.key === "open-house"`),
  which is fully self-contained to an owned file. If a later package wants to generalize "event
  fields" to more than one recipe, `ShowcaseRecipe` is the right extension point then — not now
  (RULE 0.6, proportion).

**`app/email-lab/grid/page.tsx` / `app/project/[id]/email-lab/page.tsx`** (the parent pages that
pass `autoBuildNeeds`, `initialRecipeKey`, etc. into `EmailLabGridShell`) were also considered.
This plan does **not** touch them: the event-capture decision is computed from `activeRecipeKey`,
which is already component-internal state in `EmailLabGridShell.tsx` (seeded from
`initialRecipeKey ?? initialRecipe?.key`, `EmailLabGridShell.tsx:379–381`) — no new prop needed.

---

## What's actually there now

### 1. There is no UI path to a real date/time — confirmed, matches handoff §1c

`ListingFacts.openHouseDate?: string` / `openHouseTime?: string` (`lib/email/listing-scrape.ts:45–46`):

```
44: /** THE OPEN HOUSE MOMENT. No vendor feed carries this (all 18 SteadyAPI endpoints
45:  *  checked 07/13/2026, `lib/deliverable/recipes/open-house.ts`) — it is lane-4, the
46:  *  agent's own words, typed in verbatim. Never parsed, never guessed, never defaulted
```

The ONLY writer in the repo is `scripts/email/render-open-house.mts:77–89` (CLI `argv[3]`/`argv[4]`,
written straight onto `facts.openHouseDate`/`openHouseTime` after `resolveSubject` returns, before
`buildOpenHouse` runs). Confirmed via Grep — zero other writers.

### 2. `AddressPopup` has NO field type for this today

`components/lab-entry/AddressPopup.tsx:25–46` (`AddressPopupProps`): `inputKind: "address"|"area"|null`,
and `gaps?: readonly BrandNeed[]` — `BrandNeed` (`lib/showcase/recipe.ts:19`) is a **closed union of
four profile-ledger keys**: `"agent_name" | "photo_url" | "brokerage" | "business_address"`. There is
no slot in this component for a listing/event fact. "Extend its generic gap-fields mode" (handoff
§1c, package-split doc line 64) means: build a SECOND, parallel gap-list mechanism next to `gaps` —
not widen `BrandNeed`, which is explicitly profile-only (`lib/showcase/recipe.ts:16–18`: "Brand-profile
keys a recipe leans on... narrows which of them a RECIPE may declare").

`onBuild: (value: string, brandPatch: Record<string, string>, useSavedLayout: boolean) => void`
(`AddressPopup.tsx:39`) has no channel for a listing fact either.

### 3. Two call sites drive `AddressPopup` in `EmailLabGridShell.tsx`, both need the new capture

- **Arrival auto-build gate** (`EmailLabGridShell.tsx:2577–2592`): renders when
  `autoBuildGaps !== null && (autoBuildGaps.length > 0 || savedLayoutOffer)`. `autoBuildGaps` is set
  inside the mount effect (`:766–798`) via `holdArrivalForPopup({ gapCount, hasSavedLayoutOffer,
  brandAuthed })` (`lib/lab-entry/arrival.ts:187–195`). Submits through `buildAfterBrand`
  (`:802–820`), which calls `runAutoBuild(brandPatch, useSavedLayout)` (`:682–764`) — the fetch to
  `/api/email-lab/ai` sends `scope` (the component's `scope` prop, `EmailLabGridShell.tsx:237`),
  `build: true`, `recipeKey: activeRecipeKey`. **`scope` here is a LOCAL literal type
  `{ kind?: string; value?: string; address?: string }`, structurally the same shape as (but not
  imported from) `BuildScope`.**
- **"Make this →" / in-lab recipe click** (`EmailLabGridShell.tsx:2597–2609`): `handleUseRecipe`
  (`:885–912`) decides `needsInput = findPlaceholder(recipe.prompt) !== null ||
  brandGaps(recipe.needs, branding).length > 0` (`:904–905`) — if false, it builds immediately with
  **no popup at all**, which today means an open-house click whose address is already known (e.g.
  `?addr=` pre-filled, no remaining `[[blank]]`) skips straight to build and NEVER asks for the
  date/time. Submits through `startFromPopup` (`:916–947`) → `runAuthor(prompt, opts)` (`:576–669`).

### 4. `holdArrivalForPopup` — the signed-out bypass this plan must respect

`lib/lab-entry/arrival.ts:187–195`:
```
export function holdArrivalForPopup(input: {
  gapCount: number;
  hasSavedLayoutOffer: boolean;
  brandAuthed: boolean;
}): boolean {
  if (input.hasSavedLayoutOffer) return true;
  return input.brandAuthed && input.gapCount > 0;
}
```
Operator launch decree 08/11/2026 (comment above, `:179–186`): a signed-out `/go` arrival never
holds for brand gaps — the doc renders with open slots, no popup. Open-house event capture must
follow the **same** rule (it degrades to an open "+Add" cell exactly like a vendor-absent field,
per `listing-scrape.ts:43`) — implemented by feeding the event-need into the SAME `gapCount` the
caller already computes, not by changing `holdArrivalForPopup`'s signature.

### 5. The server-side plumbing gap (why `build-doc.ts` must be touched)

`app/api/email-lab/ai/route.ts:90–113` parses `body.scope` (an inline type, matches handoff §1f)
and passes it straight through: `authorDoc({ ..., scope: body.scope, ... })` (`route.ts:172–183`).
`authorDoc` (`build-doc.ts:1114–1299`) dispatches on `recipeKey` (`:1251–1252`), resolves the
subject:

```
1268: const subject = keyedRecipe.subject === "address"
1269:     ? (scope?.address ?? subjectAddressFromPrompt(prompt)) : null;
1272: const resolvedSubject = subject ? await resolveSubject(subject, prompt) : null;
1274: const built = await keyedBuilder({
1275:   recipe: keyedRecipe, prompt, currentDoc,
1278:   facts: resolvedSubject?.facts ?? null,
...
```

`BuildScope` (`build-doc.ts:100–107`) is the ONE typed channel from client → `authorDoc`, already
carries an "enrichment field beside kind/value" precedent — `address`, added exactly this way per
`docs/superpowers/plans/2026-07-05-address-spine.md:278` ("`BuildScope` gains an `address`
enrichment field... nothing branches on it besides the feed"). `BuildScope` has **30 reference
sites** across the codebase (social calendar, weekly-read, project week route, chart routes, etc.) —
confirmed via repo-wide grep — but every one of them is a **read of fields it already knows about**;
none of them will read `openHouseDate`/`openHouseTime`, so widening the interface with two new
OPTIONAL fields is a read-only, zero-behavior-change addition for all 30 other consumers. This is
the lowest-blast-radius transport available; the alternative (adding fields to `route.ts`'s own
inline `body.scope` type) is unnecessary — `body.scope`'s narrower declared type is structurally
assignable to a widened `BuildScope` (all new fields optional), so **`route.ts` needs zero edits**
and the runtime JSON payload carries the extra keys through untouched (`JSON.parse` doesn't strip
unknown keys; only the TS type declaration matters for compile-time access, and only `build-doc.ts`
needs to read them).

### 6. `dateTimeCard` already treats blank correctly — one thing the handoff got half-right

`lib/deliverable/recipes/open-house.ts:124–127` (Package 2's owned file, not edited by this plan):
```
124: export function dateTimeCard(facts: ListingFacts): ChromeBlock | null {
125:   const date = facts.openHouseDate?.trim();
126:   const time = facts.openHouseTime?.trim();
127:   if (!date && !time) return null;
```
`.trim()` on an empty string is falsy, so `facts.openHouseDate = ""` is ALREADY handled correctly
here — assertion 4 in `render-open-house.mts` (Package 4's file) will stay green regardless of
whether my capture path emits `""` or `undefined`. That said, this plan's own capture/normalize
function emits `undefined` for blank input, not `""` — cleaner discipline, matches the field's own
doc comment ("never guessed, never defaulted"), and is asserted directly in this plan's unit tests
rather than relying on `dateTimeCard`'s incidental trim behavior as the only guard.

### 7. `render-open-house.mts` does NOT exercise the new wiring — a real gap in this package's acceptance

Read in full (all 8 assertions, `scripts/email/render-open-house.mts:1–304`). It imports
`buildOpenHouse` and `resolveSubject` directly (`:56–57`) and writes `argv[3]`/`argv[4]` straight
onto `facts` (`:87–90`) — it **never calls `authorDoc`, `/api/email-lab/ai`, or `build-doc.ts`**.
Its 8 green assertions prove the RENDER side (a real date/time in `facts` produces a correct card,
narrative, CTA) — they say nothing about whether a value typed into `AddressPopup` actually reaches
`facts` through the real UI → API → `build-doc.ts` path this plan builds. This is a genuine
acceptance gap; see "Acceptance" below for how this plan covers it without touching Package 4's file.

---

## Failure modes → guards

| # | Failure mode | Guard | Mechanism |
|---|---|---|---|
| 1 | Popup re-asks every build within the same editing session | `needsOpenHouseCapture()` pure helper (new, `lib/lab-entry/arrival.ts`) + a session-scoped `eventCapturedRef` in `EmailLabGridShell.tsx` flips true once the popup is answered | unit test + component logic |
| 2 | **Cross-session "ask once" (persist on the project) silently ships a STALE date** — the `subject_area` precedent (07/16 spec) means "known → never ask again," but an open house date is a moving fact, not a permanent one; a project reused months later would silently reuse a passed date with no popup at all | **NOT implemented in this plan's v1.** Flagged as an open question for the operator (below) — v1 only does session-scoped "ask once," which is always safe (never persists a value that can go stale) | operator decision required |
| 3 | Free text becomes an invented date/time downstream in the NARRATOR's prose when none was supplied | Already guarded — assertion 3, `render-open-house.mts:250–259` (Package 4's file, untouched, must stay green) | existing test (regression guard, not new) |
| 4 | **The handoff's own wording ("validate as a real date") contradicts the field's cited contract** — `listing-scrape.ts:44` says "the agent's own words, typed in verbatim... never parsed, never guessed." Coercing/reformatting the typed text into a canonical date format would violate that. This plan resolves the contradiction in favor of the CITED code contract: capture-time validation is "reject blank/whitespace-only," never "reject non-ISO text" or "reformat." | `applyOpenHouseCapture()` (new, `lib/email/listing-scrape.ts`) trims and treats blank as absent; never reformats a non-blank string | unit test |
| 5 | User skips → the card must be omitted, not guessed | Existing — assertion 4, `render-open-house.mts:260–270`, backed by `dateTimeCard()`'s trim-then-falsy check (`open-house.ts:125–127`, §6 above). **This plan's own boundary responsibility:** the capture/normalize function must return `undefined`, not `""`, for blank input — a defect at MY boundary would still pass assertion 4 today only by accident of `dateTimeCard`'s trim, and could stop passing "for the right reason" once Package 2 refactors that file for layout | unit test on `applyOpenHouseCapture`, not just reliance on assertion 4 |
| 6 | Signed-out `/go` arrival gets held hostage by the event-capture ask, contradicting the 08/11/2026 launch decree ("`/go` runs popup-free") | Event-need is folded into the SAME `gapCount` passed to the existing `holdArrivalForPopup()` (`arrival.ts:187–195`, unedited). **Read precisely** (`arrival.ts:193–194`): `return brandAuthed && gapCount > 0`. Because `brandAuthed` gates the WHOLE expression, a signed-out open-house arrival will get `false` regardless of `gapCount` — meaning **a signed-out `/go` open-house build never asks for date/time at all**, the same way it never asks for brand fields today. This is a real, silent product consequence of reusing this gate as-is, not a guarded edge case — stated plainly here rather than behind a test that would pass identically with or without this plan's changes (see the corrected test below and Open Question 4) | unit test — see the corrected case below, which asserts the NEW behavior (signed-in, zero brand gaps, event-need present → now holds), not the unchanged signed-out path |
| 7 | The "Make this →" in-lab click skips the popup entirely when the address is already known (`needsInput` false today, `EmailLabGridShell.tsx:904–905`) — an open-house recipe with a pre-filled address would build with NO date/time ask at all | Widen `needsInput` in `handleUseRecipe` to also fire when `recipe.key === "open-house" && !eventCapturedRef.current` | component logic, covered by AddressPopup + arrival unit tests together (no dedicated React-render test — see Acceptance) |
| 8 | Two independent gap systems (`gaps`/`BrandNeed` for the account, new event fields for the listing) get conflated — brand patch banked to `/api/user/brand`, event patch banked NOWHERE (it must never write to the account profile) | Separate prop (`eventFields`), separate patch object, separate `onBuild` argument on `AddressPopup`; `buildAfterBrand`/`startFromPopup` never call `/api/user/brand/bank` with event data | unit test asserting the bank POST body never contains `openHouseDate`/`openHouseTime` keys |
| 9 | `BuildScope` widen breaks one of its 30 other consumers | Both new fields optional; no existing consumer reads them; TDD does not require testing this negatively (structural typing guarantees it) — confirmed by reading `build-doc.ts:100–107`'s existing `address` field precedent, same shape | `bunx next build` (typecheck across all 30 consumers) |
| 10 | `render-open-house.mts`'s 8 green assertions are mistaken for proof the UI wiring works (§7 above) | This plan does NOT claim that. A separate, NEW test file (not touching Package 4's script) exercises `authorDoc`'s dispatch of `scope.openHouseDate`/`Time` into `facts` | new unit test, `lib/email/build-doc-open-house.test.ts` |

---

## TDD sequence (write the failing test, then implement)

1. **`lib/email/listing-scrape.test.ts`** (existing file, add cases) — targets `applyOpenHouseCapture`
   (new export in `lib/email/listing-scrape.ts`):
   - `"applyOpenHouseCapture writes date and time onto bare facts"`
   - `"applyOpenHouseCapture never overwrites an already-held value (non-clobber, same discipline as remarks)"`
   - `"applyOpenHouseCapture treats whitespace-only input as untyped — never writes an empty string"`
   - `"applyOpenHouseCapture is a no-op when captured is undefined"`

2. **`lib/lab-entry/arrival.test.ts`** (existing file, add cases) — targets `needsOpenHouseCapture`
   (new export in `lib/lab-entry/arrival.ts`):
   - `"needsOpenHouseCapture: open-house recipe, not yet captured this session → true"`
   - `"needsOpenHouseCapture: open-house recipe, already captured this session → false (ask-once)"`
   - `"needsOpenHouseCapture: any other recipeKey → false"`
   - `"needsOpenHouseCapture: null recipeKey → false"`
   - **`holdArrivalForPopup` — one new case, existing describe block (`arrival.test.ts:313`), CORRECTED
     from an earlier draft of this plan that asserted a signed-out case:** a signed-out assertion
     would pass identically before and after this plan's changes (`brandAuthed` alone already forces
     `false`), proving nothing about the new code. The case that actually exercises the new wiring is
     the signed-in one where `gapCount` is driven ENTIRELY by the event-need, zero brand gaps:
     `"signed-in, zero brand gaps, but an open-house event-need present → still holds for the popup"` —
     `holdArrivalForPopup({ gapCount: 1, hasSavedLayoutOffer: false, brandAuthed: true })` → `true`.
     (This is the literal "new ask-once test on the arrival path" the assignment's acceptance line
     names — combined with the `needsOpenHouseCapture` ask-once cases above, which prove the "once"
     half; this case proves the "ask" half actually reaches the gate.)

3. **`components/lab-entry/AddressPopup.test.tsx`** (existing file, add cases):
   - `"eventFields render as their own labeled inputs, separate from brand gaps"`
   - `"onBuild's 4th argument (eventPatch) carries only non-blank typed event fields"`
   - `"build is never blocked by an unanswered eventField (RULE 0.7 — a build is never refused)"`

4. **`lib/email/build-doc-open-house.test.ts`** (NEW file — deliberately not touching the existing
   `build-doc.test.ts`'s mock setup, to keep this package's tests isolated from Package 2/4's future
   edits to that shared harness):
   - `"authorDoc: scope.openHouseDate/openHouseTime reach facts.openHouseDate/openHouseTime for the open-house recipe"`
     (mocks `resolveSubject` to return bare facts with no date/time held, passes
     `scope: { address: "...", openHouseDate: "Sat 6/14", openHouseTime: "1-3pm" }`, `recipeKey: "open-house"`,
     asserts the facts object the keyed builder receives carries both — via a mocked/spied
     `keyedBuilder`/`buildOpenHouse`, or by asserting on the RETURNED doc's rendered `signal` block
     if simpler given the existing mock harness pattern)
   - `"authorDoc: a value already held on facts (future: a vendor ever starts carrying this) is never clobbered by scope"`

No test targets `EmailLabGridShell.tsx`'s `handleUseRecipe`/`buildAfterBrand`/`startFromPopup`
wiring directly with a React render — that logic is a thin composition of the two pure helpers
above (`needsOpenHouseCapture`, `applyOpenHouseCapture`) plus already-tested `AddressPopup`
rendering; a full component-level test would mostly re-test React itself. Covered instead by the
manual live-verify step under Acceptance.

---

## Step-by-step edit list

### 1. `lib/email/listing-scrape.ts` (owned)
Add `applyOpenHouseCapture(facts, captured)` — pure, exported, placed near the `ListingFacts`
interface it documents (after line 46). Mirrors `render-open-house.mts:87–90`'s inline mutation and
`shared.ts:212`'s non-clobber discipline, but as one tested, reusable function instead of two
call-site-local `if` statements.

### 2. `lib/lab-entry/arrival.ts` (owned)
Add `needsOpenHouseCapture(input: { recipeKey: string | null; alreadyCaptured: boolean }): boolean`
— pure, exported, placed near `holdArrivalForPopup` (after line 195). Does **not** touch
`planArrival`, `ArrivalPlan`, `SeedStartPlan`, or `SeedSubject` — those stay exactly as they are
(avoids the 4th-subject-type ripple the operator's 07/16 matrix was designed to prevent).

### 3. `components/lab-entry/AddressPopup.tsx` (owned)
- New prop `eventFields?: readonly { key: string; label: string; placeholder?: string }[]` on
  `AddressPopupProps`.
- New local state `eventPatch: Record<string, string>`, rendered as its own labeled-input section
  (reuse the teal/`savedLayout` visual treatment, not the amber brand-gap box — this is not a
  compliance nag, it's a build-quality ask).
- Widen `onBuild` to `(value, brandPatch, useSavedLayout, eventPatch) => void` — 4th argument,
  additive (both existing call sites in `EmailLabGridShell.tsx` get updated in the same commit;
  `AddressPopup.test.tsx`'s existing tests pass 3-arg mocks today and must keep compiling — check
  whether the 4th param needs a default at the call site vs. the type, not inside the component).
- `ready` computation unchanged — `eventFields` never blocks the Build button (RULE 0.7).

### 4. `components/email-lab/EmailLabGridShell.tsx` (owned)
- Local constant (not exported, not touching `lib/showcase/recipe.ts`):
  `OPEN_HOUSE_EVENT_FIELDS: readonly { key: string; label: string; placeholder?: string }[]` — the
  two fields, labels drafted from `listing-scrape.ts:44`'s own framing ("agent's own words,
  verbatim") — e.g. `{ key: "openHouseDate", label: "Date" }`, `{ key: "openHouseTime", label: "Time" }`.
- New `const eventCapturedRef = useRef(false)` — session-scoped only (component lifetime), never
  persisted. Flips true the moment either `AddressPopup` submit handler below runs (Build clicked;
  a Cancel does NOT flip it — cancelling still builds per RULE 0.7 but should ask again next time,
  matching "skip" ≠ "answered").
- Mount effect (`:766–798`): compute `needsEvent = needsOpenHouseCapture({ recipeKey: activeRecipeKey,
  alreadyCaptured: eventCapturedRef.current })`; feed into `holdArrivalForPopup`'s `gapCount` as
  `gaps.length + (needsEvent ? 1 : 0)`; set a new `autoBuildEventFields` state
  (`needsEvent ? OPEN_HOUSE_EVENT_FIELDS : []`) alongside the existing `autoBuildGaps`.
- Arrival popup render (`:2577–2592`): widen the guard condition to also open on
  `autoBuildEventFields.length > 0`; pass `eventFields={autoBuildEventFields}` to `AddressPopup`.
- `buildAfterBrand` (`:802–820`): accept the new 4th `eventPatch` argument; if non-empty, set
  `eventCapturedRef.current = true`, merge into the fetch's `scope` (`{ ...scope, openHouseDate:
  eventPatch.openHouseDate, openHouseTime: eventPatch.openHouseTime }`), and — critically — do
  **NOT** `fetch("/api/user/brand/bank", ...)` with this data (failure mode 8).
- `handleUseRecipe` (`:885–912`): widen `needsInput` (`:904–905`) to
  `... || (recipe.key === "open-house" && !eventCapturedRef.current)`. When it's the event-need
  alone that triggers `setStartRecipe(recipe)`, pass `eventFields={recipe.key === "open-house" &&
  !eventCapturedRef.current ? OPEN_HOUSE_EVENT_FIELDS : []}` at the `AddressPopup` render (`:2597–2609`).
- `startFromPopup` (`:916–947`): accept the 4th `eventPatch` argument; same merge-into-scope and
  `eventCapturedRef` update as `buildAfterBrand`.
- `runAutoBuild`/`runAuthor` fetch bodies (`:682–764`, `:576–669`): both already send `scope`
  verbatim from the component prop/closure — no change needed there IF `buildAfterBrand`/
  `startFromPopup` pass the merged scope object as the `scope` each function closes over (simplest:
  a `sessionEventPatchRef` merged into `scope` at the two fetch call sites directly, rather than
  threading a new parameter through `runAutoBuild`/`runAuthor`'s signatures — smaller diff, same
  effect).

### 5. `lib/email/build-doc.ts` (**UNOWNED — flagged above, minimal footprint**)
- `BuildScope` interface (`:100–107`): add
  `openHouseDate?: string;` / `openHouseTime?: string;` with a doc comment citing
  `ListingFacts.openHouseDate`/`openHouseTime` (`listing-scrape.ts:45–46`) and the `address` field's
  own precedent comment immediately above it as the pattern being followed.
- Import `applyOpenHouseCapture` from `./listing-scrape` (or the correct relative path).
- After `:1272` (`const resolvedSubject = subject ? await resolveSubject(subject, prompt) : null;`),
  before the `keyedBuilder` call at `:1274`, insert:
  ```
  if (resolvedSubject?.facts) {
    applyOpenHouseCapture(resolvedSubject.facts, {
      date: scope?.openHouseDate,
      time: scope?.openHouseTime,
    });
  }
  ```
  Four lines, one import. No other line in this 1300+-line file changes.

### 6. NOT implemented this package (see Open Questions)
- Any `projects` table migration (`subject_open_house_date`/`subject_open_house_time` columns,
  modeled on `docs/sql/20260716_projects_subject_area.sql`) for true cross-session persistence.
  v1 ships session-scoped "ask once" only — safe by construction (never persists a value that can
  go stale), and does not require a migration, a Supabase typed-client regen, or touching any
  project page.

---

## Acceptance

**Invocation check:** `package.json:15` — `"test": "bun test"` — bun's runner accepts a path/glob
filter (`bun test <path>`), and none of the four unit-test files below touch the network or read
`.env.local` (`listing-scrape.ts`/`arrival.ts` are pure; `AddressPopup.test.tsx` already runs via
plain `bun:test` + `renderToStaticMarkup`, confirmed by reading its existing header; the new
`build-doc-open-house.test.ts` mocks `resolveSubject`, following `build-doc.test.ts`'s own
`globalThis.fetch` — disabled pattern, `build-doc.test.ts:32,40–42`) — so none of the four commands
below need `--env-file=.env.local`. That flag stays reserved for the acceptance SCRIPT (step 5),
which does hit real data.

1. `bun test lib/email/listing-scrape.test.ts` — new `applyOpenHouseCapture` cases green.
2. `bun test lib/lab-entry/arrival.test.ts` — new `needsOpenHouseCapture` cases green, existing
   `holdArrivalForPopup` describe block (including the new signed-out+event case) green, **all
   pre-existing `planArrival` cases in this file still green (nothing in the seed/recipe matrix
   changed)**.
3. `bun test components/lab-entry/AddressPopup.test.tsx` — new `eventFields` cases green, all
   pre-existing cases (Start-blank escape, choice mode, existing address mode) still green.
4. `bun test lib/email/build-doc-open-house.test.ts` — new file, both cases green.
5. `bun --env-file=.env.local scripts/email/render-open-house.mts "9340 Vittoria Ct, Fort Myers, FL 33912" "Saturday, June 14" "1-3pm"`
   and the no-args form — **all 8 existing assertions stay green** (this script is unmodified by
   this package; green here proves no regression, not proof of the new wiring — see §7 above).
6. `bunx next build` — proves the `BuildScope` widen doesn't break any of its ~30 consumers, and
   catches anything local `tsc` would miss (per the operator's standing verification rule).
7. **Manual live-verify (not automatable by this package alone, since it requires the real
   `/api/email-lab/ai` route and a browser):** open `/email-lab/grid?rkey=open-house&addr=<a real
   Lee/Collier address>`, confirm the date/time popup appears exactly once, type a date/time, Build,
   confirm the "Open House" signal card on the canvas shows exactly what was typed verbatim, then
   click a DIFFERENT template/recipe in the same session and back to Open House (or re-run the
   build) and confirm the popup does NOT re-appear (ask-once, within-session). This is the step
   that actually proves the client → route → `build-doc.ts` → `buildOpenHouse` chain this plan
   built, since `render-open-house.mts` (step 5) does not exercise it (§7 above).

---

## Open questions for the operator

1. **Cross-session persistence.** This plan's v1 asks once per editing session and never persists
   the date/time (safe, but re-asks on the next visit to the same project). The `subject_area`
   precedent (07/16 spec) would instead bank it on the project and never ask again — but an open
   house date is not a permanent fact like an address; silently reusing a passed date on a later
   build is a real risk (a "Saturday" email that ships in September). Three shapes, not decided
   here:
   - **(a) Ship v1 as planned** — session-only, always safe, re-asks each visit. No migration.
   - **(b) Persist + auto-expire** — bank on `projects.subject_open_house_date`/`_time` (new
     migration, same shape as `subject_area`), but the popup re-fires automatically once the
     stored date is in the past, rather than a true never-ask-again. Requires a `isPast(date)`
     check against a free-text (not machine-parseable) field, which conflicts with "never parsed"
     (§ failure mode 4) — would need its own resolution.
   - **(c) Persist, pre-filled and always editable** — bank it, but the popup still shows every
     build with the stored value pre-filled (never silently skipped), so the agent sees and can
     correct a stale date instead of it being invisible.
   This plan's recommendation, if forced to pick: **(a)** for this package, revisit (b)/(c) only if
   the operator confirms repeated open-house builds on the same listing are common enough to be
   worth the migration + the stale-date design work.
2. **`render-open-house.mts` doesn't exercise the real wiring (§7).** Should Package 4 (which owns
   that script) extend it to also drive the `authorDoc`/`build-doc.ts` path once this package
   lands, or is the manual live-verify step (Acceptance §7) + this plan's new
   `build-doc-open-house.test.ts` considered sufficient standing coverage? Not this package's call
   to make unilaterally since the script is Package 4's owned file.
3. **Signed-out `/go` open-house arrivals never get asked for date/time at all** (failure mode 6).
   With this plan as designed, an anonymous first-touch open-house build always ships with an open
   date/time slot — consistent with the 08/11/2026 "`/go` runs popup-free" decree's letter, but that
   decree's stated REASONING was specifically about brand fields ("no account to bank into"), which
   doesn't literally apply to a per-build, never-banked event fact. Confirm this is the intended
   behavior before it ships, or this plan needs a real signature change to `holdArrivalForPopup` (a
   second, brand-independent bypass parameter) to let signed-out arrivals still ask for the event
   date while still never asking for brand fields.
4. **Event field copy.** This plan drafts `"Date"` / `"Time"` as the two popup labels with
   placeholder examples ("Saturday, June 14" / "1-3pm"). Confirm this wording before it ships, or
   defer to whoever writes the `email-build-playbook.md` §2.6 prose (Package 3's prerequisite step)
   for consistent voice.
