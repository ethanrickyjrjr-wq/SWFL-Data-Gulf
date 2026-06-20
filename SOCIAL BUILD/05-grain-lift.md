# 05 — Grain lift (ZIP → place / county / corridor)

| | |
|---|---|
| **Model** | **Opus** (no-invention moat — design-sensitive) |
| **Stage** | 2 — after 01's `types.ts` + migration merge |
| **Runs in parallel with** | 03 |
| **CANNOT run at same time as** | **04** — both touch scope/grain resolution. **05 publishes the grain-resolver interface FIRST**, then 04 consumes it. |
| **Blocked by** | 01 (`scope_kind`/`scope_value` columns on `post_schedules`) |
| **Files** | NEW: `lib/social/grain.ts` (the resolver); EDIT (shared): generalize the ZIP-only lock in `lib/email/recurring-report.ts:62-76` OR extract it into a shared `lib/scope/` module both email + social consume |

## Goal
Today recurring content is hard-locked to a single ZIP (`recurring-report.ts:62-76` — a non-ZIP scope falls back to the global digest). A brand's territory is usually a place, a county, or "all of Lee." Lift the grain **without inventing sub-grain numbers** (the moat).

## Build
1. **`lib/social/grain.ts` — `resolveGrain(scope): GraphicModel | null`.** Publish its interface signature first (so 04 can code against it). For each `scope_kind`:
   - `zip` — existing path.
   - `place` — named place (e.g. Fort Myers Beach 33931) via the place→ZIP crosswalk already used by `deriveProjectName`.
   - `county` — reads **county-grain** brain data (never a "representative" ZIP).
   - `corridor` — reads corridor-grain data; reuse `refinery/lib/corridor-aliases.mts` (mind the load-bearing Lee Blvd/Joel Blvd join).
2. **No-sub-grain-invention guard (HARD):** if we don't hold data at the requested grain, **refuse and offer the grain we hold** — never fabricate a number finer than held. Mirror the existing footprint/MOAT gate (`recurring-report.ts:83-88`). Reuse the `parse-scope` contract (`lib/deliverable/parse-scope.ts:21-29`).
3. **Shared-edit discipline:** if you generalize `recurring-report.ts` rather than extracting a shared module, you are editing email-side code — keep the email behavior identical (regression test it) and **do not run while another session edits that file**.

## Tests & gates
County/corridor scope never resolves to a representative ZIP · out-of-footprint refuses · place crosswalk resolves · **email `recurring-report` behavior unchanged** (regression). Vocab/alias smoke if you touch corridor aliases: `bun test refinery/lib/corridor-aliases.test.mts` + `bun refinery/tools/check-vocab-coverage.mts --all`. real-tsc 0, eslint.

## Done =
A `post_schedules` row scoped to a place/county/corridor produces an honest `GraphicModel` at that grain (or a clean refuse), with email behavior untouched.
