# Handoff — Agent Contact Factory (emails + names at scale)

**Date:** 2026-07-10
**From:** the outreach-readiness brainstorm (operator ruling: split into two builds; this is
build 2, for a parallel/next session).
**Companion build (this session):** `docs/superpowers/specs/2026-07-10-outreach-brand-injection-design.md`
**Research base (READ FIRST):** `docs/steadyapi-research/2026-07-10-outreach-brand-injection-research.md`
— findings C3 (DBPR extracts), F1/F5/F6 (what cold sends must look like).
**Operator decisions already made (do NOT re-litigate):**
- Lane: DBPR licensee CSV + brokerage-directory email crawls, joined. Ch.119 records request
  filed in parallel (operator action) as the wholesale email upgrade when it arrives.
- The full contact factory GATES the cycle-1 test send (operator chose "wait for full contact
  factory" over a small pilot send, 07/10/2026).

## What to build

A repeatable operator-side pipeline that turns public sources into the outreach engine's CSV
shape (`email,name,domain,zip` + `brokerage`,`license_number`,`provenance` columns —
`lib/email/outreach/targets.ts` parses the first four today; extra columns ride for the
brand resolver + compliance footer in the companion build).

1. **DBPR spine:** download `https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv`
   (weekly refresh; Charlotte/Collier/DeSoto/Glades/Hendry/Highlands/Lee/Sarasota). Filter:
   County ∈ {Lee, Collier}, Primary Status = Current, rank = sales associate/broker classes.
   Columns confirmed 07/10/2026 (see research C3): Licensee Name, DBA, Rank, mailing address,
   County Name, License Number, statuses, dates, **Employer's Name + Employer's License
   Number** (brokerage affiliation). Normalize "LAST, FIRST" → display name. NO emails in
   this file — that's lane 2.
2. **Directory email crawls:** crawl4ai passes over brokerage agent-directory pages,
   **in-page mailto links only** (the standing agents.json sourcing rule — no hidden-source
   scraping). Join to the DBPR spine by normalized name + brokerage. agents.json
   (`fixtures/real-estate-brands/agents.json`, 80 emails, 74 = John R. Wood) is the seed and
   the format precedent; keep growing it or supersede it with the factory's own store —
   your call at brainstorm, but ONE root.
3. **Output:** gitignored (contact lists NEVER commit — `outreach-runs/` pattern). ZIP column
   seeded from brokerage office location. Every row carries provenance (which directory URL /
   dbpr). This is NOT lake ingest — no `data_lake.*` writes, no brain-first gate, no
   cadence_registry entry needed unless you add a GHA cron for the weekly refresh (then
   pipeline-freshness rules apply).

## Constraints and landmines

- RULE 3.5: brainstorm + `node scripts/new-build.mjs agent-contact-factory "<label>"` before
  code. This handoff is the brief, not the spec.
- crawl4ai ONLY (never Firecrawl). PowerShell tool for the venv on Windows.
- SteadyAPI quirk if you touch it: 403 on Python default User-Agent BEFORE auth — browser UA
  header fixes (vendor note, folded 07/10/2026). Key = `new_steady` in `.env.local`
  (`PHOTOS_API` is the SUSPENDED key).
- Directory crawls are per-brokerage bespoke (every site differs). Budget the top ~20
  brokerages by DBPR licensee count first — that ranking comes free from the spine file and
  the companion build's pilot wants the same ranking (share it).
- CAN-SPAM posture for cycle 1 is handled in the funnel build (operator gates: domain, From,
  postal). This build only produces the list; it must not send anything.
- Open checks that touch this area: `contacts_csv_injection_policy` (CSV/formula-injection
  policy, overdue since 07/04) — the factory EMITS CSVs, so settle the escaping policy in the
  same build; `contacts_email_vs_public_lane` (two-lane reconcile) is adjacent but product-side,
  not this build.

## Done means

- One command produces the full Lee+Collier CSV with provenance; row counts logged
  (DBPR spine total, email-joined subset).
- Join rate reported honestly (expect: low at first — directories only cover what they cover;
  the Ch.119 drop is the wholesale fix).
- `check` opened by new-build.mjs closes on a live cycle-1 CSV handed to the funnel engine.
