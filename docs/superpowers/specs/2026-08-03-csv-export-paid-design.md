# Paid CSV export — gated download of user-owned tables

**Date:** 2026-08-03
**Origin:** Clay 101 lesson 14 research (`_RESEARCH/competitor-and-strategy/2026-08-03-clay-university-101-course.md`) + operator decree 08/03/2026: "pay only can download."
**Research evidence (RULE 0.4, in-session):** OWASP CSV Injection page crawled 08/03/2026 — current guidance (trigger chars `= + - @`, tab 0x09, CR 0x0D, LF 0x0A, full-width `＝＋－＠`; wrap in double quotes, prefix single quote, double embedded quotes) matches `lib/email/csv-escape.ts` exactly; OWASP's worked example `=1+2";=1+2` → `"'=1+2"";=1+2"` appears verbatim in `lib/email/__tests__/csv-escape.test.ts`. Source: https://owasp.org/www-community/attacks/CSV_Injection

## Problem

Users can bring data in (contacts import, user-listings import in flight) but nothing lets them take
their own data back out as a file. The only exits today are deliverables (email/PDF) and JSON API
surfaces. `lib/email/csv-escape.ts` was pinned 07/10/2026 as the exit-side CSV root and has zero
production consumers.

## Goal

A paying user (starter/growth/pro) can download their own contacts and listings as a clean,
Excel-safe CSV in one click. Free users see the button locked with a path to /billing. No internal
column ever ships. No cell can execute as a formula.

## What we're building

### Surface registry (the Clay export-view principle)

`lib/export/surfaces.ts` — ONE registry; adding a future export = one entry, never a new route.
Each entry: `table` (Supabase table name), `columns` (explicit whitelist, in order, with header
labels), `filename` (base, date appended). v1 entries:

- `contacts` → table `contacts`: name, email, phone, tags (joined `; `), created_at (date only).
- `listings` → table `user_listings`: address, price, beds, baths, sqft, status, url, zip_code,
  county, updated_at (date only, header "imported") — PLUS the union of `attribs` keys across the
  user's rows as trailing columns (their own brought columns come back out; cap 50, alphabetical).

NEVER exported, any surface: `id`, `user_id`, `address_key`, token/hash columns. The registry is
the working-view/export-view split as a whitelist — debug and internal columns don't exist here.

### Route

`app/api/export/[surface]/route.ts` — `GET`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

1. Unknown surface → 404.
2. Cookie client + `auth.getUser()` → 401 when absent (81-route default).
3. Tier gate: `resolveEffectiveTier(serviceRoleClient, user.id)` — paid (`starter|growth|pro`) →
   proceed; free → `402` JSON `{ error: "upgrade required", upgrade_url: "/billing" }`. When
   `degraded: true` → FAIL OPEN (same contract as sends: a billing outage never blocks a paying
   customer; worst case a free user gets one CSV during an outage).
4. Data read on the RLS cookie client (service role touches ONLY the tier lookup — the cross-user
   guard is structural, not a WHERE clause we have to remember). Rows fetched via the existing
   paged-select helper (PostgREST max-rows truncation landmine, `reference_postgrest-db-max-rows`);
   ordered by created/updated for deterministic output.
5. A read error → 500 JSON. NEVER a valid-looking empty file on error. Zero rows → 200 with
   header-only CSV (that's a true answer).
6. Body: UTF-8 BOM + header line + one `toCsvLine()` per row — every cell through
   `escapeCsvCell`. Headers: `Content-Type: text/csv; charset=utf-8`,
   `Content-Disposition: attachment; filename="swfl-<surface>-YYYY-MM-DD.csv"`.
7. In-memory build, no streaming — 5k-row-scale data (rule 11: our volume, not a hyperscaler's).

### UI

- Contacts page (`app/contacts/page.tsx`): "Download CSV" button → navigates to
  `/api/export/contacts`. Free tier: rendered locked (tier already returned by GET /api/contacts),
  click → /billing.
- Listings surface (wherever the in-flight user-data lane lands its list UI): same button,
  `/api/export/listings`. If that UI hasn't landed when this builds, the route ships anyway (the
  API is the contract; the button follows the lane).

### Explicitly NOT in v1

- Lake/desk/brain tables as CSV (one registry entry each, later, separate product decision).
- Bearer-token door (the in-flight per-user token task can add the branch to this route when it
  lands — same pattern as the import routes).
- Streaming, pagination params, column selection UI, XLSX.

## Failure modes → guards (every one gets a test named for it)

1. Formula injection (`=SUM(...)` in a contact name executes in Excel) → every cell exits through
   `escapeCsvCell` (OWASP-verified above); route test asserts the escaped form in the body.
2. Free-tier bypass → gate is server-side only; test: free user → 402, no body.
3. Billing outage blocks a paying customer → `degraded: true` fails OPEN; test with a throwing
   billing read asserts 200.
4. Cross-user leak → data read on RLS cookie client; test asserts the fake client received the
   user-scoped query and no service-role data read exists.
5. Silent truncation at PostgREST max-rows → paged fetch; test at a page boundary (e.g., 1001 rows
   through a fake pager) asserts all rows land.
6. Internal-column leak → registry whitelist; test asserts `user_id`/`id`/`address_key` absent
   from header and body.
7. Excel mangles UTF-8 (José → JosÃ©) → BOM prefix; test asserts the body's first code point is
   U+FEFF.
8. Read error masquerades as empty data → error → 500 JSON; test asserts no `text/csv` on error.
9. Attribs column explosion (listings) → union capped at 50 keys, alphabetical (deterministic);
   test with 60 keys asserts 50, sorted.

## Testing

TDD per unit (`bun:test`): registry shape test (whitelist invariants — no banned column in any
entry, enforced generically so a future entry can't regress it); pure CSV-builder test (rows +
registry entry → string, all failure-mode cells); route test with `mock.module` at the data
boundary (401/402/degraded-open/500/BOM/escaping). Verify via `bunx next build` (repo norm).

## Live verify (closes `csv_export_paid_live_verify`)

Paid session: download both surfaces, open in Excel — columns right, no internal columns, a
`=2+2` contact name arrives as text not 4. Free session: 402/locked button. Evidence pasted into
the check close.
