# Deliverable Convergence — build → send → send-weekly, all in chat

**Date:** 2026-06-16 · **Owner:** session (Opus) · **Status:** design brief (not a status board — open obligations live in the `checks` ledger, never here)

> Scope: **Phases 2–7 only.** Phase 1 (data-driven `email-report.html`) is **excluded by operator decree** — it is owned by the parallel session's companion plan `docs/superpowers/plans/2026-06-16-email-report-data-driven.md` and is referenced here as a precondition, not re-specced.

---

## What we're building (operator intent)

A user asks the briefcase AI to build an email/PDF, approves it, sends it, and the AI offers **"send this weekly?"** — all inside the chat, with a confirm button and a way to pick recipients. Every **built deliverable keeps a permanent "Send / Send weekly" handle** so the user can return later and send something already made. Eventually the AI sets up the recurring send and the user uploads contacts.

Most of the recurring engine, AI schedule-setup, and contacts upload **already exist on `main`**. This convergence wires them into one in-chat flow + adds send-handles on built work, on top of a shared grounded render path.

---

## Gate before Wave A — the artifact must be real and green (Phase 0)

**SATISFIED 2026-06-16** (verify against `git`/the ledger, never this line). The blocking state below was real when written; it has since resolved:

- Local `main` **== origin/main (0/0)** — everything pushed.
- Phase 1 is **green on origin/main**: `bun test lib/email` was **318/0** before the spine, **333/0** after the goldens. The removed `[ BODY TEXT ]` slot no longer breaks the activation render (`reportToEmailHtml` now delegates into the spine).
- **Wave A (Task 2 — the convergence spine) is shipped** (`5ea26cb`): `lib/email/grounded-report.ts` carries `GroundedReportModel` + `renderGroundedReport`; `2750a2e`/`7c904d5` froze 10 pre-spine goldens that prove the email output is byte-identical.

**→ Wave B (Task 3 ‖ Task 4) is unblocked.** Phase 1 (the companion plan) and the spec are both on origin/main; the crawl4ai docs that rode along are harmless. No push-before-green risk remains.

---

## The two-object model (the hinge — never collapse these)

- **Deliverable = a frozen photograph.** `freezeSnapshot` (`lib/deliverable/build.ts`) bakes data in at build time; `/p/[id]` shows the same numbers forever. The preview/approval gate + the "what we sent on date X" record.
- **Schedule = a standing order.** Stores a *recipe* (template + scope + audience + cadence) and **re-fetches fresh data every run** (`scripts/email/run-schedules.mts`). `email_schedules` already stores the recipe, never a snapshot.
- "Send weekly" copies the **recipe** out of a built deliverable into a schedule — it never re-sends the frozen photo. Same design, fresh numbers each run. "Send later" re-renders fresh and re-asks "still look right?" — the frozen `/p/[id]` stays the historical record.

---

## The in-chat flow (Tasks 5–7) and send-later (Task 6)

```
1. "Make a Cape Coral flood email and send it weekly to my buyers."
2. AI builds → preview card + /p/[id] link        [Looks good] [Change]
3. Approve → "Who gets it?"  audience chips +      [Upload contacts]
4. AI sends once (or [Send me a test first])
5. "Send this every week?"                          [Yes, weekly] [Just once]
6. Yes → cadence chips → propose card               [Confirm] [Cancel]
7. Confirm → ONE email_schedules row → cron sends weekly with FRESH data
```

Buttons for every finite choice. The "weekly?" confirm reuses `schedule-command.ts`'s existing propose→confirm (writes nothing until confirm). Built deliverables carry the same Send / Send-weekly handle on `/p/[id]` and `/project`.

**Monetization fit (locked):** build + preview + PDF = free forever (watermark at end, not a block). **Send / Send weekly is the gated action** — the login-capture + send paywall moment, both in-chat and on the built-work button.

---

## Convergence spine (Task 2 — the shared primitive everything rides on)

1. **`GroundedReportModel` = `AssembledReport` EXTENDED** (operator-approved C1 fix) with `delta?: ReportDelta | null`, a general `scope { kind:"zip"|"place"|"county"|"region"; value; grain; topic? }`, and `cta_url`/`site_origin`. `AssembledReport` (`lib/email/activation/snapshot.ts:48`) carries **none** of these today (delta is computed separately; scope is ZIP-hardcoded).
2. **`renderGroundedReport(model, {skin:"email"|"pdf", brand})`** — computes structured tokens + `repeats.hero/metrics/reads` + the `[ DELTA ]` block, calls `renderHtmlTemplate` on the chosen skin. Generalizes Phase 1's repeat-block; **extends** the existing `renderEmailTemplate`/`renderHtmlTemplate` seam (RULE 3 C2 — no new mandatory gate).
3. **Two skins, same data** — `email/email-report.html` (Phase 1) for email; new `doc/doc-report.html` (same `repeats`/tokens) for PDF via the existing `window.print()` path.

---
---

## 🔒 SCOPE HANDOFF → FINAL BOSS (locked 2026-06-17 — do not revert/rewrite)

**Status (verified vs. git, not memory):** the email *engine* is built. Task 2 spine (`5ea26cb`), Task 3 recurring/brand
(`ed8e77e`), Task 4 email+PDF deliverable (`7630b32`), Task 7 build→schedule bridge (`a5d1858`, idempotence `b80eea4`),
Task 6 send handle on `/p/[id]`+`/project` (`f8bc3cc`, contacts page `66ba208`), and **Task 5 Slice 1** — the in-chat
"Send weekly" card (`962ad12`). So: 2/3/4/6/7 done; Task 5 = Slice 1 done.

**What MOVED, and where:** the *remaining* email ambition — building an email **outside** a project, dropping it **into**
a project, **seeing** it on the project page, and **sending** from there — is now owned by **`FINAL BOSS/`** (the
"email through Projects" flagship flow: `FINAL BOSS/00-MASTER-PLAN.md` → "Flagship flow"; the three concrete gaps +
seed/scope wiring are `FINAL BOSS/01-piece-1-workspace-shell.md` §I; the Emailing-lane live preview is Piece 4). It is a
**rewire/relocate onto the new project-workspace seams — NOT a rebuild of this engine.**

**To the Task 5 session (and any session working this folder):**

- ✅ **Do:** live-verify the shipped in-chat flow end-to-end, then close `inchat_build_send_schedule_flow` on the
  **runtime** signal (not "code looks right" — `public.checks` is prod evidence, not dev attestation).
- 🚫 **Don't:** extend Task 5/6 toward the outside→project→send experience *here*. Those seams (`?seed=`, the `"email"`
  template through `/api/projects/[id]/build` + `swfl_project_build`, the Emailing lane) live in FINAL BOSS and don't
  exist yet — building them now means building on the 743-line `app/project/[id]/ProjectDetail.tsx` that Piece 1 is about
  to decompose (throwaway work + a guaranteed merge collision with the Final Boss build).
- 🔒 **Don't revert or rewrite** this block, the Task 5/6 banners, or the FINAL BOSS docs when you checkout/commit/push.
  If something here is wrong, **add a correcting note** — never delete (append-only handoff).

## Wave / builder / concurrency matrix

| Wave | Tasks (parallel within the wave) | Builder | Depends on |
|------|----------------------------------|---------|-----------|
| **0 (gate)** ✅ | Finish + push Phase 1 to green — *companion plan, NOT in this folder* | — | — |
| **A** ✅ | [Task 2 — Convergence spine](./task-2-convergence-spine.md) (`5ea26cb`) | **Opus** | Phase 1 green on origin/main |
| **B** ✅ | [Task 3 — Recurring adopts spine](./task-3-recurring-adopts-spine.md) (`ed8e77e`) ‖ [Task 4 — Briefcase email + PDF](./task-4-briefcase-email-pdf.md) (`7630b32`) | **Opus** ‖ **Sonnet** | Task 2 |
| **C** ✅ | [Task 7 — Build→schedule bridge](./task-7-build-to-schedule-bridge.md) (`a5d1858`, `b80eea4`) | **Opus** | Task 4 |
| **D** ✅ | [Task 5 — In-chat flow](./task-5-inchat-flow.md) (Slice 1 `962ad12`) ‖ [Task 6 — Send-later on built work](./task-6-send-later-built-work.md) (`f8bc3cc`, `66ba208`) | **Opus** ‖ **Sonnet** | Task 7 |

**Parallelism rules:** within a wave, tasks touch disjoint files (B: scheduler/scoped-content vs. deliverable/doc-skin; D: chat components vs. deliverable/project buttons). If two are built concurrently by separate sessions, **isolate in a git worktree (RULE 1.5)** — Wave D's two tasks may share a small client schedule-action util; whoever lands second rebases.

**Builder rationale:** Opus where correctness/architecture is load-bearing (the spine, the recurring break-guard, the bridge recipe extraction, the UX+paywall orchestration). Sonnet where the work follows an existing pattern closely (the new deliverable type; the built-work buttons).

---

## Checks to open (after this folder is reviewed — they live in the ledger, not here)

`email_grounded_render_spine` (T2) · `email_recurring_report_template` (T3) · `briefcase_email_pdf_deliverable` (T4) · `inchat_build_send_schedule_flow` (T5) · `built_work_send_handle` (T6) · `build_to_schedule_bridge` (T7). Already tracked, do **not** duplicate: `email_report_multizip_revival`, `email_brand_navy_canonical`, the companion plan's Phase-1 checks.

## Standing guardrails (apply to every task)

- No-fabrication / provenance: numbers come from `GroundedReportModel` fields, never invented; cite source; mark `[INFERENCE]`.
- Vendor-first: before any go-live cron flip, verify Resend `segments`/`broadcasts` surface in-session (separate from this folder).
- RULE 1.5: `git add <explicit paths>`, never `-A`; worktree-isolate concurrent same-file work.
- No-autonomous-push / no-branch / no-PR: land on `main` via `node scripts/safe-push.mjs` only after operator confirmation; SESSION_LOG entry every push.
