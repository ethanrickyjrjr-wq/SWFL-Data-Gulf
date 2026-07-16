# Data reliability + new-source sweep (SteadyAPI Reddit + crawl4ai vendor verification)

> **Recommended model:** ⚡ Sonnet — keywords: migration, schema

**Operator ask (07/16/2026):** unused SteadyAPI monthly call quota, spent on two related questions —
(A) how to stop our pipelines from silently losing/missing data, and (B) where to get MORE data —
new sources we don't currently ingest. New territory, no prior research round to extend. Grounded in
OUR actual failure history first (RULE 0.5 — code/logs before speccing), then researched externally
against those specific failure modes, not generic "how to build a pipeline" advice.

**Live calls this session:** 47 raw SteadyAPI Reddit HTTP calls (45 returned usable data; 2 were
`/v1/reddit/search` 422s from an initial wrong param name — `q` — corrected mid-session to the real
param, `search`; both retried successfully after the fix). Plus 4 crawl4ai vendor-verification
fetches for Part B candidates. Full raw JSON: scratchpad (not committed — every raw response saved
locally as it was pulled, per the four-lane provenance rule).

**Subreddits scanned:** r/dataengineering, r/devops, r/ETL, r/webscraping (Part A) ·
r/Naples_FL, r/FortMyers, r/CapeCoral, r/floridarealtors, r/RealEstate, r/AskFlorida (Part B).

**Mechanical note, new this session (fold into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` if this
file's findings get promoted):** the endpoint-agnostic content-filter false positive documented
07/09/2026 (`{"success":false,"message":"Please enter a valid subReddit URL."}` on a well-formed,
valid post URL, clearing on an immediate retry) reproduced again on `/v1/reddit/post` this session —
but this time the `success:false` sat at the **top level** of the JSON body, not nested under
`body.success`. A retry helper that only checks `json.body.success === false` misses it; check both
shapes. Also confirmed: very old permalinks (a 2018 r/devops thread, id `9uxyvy`) can fail this same
validation on EVERY retry, not just the first call — old/possibly-archived posts may be a genuine,
non-transient rejection class, not just the known transient quirk. `/v1/reddit/search`'s query param
is `search`, not `q` — passing `q` 422s with `"The search field is required."` (not documented in the
existing vendor note; adding here for the next session).

---

## A. Avoiding silent data loss

### Our real failure taxonomy (Part 1 — probed before researching anything)

Five concrete failure modes, each anchored to a real incident in `docs/cron-rebuild-failures.md`,
`SESSION_LOG.md`, or the open `checks` ledger — not hypotheticals:

1. **A scripted HTTP fetch hits a vendor's fingerprint/bot-wall from a GHA datacenter IP and just
   hangs — zero stdout — until CI's own timeout kills it, looking exactly like "nothing happened."**
   `leepa-parcels-annual` has **never once completed on GitHub Actions** (5/5 runs cancelled — 3
   dispatches + 2 schedules — always at ~100% of whatever the ceiling was, 30min then 90min after a
   07/11 bump). The 07/15/2026 incident log (`gh run view 29411674653 --log`) shows **89 minutes
   between the pipeline step starting and GitHub's cancellation with not one print** — it never even
   cleared the first fetch checkpoint. The live table looked fine only because a same-day *manual*
   local run (07/11) happened to backfill it — a coincidence, not a working pipeline. (SESSION_LOG
   2026-07-15, first entry; open check `leepa_http_fetch_blocked_needs_crawl4ai_path`.)
2. **A non-atomic `replace` disposition gets killed mid-write by a CI timeout and leaves the table at
   zero rows — worse than doing nothing, and masked by a downstream cache TTL that hadn't expired
   yet.** `fdot-aadt-annual`'s first-ever scheduled run reached the Tier-1 upload but was killed by
   `timeout-minutes: 20` mid-Tier-2 `replace` (dlt's postgres `replace` truncates before reinserting,
   non-atomically). The table sat at **0 rows for 18 days**, invisible because `logistics-swfl-
   nowcast`'s brain-cache TTL didn't expire until day 18 — the guard (`assertSegmentsNonEmpty`)
   worked exactly as designed and HELD master, but nothing surfaced the empty table until a consumer
   finally tried to read it. (`cron-rebuild-failures.md`, 2026-07-03 row — RESOLVED, timeout bumped
   20→40min.)
3. **A volume/row-floor check can pass in aggregate while a specific named subset is fully empty.**
   `noaa_ghcn_rainfall` has 1 of 4 anchor stations at **zero landed rows**; the aggregate floor could
   go green forever without that specific gap ever being fixed. (Open check
   `noaa_ghcn_missing_station_masked_by_floor`.)
4. **A pipeline can go from "APPLIED, tracked, believed working" to "actually writing 0 rows" with no
   alarm connecting the two facts.** `source_totals_migration_apply` — the migration is confirmed
   applied, the table is confirmed writing 0 rows, and as of this session **nobody has diagnosed
   why**. (Open check, due 07/13, `[ingest]` tag.) Same failure class hit `dbpr_re_licensees` (0 rows
   vs. an observed ~30,100 the source actually holds) and `redfin_city_swfl` (`ghost_target` +
   `dlt_never_landed` — a floor computed from a dry-run against a table that never actually landed).
   (`identity_live_red_baseline` check.)
5. **The failure-classifier itself can misdiagnose a transient flake as deterministic, which is worse
   than no classifier** — it trains operators to distrust or ignore its "will not self-heal" alarms
   right when a genuinely deterministic failure needs one. `classify-cron-failure.mjs` labels bare
   `Connection error.` / "socket closed" mid-synthesis flakes as `failureClass=deterministic` even
   though this exact class has self-healed on the next scheduled run every single time it's been
   seen (2026-06-01 ×3, recurred 2026-06-29). (`cron-rebuild-failures.md` "Recurring Patterns →
   Transient Anthropic egress flake.") A related but distinct case: `news_swfl`'s 06-20 incident was
   auto-captured and **misattributed to crawl4ai** when the real cause was a silent dlt schema
   mismatch (`published_date` typed `date` in Postgres vs. `text` from the pipeline) — the
   observability layer's own labeling was wrong, not just slow.

None of these are "we don't have monitoring" — `ingest/cadence_registry.yaml` already has
`freshness_sla` (warn/error thresholds), `expected_rows_min` volume guards, `nightly:` gate
membership with `assert_landed.py`, and the Bible's §0.2 guard #5 (non-null floor before any
destructive replace, `[hook-blocks]`) and §0.3 (WAF standard: probe from home IP, park + seed
locally, residential proxy escalation, total-empty = exit 1). The gaps above are specifically what
that existing machinery **doesn't** see: a job that produces zero output while still running (not yet
failed), a subset-level zero inside an aggregate-level pass, and a classifier that actively
mislabels.

### Tactic 1 — alert on "never reported completion by deadline," as a category separate from data-content validation

The `leepa` failure (#1 above) is not a data-quality problem — the guard rails we already have
(non-null floor, total-empty exit code) never get a chance to run, because the process never reaches
the point where it would check its own output. It needs a **watchdog independent of the job's own
exit path.**

Real, current, on-topic evidence (r/webscraping, "How to monitor a lot of scrapers so a break doesn't
reach the client?", fetched live this session, 16 comments): the top comment (u/bartekrutkowski, no
score-weighted upvotes shown but the most substantive reply in the thread) states the exact taxonomy
worth adopting as an explicit post-mortem discipline going forward:

> "This covers three kinds of issues, the scraper failed, it completed with bad data or it never ran
> at all... Separately alert when a scraper never reports completion by its expected deadline because
> output validation cannot help when the scheduler or worker never launched in the first place."

Mapped onto our incidents: `leepa` = **never ran/completed** (bucket 3 — needs deadline alerting,
today has none); `fdot` = **completed with bad data** (bucket 2 — the non-null guard exists but can't
fire on a process that was killed mid-write, before it reaches its own completion check); the
`source_totals`/`dbpr_re_licensees` zero-row mysteries are also bucket 2. Only bucket 3 is a true gap
in our current tooling.

A live, real, purpose-built product confirms the same fix independently (r/SideProject, "I built a
dead-man's switch for my AI trading pipeline — now it's a product," fetched this session):

> "I run a trading bot... A few too many times I woke up to find it had silently crashed overnight —
> no error, no alert, nothing in the logs... So I built a lightweight monitor: my script pings a URL
> at start and finish. If the ping doesn't come, I get an email. A simple dead-man's switch."
> (PulseWatch, r/SideProject, low engagement — 2 comments — but the mechanism described is exactly
> the "start ping / finish ping / alert on missing finish-within-window" pattern, which is the
> standard shape of Healthchecks.io / Cronitor / Dead Man's Snitch — an r/linux thread on a
> self-hosted equivalent, "totmann, a dead man's switch for your cron jobs," drew the same
> counter-suggestion from a commenter with 7 upvotes: "set up a central monitoring system like Nagios
> and use any of the half dozen checks which do this instead.")

**Applied to us:** `leepa-parcels-annual` (and any pipeline in the same fingerprint-blocked class —
`collier_permits`, `dbpr_sirs_submissions`, `swfl_inc` before its stealth fix) should ping a
start-marker at the top of the run and a finish-marker at the end; if the finish-marker is missing
past N minutes (set from the pipeline's own historical p95 runtime, not the CI timeout ceiling), fire
an alert **before** GHA's hard timeout kills it silently. This is strictly cheaper than what we do
today — right now the only signal is the eventual auto-captured GHA failure row, which for `leepa`
took 5 runs across 2 months to even establish the pattern as "never once succeeded" rather than
"occasionally times out."

### Tactic 2 — a structural/schema fingerprint check on every load, not just at manual-audit time

The Bible's §0.2 guard #4 ("audit field names against the LIVE vendor API") is `[policy-only]` —
read-and-honor, no automated check runs it on a schedule. The `news_swfl` 06-20 incident (#5 above)
is exactly what that gap allows: a column's Postgres type silently drifted out from under the
pipeline (`date` vs. the pipeline's `text`), the load failed, and the auto-capture misattributed the
whole thing to crawl4ai because nothing was fingerprinting the schema shape itself.

Same r/webscraping thread, continuing the same comment:

> "For more fragile sites save a small fingerprint of the relevant DOM structure and alert on large
> changes when detected... At minimum I would track all needed fields, null percentages, expected row
> count values, freshness of the newest record, duplicates and if a known control record can still be
> found."

This is additive to what we already enforce (guard #5 is a non-null **floor**, not a **shape**
check). A cheap per-load schema/column-type fingerprint compared against the last-known-good
fingerprint — before the insert, not after a failure — would have turned the `news_swfl` incident
into an immediate, correctly-labeled "column type changed" alert instead of a misattributed crawl4ai
blame that took a manual Phase-1 triage session to actually diagnose.

### Corroboration, not a new tactic: the bot-wall problem has no silver bullet anywhere

Two live, currently-active r/webscraping threads (fetched this session, both within the last few
days) confirm Cloudflare/fingerprint blocking is an unsolved, moving-target problem industry-wide,
not something specific to our LeePA/Accela/DBPR targets: "SeleniumBase suddenly not getting past
Cloudflare anymore?" (a previously-working stealth setup broke with no code change on the scraper's
side — Cloudflare's detection moved) and "Websocket tls handshake Cloudflare" (WS connections
flagged as bot even through a working HTTP-level bypass). The comment-level advice in both threads —
rotate to `curl_cffi`/`patchright`, compare real-browser TLS/header fingerprints against the script's
— is the same toolkit our own §0.3 already prescribes (`UndetectedAdapter`, stealth `Crawl4aiSession`,
residential proxy escalation). **Conclusion: there is no missed technique here** — our existing
WAF-hardening standard is already at the current state of the art; the gap is entirely in Tactic 1
(detecting the block fast, not evading it better).

---

## B. New data sources for SWFL

Checked against `ingest/cadence_registry.yaml`'s ~55 registered pipelines before writing anything
down (per RULE 0.4/0.5 — don't re-propose what's already there). One candidate I initially considered
— DBPR condo/HOA reserve filings — turned out to **already be ingested** (`dbpr_sirs_submissions`,
feeding the `condo-sirs-swfl` brain, presence-only signal) — correctly dropped before it reached this
document.

### Candidate 1 — Florida OIR Residential Market Share / Market Intelligence Report (insurance, ZIP + county grain)

**Source:** `https://floir.gov/tools-and-data/residential-market-share-reports` (query tool:
`https://apps.fldfs.com/QSRNG/Reports/ReportCriteriaWizard.aspx`). crawl4ai-verified live this
session: the Florida Office of Insurance Regulation publishes **monthly** (ZIP + county grain since
January 2025; quarterly county-only before that) residential property policy data — company, county,
ZIP, policy type — required by Section 624.424, Florida Statutes. Real downloadable `.xlsx` files
confirmed live for every month through April 2026 at the time of the fetch. The page explicitly flags
that submitted data is **not audited by OIR before publication** — a caveat to carry into any citation
if we ingest this.

**Reddit corroboration (fetched live this session, r/AskFlorida):** two threads with real, quantified
premium trajectories — "home insurance is out of control — might have to sell my house?" (63
comments; top comment, 35 score: *"My homeowners insurance was $1,800 ten years ago when we bought our
house, it's now $5,900."*) and "Are property insurance costs actually pushing longtime Floridians out
of the state?" (45 comments, 26 score: *"From 2020-2026, it has increased to $4800 a year. FOR
NOTHING... Hoping to sell and move out of state."*). Multiple commenters explicitly name **Citizens**
(the state-backed insurer of last resort) as the structural risk concentration point (*"Citizens could
never pay off the claims if the big one really hits"*) — this validates the already-settled Reddit
finding from the round-1 backlog (insurance premium shock, "+72% since 2020") but adds a live,
ZIP/county-grain, government-sourced number we could actually cite instead of only narrating the pain.

**Why not already ingested:** never scoped — `cadence_registry.yaml` has no `floir`/`OIR`/`citizens`
entry at all. **Rough effort read:** the query tool (`ReportCriteriaWizard.aspx`) looks form-driven,
not a clean REST/CSV endpoint — likely a scrape-and-parse job (probe first, per §0.1) rather than a
clean API pull; company-level trade-secret exclusions (a long list on the page, including several
major FL carriers) mean county/ZIP aggregates will be **understated**, not complete — a real
provenance caveat to carry forward, not a blocker.

### Candidate 2 — Florida DOE School Grades (school-level A–F ratings)

**Source:** `https://www.fldoe.org/accountability/accountability-reporting/school-grades/`, with a
dedicated data portal at `https://edudata.fldoe.org/` ("Know Your Schools") — both crawl4ai-verified
live this session as real, current FL DOE surfaces.

**Reddit corroboration (fetched live this session, r/AskFlorida, "Moving to FL from TX - Help us
narrow it down!", 20 comments):** school quality is a repeatedly, unprompted-named relocation-decision
factor — five of the eight substantive comments name schools specifically by area, and one names the
exact source: *"Sarasota County schools are consistently ranked as one of the best public school
districts in Florida. The district has held an 'A' rating from the Florida Department of Education
since 2004."* Given the round-3 sweep (`2026-07-09-round3-q1-q2-tier2-answers.md`, item 21) already
validated snowbird/out-of-state-buyer area-fit uncertainty as a real, unmet SWFL pain
("rent first / drive the neighborhoods yourself" is today's only advice) — school-grade data at the
ZIP/school-boundary grain is a concrete, sourceable way to close part of that gap for families
specifically, a segment not otherwise served by any current pack.

**Why not already ingested:** genuinely never scoped — no `school`/`fldoe`/`greatschool` string
anywhere in `cadence_registry.yaml` or the checks ledger. **Rough effort read:** FL DOE publishes
school grades as downloadable files per accountability cycle (annual) — likely one of our cheaper new
sources to stand up (annual cadence, structured downloads, no bot-wall expected on a `.gov` static-file
host) — but school-to-ZIP is not 1:1 (boundaries, not ZIPs), so the join work is the real cost, not
the fetch.

### Candidate 3 — Redfin U.S. Migration Patterns (existing vendor, unpulled product line)

**Source:** `https://www.redfin.com/news/data-center/migration-patterns/` — crawl4ai-verified live
this session: "U.S. Migration Patterns — See where U.S. residents are moving to and leaving," updated
**quarterly**. This is not a new vendor — we already ingest Redfin (`redfin_swfl`, `redfin_price_drops`,
`redfin_contract_cancellations`, `redfin_delistings_relistings`, `redfin_collier`, `redfin_lee`,
`redfin_city_swfl`) — but `cadence_registry.yaml`'s own comment on the `redfin_swfl` entry (line 291)
already flags this exact product as unpulled: *"separate metro-grain-only products: quarterly
migration flows, investor home purchases, Redfin Home Price Index."* This session's live crawl4ai
fetch confirms the product still exists and is still live at that URL — the registry comment wasn't
stale.

**Reddit corroboration:** the volume itself, not a single quote — every r/AskFlorida relocation
thread pulled this session ("Moving back to FL," "Relocating to Ft Myers Florida," "Moving to FL from
TX," "Help moving from RI/MA to FL," "Relocating to the Gulf Coast") is a real person asking "where
should I move and why," which is precisely the question Redfin's own migration-flow product is built
to answer at metro grain. No single commenter named the Redfin product directly this session — flag
this as directional demand evidence, not a named-source citation, the honest distinction the existing
research files in this folder already draw (see round-1 §1 item 21's "directional, no longer a
zero-research guess" framing).

**Why not already ingested:** same vendor relationship already exists (lower marginal ingest cost than
a brand-new vendor) — simply never prioritized once the ZIP/county-grain Redfin products were built
out. **Rough effort read:** cheapest of the three candidates — same `steadyapi`/Redfin fetch
infrastructure already exists; the work is a new resource in the existing pipeline dir plus a new
Tier-2 table, not a new crawl4ai target or a new vendor relationship.

### Searched, empty or too weak to cite

- `/v1/reddit/search` for `"GitHub Actions blocked Cloudflare datacenter IP"` returned a site-wide-
  ranked, topically unrelated top result (a self-hosted-AI-agent deployment guide) — the same
  generic-`/search`-is-unreliable-for-scoped-mining finding the existing vendor note already
  documents (07/08/2026 entry), reconfirmed rather than newly discovered.
- IRS SOI County-to-County Migration data (irs.gov/statistics/soi-tax-stats-migration-data) was
  considered as a fourth candidate but **not crawl4ai-verified or Reddit-cited this session** —
  no fetched thread named it directly (unlike Redfin's product, which the registry itself already
  flags as real and unpulled). Flagging as a lead for a future session, not writing it down as a
  verified candidate per this session's own rule.
- Naples_FL/FortMyers/CapeCoral `hot`/`top` browsing (8 calls) surfaced mostly local day-to-day
  threads (crime jokes, church recommendations, dentist recommendations) — low yield for source
  discovery specifically; the professional/relocation-focused subreddits (r/AskFlorida, r/RealEstate)
  outperformed the hyperlocal ones for this particular question, the inverse of what worked for the
  snowbird-pain research in round 3.

---

## Next steps

1. Both `source_totals_migration_apply` and `noaa_ghcn_missing_station_masked_by_floor` are still
   open, unexplained checks — Tactic 1/2 above are preventive for the *next* incident in this class,
   not a diagnosis of these two live ones. Separate work.
2. If Tactic 1 (deadline/heartbeat alerting) gets built, `leepa-parcels-annual` is the obvious first
   pipeline to wire it to — it has the cleanest, most-repeated evidence (5/5 GHA runs, always killed
   at ~100% of ceiling) of any pipeline in the fleet.
3. Candidate 3 (Redfin migration) is the cheapest of the three Part B candidates to prototype —
   same vendor, same fetch infra, `cadence_registry.yaml` already names the exact product. Candidates
   1 and 2 need a real probe-first pass (per §0.1) before any commitment — neither has a confirmed
   clean API shape yet, only a confirmed-real page.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2 | `ingest/cadence_registry.yaml` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
