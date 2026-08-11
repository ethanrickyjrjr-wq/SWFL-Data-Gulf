# RESEARCH INDEX — check here BEFORE crawl4ai, and BEFORE answering

**GITIGNORED. Nothing in `_RESEARCH/` ever ships to GitHub.** Consolidated 07/20/2026 by
operator decree — one folder, categorized, untracked. Write freely; none of it is public.

**This is the first stop for any outside-answer question.** We already paid for this research
and it was going unread. Reading it costs nothing; re-deriving it wastes a session and produces
a worse answer than the one already on disk.

Order of operations (RULE 0.4):
1. **Read this index.** Scan categories + filenames. Open anything plausibly relevant.
2. **Not here?** → crawl4ai the live source.
3. **Then** answer or plan. Never before.

---

## ⚠️ GITIGNORED RESEARCH THAT DOES **NOT** LIVE IN `_RESEARCH/` — CHECK THESE TOO

**This index is NOT the whole gitignored corpus, and treating it as such produced a wrong answer on
08/06/2026:** asked "are these the fonts we want, based on the gitignored research," a session
grepped ONLY `_RESEARCH/`, found nothing naming a typeface, and answered *"there is no research
basis for the six families."* The font research existed the whole time, in a gitignored folder this
index never mentioned. A grep of `_RESEARCH/` is not a search of our research.

- **`docs/design-reference/`** — gitignored. **THE HOUSE DESIGN SYSTEM, and it NAMES THE FONTS.**
  `colors_and_type.css` sets `--font-display` / `--font-body` to **Inter** and `--font-mono` to
  **JetBrains Mono**, with real WOFF2 files beside it (`fonts/inter-{400,500,600,700}.woff2`,
  `fonts/jetbrains-mono-{400,500}.woff2`). Carries the full type scale (hero/h1/h2/metric/body/
  small/label/caption), line-heights (1.08 / 1.55 / 1.4), tracking (−0.02em display, +0.06em label),
  the 8px spacing tokens, the gulf palette, and the standing rule *"Tabular figures are
  non-negotiable for numbers."* Direction: *"sharp financial-adjacent display type, borders not
  shadows."* Its `README.md` says take the visual direction, re-implement in our stack — do not ship
  it as-is. **Any typography, color, or spacing question starts here.**
- **`ingest/pipelines/report_design_research/crawl_report_designs.py`** — the *"send crawl4ai out
  and find best looking and recreate"* job, in its own words. Extracts **typography**, section
  order, hero pattern, chart placement, CTA and palette from Chartr/Sherwood Snacks, Axios Markets,
  Morning Brew, The Daily Upside, Redfin Data Center. **NEVER RUN — no output JSON exists anywhere
  in the tree (checked 08/06/2026).** This is the "improve what real companies do" pass, already
  written and never executed.
- **`_FABLE5/`** — stays put, still worth checking (per CLAUDE.md RULE 0.4).
- **`_private/`, `docs/audit/2026-06-2*-crawl4ai*/`, `docs/handoff/2026-06-19-crawl4ai-battle-test.md`**
  — also gitignored. Run `git status --ignored --short` to see the current full list rather than
  trusting this one.

---

## Categories

**agent-behavior/** — how the agent should steer, drift, schedule, self-check (6)
- `2026-07-01-ai-tool-awareness-scheduling-research.md`
- `2026-07-15-ai-steering-anti-drift-research.md`
- `2026-07-21-second-order-thinking-research.md` — "and then what?" (Marks/Dalio) + inversion
  (Munger); live sub-agent frontmatter contract; the five failure shapes every SCRATCHPAD incident
  falls into. Produced `.claude/agents/second-order.md` + RULES.md #12.
- `2026-07-30-omnigent-meta-harness-and-local-ollama-agents.md` — Omnigent (Databricks meta-harness,
  Apache-2.0, ALPHA) + Polly/Debby + the local-Ollama question. **Verdict: do not adopt** — its two
  best features (bwrap/seatbelt sandbox + L7 egress proxy) are exactly what Windows drops, and 5 of
  Polly's 6 workers are the tmux/PTY class Windows lacks. Steal three ideas instead: cross-VENDOR
  review, Debby's `/debate`, policy-as-config cost caps. Measured the money: **$50.12/30d product
  API spend, $27.71 of it jobs already ruled out on quality** — so the local-model ceiling is small
  and the real bucket (interactive coding spend) is unmeasured. Hardware verified: RTX 4060 Ti,
  16 GB. Don't re-derive any of this.
- `2026-07-30-model-routing-lanes-1-2-3.md` — the other three lanes of that same question, plus
  lane 4 (the job inventory) rebuilt from code: **19 metered call types** (11 TS `CallType` + 8
  Python ingest) and the agent half (17 of 112 workflows, 3 running `claude-code-action`, 9 local
  subagents). **The discriminator, from a live BFCL V4 crawl, is STATEFULNESS, not tool use:
  Qwen3-14B is level with Claude-Haiku on single-turn AST (84.94 vs 86.5; it wins live AST 80.01 vs
  78.85), then falls off as state accumulates — multi-turn 34.75 vs 53.62 (1.5×), memory 19.57 vs
  54.41 (2.8×), agentic web search 10 vs 83.5 (8×).** So local is real at the low-state end
  (one-shot, schema-checked) and not at the high-state end. Lane 2 verdict:
  adopt nothing — a router's value is provider fan-out and we have ONE provider; LiteLLM's useful
  half is Python and covers only 8 of our 19 jobs. **🔴 Found a live defect: `claude-opus-5` and
  `claude-sonnet-5` are missing from the `RATES` table, so either would bill $0 and be invisible to
  the spend guard — third instance of that hole.** Carries the recommended routing table.
- `2026-08-08-hermes-model-upgrade-research.md` — what beats gemma4:12b for the Hermes local agent
  on the 4060 Ti, verified live: **gpt-oss:20b is 14GB → fits and is the free local upgrade**
  (tools+thinking, 128K); nemotron-3-nano:30b is 24GB → cloud only; **Ollama Cloud is on the FREE
  tier** (low cap; Pro $20/mo = 50x) and this install already caches 20 cloud models (kimi-k3,
  glm-5.2, deepseek-v4-pro, gpt-oss:120b…) — `-cloud` suffix, same endpoint, one config line. Same
  session: `.hermes.md` context file, `swfl-data-gulf` Hermes skill, swfl-lake MCP wired (6 tools).
- `2026-08-09-hermes-continuous-work-research.md` — how Hermes works CONTINUOUSLY on problems,
  verified live from hermes-agent.nousresearch.com/docs: **`/goal` completion-contract loop with
  shell-command quality gates** (judge needs concrete evidence, not a "looks done" claim); **Kanban
  multi-agent board** (durable SQLite queue, dispatcher, goal-mode cards, git-worktree workspaces,
  per-project boards, auto-block circuit breaker); **cron with zero-token script-only mode** +
  Telegram delivery; session heartbeats. Division of labor: Hermes = bounded gated grinding +
  watchdogs; Claude = judgment + anything landing on main; Hermes never pushes.
- `2026-08-10-hermes-skills-hooks-blueprints-research.md` — the DRIVER surface for the
  email-builder agent: skills = agentskills.io SKILL.md (same spec as our 08/02 intake research,
  portable), external skill dirs, `/learn` authors a skill from a walked-through workflow;
  event hooks (`pre_tool_call` shell hook can BLOCK send calls fail-closed); automation
  blueprints' third trigger = **platform POSTs JSON to a Hermes webhook** (no polling needed);
  `[SILENT]` quiet-tick convention. Design consequence: driver = skill + trigger; build never
  leaves our server (calls the piece2_g1 PROPOSE→CONFIRM seam); send blocked at two layers.

**audits/** — dated deep-pass audits (14). The 07/18 data-consolidation set (P1–P10 + BLOCKERS)
is the most recent pass on parcels, authority ratification, unmapped tables, zombie/bypass
tables, and undocumented consumers. Also 07/18 site-audit, opus-pass, fanout-fix-log.

**competitor-and-strategy/** — competitor + strategy research covering real company names and
strategic analysis (25). **NOT local-only as of 08/11/2026** — the all-in-on-graphify decree
un-ignored `_RESEARCH/` and these files are TRACKED and ship publicly. The 07/17/2026 local-only
decree that this line used to cite is SUPERSEDED. Write clean: no credentials, no client PII, no
personal financial notes.
- `2026-08-11-standing-technology-rejections.md` — **READ BEFORE PROPOSING OR EVALUATING ANY
  TOOL/VENDOR/TECHNIQUE.** The standing "should we adopt X?" verdicts in one findable place:
  LangChain/LangGraph, CrewAI, Langflow, Dify, RAGFlow, n8n, Open WebUI, Gemini CLI, Llama,
  DeepSeek, Omnigent, dbt, DuckLake, k-means, RentCast, ATTOM, Firecrawl, plus the product-scope
  nos. Each carries its reason, its date, and its evidence path. Written because the LangChain
  verdict was buried at line 6351 of the scratchpad and got asked twice; to overturn one you must
  name what CHANGED.
- `STEADY-PAINS.md` — the distilled pain reference; fold every new round into it
- `2026-08-10-homepage-lead-with-emails-research.md` — operator decree "we look like a search
  site": homepage must lead with EMAIL BUILDING; Mailchimp + Figma heroes crawled live (category
  h1 + product image + one CTA, never an input field first); product-first hero assets already in
  `public/showcase/seed-previews/`; direction pending Hermes round + brainstorm
- `2026-07-17-back-on-market-surface-research.md`
- `2026-07-17-buyer-seller-agent-augmentation-landscape.md`
- `2026-07-18-execution-briefs-wire-up-tier.md`
- `2026-07-18-non-re-vertical-sweep-and-security-incident.md`
- `2026-07-18-top20-not-yet-implemented-plans.md`
- `2026-07-19-20-users-launch-kit.md`
- `2026-07-25-guardrails-provenance-market-scan.md` — live crawl of Guardrails AI + Cleanlab
  (acquired by Handshake AI): "block hallucinations" is already a funded, consolidating category,
  so Opus's "nobody ships this" is false at the marketing level; the true delta is structural
  prevention vs probabilistic detection. Verdict: keep provenance as the vertical moat, publish
  the harness/playbook as content, nearest revenue = the already-ranked 07/18 candidate lists.
- `2026-07-26-tangled-forge-tool-scan.md` — swept tangled.org (AT-proto git forge) for generic
  tools: trending top 5 + ~4h global feed = atproto/Gleam/Rust/Nix hobbyist ecosystem, ZERO
  tools in our stack. Entire harvest = stinkpot's timestamp-index pattern (now Bible §0.4).
  Repo move ruled out (no contributors gained, GHA spine doesn't port). Don't re-scan.
- `2026-08-02-claydotcom-scan.md` — Clay.com ($5B GTM/sales-data platform, 500k customers, NOT
  $500B — RULE 4 discrepancy flagged): waterfall enrichment = our four-lane sourcing applied to
  150+ contact vendors; Claygents = our deterministic/LLM-judgment split w/ visible reasoning.
  ROUND 2 (operator pushback): status.clay.com is bought (Rootly), not built — matches our
  mastermind/minion rule. Their PUBLIC incident history = 9 breaks in 9 weeks (Jun-Aug 2026),
  2 multi-day, 1 full outage w/ customer data-loss guidance — they don't "have it together,"
  they're transparent about breaking. Our own `docs/cron-rebuild-failures.md` already runs the
  same playbook (name the class once, ship one gate, never repeat) — 8 recurring classes, all
  with shipped fixes. Real gap: we have no public/subscribable status surface, and the daily
  doctor-run doesn't distinguish NEW red from already-known/checked red. Candidate follow-up,
  not yet scoped: public status page (buy) or new-vs-known red distinction on the doctor gate.
- `2026-08-03-apify-actor-fit-assessment.md` — Apify fit, live-verified: CLI was NOT installed
  ("we have the CLI" false — installed 1.7.1, LOGGED IN 08/03/2026 via keyring); real access = the MCP
  plugin (call store Actors, no CLI needed). Monetization (pay-per-event, from Actor source code)
  and standby mode (Actor = always-on HTTP/MCP server) verified in vendor docs. Verdict: best fit
  is a metered DISTRIBUTION Actor wrapping our own live API (RULE 0.9 — Apify supplies billing/
  discovery plumbing), NOT a scraping Actor (fragile-source class already rejected 08/02).
  Failure modes pre-named: egress burn, tier leakage, stripped provenance. Brainstorm not yet run.
  **ADDENDUM 08/03/2026 — INBOUND lane PROVEN LIVE (~$0.80 spent):** 2-step sold-comp recipe —
  `moving_beacon-owner1/realtor-com-property-scraper` ($0.01/result) takes explicit date_from/
  date_to, verified reaching 06/2025 (14mo back), returns sold_price + beds + full_baths/half_baths
  + sqft + county + tax_history + agent/broker contacts + `alt_photos` FULL GALLERY (50 photos on
  one home); then `one-api/realtor-property-scraper` ($0.007/result) whose `Raw.details.text` is the
  3,000-char FULL MLS DESCRIPTION on an ALREADY-SOLD home. rdcpix photo rot falsified at 5mo
  (HTTP 200). Retires the per-build-paid-call trap in the 07/02 sold-price-backfill research.
  Corrects the 98.5% comp-photo figure (that is IN-sweep-window only; capture began 06/30/2026).
  2 of 5 store actors tested were junk (scrapeworks FAILED 2/2, grimnir 0 items).
- `2026-08-10-instagram-improvement-harvest.md` — first run of the operator-decreed improvement
  harvest ($0.49 of a $3 cap, vendor-billed). LANE LAW: `apify/instagram-scraper`'s hashtag
  SEARCH returns junk (5/5 runs); `apify/instagram-hashtag-scraper` works first try — saved as
  account task `instagram-improvement-harvest` (7 tags × 30 posts ≈ $0.48/run). Instagram signal
  MODEST (prompt-injection warning, 1-listing→week-of-content, Amplifiles.ai); the GitHub lane
  (rag-web-browser) was the strong one: anthropics/skills, alirezarezvani/claude-skills,
  steipete/agent-rules, zilliztech/claude-context, nothing-design-skill, awesome-skills hubs.
  ZERO real-estate skills exist in the ecosystem — domain playbooks stay homegrown.
  **ADDENDUM: steipete/agent-rules trialed same day — DO NOT ADOPT (half Swift/macOS, generic
  half weaker than our hook-enforced equivalents); ONE keeper stolen into RULE 2 §0b: third
  occurrence of the same gripe = build the mechanism, a third scratchpad entry is banned.**
- `2026-08-02-agent-skills-spec-for-intake.md` — live crawl of agentskills.io/specification:
  the SKILL.md format contract (name ≤64 lowercase-hyphen, description ≤1024, references/
  progressive disclosure) our hosted user-data intake skill must follow; Mixpanel's skill (§8 of
  the app-drive) is the working instance. Feeds the user-data-typed-lane build.
- `2026-08-02-claydotcom-app-drive.md` — ROUND 3, INSIDE the app (logged-in Chrome drive, operator's
  workspace): Clay has ONE runtime primitive — the table column. Every capability (enrichment,
  waterfall, AI) = a column w/ declared inputs (explicit DAG: "Go to parent column"/"Used in..."),
  run condition, per-row price shown BEFORE save (0.5/row enrichment, 3/row AI), per-cell provenance
  (Last Refresh + "Charged" on every cell). AI is caged: system writes the prompt, output forced
  into typed Fields/JSON Schema. Failure grain = one CELL, not a pipeline — a miss degrades a %
  instead of killing a run. Stealable at our volume: cell-grain ingest failure semantics,
  freshness-on-the-value, cost-at-point-of-use on /ops.
- `2026-08-02-mixpanel-app-drive.md` — live in-app drive (operator's free-trial project +
  shared B2B/SaaS demo project): skill.md + per-user token + verify-first-event intake is the
  steal of the day, maps directly onto our user-data→email pipe; Boards = narrative prose
  interleaved with live charts validates our deliverable model; nine total chart types
  vindicates our bar/table-first stance (FOCUS rule 4); per-event "30 day queries" count is
  cheap usage-ranked governance stealable for /ops. Companion to the claydotcom app-drive above
  — both feed the `lake_cell_grain_failure_semantics` decree (08/03/2026).
- `2026-08-03-clay-university-101-course.md` — full Clay 101 course sweep (16/16 lessons, 0 fails),
  grouped by FETE. Thinner than the two prior scans — mostly a beginner GTM-prospecting tutorial
  we have no analog for (company/people/jobs/Maps finding, CRM/Sheets export, email waterfalls).
  Confirms rather than teaches: deterministic-must-be-free/judgment-must-cost = our "deterministic
  math, narrative prose" split, independently arrived at. Only real habits worth keeping: lookup-
  before-write dedupe (no CRM surface to apply it to yet), export-as-a-view not a pipeline, and a
  10-15% spend carve-out for experimentation. Verdict: nothing here changes architecture or roadmap.
- `2026-08-04-followupboss-research.md` — deep crawl4ai (BFS, 36 pages) of followupboss.com,
  Zillow Group-owned real estate CRM. Core moat argument is structurally identical to ours:
  first-party interaction data (calls/texts/emails) beats a generic model with no data access —
  same shape as our four-lane provenance pitch, applied to CRM history instead of parcel/deed/
  market data. The literal "follow-up agent" answer is **Zillow Pro**, not FUB's base AI: a
  premium layer where a contact's Zillow browsing activity feeds back into FUB via a "My Agent"
  relationship to power AI-drafted follow-up — pricing gated behind a sales call, not published.
  Base AI (smart summaries/messages, suggested tasks, predictive lead prioritization) is free on
  every tier but quality depends on FUB Calling data (a paid add-on on the entry Grow plan).
  Pricing: Grow $69/mo/user, Pro $499/mo for 10 users, Platform $1,000/mo for 30 users (2 months
  free annually). SOC 3 + SOC 2 Type 2 + CASA Tier 2 certified. No competitor sweep (kvCORE,
  BoomTown, Real Geeks) done in this pass — scoped to FUB only per operator's confirmed target.

**data-and-ingest/** — sources, backfills, pipeline findings (14)
- `2026-08-04-steadyapi-leepa-sale-grain-proportion-call.md` — the sale-grain proportion call owed
  by the lean-verifier ledger, run live 08/04. **Outcome: DEFINITIONAL WATCH, not a kill.** Join
  lane exists (68.57% of 9,654 Lee properties); on 6,186 unambiguous pairs price agrees exactly on
  80.33%, price+month on 64.97%, and 97.10% of price-agreeing pairs land within one month.
  **The correction that mattered:** data-roots T10 — `leepa_parcels.last_sale_date` has exactly ONE
  distinct day-of-month across 528,505 rows (the 1st), so the handed SQL's day-grain comparison
  scored 99/6,186 (≈1/30, pure calendar arithmetic) where the honest month-grain number is 4,019.
  Reporting it as written would have been a fabricated finding built from a real query. **Kills the
  ledger's "first sub-monthly surface" hope** — the county side caps this pair at month grain
  permanently. Miss analysis over the full 3,034: 85.00% carry a unit, and 96.70% of marked-unit
  misses reach a parcel once the unit is stripped = condo-grain gap, not absent parcels. The
  address_key SQL port was proven 500/500 parity before any match rate was believed.
  **ADDENDUM 08/04 (close-out session):** 381 triaged live — 91.86% land in a named class once a 5th
  bucket (de-minimis rounding ≤1%, 232 pairs) is added to the handoff's original four; error contract
  now assertable on the remainder (stated residual red-rate 1.24%). Condo gap closed (a)
  measured-and-deferred: `lee_parcels.phy_addr2` is 0/556,083 populated, county roll carries no unit
  data anywhere, so unit-matching-now was impossible. Successor:
  `steadyapi_leepa_condo_unit_matching_subproject`.
- `2026-08-04-steadyapi-leepa-LEDGER-paste-block.md` — the finished ledger row, as a file because
  the cross-project hook blocks brain-platform writing `lean-verifier/LEDGER.md`. Apply from a
  lean-verifier session; tracked by check `steadyapi_leepa_ledger_row_not_yet_applied` (closed 08/04
  — applied via lean-verifier commit `563c8a7`, verified independently).
- `2026-08-04-lean-verifier-paste-block-steadyapi-leepa.md` — the 4 facts §4 of the close-out handoff
  owes back to lean-verifier (381 triage outcome, condo-gap decision, re-observation bind numbers,
  ordering-rule confirmation), staged as a file for the same cross-project-hook reason as above.
- `2026-08-03-neighborhood-amenities-full-scope.md` — FULL-SCOPE-FIRST live probe of SteadyAPI
  `/neighborhood-amenities` (200 OK, one call): propertyId is the ONLY input; returns the NAMED
  vendor neighborhood **with boundary polygon + centroid** (the listings↔community pairing key
  the api_feed lane lacks — 34,904 rows, 0% subdivision, verified), 12 location scores, schools
  w/ ratings, 31 amenity categories (Yelp-derived businesses w/ lat/lon + distance). HOA fees
  re-confirmed ABSENT vendor-wide. Call economics: dedupe by neighborhood slug_id, not
  one-call-per-community. Feeds the community-amenity coverage build.
- `2026-08-02-property-tax-history-full-scope.md` — FULL-SCOPE-FIRST probe of the ONE endpoint the
  DOM backfill pays for. One call = ~50 fields across 5 families (`property_history[]` incl. the
  vendor's own `days_after_listed` + `source_name` MLS/board + `last_status_change_date`;
  9-year `tax_history[]` with assessment/market value, covering Collier where LEEPA doesn't reach;
  `building_permits[]` — census should-get #2, still unbuilt; `statistics{}`; `meta{}`). We persist
  exactly ONE (`listed_date`). Everything else is ZERO extra calls. Carries the `_ENRICH_ONLY_COLS`
  trap that wiped `listed_date` (17,127 rows) and `baths` (34,139 rows), and the
  `effective_date = "Mar 8, 2021"` non-ISO date warning.
- `2026-08-02-greenfield-scout-reliable-apis.md` — greenfield proof-of-pipeline scout, reliability
  as the ONE ranking criterion (operator rejected scraped portals/PDFs/mirrors/SFTP as "the kind
  that always fail"), insurance/economy lean. 8 sources live-verified this session (real fetches,
  real HTTP status, real field names). Top-4 pick: BLS Public Data API (no key, real Lee County FL
  unemployment 5.1% June 2026) + Treasury FiscalData API (no key, real debt-to-penny record) + NOAA
  CO-OPS tides (no key, real Fort Myers predictions) + OpenFEMA Disaster Declarations (no key, real
  fetch; NFIP-claims side flagged fragile — v3 replacement 503'd 4/4 attempts, v2 works but sunsets
  10/15/2026). FRED confirmed key-gated with no unregistered read path (docs live, key not
  registered). **FLOIR (QUASR/choices) confirmed XLSX/portal-only, zero API surface — stays dead,
  exactly the fragile class rejected.** Census re-confirmed key-required (redirects to
  missing_key.html).
- `2026-08-02-greenfield-scout-restaurants.md` — greenfield proof-of-pipeline scout, NOT real
  estate: restaurants/hospitality/tourism sources for Lee+Collier, all live-verified this session
  (real fetches, real row counts, real command output pasted). 6 sources checked, top-4 pick: FL
  DBPR active food-service licenses (bulk CSV, District 7, ~4,040 Lee+Collier rows, 34 fields) +
  FL DBPR food-service inspections (bulk CSV, same district, ~579 current-FY rows, 78 fields,
  joins on License Number) + FDOT AADT (ArcGIS REST/JSON, 749 Lee+Collier road segments, 23
  fields) + OSM Overpass (live JSON query API, no key, 602 restaurant nodes across both counties
  with cuisine/geocoding DBPR lacks, ODbL attribution required). Backups: DBPR Emergency Closures
  (HTML-index-discovered dated xlsx, genuinely different access shape) and BLS QCEW NAICS 722
  (bulk CSV, county establishment/wage rollup, no key). **Discrepancy: Census CBP now requires an
  API key on every request, even the most minimal — dropped, contra the brief's "no key needed"
  assumption** (third independent scout to hit this same finding, see marine/bizform below).
- `2026-08-02-greenfield-scout-marine.md` — greenfield proof-of-pipeline scout, NOT real estate:
  marine/boating sources for Lee+Collier, all live-verified this session (actual fetches, real row
  counts, command output pasted). 5 sources found, ranked top 4: FWC Derelict Vessels ArcGIS REST
  (567 statewide/63 Lee+Collier, 28 fields, re-verified vs 07/18 pass), NOAA CO-OPS Tides JSON API
  (Fort Myers + Naples stations, live tide/wind pulls — NWS marine zone forecast API confirmed
  UNSUPPORTED, 404 "Marine Forecast Not Supported"), FWC Marinas Florida bulk CSV download (10,326
  statewide/1,063 Lee+Collier, 50 fields, real CSV file GET), Florida Healthy Beaches HTML crawl
  (third-party DOH mirror, floridahealthybeaches.com, Lee 12 + Collier 11 monitored beaches with
  live enterococcus values — flagged as non-primary source). 5th/bonus: FLHSMV Annual Vessel Stats
  by County PDF (18-page text-layer PDF, Lee=49,904 / Collier=25,510 total registered vessels,
  2019-2025 all available). FWC boating-accident stats confirmed PDF-only (no structured layer);
  FLHSMV vehicle-registration CSVs confirmed NOT vessel-specific (dead end, don't re-walk).
- `2026-08-02-greenfield-scout-bizform.md` — greenfield proof-of-pipeline scout, NOT real estate:
  new-business-formation / local-banking-signal sources for Lee+Collier, all live-verified this
  session (actual fetches, real row counts, real command output pasted). 4-source pick: FL Sunbiz
  daily Corporate Data File (SFTP, fixed-width 1440-char, zip-filterable, downloaded a real
  378-record statewide day), FDIC BankFind API (institutions/locations/sod, no key, real deposit
  dollars by branch), FL DBPR Alcoholic Beverages & Tobacco daily-activity CSV (County is a labeled
  column), Census CBP (county+ZIP grain confirmed via geography.json, but needs a free key —
  X-DataWebAPI-KeyError confirmed live, data pull untested). Census BFS verified live but US-only
  grain (rejected, can't filter to FL/SWFL). NCUA attempted, not verified — Angular SPA defeated a
  static crawl, real path not found this pass, explicitly NOT claimed unavailable.
- `2026-07-22-naive-bayes-knn-algorithm-fit.md` — indexed 07/30/2026, eight days late. Whether naive
  Bayes / kNN fit our data at all, alongside the k-means and clustering verdicts. Read it before
  proposing any classifier so the same ground isn't re-litigated a third time.
- `2026-07-22-lake-wire-map.md` — full lake→brain→downstream lineage tree, 93 registry sources +
  41 packs grep-verified by 16-agent fan-out. 7 registry `consuming_pack`/`coverage_exempt` claims
  proven stale, 2 fully unregistered tables found (`community_profiles` pipeline, `cre_figures`),
  5 packs confirmed not feeding master (2 deliberate, 3 real gaps).
- `2026-07-02-sold-price-backfill-findings.md`
- `2026-07-21-nextjs-caching-and-kv-research.md` — what caching we actually have (no KV, no Redis,
  `cacheComponents` off) + verbatim Next 16 contract for `use cache` / `cacheLife` profiles /
  `use cache: remote`. Vendor's own when-to-avoid list rules KV out at our volume.
- `2026-07-22-predictive-analytics-and-lead-mining.md` — RESEARCH, not a plan. Spine: we already
  hold every propensity-to-list feature except identity + mailing address (tenure via SALE_YR1/2,
  equity proxy, homestead = absentee proxy, SOH lock-in) — the 14 `OWN_*`/`FIDU_*` fields are a
  deliberate exclusion, not a capability gap. The missing identity sits in the PARKED
  `lee_deed_official_records` (grantor/grantee names) whose unpulled doc types — MORTGAGE, LIEN,
  CERTIFICATE OF TITLE — are the distress triggers the industry monetizes. Method layer sourced
  verbatim (sklearn calibration/leakage, causalml meta-learners, uplift's Persuadables vs Sure
  Things). Legal: three regimes, three triggers — TSR/DNC $53,088 per violation + FS 501.059
  written-consent/treble; **DOJ v. Meta, first algorithmic-bias case under the Fair Housing Act,
  disparate treatment AND disparate impact, lookalike audiences banned for housing ads**; FCRA only
  if a score gates eligibility. FS 501.702(19) excludes publicly available info from "personal
  data." Highest-leverage finding is not a model: five tested `lib/why-not-selling/checks/` have
  zero importers.

**deliverable-and-design/** — deliverable quality, contrast, chart types, design bar (5)
- `2026-07-01-ai-deliverable-design-quality-research.md`
- `2026-07-01-design-quality-BCD-handoff.md`
- `2026-07-01-taskB-wcag-contrast-verification.md`
- `2026-07-01-taskC-charttype-verification.md`
- `2026-08-06-precompute-narrative-cache-research.md` — feeds
  `2026-08-06-precompute-narrative-cache-design.md`. Vendor-verified (crawl4ai, live) Vercel Workflows
  (`'use workflow'`/`'use step'`, durable retry/replay) vs. the already-live Vercel Cron + GHA-cron
  convention as the mechanism for precomputing/validating/caching `buildDeliverableNarrative()`
  output ahead of `/api/deliverables/[id]/refresh`, modeled on the existing `sourced_figures`
  DB-backed cache pattern (`lib/figures/sourced.ts`). Recommends starting with cron + API route
  (zero new dependency) over adopting Workflows at this call volume.

**email-and-social/** — email + social pipeline, platform safe zones, first-party verification (14)
- `2026-08-11-freakonomics-seller-insights-crawl4ai-research.md` — pure-ideation crawl4ai sweep
  (4 parallel agents) on non-obvious seller-psychology angles: SWFL-buildable DOM-vs-price-cut
  correlation (real, zero new ingest), real per-property carrying-cost math, price-band
  search-filter boundary check, plus 20+ cited external findings (FHFA rate lock-in paper, Naples
  cash-buyer price-band breakdown, Zonda renovation ROI, Realtor.com/Zillow seasonality reports).
  Tags every finding buildable-now vs. cited-external vs. genuine gap. No build chosen yet.
- `2026-08-09-merge-tag-fallback-vendor-docs.md` — merge-tag/personalization fallback behavior at Mailchimp/HubSpot/Klaviyo, fetched live — unfilled tokens ship literal blanks (documented MC+HS); grounds the sentence-bank drop/block rule
- `2026-08-06-just-sold-craft-and-agent-email-voice.md` — the CRAFT half of a Just Sold email, and
  how an agent email should SPEAK. Forced by the operator on the first render: *"this is the worst
  just sold email I have ever seen."* **Headline finding: a Just Sold email is not an announcement
  about a house, it is a message to the NEIGHBOURS about THEIR house** — LeadSites, HousingWire and
  The Close all lead with the reader's equity, and ours never mentions the reader at all. The Close's
  Use-This/Not-This table is the voice card ("Profit from your home!" over "We know how to sell your
  home!" — *"make the seller the hero of the story"*). Contents: what the email must contain (8
  items, each marked built / gated / not-holdable — offer COUNT is lane-4 only, days-on-market is
  only honest on the recorded rung), the speak rules with sources, subject-line patterns (three
  sources converge on 30–40 chars), the visual argument behind `ribbonLoud` (The Close's 13-postcard
  teardown: "large, bold text", "a short sentence in HUGE print"), why it is NOT an on-photo overlay
  (Outlook desktop drops background images and the house would vanish), MPP killing open rate as a
  metric a third time, and **8 new email ideas** (neighbour-farming Just Sold, "your future
  competition just went live", Deal of the Week, home-iversary, seven HousingWire prospecting types,
  and SMS as a compliance wall, not a build). Also carries a legal gap we have no gate for: an agent
  sending a Just Sold for a house they did not list may not use the listing agent's photos. 4 of 5
  URLs returned content; reallygoodemails is JS-rendered and came back empty.
- `2026-08-05-under-contract-email-purpose-and-design.md` — what the 4th lifecycle email is FOR and
  how it is built. **Headline finding: there are TWO emails wearing this name and the whole crawlable
  corpus is the wrong one.** Type A TRANSACTIONAL (maestrolabs' 5 templates — announcement,
  inspection, closing date, appraisal, walk-through) is addressed to the parties inside the deal and
  carries no marketing and no market data; Type B MARKETING is ours. theclose.com's 20-template set
  has **no** under-contract template at all. Three benefits ranked by evidence: social proof for the
  next listing conversation (strongest), recapture of the underbidders (*"[Address] went fast, but
  I've got more for you!"* — the only crawled real subject line, and it targets inquirers not the
  sphere), and speed — how fast it went, the one number this email owns. **§4 carries an operator
  correction made the same day: WE are not the sender, the AGENT is.** They own the listing, build
  the campaign, notify us at under-contract (that notification IS the trigger — lane 4, first-class
  under RULE 0.7) and choose the recipients. The first draft called speed unmeasurable because our
  feed logs no pending transition; that was a market-observer premise and it was wrong. Speed =
  our listed date minus the agent's contract date. The lake gaps are cautions about columns, not
  limits: **never compute duration from `days_in_state`** (it counts days-in-ACTIVE — a live row
  reads 34 against a 09/13/2024 list date), and never build a pending DETECTOR (no under-contract
  state exists; the flag is stale on 462 sold rows) — that matters for inventory counting, not here.
  Operator decisions recorded: contract date NOT needed as a cell, price ships and is the list price,
  audience is the agent's to pick so all three benefits must be served at once. **Round 2 (operator:
  "1 out of 10 is shit and you looked it up wrong") — searching the literal phrase returns only
  deal-desk junk; searching per BENEFIT returned primary material first try. 5 of 13 URLs.** Best
  source is oakleysign.com on status riders: *"Just Listed, Under Contract, Sold tells a story
  neighbors follow in real time … each status update is another impression"* + the Rule of 7 — that
  is the whole argument for this email, written about a yard sign. Coffee & Contracts hands over the
  CTA formula (lead with the speed fact, close with *"Thinking about what your home could sell for?"*
  — so social proof is the CTA and speed is the BODY, not a fork) plus the two-number line *"Most
  homes in [City] sell in X days, this one sold in X"* — **the market median is ours and nobody else
  emailing an agent's list has it** — and a 24–48h freshness window. Redfin/NAR **6% of sales fall
  through** WEAKENS any backup-offer ask (1-in-17) — recapture CTA is "here's what else," not "get in
  line"; a 16.3% cancellation figure from a search summary conflicts and is UNRESOLVED, print
  neither. "Under contract" vs "pending" for Florida practice still UNVERIFIED — not settled.
- `2026-08-05-loops-so-vendor-deep-crawl.md` — deep crawl4ai of loops.so/docs (241 pages, BFS) for
  the New Listing paid-fallback vendor question. Priced on contact count, not send volume; free
  tier 4k sends/mo. Both API and SMTP paths require a template pre-registered in THEIR editor
  (`transactionalId`) — even the SMTP relay sends a JSON payload resolved against that template,
  not raw rendered HTML. Doesn't fit our own-the-rendering model cleanly; fits better as a
  deliverability-only fallback (dedicated IPs, DKIM/DMARC, Guardian pre-send check) than a drop-in
  relay. Numeric paid-tier pricing is JS-slider-only, not captured. Raw 90k-line crawl dump stays
  local (`*crawl4ai*`, gitignored) — this file is the distillation.
- `2026-08-05-rag-tag-vendor-landscape-report-assessment-addendum.md` — 4 more operator-handed
  files, same underlying source restated (verbatim vendor list, RAG/TAG framing). No new checks —
  only genuinely new items (Creatomate, PostHog+Loops behavioral-trigger stack) checked against
  code and either already covered or correctly poor-fit for our product unit. Read the parent file
  first; this is a delta only.
- `2026-08-05-rag-tag-vendor-landscape-report-assessment.md` — operator-handed generic vendor
  report (RAG/TAG grounding, QuickChart, Bannerbear-class, Rasa.io, WaveGen.ai) assessed against
  our own code. Verdict: mostly describes a worse version of what we already built (TAG/deterministic
  binding, brand-bound chart+image rendering, validator gate stack all confirmed superior — don't
  adopt any of QuickChart/Bannerbear/RAG/Rasa.io/RSS-harvest). Two genuine new gaps surfaced:
  LinkedIn native PDF/document carousel format (unbuilt) and an auto first-comment link mechanic
  (unbuilt) — both additive to `lib/social/`, checks opened.
- `2026-08-04-social-copy-and-graphics.md` — 3-agent fan-out answering "how to write a post, what
  makes a card look good, what makes people click" (email had this via §0's benchmarks doc; social
  had zero). Strongest finding: X's link-in-body penalty is real and severe (Buffer, 18.8M posts,
  ~0% engagement) — link goes in the reply, not the post. LinkedIn's official no-penalty statement
  directly conflicts with independent reach-drop data — left as an open conflict, not resolved.
  Pangram (1M+ posts) found 40%+ of long-form LinkedIn posts read as AI-generated — the tightest
  AI-tell guard belongs there. The 32px in-image legibility floor stays `[INFERENCE]` — no vendor,
  accessibility body, or UX research org publishes a minimum anywhere; confirmed absence, not a
  miss. Closed the suspected X-landscape 1600×900 mismatch (false — 1200×630 is fine). Our 2.5s
  carousel pacing has zero evidence behind it; Baymard's usability research suggests 5-7s. Feeds
  `lib/social/CLAUDE.md` §0.4.
- `2026-08-03-button-link-mechanics.md` — the LINK MECHANICS of a CTA (its companion file below
  covers CTA copy/placement). **Honest source count: 2 of 4 URLs returned content** — Email on Acid
  and Mailgun both 404'd on their URL-shortener articles (blogs folded into Sinch), so the
  shortener question is filed **UNVERIFIED, not as a finding**. Litmus: **never an image-based
  button** (dies under image-blocking, invisible to screen readers, and both failures are
  UNTRACKABLE), height **42–72px**, label 1–5 words, five bulletproof coding methods with
  conditional-padding preferred. `ButtonBlock.tsx` already complies — no change needed. Gmail
  sender guidelines, the load-bearing line: **"Recipients should know what to expect when they
  click a link"** — which is *why* `usesWebsiteDefault: false` for the `community` and `listing`
  roles in `lib/email/button-destinations.ts`. A homepage standing in for "Find Out More About This
  Community" is a DELIVERABILITY violation, not a taste call. Google also evaluates the **payload
  domain** (where links point) as an identity surface.
- `2026-08-03-email-length-and-per-type-benchmarks.md` — the MEASURED numbers behind `emails.md`
  §0.1/§0.1b. Body length **50–125 words** (Boomerang, response-rate — MPP-proof), and the floor
  matters more than the ceiling: a 25-word email performs like a 2000-word one, subject-only gets
  11%. Ask **1–3 questions** (+50% response), write at a **3rd-grade level** (+36% vs college),
  never neutral sentiment (+10–15%). Per TYPE (GetResponse 2024, 4.4B messages): newsletter 40.08%
  open/3.84% CTR · triggered 45.38%/5.02% · **welcome 83.63% open**. Newsletter cadence peaks at
  **1/week**; drip CTR **halves after the 2nd message**. Real-estate row: high open, LOW CTOR
  (8.23%), **4.86% bounce** + lowest double-opt-in of any industry. Killed the operator's own
  ~200-word figure at his instruction. **Two ESPs disagree ~2× on the same industry — never promise
  an absolute open/click rate.**
- `2026-08-03-strongest-real-estate-email-concepts-structure.md` — 4-agent crawl4ai fan-out on the
  actual ANATOMY/craft of real estate emails (not the lifecycle stage sequence — that's the 07/01
  listing-lifecycle file below). **Part A** (10 ESP/CRM platforms, live-fetched): universal 5-part
  skeleton (header/greeting → context → data block → single CTA → agent sign-off), agent-identity
  block always at the TOP, market-report + listing-alert are the two universal email types, 4
  DIFFERENT merge-tag delimiter conventions in the wild (no industry standard — BoldTrail `{curly}`,
  FUB `#hash#`, Luxury Presence loose `{curly}`, Sierra defers to ESP) — pick our own, document it.
  kvCORE is dead as a name, now BoldTrail. **Part B** (copy/subject-line craft): Luxury Presence's
  14-type subject-line taxonomy w/ real examples, top-10 source-backed craft rules (30-40 char
  subjects, one CTA only, ≤3 images/≤20 lines text, treat open-rate as directional post-2021 Apple
  MPP), 3 unresolved head-to-head contradictions flagged (emoji lift/hurt, best send-time AM vs PM,
  47% vs 33% subject-decides-open). **Part C** (market-report/CMA structure): Rev Real Estate
  School's verbatim weekly "Market Monday" 4-section template (Feedback → Market Update →
  Marketing → Recommendation → phone-call close) + NAR's number-first anatomy
  (`-2.4%` bare, then plain-English, then named-authority quote, then next-release date) →
  synthesized into an 8-step market-report content sequence. **Part D** (email-client rendering,
  19 pages incl. live caniemail.com support tables): Outlook Windows desktop is the ONLY client
  with zero flex/grid support (~83% ecosystem support elsewhere) — table-skeleton + fluid-hybrid
  ghost-table is still required; Gmail clips HTML/CSS source at ~102KB mid-tag; dark mode has 3
  behaviors, 2 clients (Outlook desktop, Gmail desktop) have NO coding workaround at all. Synthesis
  section confirms our existing SVG-in-Outlook fallback, chart-coherence gate, and CAN-SPAM footer
  already match best practice; flags a market-report recipe shape, subject-line convention, and
  merge-tag convention as real gaps to close.
- `2026-07-01-email-social-ai-pipeline-report.md`
- `2026-07-01-social-safezone-meta-firstparty-verification.md`
- `2026-08-02-api-mcp-data-to-email-industry-scan.md` — live-crawled two real, working cases of
  "pull data via API/MCP, mail it back as data-rich email" outside real estate: Ahrefs (own MCP
  server + REST-fed SEO products) and Datadog (agent/API telemetry pushed straight into
  threshold-breach emails). Neither proves the harder "OAuth into the USER'S OWN account, compose
  a branded email over data we don't own" pattern the operator actually asked about vertical-
  agnostically — that gap is named as the next crawl pass, not yet done.
- `2026-07-30-email-creation-on-user-data-competitor-scan.md` — live crawl of Beefree SDK, beehiiv,
  Stripo, Gamma, Datawrapper for "can we be an email company on OTHER people's data." Beefree's MCP
  server (open beta, v1 dies 09/01/2026) is the reference agentic contract: ONE agent, wide flat
  toolbelt (`beefree_add_section`/`add_title`/`add_paragraph`/… + `beefree_check_template`), and
  **zero data tools** — no CSV, no figures, no chart, no provenance anywhere in the category.
  beehiiv already ships per-block "AI blocks" but copy-only. Unoccupied square = user's file →
  designed EMAIL where every number traces to their cell. Quality comes from a CHECKER, not a
  smarter writer (Beefree's Checker + our own 07/01 design-quality finding agree). **§4b = full
  GAMMA MECHANICS** from their machine-readable docs (developers.gamma.app/llms-full.txt, 272 KB,
  OpenAPI inline): ONE `inputText` (400k chars) → whole artifact, async+poll; `textMode`
  preserve|condense|generate IS the "say exactly what they say" dial; theme ⟂ content (design is
  APPLIED, not generated); sections = a literal `\n---\n` delimiter; `pages[]` (≤50) is the
  orchestrator brief as a parameter; 40+ image models, no image agent. **Their charts are PROMPTED,
  not bound** — their own words: "non-deterministic… may vary across runs, even with identical
  inputs", no chart-type parameters, and a label like `$100` "may be interpreted as data". We bind
  (`pickFramesForData` + `bindFrameSpec`). Wedge: Gamma prompts charts, we bind them.

**private/** — personal/strategy notes outside the platform (3, stocks architecture)

**real-estate-market/** — market mechanics, listing lifecycle, agent workflows (2)
- `2026-07-01-listing-lifecycle-marketing-research.md`
- `2026-07-22-kmeans-clustering-applicability.md` — we use ZERO k-means, by two documented
  rejections (`market-areas.ts` "never runtime clustering"; ecStat rejected in the trend-fit spec).
  sklearn's own caveats (elongated clusters, local minima, run-to-run instability) + the WI25
  two-stage-cluster paper (43,309 listings, 36–58% MAE gain). Verdict: ZIP grain (N=58) is theater;
  parcel grain (847k) is the only honest lane, and only as preprocessing for an interpretable
  per-cluster model — never a user-visible label. Don't re-litigate.

**voice-and-positioning/** — how we sound, what we claim, sell-side framing (3)
- `2026-08-10-ai-voice-control-research.md` — how to get AI to speak how you want (operator-ordered
  crawl). Anthropic live doc: examples are the most reliable tone lever, a one-sentence role
  materially shifts voice, prompt style leaks into output style. Wikipedia signs-of-AI catalog:
  the measured tells (boasts/offers/features for "has", not-just-X-but-Y, rule of three, summing
  clauses). Applied same session to `authorListingNarrative` — role + exemplar + no-costs/
  no-negativity with delete-only code filters.
- `2026-07-15-authority-reasoning-not-hype-research.md`
- `2026-07-15-sell-side-copywriting-research.md`

---

## Not moved, still worth checking

- **`_FABLE5/`** — the desk: collection notes, playbook, mindmap, retros. Live market
  observations and operator-caught corrections land here first. Deliberately left in place.
- **crawl4ai output** — anything matching `*crawl4ai*` anywhere in the tree; local-only
  scraped source material, never committed, always readable.

---

## Adding research

Drop it in the matching category with a `YYYY-MM-DD-` prefix and add its line here in the same
pass. A research file not listed in this index does not exist — that is the exact failure this
index was built to stop (07/20/2026).


---

## ⚠️ RECOVERED 08/05/2026 — 18 files that were IN `_RESEARCH/` AND NOT IN THIS INDEX

This index's own law, stated at the bottom of this file: *"A research file not listed in this index
does not exist — that is the exact failure this index was built to stop (07/20/2026)."* **By that law
these 18 did not exist.** They were found by `node scripts/doc-reachability.mjs`, which counts a doc
as ORPHANED when nothing anywhere points at it — not one of these had a single inbound reference.

**Two of them are the reason this matters, not a filing curiosity:**
- `P9-discoverability-wiring.md` is a PLAN FOR MAKING THINGS DISCOVERABLE. It was itself
  undiscoverable. Its Edits 1–2 are already live in `CLAUDE.md` (the ★ Data-roots row and RULE 0.55),
  so the approach is proven — the rest of the plan was simply never read again.
- `P7-corpse-deletelist.md` is a finished 8-object deletion audit with pre-flight guard SQL, every
  item `[NEEDS-SIGN-OFF]`, dated 07/18/2026. On 08/05/2026 the operator asked for a delete list.
  **We already had one, paid for, and could not see it.**

Sorted into their real categories below; re-file them properly when the audits section is next
touched. Regenerate the full corpus map any time with `node scripts/doc-index.mjs`.

- `_RESEARCH/audits/2026-07-18-data-consolidation/BLOCKERS.md` — P10 (completeness-critic) — 2026-07-18 — .../data-consolidation/ were empty at write time). P10's critique is therefore of the
- `_RESEARCH/audits/2026-07-18-data-consolidation/P1-parcel-consolidation.md` — P1 — Lee Parcel Consolidation + Guarded Deletion Plan — Stream: P1-parcel-consolidation. Written 2026-07-18. Read-only analysis; NO repo files edited, NO
- `_RESEARCH/audits/2026-07-18-data-consolidation/P2-frontmatter.md` — READ THIS FIRST — "where's the authority for X?" in 30 seconds — You are about to answer a data question or wire a consumer. Do not grep for a table and read
- `_RESEARCH/audits/2026-07-18-data-consolidation/P3-authority-ratification.md` — P3 — CONCEPT → AUTHORITY RATIFICATION TABLE — Every root here is a recommendation pending C1/C2 sign-off, never a normative "X IS the authority."
- `_RESEARCH/audits/2026-07-18-data-consolidation/P4-unmapped-tables.md` — P4 — 13 UNMAPPED-TABLE GAP-FILL (data-roots.md completeness) — This is FILL-IN of that enumerated list, not discovery. Every row-count/column-count below was
- `_RESEARCH/audits/2026-07-18-data-consolidation/P5-undocumented-consumers.md` — P5 — Undocumented-Consumer Gap-Fill (7 reads) — (docs/handoff/2026-07-18-data-consolidation-execution.md:230-381). For each: (a) confirm
- `_RESEARCH/audits/2026-07-18-data-consolidation/P6-master-doublevotes.md` — P6 — Master Double-Vote Dedup Resolution — The task's three-way menu is "drop the edge / demote to a labeled cross-check only / keep with justification." The middle option cannot be achieved by a master.mts edge change. Verified in t
- `_RESEARCH/audits/2026-07-18-data-consolidation/P7-corpse-deletelist.md` — P7 — Platform Corpse Delete List — Stream: P7 (platform corpses). Author: Opus subagent, 2026-07-18. READ-ONLY audit.
- `_RESEARCH/audits/2026-07-18-data-consolidation/P9-discoverability-wiring.md` — P9 — Discoverability Wiring (PLAN, do NOT apply) — build. Operator's rage: "every fucking Claude knows where to check first."
- `_RESEARCH/competitor-and-strategy/2026-08-02-email-enrichment-vendor-scan.md` — B2B contact-enrichment vendor scan — the 9 named in Clay's waterfall (08/02/2026) — Operator asked to crawl4ai each vendor individually: Prospeo, DropContact, Datagma, Hunter,
- `_RESEARCH/competitor-and-strategy/2026-08-04-followupboss-deep-crawl-extra1.md` — Take control of your pipeline and commissions — Start free trial
- `_RESEARCH/competitor-and-strategy/2026-08-04-followupboss-deep-crawl-extra2.md` — Your dream team: Motivated, accountable & fun — Leaderboard makes it easy to know where everyone stands.
- `_RESEARCH/competitor-and-strategy/2026-08-04-followupboss-deep-crawl-extra3.md` — Your data is safe and always yours. — We make security our business, so you can focus on yours.
- `_RESEARCH/competitor-and-strategy/2026-08-04-followupboss-deep-crawl-extra4.md` — FAQ — Find answers to common questions about our products and services in our frequently asked questions (FAQ) section
- `_RESEARCH/data-and-ingest/2026-07-30-patent-citation-graph-source-gated.md` — Patents + forward-citation graph — ACCESS IS VIABLE via Google Patents; USPTO's own portal is gated — conclusion was WRONG and the reason matters. I tested USPTO's portal, the Google Cloud console,
- `_RESEARCH/private/brains-for-stocks-architecture.md` — Brains for Stocks — The Architecture — The discipline Brains already enforces is the same pattern the production desks (JPMorgan, Morgan Stanley, Danske) ship for AI equity research:
- `_RESEARCH/private/stocks-brains-original-greeks-ibrx.md` — Stocks With Brains — The Improved Plan (delta, theta, edge, and IBRX) — The architecture genuinely fits — but the prior plan oversells the edge and under-builds the honesty layer, and that's exactly backwards. You already own the hard, boring 80%: a point-in-tim
- `_RESEARCH/private/stocks-with-brains-plan.md` — Brains for Stocks — The Architecture — The discipline Brains already enforces is the same pattern the production desks (JPMorgan, Morgan Stanley, Danske) ship for AI equity research:
