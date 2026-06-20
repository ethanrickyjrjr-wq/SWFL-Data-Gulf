# Phase F — Confirmed-Value Lifecycle (design spec)

> Author: opus session 2026-06-19. Status: **design — approved to plan.**
> Brief this implements: `TODO/03-phase-F-handoff.md` (+ `01-…findings`, `02-…build-scope`).
> Every surface in this spec was scoped against the live working tree on 2026-06-19; file:line
> citations are load-bearing — verify them before editing, not after.

---

## 0. Prime directive (operator, 20-yr broker)

> *"We don't want AI disconfirming a user's inputed data or being told what the number actually
> is. We don't want to fight a professional."*

We **flag with confidence**, we **never override**. Phase F is the product-safety layer on top of
the Gate-1 certainty engine that is already live.

---

## 1. What is already built (verified on the tree, do NOT rebuild)

| Piece | State | File:line |
| --- | --- | --- |
| Gate 1 A1 — no `metric_slug` → silent (label fallback killed) | ✅ | `lib/signals/brain-snapshot.ts:66` |
| Gate 1 A2 — strict per-item scope match (never the project zip) | ✅ | `lib/signals/brain-snapshot.ts:79-87` |
| Gate 1 A3 — kind guard (percent/dollar/numeric must match) | ✅ | `lib/signals/change-evaluator.ts:113` |
| Magnitude gate + ranking (`signal_strength × impact_weight`) | ✅ | `lib/signals/change-evaluator.ts:133-144` |
| `SignificantChange` carries `current_value` already | ✅ | `lib/signals/types.ts:33-49` |
| Per-item cards (collapsed `ItemCard` → expanded `ItemDetail`) | ✅ | `app/project/[id]/workspace/{ItemCard,ItemDetail,ItemsBoard}.tsx` |
| `data_readiness_alerts` table + email-side verification ladder + crawl4ai | ✅ | `docs/sql/20260619_data_readiness_alerts.sql`, `lib/email/data-readiness.ts` |

Gates green at handoff: **41/41 signals tests, 0 tsc, eslint clean.**

---

## 2. The discrepancy that shrank this build (the key finding)

The handoff worried that a user's stale hand-keyed number could ride out in a **recurring weekly
email**, so the email would need a rule to "switch to our number unless they upload a new file."
**The code says that path does not exist** — and the worry is already handled by design:

- `email_schedules` (`docs/sql/20260612_email_product.sql:21-36`) has **no `deliverable_id` and
  no rendered-HTML column**. It carries `project_id`, `template_id` (`"report"|"hero"|"viz"`),
  `audience_slug`, `scope_kind/scope_value`, cadence.
- `build_deliverable` and `schedule_send` are **two unconnected actions**
  (`app/api/projects/[id]/action/route.ts:170` vs `:200`). Building a deliverable returns a page
  slug; scheduling makes a **template-driven** recurring email. A built deliverable is **never**
  the thing that gets emailed on a cadence.
- The send path renders from the **current brain snapshot every send**
  (`lib/welcome/answer.ts:174` `loadBrain`; `scripts/email/run-schedules.mts:302-348`); it never
  reads `projects.items` (filed values) and never reads `projects.ui_state`.

**Therefore the operator's email rule needs zero code — "use our current number" is the only
behavior the email has.** It also means the in-project confirm flag **provably cannot leak** into
email. Phase F v1 is **in-project only**.

The operator's full rule resolves to three pieces:

| Rule | Code reality | Build in v1? |
| --- | --- | --- |
| In-project "Keep mine" protects the filed number | buildable (this spec) | **Yes** |
| Weekly email uses our current numbers when they move | already the only behavior | No — done |
| …unless the user uploads a new file | no file→email path exists at all | No — handoff (v1.5) |

---

## 3. Locked decisions

From the handoff (D1–D10) plus four design forks resolved this session:

- **Scope:** ship F1–F5 (in-project lifecycle); **v1.5 vision-import + F6 crawl-confirm get a
  handoff** (§9), not code.
- **Surface:** per-item **confidence chip** on the metric card (not the top nudge).
- **Suppression:** **server-side** in `computeSignificantChanges` (silent at the source).
- **Sticky store:** `projects.ui_state.confirmed_values` via **read-modify-write** (single writer),
  plus an evidence row in `data_readiness_alerts`.
- **Protect-on-Refresh (operator "A"):** a confirmed item is **skipped by the "Refresh items →"
  overwrite** (`applyRefresh`), so "Keep mine" actually protects the number — not just the chip.

### Hard constraints (violating any = a rebuild)
1. Never override / disconfirm / overwrite a user's filed number — flag with confidence only.
2. Gate 1 first, always — uncertain → silent. Do not loosen the existing A1/A2/A3.
3. crawl4ai only for any future live confirm — never Firecrawl (not installed; operator decree).
4. No autonomous push / PR / branch. Commit on `main` with explicit paths; the operator pushes.
5. Do not co-mingle with the operator's unrelated working-tree edits (`geo_utils.py`,
   `lee_permits`, `zip-*`).
6. Touching `change-evaluator.ts` / `brain-snapshot.ts` / the registry requires the signals tests
   green before any push (pre-push gate).

---

## 4. Component map (8 units — small, isolated, one job each)

### New units (no existing file touched → parallel-safe to author)

**U1 — `lib/signals/confirmed-values.ts` (+ `.test.ts`)** — pure sticky helpers, no I/O:
- `confirmKey(itemId: string, filedValue: string): string` — stable composite key.
- `isConfirmed(uiState, itemId, filedValue): boolean`
- `withConfirmed(uiState, itemId, filedValue): ProjectUiState` — returns a new ui_state with
  `confirmed_values[itemId] = filedValue` merged in (read-modify-write, immutable).
- `withoutConfirmed(uiState, itemId): ProjectUiState` — drops the entry (used when an item is
  removed / its value changes).
- Storage shape: `ui_state.confirmed_values: Record<string /*itemId*/, string /*filedValue*/>`.
  Keying on the **filed value string** is what gives F4 user-side re-eval for free (a changed
  value ≠ the confirmed value → not suppressed).

**U2 — `components/project/CollisionChip.tsx`** — the F1 + F2 per-item chip:
- Props: `{ change: SignificantChange; confirming: boolean; onKeepMine: () => void }`.
- Copy (D7 — confidence, never correction):
  > "Our sources put **{label}** at **{current_value}**. Your filed **{previous_value}** is
  > **{delta_description}** off — your number stays. [Keep mine]"
- The "Keep mine" button calls `onKeepMine`; disabled while `confirming`. Never renders a "correct
  value", never an auto-replace, never a hard block.

**U3 — `components/project/FrozenSnapshotNote.tsx`** — the F5 line:
- Props: `{ filedAt: string }` (the item's `added_at`).
- Renders, on `kind:"file"` items: *"This is the file you provided on {date}; we can't refresh it
  automatically."* Pure presentational.

**U4 — `docs/sql/20260619b_phase_f_alert_columns.sql`** — idempotent migration:
- `ALTER TABLE data_readiness_alerts ADD COLUMN IF NOT EXISTS user_action text;` (`'confirmed'|
  'dismissed'|'ignored'`)
- `… ADD COLUMN IF NOT EXISTS surface text;` (`'in_project'|'email'`)
- `… ADD COLUMN IF NOT EXISTS gate_reason text;`
- `… ADD COLUMN IF NOT EXISTS crawl_confirmed_value text;` (null until F6)
- `NOTIFY pgrst, 'reload schema';`
- v1 writes only `user_action` + `surface`; the other two are forward-declared for F6.
- Run directly (`.dlt/secrets.toml`), verify columns, never hand to operator (RULE 1).

### Modified units (shared/dependent → sequential)

**U5 — `lib/signals/types.ts`** — add `item_id: string` to `SignificantChange`. One line; every
chip and the confirm key attach to the right item by it. **Goes first** (U2/U6 type off it).

**U6 — `lib/signals/brain-snapshot.ts`** — two edits in `computeSignificantChanges`:
- Emit `item_id: item.id` on the returned change (line ~99 where `evaluateChange` result is pushed).
- New param `confirmedValues?: Record<string,string>`; **before** the lake lookup, if
  `isConfirmed(confirmedValues, item.id, item.value)` → `return` (silent). This is the server-side
  suppression. Confirmed items never even hit `lookupLakeFact`.

**U7 — `app/project/[id]/page.tsx`** — pass `project.ui_state.confirmed_values` as the new
`confirmedValues` arg to `computeSignificantChanges` (call site ~`:192`).

**U8 — `app/project/[id]/refresh/route.ts` + `lib/project/refresh-on-access.ts`** — Refresh-skip
(operator "A"):
- `applyRefresh` (`refresh-on-access.ts:41-72`) currently overwrites `item.value` with the brain
  value. Thread `confirmedValues` in and **skip any item where `isConfirmed(confirmedValues,
  item.id, item.value)`** — return the item unchanged. The route (`refresh/route.ts`) loads the
  project; pass `project.ui_state.confirmed_values` into `applyRefresh`.
- Note (out of scope, flag only): `applyRefresh` still uses `metric_slug ?? item.label` — the label
  fallback Gate 1 killed in the collision engine. Not Phase F's job; log it for a follow-up check.

**U9 — `app/project/[id]/workspace/{ItemsBoard,ItemCard,ItemDetail}.tsx` +
`app/project/[id]/ProjectWorkspace.tsx`** — the integration (the conflict hotspot, **one owner**):
- Thread `changesByItemId: Record<string, SignificantChange>` (built in `ProjectWorkspace` from the
  `significantChanges` prop) down `ItemsBoard` (`:52-64`) → `ItemCard` (`:16-97`) → `ItemDetail`
  (`:21-179`).
- `ItemDetail` metric branch (`:45-71`): after the value `<p>` (`:49`), render `<CollisionChip>` if
  `changesByItemId[item.id]` exists.
- `ItemDetail` file branch (`:133-176`): render `<FrozenSnapshotNote filedAt={item.added_at} />`.
- `ProjectWorkspace.onKeepMine(itemId, filedValue)`:
  1. `next = withConfirmed(uiState, itemId, filedValue)` (read-modify-write — single writer; same
     whole-object PATCH the existing dismiss flow uses, no new endpoint).
  2. `PATCH /api/projects/[id]` with `{ ui_state: next }`.
  3. POST one `data_readiness_alerts` evidence row (`surface:'in_project'`, `user_action:'confirmed'`,
     `snapshot_value:filedValue`, `value_used:change.current_value`, slug/scope from the change) via
     a thin helper (**U10**). Optimistically hide the chip locally.

**U10 — `lib/signals/log-collision.ts`** — thin insert helper for the in-project evidence row
(mirrors `lib/email/data-readiness.ts:299` `logVerificationResult`, but `surface:'in_project'`).
Called from the confirm path (server route preferred so the service-role client writes it). Keeps
the alerts write off the email module.

---

## 5. Data flow

1. **`page.tsx` (server):** load `items` + `project.ui_state` → `computeSignificantChanges(items,
   registry, zip, ui_state.confirmed_values)` → returns changes (each with `item_id` +
   `current_value`; confirmed items already silent) → pass to `ProjectWorkspace`.
2. **`ProjectWorkspace`:** `changesByItemId = Object.fromEntries(significantChanges.map(c =>
   [c.item_id, c]))` → thread through `ItemsBoard`.
3. **`ItemDetail`:** metric → `CollisionChip`; file → `FrozenSnapshotNote`.
4. **"Keep mine":** `withConfirmed` → PATCH `ui_state` → POST evidence row → chip hides.
5. **Next load:** confirmed `(item.id → value)` suppressed server-side in step 1; **and** the next
   "Refresh items →" skips it (U8) so the number is protected, not just silenced.
6. **Re-eval (F4):** the user changes the value → `(item.id → newValue)` ≠ confirmed entry → not
   suppressed → re-surfaced. (See §6 for the honest boundary.)

---

## 6. The F1–F5 behaviors and their honest v1 boundaries

- **F1 (D7) — show confidence, never override.** `CollisionChip` states both numbers, changes
  neither, ends with no demand. ✅ full.
- **F2 (D8) — confirm once = stop popping.** `confirmed_values` keyed to the filed value; server
  suppression + Refresh-skip. ✅ full.
- **F3 (D9) — sticky working value.** Confirmed number is never overwritten (Refresh skips it; chip
  gone). ✅ full **in-project**. Email already uses our number by design (§2) — that is intended,
  not a violation of F3, because F3 governs the user's *reference* surface, not outbound sends.
- **F4 (D9) — re-evaluate only on a genuinely new number.**
  - **User edits the metric value:** key differs → re-surfaced. ⚠️ **There is no metric value-edit
    UI today** (`action/route.ts` has no edit action; value changes only via Refresh or
    remove/re-add). So in practice the user-side re-eval fires when an item is **removed and
    re-added** with a new value. Documented, not papered over.
  - **Our number drifts again after a confirm:** **deferred to handoff.** Filed-value keying means a
    re-confirmed item stays suppressed even if our number moves further. The handoff itself accepts
    this ("keying to the filed value gives most of this for free"). Re-alerting on a *widening* gap
    is a v1.5 refinement, not a v1 promise.
  - **Re-upload a file:** files don't enter the metric engine in v1 (that's v1.5 vision-import).
    F5 covers the honesty gap meanwhile.
- **F5 (D10) — frozen-snapshot honesty.** `FrozenSnapshotNote` on every `kind:"file"` item. ✅ full.

---

## 7. What runs together (the parallelization)

```
Step 0 (serial, ~1 line):  U5  add item_id to SignificantChange   ← blocks U2, U6
Wave 1 (parallel, 2 agents, zero file overlap):
        Agent-A:  U1 confirmed-values lib + test  |  U4 SQL migration (+ run it)
        Agent-B:  U2 CollisionChip  |  U3 FrozenSnapshotNote
Wave 2 (serial, 1 agent — signals domain):
        U6 brain-snapshot suppression + item_id  →  U7 page.tsx wiring
        U8 refresh-on-access skip-confirmed  →  refresh/route.ts pass-through
Wave 3 (serial, 1 agent — the workspace hotspot, single owner):
        U10 log-collision helper  →  U9 ItemsBoard/ItemCard/ItemDetail mount + ProjectWorkspace.onKeepMine
Verify:  signals tests + 3 new tests, tsc 0, eslint, next build
```

**Conflict groups:**
- 🟢 U1, U4, U2, U3 — each its own new file. Safe to run concurrently.
- 🟡 U5→U6→U7 and U8 — `lib/signals/*` + `page.tsx` + `refresh/*`; one signals-owner, serial.
- 🔴 U9 — `ProjectWorkspace.tsx` + the three `workspace/*` card files are touched **only here**, by
  one owner. No other wave writes them → no cross-agent collision.

---

## 8. Definition of done (v1)

- [ ] A Gate-1-passing collision renders as a `CollisionChip` — both numbers, never a correction,
      never a block, never a mutation of the user's value.
- [ ] "Keep mine" persists `ui_state.confirmed_values[itemId]=filedValue`; the same filed value
      never re-alerts (server-suppressed) **and** the next "Refresh items →" skips it.
- [ ] Editing/removing+re-adding with a new value clears suppression and re-evaluates.
- [ ] `kind:"file"` items show the frozen-snapshot note.
- [ ] Each confirm writes one `data_readiness_alerts` row (`surface:'in_project'`,
      `user_action:'confirmed'`) — visible on /ops.
- [ ] The email send path is unchanged and provably unaffected (it reads neither `items` nor
      `ui_state`).
- [ ] New unit tests: (a) chip copy is confidence-not-correction, (b) `isConfirmed`/`withConfirmed`
      suppression + re-eval-on-value-change, (c) `applyRefresh` skips a confirmed item.
- [ ] 41/41+ signals tests green, 0 tsc, eslint clean, `next build` ✓.

---

## 9. Handoff — NOT in v1 (next session)

**v1.5 — vision structured-import (handoff §3 of `03-phase-F-handoff.md`).** Add a second output
shape to `app/api/projects/[id]/extract-pdf/route.ts` (today: Haiku 4.5 → prose `extracted_text`,
`:106-127`): per-column `{column_label, sample_values, proposed_slug, proposed_scope, confidence,
source_quote}`. AI **proposes**, user **confirms** → the column becomes a real
`{metric_slug, scope_kind, scope_value}` metric item and runs Gate 1 like any typed metric. HOLD
(reference data) vs COLLIDE (the narrow subset mapping to our slugs) — most of a file is HOLD.
Confirmed mappings are **per-project user data** (a small alias map / `ui_state`), **never**
`refinery/vocab/brain-vocabulary.json` (the global moat ledger).

**File → email (operator's "unless they upload a new file").** No file→email path exists today
(§2 — the send path never reads `items`). Building it means: a file upload that re-establishes a
metric's basis must reach the email's value selection. That couples to the v1.5 structured-import
(a file only carries a *number* the email could use once vision has structured it). Defer until v1.5
lands; until then, email is brain-current and that is correct.

**F6 — crawl-confirm (Phase D).** "Yes, confirm it" → crawl4ai (never Firecrawl) on a **GitHub
Actions** cron (beside `project-feed-change-detection-daily.yml`; not Vercel, not an agent) → write
`crawl_confirmed_value` (column already added in U4). Phase 1: user confirms every change. Phase 2:
auto-correct per slug (`auto_correct: true`, default false) only after the watch bar clears
(findings doc Q4: ≥20 crawl-confirmed comparisons, ≥95% within_tolerance, zero "that's wrong"
overrides, ≥30 days).

**Follow-up check (not a build):** `applyRefresh` still uses the `metric_slug ?? item.label`
fallback Gate 1 killed elsewhere — open a `checks` item to align it.
