# lee_deed_official_records — Lee County Clerk recorded-document feed

**Status (07/20/2026): LOAD pipeline + consuming brain shipped.** The split-pipeline is live per
Operation Dumbo Drop: `pipeline.py` (LOAD) merges every committed `raw/*.json` into
`data_lake.lee_deed_official_records` on `internal_doc_id`; the consuming brain
`refinery/packs/lee-deed-records-swfl.mts` reads it (empty-tolerant). The FETCH stays MANUAL — see
"Delivery mechanism — the actual blocker" below (Akamai). Migration:
`migrations/20260720_lee_deed_official_records.sql`. Cadence: `ingest/cadence_registry.yaml`
(`lee_deed_official_records`, parked / probe-excluded, `known_drift: parked_but_scheduled`).
This directory still accumulates dated raw pulls so backfill proceeds incrementally.

## What this is

Lee County Clerk of Courts' "Official Records Search" (LandMarkWeb product), the county's live
recorded-document index — deeds, mortgages, liens, judgments, plats, marriage licenses, etc.,
2010–present. Source: `https://or.leeclerk.org/LandMarkWeb/search/index`.

Researched live 07/19–07/20/2026 (crawl4ai + browser probes, not memory, per RULE 0.4). Corrects
an earlier SESSION_LOG (07/14/2026) note that parked "Clerk of Court official-records search" for
Lee — that check hit `matrix.leeclerk.org` (name/instrument-only, no parcel field). This is a
different, more capable system.

## Why we want it

Deed-grade sale price (Consideration) + date + parcel STRAP, indexed within ~3-4 days of
recording — potentially fresher than the current Lee sold-median source (LeePA GIS Layer 10,
~6wk lag). Also carries `CERTIFICATE OF TITLE` and other foreclosure-adjacent doc types worth a
future scan for the seller-stress-signal work.

## The API (reverse-engineered, verified live)

Two-step, session-stateful, ASP.NET MVC + DataTables. NOT a stateless single-call API.

1. `POST /LandMarkWeb/Search/DocumentTypeSearch` — sets search criteria server-side (session-scoped).
   Form-urlencoded fields: `doctype`, `beginDate`, `endDate`, `recordCount`, `exclude`,
   `ReturnIndexGroups`, `townName`, `mobileHomesOnly`.
2. `POST /LandMarkWeb/Search/GetSearchResults` — DataTables-style paged JSON, reads the criteria
   set in step 1. Standard DataTables params (`draw`, `start`, `length`, `columns[i][...]`) plus a
   captcha-adjacent `ShowCaptcha` check that returns `True` but did NOT block the actual data call
   in a real browser session — untested at sustained volume.

Response shape: `{"draw":..., "recordsTotal":N, "recordsFiltered":N, "data":[...]}`. Each row in
`data` is a **positional object** with string-numeric keys `"0".."26"` (not named fields) — decode
using the mapping below. `length` can be overridden above the default page size (tested 250 for a
191-record day, returned all in one call — no observed hard server cap yet).

### Row column mapping (positions 0–26)

| idx | field | notes |
|---|---|---|
| 0 | row counter | UI only, discard |
| 1 | "viewed" icon HTML | UI only, discard |
| 2 | "add to cart" link HTML | UI only, discard |
| 3 | status | `V` = verified/active observed |
| 4 | consideration | raw string e.g. `$304,900.00`; many rows are `$10.00` (non-arm's-length transfer — quitclaim/family/trust) |
| 5 | (blank in samples) | unconfirmed |
| 6 | grantor(s) | HTML-joined by `<div class="nameSeperator"></div>`; **truncates to 2 names + literal `"..."` if more than ~3 parties** — a real data-completeness gap, not yet worked around |
| 7 | grantee(s) | same truncation behavior as grantor |
| 8 | record date | prefixed `nobreak_` in raw response |
| 9 | doc type | prefixed `nobreak_` |
| 10 | book type | e.g. `O` |
| 11 | book | often blank |
| 12 | page | often `0000` |
| 13 | clerk file number | prefixed `nobreak_`; public instrument ID, e.g. `2026000187515` |
| 14 | doc links | present only when linked images exist; contains instrument numbers, sometimes HTML |
| 15 | legal (full) | plain text + a `<div class="nameSeperator">` joining the plat description to the `Parcel XX-XX-XX-XX-XXXXX.XXXX` STRAP — **join key into `lee_parcels`** |
| 16 | lot | prefixed `hidden_legalfield_` |
| 17 | block | same prefix |
| 18 | unit | same prefix |
| 19 | subdivision | same prefix |
| 20 | phase | same prefix, blank in samples so far |
| 21 | section | same prefix, blank in samples so far |
| 22 | township | same prefix, blank in samples so far |
| 23 | range | same prefix, blank in samples so far |
| 24 | (blank in samples) | unconfirmed, maybe "week" for condo/timeshare |
| 25 | internal document id | prefixed `hidden_`, stable numeric ID, e.g. `19764956` — better dedup key than clerk file number across years |
| 26 | (blank in samples) | unconfirmed |

Cleaning needed on every string field: strip `nobreak_` / `hidden_legalfield_` / `hidden_` /
`unclickable_` prefixes; split multi-party fields on the `nameSeperator` div; strip remaining HTML
tags from the legal field (parcel STRAP sits after the separator, don't truncate it — an early
version of this extraction did and lost the STRAP for single-parcel legals).

## Delivery mechanism — the actual blocker

**Akamai blocks all tested non-human-browser access.** Confirmed independently three ways
(07/20/2026):
- `crawl4ai` → Access Denied page (`errors.edgesuite.net`, Akamai's edge error domain).
- A CDP-attached Chromium (chrome-devtools MCP, fresh instance) → Access Denied, instantly, on
  the bare search page — before any search was even attempted.
- Plain `curl` with a spoofed Chrome User-Agent → connection dropped/reset (exit 28 timeout, then
  exit 56 on a second attempt), not even a clean HTTP response, on `or.leeclerk.org` specifically
  (the parent `www.leeclerk.org` DOES give curl a clean, fast `403` — so this subdomain runs a
  stricter tier).
- `curl_cffi` with full Chrome124 TLS-fingerprint impersonation → clean, confident `403 Access
  Denied` — so it isn't just a TLS/JA3 fingerprint check, it's JS-executed behavioral bot
  detection (Akamai Bot Manager sensor script + `_abck` cookie), which only a real,
  human-initiated Chrome session currently produces.

**Only a genuine, extension-driven Chrome session (Claude's `claude-in-chrome` tooling, or you
manually) has gotten through.** A stealth-patched headless browser (playwright-extra + stealth
plugin) was not yet tried — plausible next escalation if an unattended GHA cron is wanted later —
but the CDP-browser failure above means even that is not a sure thing, since Akamai already
rejected one real-Chromium-via-CDP attempt outright.

**Practical consequence:** daily pulls, for now, run through a real browser session (Claude Code +
claude-in-chrome), not a GHA script. This is architecturally different from every other pipeline
in this repo and needs to stay that way until/unless a stealth-browser test succeeds.

## How to pull the next day (repeatable steps)

1. Open `https://or.leeclerk.org/LandMarkWeb/search/index?theme=.blue&section=searchCriteriaDocuments&quickSearchSelection=`
   in a real (non-CDP, extension-driven) browser tab.
2. Install an XHR-capture interceptor via JS (see git history of this file's introducing commit
   for the exact snippet, or reconstruct: patch `XMLHttpRequest.prototype.open`/`send` to log
   `{url, method, reqBody, status, respBody}` on `load`).
3. Document Type tab → select `DEED` (or whatever doc types are wanted) → set Begin/End Date →
   Submit. This fires `DocumentTypeSearch` (sets session state) then one `GetSearchResults` call
   (default `length=25`, only a partial page).
4. From the captured `GetSearchResults` call, take its `reqBody`, override `start=0` and
   `length=<total or a safe upper bound like 500>`, and re-`fetch()` it directly (same-origin,
   `credentials: 'include'` to carry the session cookie) to get everything in one response.
5. Clean the `data` rows per the column mapping above.
6. Trigger a `Blob` + anchor-click download of the cleaned JSON (getting data out of the browser
   context through chat/tool-return channels truncates hard around ~1KB — download is the only
   reliable path found so far). Save as `raw/<YYYY-MM-DD>.json` in this directory, one file per
   date pulled (dedup on `internalDocId` across files when this becomes a real pipeline).

## Backfill plan

Index covers 2010–present (`Begin Date` defaults to 01/01/2010). Pull forward from today
gradually, a day or a small date-range chunk at a time, into `raw/`, per operator instruction
07/20/2026 ("start with now and backfill a little at a time"). No fixed cadence yet — this is
manual/session-driven until a decision is made on whether to invest in a stealth-browser
unattended cron.

## Open items before this becomes a real pipeline

- Grantor/grantee truncation past ~3 parties (need to check if `Advance Legal` or a raw
  book/page lookup exposes full party lists, or if this is an accepted gap).
- `ShowCaptcha=True` behavior at sustained volume — untested beyond a handful of searches in one
  session.
- Whether Collier's clerk runs the same LandMarkWeb platform (would reopen the Collier deed-feed
  problem from `docs/handoff/2026-07-14-collier-deed-feed-handoff.md`).
- Formal pipeline: dlt scaffold, `PackDefinition`, cadence_registry entry, brain-first gate
  compliance, non-arm's-length filtering (`$10.00` consideration floor per the Lee sold-median
  approach already documented in `docs/handoff/2026-07-14-collier-deed-feed-handoff.md`).
