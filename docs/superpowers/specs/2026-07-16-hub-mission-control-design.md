# Hub center: mission-control dashboard — design

**Date:** 2026-07-16 · **Status:** approved design, pre-plan
**Check:** `hub_mission_control_live_verify` · **Slug:** `hub-mission-control`
**Supersedes:** the hub center's grouped project list (same-day cockpit fix) — the rail
is the ONE project list now; the center becomes a dashboard.

## Operator ask (07/16/2026, verbatim anchors)

- "Center project area is just a lot of real estate we are wasting just putting up
  project information that is on the left side."
- "a widget/dashboard type area with calendar (hopefully connected to their schedule,
  campaign analysis which clicks into a few charts on clicks and what's working or not,
  a see project button that shows the frozen and user can choose to edit and update it."
- Calendar sizing correction: "Maybe not a thumbnail, just smaller that you can click
  on… Not the center of attention."
- Scope decision (asked): GLOBAL mission control — calendar and campaign analysis span
  all projects; the see-project widget follows the rail/pill selection.
- See-project verbs (asked): **See it** = frozen render · **Edit** = open the doc in
  the lab · **Update** = refresh the figures from fresh data, show for approval,
  **never auto-send**.

## Research this design stands on (RULE 0.4 — all read/fetched 07/16/2026)

- `docs/steadyapi-research/2026-07-16-round5-recurring-problems-solutions.md` — the
  automation-trust boundary agents draw on Reddit: back-office assembly is trusted,
  client-facing sends need a human edit gate. The See/Edit/Update flow sits on the
  trusted side ONLY if Update never sends by itself. Non-negotiable.
- `docs/steadyapi-research/2026-07-16-new-implementations-ux-sweep.md` — Granola's
  "Brief" pattern (surface what-matters-now automatically, not raw data); the
  audit-trail finding (visible provenance wins trust) → every dashboard number carries
  its as-of date and comes from stored events, nothing modeled.
- pencilandpaper.io "UX Pattern Analysis: Data Dashboards" (crawl4ai, scratchpad) —
  the hub center is their "contextual index" dashboard type (overview + navigation);
  F-pattern ordering (actionable top-left, detail lower); consistent card layout;
  **drawer pattern** for drill-in without leaving context.
- Mailchimp "About Email Campaign Reports" (crawl4ai, scratchpad) — the standard
  campaign metric set: delivered, open rate (opened/delivered), click rate
  (clicked/delivered), bounced, unsubscribed, 24-hour opens+clicks graph, and
  comparison against YOUR OWN average (we show no external benchmarks — lane rules).
- NN/g empty-state guidelines (crawled earlier today, welcome build) — every card's
  empty state says what will appear there and gives the direct pathway.

## Layout (center column only — rail, pills, aside chrome untouched, one-room law)

```
[ rail ][ ToolSwitcher pills — unchanged                                ][ aside     ]
[      ][ strip: "Mission control" · New listing/Showing prep/New proj  ][ AI (top)  ]
[      ][ ┌─ Calendar (compact) ─┐  ┌─ Selected project ──────────────┐ ][ dossier   ]
[      ][ │ mini month grid,     │  │ frozen preview (scaled)         │ ][ starters  ]
[      ][ │ dots on send days,   │  │ [See it] [Edit] [Update]        │ ][ contacts  ]
[      ][ │ next-3-sends list    │  └─────────────────────────────────┘ ][           ]
[      ][ └──────────────────────┘                                      ][           ]
[      ][ ┌─ Campaigns (full width, the visual weight) ───────────────┐ ][           ]
[      ][ │ row: name · last send · delivered · open% · click% · Δavg │ ][           ]
[      ][ │ row click → right slide-over drawer with charts           │ ][           ]
[      ][ └───────────────────────────────────────────────────────────┘ ][           ]
```

All cards use the existing section grammar (uppercase tracking labels, `border-white/8`
separators, aside-tone backgrounds) — no new container idioms. Mobile: cards stack
single-column, same as the labs.

## Widgets

### 1. Calendar — compact, real, clickable; not the center of attention

- A functioning current-month mini-grid (not a static image): teal dot on any day with
  a scheduled send (✉ email / 📣 social), today outlined, paused schedules excluded.
- Under the grid: the next 3 upcoming sends as one-line chips (existing chip grammar +
  hrefs from `buildScheduleChips`) — click goes to that schedule's tailor surface.
- Clicking a dotted day filters/highlights that day's sends in the under-grid list (no
  popovers — clipped-popover lesson from this morning).
- Data: `email_schedules` + `social_schedules` (status active), expanded into concrete
  dates for the visible month by a NEW pure util `lib/project/schedule-calendar.ts`
  (cadence + day_of_week/day_of_month + send_hour_et + next_run_at → date list),
  unit-tested. Deterministic expansion of explicit cadence fields only — no inferred
  dates. Month navigation (‹ ›) within the card is in scope; anything fancier is not.
- Empty state: "Schedule a send and it lands here — Schedule →" (into the selected
  project's email tool).

### 2. Campaigns — the analysis, one click deep

- One row per campaign with real, stored numbers: name, last send date, delivered,
  open % (opened/delivered), click % (clicked/delivered), and a small delta arrow vs
  the user's OWN average across their campaigns. No external benchmarks, ever.
- Data root: `email_events` (sent/delivered/opened/clicked/bounced/unsubscribed per
  `did` + contact, written by the Resend webhook) joined to `deliverables` for names,
  aggregated by a NEW pure util (`lib/email/campaign-stats.ts`) behind a small API
  route following the existing `blast-results` route's pattern. Campaign identity =
  the deliverable; the plan MUST probe (RULE 0.5) how scheduled re-sends land (same
  `did` vs new deliverable per run) and group accordingly before coding the util.
- **Row click → drawer** (slide-over from the right edge, aside-tone chrome:
  `bg-[#0f1d24] border-l border-[#0a141a]`): KPI counts (delivered, opened, clicked,
  bounced, unsubscribed), opens+clicks over the first 24h after send (line chart), and
  open-rate send-over-send trend (bar/line) — reusing existing `lib/charts` frames.
  Charts render ONLY if the underlying event timestamps support them (plan probes the
  `email_events` timestamp column); a missing shape degrades to the counts table,
  never an invented curve.
- A one-line plain-language read above the rows — e.g. "Newsletter is your strongest
  open rate (62% over 4 sends)" — computed deterministically in code (max by open%
  with a minimum-sends floor), NEVER by a model.
- Empty state: "Send your first campaign and opens/clicks appear here — Start a
  campaign →" (points at the aside's starters, not a duplicate button).

### 3. Selected project — See it / Edit / Update

- Follows the rail/pill selection (same `selected` state the cockpit already holds).
- Shows a scaled frozen preview of the project's latest built deliverable (reuse the
  existing frozen render used by `/p/[id]` — `EmailPreviewFrame`).
- **See it** → the full frozen view (the `/p/[id]` page for that deliverable).
- **Edit** → `projectEntry(id, lastDid)` — the doc opens in the lab (existing path).
- **Update** → NEW server path: re-runs the SAME data-fill seam the lab's Fill uses
  against the saved doc server-side, producing fresh figures in the same layout; the
  refreshed version replaces the preview with a "review before you send" affordance.
  It never sends, schedules, or alters an active schedule. (This is the automation-
  trust boundary from the Reddit research, kept structural.)
- No built email yet → "Build the first email →" pathway into the lab.

## One fact, one home (deletions that ride along)

- The center grouped project list DIES — the rail is the only project list.
- The aside's "Running now" section RETIRES — next-send facts live in the calendar
  card now. The aside keeps: docked AI, selected-project dossier + chips, campaign
  starters, contacts.

## Non-goals

- No month-grid centerpiece (rejected as approach B), no external benchmarks, no
  lead-gen/CRM features, no auto-send anywhere, no new data pipeline (all widgets ride
  stored schedules/events/deliverables), no changes to rail/pills/aside chrome.

## Testing & verification

- Pure utils unit-tested: schedule→calendar expansion, campaign aggregation +
  own-average deltas, the "strongest campaign" line.
- Coverage/mount invariants untouched (no new AI surfaces).
- `bun test lib/project lib/email lib/briefcase` + `bunx next build` green.
- Live verify per `.claude/skills/verify`: prod build, hub ⇄ email-lab room constancy,
  drawer open/close, See/Edit paths; Update verified against a real saved doc.
- Check `hub_mission_control_live_verify` closes only after the operator sees it live.
