# Typed lane for user-brought data — endpoint contracts, verify-first-record, file-door residue

**Date:** 2026-08-03 (brainstormed 08/02/2026)

## Problem

User-brought data enters the platform one way today: the blob lane. Uploaded docs are
vision-distilled into `extracted_text`, notes stay free text, and the AI weighs that prose as an
equal source next to the lake and live web (`lib/project/uploads-text.ts`). That lane is the
citation moat (lane 2 of four-lane sourcing) and stays — but you cannot chart a blob, filter it,
dedupe it, or verify it arrived correctly. The half we're missing is computation: typed shapes for
the two or three kinds of user data the deliverables actually compute on.

The one typed lane that exists proves the pattern: contacts
(`lib/email/parse-contacts-csv.ts` → `lib/contacts/upsert.ts` → `lib/email/segments/` → blast).
What contacts lack is a verify gate; listings and user-stated figures have no typed lane at all.

**Scope correction (operator, 08/02/2026):** this is NOT a universal intake policy. Data arriving
by API/REST has no "doesn't fit" case — the endpoint IS the shape; it validates or it's rejected
with a named reason. The "doesn't fit" residue exists only at the FILE door (a dragged CSV whose
columns are whatever the user's old tool exported).

## Goal

The typed shapes live at the API layer — one contract per shape. Every intake path is a client of
the same contracts: the web UI, a hosted skill file driving the user's coding agent, and direct
REST. "Connected" means a real row round-tripped, never "a file parsed." Structured files that
match no shape are parked visibly with provenance — never silently blobbed, never rejected.
Consumers: sends (segments over contacts), the email builder (user's own listing joined to lake
comps by address, both sources named), and user-stated figures as chartable values that always
render with their provenance.

## Evidence base (four lanes, searched 08/02/2026)

- RESEARCH — `_RESEARCH/competitor-and-strategy/2026-08-02-mixpanel-app-drive.md` (skill-file
  intake, verify-first-event as a step that waits, lookup tables: foreign data joins an existing
  key or doesn't enter; §8 anatomy of their skill.md) ·
  `2026-08-02-claydotcom-app-drive.md` (one primitive, cell-grain failure — a bad row degrades a
  percentage, never kills a run; typed AI outputs; `origin` block on every bound template
  variable; generic "Import data from an HTTP API" as their catch-all intake; dedupe key declared
  before the irreversible act) · `_RESEARCH/email-and-social/`
  `2026-07-30-email-creation-on-user-data-competitor-scan.md` (zero data tools in the entire
  email-builder category — the unoccupied square).
- CATALOG — `docs/standards/data-roots.md`: one root per concept; user-brought data is
  user-scoped and lives beside the lake, never inside `data_lake.*`.
- CODE — contacts lane end-to-end (parser caps: 5,000 rows at the route, 50 attribs/tags per
  row; one-way unsubscribe guard; segments engine over tags/attribs). `ProjectItem` union
  (`lib/project/items.ts`) already carries typed lake-sourced kinds (`metric`, `table_slice`,
  `address`, `frame`) — no kind exists for a user-stated figure.
- LIVE (probed 08/02/2026) — `public.contacts`: 2 rows, 1 user, 0 with attribs.
  `contact_segments`: 0. Project items: 8 total, 0 files, 0 CSVs. Tables `user_listings` /
  `user_figures` / `user_tables` do not exist. This is greenfield at effectively zero volume —
  rule 11 sizing applies hard: fixed shapes with validation, no schema builder.

## What we're building

### 1. Shapes — typed contracts at the API layer (three, fixed)

- **Contacts — exists.** `/api/contacts/import` + parser + upsert + segments. Gets only the
  verify-first-record upgrade (§3). Upsert key: (user_id, email) — unchanged.
- **Listings — new.** Per-user `public.user_listings` table mirroring the contacts pattern:
  required address; typed columns only for what deliverables compute on (price, beds, baths,
  sqft, status, listing URL); `attribs jsonb` for the rest; RLS by user_id. Join columns
  (zip, county, parcel id) are NULLABLE, filled at import time by the same lake-first subject
  resolution the email builder already uses. Resolution failure never blocks the row (RULE 0.7)
  — it means no lake join, and the miss is counted and reported. Upsert key:
  (user_id, normalized address).
- **User-stated figures — new, small.** One new `ProjectItem` kind `user_figure` on the existing
  project-items spine: label, value as stated, optional unit and as-of date, source fixed to
  "stated by user". No new table. This is the provenance record lane 4 has always promised.

### 2. Doors — every intake path is a client of the same contracts

- **Web UI** imports through the endpoints (listings importer mirrors the contacts import
  surface).
- **Skill file**: hosted markdown served from THIS repo's deploy (e.g. `/connect` on the site —
  same deploy as the endpoints, so contract drift is structurally impossible) + a per-user token.
  It walks any coding agent (Claude Code, Cursor, …) through mapping the user's export into the
  endpoint calls, Mixpanel-style: modes asked first, mandatory questions before any write, and
  the verify loop (§3) as its final step.
- **Direct REST**: the same endpoints, same token, documented in the skill file.

### 3. Verify-first-record

An import isn't "connected" when a file parses — it's connected when a real row round-trips.
The import response echoes back sample rows READ BACK from the database after the write (never
the parsed payload reflected), plus counts: added, updated, skipped-with-reasons, and for
listings "X of Y matched to county records" (discrepancy surfaced, verified-vs-review rule).
Partial success is the NORMAL outcome — one malformed row degrades a percentage, it never fails
the import (Clay's cell-grain semantics). A status endpoint lets the skill loop poll until the
echo lands.

### 4. File door — residue policy

Documents (PDF, images) keep flowing to the blob lane untouched. A structured file (CSV) that
matches a shape goes through that shape's endpoint. A structured file matching NO shape is
**parked**: file stored + a header census recorded (column names, row count, upload date, source
name) on the project item, rendered in the project UI as "parked — no shape yet", and a checks
entry opened so shape demand is counted, not forgotten. Nothing a user hands us silently
vanishes, and nothing shapeless enters the compute path.

### 5. Provenance travels with the binding (Clay `origin` steal)

When a user listing or user-stated figure is bound into a deliverable, the binding carries its
origin (user-brought, which import, when) the same way lake bindings carry a freshness token.
A field on the binding, not a new system. User-stated figures always render with "as stated by
you" provenance.

## Failure modes → guards (RULE 3.5, named before build)

1. Malicious/huge CSV → reuse proven caps (5,000 rows/route, 50 attribs+tags/row); listings
   parser gets the same caps; tests named for each cap.
2. Formula injection → pinned policy unchanged: store raw, escape at CSV exit
   (`lib/email/csv-escape.ts`); never sanitize on import.
3. User figure leaking as unsourced fact → `user_figure` zod schema requires label+value;
   renders only with provenance; the existing no-invention lint on builds
   (`gateNarrative`) stays the output enforcement point.
4. Bad address / no county match → nullable joins, row lands anyway, miss count reported
   ("X verified, Y need review").
5. Cross-user leakage → RLS by user_id (same as contacts); route tests assert scoping.
6. Token abuse via REST/skill door → per-user token, route rate cap, same row caps; one-way
   unsubscribe guard preserved.
7. False "connected" → echo is a post-write SELECT round-trip, never the parsed payload.
8. Parked files rot invisibly → parked status renders in project UI + a checks entry per parked
   file.
9. Duplicate imports → idempotent upserts on declared keys: (user_id, email) contacts ·
   (user_id, normalized address) listings — the key is fixed at the contract, Clay's
   gate-before-the-irreversible-act.
10. One bad row kills an import → explicit contract: row-grain failure, partial success normal,
    percentage + reasons in the response; test feeds a mixed-validity file and asserts the good
    rows land.
11. Skill file drifts from endpoints → served from the same repo/deploy as the routes; no
    external bucket.

TDD (mandatory): every deterministic unit — listings CSV parser, address normalizer + join
mapper, `user_figure` schema, echo assembly, residue header census — gets a failing test named
for the failure mode it guards, then implementation to green. TDD does not replace guards 3, 5,
6 (lint/RLS/rate-cap class) — those ship as named validations.

## Catalog + registry obligations

- `docs/standards/data-roots.md`: add a user-data section — three concepts, three roots
  (user contacts → `public.contacts` 🟢 · user listings → `public.user_listings` 🔴 until built ·
  user-stated figures → `projects.items` kind `user_figure` 🔴). User-scoped, never `data_lake.*`.
- No cadence entry — user-initiated imports, not scheduled ingest. No consuming-brain
  requirement — this is user-scoped app data, not Tier-2 lake ingest.

## Out of scope (named so they aren't silently assumed)

- No schema builder / arbitrary user tables (rejected as B — Mixpanel lookup-table literal).
- No CRM/API integrations catalog (Clay's 45-vendor surface is hyperscaler-shaped; our REST
  door + skill file covers the need at our volume).
- No events-table / send-outcomes surface (noted as a separate stealable, different build).
- Our own unfitted source data (the 72 recorded ceilings) — different problem, has its own
  ledger.

## Live verify (closes `user_data_typed_lane_live_verify`)

On production: (1) import a real listings CSV through the endpoint → response echoes read-back
rows + match counts; (2) the listing renders in a deliverable joined to lake data with both
sources named; (3) a user-stated figure renders with provenance; (4) a shapeless CSV shows
"parked" with its header census in the project UI. Evidence pasted, not narrated (RULE 0.8).
