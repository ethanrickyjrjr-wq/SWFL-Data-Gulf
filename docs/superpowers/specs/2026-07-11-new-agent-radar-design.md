# Weekly DBPR new-agent radar (Lee/Collier)

**Date:** 2026-07-11
**Status:** SPECCED — column layout corrected + browser email-lane question resolved
07/10/2026 (see Sources + Out of scope); implementation plan next.
**Check:** `new_agent_radar_live_verify`.

## Problem

Newly licensed real estate agents are the best outreach targets — they have no CRM or
marketing system yet. But we have no way to see who just got licensed. The contact-factory
plan aimed a fleet of per-brokerage site crawls at this and it sank: brokerage pages yield
phones and a generic `customercare@` inbox, and the real emails sit behind contact forms
(proven live 07/10/2026 — johnrwood.com, premiersothebysrealty.com 429, et al.).

The real source is the state. Florida DBPR publishes a **weekly-refreshed** CSV of every
real estate licensee, per region. Region 7 (`RE_rgn7.csv`) covers Lee and Collier (plus six
other counties). It carries name, mailing address, license dates, status, and employer —
enough to detect who just got licensed. It does **not** carry email (verified: 23 columns,
mailing address only — see Sources below). Email is a public record (FL 455.275 requires each licensee to file
one; FL 668.6076 makes it public) obtained on a separate lane (records request / online
lookup), tracked apart from this build.

## Goal

A weekly pipeline that lands current Lee/Collier individual real estate licensees in a
`public.*` table and lets us query the newly licensed slice — the ongoing new-agent stream
that outreach targets. The `email` column is designed in now and filled later by the email
lane. Feeds outreach, not the answer engine.

## Sources (column layout corrected + re-verified live 07/10/2026 via direct byte-range curl)

- File: `https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv`
  (~13MB, no header row, all fields quoted). Refresh cadence: **weekly** (stated on the DBPR
  Real Estate Commission public-records page).
- **Column order is 23 (0-indexed), NOT the 21 originally written here.** The original count
  was read off the DBPR public-records page's column *list* (prose docs), the same trap that
  bit `fl_dbpr_licenses`'s applicant file (`docs/handoff/2026-06-13-dbpr-license-chunk-undercount.md`
  — "trust the probed file, not the published doc"). Corrected by downloading a live byte-range
  sample (`curl -r 0-200000`) and reading real rows directly:
  ```
  0  board_number              always "25" (Real Estate board)
  1  license_type              CODE + label, e.g. "2501 Real Estate Broker or Sales",
                                "2502 Real Estate Corporation", "2504 Real Estate Branch Office"
  2  licensee_name             raw "LAST, FIRST MIDDLE"
  3  dba_name
  4  rank                      CODE + label, e.g. "SL Sales Associate", "CQ RE Corp.",
                                "BO RE Branch Offic"
  5  address1
  6  address2
  7  address3
  8  city
  9  state
  10 zip
  11 county_code               DBPR 2-digit, e.g. "46" (Lee), "21" (Collier)
  12 county_name               e.g. "Lee", "Collier"
  13 license_number
  14 primary_status            e.g. "Current"
  15 secondary_status          e.g. "Active", "Inactive"
  16 original_license_date
  17 status_effective_date
  18 license_expiration_date
  19 alternate_license_number  e.g. "SL3014884"
  20 self_proprietor_name
  21 employer_name
  22 employer_license_number
  ```
  Sample row confirming the map (Lee, individual, current/active):
  `"25","2501 Real Estate Broker or Sales","AARNIO, KRISTEN LYNN","","SL Sales Associate",
  "1013 SE 43RD TERR","","","CAPE CORAL","FL","33904","46","Lee","3579344","Current","Active",
  "06/16/2023","07/10/2023","03/31/2027","SL3579344","","NAUTICAL GULF REALTY INC","1067315"`
- Region 7 counties in the file: Charlotte, Collier, DeSoto, Glades, Hendry, Highlands, Lee,
  Sarasota. We keep **Lee + Collier**, filtering on `county_name` (col 12) — CLAUDE.md SCOPE.
- Individual agents = column 1 starts with `"2501 "` ("2501 Real Estate Broker or Sales").
  Corporations (`2502`), branch offices (`2504`), and schools are separate `license_type`
  values — excluded.

## Decisions (operator-confirmed 07/11/2026)

1. **"New" = recent license date.** Working pool = `original_license_date >= now() - 90 days`;
   "new this week" = last 7 days. Keying off the license date (not first-seen-by-us) is
   cold-start safe — the first run does not falsely flag the whole backlog (30,100 kept
   Lee/Collier individual rows, all statuses, verified live 07/10/2026 — Lee 18,015 /
   Collier 12,085; 27,292 of those are status "Current") as new. `first_seen_at` is
   still recorded as a secondary signal but is not the "new" definition.
2. **Lee + Collier only.** Filter `county_name IN ('Lee','Collier')` on landing. County is
   stored (both code + name) so the scope can widen later without a reload.
3. **Individuals only.** Keep `license_type` starting `"2501 "`; skip corp/branch/school rows.
4. **Lands in `public.dbpr_re_licensees`** (operational, like `dbpr_public_notices`) — NOT
   `data_lake.*`, so the brain-first gate does not apply (this feeds outreach, not answers).
5. **`email` column nullable**, populated later by the separate email lane.

## What we're building

A new Python ingest pipeline `ingest/pipelines/dbpr_re_licensees/`, started from
`ingest/scaffold.py` (incremental-aware), mirroring the `dbpr_public_notices` shape.

### Data flow

1. **Download** `RE_rgn7.csv` (single GET, streamed). Guard: empty/short body → exit 1 loud.
2. **Parse** with the stdlib `csv` reader (quoted fields, no header — positional map to the
   23 columns, see Sources above). Guard: any row whose column count < 23 → skip that row
   (matches the `fl_dbpr_licenses` `MIN_ROW_LEN` pattern); if EVERY row is short → abort loud
   (DBPR changed the layout; never write against a shifted map).
3. **Filter** to individual agents (`license_type` starts with `"2501 "`) in `county_name IN
   ('Lee', 'Collier')`.
4. **Normalize** each kept row to the table shape: split "LAST, FIRST MIDDLE" into
   `last_name` / `first_name` / `middle` (keep the raw `licensee_name` too); parse the three
   date columns (`MM/DD/YYYY` → date); carry `county_code` + `county_name`, address, status,
   `rank`, employer, `alternate_license_number`. `email = NULL`. `source_tag = 'dbpr_re_rgn7'`,
   `source_url = <extract url>`, `as_of_date = <file fetch date>`.
5. **Merge** into `public.dbpr_re_licensees` on `license_number` (PK). `first_seen_at`
   preserved on conflict; `last_seen_at` bumped; mutable fields (status, employer, address,
   expiration) refreshed. `email` is refreshed with `COALESCE(EXCLUDED.email, existing)` so a
   later-populated email is never clobbered by a NULL from the CSV.

### Table — `public.dbpr_re_licensees`

`license_number` (text PK), `alternate_license_number`, `licensee_name` (raw),
`first_name`, `middle`, `last_name`, `dba_name`, `rank`, `license_type`,
`address1/2/3`, `city`, `state`, `zip`, `county_code`, `county_name`,
`primary_status`, `secondary_status`,
`original_license_date` (date), `status_effective_date` (date), `license_expiration_date`
(date), `employer_name`, `employer_license_number`,
`email` (text NULL), `email_source` (text NULL, provenance for the later lane),
`source_tag`, `source_url`, `as_of_date`, `first_seen_at`, `last_seen_at`.

After creation: `GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
NOTIFY pgrst,'reload schema';`

### "New agent" access

No second table. A view `public.new_re_agents`:
`SELECT * FROM public.dbpr_re_licensees WHERE original_license_date >= now() - interval '90 days'`
ordered by `original_license_date DESC`. Outreach reads the 7-day slice off the same shape
(`WHERE original_license_date >= now() - interval '7 days'`).

## Error handling

- Empty / truncated download → exit 1 loud (like the notices pipeline's empty-index guard).
- All-rows-short (column count < 23 for every row) → abort loud before any write (layout-drift
  canary, mirrors `fl_dbpr_licenses`'s `MIN_ROW_LEN` guard).
- Merge, never replace → the Gate-4 destructive-replace concern does not arise; still guard
  `license_number` + `licensee_name` non-null before the upsert.
- Expected-rows floor: assert kept-row count ≥ a sane floor (Lee+Collier individual agents
  number in the thousands) so a silently-emptied file reds the run instead of wiping nothing.
  Per-county floor (`assert_county_coverage`, `ingest/lib/guards.py`) catches a partial
  collapse (Lee lands, Collier silently drops to 0) that a total-only floor would miss —
  precedent: `fl_dbpr_licenses`'s Lee/Collier city-anchor guard.

## Testing

- **Unit** (`test_parse.py`) on the real sampled rows (captured live from the byte-range curl
  above): the 23-column positional map; name split ("AARNIO, KRISTEN LYNN" → Aarnio / Kristen
  / Lynn); county filter (a non-SWFL row dropped, a Lee row kept); individual filter (a `2502`
  corp / `2504` branch row dropped, a `2501` row kept); date parse.
- **Derived-query test:** a row dated within 7 days surfaces in `new_re_agents`; a row dated
  2 years ago does not.
- **`--dry-run` smoke** against the live file: prints kept-row count + a sample, zero writes.

## Cadence / freshness (same PR)

- GHA weekly cron wrapper (`ingest-dbpr-re-licensees.yml`) matching DBPR's weekly refresh.
- `cadence_registry.yaml` entry with `expected_rows_min` set from the first live count.
- `--dry-run` supported and shipped in the same PR (pipeline-freshness rule).
- No LLM anywhere in this pipeline → no `RunBudget`, no web_search, no spend guards needed.

## Out of scope (tracked separately)

- **The email lane.** Appends `email` / `email_source` to this table via a Chapter 119
  records request (from `hello@swfldatagulf.com`) for the weekly new-agent slice. The
  online license-detail scrape alternative is **DEAD (verified 07/10/2026 via live browser
  lookup)**: `LicenseDetail.asp` renders Name, Main Address, County, License Type, Rank,
  License Number, Status, Licensure/Expiration dates, Special Qualifications, Alternate
  Names — no email field exists in the page template at all. Records-request is the only
  email path.
- **Outreach send.** Operator-approved, separate surface; from `hello@swfldatagulf.com`.

## Follow-ups

- ~~Confirm the license-detail page email question (browser)~~ RESOLVED 07/10/2026 — scrape
  lane dead, records-request only (see Out of scope above).
- Measure the real weekly new-agent count once two weekly files can be compared → sets the
  `expected_rows_min` floor and sizes the outreach pool.
