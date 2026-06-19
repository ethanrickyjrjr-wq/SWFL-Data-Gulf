# Significance Gate — Build Scope & Plan

> The build that implements the locked decisions in `01-significance-gate-findings-and-decisions.md`.
> **Status: NOT started. Brainstorm + spec required before any code (RULE 3.5).**
> This doc is the scope, not a license to build. Date opened: 2026-06-19.

---

## Goal (one sentence)

Make the project-data comparison **only ever compare the same exact data**, surface a move
**only when it's certain and it matters to an outcome**, and **never police or overwrite the
user's filed number** — offer to confirm via crawl4ai when the user wants it.

---

## In scope

1. Gate 1 (certainty/identity) in the comparison path.
2. Gate 2 (cadence + outcome-aware magnitude).
3. The "both scenarios" breakdown output.
4. The uncertain-match maturity ramp: silent + ops log + background crawl4ai confirm + user
   confirms (Phase 1) → auto-correct (Phase 2).
5. Unify the two threshold files into one source of truth.
6. Cosmetic nudge gate fix (stop the generic "fresh figures" row).

## Out of scope (do NOT touch in this build)

- The no-invention moat on the AI's lake payload (unchanged — it governs AI output, not user input).
- The unrelated punch-list items (3C blast read-back, 4E permits, 5B/5C news, 0C module).
- Auto-correct promotion (Phase 2) — design it, but **gate it behind a real watch period**.

---

## Build status (updated 2026-06-19)

- ✅ **A1, A2 (strict), A3** — Gate 1 certainty/identity live (`brain-snapshot.ts`,
  `change-evaluator.ts`). A2 tightened: never substitutes the project zip; uncertain → silent.
- ✅ **B1** — registry fields added (`category`/`z_flag_threshold`/`max_stale_days`, 12 slugs).
  ⚠️ **INERT** until B2 reads them.
- ✅ **C1 (partial)** — single-change nudge shows `filed X → delta. Want to refresh?`
- ✅ **E1** — generic "fresh figures" noise row removed.
- ⬜ **B2, C2, D** — deferred (noise floor, consequence math, ops-log + crawl4ai confirm).
- ⬜ **Phase F** — handed off in **`03-phase-F-handoff.md`** (the canonical brief). Brainstorm first.

Gates at last change: 41/41 signals tests, 0 tsc errors, eslint clean. Uncommitted on working tree.

## Build phases

### Phase A — Gate 1: certainty/identity (kill apples-to-oranges)
**Files:** `lib/signals/brain-snapshot.ts`, `lib/signals/change-evaluator.ts`, types.
- **A1** Remove the label fallback at `brain-snapshot.ts:61`. No `metric_slug` → **skip the item
  (silent)**, don't key on label. Record it as "unverifiable" for the ops log (Phase D).
- **A2** Scope-match per item: build the lookup key from the item's own `scope_kind`/`scope_value`,
  not the single project-level ZIP. A county item looks up county; a ZIP item looks up ZIP. If
  the item's scope can't be matched to a lake scope → skip (silent).
- **A3** Unit/kind guard in `change-evaluator.ts`: before comparing, require the filed value and
  the current value to be the **same kind** (e.g. both percent, both $, both index). Carry a
  `unit`/`kind` on the metric item + the registry entry and compare them. Mismatch → skip (silent).
- **A4** Gate ordering: Gate 1 runs first and short-circuits to silent; only survivors reach
  the magnitude check. `evaluateChange` returns `null` (silent) on any Gate-1 failure with a
  reason code for the ops log.

**Exit:** no comparison can fire on a label-matched, scope-mismatched, or unit-mismatched pair.
Unit tests prove each skip path.

### Phase B — Gate 2: cadence + outcome-aware magnitude
**Files:** `ingest/significance-registry.yaml` (+ unify with `data-verification-tolerances.yaml`),
`change-evaluator.ts`, `cadence_registry.yaml` (read-only cross-ref).
- **B1** Unify thresholds: one per-metric source carrying `threshold` + `impact_weight` +
  `unit`/`kind` + volatility (`z_flag_threshold`) + `max_stale_days`. Decide: extend
  `significance-registry.yaml` to absorb the tolerances fields, or have the registry *read*
  the tolerances file. Don't keep two drifting copies.
- **B2** Cadence/volatility scalar: derive a noise floor from `z_flag_threshold` (+ source
  cadence in `cadence_registry.yaml`). Daily-volatile metric → larger move required; monthly/
  annual → smaller move surfaces. Fold into `signal_strength` so the gate is
  `magnitude AND clears-noise-floor`, not magnitude alone.
- **B3** Outcome weighting: keep `impact_weight` as the "does this feed a decision" multiplier;
  ranking already uses `signal_strength * impact_weight`. Confirm low-impact big-magnitude moves
  rank below high-impact small moves.

**Exit:** a 5bps daily-rate jitter stays silent; a monthly median-price move that crosses the
noise floor surfaces; ranking is outcome-weighted. Unit tests with daily vs monthly fixtures.

### Phase C — "Both scenarios" breakdown output
**Files:** `change-evaluator.ts` (delta description), the nudge/answer surface, ProjectWorkspace.
- **C1** When a move surfaces, produce the decision-framed breakdown (D4): state filed value +
  current value, change neither, quantify the consequence to the deliverable, end with an
  opt-in "want me to confirm?" — never an assertion that the user's number is wrong.
- **C2** Where the consequence is computable (rate → payment, cap rate → value), compute both;
  where it isn't, state both numbers + the materiality qualitatively. Never invent the
  consequence number.

**Exit:** surfaced moves read as decision-support, not correction. Copy reviewed against the
"don't fight a professional" constraint.

### Phase D — Uncertain-match ramp (ops log + crawl4ai confirm)
**Files:** `data_readiness_alerts` (extend — see Q3), `bun scripts/…mts` on a GHA cron beside
`project-feed-change-detection-daily.yml`, crawl4ai confirm path (reuse Phase 3C ladder), nudge surface.
- **D1** Ops log: every skipped/unverifiable item + every surfaced move → a `data_readiness_alerts`
  row (slug, scope, filed vs current, `gate_reason`, `surface`, `user_action`). Already wired to
  /ops. This is the watch data for promoting to Phase 2.
- **D2** Background confirm: on uncertain match, fire crawl4ai quietly (GHA cron, not Vercel,
  not an agent) to fetch the real number; store `crawl_confirmed_value` on the log row.
  **crawl4ai only.**
- **D3** Soft offer only on user ask — no proactive nudge for uncertain matches.
- **D4** Phase-1 behavior: any change requires user confirmation; nothing auto-overwrites.
  Phase-2 auto-correct is **designed but flag-gated off** until the watch period clears.

**Exit:** ops can see every comparison decision; no user data is overwritten; crawl4ai confirm
works end-to-end on a yes.

### Phase E — Cosmetic nudge gate
**Files:** `app/project/[id]/ProjectWorkspace.tsx:469–501`.
- **E1** Stop the generic `"Your filed data has fresh figures."` row from rendering when
  `significantChanges.length === 0`. Tie the whole row to real significant change (or a
  genuinely useful freshness signal), not bare `freshnessChangedSinceSeen`.

**Exit:** no noise row when nothing significant moved.

### Phase F — Confirmed-value lifecycle (sticky; stop popping) — findings doc D7–D10
**Files:** confirmed-value store (new column or `data_readiness_alerts`), the nudge/collision
surface, re-input triggers (upload / typed value).
- **F1** Show confidence, never override (D7): the collision surface flags "our sources put
  this at X; your filed Y is N% off" — never asserts the "real" number, never overwrites.
- **F2** Confirm once = stop popping (D8): on user confirm, persist a sticky state keyed to the
  filed value; suppress future alerts for that value until it changes.
- **F3** Sticky working value (D9): after confirm, render/use the user's number as-is; no drift.
- **F4** Re-evaluate only on a NEW number (D9): a new upload, a new typed value, or (future) a
  connector pull clears the sticky confirm and re-runs Gate 1 + Gate 2 against the fresh value.
- **F5** Frozen-snapshot honesty (D10): until an inbound connector exists, the UI states plainly
  that an uploaded number is a point-in-time snapshot we can't refresh.

**Exit:** a confirmed number never nags again; it stays the working value until genuinely
re-input; the user is never told their number is "wrong" or silently overwritten.

> **Blocked / not in this build — inbound "keep their number live" connector.** No path exists
> today (findings doc §6). Scope separately: user-data MCP/feed (their system → us), recurring
> re-upload prompt, or accept-frozen-snapshots. Phase F ships the honest frozen-snapshot
> behavior; the live connector is a future effort.

---

## Sequencing & gates

- **Order:** A → B → C → D → E → F. (A is the safety-critical one; do it first. F depends on
  the collision surface from C and the ops root from D.)
- **Per the pre-push gate:** touching `change-evaluator.ts` / `brain-snapshot.ts` / the registry
  needs unit tests green; touching the registry/vocab surface runs the vocab + pack gates.
- **No push without operator confirmation** (memory `feedback_no-autonomous-push`).
- **Brainstorm first** (RULE 3.5) — this doc is scope, the brainstorm produces the spec, the
  spec authorizes the code.

## Definition of done

- [ ] Gate 1 makes label/scope/unit mismatches impossible to compare (tests prove each skip).
- [ ] Gate 2 silences daily noise, surfaces real monthly/annual moves, ranks by outcome impact.
- [ ] Surfaced moves render as the "both scenarios" breakdown — never as a correction.
- [ ] Uncertain matches are silent, logged for ops, and crawl4ai-confirmed on user yes.
- [ ] No user-filed number is ever auto-overwritten in Phase 1.
- [ ] The generic "fresh figures" noise row is gone.
- [ ] One unified threshold source; the two files no longer drift.

## Resolved answers (probed 2026-06-19 — see findings doc §6)

**Q1 — Unify the two threshold files: how?**
**Answer: one loader, two grains, registry as owner.** `significance-registry.yaml` is per-slug
(~60 slugs); `data-verification-tolerances.yaml` is per-category (7 + default). They're not
duplicates — they're fine vs coarse. Make `significance-registry.yaml` the runtime owner and
fold in `z_flag_threshold` + `max_stale_days` per slug; where a slug has no individual tuning,
fall back to a category tier, then `_default`. The email-send ladder (Phase 3C) reads the **same**
loader so the two paths can't drift. Net: slug override → category fallback → `_default`.

**Q2 — Does `scope_kind`/`scope_value` exist on `ProjectItem`, populated at file time?**
**Answer: yes, but `.optional()`.** `lib/project/items.ts:33,57` — enum
`{zip,county,city,state,national,msa}`, both optional. So Gate 1 A2 rule: item HAS scope →
use it for the lake lookup; item LACKS scope → Gate-1 failure → SILENT + log as unverifiable.
**Don't invent the matcher** — `lib/project/project-scope.ts` (deriveScopes),
`lib/project/feed.ts` (scopeMatches), and `lib/project/change-detection.ts` already do
per-item scope matching. `brain-snapshot.ts` is the **only** path ignoring it. A2 = make
brain-snapshot reuse the existing scope machinery.
> ⚠️ **Two change-detection paths = two jobs (findings doc D6), keep them separate.**
> `lib/project/change-detection.ts` = Job A "our data moved" (scope-aware, has its own daily GHA
> cron `project-feed-change-detection-daily.yml`). `lib/signals/brain-snapshot.ts` +
> `change-evaluator.ts` = Job B "user number collides with ours" (scope-blind nudge). The
> brainstorm decision is **giving both the same Gate 1 + the same `data_readiness_alerts` root** —
> NOT collapsing them into one path and NOT forking a third.

**Q3 — Ops-log home: reuse `data_readiness_alerts` or new table?**
**Answer: extend `data_readiness_alerts`. Do NOT build a new table.** It already carries
`project_id, schedule_id, metric_slug, metric_label, scope_kind, scope_value, tier_used,
value_used, source_urls, snapshot_value (filed), within_tolerance, alert_at, resolved_at,
send_at` — and its header comment says **"the /ops dashboard reads this table."** It is already
the "something looked off with the data" surface on /ops. Add columns: `gate_reason`,
`surface` (`'email' | 'in_project'`), `user_action` (`'confirmed' | 'dismissed' | 'ignored'`),
`crawl_confirmed_value`; add in-project `tier_used` values. That gives the operator the
"recorded on /ops and tracked" they asked for with **zero new infra**.

**Q4 — Phase-1 → Phase-2 auto-correct promotion criteria.**
**Answer: data-earned, per-slug, flag-gated.** Phase D logs every decision + crawl4ai outcome
to `data_readiness_alerts`, so we promote on evidence, not a hunch. Proposed bar per slug:
≥20 crawl-confirmed comparisons, ≥95% `within_tolerance=true`, **zero** user "that's wrong"
overrides, over ≥30 days. Until met, the user confirms every change. Promotion = setting
`auto_correct: true` on that slug in the registry (default false). Designed now, **off** until
the watch window clears.

---

## Ops infrastructure decision — GitHub Actions, not Vercel, not an agent

The operator asked: crons in GitHub, Vercel, or build an agent? **Answer: GitHub Actions — the
platform's scheduling spine already.**

- **~70 GHA cron workflows** run everything (ingest, daily-rebuild, freshness-probe,
  email-scheduler, grade-predictions, and — directly relevant — `project-feed-change-detection-daily.yml`
  which runs `bun scripts/project-feed/change-detection.mts` with `SUPABASE_URL` +
  `SUPABASE_SERVICE_KEY` → writes Supabase directly). The significance ops-log + background
  crawl4ai-confirm job is the **same shape**: a `bun scripts/…mts` on a GHA cron writing to
  `data_readiness_alerts`. Extend the existing change-detection cron (or add one beside it).
- **Not Vercel.** There is **no `vercel.json`/`vercel.ts`** in the repo, so Vercel crons aren't
  the pattern here. The two `app/api/cron/*` routes (`news-crawl`, `data-readiness`) are
  **unscheduled orphan handlers** — no workflow triggers them (this is the SESSION_LOG
  operator-verify warning, and a likely reason /ops data-readiness cards look stale). Don't add
  to that pattern; either wire them via GHA later or leave them out of this build.
- **Not an agent.** This is batch comparison on a daily/per-build cadence — nothing needs to
  react in real time. An always-on agent adds cost + a babysitting surface for zero benefit
  over a cron.

### "A root place to handle issues" — real, but a separate effort
Today the issue/alert surfaces are **scattered across ~5 places**, none of them a root:
`data_readiness_alerts` (email substitutions → /ops cards) · the `checks` ledger (deferred
commitments) · `docs/cron-rebuild-failures.md` + issue #44 (cron failures, auto-logged) ·
`_AUDIT_AND_ROADMAP/build-queue.md` → /ops · `/littlebird` (brain health + reds). That's why
"/ops has a lot of information that's never updated."

- **For this build:** the significance ops-log lands in `data_readiness_alerts` and shows on
  /ops. That satisfies "recorded + tracked" now, no new surface.
- **As a follow-up (out of scope here):** `data_readiness_alerts` is the closest thing to a
  root "data issues" table and could become the spine of a single unified /ops issues feed
  (in the `swfldatagulf-ops` repo). Flag it; don't fold it into the gate build (scope creep).
