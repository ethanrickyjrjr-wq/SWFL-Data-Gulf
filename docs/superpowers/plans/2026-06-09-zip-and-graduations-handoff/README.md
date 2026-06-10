# ZIP-Columns + Graduations — Handoff Hub (2026-06-09)

**Status:** ready to claim. Verified against `main` (charts `557edf0`, cre-swfl `765d688`).
**What this is:** the audited, corrected work-plan that came out of reviewing the original
"Session Map + Charts Tier A Build Plan." It divides the residual work into **6 job cards** a
cold Claude can each pick up, and marks what can/can't run in parallel
([`PARALLEL-MAP.md`](./PARALLEL-MAP.md)).

> Read this README, then [`PARALLEL-MAP.md`](./PARALLEL-MAP.md), then your `Jn-*.md` card.

---

## Why this exists (audit verdict — what was already done)

The original plan was scoped against a stale tree. Three of its line items are **already shipped**:

| Original line item | Reality | 
|---|---|
| "My Build — Charts Tier A" (create `chart-from-metrics.mts`, persist+parse a ` ```chart ` block, wire display/dossier/render) | **DONE — `557edf0`.** `refinery/lib/chart-from-metrics.mts` complete; `DisplayBrain.chart` (`speaker.mts:629`), `toDisplayBrain` (`:696`), `buildDossier` slot (`fetch-brain.ts:207-210`), `<ReportChart>` (`app/r/[slug]/page.tsx:162-187`) all live. **As-built is cleaner than the plan:** the chart is recomputed on-the-fly from the parsed OUTPUT — there is **no** ` ```chart ` block in the `.md` (`4-output.mts` has zero chart writes). The plan's persist/parse steps are unnecessary, not just done. → **Job J4 = reconcile + verify only.** |
| "Step 0 — commit in-progress cre-swfl work" | **DONE — `765d688`.** Working tree holds only unrelated `lib/highlighter/grounding.ts(.test)` WIP — leave it to the operator. |
| "estero/fmb caveats wiring — already committed (~1721-1730)" | **Correct, DONE.** `cre-swfl.mts:1721` caveats + `:583/:592` fragment stash + `:537` fitScore, committed. No job. |

Two factual errors in the original plan are corrected in the cards:
- MHS pack must read via **Supabase PostgREST source connector** (`getSupabase()` + `selectAllPaged`), **not** `mcp__lake__query_lake` (that's the downstream read surface). See `collier-permits-source.mts` for the pattern.
- MHS needs a real **site `zip_code`** too (your G1/G2), not only `submarket_slug`.

---

## Governing rules — ZIP COLUMNS, 3 GATES (operator-locked, verbatim)

```
G1 — SITE LOCATION ONLY. zip_code derives from site address or site lat/lon ONLY.
     Mailing ZIPs (owner_zip, contractor_zip) = wrong grain = violation. County/MSA/
     corridor-grain tables get no zip_code — that is invented precision.
G2 — DERIVABLE NOW OR PARK IT. Site lat/lon or site_address already on the row →
     derive + backfill + wire pipeline (backfill-only rots). No address/geo on the row
     (e.g. leepa_parcels) → park in deferred, do not silently omit.
G3 — BRAIN-FIRST. New zip_code on a Tier-2 table without a consuming brain in the same
     PR = orphan substrate = violation.
SCOPE: 6-county (Charlotte 12015, Collier 12021, Glades 12043, Hendry 12051, Lee 12071,
     Sarasota 12115). Source: fixtures/swfl-zip-county.json. Never widen from data rows.
     Never trim to Lee+Collier only.
MOAT: Never label a county figure as a ZIP figure. The system cannot invent a number.
```

Every job card repeats these. They are the acceptance bar — a card that violates a gate is not done.

---

## Per-table ZIP verdict (what each job acts on)

| Table | Site geo on the row? | Verdict |
|---|---|---|
| `lee_building_permits` | `zip_code` ✓ | Nothing to do |
| `collier_building_permits` | `lat`/`lon` ✓ (+`site_address`); `owner_zip`/`contractor_zip` **excluded by G1** | **J2** — derive site zip, backfill, wire pipeline |
| `mhs_permits_swfl` | `project_address` only | **J3** — geocode → zip (full graduation; brain is mandatory per G3) |
| `leepa_parcels`, `collier_parcels` | none on the row | **J6 — PARK** (needs a situs/geometry source-layer pull first) |
| `zori_swfl`, `redfin_*` | ZIP-keyed already | Nothing to do |
| `bls_*`, `fl_dor_*`, `marketbeat_swfl`, `fgcu_reri`, `fdot_aadt_*`, `census_*`, `fred_*`, `city_pulse*` | county / MSA / corridor / submarket | **EXCLUDE (G1)** — a zip here is the MOAT violation |

---

## This is the §A foundation + §F/§G data track of the existing ZIP-search plan

`../2026-06-09-universal-location-search/` is the operator's full ZIP-search design (§A–§G,
planned-not-started, verified `@765d688`). It already specifies the 6-county scope, the
`swfl-zip-county.json` fixture (Census ZCTA→county, vendor-first), and the moat as typed
fan-out invariants. **Do not reinvent it.** Our jobs map onto it:
- **J1** = its **§A spine** + **§B dispatcher** (`01-spine.md`, `02-dispatcher.md`).
- **J2 / J3** = its **§F** "crisp ZIP rows — permits detail_tables," governed by the 3 GATES.
- **J6** = its **§G** parcel-exact (parked).

---

## The jobs

| Card | Job | Model | Depends on | Parallel? |
|---|---|---|---|---|
| [J1](./J1-zip-spine.md) | ZIP spine: `swfl-zip-county.json` + `resolveZip` | 🔴 **Opus-only** | — | **run FIRST; blocks J2/J3** |
| [J2](./J2-collier-permits-zip.md) | Collier permits site `zip_code` | 🟡 Sonnet-capable* | J1 | ∥ J3 (serialize registry edits) |
| [J3](./J3-mhs-graduation.md) | MHS graduation + site `zip_code` + brain | 🔴 **Opus-recommended** | J1 | ∥ J2 (serialize registry edits) |
| [J4](./J4-charts-reconcile.md) | Charts Tier A reconcile + verify (no build) | 🟢 Sonnet-fine | — | fully independent |
| [J5](./J5-ops-triggers.md) | Operator GHA triggers (crexi, lee_associates) | ⚪ Operator | — | independent (coord cadence w/ J3) |
| [J6](./J6-parcels-parked.md) | Parcels PARKED brief (= §G) | 🟢 Sonnet-fine | — | fully independent (doc only) |

**Model routing.** 🔴 **Opus** only: **J1** (foundational moat/honesty spine — errors propagate to
every ZIP answer) and **J3** (multi-file pack+vocab+cadence; the vocab contract is the recurring
nightly-rebuild breaker, and parallel-Sonnet drift has re-flipped locked decisions before). 🟡 **J2**
is Sonnet-capable *except* the live Census field-path confirmation + the MOAT scope-gate assertion —
escalate those two to Opus. 🟢 J4/J6 are safe for any model; ⚪ J5 is operator-run.

## How to claim a job
1. Confirm your deps are merged on `main` (J2/J3: J1's `zip-resolver.mts` + `swfl-zip-county.json` exist).
2. Read `SESSION_LOG.md` + `CLAUDE.md` (RULE 0) + this README's 3 GATES + your card.
3. Build; ship the card's acceptance check green.
4. **Do not push without operator confirmation** (operator decree). Work on `main` — no branches, no PRs.
5. On push: top-of-file `SESSION_LOG.md` entry + `node scripts/safe-push.mjs` + reconcile `build-queue.md` and the `checks` ledger (RULE 2).
