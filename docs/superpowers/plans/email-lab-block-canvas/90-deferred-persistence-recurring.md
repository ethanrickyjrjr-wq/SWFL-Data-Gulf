# TASK 90 — Persistence + recurring refresh   🔵 OPUS  ⏸ PENDING

**Wave:** deferred · **Depends on:** 40 + **operator sequencing decision** (spec open question 4) · **Parallel-safe with:** —
**Owns:** TBD — new files only; do NOT modify the editor files above.

> ⏸ **Blocked on a decision:** fold into this build, or write as a separate recurring-send spec? Don't start until the operator picks. The architecture already supports both; this is sequencing, not feasibility.

## Phase 6 — Save / load a layout
- Persist an `EmailDoc` as the **project's** saved design (one design per project — *not* multi-layout-per-project). New row (e.g. `project_email_design`) keyed by project id. Block ids are stable (Task 00) so a saved doc reloads intact and the AI patch can target it.
- Load on `/project/[id]/email-lab` open; "Freeze / Save design" button writes it.

## Phase 7 — Scheduled re-fill + send
- A cron wrapper that, per subscribed project: load saved `EmailDoc` → run the **content-patch** fill against fresh lake data (layout/colors frozen) → `render()` → send via the existing digest rails (`scripts/email/build-digest.mts` pattern: idempotency guard, `--dry-run`, send-log). Ships its GHA cron + `--dry-run` in the same PR (pipeline-freshness rule).
- Three nouns hold: **Layout** (saved, sticky) → **Issue** (layout + this period's data + AI reading) → **Project** (the container).

## Acceptance
- Save → reload → identical doc. Dry-run cron re-fills numbers, leaves layout/colors unchanged, logs `send_status`.
