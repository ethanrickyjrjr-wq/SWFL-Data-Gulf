# Site Scope Audit — every button, what it wires to, why it's dead

**Date:** 2026-06-15 · **Mode:** read-only diagnosis (no code written, nothing pushed)
**Method:** 12 parallel code investigators + 12 adversarial verifiers (each verifier re-opened the cited lines and tried to refute the root cause). 11/12 root causes survived; the highlighter one was overturned by its verifier (see #6).
**Boundary:** email templates / `app/api/email/**` / `scripts/email/**` belong to the other instance. Items touching them are flagged `EMAIL-OWNED` — diagnosed only.

---

## THE BLUNT BOTTOM LINE

The site looks more broken than the code is. Three forces are stacked:

1. **Errors are being SILENTLY SWALLOWED.** There are zero App Router error boundaries, and the only error boundaries that *do* exist (around charts) are written to render `null` on failure — i.e. they *hide* the error. So when something throws, you get a blank or "Data unavailable" with no clue. That's why "nothing works" is invisible. (#1)
2. **Prod is probably running pre-fix code.** The build queue marks Plan A/B/C **"PROD HELD"** behind your gate. Several "bugs" (add-to-briefcase, the stale-badge fix, charts) are **already fixed in committed code** but not deployed. We may be chasing ghosts against a stale deploy. (#7, #10)
3. **A handful are genuinely, simply broken** — and they're cheap. The CRE citation blob, the `$400,000` formatting, the workforce URL leak, the disabled "Build deliverable" button, the dead mobile hamburger. These are real and small. (#2, #3, #4, button-inventory)

**Two of your "confirmed bugs" are phantoms in code** (#5 four-tabs, and the #6 highlighter "flag off" theory) — verify them in a real browser before writing any fix, or we burn time patching code that's already correct.

**Recommended first move before building anything:** deploy the held Plan A work + bust the `/charts` ISR cache, then re-test #6/#7/#10 live. Half of them may evaporate.

---

## STATUS TABLE

| # | Item | Verified verdict | Where | Effort |
|---|------|------------------|-------|--------|
| 1 | Error boundaries | **REAL gap** — none exist; existing chart boundaries swallow to null | new `global-error.tsx` + `/p/[id]/error.tsx` + visible chart boundary | S (2-3h) |
| 2 | CRE citation blob | **REAL, worse than reported** — measured 3.4k–4.0k chars each; dossier carries **87.8k chars** of citations | `refinery/packs/cre-swfl.mts:189-200` (baked into brain output) | S (1.5-2.5h) + rebuild |
| 3 | `400000` not `$400,000` | **REAL** — harvest stringifies raw number, drops currency format | `lib/deliverable/examples.ts:97` | S (1-2h) |
| 4 | Workforce email inline URLs | **REAL but NOT email** — URL baked into brain conclusion prose | `refinery/packs/labor-demand-swfl.mts:255-259,335` | S (~1h) |
| 5 | "Open in mail" → 4 tabs | **PHANTOM in code** — single `mailto:`, can't open tabs | `app/p/[id]/DeliveryButtons.tsx:82` | verify in-browser first |
| 6 | Highlighter broken | **DIAGNOSE** — code intact + flag ON; either wrong page (/p, /c) or latent runtime defect, never verified live | `/r/*` only; flag default-ON | verify live first |
| 7 | Add to Briefcase broken (all) | **UNCONFIRMED in code** — chain intact, the one real bug already fixed at HEAD; likely stale prod or load-wipe footgun | `lib/briefcase/draft.ts:30-37` (footgun) | verify deploy first |
| 8 | "File Q&A" missing in panel chat | **REAL missing feature** — reuse exists in popup | `components/briefcase/BriefcaseChat.tsx` | S (1-2h) |
| 9 | AI panel = two UIs | **REAL, by design** — two backends, two threads | `AiBriefcasePill.tsx:36` fork | L (A: 2-3d / B: 7-10d) |
| 10 | Charts "Data unavailable" | **PHANTOM today** — data + grants + render all verified live healthy; was stale ISR cache | `app/charts/page.tsx:251` | verify in-browser first |
| Card | Metric card redesign | **REAL, all 7 reqs greenfield** — two card paths, citation buries value | `app/p/[id]/page.tsx:243-256` + `/r/` MetricsTable | L (14-20h) |
| Btn | Button inventory | done — 60+ controls mapped; 5 real-broken below | cross-cutting | — |

---

## PER-ITEM DETAIL

### #1 — Error boundaries (PREREQUISITE, build first)
**State (verified):** Zero `error.tsx` / `global-error.tsx` anywhere in `app/`. The only special file is `app/p/[id]/not-found.tsx` (a 404 handler, not an error catch). Three hand-rolled chart boundaries exist — `ReportChart.tsx:22-33`, `registry/FrameRenderer.tsx:17-25`, `CREMarketBeatChart.tsx:18-26` — and **all three render `null` on catch**, deliberately hiding the failure so "one bad frame doesn't take the page down." That's the opposite of what you need to debug.

**Build (3 files):**
- `app/global-error.tsx` — Client Component; must render its own `<html><body>`; print `error.message` + `error.stack` in a bare `<pre>`.
- `app/p/[id]/error.tsx` — Client Component; auto-wraps the deliverable page render; bare `<pre>` of message+stack.
- One shared `<DebugErrorBoundary>` client class wrapping the **3 unwrapped** `ChartBlockView` mounts: `app/p/[id]/page.tsx:157`, `app/c/[id]/page.tsx:53`, `app/embed/charts/page.tsx:341`.

**Gotchas:** (a) In prod, Next.js **strips Server Component error messages** (replaced with a digest) — to actually read server throws on screen you need dev mode or server-side logging; verify Next 16 behavior. (b) `error.tsx` does **not** catch `generateMetadata` throws (`page.tsx:383-396`, async DB call) — those bubble to the parent/global boundary. (c) Don't flip the existing null-swallow boundaries in prod — add a *separate* debug boundary so you don't change production resilience.

---

### #2 — CRE citation blob (REAL — and 5× worse than the brief said)
**Root cause:** `buildCreAggregateSource` (`refinery/packs/cre-swfl.mts:189-200`) enumerates **every** contributing corridor as `"Name (City, County) [url]"` joined by `"; "`, baked into `BrainOutput.key_metrics[].source.citation`. The verifier parsed the live `brains/cre-swfl.md` (v54) and **measured** it:
- `cap_rate_median` = **3,604 chars** (25 corridors)
- `vacancy_rate_median` = **3,959 chars** (27)
- `absorption_sqft_median` = **3,399 chars** (23)
- `asking_rent_psf_median` = **4,036 chars** (27)
- **Whole dossier = 87,843 chars of citation text** across 179 key_metrics, passed *whole* to the downstream Claude via `lib/fetch-brain.ts:214` → ships on `/api/b/cre-swfl?format=json` and MCP `_meta.dossier`.

The on-page `/r/` table is already protected (`speaker.mts:561` `shortSourceLabel` caps at 72 chars) — **the leak is the dossier/MCP payload**, not the report page.

**Fix:** collapse the citation in `buildCreAggregateSource` to `"Supabase corridor_profiles (N of M corridors, verified non-deleted)"` + one MarketBeat URL (<120 chars). Same pattern in `buildMarketbeatAggregateSource` (216-237) and `buildMarketbeatRollupSource` (440-461). **Leave** `buildMarketbeatSubmarketSource` (286-315) — it's bounded and tested (`cre-swfl.test.mts:446-453`). The reproducible `source.url` (PostgREST query) stays intact, so no provenance is lost. **Requires a `cre-swfl` rebuild** (`--target-only` to skip the egress hang) + commit the regenerated `.md`. Add a length-bound test (fixture is only 10 rows, too small to catch it today).

---

### #3 — Median price renders `400000` (REAL, display layer)
**Root cause:** `harvestMetricItems` at `lib/deliverable/examples.ts:97` stores `value: String(m.value)` — stringifies the raw number and **discards** `m.display_format` (`currency`) + `m.units` (`USD`). The metric item schema (`lib/project/items.ts:43`) has no format field, so the info is gone by render time. `app/p/[id]/page.tsx:252` prints the string verbatim (renderer is innocent).

**Fix:** format at harvest using the currency formatter that **already exists 3×** (`speaker.mts:471` `formatValue`, `zip-dossier.ts:317`, `fetch-brain` `formatDetailCell`). Best: extract ONE shared `formatBrainMetricValue` and call it. Update `examples.test.ts:52` (currently locks in the buggy `"400000"`).

**Verifier catch (load-bearing):** `lib/deliverable/build.ts:182-187` `collectSnapshotNumbers` feeds `item.value` into the narrative-faithfulness lint's anchor set. Changing `"400000"`→`"$400,000"` must still **parse back to 400000** or the lint can break. Also reconcile the two rounding behaviors (digits:2 vs digits:0) when consolidating formatters.

---

### #4 — Workforce "email" inline URLs (REAL — but it's a BRAIN bug, not email)
**Root cause:** `refinery/packs/labor-demand-swfl.mts:255-259` concatenates the raw `CITATION_URL` (`https://www.bls.gov/oes/tables.htm`) **into the conclusion prose** (and again at `:335` in `corpusSummary`). The shared speaker layer renders conclusions verbatim — no rule strips bare URLs. It lands in `brains/labor-demand-swfl.md:48` and ships on the speak API, dossier, and MCP today.

**Important:** there is **no built "Workforce Demand Email."** The production digest (`scripts/email/fetch-digest-data.mts:286-289`) never fetches `labor-demand-swfl`. The bug is real but currently surfaces on MCP/speak, not email.

**Fix (shared, NOT email-owned):** drop the trailing `"Source: ... (URL)."` clause from the conclusion (`:255-259`) and the corpus fact (`:335`), re-render the brain. The citation already lives correctly in each metric's `source` object, so no provenance lost. **Don't rely only on a speaker-layer URL stripper** — `buildDossier` returns the conclusion verbatim (`fetch-brain.ts:206`), bypassing the speaker entirely, so only the pack fix clears the dossier/MCP path.

---

### #5 — "Open in mail" → 4 tabs (PHANTOM in code — verify in-browser first)
**Verified:** `app/p/[id]/DeliveryButtons.tsx:82-88` is a **single `<a href="mailto:...">`** with no `target`, no `window.open`, no loop; its `onClick` only POSTs to `/api/meter`. A `mailto:` link **opens no browser tabs** — it hands off to the OS mail client. Mounted exactly once (`page.tsx:469`). The only `window.open` in the whole repo is `ShowcaseGrid.tsx:29` (unrelated, opens 1).

**Conclusion:** code cannot produce 4 tabs. Most likely a browser mailto-handler/extension misconfig, or you're describing a different control. **Do NOT patch blind** — reproduce in your browser, capture which handler fires. If you "fix" it by adding `preventDefault` + `window.open` to a webmail URL, you'd *create* a real multi-tab risk.

---

### #6 — Highlighter broken (DIAGNOSE-FIRST — findings, awaiting your go)
**Verified:** The text-selection highlighter only exists on `/r/*` pages. It is **NOT built** on `/p/[id]` (deliverable) or `/c/[id]` (saved chart) — zero highlighter code there. On `/r/*` the code path is structurally intact (`HighlighterLayer.tsx:108` renders the popup on selection; `use-highlight.ts` listeners attach; last touched *before* the briefcase refactor, so the refactor didn't break it).

**The investigator's "flag is OFF in prod" theory was REFUTED by its verifier:** `flag.ts:7-12` defaults **ON** (false only if exactly `"0"`/`"false"`); commit `e244bad` says "HIGHLIGHTER_UI=1 live in Vercel prod"; the "default OFF" doc is **stale** (flag was flipped to default-ON by `328067a` on 06-11).

**Two real candidates (need your input + a live check):**
1. **Wrong page** — if you're testing on `/p/[id]` or `/c/[id]`, the highlighter was *never built there*. That's a scope decision (build it?), not a bug. **Which page were you on?**
2. **Latent runtime defect on `/r/*`** — the open `highlighter_ui_live_verify` check was never closed; the popup may have shipped **dark** and never worked end-to-end in a real browser. Suspect popup positioning (`HighlightPopup.tsx:360` visibility flip) or `/api/converse` streaming.

**Cheap harmless cleanup anytime:** dead `#briefcase-tray` token in `SUPPRESS_CLOSEST` (`use-highlight.ts:33`) — tray was retired in A-3.

**→ Tell me which page + I'll do a live browser session to pin it before any fix.**

---

### #7 — Add to Briefcase broken for ALL types (DIAGNOSE-FIRST — findings, awaiting go)
**Verified:** No single code-level break found. Chain is intact: every filing button (`AddToProject` on `/c/[id]`, "File this figure/answer/chart" in the popup/dock) → `briefcase.fileItem()` → `addItem` → `saveDraftTo(localStorage)`. `BriefcaseProvider` is mounted at root (`app/layout.tsx:43`) wrapping every page, so the call is never null-skipped. Unit tests 5/0. The one real prior bug (saved-chart stale badge, AUDIT #10) is **already fixed in committed code** (`AddToProject` now files via `fileItem`).

**So why would it fail everywhere?** Two non-code suspects:
1. **Prod runs pre-fix code** — Plan A is "PROD HELD" per `build-queue.md:33-35`. Confirm the deployed commit before assuming a code bug.
2. **The load-side whole-draft-wipe footgun** (`lib/briefcase/draft.ts:30-37`): `loadDraftFrom` parses the *entire* array with `projectItemsSchema.parse` and returns `[]` on **any** failure. One malformed/stale-shape item wipes the whole draft on next page load → feels exactly like "nothing I add ever sticks." If that's the symptom, fix = resilient load (filter to individually-valid items), not the filing path.

**Verifier note:** there's no control literally named "Add to Briefcase" — surfaces say "Add to project" / "File this …". An audit keying on the literal string would falsely report it "missing."

**→ Confirm what's deployed + reproduce in-browser (watch the pill count badge). I'll pin which of the two it is before touching code.**

---

### #8 — "File this Q&A to Briefcase" missing in panel chat (REAL missing feature)
**Verified:** `BriefcaseChat.tsx` has no file/save control, no `useBriefcase` import, no reportId. The identical action works in the popup (`HighlightPopup.tsx:562-569` `fileAnswer` → `fileAndMeter` → `briefcase.fileItem` with a `kind:"qa"` item). Worse: the panel's own copy (`BriefcasePanel.tsx:101`) *promises* "file the answers" — a promise the standalone chat can't keep.

**Build:** import `useBriefcase`, add a "File this answer" button under each complete assistant message, pair it with `messages[i-1]` (the question), call `fileItem({kind:"qa", ...})`. **One snag (your call):** the `qa` schema requires `report_id` (`items.ts:24`) and the panel has none. Either (a) pass a sentinel `report_id:"briefcase-chat"` (zero schema change) or (b) make `report_id` optional on the `qa` kind (touches shared schema). No new backend.

---

### #9 — AI panel is two UIs (REAL, by design — unification scope + estimate)
**Verified:** One corner button (`AiBriefcasePill`), but it forks at `AiBriefcasePill.tsx:36` on `bridged = reportId present`:
- **`/r/*` → `AskAiDock`**: `/api/converse` (grounded per-report), shared thread with the highlight popup, charts, draggable/resizable floating window (`id="ask-ai-dock"`).
- **everywhere else → `BriefcasePanel`** (`BriefcaseChat` → `/api/welcome/chat`): Haiku funnel, no grounding, no saved thread, no charts, plus the pitch/draft/build flow.

Two backends, two thread models, two feature sets. Deliberate Phase-2 deferral (`A/README.md:88-94`), not an accident.

**Options:**
- **A — one shell, two engines (~2-3 days):** extract a shared `ChatShell`, de-dupe the chart card + `FILABLE_FRAMES` (duplicated in `AskAiDock.tsx:23` + `HighlightPopup.tsx:19`), reskin. Visual unification only; thread stays split.
- **B — one chat engine = the locked "one shared thread" decision (~7-10 days):** reconcile `/api/welcome/chat` vs `/api/converse` protocols, lift the thread store off `/r/*` (HighlighterContext only mounts there), merge bodies.

**What breaks if done carelessly:** `#ask-ai-dock` id is load-bearing for selection-popup suppression (`use-highlight.ts:33`); the dock+popup shared thread; `/r/*` one-pill suppression logic; two separate weekly-cap meters. **`/api/welcome/chat` is the email-click funnel** — coordinate with the email instance before Option B. **Recommend A first, B as a separate later PR.** Don't attempt B in one commit.

---

### #10 — Charts "Data unavailable" (PHANTOM today — verify in-browser first)
**Verified live via lake MCP + a direct PostgREST probe:** the string at `app/charts/page.tsx:251` fires **only** on a query error. All four sources are healthy: `zhvi_pivoted` 316 rows, `zori_pivoted` 134/136, `tier_divergence_pivoted` 363/363, `rsw_airport_monthly` 516 non-null — all with `service_role` SELECT grants, and **all four returned HTTP 200 with real rows** through the exact `Accept-Profile: data_lake` REST calls the page makes. Mappers tolerate empty (would show "No data yet", not "Data unavailable").

**Root cause:** almost certainly a **stale ISR cache** (`revalidate=3600`, `page.tsx:19`) rendered during the window *before* the pivoted-view migrations landed live (zhvi/zori `ce2084f` 06-12; tier-divergence 06-14). Once revalidated, it self-heals.

**→ Load https://www.swfldatagulf.com/charts now.** If the 6 panels render, close this. Optional hardening: drop/lower `revalidate=3600` or bust cache after view migrations so a pre-migration deploy can't cache a dead page for an hour.

---

### CARD REDESIGN (REAL — all 7 requirements greenfield, own PR)
**Two card paths, not one:**
- **`/p/[id]` deliverable** (`renderStat`, `page.tsx:243-256`) → `renderCitation` prints `source.citation` **verbatim, no truncation, no corridor-list ban**. *This is the 800-char wall.*
- **`/r/` report** (`MetricsTable`) → already shortened to 72 chars via `shortSourceLabel`. Not the wall, but no toggle / no per-card Add-to-Briefcase.
- **Homepage "SEE A LIVE EXAMPLE"** (`BriefcasePanel.tsx:105-122`) = 4 link tiles → `/p/example-*` (the "long prose page" you see). Fix is downstream at `/p/[id]` card render.

**None of the 7 requirements exist.** `--card-accent` is greenfield (zero hits); accents are hardcoded teal.

**Build sketch:** new shared `MetricCard.tsx` (hero value, 1-line label, "i" toggle → single `Source: <name>` + 1 URL, `--card-accent` CSS var defaulting teal in `globals.css`, per-card Add-to-Briefcase reusing `fileItem`, ~120px collapsed). Relocate inference notes behind a bottom "Analysis Notes" toggle (`renderInferenceNotes`, `page.tsx:304-322`). Adopt on `/r/` + CRE StatBox too.

**Two real tensions (your call):**
1. **Req-4 "no corridor lists ever" vs your "DON'T change brain output."** The corridor list is authored in `cre-swfl.mts source.citation`. To honor "don't change brain output," strip it at the **render layer** (`page.tsx renderCitation`) — which has the bonus that it fixes **existing stored deliverable snapshots AND new ones instantly**, whereas a harvest-layer fix (`examples.ts`) only takes effect on the next example rebuild.
2. **Short+full citation on `/p/`:** `StatSlot` (`templates.ts`) carries only `source_label`/`source_url` — no `source_full`. Adopting short-by-default-with-toggle needs a `StatSlot` type-lift (add `source_full`) + harvest change, not just a render swap.

**Workforce Email card** = `EMAIL-OWNED` (`scripts/email/DigestEmail.tsx:246-265`) — coordinate. The client-email *deliverable* template (`templates.ts:534-581`) emits no stat cards, so the redesign barely touches it on our side.

---

## REAL-BROKEN BUTTONS (from the cross-cutting inventory — 60+ controls mapped)

These are the *actually* broken/dead controls (most of the 60+ are wired and working):

1. **Project "Build deliverable" button** — `ProjectDetail.tsx:323-330` is **hardcoded disabled** ("Coming soon", `TODO(S6)`), yet `app/api/projects/[id]/build/route.ts` is a **complete working POST with ZERO frontend callers**. The actual build trigger is missing from the UI. *This is a strong candidate for "why nothing works."*
2. **Landing mobile hamburger** — `Header.tsx:147-156` has **no `onClick`**. Mobile nav can never open.
3. **TemplateSwitcher chips on public `/p/[id]`** — render for every viewer (`page.tsx:467`), but `restyle` returns 401/403 for non-owners → a recipient clicking a template chip gets a **silent no-op**. Hide it for non-owners or surface the error.
4. **"Upload your data · soon" (dock)** — `AskAiDock.tsx:508-515` permanently disabled.
5. **"Request this data" (popup data-gap)** — `HighlightPopup.tsx:576-582` only calls `onClose()`; **nothing is recorded.**
6. **"File this chart"** (dock + popup) — intentionally gated to `FILABLE_FRAMES={"bar-table"}`; all other chart types are "coming soon" stubs (by design, not a bug).
7. **Stale doc comment** — `app/r/[slug]/page.tsx:263` says highlighter "default OFF"; the code defaults ON.

---

## RECOMMENDED SEQUENCE (each its own PR; you push)

**Phase 0 — kill the ghosts (no code, or trivial):**
- Deploy the held Plan A work; load `/charts` + a `/r/*` report in your browser; confirm add-to-briefcase + highlighter live. This likely closes #5, #6, #7, #10 or tells us they're real.

**Phase 1 — infra:** #1 error boundaries (so every later bug is *readable*).

**Phase 2 — cheap real bugs (S each):** #3 currency format · #4 workforce URL (brain) · #2 CRE citation collapse · the Build-button wire + hamburger + TemplateSwitcher gating from the inventory.

**Phase 3 — features:** #8 file-Q&A button · Card redesign (L) · #9 panel unification (L, Option A first).

---

## DECISIONS I NEED FROM YOU
1. **#6 highlighter:** which page were you on — `/r/*`, `/p/[id]`, or `/c/[id]`?
2. **Card req-4:** strip corridor lists at the **render layer** (fixes existing + new instantly, honors "don't touch brain output") — agree?
3. **#8 qa filing:** sentinel `report_id` (zero schema change) or make it optional (touches shared schema)?
4. **#9 panel:** Option A (one shell, ~2-3d) first, or go straight to B (~7-10d)?
