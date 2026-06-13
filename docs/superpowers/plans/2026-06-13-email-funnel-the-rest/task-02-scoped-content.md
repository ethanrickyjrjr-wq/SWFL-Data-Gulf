# Task 02 — Scoped content via the grounded engine (makes the copy true)

**Check key:** `email_scoped_content` · **Order:** after Task 01 · **Risk:** medium (live-route-adjacent
content path; diff-review before push — RULE 1).

## Goal

When a schedule carries a `scope`, send a **real, cited, branded one-pager about that scope** instead
of the global digest. This is the moment `WELCOME_SYSTEM`'s promise becomes literally true. `scope == null`
keeps the existing global-digest path byte-for-byte unchanged.

## Grounded refs

- `scripts/email/run-schedules.mts:223-228` — `buildContent(_row)`, the seam to change (currently
  ignores the row, returns `buildBody(getDigest())`).
- `scripts/email/run-schedules.mts:72-88` — `getDigest()` / `buildBody()` (the global path to preserve).
- `lib/deliverable/build.ts`, `lib/deliverable/assemble.ts`, `lib/deliverable/brand-theme.ts` — the
  grounded engine (same one the welcome free-build uses). **Audit its `build()` input shape in-session
  before wiring — do NOT trust this doc as the contract (RULE 3 C1).**
- `lib/email/sender-config.ts` / `email_sender_config` — tenant brand/sender for the branded render.
- `lib/email/usage.ts` — the meter the cost gate already runs through.

## Steps

1. Rewrite `buildContent(row)` (`run-schedules.mts:223`): if `row.scope` is set, build a scoped
   one-pager via `lib/deliverable/*`, seeded with the resolved `{zip, place, topic}` + the tenant's
   brand (`email_sender_config` / project brand). Else keep `buildBody(getDigest())` (unchanged).
2. Cache by **resolved scope within a run** (multiple tenants on the same ZIP/topic reuse one build) —
   the global path already caches via `getDigest()`; mirror that for scoped builds.
3. The render still flows through `renderHtml` → `ensureUnsubscribeToken` → broadcast (unchanged); the
   only change is the *body source*.

## Done when

- A scoped schedule sends a cited one-pager for its scope (verified end-to-end via DRY_RUN payload log).
- A `scope == null` schedule sends the identical global digest as before (regression check).
- Every figure in the scoped send carries a source + the live freshness token (no invented numbers).
- `tsc`/eslint clean; DRY_RUN run logs the right per-scope would-send.

## Correctness flags

- **LOCKED (Phase-3 #1):** scoped content goes through the grounded engine, **never** the chat LLM. A
  made-up SWFL number on a tenant's logo breaks the #1 moat.
- **Cost:** a grounded build per scope per cycle is real money — it runs behind the existing usage gate
  (`lib/email/usage.ts`, skip+notify, never throw) and the in-run scope cache.
- **MOAT:** scope already validated to the 6-county grain in Task 01; never render below the grain held.

> Status lives in the `checks` ledger (`email_scoped_content`), not in this file.
