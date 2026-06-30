# Handoff — Grid Lab Socials, Task 1 (schedule wiring) — RESUME

**Date:** 2026-06-30
**Status:** Task 1 pure core is GREEN and tested. Route + modal + shell wiring remain. Not committed, not pushed.

## Where this sits

- **Plan folder:** `docs/superpowers/plans/2026-06-29-grid-lab-socials/` — `README.md` (overview, global constraints, the **C1 decision gate**, parallel safety) + `task-1`…`task-6`.
- **Registered:** check `grid_lab_socials_live_verify` (open). Spec: `docs/superpowers/specs/2026-06-30-grid-lab-socials-design.md`.
- **Verified source handoff:** `docs/superpowers/handoffs/2026-06-29-grid-lab-socials.md` (read its REVIEW + RESEARCH section — code-verified this session, claims hold).

## DONE this session (GREEN)

- `lib/social/persist-schedule.ts` — pure builders `freezePost(draft, nowIso, {mediaUrl, freshnessToken})` and `buildSocialScheduleInsert(input)` → `SocialScheduleInsert` (the exact `social_schedules` column shape, `status:"active"`, `freshness_gate:true`, no-invention media handling). Exports `SocialScheduleInput` + `SocialScheduleInsert` for the route.
- `lib/social/__tests__/persist-schedule.test.ts` — **3 pass / 15 assertions.** Re-run: `bun test lib/social/__tests__/persist-schedule.test.ts`.

## RESUME Task 1 here (plan Steps 5→11)

1. **Confirm `social_schedules` is in the typed client.** `grep -n social_schedules database.types.ts` — if absent, `bun run gen:types`. The route's `.from("social_schedules")` must typecheck.
2. **Build `app/api/social/schedule/route.ts`** — full code is in `task-1-schedule-wiring.md` Step 6. Key points:
   - Cookie/RLS client `createClient(await cookies())`, `auth.uid() = user_id` authorization — **never service-role** (mirrors `app/api/email/schedule-command/route.ts`).
   - Gate platforms to the **5 publishable** (`PUBLISHABLE = ["x","facebook","instagram","linkedin","google_business"]`, the `Platform` union in `lib/social/types.ts`) — never the 8 display platforms.
   - `computeNextRunAt(spec)` → `next_run_at`; one `social_schedules` row per selected platform; confirm-only (no LLM parse).
   - **DRY invariant:** this writes a recipe + `frozen_post` only. It NEVER calls `postToChannel`.
3. **`components/email-lab/ScheduleSocialModal.tsx`** — mirror `components/email-lab/ScheduleSendModal.tsx`. Platform multi-select (5 publishable, label via `platformLabel` from `lib/social/channels/index.ts`), cadence radio, ET-hour select, account select from `social_accounts` where `status="connected"`. POST `/api/social/schedule`; show `formatScheduleSendTime(next_run_at)`.
4. **`components/email-lab/SocialCalendarPanel.tsx`** — add `onSchedule: (draft: SocialDraft) => void` prop + a third "Schedule" button (amber) in the action row (code in task-1 Step 7).
5. **`components/email-lab/EmailLabGridShell.tsx`** — `scheduleDraft` state, pass `onSchedule={setScheduleDraft}`, render the modal gated on the shell's existing `capabilitiesFor("paid").socialCalendar` (do NOT add a new tier check — read `lib/email/lab/capabilities.ts`).
6. **Verify:** `bunx next build 2>&1 | tail -20` (TS clean) + `bun test lib/social`. Then commit (paths in task-1 Step 11) — and per operator rule, **append a SESSION_LOG entry in the same commit; do not push without explicit confirmation.**

## Reusable primitives (do NOT rebuild a scheduler)

- `lib/email/schedule-cadence.ts` — `computeNextRunAt(spec, fromUtc?)`, `formatScheduleSendTime(iso)`, `type CadenceSpec` (cadence + day_of_week/day_of_month + send_hour_et, ET wall-clock, DST-correct).
- `lib/deliverable/parse-scope.ts` — `parseDeliverableScope`.
- `lib/social/idempotency.ts` — `claimSocialOnce(db, key, ctx)` against `social_send_ledger` (if you add a single-use confirm nonce).
- `lib/social/cadence-reuse.ts`, `lib/social/types.ts` (`SocialSchedule`, `FrozenPost`, `Platform`, `ScheduleStatus`).
- Mirror route: `app/api/email/schedule-command/route.ts` (two-step PROPOSE→CONFIRM + nonce + claimOnce). The social panel does confirm-only, so a single POST is fine — add the nonce only if you expose a free-text propose path later.

## The gap this closes

The U2 "confirm → INSERT `social_schedules`" flow (`SOCIAL BUILD/U2-ask-ai-schedule-and-compose.md`) is a **spec, not shipped code** — nothing in the product writes the rows the cron (`scripts/social/run-schedules.mts` + live `social-scheduler.yml`) reads. Task 1 is that missing write, driven from the lab.

## Still pending — operator decision (blocks Tasks 5 & 6 only)

**C1 composition seam** (full detail in README + `task-5-composition-seam.md`): (a) SocialModel-on-grid — free per-platform PNGs via the existing `renderSocialImage`, template-limited composition; vs (b) EmailDoc→PNG — true grid composition but needs a net-new HTML→PNG rasterizer (resvg can't do HTML; Satori/`@vercel/og`/headless, vendor-verify in-session first). Recommendation: ship Tasks 1–4, then start (a), keep (b) as fast-follow. **Tasks 1–4 are NOT blocked by this.**

## Parallel safety

Tasks 1, 2, 5, 6 all touch `EmailLabGridShell.tsx` + `SocialCalendarPanel.tsx` → 🔴 serial chain (run 1→2→5→6). Tasks 3 + 4 touch only `lib/email/social-calendar/*` + tests → parallelize freely.

## Guardrails (don't trip these)

- Socials stays **paid-only** via `capabilitiesFor(tier).socialCalendar`; never hardcode a tier check; don't relax `lib/email/lab/capabilities.test.ts`.
- Publish targets = the **5** `Platform` members only; the **8** in `lib/email/social/platforms.ts` are display/branding (tiktok/youtube/pinterest/threads have no adapters).
- No-invention moat: every caption/card figure names a source; empty stat → omit, never `$0`/`N/A`.
- As-of dates render MM/DD/YYYY, once. No internal IDs/jargon user-facing.

## Files touched this session

`lib/social/persist-schedule.ts` (new), `lib/social/__tests__/persist-schedule.test.ts` (new), `docs/superpowers/plans/2026-06-29-grid-lab-socials/` (new folder, 7 files), `docs/superpowers/specs/2026-06-30-grid-lab-socials-design.md` (stub → pointer). Check `grid_lab_socials_live_verify` opened.
