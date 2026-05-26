# Anthropic `web_search` — vendor-first wire-up notes (2026-05-26)

**Step 1 deliverable** for the [corridor character generator v2 plan](../superpowers/plans/2026-05-26-corridor-character-generator/README.md). Written by Opus 4.7 from in-session WebFetch + two live smoke tests + one A/B against the older tool version. Raw API responses are committed alongside this file as `anthropic-web-search-smoke-output.json` (initial smoke) and `anthropic-web-search-compare-output.json` (A/B). Re-runnable via `python scripts/smoke/anthropic_web_search_smoke.py` and `scripts/smoke/anthropic_web_search_compare.py`.

## TL;DR — three findings that change the plan

1. **Vendor stays, tool version changes.** Anthropic is still the pick, **but use `web_search_20250305`, NOT `web_search_20260209`.** The newer tool's "dynamic filtering" feature routes search results through code execution and emits text from Python variables, which **suppresses per-claim `citations[]` entirely** — Q1 returned 0 cited_text spans under `20260209` vs. 9 spans under `20250305` on the same prompt with the same model. Per-claim citations are the contract the v2 plan's facts-block lint depends on; without them the whole pick rationale collapses.
2. **Two SWFL publishers block Anthropic's crawler.** `news-press.com` and `naplesnews.com` return a 400 `invalid_request_error: "The following domains are not accessible to our user agent"` if you put them in `allowed_domains`. Removed from the seed allowlist below.
3. **Pine Ridge–specific NNN rents are not on the open web.** Both smoke tests confirmed the model cannot retrieve street-level NNN asking rents for Pine Ridge Road from any public broker, listing service, or county record — they're paywalled in LoopNet/CoStar or only released via direct broker contact. **This is structural for the corridor character generator**: the facts block will have to declare these as `{value: null, gap_reason: "not publicly disclosed"}` and let the speculative block do the inference work. The grounded call CAN reliably retrieve SWFL-wide and Naples-submarket figures (e.g. Q4 2025 overall asking rent $30.88/SF +31% YoY) with verbatim quotes back to Cushman & Wakefield via Gulfshore Business and Colliers research reports.

---

## Vendor contract verified

Source: WebFetch of `https://platform.claude.com/docs/en/docs/build-with-claude/tool-use/web-search-tool` (redirect target of the public docs URL), in-session 2026-05-26.

| Field                          | Verified value                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable tool type               | `web_search_20250305`                                                                                                                                            |
| Latest tool type               | `web_search_20260209` (adds dynamic filtering via code execution)                                                                                                |
| Models                         | `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6` (also Mythos Preview)                                                                                  |
| Tool params                    | `max_uses`, `allowed_domains[]`, `blocked_domains[]`, `user_location {type, city, region, country, timezone}`                                                    |
| Response — search-result block | `web_search_tool_result.content[].web_search_result` carries `url`, `title`, `page_age`, `encrypted_content`                                                     |
| Response — per-claim citation  | `text.citations[].web_search_result_location` carries `url`, `title`, `cited_text` (≤150 chars verbatim), `encrypted_index`                                      |
| Citation URL form              | **Raw publisher URL** — no Vertex-style redirect wrapper                                                                                                         |
| Pricing                        | $10 per 1,000 searches + standard token costs; one search = one `query` regardless of result count                                                               |
| Admin gate                     | Org admin must enable web search in Claude Console → settings/privacy (confirmed present for our key)                                                            |
| ZDR eligibility                | Requires `allowed_callers` workaround per server-tools docs                                                                                                      |
| Errors                         | API returns HTTP 200 with `web_search_tool_result_error` body; codes: `too_many_requests`, `invalid_input`, `max_uses_exceeded`, `query_too_long`, `unavailable` |
| Streaming                      | Supported; tool calls + results streamed as content blocks                                                                                                       |
| Batches API                    | Supported, same per-search pricing                                                                                                                               |

`anthropic-version` header is `2023-06-01`. SDK used in the smoke tests is `anthropic==0.104.1` (Python; auto-installed during this session — flag as setup dep for ingest pipelines).

---

## Smoke-test design — two questions, both targeting Pine Ridge Rd Naples

Pine Ridge Rd Naples chosen per the v2 plan: clean, medical-office, low confounders, and a corridor we already have in `corridor_profiles`. Two questions designed to stress the two failure modes of the two-block design:

### Q1 — Facts-block stressor (specific numeric value, primary-source coverage)

> _What is the current asking rent per square foot (NNN basis) for medical office or general commercial space along Pine Ridge Road in Naples, Florida? Quote specific dollar figures from 2025-2026 broker reports, listing services, or county records. Cite each number to its primary source._

**Stress-tested:** Whether the model returns specific dollar figures with verbatim `cited_text` spans suitable for the facts-block lint stack, and whether broker primary sources (Cushman, Colliers, CRE Consultants, IPC Naples) are reachable.

### Q2 — Speculative-block input stressor (recency, breadth, dot-connection)

> _What significant commercial real estate transactions, tenant announcements, new construction starts, or development news have affected Pine Ridge Road in Naples, FL during 2024, 2025, and early 2026? Include any noteworthy lease signings, building sales, or planning-board approvals along the corridor._

**Stress-tested:** Whether the grounded call surfaces useful context (news, brokerage announcements, planning items) the speculative block can connect into thought-provoking inference; whether multiple publishers appear together.

### Why two and not more

A third or fourth question wouldn't change the structural finding. The first two questions revealed the citation-collapse problem within minutes; once that was visible, the A/B against `web_search_20250305` resolved the vendor question definitively. Adding more questions before fixing the tool version would have spent searches on prompts whose responses we'd have to re-run anyway.

---

## Results

### Headline A/B — `web_search_20260209` vs. `web_search_20250305` on Q1, model `claude-sonnet-4-6`

| Variant                                      |  Input tokens | Output tokens | Searches | `cited_text` spans returned |
| -------------------------------------------- | ------------: | ------------: | -------: | --------------------------: |
| `web_search_20260209` (dynamic filtering)    |       200,976 |         4,293 |        6 |                       **0** |
| `web_search_20250305` (no dynamic filtering) | 73,341 (−63%) |  1,902 (−56%) |        5 |                     **9** ✓ |

The `20260209` variant emitted code-execution blocks (18 of them on Q1, 19 on Q2) that processed search results inside Python and returned text from variables — bypassing the citation pathway entirely. Same model, same prompt, same `allowed_domains` — the only difference was the tool version. Conclusion: **`20260209`'s "dynamic filtering" is incompatible with the citation-tagged-prose contract** that the facts-block lint needs.

### Q1 answer with citations (verbatim from `web_search_20250305` variant)

The model correctly refused to fabricate a Pine Ridge–specific NNN figure and reported:

> Despite searching across Cushman & Wakefield, Colliers, LoopNet, CoStar, IPC Naples, CRE Consultants, and Gulfshore Business, **no publicly indexed listing or broker report discloses a specific, current NNN asking rent in dollars-per-square-foot tied exclusively to Pine Ridge Road addresses** as of May 2026. The property-level pages for 6376 Pine Ridge Road (Cushman & Wakefield) and 1575 Pine Ridge Road (IPC Naples) render without price data in their publicly accessible search snippets.

What it **did** return with verbatim citations:

| #    | Cited URL                                                                                  | Cited text (verbatim, truncated to 150 chars)                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 2 | gulfshorebusiness.com — Southwest Florida sees office rent skyrocket in 2025 (Feb 2, 2026) | "Overall, asking rents reached $30.88 per square foot in the fourth quarter, a 31% increase from a year earlier, according to Cushman & Wakefield C..."     |
| 3    | colliers.com — Southwest Florida Office Market Report 2025 Q4 (Jan 28, 2026)               | "While Naples maintained its premium positioning through strong demand for Class A properties, Bonita/Estero, Cape Coral, and Ft. Myers witnessed large..." |
| 4    | colliers.com — Southwest Florida Office Market Report 2025 Q3 (Nov 13, 2025)               | "Limited new supply and steady absorption suggest landlords in prime locations retain pricing leverage."                                                    |
| 5    | gulfshorebusiness.com — same Feb 2026 article                                              | "Supply, however, has remained severely constrained. Just 18,722 square feet of new office space was delivered in 2025, with only 12,516 square feet un..." |
| 6    | gulfshorebusiness.com — same Feb 2026 article                                              | "Southwest Florida continues to defy the national office narrative," said Gary Tasman, CEO and principal broker of Cushman & Wakefield Commercial Prop..."  |
| 7    | cushmanwakefield.com — 6376 Pine Ridge Rd. listing page                                    | (page metadata, no rent quoted)                                                                                                                             |
| 8    | cushmanwakefield.com — Fort Myers/Naples MarketBeats                                       | "Healthcare employment continues to support demand across Southwest Florida, with approximately 2,300 education and health services jobs added between ..." |
| 9    | colliers.com — Southwest Florida Office Market Report 2025 Q2 (Aug 14, 2025)               | "Healthcare, professional services, and education continue to dominate tenant activity, while Class A leasing in Naples and Bonita Springs remains the ..." |

Every citation is a **raw publisher URL** with a coherent verbatim span. This is exactly what the facts-block lint contract assumed.

### Q2 (`web_search_20260209` variant only — both Q2 runs used the newer tool, citations were 0)

Q2 prose was rich but uncited: the model surfaced Genesis of Naples luxury dealership groundbreaking at Pine Ridge & I-75 (Jan 2026, completion early 2027), Benderson Development's acquisition of Carillon Place (250K SF retail, SE corner of Airport-Pulling & Pine Ridge), Physicians Regional's 107K SF MOB at 6376 Pine Ridge Rd, The Oasis replacing Pelican Larry's at 1046 Pine Ridge Rd, and a Mission Square retail condo sale at 1575 Pine Ridge Rd. **All accurate per the search-result URLs**, but emitted from Python variables without citation tags — useless for the facts-block lint, fine as input to the speculative block.

**Implication for Stage B:** the speculative block can still use `20260209` if dynamic-filtering's token-economy wins matter for inference (it'd cut input from 325K → ~120K), since the speculative block doesn't enforce per-claim citations. But the **default for the corridor character generator is `web_search_20250305`** for both blocks — the simpler contract is worth the extra tokens, and the synthesizer can always re-cite from the raw `web_search_result` blocks if needed.

---

## Blocked publishers (real finding from this session)

Including these in `allowed_domains` causes the API to reject the entire request with HTTP 400 `invalid_request_error`:

- `news-press.com` — blocks Anthropic crawler
- `naplesnews.com` — blocks Anthropic crawler

Per [Anthropic's crawler policy](https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), the site owners opted out. **Action:** drop these from the seed allowlist; rely on Gulfshore Business for SWFL news coverage. If primary news-coverage gaps emerge, the speculative block can disclose "publisher X is not indexed by our grounded-search vendor" as a gap_reason — no Firecrawl fallback proposed here (separate plan if needed).

---

## Seed `allowed_domains` — verified, ready to ship

Use exactly this list for Stage B until a real corridor question proves a gap. Grow from observed misses, not from imagination.

```text
# SWFL brokerages
cushmanwakefield.com
lsicompanies.com
creconsultants.com
ipcnaples.com
cbre.com
colliers.com

# County / municipal
leegov.com
colliercountyfl.gov
leepa.org
collierappraiser.com

# News (Gulfshore only — News-Press and Naples News block Anthropic's crawler)
gulfshorebusiness.com

# Federal / state data
fred.stlouisfed.org
bls.gov
census.gov
fema.gov
fdot.gov
```

`user_location` setting that worked: `{type: "approximate", city: "Naples", region: "Florida", country: "US", timezone: "America/New_York"}` — model surfaced FRED Naples-Marco Island MSA series unprompted, suggesting localization is being honored.

---

## Token economics — for the corridor character generator budget

From the smoke runs:

| Path          | Input tokens | Output tokens | Searches |                                          Cost/query (rough) |
| ------------- | -----------: | ------------: | -------: | ----------------------------------------------------------: |
| `20250305` Q1 |          73K |          1.9K |        5 | $0.05 search + ~$0.22 in/$0.03 out @ Sonnet-4-6 ≈ **$0.30** |
| `20260209` Q1 |         201K |          4.3K |        6 | $0.06 search + ~$0.60 in/$0.06 out @ Sonnet-4-6 ≈ **$0.72** |
| `20260209` Q2 |         325K |          5.0K |        6 |                               similar to above, ≈ **$1.05** |

Stage B does one query per corridor × 26 corridors × quarterly cadence. Annual budget at `20250305` ≈ **$30** for the grounded-call layer. Stage C (synthesis) is a separate call without `web_search` and won't add much. **Negligible — no need for batching or rate-shaping in v1.**

---

## What the v2 plan needs to change

These are concrete edits to the canonical plan and memory based on tonight's findings. Doing in this same commit to keep the plan honest.

1. **`docs/superpowers/plans/2026-05-26-corridor-character-generator/README.md`** — every `web_search_20260209` reference flips to `web_search_20250305`. Add one sentence to Step 1 noting the A/B finding and that dynamic filtering kills citations.
2. **`docs/vendor-notes/grounded-search-research-2026-05-26.md`** — append a "2026-05-26 wire-up correction" note at the top: tool version is `20250305`, not `20260209`; the research agent's "dynamic filtering as advantage" framing was wrong for our use case.
3. **Memory `project_corridor-character-generator.md`** — the "Vendor lock" section updates to name `20250305` and add one line about the A/B.
4. **No CLAUDE.md change.** Rule 8 carve-out is about the speculative block, independent of tool version.

---

## Next steps — Opus vs Sonnet split, parallel-eligible flagged

The v2 plan's Step 2 ("one-corridor generator end-to-end for Pine Ridge Rd Naples") can decompose into 5 tasks. Three of them can run in parallel against the same plan; two are sequential because the synthesis call needs the others to be defined first.

### Parallel batch A — Opus 4.7 (architecture-shaped TS work)

These two ship in the same PR but can be developed in parallel; both are pure functions, fully unit-testable, no network calls.

**A1. Stage A — Fact pack builder**

- File: `refinery/tools/build-corridor-fact-pack.mts`
- Scope: per-corridor pull from `corridor_profiles`, `data_lake.marketbeat_swfl`, `data_lake.bls_laus`, `data_lake.fdot_aadt_*`, `data_lake.zori_swfl`, `data_lake.fema_nfip_*`, `data_lake.lee_building_permits` (Lee only — Collier gets `{value: null, gap_reason: "Collier County not in lee_building_permits ingest"}`).
- Output JSON shape: per metric `{current: {value, units, source_url, as_of}, important_math: {yoy_delta, trailing_direction, swfl_distribution_quartile} | null}`. Missing → explicit `{value: null, gap_reason: "..."}`.
- Reads prior `character_facts` + `character_speculative` for the same corridor, packages as `prior_quarter_context`.
- Computes `fact_pack_vintage = "OLDEST-{YYYY-MM}"` from oldest input.
- Acceptance: `--corridor="Pine Ridge Rd Naples"` writes a valid JSON to stdout with no nulls outside `gap_reason`-tagged slots; unit tests cover the gap path.

**A2. SQL migration**

- Authoritative DDL exactly as written in the v2 plan; check into `docs/sql/` (path per existing pattern — verify).
- 6 columns: `character_facts TEXT`, `character_chart JSONB`, `character_speculative TEXT`, `character_citations JSONB`, `character_generated_at TIMESTAMPTZ`, `character_fact_pack_vintage TEXT`.
- Do NOT touch `character` — old text stays as cold fallback for one quarterly cycle.
- Acceptance: migration applies clean against current `corridor_profiles`; rollback path documented.

### Sequential batch B — Sonnet 4.6 (Python pipeline work, matches `news_swfl` pattern)

**B1. Stage B — Grounded web call + Tier-1 capture** (depends on this wire-up note)

- File: `ingest/pipelines/corridor_grounded/pipeline.py`
- Pattern: copy `news_swfl` skeleton (sync flow with `storage_uploader.py` + `tier1_inventory.py`).
- Tool: `web_search_20250305` (NOT `20260209` — see the A/B above).
- Allowlist: ship the seed list from this doc inline; mark with `# audited 2026-05-26 — do not add news-press.com or naplesnews.com (block Anthropic crawler)`.
- One call per corridor; capture full response + every `citations[]` entry to `lake-tier1` NDJSON.
- `--corridor=<name>` + `--all` + `--dry-run` per pipeline-freshness standard.
- Cadence registry entry per `ingest/cadence_registry.yaml`.
- Acceptance: dry-run against Pine Ridge Rd Naples writes NDJSON to local path; smoke that `cited_text` spans are present in the captured payload (re-use `scripts/smoke/anthropic_web_search_compare.py` as the assertion shape).

### Sequential batch C — Opus 4.7 (synthesis + lint, depends on A1 + B1 contracts being firm)

**C1. Stage C — Two-block synthesizer**

- File: `refinery/tools/synthesize-corridor-character.mts`
- Inputs: fact pack JSON (A1), Tier-1 grounded blob (B1), prior-quarter context (A1).
- One model call, structured prompt emitting `{facts_block, chart_block, speculative_block}`.
- Prompt fragments are in the v2 plan Step 2; iterate against Pine Ridge output.
- `--preview` writes to stdout only.
- Acceptance: Pine Ridge run produces a facts block whose every numeric claim has a matching `[internal-N]` or `[web-N]` ref + a speculative block ending with the required disclaimer.

**C2. Lint stack split by block** (same PR as C1)

- `spec-validator` + `facts-only-lint` + `inference-bait-lint` + `numeric_softening` ban on `facts_block`.
- `spec-validator` + disclaimer-presence + hedging-presence-around-inferred-numbers on `speculative_block`.
- Structural-only on `chart_block`.
- Acceptance: a deliberately malformed run (fake tenant name in facts, unhedged inference in speculative, missing disclaimer) is rejected and DB is untouched.

### Suggested invocation

```
Branch: feat/corridor-character-generator-step-2
Day 1 morning: spawn two Opus subagents → A1 + A2 in parallel (worktree pattern)
Day 1 afternoon: spawn one Sonnet subagent → B1 (against the verified A2 DDL contract)
Day 2: Opus solo → C1 + C2 (needs A1 fact-pack JSON shape and B1 NDJSON shape to be stable)
Day 2 EOD: ship as one PR, all four pieces together, per "atomic type-lift" rule in CLAUDE.md
```

**Worktree pattern** (per the cleanup-pass SESSION_LOG entry): `git worktree add ../brain-platform-corridor-step-2 feat/corridor-character-generator-step-2` so the parallel sessions don't share a working tree.

---

## Artifacts committed alongside this note

- `docs/vendor-notes/anthropic-web-search-smoke-output.json` — raw responses from the initial 2-question smoke (both `web_search_20260209`)
- `docs/vendor-notes/anthropic-web-search-compare-output.json` — raw responses from the A/B (`20260209` vs `20250305`)
- `scripts/smoke/anthropic_web_search_smoke.py` — re-runnable two-question smoke
- `scripts/smoke/anthropic_web_search_compare.py` — re-runnable A/B compare

All four re-run cleanly with `python <path>` once `ANTHROPIC_API_KEY` is in `.env.local` and `pip install anthropic` has run. Total cost to reproduce: < $3.
