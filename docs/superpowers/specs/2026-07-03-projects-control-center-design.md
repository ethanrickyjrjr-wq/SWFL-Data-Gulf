# Projects page = control center: running schedules + next sends + click-to-tailor

**Date:** 2026-07-03
**Operator ruling (07/03/2026):** "What is the point of projects page unless it is showing you
what you have running? Projects page should be where you handle all projects and have dates of
when an email goes out next to the email and control over what is set up. Click on 'this emails
every Monday at 8 AM' and you can tailor it."

## Problem

`/project` (app/project/page.tsx) is a bare name list: title + item count + four quick links.
It shows NOTHING about what a project is doing — no schedules, no next send, no audience, no
paused/failed state. Since 07/03/2026 it is no longer even the landing surface (opening a
project now lands on the Email tool via `projectHome()`), so as a pure list it duplicates the
desktop rail and earns nothing.

Deep-dive findings (probed 07/03/2026):
- **All the data already exists.** `public.email_schedules` carries `project_id`, `status`
  (active | paused | stopped), `cadence` (daily | weekly | monthly), `day_of_week`,
  `day_of_month`, `send_hour_et`, `audience_slug`, `next_run_at`, `last_run_at`
  (docs/sql/20260612_email_product.sql). `public.social_schedules` is the social twin.
  `deliverables` rows carry the built emails per project.
- **The phrasing helper exists.** `lib/email/schedule-cadence.ts` (`formatScheduleSendTime`,
  `computeNextRunAt`) already renders human cadence/send times — reuse, don't re-derive.
- **The editor exists.** The schedule-command path (propose → confirm → write,
  `app/api/email/schedule-command`) and `ScheduleSendModal` already tailor a schedule;
  `MaterialRow` already deep-links `/project/[id]/email-lab?did=<id>&schedule=1`.
- **Send-status exists.** `app/api/email/send-status` reads per-schedule health.

So this is a READ + COMPOSE build: one loader join + a card redesign. No new tables, no new
pipeline, no new gate (RULE C2 respected).

## Goal

`/project` becomes the account control center: every project shown WITH what it has running —
each schedule as a plain-English chip ("Emails every Monday at 8 AM ET · next 07/07/2026 ·
Buyers list"), click the chip to tailor that schedule, clear paused/stopped states, and the
same New project / New listing entry points. Clean, dense, no dead chrome.

## What we're building

1. **Loader (server, app/project/page.tsx).** Alongside the existing projects select:
   - `email_schedules` for the user: `project_id, status, cadence, day_of_week, day_of_month,
     send_hour_et, audience_slug, next_run_at, last_run_at, template_id, deliverable-link`
   - `social_schedules`: same shape, per project.
   - `deliverables` count + latest title per project (for "3 emails built").
   Group by `project_id` in code (typed client; no phantom columns).

2. **Project card (replaces the bare list rows, mobile AND a richer desktop landing pane).**
   Per project:
   - Title (link → `projectHome(id)`) · scope place/ZIP when known · "N emails built".
   - One row per ACTIVE schedule: `✉ Emails every Monday · 8 AM ET → Buyers list · next
     07/07/2026` (📣 for social). Copy from `schedule-cadence` helpers — never re-derive
     cadence math (deterministic-math rule).
   - Paused schedule → dimmed chip with "paused"; stopped rows hidden.
   - No schedules → quiet "Nothing scheduled — open the Email tool to set one up."
   - Click a schedule chip → the existing tailor surface:
     `/project/[id]/email-lab?did=<deliverable_id>&schedule=1` when the schedule links a
     block-canvas deliverable, else the project Email tab (the schedule-command chat can
     edit any schedule from there).
3. **States row (top of page).** "N active sends this week" summary + next 3 upcoming sends
   across all projects (date-sorted from `next_run_at`), each linking to its project.
4. **Keep**: New project / New listing buttons, quick-links nav, ImportDraftOnLogin.
5. **Out of scope**: pausing/editing inline on this page (v2 — the chip links to the existing
   editor); send history charts; contact analytics.

## Verification

- `bunx next build` green.
- Live: seed one weekly schedule on a test project → `/project` shows the chip with the right
  next-send date (matches `computeNextRunAt`), click-through opens the schedule editor.
- Check: `projects_control_center_live_verify` (operator-run, closes on live proof).
