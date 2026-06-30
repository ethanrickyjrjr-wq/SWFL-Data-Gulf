# Grid lab socials: schedule + status + per-platform output

**Date:** 2026-06-30

## Problem

The paid `/email-lab/grid` social surface can only generate / copy / load. There is no path to schedule, no status workflow, and captions/visuals don't tailor per platform. The `lib/social` publish engine + cron already run (DRY-gated) — the gap is the product surface.

## Goal

Wire the lab to the existing engine: schedule a generated post into `social_schedules`, track lab status (draft→live), tailor captions per publishable platform, and (after the C1 composition decision) compose + export platform-correct images.

## What we're building

Full task-by-task plan lives in the folder: **`docs/superpowers/plans/2026-06-29-grid-lab-socials/`** (README = overview + the C1 decision gate + parallel safety; `task-1`…`task-6`). Verified source handoff: `docs/superpowers/handoffs/2026-06-29-grid-lab-socials.md` (REVIEW + RESEARCH section). Task 1 (schedule wiring) is seam-independent and started first.
