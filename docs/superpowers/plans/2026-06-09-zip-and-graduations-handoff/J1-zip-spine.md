# J1 — ZIP spine: `swfl-zip-county.json` + `resolveZip` (RUN FIRST)

> **Preamble (every card):** Read `SESSION_LOG.md` then `CLAUDE.md` (RULE 0) before any code.
> Obey the **3 GATES** (see [`README.md`](./README.md)). **Do not `git push` without operator
> confirmation.** Work on `main` — no branches, no PRs. **Do not touch** `cre-swfl.mts` or
> `lib/highlighter/grounding.ts` (operator WIP).

**Phase:** 1 · **Depends on:** nothing · **Blocks:** J2, J3 · **Parallel:** run before the ZIP-column jobs.
**Model: 🔴 OPUS-ONLY.** This is the foundation every ZIP answer stands on — the moat invariants
(never present county as ZIP), the G6 never-emit-a-default-as-fact logic, the scope authority, and
the deterministic tie-breaks. A subtle error here propagates to J2/J3 and every fan-out. Do not
hand to a parallel/cheaper session.

## This IS §A + §B of the existing plan — don't reinvent it
The authoritative briefs live at:
- `../2026-06-09-universal-location-search/01-spine.md` (**§A** — the spine)
- `../2026-06-09-universal-location-search/02-dispatcher.md` (**§B** — `resolveLocation`)
- `../2026-06-09-universal-location-search/README.md` §0 (shared types + guards G1/G6/G7 + verified code anchors — **use those anchors exactly, do not re-guess**)

Build to those briefs. This card only adds the acceptance gate and the 3-GATES tie-in.

## Deliverables
1. **`fixtures/swfl-zip-county.json`** (sourced, G7/SCOPE): U.S. Census **2024 TIGER ZCTA-to-county
   relationship file**, filtered to the 6 counties (`12015` Charlotte, `12021` Collier, `12043`
   Glades, `12051` Hendry, `12071` Lee, `12115` Sarasota). **Vendor-first: fetch the live Census
   file URL in-session via WebFetch and lock the field paths from the real file — do not
   transcribe from memory.** Header carries `source` / `verified_date` / `note`. Build it as a
   **superset of every ZIP we already publish** (union the ZCTA list with the ZIPs in
   `housing_by_zip`, the barrier table in `swfl-geo.mts`, ZORI, and `lee_building_permits`); any
   held ZIP absent from the ZCTA file gets a hand-sourced county + citation. **Never widen from
   data rows at runtime; never trim to Lee+Collier.**
2. **`refinery/lib/zip-resolver.mts`** — pure, **static ESM JSON import, NO `fs`** (mirror
   `geography-gazetteer.mts:16`; it must load inside the Vercel MCP function). Exports `Grain`,
   `CountyFips`, `ZipResolution`, `resolveZip` (full interface in `01-spine.md`).
3. **`refinery/lib/zip-resolver.test.mts`**.

## MOAT tie-in (why J2/J3 need this)
`resolveZip(zip).in_scope` is the **scope gate** J2 and J3 call before writing any `zip_code`.
`resolveZip(zip).primary_county` is the county authority. A backfilled ZIP that returns
`in_scope:false` MUST be rejected (left NULL) — that is how we keep an out-of-6-county or invented
ZIP out of the lake. **G6: never emit a derived default as a fact** — an unclassified barrier ZIP
returns `null` + a `resolution_note`, never `"inland"`.

## Acceptance — `bun test refinery/lib/zip-resolver.test.mts`
- `resolveZip("33924")` (Captiva) & `resolveZip("33903")` (N. Fort Myers) → `in_scope:true`,
  correct county (both absent from the place crosswalk but real SWFL ZIPs).
- `resolveZip("34142")` (Immokalee) → `in_scope:true`, `corridors:[]` + a note.
- `resolveZip("33101")` (Miami) → `in_scope:false`, empty places/corridors.
- An in-scope ZIP absent from the barrier table never yields `classification:"inland"` (G6).
- `34134` (alt of both Estero & Bonita) tie-breaks deterministically and can't flap.
- Fixture header cites the **live Census URL fetched this session**.
