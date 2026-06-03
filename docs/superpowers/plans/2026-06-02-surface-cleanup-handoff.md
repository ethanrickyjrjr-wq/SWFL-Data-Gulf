# Handoff: User-Surface Cleanup + Broken-Problem Fixes

**For:** next Claude session · **Owner decisions:** Ricky · **Status:** draft for operator edit

> Operator edits this file directly. Each open call is marked **⬜ DECISION** — fill in
> your answer inline before this is executed. The next Claude follows the decisions as written.

## 0. The core diagnosis (read first)

Almost nothing here is a data problem. The recurring disease across every item below is
**built in isolation, never wired together**: two separate page renderers where only one got
the hygiene rules; a chart designed in a sandbox that never entered the app; data ingested but
not connected. Do **not** "rebuild" anything to fix these. The parts exist — the job is
connecting and cleaning them.

**Scope guardrails:**

- **Charts are a SEPARATE workstream** (already started with the operator). Do not build chart
  rendering/routing here. This brief is everything _else_.
- Do **not** touch the `/targets` route — it has a known-bad commit (`b6572a6`) mid-redesign.
- User-facing **brand** is "SWFL Data Gulf" + 3-wave logo. Internal code names (`BrainOutput`,
  `brain_id`, `refinery/`) are a _separate_ decision — **do not rename code**, only clean what
  users see.
- `SESSION_LOG.md` entry before any push. `node scripts/safe-push.mjs`, never raw push.

---

## 1. Surface 1 — the `/r/[slug]` report page (e.g. `/r/master`) leaks everything

**Root cause:** `app/r/[slug]/page.tsx` is a second renderer that bypasses the speaker layer
entirely. It reads the raw parsed `BrainOutput` and dumps fields with internal labels
hardcoded. Verified live on `/r/master` (token `SWFL-7421-v67-20260602`).

**Confirmed leaks (file:line):**

| What shows                                                           | Where                                | Fix                                                   |
| -------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| "Brain Report" eyebrow label                                         | `page.tsx:93`                        | Remove; brand as SWFL Data Gulf + 3-wave logo         |
| h1 prints raw `brain_id` ("master")                                  | `page.tsx:95`                        | Use a human display name, not the id                  |
| "Trust tier: T3" header stat                                         | `page.tsx:108`                       | Remove entirely                                       |
| "Tier" column + `T{tier}` cells                                      | `page.tsx:147,164`                   | Remove the column                                     |
| Internal slug under each metric (`cap_rate_median`…)                 | `page.tsx:156–158`                   | Remove the slug line                                  |
| Source cell dumps all 25 corridors inline (the "can't read it" wall) | `page.tsx:172` (`m.source.citation`) | One short label + link; full list → drill-down page   |
| 49 caveats dumped in full                                            | `page.tsx:183–192`                   | Move to drill-down; show few/none on main view        |
| "Upstream drivers" lists raw `brain_id`s                             | `page.tsx:208`                       | Remove or map to display names                        |
| Footer link text literally "tier=1 · tier=2"                         | `page.tsx:256–269`                   | Drop tier from visible link text (URL param can stay) |
| Stale (e.g. June-1) data dates on main view                          | n/a                                  | Move to drill-down page                               |

**Preferred fix shape:** route this page through `refinery/render/speaker.mts` (or a shared
display-normalizer) so it is **structurally impossible** to print `brain_id`, slugs, or tier
here. One chokepoint, not field-by-field patching. This is the single highest-leverage fix in
the brief.

**✅ DECISION 1 — CLOSED (refactor track, commit 92ca539):** `/r/[slug]` now routes through
the speaker layer. Structurally impossible to print `brain_id`, slugs, or tier on this surface.
Display-leak CI guard added in the same commit. Do not re-open.

**✅ DECISION 2 — CLOSED (new route, commit a0b9846 + d58f546):** Corridor drill-down ships
as `app/r/cre-swfl/[corridor]/page.tsx`. TypeScript clean, ESLint clean. No further work on
the drill-down page itself.

**⚠️ HOLD — parent-page link wiring NOT approved:** Wiring corridor links in the
`app/r/cre-swfl/page.tsx` parent listing loop requires a diff review first. Show the specific
corridor-loop block, get explicit operator green light, then edit. Do not infer approval from
the drill-down shipping.

---

## 2. The speaker layer itself still has residual leaks

Even the cleaned path (`/api/b/master?view=speak&tier=2`) returned `"trust tier T3"`,
`"20 upstream brains"`, and `master` in user-facing strings. So the speaker layer
(`refinery/render/speaker.mts`) is not fully clean either.

**Fix:** audit speaker output for `tier`, `brain`, `master`, `upstream brains`, internal ids.
Per CLAUDE.md render rules these must not appear in tier-1/2 prose. Add a lint/test so they
can't regress.

**⬜ DECISION 3:** Should "20 upstream brains" become plain language ("20 data sources"), or be
dropped entirely?

> Operator answer:

---

## 3. Surface 2 — corridor voice answer format (the Vanderbilt example)

**KEEP** the breakdown blocks — Facts, Chart, Speculative. The operator explicitly wants the
"breakdown of what's going on." (An earlier session wrongly specced deleting these — that was
wrong, ignore it.)

**DROP:**

- the **FACT PACK** (the debug table of every metric/source/gap at the bottom) — internal only
- the **raw inline citations block**

**CHANGE:**

- Lead with the answer; meta/scope preamble off the top
- `[internal-N]` markers → the 3-wave logo; `[web-N]` stays as-is
- Links + freshness token go at the **bottom**
- Soften the **"Quote it verbatim"** instruction at `cre-swfl.mts:1209` → the corridor voice
  should **shape the synthesis tone, not pass through verbatim**. Operator wants it to
  _dissolve into_ a richer picture, not surface as raw voice text. (This also closes the
  verbatim-leak risk.)

**⬜ DECISION 4 (unanswered so far):** the block **labels** — show as readable headers ("The
facts," "Outlook"), keep current labels, or just let content flow with no labels?

> Operator answer:

**Note:** the Chart block inside this answer is handled by the **separate charts workstream** —
don't render it here.

---

## 4. Broken-problem backlog (evidence-based, no guessing)

1. **Fort Myers Beach "still broke after 12 hours."** Likely the _same_ surface problem above,
   not data — FMB data exists (ZIP 33931, ~$30,074/yr AAL). **Action:** after the surface
   fixes, re-test the FMB question end-to-end and confirm. If it's still wrong, _then_ it's a
   real data/routing bug — debug from there, don't assume.
2. **25 vs 26 corridors.** Two earlier sessions _guessed_ "merged or never seeded."
   **Action:** run the actual Supabase count on `corridor_profiles`. Resolve, don't guess.
3. **The "good test voices."** Operator remembers earlier voice output that was strong; current
   output feels weak. The `step4-spot-checks` audit page does **not** show a voice-quality win
   (it's fact-blocks + data gaps). **Action:** locate the actual artifact of the good voices
   before assuming the generator regressed; pin the real before-state.
4. **Chart 4.4 vs 4.3 coherence break** — facts said 4.4% vacancy, chart said 4.3. **Belongs
   to the charts workstream**, flagged here so it's not lost.

**⬜ DECISION 5:** Orphan data wiring — yesterday's audit found two genuine orphans:
`dbhydro_stations` (12,937 rows, no connector → env-swfl) and `bls_qcew` (orphan connector →
macro/labor). These are _unwired_, not _broken_. Want them in this pass, or tracked as a
separate "wire what exists" task? _(Recommend separate — keep this brief about the user
surface.)_

> Operator answer:

---

## 5. Verification before any "done" claim

- Re-fetch `/r/master` live and confirm zero occurrences of "Brain Report", "tier"/"T3",
  internal slugs, raw brain_ids.
- Re-fetch `?view=speak&tier=2` and confirm the same.
- Re-run the FMB question and paste the actual output.
- Run the corridor count and paste the number.
- Tests + typecheck green; `SESSION_LOG.md` entry; safe-push.

---

## ✅ CLOSED — 2026-06-03 (Opus 4.8) — DO NOT re-open from this doc

This handoff is **superseded by the `checks` ledger** (RULE 2). It was the exact failure
RULE 2 now fixes: a hand-edited status board whose `⬜/✅` markers rotted as code shipped past
it. Verified against current code this session:

- **Decisions 1 & 2** — resolved in code: `/r/[slug]` + chat both route through one
  display-normalizer with a build-failing leak guard (`refinery/render/display-leak.test.mts`,
  **3/3 green this session**; commit `92ca539`). Corridor drill-down page shipped.
- **Decision 3** — moot: its premise ("speaker still emits '20 upstream brains'") is false in
  current code (grep-clean; tier/master/slug all scrubbed at `speaker.mts:293` + guarded).
- **Section 3 / Decision 4** — the verbatim-softening already shipped (`cre-swfl.mts:1213`:
  "let it dissolve into a richer picture … do NOT paste it through verbatim"). The block-label
  cosmetic choice, if still wanted, is a fresh design task, not a leak.
- **Remaining open work migrated to `checks`** (run `node scripts/check.mjs list`):
  `surface_parent_links` (parent-page link wiring, ON HOLD — needs diff review),
  `row_floor_guard` (issue #61), `wire_orphan_data` (dbhydro + qcew).
- **Section 4 verifications** (FMB end-to-end retest; the 25-vs-26 corridor count) are **still
  unrun** — they are not leaks and not blockers; do them when the surface work resumes, against
  live data, not from this doc.

Status from here lives in the ledger, not in this file.
