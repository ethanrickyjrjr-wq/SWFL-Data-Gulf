# Collier Clerk official records — LIVE, crawlable, searchable (crawl4ai probe result)

**Date:** 08/12/2026 · **Source:** live crawl4ai probes against `cor.collierclerk.com`, this session.
Follow-up to `docs/handoff/2026-07-14-collier-deed-feed-handoff.md` (which flagged Collier as
`[CANDIDATE]` on a bare homepage-reachability check only) and today's four-lane crawl4ai strategy
synthesis (`_RESEARCH/agent-behavior/2026-08-12-crawl4ai-four-lane-strategy.md`), which named this
as the top data-sources scouting action.

## Verdict: Collier's official-records search WORKS via crawl4ai. Lee's does not. They are different platforms.

Lee County's `or.leeclerk.org/LandMarkWeb` has failed crawl4ai, CDP-driven Chromium, curl, and
curl_cffi with full Chrome-TLS impersonation — all four, verified 07/19-07/20/2026 — behind Akamai
Bot Manager. Collier runs a **different platform entirely** — `cor.collierclerk.com`, a Blazor
Server app ("COR Access", copyright footer `3.3.0.18`, form field names literally carry
`CORPubBlazor.ViewModels.*`), with **no CAPTCHA, no Cloudflare challenge, no Akamai wall** on any
step tested.

## What was actually proven, step by step (all four steps, this session, live)

1. Homepage (`cor.collierclerk.com/`) loads clean — real content ("COR Access ... Official Records
   Search ... Document Search, Legal Search, Case Search, Map Search, Address Search"), no bot-block
   markers in the rendered text.
2. Nav links resolve to real client-side routes: `search/address`, `search/case`, `search/document`,
   `search/legal`, `search/map` (a direct URL guess to `/search/document` 404s — it's a JS-routed
   SPA, not a server path — so it must be reached via a real click, not a guessed URL, same lesson
   the Collier appraiser GIS handoff already learned for a sibling service).
3. Clicking "Document Search" via JS renders the real search form with real field names: `LastName`,
   `FirstName`, `Business`, `DocTypePresetsDDL`, `DocType`, `ParcelNumber`, `_searchCriteria.StartDate`,
   `_searchCriteria.EndDate`, `Instrument`, `Book`, `Page` — this is the Collier equivalent of Lee's
   LandMarkWeb search fields, confirmed to exist and render.
4. **Submitting a real search (date range 08/01/2026-08/11/2026, no other filter) returned real
   result rows** — grantor/grantee names, OR book/page, document numbers, legal descriptions, dated
   through 08/12/2026 (today), **1-20 of 2,939 items** for that 10-day window. No CAPTCHA
   interrupted it. (A benign "An error has occurred, click to reload" appeared at the very end of
   the capture — this is the Blazor SignalR circuit disconnecting when the script exited, not a
   block; the result table had already rendered and was captured before that message appeared.)

2,939 items in 10 days is a materially higher volume than Lee's DEED-only pull (Lee's ~147
arm's-length DEEDs/business-day is a small slice of Lee's own ~32 doc types in the same feed shape)
— Collier's default search likely spans more doc types by default, consistent with the doc-type
catalog finding that DEED is a minority of any clerk's daily recording volume.

## Follow-up same session — burst-repeat test + full output schema (RULE 0.4 full-scope-first)

Operator asked to push past the single-probe result and confirm this actually holds up. Ran 7 total
automated searches this session (the 1 above + 6 more, different date ranges), back-to-back, no
pacing — **zero CAPTCHA, zero rate-limit signal, zero block, across all 7.** This is not the same
as surviving a real multi-day cron (see below), but it does rule out the cheapest failure mode:
immediate behavioral-fingerprint blocking on repeat automated access, which is exactly how Lee's
Akamai wall would have reacted to this same test.

**Caught a real bug in my OWN test script along the way, not a Collier-side issue:** the date
fields are native HTML5 `<input type="date">`, which only accept ISO `YYYY-MM-DD` — my first burst
test fed `MM/DD/YYYY` and got silently rejected (the field keeps its default value), which is why 3
different requested ranges all returned nearly the same count. Fixed the format and reran; results
now scale sensibly with range size:

- 3 days (08/10-08/12): 1,227 items
- 7 days (08/05-08/11): 2,858 items
- 1 month (07/13-08/12): 12,524 items
- 2 months (06/13-08/12): 23,747 items

That's a consistent ~400-420 documents/day across ALL doc types (not DEED-only) — real, sane,
internally-consistent volume, not an artifact.

**Full output schema, from the actual results table** (RULE 0.4 requires this before any ingest
code, not just the fields an immediate use case needs): `Party Names`, `Recorded` (date), `Doc Type`,
`Instrument` (number), `Book`, `Page`, `#Pgs`, `Legal Description/Comments`, `Parcel IDs`. Sample row:
grantor/grantee prefixed `F:`/`T:` inside the single Party Names cell (same convention as Lee's
grantor/grantee lists), Doc Type rendered as a short code (`NC` in the sample — not yet decoded to
its full name; Collier's UI does not expose the code→label mapping in the DOM the way Lee's export
button does, so this is a genuine open item, not solved here). **`Parcel IDs` can be blank per-row**
(confirmed in the sample row) — the same join-key-coverage caveat Lee has (not every doc carries a
resolvable parcel key), degree unmeasured yet.

## What is STILL NOT proven — the honest gap, updated after the burst test

- **True multi-day scheduled durability.** 7 back-to-back searches in one session is real evidence
  against immediate bot-fingerprint blocking, but it cannot substitute for a real cron running over
  real elapsed days — Lee's own feed looked fine at first too. This needs an actual GHA scheduled
  workflow left running, not something one session can fabricate by compressing time.
- **Doc Type short-code decoding.** Results render codes (`NC`, etc.), not full names — Collier's UI
  does not expose a code→label map in the DOM the way Lee's export button's spelled-out doc types do.
  Needs either a docs page, an export-button path (unchecked — does Collier have one?), or manual
  decoding against known F.S. instrument types.
- **`Parcel IDs` per-row coverage percentage.** Confirmed the column exists and CAN be blank (one
  sample), but the true fill-rate (Lee's DEED rows are ~94% strap-covered against a ~44% table-wide
  average) is unmeasured here — needs a real sample across doc types, not one row.

## Recommended next step

A short scheduled-pull test (e.g., 3 unattended daily crawl4ai runs) before committing to a full
ODD-ready pipeline scaffold — cheap, and it's the one thing an interactive probe cannot answer. If
that holds, this is a straight port of the Lee deed pipeline's shape onto a feed that, unlike Lee's,
does not need a human-launched browser session at all.
