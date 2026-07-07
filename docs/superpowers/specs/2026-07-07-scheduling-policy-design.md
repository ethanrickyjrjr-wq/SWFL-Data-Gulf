# Scheduling policy — batch window, checks window, send window

Status: DRAFT — awaiting operator review before `writing-plans`.
Supersedes the numeric windows floated earlier in this conversation (10 PM start, 7:05 AM–1:50 AM
send window, hard gate-on-failure) — the operator's final numbers are below.

## 1. The policy

Three windows, Eastern local time (wall-clock, DST-safe — see §2):

- **BATCH** — 11:00 PM–5:00 AM ET. Data ingest, brain rebuild, pulse pipelines. Target, not a hard
  wall: "get all we can easily [there]. Harder things leave follow up... if we cannot move something
  because of time, we leave it." (operator, 2026-07-07)
- **CHECKS** — 5:00 AM–6:00 AM ET. Freshness + DB-parity validation. One hour.
- **FIX BUFFER** — 6:00 AM–7:00 AM ET. Implicit in "leaving an hour for checks" + "if checks fail, we
  fix as fast as possible" — no job is scheduled here by design; it's operator response time.
- **SEND** — 7:00 AM–11:00 PM ET. Both the automated daily digest and every user-chosen per-project
  send time live here.

**Gate semantics (soft, not hard):** checks are alerting, not a blocking gate. "If checks fail, we fix
as fast as possible and scheduled emails before fix go out, along with current schedule" (operator,
verbatim, 2026-07-07) — a failure does not hold or cancel a send. This reverses the "hard gate"
answer given earlier in this session; that answer is superseded by this instruction. No new
blocking mechanism is built. The existing degrade-gracefully pattern (`daily-rebuild.yml`'s exit-2
"degraded-but-complete", prior `master.md` kept serving on HELD) already means a checks failure
usually means "yesterday's good data still serves," not "broken data goes out" — the fix window is
for the operator to catch and correct anything that pattern doesn't cover.

## 2. Mechanism: GitHub Actions native `timezone:` key

Verified live against GitHub's docs this session (`docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows`,
fetched via crawl4ai 2026-07-07): `schedule:` entries support a per-entry `timezone:` IANA string.

```yaml
on:
  schedule:
    - cron: "30 5 * * 1-5"
      timezone: "America/New_York"
```

This is DST-correct automatically — GitHub's own docs confirm scheduled workflows in a DST-observing
zone skip forward through the spring-forward gap (a 2:30 AM entry runs at 3:00 AM that one day) and
otherwise track local wall-clock. This matches the pattern `lib/email/schedule-cadence.ts` already
uses for the app's own per-project scheduler (`Intl.DateTimeFormat` + `America/New_York`) — both
layers now express "3 AM Eastern" as a literal wall-clock instruction, not a fixed UTC-5/UTC-4 offset
that would drift with the seasons. **Every workflow touched by this policy gets `timezone:
"America/New_York"` added to its schedule entries** — this replaces hand-computed UTC times.

Minimum GHA schedule interval is 5 minutes; standard 5-field POSIX cron syntax; GitHub does not
support `@daily`/`@hourly` shorthand.

## 3. Workflow inventory and classification

54 active scheduled workflows exist today (`grep -rn cron: .github/workflows/*.yml`, 2026-07-07). Each
falls into one of five buckets. All current-time references below are ET (EDT, UTC-4, correct for
July 2026 — irrelevant once `timezone:` is added, since times become wall-clock-native).

### 3a. Already compliant (inside 11 PM–5 AM ET) — no change needed

`daily-rebuild.yml` (2:00 AM), `news-swfl-ingest.yml` (2:00 AM), `build-example-deliverables.yml`
(4:00 AM), `swfl-inc-weekly.yml` (4:00 AM Mon), `project-feed-change-detection-daily.yml` (4:30 AM),
`city-pulse-daily.yml` (5:00 AM — right at the edge; recommend nudging to ~4:30 AM for headroom),
`census-acs-annual.yml` (6:00 AM edge → recommend 4-5 AM), `census-cbp-annual.yml`,
`fdot-aadt-annual.yml`, `ingest-fl-dbpr-licenses.yml`, `ingest-mhs-permits-swfl.yml`,
`leepa-parcels-annual.yml`, `marketbeat-pdf-ingest.yml`, `ingest-lee-associates-swfl.yml`,
`dbpr-sirs-monthly.yml` (3 AM), `franchise-outcomes-quarterly.yml` (4 AM) — all within or at the edge
of the window already.

### 3b. Reclassify as CHECKS — move into 5-6 AM, consolidate

- `gate-a-parity.yml` — currently 3:00 AM (`0 7 * * *`). It's a validation gate (DB parity), not a
  batch job — belongs in the CHECKS hour, not BATCH.
- `freshness-probe-daily.yml` — currently 10:00 AM (`0 14 * * *`), explicitly commented
  "non-gating: observability, not enforcement." Move to the CHECKS hour; its own SLA-breach exit
  code (1) is real, it's just never been wired to anything downstream.

**Proposal:** merge both into one `morning-checks.yml` running both jobs (parallel or sequential) at
5:00 AM ET. This gives one clear "did today's checks pass" signal in the Actions UI instead of two
independent jobs, and matches the "leaving an hour for checks" framing as a single named block.
Failures already surface via the existing cron-incident auto-capture
(`log-cron-incident.yml` → `docs/cron-rebuild-failures.md` + issue #44, per prior session) and GitHub's
own scheduled-workflow-failure notification to the repo owner — no new alerting channel is needed for
the "fix as fast as possible" response.

**Needs verification before flipping:** `freshness-probe-daily.yml`'s comment says it runs "after the
13:00 UTC ingest cluster" (the ~9 AM ET monthly/quarterly pile). Moving checks to 5 AM means they run
*before* that cluster. This is very likely fine — monthly/quarterly tables have day-level SLAs in
`cadence_registry.yaml`, not hour-level, so checking them 4 hours earlier in the day shouldn't produce
a false STALE — but this should be confirmed with a dry-run (`check_freshness --dry-run`) before the
schedule flips, not assumed.

`data-targets-daily.yml` (currently 10:30 AM, depends on freshness-probe per its own comment) moves
with it — lands at ~6:05 AM, inside the FIX BUFFER hour, which is fine since it's a light derived-table
regen, not raw ingest.

### 3c. Easy moves — hour is free, no documented dependency blocks a shift

The large majority of the monthly/quarterly/annual tail is anchored to a **day-of-month or
day-of-quarter** (driven by real vendor publish calendars — documented per-file, e.g. "BLS QCEW ~5mo
lag; quarterly release ~day 6-7... Day 9 = 2-day buffer") but the **hour** within that day is a free
choice, clustered at 11:00–14:00 UTC (7–10 AM ET) only because `docs/standards/pipeline-freshness.md`
§3 says to "pick within that band unless you have a reason to deviate" — an internal stagger
convention, not a vendor-hour lock. Moving the hour into the BATCH window does not touch the
day-of-month logic and is mechanically safe:

`bls-laus-monthly.yml`, `bls-oews-annual.yml`, `bls-qcew-quarterly.yml`, `collier-parcels-annual.yml`,
`faf5-annual.yml`, `fdle-crime-quarterly.yml`, `fgcu-reri-monthly.yml`, `fhfa-hpi-quarterly.yml`,
`fl-dor-sales-tax-monthly.yml`, `fl-dor-tdt-monthly.yml`, `fred-laus-alfred-monthly.yml`,
`ingest-census-vip.yml`, `ingest-fred-g17.yml`, `ingest-fred-listing-swfl.yml`,
`ingest-local-cre-context.yml`, `ingest-market-heat-swfl.yml`, `noaa-ghcn-rainfall-monthly.yml`,
`rsw-airport-monthly.yml`, `swfl-search-demand-monthly.yml`, `tier-divergence-tier1-monthly.yml`,
`tier-divergence-tier2-monthly.yml`, `view-vintages-monthly.yml`, `zhvi-tier1-monthly.yml`,
`zhvi-tier2-monthly.yml`, `zori-tier1-monthly.yml`, `zori-tier2-monthly.yml`,
`home-values-investor-monthly.yml`, `hurdat2-annual.yml`, `ingest-market-aggregates-details.yml`,
`dbpr-public-notices-weekly.yml`, `lee-permits-weekly.yml`, `ingest-crexi-listings.yml`,
`ingest-rentals.yml`, `ingest-market-aggregates-histogram.yml`, `notion-sync-weekly.yml`.

**Two coordinated sub-groups within this bucket** — move together, keep relative offsets, don't
re-derive them:
- **Redfin day-15 cluster**: `redfin-monthly.yml` (anchor, 9 AM) → `redfin-price-drops-monthly.yml`
  (+4h) → `redfin-contract-cancellations-monthly.yml` (+1h) → `redfin-delistings-relistings-monthly.yml`
  (+1h). Shift the anchor into BATCH, keep the +4h/+1h/+1h offsets.
- **usgs/storm pair**: `usgs-monthly.yml` (anchor) → `storm-history-monthly.yml` (+1h, "to stagger").

**Required alongside this bucket, same PR:** rewrite `docs/standards/pipeline-freshness.md` §3's
band rule ("existing workflows use 11:00–14:00 UTC") to the new band, and its slot table — otherwise
the next new pipeline gets placed back in the old band by whoever follows that doc, silently
re-opening the gap this policy closes.

Low priority note: `swfl-search-demand-monthly.yml`'s comment ("verified-clear slot... busy window is
Mon 06:00–13:00 UTC") describes the *current* collision map — it goes stale the moment other crons
move, and needs re-checking against the *new* map, not blindly trusted.

### 3d. Needs a better plan — real dependency or risk, don't flip same-day

- **`active-listings-daily.yml`** — 4 counties staggered 3h apart (Collier/Lee/Charlotte/Sarasota,
  9 AM total span) specifically to dodge the source site's WAF burst-throttle (comment: "avoids
  tripping the source's sustained-burst 403 throttle"). A 9-hour span does not fit inside a 6-hour
  BATCH window without compressing the stagger gap — e.g. to 2h (11 PM/1 AM/3 AM/5 AM). That's a real
  behavior change to a rate-limit mitigation that was tuned empirically (run 28254764976 proved 3h
  clean); a tighter gap needs its own validation dry-run before being trusted unattended. **Follow-up,
  not this pass.**

- **`listing-lifecycle-daily.yml` + `lifecycle-nudges-daily.yml` (coupled)** — 3 counties (Lee/Collier/
  Hendry) staggered 3h apart, same WAF reason, 6-hour span — this one numerically *does* fit an 11 PM/
  2 AM/5 AM placement inside the BATCH window without changing the gap. But `lifecycle-nudges-daily.yml`
  depends on all three finishing first (comment: "after all three staggered... county runs... have
  committed") and currently runs at noon — moving listing-lifecycle to end at 5 AM pushes nudges into
  the CHECKS hour, competing for that slot. Possible but needs a validation dry-run (does running Lee,
  the heaviest county at ~7.4k listings, at 11 PM instead of 5 AM change anything about the source
  site's behavior — maintenance windows, etc. — nobody has tested this) and a decision on where nudges
  lands (start of FIX BUFFER at 6:00 AM is the natural slot). **Follow-up, not this pass.**

- **`live-search-daily.yml`** — currently 8 AM, comment says "after overnight vendor publishes, before
  market hours" — vague enough that I can't confirm from the code alone whether an earlier BATCH-window
  time would still be "after" whatever it's waiting on. **Needs the vendor's actual publish-time
  confirmed (RULE 0.4 — crawl4ai, not assumption) before moving.**

### 3e. Out of scope by design — must not move

- `data-readiness-cron.yml` (hourly, `0 * * * *`) — matches its own 75-minute send look-ahead window;
  has to run all day to catch imminent sends, not just overnight.
- `tripwire-hourly.yml` (hourly) — spend-safety monitor, unrelated to data freshness, must stay hourly.
- `email-scheduler.yml` (`*/15 * * * *`) — the per-project SEND mechanism itself; ticks all day by
  design. Its cron cadence doesn't move; what changes is the picker window feeding it (§4).
- Several currently-paused workflows (`corridor-pulse-weekly.yml`, `collier-permits-monthly.yml`,
  `outreach-drip.yml`, `outreach-demo.yml`, `social-scheduler.yml`, `social-engagement-poll.yml`,
  `weekly-read.yml`, `watch-scan-daily.yml`, `watch-digest-daily.yml`) have no live schedule to move
  today — when each goes live, its planned cron should be authored against this policy from day one
  rather than migrated later.

## 4. Send-layer changes

### 4a. `daily-email-digest.yml`

Move from `0 10 * * 1-5` (6:00 AM ET) to a time ≥7:00 AM ET (inside SEND), e.g. `0 11 * * 1-5` with
`timezone: "America/New_York"` for a literal 7:00 AM. Given the soft-gate decision (§1), **no
workflow_run dependency or blocking check is added** — this is a pure time-ordering change, consistent
with "scheduled emails ... go out, along with current schedule" regardless of check outcome.

### 4b. Per-project user-chosen send time (`email_schedules.send_hour_et`)

Today: whole-hour picker, `send_hour_et` 0–23, already DST-correct via `lib/email/schedule-cadence.ts`.
Operator chose **real 5-minute precision** over rounding to hour boundaries. This is a real schema +
code change, larger than the cron edits above:

- **Migration:** add `send_minute_et smallint NOT NULL DEFAULT 0 CHECK (send_minute_et >= 0 AND
  send_minute_et <= 59)` to `email_schedules`.
- **`lib/email/schedule-cadence.ts`:** `CadenceSpec.send_minute_et`; `nyWallToUtc` gains a minute
  param; `computeNextRunAt`, `describeCadence`, `hourLabel`-equivalent formatting all need the minute
  threaded through.
- **Validation (new):** reject any create/update where the resulting ET wall-clock falls in
  `[00:00, 07:00)` — i.e. require `07:00 <= send_time` (the send day's) — enforced in
  `lib/email/schedule-write.ts`'s `writeAction`, both the `create` and `change-cadence` branches, so it
  covers the NL chat lane and the structured PATCH lane identically (the file's own comment already
  flags this as the one shared validated write path).
- **UI:** `components/account/ScheduleManager.tsx` (`EditForm`, confirmed — `useState(row.send_hour_et)`
  at line 185, PATCHes `/api/email/schedules/[id]`) is the structured edit surface and needs a minute
  control alongside its hour control. `components/briefcase/ChatScheduleCard.tsx` is the NL-chat
  confirm-card surface and needs the same. Both must reject/clamp selections inside the disallowed
  window client-side too (server validation in `schedule-write.ts` is the real gate; client-side is UX
  only).

**Open scope question for the operator:** is 11:00 PM the *only* disallowed lower bound, or does the
disallowed window need to track the BATCH window as it opportunistically widens (per §3's "we will
start running 10 PM to 5 AM based on good times" aspiration)? Recommend hard-coding `07:00–23:00` as
the allowed window now (matches this session's numbers exactly) and revisiting if the BATCH window
target changes later, rather than trying to derive one from the other dynamically.

## 5. Rollout plan

1. Write `timezone: "America/New_York"` support into a shared understanding — no shared code needed,
   it's a YAML key per workflow.
2. **Phase 1 (this pass):** §3a nudges, §3b checks consolidation (with a dry-run freshness check
   first), §3c easy-move bucket + the `pipeline-freshness.md` §3 rewrite, §4a digest time move.
3. **Phase 1 checks to open** (RULE 2.4 — no silent deferrals): one `checks` entry per §3d item
   (`active-listings-daily` WAF-compression validation, `listing-lifecycle` + `lifecycle-nudges`
   compression validation, `live-search-daily` vendor-publish-time confirmation) plus one for the §4b
   schema/UI build (bigger than a cron edit, its own small plan).
4. **Phase 2 (follow-up, after Phase 1 checks close):** §3d items, once each is validated.
5. Every changed workflow keeps its `workflow_dispatch` escape hatch untouched — this policy only
   touches `schedule:` blocks.

## 6. Explicitly out of scope for this spec

- Building the §4b schema/UI change in this pass — it's called out as its own follow-up (item 3 in
  §5) since it's a real feature (migration + cadence math + UI), not a cron edit, and deserves its own
  `writing-plans` pass rather than being bundled into ~50 mechanical YAML edits.
- Any change to `ENGINE_ENABLED`, the per-pipeline WAF/throttle mitigations themselves, or the
  cron-incident auto-capture system — all reused as-is.
