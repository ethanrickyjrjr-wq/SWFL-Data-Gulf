# Pipeline doctor — one health line per dataset

**Date:** 2026-07-12 · **Parent spec:** `docs/superpowers/specs/2026-07-11-data-contracts-doctor-design.md` §7 3c/3d
**Evidence:** `docs/audit/2026-07-11-pipeline-problems/08f-code-surface.md` (import surface, 3 cred domains)
**Parent check:** `data_contracts_doctor_live_verify` · **This check:** `pipeline_doctor_live_verify`

This is a phase of the parent build, not a separate one. All design lives in the parent spec.
Doctor is the Python health model (`ingest/scripts/doctor.py`); `doctor --json` BACKS the existing
`/census` ops page (ops-repo React) — it is not a parallel dashboard.
