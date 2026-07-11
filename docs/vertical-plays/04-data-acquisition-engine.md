# Hard-data acquisition — the landscape + a system to bring it in

**07/10/2026.** Operator question: *how many people push hard to find/source hard-to-get, high-value
data into public repos, and what would a system to bring that in look like?* Two halves below — the
outside landscape (how contested is this edge) and the system design (grounded in what we already run).

## The short answer up front

Aggressive data-liberation *skill* is not rare — there's a whole ecosystem (data journalists, FOIA
requesters, civic-tech, open-dataset repos). But it is almost entirely pointed at **national, civic, and
journalistic** targets. **Hyperlocal, commercial, monetizable SWFL data is thin ground** — few are
liberating Lee/Collier permits, licensee rosters, or CRE numbers *and* building a product on top. So the
edge is NOT the scraping skill (common); it's **local focus × a build/monetize stack × the discipline to
land messy data safely.** We already have most of that. The missing piece is a *systematic front-end* for
discovery + acquisition; today that runs ad hoc.

## What we already run (the system is half-built)

Grounded in the repo, not aspiration:

- **~65 ingest pipelines** (`ingest/pipelines/**`, dlt + DuckDB) across government APIs (Census, BLS,
  FRED, FHFA, FEMA, NOAA, USGS, FDOT, FDLE, FL DOR, DBPR), scraped portals (LeePA + Collier parcels,
  Lee/Collier permits via Accela, Redfin/Crexi/Brevitas listings), and PDF extraction (`marketbeat_pdf`).
- **crawl4ai** as the standing scrape/extract tool (the ONLY web-crawl tool).
- **A discovery sweep discipline** — e.g. `docs/data-sources/data-sources-discovery-2026-06-13.md`: 18
  searches + 5 deep scrapes, 22+ sources mapped by **friction tier** with exact URLs, formats, coverage,
  and build path. This is our source-hunting playbook — but it's a **one-time manual sweep**, not a
  recurring engine.
- **Operation Dumbo Drop (ODD)** — the discipline that lets *un-auto-ingestable* data (rotating-URL PDFs,
  paywalled reports, manual portals, hand-keyed sheets) land without breaking the nightly rebuild:
  empty-tolerant consumer, parked cadence entry, Tier-1 cold layer first, `source_tag` provenance,
  idempotent merge. This is our safe-landing back-end and it's genuinely good.
- **A records-request lane, ad hoc** — Chapter 119 (FL public records) is already how we plan to get
  DBPR realtor emails and the FL DOR Collier assessment roll. But it's a manual, per-source action, not a
  tracked pipeline.
- **Four-lane sourcing + tier gates** — our data → upload → named web → user figure; Tier-1 cold →
  Tier-2 brain-first gate so a raw drop can't silently change a live answer.

**So the gap is specific:** discovery and acquisition are *ad hoc* (a human runs a sweep, files a request,
writes a scraper). Landing is systematic (ODD). Pushing "harder" means systematizing the **front** of the
funnel — continuous discovery, a records-request pipeline, and friction-tier triage — feeding the safe
landing we already have.

## The landscape — how contested is this edge?

Researched live 07/10/2026 (crawl4ai on each org's own page; figures cited, not estimated). "How many
people" has no single number, but the ecosystem has measurable anchors:

- **FOIA / public-records liberation.** MuckRock is the anchor — its request browser shows **119,515
  total public-records requests** filed through the system, self-describes as "hundreds of thousands of
  pages of original government materials," runs DocumentCloud + FOIA Machine, 15+ years old
  (muckrock.com). The **Data Liberation Project** (Jeremy Singer-Vine, now run by MuckRock + Big Local
  News since Sept 2024) runs an explicit 7-step pipeline — identify → obtain → reformat → clean →
  document → disseminate — "obtain" via **FOIA, lawsuit intervention, web-scraping, and document
  parsing**, powered by ~35 named volunteers, and ships the pdfplumber PDF-extraction tool
  (data-liberation-project.org). NFOIC is the state-level FOI advocacy/legal backbone, not a publisher.
- **Data journalism.** IRE (Investigative Reporters and Editors) reported **4,946 members** (Oct 2024);
  its NICAR program has, since 1989, institutionalized "acquiring, cleaning and analyzing" government
  data plus the NICAR-L community (ire.org).
- **Civic tech / open-gov.** Open States → Plural is "the biggest collection of open legislative data"
  (bulk + API); OpenCorporates is "the world's largest open legal-entity database," 140+ jurisdictions,
  used by 2000+ companies, founded 2010 (pluralpolicy.com, opencorporates.com); Code for America's
  Brigade network historically scraped/opened municipal data; **data.gov catalogs 545,481 datasets** —
  the "official" ceiling the liberation crowd works around (catalog.data.gov).
- **ML / open-dataset repos (republish-everything culture).** Hugging Face: **500k+ datasets**, 50,000+
  orgs, free public hosting (huggingface.co); Academic Torrents: **298 TB** of research data via
  BitTorrent (academictorrents.com); Kaggle + data.world are the other mass hubs (Kaggle's own counts
  were bot-walled — no figure cited rather than invent one).
- **Solo liberators** are a diffuse *practice*, not an org — no census exists; the craft shows up as the
  named-volunteer corps and the individual open-source tooling (pdfplumber) above.

**Verdict — both, and the split is exactly our opening.** Data-liberation is a **crowded, mature,
well-tooled practice at the national / statewide / institutional layer** (federal FOIA, national
datasets, company registries, legislative data, ML corpora) — staffed by nonprofits, a ~5,000-member
journalism guild, and 50k+ HF orgs; if your target is "national company data," you're one of thousands.
But it is **thin-to-empty at the hyperlocal *commercial* grain** — county-level SWFL permits, licensee
rosters, CRE leases, business economics at ZIP resolution. None of these players operate there: MuckRock/
DLP chase federal datasets of broad public interest; OpenCorporates does registration not local property
economics; the ML repos republish whatever's already scrapeable. Hyperlocal commercial data sits behind
county portals, PDFs, and paywalled sources — individually low-glory, collectively huge. **The methods
are a commodity; the target is a rare, uncontested lane.** That is precisely where we already operate.

**The crowd's proven pipeline shape validates our design.** DLP's identify → obtain (FOIA/scrape/bulk) →
PDF-parse → clean → document-with-provenance → publish-redundantly is the same shape as the engine below
— we'd point it at the lane they skip. Their signature hard-data tool (pdfplumber) is one we can adopt
directly for the PDF/manual tier.

## The system to bring it in — a "hard-data acquisition engine"

Bolt a systematic front-end onto the ODD back-end we already have. Five components:

1. **Discovery radar (continuous, not one-shot).** Turn the manual discovery sweep into a recurring
   pass: a scheduled crawl4ai + search sweep over candidate sources (agency portals, open-data
   catalogs, new government datasets, broker/report publishers) that emits new-source candidates with
   friction tier, URL, format, coverage, and a proposed build path — appended to a living source
   registry. What the 06/13 sweep did by hand, run on a cadence.

2. **Friction-tier triage (already the right frame).** Every candidate scored: Tier 1 free bulk
   download (auto-ingest) → Tier 2 friction (scrape/portal) → Tier 3 PDF/manual (ODD) → Tier 4 paywall
   (buy vs. proxy) → Tier 5 records-request-only. The tier decides the acquisition path; don't
   re-invent per source.

3. **Records-request pipeline (the missing lane).** Systematize Chapter 119 / FOIA: a tracked queue of
   requests (target agency, dataset, statute basis, portal, filed date, status, cost, received file),
   so "the hard data behind a request" becomes a managed asset, not a one-off favor. This is the single
   highest-leverage new piece — it's how the *genuinely* hard, non-public-download data (full assessment
   rolls, licensee emails, agency micro-data) actually comes in.

4. **Acquisition adapters (extend, don't multiply).** Reuse the existing dlt/DuckDB + crawl4ai +
   PDF-extract adapters; a new source picks the adapter its tier implies. No new engine per source.

5. **Safe landing = ODD (already built).** Everything lands via the ODD seams — empty-tolerant consumer,
   parked cadence, Tier-1 cold, `source_tag` provenance, idempotent merge — so nothing a discovery pass
   finds can break the nightly or contaminate clean signal.

**Design posture:** this adds NO new mandatory materialization gate (RULE 3 C2) — it extends discovery +
records-request in front of the ODD seams we already enforce. The engine's output is a *ranked queue of
acquirable high-value sources*, each with a tier and a path; a human (or a scheduled job) works the queue.

## Where the real edge is (the honest verdict)

The moat is not "we can scrape." Lots of people can. The moat is the **combination**: hyperlocal SWFL
focus (thin competition) + a records-request lane for the truly-hard data + the ODD safe-landing
discipline + a build/monetize stack that turns a liberated dataset into a cited product the same week.
Pushing "harder" means turning the ad-hoc front-end (sweeps, requests) into a standing engine — the back
half is already ours.

## Open decision for the operator

- Build the **records-request pipeline** first (highest-leverage missing lane), or the **continuous
  discovery radar** first (widest net)? My lean: records-request lane — it's how the data nobody can just
  download comes in, and it compounds.
- Do we want this as a real build (new-build + spec) or does the ad-hoc sweep-when-needed stay good
  enough until a specific hard target justifies the engine?
