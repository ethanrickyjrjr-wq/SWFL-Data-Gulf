# Data access and measurable outcomes — September 18, 2026

Purpose: support an initial Terra/Sol plan without assuming that desirable data or future outcome labels can actually be obtained. Companion: [implementation proposal](../../docs/superpowers/plans/2026-09-18-data-first-intelligence-rebuild.md). Baseline: [project assessment](../../reports/analysis/2026-09-18-strategic-project-assessment.md).

## How commercial companies obtain difficult data

These are the providers' descriptions of their sourcing, not independent endorsements of their accuracy or proof of local coverage.

- **Spending:** Facteus describes transaction panels sourced directly from banks and financial institutions, anonymized at source and modeled/scaled for representation. This is access through commercial relationships, not a hidden free webpage. It does not prove a sample covers a particular SWFL merchant. [Provider source](https://facteus.com/).
- **Visitation:** Placer describes mobile-data providers and a device panel used to estimate visits. Its glossary explicitly describes visitors as extrapolated from the panel. An estimate for a place is not a door-counter census. [Sourcing](https://www.placer.ai/anchor/about-the-anchor), [definitions](https://docs.placer.ai/reference/glossary), [API](https://www.placer.ai/products/api).
- **Road movement:** INRIX describes agreements for connected-vehicle, mobile-device, and shared-mobility data. Probe trajectories, speeds, counted vehicles, and truck payloads are different measurements. [Provider source](https://inrix.com/blog/new-oem-vehicle-data/).
- **Our implication:** use public administrative series where they answer the question, preserve longitudinal snapshots, and pursue a narrowly specified licensed feed or participating-business export only if it unlocks a valuable missing measurement. No commercial account, quote, local panel sample, price, or redistribution entitlement was obtained in this research.

## Live access probes

Public website discovery used the repository's pinned crawl4ai installation, headless browser, cache bypass. Downloads used HTTP GET and in-memory parsing. No lake writes, paid calls, contacts, subscriptions, or scheduled jobs were performed. A successful fetch today is one access observation, not an uptime guarantee.

### RSW aviation: more recent data exists and the parser works

The [LCPA report index](https://www.flylcpa.com/about-lcpa/reports-and-statistics/) returned HTTP 200 and linked July 2026 passenger, freight, and operations PDFs on `www.flylcpa.com/app/uploads/2026/08/`.

The [July passenger PDF](https://www.flylcpa.com/app/uploads/2026/08/Total-Passengers-July-2026.pdf) returned HTTP 200, 136,841 bytes. Calling the existing pure `parse_pdf()` from `ingest/pipelines/rsw_airport_monthly/pipeline.py` produced **519 monthly passenger rows, May 1983 through July 2026**, without any database write.

The preceding assessment found production passenger data ending April 2026. Current URL discovery is restricted to the older `s3.wasabisys.com` host and falls back to fixed historical URLs (`pipeline.py:60`, `:155`). This is a demonstrated collection/discovery gap, not evidence that the publisher lacks more recent data. Freight and operations links were discovered; their newer PDFs were not parsed in this pass.

Qualification remaining: continuous-history profile, revisions and publication lag, totals reconciled to the PDF, zero/blank interpretation, next-release discovery, retention of original bytes and hashes. Passenger movements are not unique visitors or local retail customers.

### Census Building Permits Survey: official county history is accessible

The [county directory](https://www2.census.gov/econ/bps/County/) returned HTTP 200. Two actual text files also returned 200:

- [January 2010](https://www2.census.gov/econ/bps/County/co1001c.txt): 91,632 bytes, Florida FIPS 12 with Collier 021 and Lee 071 rows.
- [July 2026](https://www2.census.gov/econ/bps/County/co2607c.txt): 422,033 bytes, both Florida county rows present. The directory listed July as its latest monthly file in this probe.

These are two sampled endpoints, not proof of uninterrupted coverage between them. Use FIPS, not county name; other states also have Lee counties. Headers distinguish buildings, units, valuation, structure sizes, and reported quantities. Do not double-count estimated totals plus reported subtotals, or current-month plus year-to-date files.

BPS measures residential authorizations, not commercial store permits, construction starts, completions, or opening dates. Its methodology includes nonresponse estimation and revision. This is a valuable aggregate construction source with a different meaning from the local permit ledger. [Program](https://www.census.gov/construction/bps/index.html), [methodology](https://www.census.gov/construction/bps/methodology.html).

This opportunity was already recorded in `ingest/cadence_registry.yaml:713`; it was not a newly discovered capability in principle.

### Florida taxable sales: usable archive, unresolved current feed

The [2024–2025 workbook](https://floridarevenue.com/dataPortal/GTA/Form%2010/All%20Taxable%20Sales/F10_txsales_cy2425.xlsx) returned HTTP 200, 1,207,050 bytes, and opened with openpyxl. Lee and Collier sheets contain monthly columns through December 2025 with populated numeric cells.

The same naming pattern for `F10_txsales_cy2627.xlsx` returned **404**. The agency's [data portal](https://www.floridarevenue.com/dataPortal/Pages/otr2.aspx) returned 200 but its linked [preliminary current workbook](https://www.floridarevenue.com/taxes/tables/f10_current.xlsx) also returned **404**.

This establishes two broken/unavailable candidate update URLs. It does not establish that no 2026 data exists elsewhere. Do not make current sector taxable sales the first forecast target until a current publication route and release behavior are demonstrated. Retain the existing long history for retrospective comparison, with explicit limitations about publication vintages. Taxable sales is not total consumer expenditure; tax collections is a different quantity again.

### FDOT: published opportunity, local continuous coverage still unproven

The [official traffic page](https://www.fdot.gov/statistics/trafficinfo/default.shtm) returned 200. It describes continuous monitoring and shorter-duration studies, links historical count data and daily-volume archives, and explains annual publication. The archive route points into `ftp.fdot.gov`; the page tells download users to use Guest access.

No Lee/Collier continuous-counter file was downloaded and reconciled in this pass. Station locations, active periods, gaps, vehicle classes, accessible daily history, and unattended access remain qualification tasks. Existing annual AADT is background evidence; it cannot stand in for weekly counted vehicles. The proposed first corridor study is conditional on this qualification.

### DBPR food-service licenses: usable current snapshot, not opening history

[District 7 license CSV](https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood7.csv) returned HTTP 200, 2,517,762 bytes. CSV parsing found 7,997 rows including the header. The [public records page](https://www2.myfloridalicense.com/hotels-restaurants/public-records/) returned 200 and linked recent weekly emergency-closure extracts.

A provisional broad county-cell match was not used as a coverage claim; production filtering must use the actual location-county field. A current active-license snapshot is not proof of opening dates, all operating businesses, or historical births/deaths. Repeated snapshots can support future status-change detection, with administrative changes distinguished from actual openings.

### Employment by sector: documented, not freshly downloaded here

BLS publishes historical QCEW area/industry files. This is a candidate for construction, retail, accommodation/food, and transportation context, subject to suppression, revisions, publication lag, and exact local sample checks. The existing all-industry two-quarter slice is insufficient for that purpose. [Official files](https://www.bls.gov/cew/downloadable-data-files.htm).

## Operational conclusions

### Existing hardware and local execution — follow-up checks

Read-only commands on September 18, while preparing the Terra/Sol builds:

- `Get-CimInstance Win32_ComputerSystem`, `Get-Volume`, and `Get-PSDrive`: current Windows machine reported 34,181,947,392 bytes RAM and roughly 736 GB free on its C: volume. GPU name is RTX 4060 Ti; the WMI AdapterRAM value is not used as a reliable VRAM capacity claim.
- `ollama list`: installed local models include qwen3.6:35b-a3b, UserLM-8b, hermes3:8b, gpt-oss:20b and gemma4:12b. No inference benchmark, model download or inference call was made. Installed does not prove throughput or that an agent is configured to use it.
- `ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=yes fedora uname -a`: succeeded, reporting Fedora x86_64. `free -b` reported 16,348,405,760 bytes RAM; `df -B1 /home` reported 484,629,897,216 available bytes. `lsblk` showed a roughly 512 GB primary disk, not the described separate 1 TB SSD. The Windows inspected volumes also did not identify that SSD. Torrent/Spectre name mapping remains unverified.
- Fedora's running user services included `scout-a2a.service`. That establishes a running service, not its provider, free-inference status, privileges or production readiness.
- The installed `C:/Users/ethan/AppData/Local/hermes/hermes-agent/tools/cronjob_tools.py` implements `no_agent` script jobs (creation branch around line 1068). This is code evidence of script-only scheduling capability, not evidence that any new job was configured or run.

**Operator clarification after these probes:** Spectre is the always-on Fedora box. qBittorrent is on this Windows computer ("torrent" did not name a computer). The operator will attach the 1 TB **SD card** to Spectre; that explains its absence in the inspected disks. Attachment, stable mount identity, write/recovery behavior and backup remain to be verified before scheduled use.

No disks were mounted/formatted/moved, services changed, models invoked, provider credentials printed, or remote files written. Prior statements that Fedora was inaccessible were environment-specific, not a permanent blocker. Use bounded local research storage first; validate the card mount and a second recoverable copy before claiming durability. Execution briefs: [Terra](../../docs/superpowers/handoffs/2026-09-18-terra-free-data-builds.md), [Sol](../../docs/superpowers/handoffs/2026-09-18-sol-evidence-builds.md).

### Source handling

1. Classify sources separately as documented, fetched, parsed, locally sufficient, and proven repeatable. None of today's probes completes all five stages.
2. Rank free bulk/API data first; a stable XLSX or PDF can still be worthwhile when discovery, parsing, and period checks are deterministic. Avoid declaring every PDF unusable or every API reliable.
3. Stop repeated blind scraping attempts after a bounded probe. An exact alternative release, an existing purchased feed, or a repeatable authorized manual import may be appropriate. A manual path has a real operating burden and must not be labeled autonomous.
4. A target can be useful for historical explanation without being suitable for live forecast scoring. Track those capabilities separately.
5. A missing or revised measurement must never become a fabricated zero or an automatic forecast failure. Fix the measurement policy before launching the prediction.
