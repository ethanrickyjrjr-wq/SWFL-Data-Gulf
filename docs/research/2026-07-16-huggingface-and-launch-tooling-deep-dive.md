# HuggingFace Deep Dive + Launch/Build Tooling — Session 2026-07-16

**Date:** 2026-07-16
**Context:** Operator directive — "huggingface seems to have tons of data and resources we can use,
deep deep dive with crawl4ai to find answers to data problems and solutions," plus a second ask:
better ways to get the project off the ground with automation, marketing ideas, and tools that make
AI building more reliable ("not making up numbers"). All findings below are from live crawl4ai
fetches this session (RULE 0.4) — no memory, no guessing. Checks opened for every deferred
adopt-candidate per RULE 2.4: `promptfoo_factuality_ci_gate`, `hhem_narrative_consistency_scorer`,
`n8n_ops_alerting_automation`.

---

## Part 1 — Is HuggingFace a usable DATA source for SWFL Data Gulf? Verdict: **no, skip.**

Searched HF Hub datasets across `real estate`, `census`, `parcel`, and the `geospatial` modality
filter (1,036 datasets tagged geospatial). Consistent pattern across all four:

### Real estate search
Top-trending results are almost entirely hobbyist/toy uploads: single-city scrapes (Dubai, Konya,
Russia), synthetic chatbot dialogue sets, and ML-competition practice data. The one org-backed
result, **`zillow/real_estate_v1`** (21.4k rows, Zillow Group), turned out to be a **synthetic
GPT-4o-generated chatbot dialogue dataset** ("Hi, I'm considering moving to a new neighborhood...")
built to train a *compliant real-estate chatbot* — not market data. Its companion GitHub repo
(`zillow/compliant-real-estate-chatbot`) is a genuinely interesting reference for real-estate AI
*compliance patterns*, not a data source.
- **Verdict:** skip as a data source.
- **Source:** https://huggingface.co/datasets?search=real+estate | https://huggingface.co/datasets/zillow/real_estate_v1
- **Date:** 2026-07-16

### Census search
Dominated by the classic UCI "Adult Census Income" ML-benchmark dataset (income-bracket
classification, nothing to do with ACS demographics) reposted under a dozen different names, plus
raw `alea-institute/kl3m-data-dotgov-www.census.gov` web-crawl corpora built for LLM pretraining
(unstructured HTML dumps, not queryable tables). One exception, **`rwcitek/us_census_tracts_2025`**
(85.5k rows, 140 downloads), is a third-party Parquet re-host of Census TIGER/Line tract boundary
geometries — same data we already reach directly and authoritatively via the Census API (per
global CLAUDE.md Core Stack), but here with **no README, no documented vintage/provenance chain**,
which would fail our own citation rule (source citation must be the homepage URL, not a re-host).
- **Verdict:** skip — we already hold the authoritative direct source with better provenance.
- **Source:** https://huggingface.co/datasets?search=census | https://huggingface.co/datasets/rwcitek/us_census_tracts_2025
- **Date:** 2026-07-16

### Parcel search
Returns French cadastral (BDNB), Russian cadastral, Italian parcels, and — most of the
first page — **robotics pick-and-place datasets** named "parcelot" from a LeRobot hackathon
(literally warehouse box-sorting training data, unrelated homonym). Nothing for US/Florida parcels.
- **Verdict:** skip. FDOR statewide parcel layer + county property appraiser feeds remain the only
  real source (per `docs/standards/data-and-build-bible.md` full-scope-first rule).
- **Source:** https://huggingface.co/datasets?search=parcel
- **Date:** 2026-07-16

### Geospatial modality (1,036 datasets)
Overwhelmingly satellite/remote-sensing imagery for computer-vision training (crop stress,
wildfire, flood-segmentation, land-cover classification) — a completely different use case
(training vision models) from ours (serving cited tabular civic data). None are county-grain
tabular sources.
- **Verdict:** skip for data. Flood/land-cover imagery models are a possible FUTURE angle if we
  ever build our own flood-risk imagery classifier, but that's speculative and not scoped now.
- **Source:** https://huggingface.co/datasets?modality=modality%3Ageospatial&sort=trending
- **Date:** 2026-07-16

**Bottom line on Part 1:** HuggingFace Hub is a model/ML-training-data marketplace, not a civic/
real-estate data provider. Every promising-looking dataset was either a toy, a synthetic set, or a
worse-provenance mirror of a source we already hold directly (FDOR, Census API, county appraisers —
all named in CLAUDE.md's four-lane sourcing). **Do not spend further session time re-searching HF
for SWFL data** — this verdict is the answer, not a gap to keep probing.

---

## Part 2 — What HuggingFace IS good for: catching AI that "makes up numbers"

This is the actually valuable find, and it speaks directly to THE GOAL's no-invention mandate
(`gateNarrative`, `facts-only-lint`, `inference-bait-lint`, `smoothing-lint` in
`refinery/validate/spec-validator.mts`). Those existing lints are regex/keyword-based. HF hosts
purpose-built **semantic** consistency-scoring models — a different, complementary detection layer.

### Vectara HHEM-2.1-Open (`vectara/hallucination_evaluation_model`)

- **Verdict:** adopt-candidate (Tier 3, decoupled Python job) — check opened:
  `hhem_narrative_consistency_scorer`
- **What it does:** Takes a `(premise, hypothesis)` pair — e.g. premise = the facts in a pack's
  `--- OUTPUT ---` block, hypothesis = the LLM-generated narrative sentence summarizing them — and
  returns a 0–1 factual-consistency score. Purpose-built NLI classifier (fine-tuned on
  `google/flan-t5-base`), not a general chat model repurposed as a judge.
- **Why it's credible:** benchmarked on AggreFact-SOTA and RAGTruth against GPT-3.5-Turbo and
  GPT-4 zero-shot — **HHEM-2.1-Open beats both** on balanced accuracy in every reported benchmark
  (e.g. RAGTruth-QA: 74.28% vs GPT-4's 74.11%, GPT-3.5's 56.16%). Maintained by Vectara, whose
  public hallucination leaderboard (`github.com/vectara/hallucination-leaderboard`) is the
  commonly-cited industry reference for LLM hallucination rates.
- **Deployability:** Apache-2.0 licensed. 0.1B params, 439MB safetensors, <600MB RAM, ~1.5s per
  2k-token input on a modern x86 CPU — genuinely runs on ordinary hardware, no GPU needed.
- **Caveat (verified, not assumed):** the model card requires `trust_remote_code=True` — it ships
  a custom `modeling_hhem_v2.py`, not a stock `AutoModelForSequenceClassification`. It's
  Python/`transformers`-only; there is no official ONNX/JS port. One third-party ONNX mirror
  (`FamiliarTools/HHEM-2.1-Open-onnx`, uploaded 25 days before this research, low adoption) exists
  but is unvetted — do not trust it for a production gate without independently verifying its
  outputs match the original PyTorch model's scores.
- **Fit with our stack:** same shape as the already-adopted `dlt` pattern from
  `docs/research/2026-05-16-tool-audit.md` — "Python-only... best pattern: runs as a standalone
  scheduled Python job outside the Bun refinery, writes to Supabase, TypeScript reads the output
  table." Do the same here: a scheduled Python scorer (using the pinned `crawl4ai-venv`-style
  approach, or a dedicated venv) that scores narrative-vs-facts pairs post-synthesis and writes
  low-consistency flags to a table for review — never inline in the live `/api/b/*` request path.
- **Considered and rejected:** `grounded-ai/phi3-hallucination-judge` (a Phi-3 PEFT adapter,
  binary classifier) — only 79% accuracy on its own reported benchmark, and a 3B+ base model
  realistically needs GPU for acceptable latency. HHEM is smaller, faster, and independently
  benchmarked higher.
- **Source:** https://huggingface.co/vectara/hallucination_evaluation_model | https://huggingface.co/grounded-ai/phi3-hallucination-judge
- **Date:** 2026-07-16

### promptfoo (github.com/promptfoo/promptfoo)

- **Verdict:** adopt-candidate (stronger fit than HHEM for CI) — check opened:
  `promptfoo_factuality_ci_gate`
- **What it does:** "Pytest for LLM apps." A **Node.js/TypeScript-native**, MIT-licensed CLI
  (23.3k GitHub stars, commits landing daily as of this research) with a built-in `factuality`
  assertion type — an LLM-as-judge / G-Eval-style scorer that compares a model's output against a
  reference fact and flags disagreement, subsumption, or contradiction. Ships a ready-made example
  (`npx promptfoo@latest init --example huggingface/dataset-factuality`) that pulls the
  TruthfulQA dataset straight from HuggingFace — a direct bridge between the HF ecosystem and a
  tool that actually fits our stack.
- **Why this beats HHEM/DeepEval for us specifically:** it's `npx`-installable, no Python
  decoupling needed — runs directly inside a Bun/Node CI step, the same place `bun test` and
  `refinery:typecheck` already run. Candidate: a CI check that runs pack narrative output through
  a factuality assertion against its own `--- OUTPUT ---` block before merge, complementing (not
  replacing) the existing regex-based `facts-only-lint`/`inference-bait-lint` — this catches
  *semantic* drift those can't (e.g., a true-but-unsupported number, per the classic "capital of
  France is Berlin/Paris" asymmetric-hallucination example both HHEM's and promptfoo's docs use).
- **Caveat (verified, not assumed):** promptfoo's own docs carry a banner as of this research:
  **"Promptfoo is now part of OpenAI."** The CLI's GitHub license file is still plain MIT as
  fetched today, so nothing changes today — but flag the acquisition as a governance fact worth
  re-checking before deeper integration (e.g., watch for OpenAI-model-only feature gating).
- **Considered and rejected:** `confident-ai/deepeval` (16.9k stars, "Pytest for LLM apps," has a
  `hallucination` metric) — same category as promptfoo but **Python-only**; promptfoo wins on
  stack fit alone, all else being comparable.
- **Source:** https://github.com/promptfoo/promptfoo | https://www.promptfoo.dev/docs/guides/factuality-eval/ | https://github.com/confident-ai/deepeval
- **Date:** 2026-07-16

**Recommended layering (not yet built, just the shape):** promptfoo factuality assertion as a
**pre-merge CI gate** on any pack/deliverable-narrative diff (fast, TS-native, catches drift before
it ships) + HHEM as a **scheduled post-hoc auditor** across all live brain output (slower, more
rigorous, catches anything CI missed). Two independent scorers, cheap in combination, neither
replaces the deterministic-math rule (Brain Factory rule #2) — both only ever check the *prose*,
never compute a number themselves.

---

## Part 3 — Automation & launch tooling (the "off the ground" ask)

Cross-checked against the same-day `docs/superpowers/plans/2026-07-16-marketing-launch-plan.md`
(five rounds of SteadyAPI social-listening research already on file) to avoid duplicating it.
That plan owns the content/outreach/funnel strategy — this section adds two things it doesn't
cover: workflow orchestration and a concrete SEO methodology for an already-open decision.

### n8n — workflow automation

- **Verdict:** adopt-candidate for internal ops alerting, NOT a marketing auto-post unlock —
  check opened: `n8n_ops_alerting_automation`
- **What it does:** Code-or-UI workflow automation (196.6k GitHub stars), self-hostable via
  Docker, native HTTP/webhook/Postgres nodes, an "evaluate AI natively" feature for guardrailing
  any AI step in a flow.
- **License fact, verified (not assumed):** core n8n is **Sustainable Use License** ("fair-code"),
  **not** an OSI-approved open-source license — free to self-host for internal use, restricted
  from reselling as a competing hosted service. Fine for our use (internal ops), just don't call
  it "open source" without the qualifier.
- **What it does NOT solve:** the marketing plan is explicit that `lib/social/` auto-posting is
  blocked on **Meta Business Verification** (an approval, not a tooling gap) — n8n doesn't change
  that timeline.
- **Genuinely new angle:** wiring `public.checks` / the cron-incident ledger / nightly-chain
  failures into a Slack or email alert without hand-rolling webhook code. Not yet scoped against a
  specific missing alert — the check tracks picking one concrete pilot case.
- **Source:** https://n8n.io/ | https://raw.githubusercontent.com/n8n-io/n8n/master/LICENSE.md
- **Date:** 2026-07-16

### Programmatic SEO — concrete methodology for the open `/r/` pages decision

The marketing plan already has an open item (`marketing_blog_decision_r_pages`) leaning toward
publishing market-insight write-ups as public `/r/` report pages instead of a new `/blog` surface.
Ahrefs' programmatic-SEO methodology gives that decision a concrete "why this works, why it
doesn't become spam" framework, sourced from real examples (Nomadlist location pages: ~41,200
monthly organic visits off 25,873 pages; Wise currency-pair pages: ~4.67M monthly visits).
- **Google's own stated risk** (John Mueller, cited in the piece): "Programmatic SEO is often a
  fancy banner for spam." The dividing line the article gives, backed by its examples, is
  **proprietary + relevant data**, not just page-count scale.
- **Why this maps cleanly onto us:** the pattern the article describes — a keyword family that
  scales by location ("cost of living in [state]") matched to a data-backed page template — is
  structurally identical to a per-ZIP or per-corridor `/r/` report page backed by our own SWFL
  lake data. We already hold the two things the article says separate "helpful" from "spam":
  proprietary data (our lake) and genuine per-page relevance (real local numbers, not templated
  filler). This is supporting evidence for the existing check's recommended direction, not a new
  build — no new check opened for it.
- **Source:** https://ahrefs.com/blog/programmatic-seo/
- **Date:** 2026-07-16

---

## What this deep dive did NOT find (explicitly, so it isn't re-searched blind)

- No HF dataset usable as a primary or secondary SWFL data source at any grain (parcel, ZIP,
  county, tract) — confirmed across four search angles, not just one.
- No HF Space or model directly usable as an embeddable public-facing "free tool" lead magnet —
  not searched exhaustively (out of scope for this pass; flag for a future round if the operator
  wants a specific interactive-widget angle).
- Did not evaluate Guardrails AI, RAGAS, or TruLens (adjacent RAG-eval libraries) — promptfoo and
  DeepEval were sufficient to establish the TS-vs-Python stack-fit verdict; revisit only if
  promptfoo's factuality assertion proves insufficient in a real pilot.
