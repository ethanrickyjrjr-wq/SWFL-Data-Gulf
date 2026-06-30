## Task 2: Lab status model — Draft → In review → Approved → Scheduled → Live

**Goal:** Replace the flat week-list with a real workflow status per post. Hootsuite's calendar spine (researched in the handoff REVIEW B3): every post tracks **Status**. The engine already owns the back half (`PostStatus = queued | dry_run | published | failed`); this task adds the **front half** — a lab-side authoring state the user drives before a post ever reaches a schedule.

**Depends on:** Task 1 (the Schedule action + `social_schedules` row exist). 🔴 shares the shell — run after Task 1.

**Files:**
- Create: `lib/social/lab-status.ts` — the status union + the lab→engine status projection (pure).
- Test: `lib/social/__tests__/lab-status.test.ts`
- Modify: `components/email-lab/SocialCalendarPanel.tsx` — status chip per post + status transition control.
- Modify: `components/email-lab/EmailLabGridShell.tsx` — hold per-post lab status in state; persist alongside the schedule row.
- Modify: `app/api/social/schedule/route.ts` — accept an initial `labStatus` and reflect it (a Draft schedule is created `status="paused"`; Approved/Scheduled → `status="active"`).

**Interfaces:**
- Consumes: `type ScheduleStatus` (`@/lib/social/types`), Task 1's `POST /api/social/schedule`.
- Produces:
  - `type LabPostStatus = "draft" | "in_review" | "approved" | "scheduled" | "live"`.
  - `labToScheduleStatus(s: LabPostStatus): ScheduleStatus` — `draft|in_review → "paused"`, `approved|scheduled → "active"`, `live → "active"` (the cron flips to published independently).
  - `nextLabStatus(s) / canAdvance(s)` — the forward-only transition guard.

- [ ] **Step 1: Failing test** — `labToScheduleStatus("draft") === "paused"`, `labToScheduleStatus("approved") === "active"`, `nextLabStatus("draft") === "in_review"`, `nextLabStatus("live") === null`.
- [ ] **Step 2: Run, confirm fail** (`bun test lib/social/__tests__/lab-status.test.ts`).
- [ ] **Step 3: Implement `lib/social/lab-status.ts`** — the union, the projection, the forward-only `nextLabStatus` (Draft→In review→Approved→Scheduled→Live; no backward jump except an explicit `resetToDraft`).
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Panel** — render a status chip (color per state) on each post card; a "→ next" control calling `onAdvanceStatus(draft, next)`. Posts default to `draft` until the user Schedules (→ `scheduled`).
- [ ] **Step 6: Shell + route** — thread `labStatus` into the schedule POST; a `draft` schedule persists `status="paused"` (never fires); advancing to `approved`/`scheduled` flips the row to `active`.
- [ ] **Step 7: Typecheck + tests** (`bunx next build 2>&1 | tail -20`; `bun test lib/social`).
- [ ] **Step 8: Commit** — `feat(grid-lab-socials): lab post status model (draft→live) gates schedule activation`.

**Note:** "In review / Approved" are single-user lab states now (no multi-reviewer). Hootsuite's reviewer/approval-notes axis (REVIEW B3 "Workflow") is explicitly deferred — do NOT build a reviewer system; just the status ladder.
