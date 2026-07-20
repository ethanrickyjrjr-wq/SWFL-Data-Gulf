# Lane 19 — Completeness map: every code path that PRODUCES a customer-facing email

> **Recommended model:** ⚡ Sonnet — 18 files

Goal: enumerate every distinct entry point that ends in an email being built or sent.
Flag which share the AI-build subject-binding bug vs which are independent.

## Status: COMPLETE

---

## THE SHARED SUBJECT-BINDING MECHANISM (where the confirmed bug actually lives)

A typed address only becomes "this specific listing (real photo + price + beds/sqft)"
in TWO functions inside `lib/email/build-doc.ts`:

1. **`authorDoc()`** (build:true path). Subject binding at `build-doc.ts:1159-1172`:
   - `activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)` (line 1159)
   - if a recipe + `builderFor(key)` resolve → `resolveSubject(subject, prompt)` where
     `subject = scope?.address ?? subjectAddressFromPrompt(prompt)` (line 1168-1172) → recipe builder → flyer.
   - ELSE legacy lane (line 1289-1293): `!recipeBuilder && isNewListingRecipePrompt(prompt)`
     → `subjectAddress = scope?.address ?? subjectAddressFromPrompt(prompt)` → `resolveSubjectListing` → flyer.
   - If NONE bind → falls through to the **generic author** (line 1368+) = the generic ZIP/market
     grab-bag = the CONFIRMED SYMPTOM.

2. **`buildContentDoc()`** listing-flyer branch (`build-doc.ts:726`): `isListingIntent(prompt)` —
   requires a URL in the prompt AND listing wording (`lib/email/listing-intent.ts:15-19`). A bare
   typed address with NO url never trips this; it only re-fills the existing skeleton.

**Why the confirmed test failed** (root cause is lanes 02/08's to nail; established here for flag purposes):
The AI-build panel's "Build the email" primary button = `runAuthor` → posts `build:true` with
`recipeKey: activeRecipeKey || undefined` (`components/email-lab/EmailLabGridShell.tsx:497-521`).
A FREEFORM typed prompt (no recipe pill clicked) sends `recipeKey: undefined`, so in authorDoc:
- `recipeByKey(undefined)` = null; `recipeFromPrompt("New listing announcement for 14189 Mindello Dr…")`
  = null (recipeFromPrompt only matches the rigid registry prompt HEAD "Build a new-listing
  announcement email for my listing at" — `recipes.ts:412-426`).
- legacy lane: `isNewListingRecipePrompt` = TRUE (matches "new listing", `listing-intent.ts:27-31`),
  BUT `subjectAddressFromPrompt` = NULL because its regex requires "listing|property|home|house **at**
  <addr>" (`listing-intent.ts:42`) and the user wrote "…**for** 14189 Mindello Dr". So subjectAddress=null.
- → generic author → generic ZIP grab-bag. **Door + phrasing decide binding; free-text typing loses.**

The truncated-sentence / chart-behind-numbers / mismatched-ZIP symptoms are downstream of the generic
author's assembly+render (other lanes: 07 unrelated-zip-chart, render lanes) — not this mechanism.

---

## PRODUCER INVENTORY (build content)

### A. Email Lab build roots — `buildContentDoc` / `authorDoc` (lib/email/build-doc.ts)

| # | Entry point (file) | Which root | Subject-binding? | Shares the bug? |
|---|---|---|---|---|
| 1 | `app/api/email-lab/ai/route.ts` (AI-build panel) | authorDoc (build:true) OR buildContentDoc (fill) | YES (authorDoc) | **YES — THE confirmed lane.** Free-text typed listing asks fall to generic author. |
| 2 | `app/api/projects/[id]/week/route.ts` (Cockpit "this week" email) | buildContentDoc, HARD-CODED "Market spotlight email for {scopeLabel}", area scope, `defaultDoc()` | NO (area by design) | No — never a listing subject. Independent. |
| 3 | `app/api/projects/[id]/ai-material/route.ts` (project "AI material") | re-POSTs `/api/email-lab/ai` WITHOUT build:true → buildContentDoc fill | Only via isListingIntent (needs URL) | Partial — inherits buildContentDoc's URL-gated flyer only; no recipe subject binding. |
| 4 | `app/api/deliverables/[id]/update-doc/route.ts` (hub "Update") | buildContentDoc via `deriveDocBuildArgs`, mode quality | scope.address passes but buildContentDoc doesn't bind a recipe | Partial — same class as scheduled re-render (#6). |
| 5 | `app/api/switch/apply-forward/route.ts` (forwarded-campaign rebuild, live) | buildContentDoc, market rebuild prompt | NO (market) | No — trend-snapshot seed, area. Independent. |
| 6 | `scripts/email/run-schedules.mts` → `lib/email/emaildoc-occurrence.ts` (SCHEDULED re-render+send) | **buildContentDoc** via `buildEmailDocOccurrence`/`deriveDocBuildArgs` | scope carries subject_address from project, but buildContentDoc does NOT re-run the recipe builder/flyer | **DIVERGENCE (own check):** a listing email BUILT by authorDoc/recipe is RE-BUILT on schedule by buildContentDoc (skeleton fill). Held photo/price survive (read-only), but subject is not re-resolved. Different producer across the same email's lifecycle. |
| 7 | `lib/email/weekly-read/issue.ts` (scheduled weekly ZIP read; injected buildContentDoc) | buildContentDoc, area/ZIP | NO (area) | No. Independent. |
| 8 | `lib/switch/rebuild-campaign.ts` (switch@ wow-moment draft; injected buildContentDoc) | buildContentDoc, trend-snapshot seed | NO (market) | No. Independent. |

### B. Report/narrative engine — `assembleDeliverable` (lib/deliverable/assemble.ts) — DIFFERENT engine (PDF/one-pager/report, NOT EmailDoc block-canvas)

| # | Entry point | Notes |
|---|---|---|
| 9  | `app/api/templates/[id]/run/route.ts` (Listing PDF maker flywheel) | scope = ZIP or address → project → assembleDeliverable. NOT the Email Lab pipeline. |
| 10 | `app/api/projects/[id]/build/route.ts` | assembleDeliverable — the ONE report build path. |
| 11 | `app/api/projects/[id]/action/route.ts` (project-page action) | assembleDeliverable (nonce-gated). |
| 12 | `app/api/projects/[id]/refresh/route.ts` | assembleDeliverable re-run. |
| 13 | `app/api/deliverables/[id]/edit/route.ts` | assembleDeliverable (narrative regen). |
| 14 | `app/api/deliverables/[id]/refresh/route.ts` | assembleDeliverable. |
| 15 | `app/api/mcp/project-tools.ts` (+ `app/api/mcp/server.ts`) | assembleDeliverable via MCP tool `swfl_project_build`. |

All of B are INDEPENDENT of the AI-build subject-binding bug — separate engine, separate render
(report templates, not EmailDoc). Their own correctness is a different lane.

### C. Showing-Prep packet — separate subject-aware path (NOT authorDoc, NOT the recipe builders)

| # | Entry point | Notes |
|---|---|---|
| 16 | `app/api/email-lab/ai/route.ts` showing-prep branch (`route.ts:126-134`) | `gatherShowingPrepData(spAddress)` → `assembleShowingPrepDoc`. Fires only on showing-prep prompt + `scope.address`. Subject binds off `scope.address` directly — does NOT use the recipe resolver. Independent of the confirmed bug but is its OWN address-binding path (own check: does it get scope.address reliably? homepage-hero field only). |
| 17 | `app/api/projects/[id]/showing-prep/route.ts` | (same packet builder; project door). |

---

## SEND-ONLY PATHS (render an ALREADY-BUILT doc + deliver; no content build → no subject binding of their own)

These inherit whatever the build produced (broken or good) but cannot independently exhibit the bug.

| Entry point | Role |
|---|---|
| `app/api/deliverables/[id]/blast/route.ts` | One-off segmented blast. `renderEmailDocHtml` of the saved doc; A/B variants = subject/CTA text swaps only (`lib/email/blast-variant-doc.ts` — no model call, no content rebuild). |
| `app/api/lab/claim-and-send/route.ts` | "Send this to yourself" from the lab. Renders the POSTed current doc; ONE send to the OTP-proven address. No rebuild. |
| `app/api/email/broadcast/route.ts` | Low-level Resend broadcast POST (called by the scheduler worker). Pure delivery. |
| `app/api/projects/[id]/sequence/fire/route.ts` | Fires a FROZEN sequence doc (`renderEmailDocHtml`) — verbatim, no refill. |
| `scripts/email/run-schedules.mts` sequence-once lane | Renders the FROZEN saved doc verbatim (buildFrozenOccurrence) — no rebuild. |
| `app/api/email/schedule-command/route.ts` | Schedule SETUP (NL command → email_schedules row). No content build. |
| `app/api/deliverables/[id]/preview-html`, `/pdf`, `/restyle` | Render/restyle existing doc. |

---

## DOORS INTO THE AI-BUILD PANEL (all funnel to authorDoc; the DOOR decides whether recipeKey is set)

- `?rkey=<key>` rides the URL into `app/email-lab/grid/page.tsx:37` → EmailLabGridClient → `activeRecipeKey`
  → posted as `recipeKey` (`EmailLabGridShell.tsx:519,607`). Set by: hero pill, /showcase card,
  campaign button, lab example pick, project auto-build (`autoGenerate`/`initialAiPrompt`).
- **When rkey IS set** → authorDoc resolves the recipe + builder → subject binds correctly (given an
  address) → NO bug.
- **When rkey is ABSENT** (user free-types the ask into the Build box, exactly the confirmed repro) →
  authorDoc must recover identity from the prompt text, which fails for any phrasing that isn't the
  rigid registry head → generic author → **the confirmed generic-ZIP grab-bag.**

So the /showcase "Make this" and campaign flows likely AVOID the bug (they carry rkey); the raw typed
Build box is the exposed surface. This is a coverage flag for the fixers: the fix must make free-text
listing asks bind the subject too, not only rkey-carrying doors.

---

## SUMMARY OF FLAGS

- **Shares the confirmed bug:** #1 (AI-build panel, free-text path) — root cause is the
  recipeFromPrompt/isNewListingRecipePrompt/subjectAddressFromPrompt gate chain failing on natural
  phrasing with no rkey.
- **Own independent check needed:**
  - #6 scheduled re-render uses a DIFFERENT build root (buildContentDoc) than the original
    (authorDoc/recipe) — lifecycle producer divergence.
  - #4 hub Update — same buildContentDoc-re-fill class as #6; note it does NOT pass subject_address
    (materials/[did]/refresh passes only kind/value), so a listing's subject is not re-bound on Update.
  - #16/#17 showing-prep — its own scope.address binding (homepage-hero field only).
  - #3 ai-material — buildContentDoc fill, URL-gated flyer only.
- **Independent, not this bug:** #2, #5, #7, #8 (area/market by design); all of B (report engine);
  all SEND-only paths.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 3 | `app/api/email-lab/ai/route.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
