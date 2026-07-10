# Email send-window clamp + researched best-time guidance

**Date:** 07/10/2026 · **Status:** direction locked (operator), UX pass pending its own brainstorm
**Build check:** `send_window_guidance_live_verify`
**Companion:** `2026-07-10-batch-narrative-bake-design.md` (overnight cron replan)

## Problem

Users can schedule emails at any hour. Two gaps: (1) no floor/ceiling — a 2 AM send is allowed
and lands badly; (2) we hold researched send-time evidence but surface none of it, leaving the
scheduling flow as generic as every cookie-cutter competitor's.

## Goal

Operator direction (07/10/2026): sends go out only between 7:00 AM and 10:30 PM in the
recipient-facing local time (Eastern for our market), and the scheduling flow actively teaches
the researched best slot. Strategy: every pre-computed research detail we surface in
customer-facing flows — cited, specific, quietly confident — is a trust-and-authority
differentiator. We do the homework so the product sounds like it did.

## Evidence

Brevo send-time study (crawl4ai, 07/10/2026, brevo.com/blog/best-time-to-send-email — analysis of
their sent-mail corpus): engagement peaks at 10:00 AM local with a secondary peak ~3:30 PM; best
days Tuesday and Thursday; the broad good band is working hours (10 AM–3 PM). Per-industry
variations exist on the same page (e.g. marketing services peak ~4 PM) — a future refinement lane.

## What we're building

1. **The clamp (product code, not cron).** The every-15-minutes scheduler worker keeps running
   around the clock; enforcement lives in the scheduling path (`lib/email/schedule-command.ts` +
   the schedules worker). Timezone-aware and DST-correct (America/New_York rules, never a fixed
   UTC offset). An out-of-window request is shifted to the next allowed slot and the user is told
   plainly ("scheduled for 7:00 AM — sends don't go out overnight"). Never silently dropped.

2. **The suggestion.** When a user schedules a send, the flow offers the researched default:
   around 10 AM local, Tuesday or Thursday — with its one-line why and the named source riding
   along (four-lane rule 1: a named web source, cited). Copy says "around 10 AM"; our
   infrastructure cron minutes (:23 anti-congestion offsets) never appear in customer copy.

3. **One root.** Window constants + suggestion copy live in one module so the lab scheduling UI,
   the schedule-command parser, and the digest all read the same values — no per-surface forks.

## Open for the UX brainstorm (not yet decided)

- Where the suggestion renders in the lab scheduling flow (inline default vs nudge vs picker
  preset) and exact copy.
- Whether the assistant's schedule-command replies quote the research when a user picks an
  off-peak time.
- Per-industry refinements (Brevo's page carries them) — later lane, needs its own read.

## Testing (when built)

Unit: clamp math across DST boundaries (spring-forward/fall-back days), window edges (6:59/7:00
AM, 10:30/10:31 PM), shift-to-next-slot correctness. Live verify: one real scheduled send placed
out-of-window lands at the clamped slot; check `send_window_guidance_live_verify` closes on that.
