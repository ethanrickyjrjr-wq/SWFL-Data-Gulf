# Weekly DBPR new-agent radar (Lee/Collier)

**Date:** 2026-07-11
**Status:** SPECCED — awaiting operator review, then implementation plan.
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
enough to detect who just got licensed. It does **not** carry email (verified: 21 columns,
mailing address only). Email is a public record (FL 455.275 requires each licensee to file
one; FL 668.6076 makes it public) obtained on a separate lane (records request / online
lookup), tracked apart from this build.

## Goal

A weekly pipeline that lands current Lee/Collier individual real estate licensees in a
`public.*` table and lets us query the newly licensed slice — the ongoing new-agent stream
that outreach targets. The `email` column is designed in now and filled later by the email
lane. Feeds outreach, not the answer engine.

## Sources (verified live 07/10/2026 via crawl4ai + curl)

- File: `https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv`
  (~13MB, no header row, all fields quoted). Refresh cadence: **weekly** (stated on the DBPR
  Real Estate Commission public-records page).
- Column order (21, from the DBPR public-records page column list): License code, Licensee
  Name, DBA Name, Rank, Address 1, Address 2, Address 3, City, State, Zip, County Name,
  License Number, Primary Status, Secondary Status, Original License Date, Status Effective
  Date, License Expiration Date, Alternate License Number, Self Proprietor's Name, Employer's
  Name, Employer's License Number.
- Region 7 counties in the file: Charlotte, Collier, DeSoto, Glades, Hendry, Highlands, Lee,
  Sarasota. We keep **Lee + Collier** (CLAUDE.md SCOPE).
- Individual agents carry License code `2501` ("2501 Real Estate Broker or Sales"), Rank
  "SL Sales Associate" / broker, Alternate License Number `SL…`/`BK…`. Corporations (`2502`),
  branch offices (`2504`), and schools are separate rows — excluded.

## Decisions (operator-confirmed 07/11/2026)

1. **"New" = recent license date.** Working pool = `original_license_date >= now() - 90 days`;
   "new this week" = last 7 days. Keying off the license date (not first-seen-by-us) is
   cold-start safe — the first run does not falsely flag all ~27k as new. `first_seen_at` is
   still recorded as a secondary signal but is not the "new" definition.
2. **Lee + Collier only.** Filter `County Name IN ('Lee','Collier')` on landing. County is
   stored so the scope can widen later without a reload.
3. **Individuals only.** Keep `2501` individual licensees; skip corp/branch/school rows.
4. **Lands in `public.dbpr_re_licensees`** (operational, like `dbpr_public_notices`) — NOT
   `data_lake.*`, so the brain-first gate does not apply (this feeds outreach, not answers).
5. **`email` column nullable**, populated later by the separate email lane.

## What we're building

A new Python ingest pipeline `ingest/pipelines/dbpr_re_licensees/`, started from
`ingest/scaffold.py` (incremental-aware), mirroring the `dbpr_public_notices` shape.

### Data flow

1. **Download** `RE_rgn7.csv` (single GET, streamed). Guard: empty/short body → exit 1 loud.
2. **Parse** with the stdlib `csv` reader (quoted fields, no header — positional map to the
   21 columns). Guard: any row whose column count ≠ 21 → abort loud (DBPR changed the layout;
   never write against a shifted map).
3. **Filter** to individual agents (`license_code == '2501'`) in `County Name IN ('Lee',
   'Collier')`.
4. **Normalize** each kept row to the table shape: split "LAST, FIRST MIDDLE" into
   `last_name` / `first_name` / `middle` (keep the raw `licensee_name` too); parse the three
   date columns (`MM/DD/YYYY` → date); assemble mailing address; carry status, employer,
   `alternate_license_number`. `email = NULL`. `source_tag = 'dbpr_re_rgn7'`,
   `source_url = <extract url>`, `as_of_date = <file fetch date>`.
5. **Merge** into `public.dbpr_re_licensees` on `license_number` (PK). `first_seen_at`
   preserved on conflict; `last_seen_at` bumped; mutable fields (status, employer, address,
   expiration) refreshed. `email` is refreshed with `COALESCE(EXCLUDED.email, existing)` so a
   later-populated email is never clobbered by a NULL from the CSV.

### Table — `public.dbpr_re_licensees`

`license_number` (text PK), `alternate_license_number`, `licensee_name` (raw),
`first_name`, `middle`, `last_name`, `dba_name`, `rank`, `license_code`,
`address1/2/3`, `city`, `state`, `zip`, `county`,
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
- Column-count mismatch on any row → abort loud before any write (layout-drift canary).
- Merge, never replace → the Gate-4 destructive-replace concern does not arise; still guard
  `license_number` + `licensee_name` non-null before the upsert.
- Expected-rows floor: assert kept-row count ≥ a sane floor (Lee+Collier individual agents
  number in the thousands) so a silently-emptied file reds the run instead of wiping nothing.

## Testing

- **Unit** (`test_parse.py`) on the real sampled rows: the 21-column positional map; name
  split ("FOLEY, CHERYL ANN" → Foley / Cheryl / Ann); county filter (a Sarasota row dropped,
  a Lee row kept); individual filter (a `2502` corp row dropped); date parse.
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
  records request (from `hello@swfldatagulf.com`) for the weekly new-agent slice, and/or the
  online license-detail scrape *if* that page is confirmed to render the email (unverified —
  the lookup is a session-driven portal; the browser extension was offline this session).
- **Outreach send.** Operator-approved, separate surface; from `hello@swfldatagulf.com`.

## Follow-ups

- Confirm the license-detail page email question (browser) → decides whether the scrape lane
  is viable vs. records-request only.
- Measure the real weekly new-agent count once two weekly files can be compared → sets the
  `expected_rows_min` floor and sizes the outreach pool.
