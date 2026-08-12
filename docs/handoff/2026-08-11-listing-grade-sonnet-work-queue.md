# Listing Grade — the Sonnet work queue

**Date:** 08/11/2026 · **For:** a Sonnet session (or several, in parallel — the tasks are independent)
**Parent brief:** `docs/handoff/2026-08-11-listing-grade-crawl4ai-research-brief.md`
**Evidence so far:** `_RESEARCH/data-and-ingest/2026-08-11-agent-site-listing-crawl-feasibility.md`

**What this is:** every piece of the listing-grade research that is bounded, mechanical, and
specified tightly enough that it does not need judgment calls. Nine tasks. Each names its input, its
exact output, and its stop condition. **A task whose answer requires deciding what we should DO is
not on this list** — those stay with the operator.

---

## HARD RULES — every task, no exceptions

1. **crawl4ai only. Never Firecrawl.** Pinned CLI: `crawl4ai <url>` (bare URL → clean markdown).
2. **Never use raw `curl` to decide a site is blocked.** Measured 08/11/2026: royalshellrealestate.com
   returns HTTP 403 to curl and full content to crawl4ai's browser. A curl failure proves nothing.
3. **Read `_RESEARCH/INDEX.md` before starting any task.** If the answer is already there, say so and
   stop — that is a successful task, not a failed one.
4. **Every finding lands in `_RESEARCH/<category>/<date>-<slug>.md` AND gets its line in
   `_RESEARCH/INDEX.md` in the same pass.** Unindexed research does not exist. This has been
   violated before.
5. **Never invent a number or a quote.** Every figure and every legal sentence carries its source URL
   and the date fetched. If a page will not load, write that it would not load — do not substitute
   memory. Absence claims require naming what you checked.
6. **Do not interpret law.** Tasks 6–8 are QUOTE-GATHERING. Paste the operative sentence verbatim
   with its citation. Write "this appears to mean X" nowhere.
7. **Stop at the stop condition.** Do not expand scope, do not start building, do not write a plan
   doc. Open no checks unless a task says to.
8. Dates are MM/DD/YYYY. No tables in any answer back to the operator (plain prose/lists only).

---

## TASK 1–4 — Platform crawl tests (4 tasks, one per platform, run in parallel)

**Done already, do not repeat:** johnrwood.com (server-rendered, full field census) and
royalshellrealestate.com (browser-only, URL pattern captured, detail census NOT done).

**Remaining platforms, one task each:** kvCore / BoldTrail · Sierra Interactive · Real Geeks ·
Luxury Presence. (If a fifth session is free: a WordPress + IDX Broker SWFL agent site.)

**Method, identical for each:** find 1–2 REAL Southwest Florida agent or brokerage sites running that
platform (platform fingerprints show up in asset hostnames, script paths, and login URLs). Then fetch
four things through crawl4ai: robots.txt, the homepage, the listings index, and one listing detail
page.

**Output — write to `_RESEARCH/data-and-ingest/` as `2026-XX-XX-agent-site-crawl-<platform>.md`,
and mirror the section shape of the 08/11 feasibility file:**
- Verdict, one word: **parseable / browser-only / needs-JS-beyond-crawl4ai / blocked**
- The site(s) tested, with URLs and the fingerprint that identified the platform
- robots.txt: what is disallowed for `User-agent: *`, and specifically whether listing paths are
- The listing detail URL pattern, and **whether the MLS number appears in it** (this is the join key
  to our own data — it did on both sites tested so far)
- A field census of the detail page: every field name that came through, verbatim. Flag explicitly
  whether these five are present, because they are the ones that matter:
  **subdivision/community name · full remarks prose · year built · roof · HOA fee amount**
- Anything the page carries that site 1 did not

**Stop condition:** four fields above answered for one real site on that platform. Do not test more
sites once the verdict is clear.

---

## TASK 5 — Who already grades a listing? (competitor scan)

**Question:** does any product score, grade, or audit a LISTING (as opposed to scoring a homeowner's
propensity to sell — that market is already mapped in our 07/17/2026 landscape research, read it
first and do not redo it).

**Crawl:** Restb.ai · Lundy · Homes.com and Zillow listing-quality/"listing health" documentation ·
MLS listing-quality or compliance-scoring programs (search "MLS listing quality score" with named
MLSs) · ShowingTime · Lone Wolf · any "listing audit" or "listing report card" sold to agents.

**Output per product:** what it scores · on what inputs · does it publish a scale · price · who
buys it. Then one paragraph answering exactly one question: **does anyone combine county-record
facts + live market behavior + copy critique in a single artifact?**

**Stop condition:** eight products examined or the search goes dry, whichever first.

---

## TASK 6 — Florida: is a listing grade a regulated valuation? (QUOTE-GATHERING ONLY)

**Fetch and quote verbatim:** Florida Statutes Chapter 475 Part II (appraisers) · FS 475.612 ·
FS 475.6295 · Florida DBPR / Florida Real Estate Appraisal Board guidance on broker price opinions
and comparative market analyses · Appraisal Foundation/USPAP public guidance on what constitutes an
appraisal · the federal interagency AVM quality-control rule.

**Output:** the operative sentences, verbatim, each with URL + date fetched, organized under three
headings: what counts as an appraisal · what counts as a BPO/CMA and who may issue one · what falls
outside both. **Draw no conclusion.** If a statute section number in this brief turns out to be
wrong, say so and give the correct one.

**Stop condition:** all six sources fetched or recorded as unreachable.

---

## TASK 7 — Florida seller disclosure duty (QUOTE-GATHERING ONLY)

**Fetch and quote verbatim:** *Johnson v. Davis* (Fla. 1985) and its current statement of the duty
to disclose known latent defects materially affecting value · the Florida Realtors seller disclosure
form and its stated scope · FS 475.278 brokerage relationship duties · any Florida guidance on
whether an "as-is" contract changes that duty.

**Output:** same shape as Task 6 — verbatim, cited, no interpretation. Plus one factual line: does a
public listing's stated facts carry any warranty, per the sources.

**Stop condition:** four sources fetched or recorded as unreachable.

---

## TASK 8 — What must a buyer's agent now justify? (post-settlement practice changes)

**Fetch:** NAR's own practice-change pages as they now stand — written buyer agreements before
touring, compensation no longer displayed in the MLS — plus 2025–2026 brokerage/coaching guidance on
how buyer agents demonstrate value.

**Output:** what a buyer agent must now put in writing, cited. Then, factually: **is "here is the
sourced reasoning behind this offer" a documented pain point in that transition — yes with citations,
or not found.** That yes/no decides whether the buyer-side email is the stronger commercial wedge.

**Stop condition:** NAR's own pages plus three independent 2025–2026 sources.

---

## TASK 9 — Roof age from permits: OUR data first, then Collier

**Read RULE 0.7a before starting: our own free data is rung 1.**

**Step 0 — THE FIELD WE MAY ALREADY BE BUYING AND THROWING AWAY. Do this first.**
`_RESEARCH/data-and-ingest/2026-08-02-property-tax-history-full-scope.md` records that the vendor's
`/property-tax-history` endpoint — **the one endpoint we already pay for on the DOM backfill** —
returns about 50 fields across five families, and one of them is **`building_permits[]`**, logged
there as "census should-get #2, still unbuilt." **We persist exactly one field from that response
(`listed_date`). Reading the rest costs ZERO extra calls.** So before any county work: make one live
call and report what `building_permits[]` actually contains — permit type, date, value, whether a
roof permit is identifiable, and coverage across a handful of real SWFL addresses.
⚠️ That same file carries the `_ENRICH_ONLY_COLS` trap that wiped `listed_date` on 17,127 rows and
`baths` on 34,139 — **read the trap section before proposing any write.** Report only; write nothing.

**Step 1 — ours.** We hold Lee permit data (`data_lake.lee_building_permits`, weekly pipeline,
`lee-permits-weekly.yml`). Query it live and answer: does a permit row identify a ROOF permit, and
does it carry an address that can be joined to a listing? Report the row count, the fields, the
roof-permit share, and the address-join feasibility. **This may make the whole Collier question
smaller.**

**Step 2 — Collier.** `collier_permits` exists as a pipeline but is PARKED — a monthly Issued-series
XLSX, 23 mapped columns, no schedule fires. Fetch that XLSX from the county page and answer one
question: **does it identify roof permits, with an address?** If yes, the fix is scheduling a
pipeline we already wrote, not a records request. If no, say exactly which fields are missing.

**Open check to close or update:** `collier_permit_roof_age_request` (opened 08/11/2026). **Do not
draft or send any email to the county** — if a records request turns out to be needed, report that
and stop; the operator sends it.

**Stop condition:** both steps answered with live evidence.

---

## NOT on this list — these stay with Opus/the operator

- Deciding the grade's output shape (verdict + reasons, per the parent brief §1b).
- Anything that writes code, wires a consumer, or touches the email lane.
- Interpreting the legal findings from Tasks 6–8.
- Terms-of-service judgment on crawling any specific site.
- The 33909 pilot run itself.
