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

## What is NOT yet proven — the honest gap

- **Automatability, not just crawlability.** A single interactive probe succeeding does not prove a
  scheduled, unattended daily pull will keep working — Lee's own feed initially looked reachable too
  before Akamai's behavioral fingerprinting kicked in on repeated/scheduled access. The real test is
  a sustained, scheduled pull, not one manual session.
- **Full field/doc-type scope not yet enumerated.** RULE 0.4 full-scope-first requires listing every
  field the export/search UI exposes before writing ingest code — this probe confirmed the search
  form's INPUT fields, not the full set of OUTPUT columns per result row, nor whether an export
  button (like Lee's newly-found clean XLSX export, `_RESEARCH/data-and-ingest/
  2026-08-12-lee-deed-doc-type-catalog.md`) exists here too.
- **No parcel_strap / join-key equivalent confirmed.** Lee's pipeline depends on a derived
  `parcel_strap`; Collier's form has a bare `ParcelNumber` field (labeled "Not part of the Official
  Record" in the UI) — whether Collier deeds carry the join key needed to replicate Lee's
  cash-vs-financed pattern is unconfirmed.

## Recommended next step

A short scheduled-pull test (e.g., 3 unattended daily crawl4ai runs) before committing to a full
ODD-ready pipeline scaffold — cheap, and it's the one thing an interactive probe cannot answer. If
that holds, this is a straight port of the Lee deed pipeline's shape onto a feed that, unlike Lee's,
does not need a human-launched browser session at all.
