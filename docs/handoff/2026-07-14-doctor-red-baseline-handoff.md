# Doctor red baseline — remaining 4 (07/14/2026)

**Context:** the daily freshness probe (`freshness-probe-daily.yml`) gates on `doctor --fail-on
red` (operator-approved 07/12). It flipped loud against 17 pre-existing reds nobody had cleared
first. Same session, 07/14: worked it down to these 4 — everything else (3 zombie crons, a
`RunBudget` retrofit, 4 never-run workflows, a logging bug that looked like a timeout) is fixed
and live on `main` (commit `e6490b03`). `parcel_subdivision` / `neighborhood_stats` cleared on
their own via another session's build.

Checks already open for all 4 below — this doc is the narrative, `checks` is the tracker. Cadence
note up front since it came up: none of these 4 are daily, so none needed a night-schedule fix.
`brevitas_listings` + `crexi_listings` are weekly (Sun 11:00/12:00 UTC), `noaa_ghcn_rainfall` is
monthly (day 5, 14:00 UTC) — all three already sit inside the documented 11:00–14:00 UTC stagger
band (`docs/standards/pipeline-freshness.md` §3). `listing_lifecycle`'s daily cadence lives in
`nightly-chain.yml` (04:23 UTC = 12:23 AM ET), the genuine overnight slot — already correct,
nothing to move.

---

## 1. brevitas_listings + crexi_listings — likely the SAME root cause, don't fix in isolation

Both are CRE listing scrapers, both run via crawl4ai, both started getting blocked within days of
each other. Check that shared cause BEFORE treating these as two separate incidents.

**brevitas_listings** — 3 straight weekly failures, all identical:
`HTTP Error 403: Forbidden` on every target city (Estero FL, Fort Myers Beach FL, ...), 0 listing
blocks extracted. Runs: 29194955416 (07/12), 28743175614 (07/05), 28324782214 (06/28). Doctor
calls this TRANSIENT (1 consecutive failure per its window) — that's WRONG; the real history is 3
in a row. Check `cron_incident_ingest_brevitas_listings` already tracks the incident;
`brevitas_lease_only_hardcoded` is a SEPARATE, unrelated scope gap (for-sale listings never
queried at all) — don't conflate the two.

**crexi_listings** — healthier but same failure mode just showed up: succeeded 06/28 and 07/05,
then failed 07/12 with `Blocked by anti-bot protection: Cloudflare JS challenge` on
`crexi.com/lease` for every city (run 29191537886). `crexi_lease_only_hardcoded` is the same class
of separate scope gap as brevitas's (for-sale Crexi listings, Cloudflare-gated, never queried).

**The connection worth checking first:** both vendors started blocking within the same
~2-week window (brevitas since 06/28, crexi's first failure 07/12) using crawl4ai from GitHub
Actions runners. That's consistent with a shared cause — GitHub's datacenter IP ranges getting
reputation-flagged by Cloudflare (crexi names Cloudflare explicitly; brevitas's plain 403 could be
the same WAF or a site-specific one) — rather than two independent site changes. `dbpr_sirs`
(`ingest/pipelines/dbpr_sirs/qix.py`) already hit this exact class of problem (GH datacenter IPs
silently WAF-blocked) and its fix-in-waiting is a residential proxy via the `CRAWL4AI_PROXY` env
var, wired but unprovisioned. Before touching brevitas/crexi's scraper code: (1) research
crawl4ai's actual anti-detection/proxy options live via crawl4ai per RULE 0.4 — don't assume from
memory what's available; (2) test whether a residential proxy (same `CRAWL4AI_PROXY` secret
`dbpr_sirs` already reads) clears both blocks, which would confirm the shared-cause theory and
fix two pipelines with one purchase instead of two separate scraper rewrites.

---

## 2. noaa_ghcn_rainfall — probably self-resolves, recheck before doing anything

Cron is healthy: 2 clean runs (06/05, 07/05), `run.status=GREEN` both times. Red only because
`landed=6` vs `expected_rows_min=8` (registry comment: "4 anchor stations × 2 complete years
minimum"). Only ~1.5 years have closed out since this pipeline's first run — the floor was set
for a maturity point the data hasn't reached yet, not a broken pipeline.

Check `noaa_ghcn_rainfall_low_volume_baseline` is open. Action: recheck after the next scheduled
run (~08/05/2026). If still under floor after 3+ runs, THEN investigate for real (doctor's own
GAP_SENTINEL prescription suggests checking for a dead vendor key, but two runs with growing
counts and no auth on this endpoint argues against that).

---

## 3. listing_lifecycle — a real pattern, not noise; needs a raw vendor payload, not a contract edit

Content contract `listing_state_home_price_floor` (`ingest/quality/quality_registry.yaml`) is
`policy: report, severity: error` — fails on `list_price < $20,000` for active, for-sale,
`api_feed` listings with sqft populated and a residential `property_type`. 18 rows failing as of
07/14/2026. Spot-checked all 18 (query in the check's evidence, `contract_fail_data-lake-listing-
state_listing_state_home_price_floor`):

- **9 of 18** are `single_family` listings priced at EXACTLY **$5,000** — across 7 different ZIPs
  (33974, 33971, 33966, 33914, 33904, 33972, 33916), unrelated properties. A repeated round number
  across unrelated homes is not market variance — it's a vendor-feed placeholder or an annual-rent
  value leaking into `list_price` for a `sale` record. The contract's own comment already
  documents this exact failure class (`Arbor Trace annual-rate rentals reach $49,000`).
- 6 condos clustered at ZIP 34145, $6k–$9k, 728–855 sqft — plausibly one distressed building, or
  the same leak.
- 2 outliers: $1,800 condo (33908), $10,000 condo (34110, North Naples — real comps there are
  $200k+, almost certainly bad data).

**Do NOT loosen the $20,000 floor to make this go quiet** — the contract's own comment already
says the floor "buys the obvious class, not the tail," meaning some legitimate tail was always
expected to leak through; the $5,000 clustering is NOT that tail, it's a distinct, diagnosable bug.
Next step: pull the raw SteadyAPI payload for one of the 9 $5,000 listings (via
`ingest/pipelines/listing_lifecycle/`) and check what the vendor actually sent in the price field
— confirm or rule out the rent-leak theory before touching any code.

---

## Order I'd do it in

1. crawl4ai research (RULE 0.4) on anti-detection/proxy options — informs both #1 items at once.
2. Raw SteadyAPI payload pull for one $5,000 listing_lifecycle row — cheap, fast, likely closes #3
   or at least confirms the theory.
3. Recheck noaa_ghcn_rainfall after its 08/05 run — no action needed before then.
4. brevitas/crexi scraper fix — depends on what #1 finds; could be one proxy purchase or two
   separate rewrites.
