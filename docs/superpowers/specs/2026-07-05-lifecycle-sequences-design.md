# Listing lifecycle sequences — milestone-fired campaign arc

**Date:** 2026-07-05
**Check:** `lifecycle_sequences_live_verify`
**Status:** approved design (operator, 07/05/2026) — build 3 of the agent-first ladder
(`2026-07-05-agent-first-homepage-design.md`). Builds 1 (hero) and 2 (address spine) are live.

## Problem

One listing deserves a campaign ARC — coming soon → new listing → market comps → under
contract → just sold — but the scheduler sends ONE piece on ONE recurring cadence. The five
listing pieces exist only as showcase slide recipes (`lib/showcase/registry.ts`,
`listing-to-close`) the user must build by hand, one at a time, with no arc state, no
milestone firing, and no way to reuse a shaped campaign on the next listing.

## Research evidence (RULE 0.4 + code probe, 07/05/2026)

- **Ylopo Listing Rocket** (ylopo.com/listing-rocket, crawled live): the one competitor doing
  lifecycle switching does it off a real-time MLS feed — "Each ad and each stage is connected
  in real time to your MLS." We have no MLS feed; auto-switching without one is a guess.
- **Our own lake cannot auto-detect either**: `ingest/pipelines/listing_lifecycle/transitions.py`
  moves a vanished listing to HOLDING with reason explicitly unknown ("sold / pending /
  withdrawn — the source doesn't say, so we don't claim"). Under-contract vs sold is not
  distinguishable from the scan. A wrong "Just Sold" on a specific address is the category's
  loudest churn driver (Reddit evidence in the build-1 spec).
- **Sharper still (operator)**: auto-detect can't even START the arc — nothing in any feed
  says the agent won the listing. The agent arming the campaign IS the entry signal.
- **Industry sequence model** (Braze Canvas / Customer.io journeys docs, crawled): sequences
  are per-enrollment state machines — entry trigger, steps fired by event or delay, exit
  criteria, idempotent per-step sends. State lives per enrollment, not in the send engine.
- **Code probe**: the single-cadence engine (`lib/email/scheduler.ts`, `run-schedules.mts`,
  `schedule-upsert.ts`, `schedule-signature.ts`) is production-grade (claim / reaper /
  idempotency / definitive-failure retry) and fully DI. `computeNextRunAt → null` parks a row
  permanently — one-shot semantics fall out of existing machinery. The block-canvas occurrence
  lane (`emaildoc-occurrence.ts`) already re-renders a saved EmailDoc per send and reads
  `subject_address` fresh via the runner's project join (address spine). The email cron ticks
  every 15 minutes (`.github/workflows/email-scheduler.yml`).

## Goal

A listing project arms its campaign arc once. The agent sees all five pieces as layouts
immediately, builds/edits any of them whenever they want, and fires each milestone manually —
send now, or schedule a frozen send for a chosen time. Each milestone causes exactly one
correctly-built send. The shaped arc is saveable as the agent's own setup, with a default that
follows to new listing projects. The single-cadence scheduler stays the untouched primitive.

## Operator decisions (locked 07/05/2026)

1. **Manual milestones.** The agent clicks "mark under contract" etc. Auto-detect ships later
   as a NUDGE at most (lake HOLDING transition suggests "did this go under contract?"), never
   an auto-send.
2. **No full build at arm.** A home can sell in 5 days. Arming shows every step's LAYOUT with
   the live-data slots visibly marked "fills fresh at build" — $0, instant. Authoring is
   user-initiated per step: next only, all five, or one at a time, any order, whenever.
3. **Send now OR schedule — schedule freezes, unlock allowed.** Confirm card offers both.
   Send now = sent immediately (cron is the safety net, not the trigger). Schedule = the
   email locks exactly as-is; the card says plainly: "Scheduling locks this email. It can't
   be edited or sent until [time] — unlock to change it." Unlock returns it to editable
   draft (nothing goes out); same-day-before-overnight-update re-sends are safe as-is, after
   the boundary a review/rebuild nudge appears (nudge, never a hard block).
4. **Nothing sends unseen.** A milestone send requires a built piece; the confirm card offers
   "build it now" (and shows it) when the step is still layout-only.
5. **Saved setups.** "Save as my setup" snapshots the shaped arc (prompts + doc skeletons,
   never project data). Nameable, multiple allowed, one `is_default` that auto-applies to new
   listing projects; every project can deviate freely (a $14.8M arc ≠ a $400K arc).
6. **Data currency is a platform job, not a send-time rebuild**: find when realtor.com
   updates each night, then land ALL our lake/brain updates right after theirs (target
   2–5 AM ET) so morning builds carry that morning's data — follow-up check
   `overnight_data_update_window`, NOT this build.

## What we're building

### Data model (two new tables, RLS owner-only like `email_schedules`, idempotent Bun.SQL migration)

**`email_sequence_setups`** — reusable arc definitions.
`id, user_id, name, is_default boolean, steps jsonb, created_at, updated_at`.
`steps` = ordered step definitions: `{ key, title, recipe_prompt, doc_skeleton? }`. Seeded
from the five `listing-to-close` recipes as the platform setup (code constant, not a DB row —
users without a saved setup arm from the constant). At most one `is_default` per user
(partial unique index).

**`email_sequences`** — one row per armed arc on a project.
`id, user_id, project_id, setup_name (provenance label only — never a FK; the platform
constant has no row), status ('armed'|'completed'|'stopped'), audience_slug,
send_hour_et, steps jsonb, created_at, updated_at`.
`steps` = the per-project working copy: `{ key, title, recipe_prompt, doc_skeleton?,
state ('pending'|'built'|'scheduled'|'sent'|'skipped'), deliverable_id?, schedule_id?,
scheduled_for?, sent_at? }`. The cron worker NEVER reads this table — only the UI and the
milestone API mutate it. Sent-state truth is reconciled from the schedule row
(`last_run_at`), never asserted blind.

### Cadence `"once"` (extension of the existing seam, no worker change)

- `Cadence` union gains `"once"`; `computeNextRunAt` returns `null` for it → the existing
  re-arm parks the row after its single fire. `describeCadence` renders "one-time send".
- `validateToolInput` accepts `cadence:"once"` with no day fields.
- `deliverableToScheduleRecipe` block-canvas lane accepts a `once` choice unchanged otherwise;
  `createOrTouchSchedule` used as-is (the 10-column signature already distinguishes rows by
  `deliverable_id`, so five steps = five distinct recipes).
- The runner's reaper staleness query excludes `cadence='once'` (a fired one-shot is parked
  by design, not an orphan). Runner query tweak only — `reapOrphans` core untouched.

### Send semantics

- **Send now**: the milestone API arms the one-shot row (`next_run_at = now`) and immediately
  runs the same processing pass the cron would run — same usage gate, verified sender,
  unsubscribe token, idempotency claim. What sends is the saved doc rendered verbatim — the
  piece exactly as the agent last saw it, no AI refill (same render lane as the frozen path).
  UI shows "Sending…" then "Sent to N contacts". If the in-request pass dies mid-flight, the
  armed row is picked up by the next cron tick and the idempotency claim guarantees the two
  paths can never both send.
- **Schedule**: freeze-at-schedule. Frozen is DERIVED, not a new column: a deliverable is
  frozen iff an active `once` schedule row references it — the lab's save path checks that
  and refuses writes (no flag to drift). The one-shot row arms with
  `next_run_at = <chosen time>`. At fire, the occurrence renders the FROZEN doc verbatim —
  no AI refill, no figure swap: what they saw when they scheduled is what goes out. Cron
  granularity is honest in the picker copy (sends within ~15 min of the chosen time).
- **Unlock (operator amendment 07/05/2026)**: a scheduled step can be unlocked — it clears
  the pending one-shot row and returns the piece to editable draft; nothing goes out. The
  data-day rule rides the card copy: re-sending the SAME day, before the overnight data
  update, the piece is safe as-is ("want it an hour later? unlock and send"). Once the
  overnight update boundary has passed, unlocking prompts a review/rebuild nudge — the
  figures now have a newer vintage than the frozen piece (nudge, not a hard block; the user
  keeps full control). Boundary timing comes from the `overnight_data_update_window`
  follow-up (realtor.com nightly timing → our updates land right after, target 2–5 AM ET).
- **Cancel** = unlock without a re-send intent: same mechanics, step back to `built`.
- The frozen lane is a small branch in the runner's `buildContent` for one-shot sequence rows:
  load deliverable → render saved doc → `emailDocHtml` verbatim (the existing short-circuit),
  skipping `buildDoc`. `processSchedule` itself is not modified.

### UI (project Email tab — the grid shell stays the one lab surface, never forked)

- Listing project with `subject_address` → "Start the listing campaign" on
  `app/project/[id]/email-lab/`. Arm = pick audience + default send hour (same pickers the
  schedule modal uses), writes the `email_sequences` row, renders the arc strip.
- **Arc strip** above the lab: five step cards (Coming Soon → New Listing → Market Comps →
  Under Contract → Sold), each showing state + actions: Preview layout · Build/Edit (opens
  the grid lab seeded with the step's recipe + address scope; save records `deliverable_id`)
  · milestone button ("It's under contract →"). Order advisory, never enforced; any step
  skippable; arc stoppable.
- **Confirm card**: piece preview, audience + recipient count, Send now / Schedule (datetime
  picker, freeze warning verbatim per decision 3), "build it now" path when layout-only.
- Scheduled step shows countdown chip + cancel. Sent step shows sent date.
- "Save as my setup" + "make this my default" toggle; arm flow prefers the user's default
  setup over the platform constant.
- Copy never leads with "AI"; "every number sourced" framing throughout.

### Error handling

- Send failures inherit the worker's classes: definitive non-2xx → same-occurrence retry
  ~30 min (send delayed, never eaten); ambiguous → claim held, no double-send. Loud exit on
  failures keeps the cron red-honest.
- Mis-click protection = confirm card + step state (a sent step offers no re-fire; explicit
  "send again" is out of scope v1).
- Usage gate / headroom, segment checks, sender verification, unsubscribe token, CAN-SPAM
  footer: unchanged, worker-enforced.
- Deal falls through → skip steps or stop the arc; "back on market" piece is a future step
  type, not v1.

### Testing

- Unit via existing DI seams: `once` cadence math; recipe bridge (`deliverableToScheduleRecipe`
  with `once`); sequence step-state transitions (pure); setup save / default-apply (pure);
  frozen-lane buildContent branch (mock deps); reaper exclusion query shape.
- ALL existing scheduler / occurrence / upsert / signature tests untouched-green.
- `bunx next build` green. No new pack slugs (vocab gate not in play).

## Non-goals

- No auto-detect, no lake-transition nudge (later build; nudge-only when it comes).
- No changes to `scheduler.ts` / `processSchedule`, packs, `--- OUTPUT ---` shapes, or the
  answer engine. No new pre-materialization gates (RULE C2).
- No social arc (email only; social chip surface is a deferred hero follow-up).
- No subject-property value estimates, ever (locked).
- No "send again" / re-fire, no per-step audience overrides in v1.

## Success criteria

- Arm once → five layout previews instantly, $0.
- Build any subset, any order; edits stick; nothing sends unseen.
- Milestone → confirm → send now lands in inboxes immediately (cron fallback proven by test);
  schedule freezes the piece and fires within ~15 min of the chosen time.
- Exactly one send per milestone — double-click, crash-replay, and cron-overlap all dedupe.
- Setup saves, default follows to a new listing project, per-project deviation works.
- Existing scheduler tests untouched-green; `bunx next build` green.
- `lifecycle_sequences_live_verify` closed by the operator on prod.

## Follow-ups (checks, not this build)

- `overnight_data_update_window` — find realtor.com's nightly update time, then land all
  lake/brain updates right after it (target 2–5 AM ET) so morning builds carry that
  morning's data; also defines the unlock rule's same-day boundary (operator 07/05/2026).
