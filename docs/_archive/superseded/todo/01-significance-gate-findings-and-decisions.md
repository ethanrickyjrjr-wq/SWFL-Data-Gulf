# Significance Gate — Findings & Locked Decisions

> Working doc. Captures (1) how this started, (2) what the audit actually found in code,
> (3) the safety problem the operator raised, and (4) the decisions we locked before building.
> The build scope lives in `02-significance-gate-build-scope-and-plan.md`.
> Date opened: 2026-06-19.

---

## 1. How this started

A prior Sonnet session handed over an audit table claiming Phases 0, 1, 2 of the
significance-weighted spec "were never built." The operator's ask, verbatim in spirit:
**"confirm all these findings and make sure Sonnet is comparing apples to apples … check
GitHub … then explain exactly what happens when it's all built. I'm tired of building and
rebuilding."**

So job one was to stop trusting the handoff table and verify against `git` + the live code.

---

## 2. What the audit actually found (verified against git + code)

### 2a. Sonnet's status table was stale/wrong

Phases 0, 1, 2 **are** built and on `main`. Confirmed by commit + file:

| Claim in handoff | Reality | Evidence |
| --- | --- | --- |
| Phase 0 never built | Built | commit `ee8c0968` (Jun 18) |
| Phase 1/2 never built | Built | commits `a4a6dc09`, `e4d927d` (Jun 19); spec build-order lines mark 3A/3B SHIPPED `e4d927d` |
| `significantChanges` always empty | **Wrong** — computed live | `app/project/[id]/page.tsx:192` calls `computeSignificantChanges(...)` every load |

Likely cause of the bad table: Sonnet audited an older tree (a stale Piece-2 spec copy
exists under `.claude/worktrees/isolate/`). **Lesson: verify each "gap" against the data
before building — same pattern as the LittleBird phantom-gap audit.**

### 2b. The *real* noise source ("filed data has fresh figures")

Not an empty-array bug. It's a **one-line cosmetic gate**:

- `app/project/[id]/ProjectWorkspace.tsx:469–501` — the nudge **row** renders on any
  `digest.freshnessChangedSinceSeen`. Only the specific message + "Refresh items →" button
  is gated on `significantChanges.length > 0`. Otherwise it falls back to the generic
  `"Your filed data has fresh figures."` with a Dismiss button.
- So the row fires even when nothing significant moved. Cosmetic, but it's the visible noise.

### 2c. Three apples-to-oranges holes in the comparison code

These are the load-bearing findings — the system can currently compare the **wrong number to
the wrong number** and call it a significant move:

1. **Label fallback** — `lib/signals/brain-snapshot.ts:61`
   `const slug = item.metric_slug ?? item.label;`
   If a filed item has no `metric_slug`, it keys the lake lookup on the human label. That is
   **not guaranteed to be the same metric** — "Median Price" could resolve to a different
   series than the one the user filed. **This is the single most dangerous line.**

2. **Scope mismatch** — `brain-snapshot.ts:62,65` + `page.tsx:192`
   `const key = \`${item.report_id}|${slug}|${zip ?? ""}\`;` uses **one project-level ZIP for
   every item** (`inferScopeFromItems(items).zip`). A county-grain item and a ZIP-grain item
   get looked up at the same scope → you can compare a ZIP figure against a county figure.
   Ignores each item's own `scope_kind`/`scope_value`.

3. **No unit/kind guard** — `lib/signals/change-evaluator.ts:18–26`
   `parseNumeric()` strips `$`, `,`, `%`, `YoY`/`MoM`/units down to a bare number. A "5.2%
   YoY" filed value and a "5.2 (index)" current value both become `5.2` — **no check that the
   two numbers are even the same kind of thing.**

4. **Magnitude-only gate** — `change-evaluator.ts:116`
   `if (signal_strength < 1.0) return null;` — fires purely on `|delta|/threshold`. There is
   **no identity/confidence gate** in front of it. Big move on a mis-matched pair still fires.

### 2d. We already own most of the machinery (probe-first win)

Two **separate** per-metric threshold files already exist — don't build a third:

- `ingest/significance-registry.yaml` — per-slug `threshold_type` + `threshold` +
  `impact_weight` (1–10) + `unit`. Drives the **in-project nudge**. Already not flat.
- `ingest/data-verification-tolerances.yaml` — per-category `tolerance_abs`/`tolerance_pct`,
  `max_stale_days`, **and `z_flag_threshold` (z-score vs 30-day rolling mean)**. Drives the
  **email-send ladder (Phase 3C)**. The `z_flag` is literally the "is this a real move or
  daily noise" measure the operator asked for — already encoded.

`crawl4ai` confirm path also already exists in the email-send ladder. We reuse one verifier,
not two.

---

## 3. The safety problem the operator raised (the reason we paused)

The operator is a 20-year broker. Hard constraints, preserved verbatim:

- **"we don't want AI disconfirming a user's inputed data or being told what the number
  actually is."**
- **"WE HAVE TO MAKE SURE WE ARE COMPARING CURRENT DATA WITH THEIR DATA AND THE SAME EXACT
  DATA!!"**
- **"we do not worry about it unless we know for sure."** (lots of different column
  titles/words → stay silent on uncertain matches)
- **"It is ok to suggest at the end that something looks off, would you like me to confirm?
  We then confirm with crawl4ai if they say yes."**
- **"We don't want to fight a professional."**

This reconciles with the locked memory decree (`feedback_client-data-not-police`, 2026-06-17):
**the no-invention moat governs the AI's own lake payload, NOT the user's input.** The AI
never invents a SWFL number — but it also never polices, disconfirms, or overwrites a number
the user filed. Those are two different surfaces.

---

## 4. Locked decisions (operator-confirmed)

### D1 — Two-gate model
- **Gate 1 — Certainty / identity.** Only compare when we *know for sure* it's the same exact
  data: exact `metric_slug` match (no label fallback), matching scope (item's own
  `scope_kind`/`scope_value`, not a project-level ZIP), and same unit/kind. **If any of those
  is uncertain → SILENT.** Kill `?? item.label`.
- **Gate 2 — Magnitude.** Only after Gate 1 passes. Cadence-aware + outcome-impact-aware
  (see D3), not a flat number.

### D2 — Uncertain match → silent, but logged + background-confirmed (maturity ramp)
- AI **never raises it proactively.** Soft offer **only if the user asks** "is this current?"
- Behind the scenes **always**: log the unverifiable item for ops **and** fire `crawl4ai` to
  confirm the real number quietly.
- **Phase 1 (now):** the user confirms every change. Nothing auto-overwrites their data.
- **Phase 2 (after we watch it work):** once match+confirm accuracy is trusted, promote to
  auto-correcting as the real number system-wide.

### D3 — Confident match → suggest at the END, never block; threshold is cadence + outcome aware
- It's fine to surface "this looks off" at the end of a deliverable/answer — never a hard stop.
- Threshold must scale with the metric's **natural volatility / publish cadence** (a daily
  mortgage rate jittering 5bps is noise; a monthly median price moving 4% is real) — derive
  from `z_flag_threshold` + the source's cadence in `cadence_registry.yaml`.
- Threshold must scale with **outcome impact** (`impact_weight`) — a small move that flips an
  affordability/cap-rate call beats a large move that changes no conclusion.

### D4 — "Both scenarios" breakdown is the output format (the thing that makes it not policing)
When a move surfaces, **state both numbers, change neither, quantify the consequence, let the
broker decide.** Example shape:
> "Your filed rate is 6.8%. The current read looks like 7.3%. I haven't changed anything — but
> on a $400K listing that's $1,950/mo vs $2,290/mo, +$340. If this is going to a buyer making
> an affordability call, it matters; for a market-overview email, probably not. Want me to
> confirm the live rate before we send?"

### D5 — Process
- `crawl4ai` only, **never Firecrawl** (operator decree).
- **Brainstorm + spec before any code** (RULE 3.5). The last three days are the story of
  building off a stale assumption — we don't repeat it.

### D6 — Two jobs, one root, one certainty gate (corrects the "reconcile two paths" framing)
There are **two different jobs**, and they stay separate functions — but share storage + the gate:
- **Job A — "our data moved" (`change-detection.ts`, has cron):** *our* number changed →
  notify / refresh the deliverable. Driven by our updates.
- **Job B — "user's number collides with ours" (the significance/collision path):** the user
  filed a number (PDF/file/typed) that disagrees with *our* current number → show confidence,
  offer to confirm. Driven by their input vs ours.
- **Shared:** both must pass **Gate 1 (same exact data)** or stay silent, and both log to the
  **same root** (`data_readiness_alerts` → /ops). Do **not** merge them into one path; do
  **not** fork a third. Two jobs, one gate, one root.

### D7 — Show confidence, never override
We don't care which number the user chooses to use. When *our sources* say their number is too
far off, we **show our confidence** ("our sources put this at X; your filed Y is N% off") —
we **never** tell them the "real" number or overwrite theirs. Flag, don't correct.

### D8 — Confirm once = stop popping (sticky)
When the user confirms their number is intentional/real, we **stop popping for that value**.
No repeat nags. The confirmation is sticky per-value (store it; suppress future alerts for the
same filed value until it changes).

### D9 — The working value is sticky until a NEW number is produced — by us or by them
After confirmation, the **user's number is the working value** and we render/use it as-is. It
only gets re-evaluated when a genuinely new number arrives:
- **We** produce a new number (our system updates the metric), **or**
- **They** produce a new number (re-upload a file, type a new value, or connect their system).
Until then: no nagging, no drift, their number stands.

### D10 — A user file is a FROZEN snapshot — we cannot refresh their side
Confirmed in code: `ConnectMcpBlock` is **outbound** (user adds *our* MCP so their AI reads
*our* data, `X-Project-Key`); uploads land in the private `project-uploads` bucket as static
objects (`signed-upload-url.ts`) with **no live re-extraction**. So a user's uploaded number is
frozen at upload time. There is **no inbound path** for us to keep their number current. Their
number stays put until our system updates, they add another file, or they connect their own
system — and **that last path does not exist yet** (see TODO §7).

---

## 5. Probe results — answers to the open questions (2026-06-19)

Scoped the four open questions + the ops-infra question against the code. Full answers live in
the build doc (`02-…`, "Resolved answers" + "Ops infrastructure decision"). Headlines:

- **`scope_kind`/`scope_value` exist** on `ProjectItem` (`lib/project/items.ts:33,57`) but are
  `.optional()`. Matcher already exists in `project-scope.ts` / `feed.ts` / `change-detection.ts`
  — `brain-snapshot.ts` is the only path ignoring it.
- **Two change-detection paths = two jobs, not a fork to merge** (see D6):
  `lib/project/change-detection.ts` (Job A, "our data moved," scope-aware, has GHA cron) vs
  `lib/signals/brain-snapshot.ts` + `change-evaluator.ts` (Job B, "user number collides,"
  scope-blind nudge). Keep them separate; give both **Gate 1 + the `data_readiness_alerts`
  root**. The brainstorm call is sharing the gate/root, NOT collapsing the paths.
- **Ops-log home = extend `data_readiness_alerts`** (already carries filed-vs-current + scope +
  within_tolerance + source_urls, already read by /ops). No new table.
- **Cron = GitHub Actions.** ~70 GHA workflows are the scheduling spine; no `vercel.json` exists;
  the two `app/api/cron/*` routes are unscheduled orphans. Not Vercel, not an agent.
- **"Root place for issues"** — ~5 scattered surfaces today; `data_readiness_alerts` is the
  closest to a root. Consolidation is a separate /ops effort, not part of this build.

---

## 6. TODO — "keep the user's number live" connector (path does NOT exist yet)

The frozen-snapshot problem (D10) has no solution in the codebase today. Needs scoping before
we can promise a user their numbers stay current. Open items:

- [ ] **Inbound connector — does any path exist for us to read a user's live numbers?**
  Confirmed NO today: `ConnectMcpBlock` is outbound only; uploads are static. Scope whether to
  build (a) a user-data MCP/feed connection (their system → us), (b) a recurring re-upload
  prompt, or (c) just accept frozen snapshots + be explicit about it in the UI.
- [ ] **Frozen-snapshot UX honesty.** Until a connector exists, the UI must be clear that an
  uploaded number is a point-in-time snapshot we can't refresh — so the user isn't surprised
  when our side moves and theirs doesn't.
- [ ] **Re-input triggers re-evaluation (D9).** Wire: new upload / new typed value / (future)
  connector pull → clears the sticky confirm + re-runs Gate 1 + Gate 2 against the fresh number.
- [ ] **Where does a confirmed-value sticky state live?** New column/table so D8 (stop popping)
  and D9 (sticky working value) survive across sessions. Candidate: extend the project item row
  or `data_readiness_alerts` (`user_action='confirmed'` + the confirmed value).

---

## 7. Open punch list (verified-real, NOT yet authorized to build)

Separate from the gate redesign — the genuinely-remaining items from the two specs:

- Cosmetic nudge gate (§2b) — stop the generic row firing with nothing significant.
- 3C blast read-back.
- 4E permit wiring.
- 5B NewsBar / NewsArticleDrawer.
- 5C clip-news route.
- 0C module extraction.
