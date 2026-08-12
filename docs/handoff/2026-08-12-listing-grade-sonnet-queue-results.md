# Listing Grade — Sonnet work queue, results

**Date:** 08/12/2026 · **Ran:** all 9 tasks from `docs/handoff/2026-08-11-listing-grade-sonnet-work-queue.md`, parallel Sonnet agents · **Parent brief:** `docs/handoff/2026-08-11-listing-grade-crawl4ai-research-brief.md`

Every finding below has its full source in `_RESEARCH/` with its `_RESEARCH/INDEX.md` line already written — this file is the roll-up and the "what's next," not a duplicate of the evidence.

---

## 1. Platform crawls (Tasks 1–4) — Q1 of the brief is now DONE for 6 of ~6+ platforms

Prior to this session: johnrwood.com and royalshellrealestate.com (both parseable, MLS number in URL). This session added:

- **kvCore/BoldTrail** — `_RESEARCH/data-and-ingest/2026-08-12-agent-site-crawl-kvcore-boldtrail.md` — BROWSER-ONLY (curl 403s, crawl4ai's browser gets full content). MLS number in URL. New finds: a dated price-history table, per-field source attribution ("Appraiser"), a live ZIP-average comp panel on the page itself, and a robots.txt with a trailing blanket `Disallow: /` for unnamed crawlers — a pattern no other platform had.
- **Sierra Interactive** — `_RESEARCH/data-and-ingest/2026-08-12-agent-site-crawl-sierra-interactive.md` — PARSEABLE. First platform in the queue carrying an actual **HOA fee dollar amount** ($800–$1,275/quarter + itemized fees), not just inclusions.
- **Real Geeks** — `_RESEARCH/data-and-ingest/2026-08-12-agent-site-crawl-real-geeks.md` — PARSEABLE. MLS number IS the entire URL path — the cleanest join key found on any platform. HOA fee amount fully absent (no field, not even inclusions).
- **Luxury Presence** — `_RESEARCH/data-and-ingest/2026-08-12-agent-site-crawl-luxury-presence.md` — PARSEABLE, but **breaks the URL-join pattern**: the MLS number is NOT in the listing URL on this platform, only in the page body / photo CDN path.

**Remaining platforms not yet tested:** BoomTown, WordPress + IDX Broker. Breadcrumb sites for BoomTown and CINC were found incidentally during the Real Geeks task (unassigned, not yet crawled) — see that file's closing note.

**⚠️ Cross-source discrepancy, unresolved.** The Real Geeks site (swflregroup.com) and the johnrwood.com reference site both carry the identical MLS number (226028911) but disagree on property subtype for that listing — Condominium (johnrwood.com) vs Residential (swflregroup.com). Neither has been checked against county records. Worth resolving before subtype ever feeds a comp — this is exactly the kind of source disagreement RULE 4 (data provenance) exists to surface, not paper over.

---

## 2. Competitor scan (Task 5) — the whitespace claim is now evidence-backed

`_RESEARCH/competitor-and-strategy/2026-08-12-listing-grade-competitor-scan.md` — 8 products examined. **Confirmed: nobody combines county-record facts + live market behavior + copy critique in one artifact.** Closest are AuditListing.com (FL beta, $49 — records + buyer red flags, no market/copy) and Listing Oracle (records + comps, no copy). Restb.ai does photo/copy condition scoring and is already sold to Stellar MLS — our own SWFL MLS. "Lundy Listing Score" doesn't exist as a product name; Lundy Inc. is a voice-AI vendor, also partnered with Stellar MLS.

---

## 3. Florida legal — quote-gathering only, three files, no interpretation drawn

- **Appraisal/BPO licensing** — `_RESEARCH/real-estate-market/2026-08-12-fl-appraisal-bpo-licensing-quotes.md`. All 6 sources fetched. **Caught and corrected a wrong citation in the original brief** — FS 475.6295 is "Authority to inspect," not the BPO/CMA section; the real sourcing is FS 475.612 + FS 475.25(1)(t) + FS 475.01(1)(a).
- **Seller disclosure duty** — `_RESEARCH/real-estate-market/2026-08-12-fl-seller-disclosure-duty-quotes.md`. *Johnson v. Davis* (Fla. 1985) verbatim, FS 475.278, and case law confirming "as-is" does NOT waive the disclosure duty. The Florida Realtors disclosure form's own PDF wasn't crawl4ai-extractable across 3 attempts — recorded as unreachable, sourced from a secondary practice-law page instead.
- **Buyer-agent post-settlement duties** — `_RESEARCH/real-estate-market/2026-08-12-buyer-agent-post-settlement-duties.md`. **Came back NOT FOUND** — "here's the sourced reasoning behind this offer" is not a documented pain point in any source fetched. The actual survey-measured pain point (Cotality/ResiClub via Inman, 34% of agents) is the compensation-negotiation conversation itself. **Read this before pitching the buyer-side email as the stronger commercial wedge** — this evidence doesn't support that framing yet.

---

## 4. Roof age from permits (Task 9) — the headline finding of this whole batch

`_RESEARCH/data-and-ingest/2026-08-12-roof-age-permit-feasibility.md`.

**Roof age is FREE and already landed — no records request needed anywhere.**

- The 08/02/2026 research file called `building_permits[]` "still unbuilt." That was wrong by the time this session ran it down: the field was fully parsed **08/03–08/04/2026** into `data_lake.steadyapi_property_permits` — 79,281 rows, 12,946 properties, re-verified live today. Precise (non-substring) matching identifies a roof permit on 5,228 properties (40.4%). No dollar-value field exists in this family.
- `data_lake.lee_building_permits` is a thin side-channel (306 rows over 5.5 months) but roof permits identify cleanly by `permit_id` prefix `ROF`.
- **Collier is fully ready right now.** The already-loaded 4,975 rows plus a fresh live download of the county's current June 2026 XLSX (5,505 rows, HTTP 200 today) both clean-identify roof permits (`Permit Type Desc='Reroof'`, 6.1% of rows) with a site address and a dollar value on **94.2%** of rows.

**The only blocker is an unrun dry-run probe on the parked `collier-permits-monthly.yml` cron** — this is a scheduling action, not a data-acquisition problem.

**Action owed, not taken by the research agent (operator call):** the open check `collier_permit_roof_age_request` should be **re-pointed, not closed** — the underlying blocker changed shape from "we need a records request" to "we need to schedule a pipeline we already wrote." Whoever picks this up next should run `node scripts/check.mjs` against that key.

---

## 5. What this changes for the listing-grade design

- Subdivision/community, remarks, year built, and (now) roof age all have a free lane through either the agent's own site or our own already-paid data — the "coverage objection" that was blocking a composite grade earlier this month keeps shrinking.
- HOA fee amount is inconsistent across platforms (present with a real number on Sierra Interactive, present as inclusions-only on johnrwood.com/kvCore, fully absent on Real Geeks/Luxury Presence) — still not a reliable free field; the paid per-house record (`hoa_fee`) remains the fill lane per the 08/03 finding.
- The buyer-side email pitch needs a different justification than "sourced offer reasoning is a documented pain point" — that specific claim didn't survive the legal/market research pass.
- Two open threads for the next session: (1) resolve the MLS-226028911 subtype discrepancy against county records, (2) decide whether to schedule the Collier dry-run now that it's confirmed unblocked.

Nothing in this batch wrote code, wired a consumer, or touched the email lane — per the queue's own scope boundary, those stay with the operator/a design session.
