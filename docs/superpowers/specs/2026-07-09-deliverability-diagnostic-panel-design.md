# Deliverability diagnostic panel

**Date:** 2026-07-09

Registered via `new-build.mjs` at implementation time. The real design doc is
`docs/superpowers/specs/2026-07-08-deliverability-diagnostic-panel-design.md`
(written during brainstorming the day before) — see its "CORRECTED 2026-07-09"
note for the architecture fix (blast-send bounce/complaint capture) made
during this build. Not duplicating content here; this stub exists only so the
build-registration convention has a same-dated file.

`deliverability_diagnostic_panel_live_verify` is the open check — it covers
verifying a real `did`-tagged bounce/complaint event flows through the new
webhook branch into `email_events` and shows up correctly on
`/settings/deliverability`, which can't be produced synthetically in-session.
