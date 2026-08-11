# HANDOFF — /go → its own project. Read this before touching `_GO/`, the carve-out doc, or go-playbook.md again.

**Written 08/11/2026, end of session.** Operator decree, verbatim scope: *"How do we being /go webpage
over to its own project? ... Opus already fucked up on this, so we have to do everything fucking new.
I want nothing connected to swfldatagulf except for the code we need to copy and rules we need to
build."* This is a planning handoff — **nothing was built or copied this session.** No new folder
exists yet.

---

## 1 — THE DECISION, AS GIVEN

- **/go becomes an actual separate project** — new local folder, own git repo, eventually its own
  domain. This **overturns** `docs/standards/go-playbook.md` PART 5 ("build a lane, not a route"),
  which was the right call on 08/11 morning for staying inside this repo. The operator reopened it
  same day, later session: *"Swfldatagulf.com/go is its own project."* Do not re-litigate — PART 5's
  reasoning was sound for the OLD scope, not this one.
- **New, separate, free-tier Supabase project, own account.** Confirmed live 08/11/2026
  (`supabase.com/pricing`, crawl4ai'd this session): Free = $0/month, 50,000 MAU, 500MB DB, 1GB
  storage, 5GB egress, unlimited API requests. Caveat: free projects auto-pause after 7 days idle,
  capped at 2 active free projects per account. Reason for a new project, not shared-tenant tables in
  the existing one: the copied auth/brand/project code is already built on `@supabase/ssr` +
  `@supabase/supabase-js` — reuse the stack, don't rewrite it, but don't share the database either.
- **Feeder = Apify property lookup ONLY.** No lake, no `refinery/`, no `data_lake.*`, no county/ZIP
  logic, no SWFL scope. This is confirmed already-catalogued: `docs/standards/data-roots.md` —
  `data_lake.apify_property_records` 🟢, 69 fields, keyed `address_key`. Write root
  `lib/listings/apify-record-store.ts`, fetch root `lib/listings/apify-comps.ts`
  (`fetchApifyComps`), spend guard `lib/listings/apify-spend-guard.ts` (off by default,
  `OPERATOR_APPROVED_PAID_RUN=1`, ~$3/process cap). **The table stays behind** (it's `data_lake.*`);
  the new project gets an EMPTY table of the same shape in its own Supabase project.
- **8 emails at launch:** the 7 listing-lifecycle keys (new-listing, coming-soon, market-comps,
  under-contract, just-sold, open-house, price-reduced) + listings-digest (area-keyed, the operator's
  standing "8th door" decree). listings-digest has no render script and no proven entry point —
  design it, don't assume it copies clean.
- **Lab scope, locked:** 3 panes only — projects (left), canvas (middle), design tools + AI (right).
  No social composer, no template gallery, no dataset browser, no contact picker/schedule-send. This
  matches `go-playbook.md` PART 3 exactly; that section is still correct and travels to the new repo.
- **Address-is-project, locked:** typing an address creates the project, named by the address; no
  untitled-project path; re-typing an existing address routes into it, never a duplicate. Matches
  `go-playbook.md` PART 4 exactly; still correct, still travels.
- **Design system is NOT re-litigated.** `app/_design/05-color-and-type.md` +
  `docs/design-reference/colors_and_type.css` copy verbatim — cited in the new playbook, not
  rewritten. Same for the executable form: `lib/email/blocks/scale.ts` (`text(role)`, 7 roles) +
  `lib/brand/fonts.ts`. **A raw fontSize/fontWeight/lineHeight/fontFamily anywhere fails
  `type-conformance.test.ts` in THIS repo — port that test and its enforcement, not just the tokens.**
- **CLAUDE.md is written fresh** for the new project only. **One new playbook** (not six documents)
  folding: `go-playbook.md` PART 0–4 (site shape, identity, chrome, lab scope, project contract —
  all still correct) + `docs/carve-out/EMAIL-BUILDER-CARVE-OUT.md`'s day-0 guard list (13 guards,
  minus the tenancy-specific ones that assumed user-uploaded files — Apify data isn't multi-tenant
  uploads, but DOES need the spend-guard equivalent) + `docs/carve-out/DAY-0-CLAUDE-SETUP.md`'s
  proven install runbook (meta-guard first, then session-start injection, then the log+gate, etc —
  that ordering is real and load-bearing, don't reorder it).

## 2 — PRIOR ARTIFACTS, TRIAGED

- **`_GO/` (321-file mechanical import closure) — SCRAP, not a starting point.** Its own `HANDOFF.md`
  admits the entry-point list is wrong: 2 recipes on it (`back-on-market`, `agent-brand-intro`)
  aren't on /go's menu, and `listings-digest` — which IS on the menu — was never walked from a real
  entry point at all. It also still carries the 50 lake-side files + 56 chart files the "apify-only"
  cut was supposed to remove, and that cut was never done. Re-run `_GO/closure.mjs` with a CORRECTED
  8-key entry list if you want a fresh mechanical inventory; do not trust the existing `MANIFEST.txt`.
- **`docs/carve-out/EMAIL-BUILDER-CARVE-OUT.md` (07/30) — KEEP the audit, DROP the parser.** Real,
  hard-won findings that still apply: `bind-frame.ts` and `pick-frames.ts` both reach into
  `refinery/` even though they look clean (two separate extractions needed, not a file move);
  `author-doc.ts`'s `narrative-lint` import reaches `refinery/lib/smoothing-tokens.mts`. Its §5
  (CSV/XLSX parser, SheetJS vendoring) **does not apply** — that doc was written for a
  user-uploads-a-spreadsheet product; ours is Apify-fed. Its day-0 guard list (§4, 13 guards) mostly
  transfers; re-score each one against "Apify data" instead of "user's uploaded file" before copying
  it in — e.g. G1 (cross-tenant read) still matters (a user's brand/project data), G5
  (re-upload invalidation) does not (nothing gets re-uploaded).
- **`docs/standards/go-playbook.md` (08/11 same day) — KEEP PARTS 0–4 and 6, DROP PART 5.** Its site
  shape, identity law, chrome mechanism, lab-only scope, and address-is-project contract are all
  still correct and match what the operator described again later the same day, independently. PART
  5 ("build a lane, not a route — NO") is exactly what this decree reverses. PART 7's open decisions
  (citation vs. white-label collision, send, sign-in scope, domain/timing) are still open — nobody
  answered them this session.

## 3 — CORRECTED, IN-SESSION: WHAT A "LISTING LIFECYCLE EMAIL" ACTUALLY IS

The operator's read going in: *"why do we have so many fucking routes for fucking emails."* Verified
against the actual code, not memory:

- **It is already supposed to be — and mostly is — ONE house, ONE resolver, ONE shared shape.**
  `lib/deliverable/recipes.ts`: the 7 lifecycle keys "share the new-listing subject spine and its
  resolver... NEVER write a second resolver." `lib/email/lifecycle-chrome.ts`'s `buildLifecycleEmail`
  is the ONE layout — header, agent card, and footer are STICKY (pulled off the existing canvas,
  never rebuilt per recipe) — and it was purpose-built 07/13/2026 for this exact complaint. Its own
  header documents the BEFORE state ("seven emails, seven different layouts") that matches what the
  operator is still seeing.
- **CORRECTED MID-SESSION:** first claimed `new-listing.ts` was the one holdout still using a
  separate grid function (`buildListingFlyer`) instead of the shared chrome. **That was wrong** —
  `buildListingFlyer` is itself "just a THIN CHROME CALL" that returns `buildLifecycleEmail(...)`.
  Read the whole file before naming it as a bug; a docstring skim produced a false claim here once.
- **The real proliferation is in the WIRING, not the recipes.** 9 separate
  `scripts/email/render-*.mts` dev scripts exist (one per recipe) because a prior session found the
  live "Build the email" button broken and built side-doors instead of fixing the front door — see
  `_GO/HANDOFF.md` §1. **That finding could not be reproduced this session**, verified 3 layers deep
  at current HEAD: `app/api/email-lab/ai/route.ts` → `authorDoc` (`lib/email/build-doc.ts`) →
  `recipeByKey`/`builderFor` (`lib/deliverable/recipes/index.ts`) → the real recipe builder → the
  shared chrome. Both the manual button (`runAuthor`) and the /go arrival auto-build (`runAutoBuild`)
  in `components/email-lab/EmailLabGridShell.tsx` send `build: true` and `recipeKey` correctly. **So
  `_GO/HANDOFF.md`'s root-cause claim (the button "never calls resolveSubject") is either stale or
  was simply wrong at the time — do not carry it into the new repo as fact without re-verifying.**
- **One real, still-unconfirmed risk found:** `activeRecipeKey` in `EmailLabGridShell.tsx` is set
  ONCE at mount from the URL (`initialRecipe?.key ?? null`) and can go null on re-entry into an
  existing project or a re-typed prompt. When it's null, the server falls back to fuzzy
  prompt-matching (`recipeFromPrompt`) and, on a miss, lands on `default-grid` — a completely
  different, un-chromed skeleton (`fillSkeletonFromSources`, no `buildLifecycleEmail` at all). This
  would produce exactly the symptom described (inconsistent headers/fonts across builds) **but was
  never confirmed against production data** — a live query against `project_activity`
  (`deliverable_built` events) was attempted via the Supabase MCP and blocked on an interactive OAuth
  step. **Flag, don't assume:** whoever picks this up should either complete that OAuth and check
  real `recipeKey` values on recent builds, or reproduce it live by re-opening an existing project
  and re-typing a build request without a fresh /go click.

## 4 — THE ACTUAL BUG THE OPERATOR MEANT (this closes the thread)

Verbatim, closing message: *"Nothing I'm talking about through /go except that it was pulling up the
7 block skeleton and building incorrectly because the skeleton blocks shouldn't be there. It may
have been fixed by now, who knows."*

This is **not** the chrome/wiring investigation above — it's the ARRIVAL state, and it is **already
documented**, found and fixed once already: `_ASSISTANT/SCRATCHPAD.md`, 08/11 entry, "whenever you
have to put in an address or choose, NO NEW PROJECT" / "every first land at email labs needs to be
fucking BLANK." Verbatim from that entry: *"BLANK MEANS BLANK... both shots land on
`skeleton-clean-white`... First land renders nothing."*

**STATUS: UNVERIFIED THIS SESSION.** Not re-tested live. Do not assume it is fixed and do not assume
it is broken — the operator's own words are "who knows." **This is now a locked, non-negotiable
requirement for the new project, independent of whatever brain-platform's current state is:**

> **The email lab's first landing, on ANY arrival — address typed, recipe picked, project opened —
> renders BLANK. No pre-filled 7-block skeleton. No placeholder content of any kind on first paint.**
> A build only puts content on the canvas when it actually has data to put there. This is a day-0
> acceptance test for the new project, not a nice-to-have: `arrival-renders-blank`, driven live in a
> real browser before anything is called done (screenshot required — a token/DOM audit cannot see a
> pre-filled skeleton the way a screenshot can; `feedback_render-and-look-before-calling-it-done`
> applies directly here).

## 5 — REFERENCE ARTIFACT (still exists, still the bar)

`ohio-million-dollar-new-listing.html` — `%USERPROFILE%\Downloads`, 23,135 bytes, written 08/10/2026
5:11 PM. Real end-to-end build: 3166 Melbury Drive, Columbus OH, $849,000, Apify-fed, one vendor run.
This is the visual and functional quality bar for the new project's first slice — not a hypothetical,
a real file on disk. Open it and look at it before building anything that's supposed to match it.

## 6 — NEXT SESSION, IN ORDER

1. **Verify §4 live** — drive a real /go arrival in this repo (or skip straight to building the new
   repo's version blank by construction, never inheriting whatever state brain-platform is in).
2. **Corrected file closure** — re-run `_GO/closure.mjs` (or a fresh walk) from the real 8 entry
   points, not the 9 wrong ones `_GO/MANIFEST.txt` currently has.
3. **Per-recipe chart audit** — confirm which of the 8 actually render a chart before deciding how
   much of `components/charts/` (56 files in the old closure) is needed.
4. **Stand up the new folder** — propose `C:\Users\ethan\dev\go-email\` (sibling to brain-platform,
   renameable), `git init`, new free Supabase project, fresh migrations for users/brand/projects
   (schema re-derived from the existing tables, not guessed).
5. **Day-0 guards**, in `DAY-0-CLAUDE-SETUP.md`'s proven order — meta-guard first, nothing else is
   trustworthy until it's red-then-green.
6. **CLAUDE.md + the one new playbook**, per §1 above.
7. **Port the verified-clean core** (§2's audit) + wire the Apify rung + resolve the §3 `default-grid`
   fallback question for real before building on top of it.
8. **First running slice:** one address, in, through /go, New Listing, blank arrival, real Apify
   data, matches the Ohio reference's quality bar. Open it and look before calling it done.
9. Only then extend to the other 6 lifecycle emails + design the listings-digest entry point.

## 7 — OPEN, OPERATOR-ONLY DECISIONS (unanswered, carried from go-playbook.md PART 7)

1. Citations vs. white-label — listing citations saying "SWFL Data Gulf" is locked elsewhere; a
   white-label product naming us contradicts the no-identity rule. Not decided.
2. Does the new /go lane send, or hand off to sign-in for send? Not decided.
3. What does a signed-out visitor lose — save, send, or nothing? Not decided.
4. Exact new-repo name/domain — not decided; this handoff proposes a placeholder path only.
