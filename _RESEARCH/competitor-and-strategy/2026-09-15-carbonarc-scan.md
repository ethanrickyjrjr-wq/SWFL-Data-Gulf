# Carbon Arc — live scan, 09/15/2026

Operator handed four URLs and asked "what can we learn from this," explicitly widened past real
estate: mine it for website/product ideas, then sort by SWFL-hyper-focused-now vs grow-later.
Carbon Arc is an alternative-data vendor (consumer card-transaction panels, workforce data, etc.)
selling access three ways: a marketing site, a natural-language "Lenses"/MCP layer, and an
enterprise bulk-delivery product (Block). Not a real-estate company — the value here is entirely
in HOW they package, price, and distribute data, which is our exact business shape at a different
volume and vertical.

**Live-crawled 09/15/2026 (crawl4ai, pinned venv, RULE 0.4). Sources, in order fetched:**

1. `https://www.carbonarc.co/research` — plain tier, 200, broke through (not bot-blocked). Content
   list itself is client-rendered and never resolved past "Loading…" in either the plain or
   `--probe --all-tiers` pass, but the taxonomy chrome is real: **All / Sector Spotlight / Economic
   Spotlight / Company Spotlight / Monthly Reports / Consumer / Sports & Entertainment / Prediction
   Markets.**
2. `https://www.carbonarc.co/prisms` — full body read. **Prisms** = daily-published reference
   indices computed from their own panels. Two shapes only, both **relative, never absolute**: a
   growth index (100 = same period one year ago) or a share-of-a-stated-group (sums to 100%). "No
   dollar, visit, or download counts are published." Publicly viewable behind a Prisms-specific
   Terms of Use click-through, not a login.
3. `https://www.carbonarc.co/how-it-works` — full body read. Two access surfaces pitched side by
   side: **Lenses** ("just ask" — natural-language chat native to their platform) and **MCP
   Integration** ("connect Carbon Arc's MCP Server to your Claude, ChatGPT, or Perplexity account").
   The demo answer pattern: a ranked table (retailer / card spend / market share) followed by
   numbered "What this means" callouts, explicitly marked *"Examples are hypotheticals … do not
   depict real data."*
4. `https://www.carbonarc.co/explore-data` — full body read. Data catalog filtered by sector
   (**Consumer Spending, Media & Online Activity, Companies & Jobs, Financials & Economy,
   Healthcare, Industrial Activity, Supply Chain & Trade, People & Places**). Headline stat strip:
   "9m gigabytes of data assets / 300+ proprietary data assets / 8 business sectors covered / Daily
   information updates." Self-serve **Builder** tool: "Create an account and use our Builder tool to
   pull any of Carbon Arc's information for yourself."
5. `https://www.carbonarc.co/pricing` — full body read, `--probe` confirmed plain-tier (not
   bot-gated, first fetch just returned empty and needed a re-run). Three tiers:
   - **Professional $20/mo** — 1 seat, standard MCP Server context, 50 promo tokens/mo, proprietary
     data assets billed on consumption on top, SDK + web app + MCP Server access, download/export.
   - **Business $200/mo** — unlimited seats, more MCP context, 500 promo tokens, proprietary MCP
     tools ("equity research, demand management, and more"), exclusive research content, premium
     support.
   - **Enterprise — custom** — compliance support, row-level access controls, dedicated account
     manager, same-day support.
6. `https://api.carbonarc.co/` — confirmed to exist as their programmatic API surface (referenced
   from the Framework-pricing doc as `api.carbonarc.co/#tag/Framework/...`, i.e. an OpenAPI/Redoc-
   style reference). **Contents not read**: plain/stealth/undetected/undetected+stealth all
   returned the literal 12-byte string `Loading …` — a JS-rendered spec viewer that never resolves
   under crawl4ai's headless render, not a bot wall (`--probe --all-tiers` still reported "blocked,"
   but the payload is a real empty shell, not a 403/challenge page). Record as: real API surface,
   full body not read.
7. `https://docs.carbonarc.ai/` — full body read. Docusaurus site: **Platform / Reference /
   Developers / Tutorials**. Featured on the landing page: "NEW MCP Integration," "NEW Rate Limits"
   (org-level limits across UI/SDK/API), and versioned release notes (**v4.26, shipped
   09/10/2026** — they run a numbered release train).
8. `https://docs.carbonarc.ai/platform/mcp/carbonarc-mcp` — full body read, plus the full left-nav
   tree (used below to enumerate every Platform-section product without guessing at contents I
   didn't fetch).

**Follow-up pages fetched to replace guesses with real content** (same domain, same day):

- `https://docs.carbonarc.ai/platform/tribes/tribes-overview` — full body read. **Tribes** = an
  audience-affinity analytics product. You define a "Tribe" (today: generation only — Gen Z/
  Millennial/Gen X/Boomer; gender/income "coming soon") and a "Focus" (a brand or category), and it
  scores **Brand Affinity** via NPMI (normalized pointwise mutual information — 0 = chance,
  positive = over-indexes, negative = under-indexes) plus a **Δ against the baseline customer**
  (separates "this audience skews here" from "this brand is just popular"), and **Overlap** (raw
  co-shopping rate, more legible than NPMI once an audience is most of a brand's own customer
  base). Two entry points that read the same data: **Views** (full workspace: tiles, tables,
  trends) and a **Tribes persona in Lenses** (quick NL read that hands off into Views).
- `https://docs.carbonarc.ai/platform/block/block-overview` — full body read. **Block** = Enterprise-
  only bulk data delivery. Workflow: browse a dataset's **tearsheet + data dictionary**, run a
  **1,000-row SQL sample** against lagged data to check structure/coverage before you commit, get
  approved into an **evaluation period** on live data via **Polaris (Iceberg REST catalog) or S3**,
  then convert to a contract on the same delivery path. Platform UI and a Python SDK cover
  different halves of the workflow (SDK can't approve/reject requests or manage credentials;
  platform can't hit production data directly — that's Polaris/S3 only).
- `https://docs.carbonarc.ai/platform/transcripts/transcripts-web-app` — full body read.
  **Transcripts** = a searchable, purchasable library of full-length expert interviews (former
  operators, supply-chain leads, etc.), each tagged with entities/tickers/themes, filterable by
  region/type/interview date, anonymized-expert compliance boilerplate on every one. An
  expert-network/GLG-style content product, unrelated to their data pipelines.
- `https://docs.carbonarc.ai/platform/events/events-guide` — full body read. **Events (Beta)** adds
  a third composition axis to their query builder: **Entity (who) × Insight (what) × Event
  (when)** — e.g. "How did Starbucks' credit card spend change around earnings?" instead of just
  "What was Starbucks' credit card spend?" Confirms what the sidebar calls **Frameworks**/**Builder**
  is a structured three-part query composer, not a raw NL box — Lenses/MCP sits on top of it as a
  conversational front end, not a replacement for it.
- `https://docs.carbonarc.ai/platform/consumption-pricing/framework-pricing` — full body read.
  Structured (Builder/API/SDK) queries are priced **before you buy** — the API response itself
  carries a `price` field per framework combination — and **repurchasing an identical
  configuration costs zero tokens**; only a changed filter (date range, geography, …) reprices.
- `https://docs.carbonarc.ai/platform/consumption-pricing/mcp-pricing` — full body read. MCP/Lenses
  (natural-language) queries run on a *different* metering model: two token types (Daily, Primary),
  cost is driven by **output size, not input prompt**, cost **cannot be predicted before running**
  the query, and — unlike Framework repurchasing — **you cannot re-run an identical MCP query for
  free**, ever. A failed/timed-out query is not supposed to consume tokens.

**Not fetched, named in nav only — do not treat as read:** `core-builder`, `core-frameworks`
(bodies), `delivery-options/*`, `reference-docs`, `developers-docs`, `release-notes` detail,
`rate-limits` body, `mcp-tools` detail, the Excel/PowerPoint plugin setup pages, and every
per-client MCP setup guide (Claude/ChatGPT/Codex/Perplexity) beyond their existence in the nav
tree above.

---

## What this actually validates, at OUR volume (RULE 11)

Carbon Arc's core wedge — structured, deterministic query pricing (Frameworks) kept separate from
opaque, non-idempotent LLM-query pricing (MCP tokens) — is the same split we already run
([[project_the-real-goal-deliverable-factory]] / the deterministic-math-vs-narrative-prose rule in
`docs/ontology-and-roadmap.md` §1). Their **MCP Server as a first-class, priced, per-tier product**
(not a side integration) is the strongest signal in the whole scan: a funded competitor treats
"plug into Claude/ChatGPT" as sellable infrastructure, at the exact moment our own session hit a
`swfl` MCP 429 this same day ("Monthly free limit reached, 15 keyless requests/month… connect an
account for unlimited access") — i.e. the metering half of that story is already half-built here
and un-costed on our side.

Their consumer-panel-specific products (**Tribes**' NPMI audience scoring, **Transcripts**' expert
interviews, **Block**'s enterprise bulk-delivery pipeline) require data or customer classes we do
not have (a national card-transaction panel, an expert network, enterprise data-license buyers) and
are NOT stealable as literal features — noted for completeness, not queued.

Full idea breakdown, sorted into now vs later: `_AUDIT_AND_ROADMAP/potential-website-additions.md`.

**Verdict: STEAL THE SHAPE, not the vendor.** Nothing here is a dependency, install, or adoption
question (this scan is idea-mining, not the "should we install X" NORTH STAR #5 freeze) — the
carry-over is four packaging/positioning patterns, filed in the backlog above.
