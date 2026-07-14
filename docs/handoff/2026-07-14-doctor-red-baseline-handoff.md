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

## CORRECTIONS 07/14/2026 (read before trusting Sections 1–3)

Several claims below were caught wrong or stale on 07/14 and fixed in place, so future readers don't
re-derive them. Each is tracked by an open check:

- **Section 1 — "both run via crawl4ai" is FALSE.** Only `crexi_listings` uses crawl4ai
  (`ingest.lib.crawl_client.Crawl4aiSession` + `UndetectedAdapter`, a real browser). `brevitas_listings`
  uses plain `urllib.request` against a JSON API and never imports crawl4ai — so the fix paths
  diverge and "one crawl4ai proxy fixes both" does not follow. Tracked by `brevitas_crexi_fix_path_diverges`.
- **Section 1 — `CRAWL4AI_PROXY` is NOT "wired but unprovisioned."** It has been a live repo secret
  since 2026-06-27, is already wired into both crexi's and brevitas's workflow `env:` blocks, and is
  read by `crawl_client._proxy_from_env()` — the same path `active_listings` runs on. Tracked by
  `brevitas_crexi_fix_path_diverges`.
- **Section 1 — dbpr_sirs's fix framing was backwards.** Its actual applied fix (per
  `dbpr-sirs-monthly.yml`'s own comment) was moving the cron to a self-hosted residential-IP runner,
  with `CRAWL4AI_PROXY` deliberately left UNSET (kept only as a cloud-runner fallback) — not "a
  residential proxy in waiting." That self-hosted-runner path is now STAGED for crexi too, but
  blocked on the runner being offline (see the Part A runbook). Tracked by `brevitas_crexi_fix_path_diverges`.
- **Section 2 — the "probably self-resolves" read is doubtful.** 1 of the 4 anchor stations has ZERO
  landed rows — a real missing-station gap the row-count floor MASKS, not just immature data. Tracked
  by `noaa_ghcn_missing_station_masked_by_floor`.
- **Section 3 — the per-bucket arithmetic was wrong and the total is disputed.** The old "9 / 6 / 2"
  breakdown summed to 17, not 18; the 34145 cluster is 7 rows, not 6; and the true current total is
  itself in question (this doc said 18, the registry comment + check label say 21). Do NOT re-cite a
  number from this doc — `listing_state_home_price_floor_count_discrepancy` is reconciling the
  authoritative count. The diagnosis (the $5,000 round-number cluster = vendor placeholder / rent-leak;
  do NOT loosen the floor) still stands.

---

## 1. brevitas_listings + crexi_listings — likely the SAME root cause, don't fix in isolation

Both are CRE listing scrapers that started getting blocked within days of each other — but they do
NOT share a scraping mechanism (corrected 07/14, see CORRECTIONS above): `crexi_listings` uses
crawl4ai (`ingest.lib.crawl_client.Crawl4aiSession` + `UndetectedAdapter`, a real browser), while
`brevitas_listings` uses plain `urllib.request` against a JSON API and never imports crawl4ai. A
shared *cause* (datacenter-IP reputation) is still plausible, so check that BEFORE treating these as
two separate incidents — but a shared *fix* does not follow (see the dbpr_sirs paragraph below).

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
~2-week window (brevitas since 06/28, crexi's first failure 07/12), both fetched from GitHub Actions
runner IPs (crexi via crawl4ai's browser, brevitas via urllib) — the shared factor is the runner IP,
not the client. That's consistent with a shared cause — GitHub's datacenter IP ranges getting
reputation-flagged by Cloudflare (crexi names Cloudflare explicitly; brevitas's plain 403 could be
the same WAF or a site-specific one) — rather than two independent site changes. `dbpr_sirs`
(`ingest/pipelines/dbpr_sirs/qix.py`) already hit this exact class of problem (GH datacenter IPs
silently WAF-blocked). Its ACTUAL applied fix (per `dbpr-sirs-monthly.yml`'s own comment) was moving
the cron to a self-hosted runner on the operator's residential-IP machine — NOT a residential proxy.
`CRAWL4AI_PROXY` is deliberately left UNSET on that runner, kept only as a cloud-runner fallback.
(Correction 07/14: `CRAWL4AI_PROXY` is not "wired but unprovisioned" — it has been a live repo secret
since 2026-06-27, is already in crexi's and brevitas's workflow `env:` blocks, and is read by
`crawl_client._proxy_from_env()`, the same path `active_listings` runs on.) That same
self-hosted-runner path is now STAGED for crexi — its workflow is flipped to
`runs-on: [self-hosted, swfl-local]` mirroring dbpr_sirs — but blocked on the runner being offline
(re-provision runbook in Part A of this session's handoff; check `brevitas_crexi_fix_path_diverges`).
Before touching brevitas/crexi's scraper code: (1) research crawl4ai's actual anti-detection/proxy
options live via crawl4ai per RULE 0.4 — don't assume from memory what's available; (2) note the fix
paths likely DIVERGE — crexi (crawl4ai + browser) can ride the self-hosted runner like dbpr_sirs,
but brevitas (urllib + JSON API) needs its own remedy (a proxy or its own self-hosted move) since it
shares neither the crawl4ai mechanism nor necessarily the exact block. The "one purchase fixes both"
shortcut is what `brevitas_crexi_fix_path_diverges` exists to stop.

---

## 2. noaa_ghcn_rainfall — probably self-resolves, recheck before doing anything

Cron is healthy: 2 clean runs (06/05, 07/05), `run.status=GREEN` both times. Red only because
`landed=6` vs `expected_rows_min=8` (registry comment: "4 anchor stations × 2 complete years
minimum"). Only ~1.5 years have closed out since this pipeline's first run — the floor was set
for a maturity point the data hasn't reached yet, not a broken pipeline.

**Correction 07/14:** this "probably self-resolves" read is now doubtful and should not be taken at
face value. 1 of the 4 anchor stations has ZERO landed rows — a real missing-station gap that the
row-count floor MASKS: the floor could flip green on the other 3 stations maturing while the dead
station is never noticed. Tracked by `noaa_ghcn_missing_station_masked_by_floor` — confirm all 4
stations are actually landing rows before concluding maturity alone closes this.

Check `noaa_ghcn_rainfall_low_volume_baseline` is open. Action: recheck after the next scheduled
run (~08/05/2026). If still under floor after 3+ runs, THEN investigate for real (doctor's own
GAP_SENTINEL prescription suggests checking for a dead vendor key, but two runs with growing
counts and no auth on this endpoint argues against that).

---

## 3. listing_lifecycle — a real pattern, not noise; needs a raw vendor payload, not a contract edit

Content contract `listing_state_home_price_floor` (`ingest/quality/quality_registry.yaml`) is
`policy: report, severity: error` — fails on `list_price < $20,000` for active, for-sale,
`api_feed` listings with sqft populated and a residential `property_type`.

**Count corrected 07/14 — do not re-cite a number from this doc.** The earlier per-bucket breakdown
here (a "9 / 6 / 2" split, with the 34145 cluster called 6 rows) was arithmetically wrong: it summed
to 17, not 18, and a live re-query shows the 34145 cluster is 7 rows, not 6. The true current total
is itself disputed — this doc said 18, the registry comment + check label say 21.
`listing_state_home_price_floor_count_discrepancy` is reconciling the authoritative count; read it
for the current figure instead of trusting a number frozen into this handoff. The evidence query
lives in the check `contract_fail_data-lake-listing-state_listing_state_home_price_floor`.

**The diagnosis stands, independent of the exact count:**
- The dominant class is `single_family` listings priced at EXACTLY **$5,000** across several
  unrelated ZIPs (33974, 33971, 33966, 33914, 33904, 33972, 33916). A repeated round number across
  unrelated homes is not market variance — it's a vendor-feed placeholder or an annual-rent value
  leaking into `list_price` for a `sale` record. The contract's own comment already documents this
  exact failure class (`Arbor Trace annual-rate rentals reach $49,000`).
- A cluster of condos at ZIP 34145 ($6k–$9k, 728–855 sqft) — plausibly one distressed building, or
  the same leak.
- A few true outliers (e.g. a $1,800 condo in 33908, a $10,000 condo in 34110 North Naples where
  real comps are $200k+ — almost certainly bad data).

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
