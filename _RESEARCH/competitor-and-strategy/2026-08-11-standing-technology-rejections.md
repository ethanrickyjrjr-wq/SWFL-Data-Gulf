# Standing technology rejections — the "should we adopt X?" answers, in one findable place

**Date:** 08/11/2026 · **Lane:** RULE 0.4 (ours first) · **Status:** reference, no build
**Why this file exists:** the LangChain question was asked and fully answered on 07/25/2026, then
asked again on 08/11/2026. Nobody forgot — the answer was sitting at **line 6351 of a 6,400-line
`_ASSISTANT/SCRATCHPAD.md`**, which is unfindable by design. A verdict nobody can retrieve gets
re-derived at full cost every time. This is the retrievable copy.

---

## How to use this file

1. **Before proposing or evaluating any tool/vendor/technique below, read its entry.** The work is
   already done, with evidence, on a date.
2. **A rejection here is not "we never looked."** Every one was probed against our own code first
   and, where an outside fact was needed, crawled live. The reason is stated, not assumed.
3. **To overturn one, name what changed** — a new capability, a changed constraint, a measured cost,
   a shipped feature. "It has a lot of stars" and "it seems like what people use" are not changes.
   Re-litigating without naming a change is the failure this file exists to stop.
4. **These are technology/vendor verdicts only.** They do not govern data questions
   (`docs/standards/data-roots.md`) or email builds (`docs/standards/email-build-playbook.md`).

---

## 1. Agent, workflow, and RAG frameworks — ALL REJECTED

Source for the group verdict: `_ASSISTANT/SCRATCHPAD.md` (07/25/2026 entry, operator: *"why do we
use NONE of them???"*). Dependency check that day and re-verified 08/11/2026: `package.json` carries
**zero** of them; our only AI-adjacent dependency is `zod` alongside `@anthropic-ai/sdk`.

**The categorical reason, which covers the whole group:** every one is horizontal infrastructure or a
model. Orchestrators, agent/workflow builders, a RAG engine, a chat UI, model weights, a competing
terminal agent. **Not one is a vertical data product.** They are what you use to BUILD something; we
built the something. Stars measure developer adoption of tools, not product value.

Star counts pulled live from the GitHub API on 07/25/2026 (real, not recalled), recorded so nobody
re-pulls them to make the same point: n8n 197,991 · Langflow 152,390 · Dify 150,242 · Open WebUI
146,727 · LangChain 142,585 · Gemini CLI 106,174 · DeepSeek-V3 104,005 · RAGFlow 85,992 · Llama
59,530 · CrewAI 56,126.

### LangChain / LangGraph — REJECTED (07/25/2026, re-confirmed 08/11/2026)

Three independent reasons, any one sufficient:

- **We already have the chain.** `refinery/lib/dag.mts` is 166 lines: topological sort over each
  pack's `input_brains`, three-color DFS cycle detection that throws with the full cycle path, pure
  functions, no I/O for topology. That *is* the DAG a framework would supply.
- **Our graph is authored, not model-chosen.** LangChain earns its weight when the model decides the
  next hop — runtime tool selection, dynamic routing, agent loops. Ours never does. Deterministic
  math runs in code; the LLM writes narrative on top. A framework built for model-chosen control
  flow buys nothing on a human-authored graph.
- **RAG collides head-on with the no-invention guards.** Document-RAG reintroduces exactly the
  unsourced-number failure that `gateNarrative` (`lib/deliverable/build.ts`, with its regenerate
  loop) plus the facts-only, inference-bait, grain-guard and smoothing lints in `refinery/validate/`
  exist to make structurally impossible. **This is an architectural position, not laziness.**

**What it would honestly buy us:** provider-swap abstraction and a prebuilt streaming/tool-call
harness. That is real, and it still does not clear the bar — the routing question was separately
researched (`_RESEARCH/agent-behavior/2026-07-30-model-routing-lanes-1-2-3.md`) and the answer was
per-call-site model selection across the metered call types, not a framework layer. Retry and
resilience already live in `refinery/lib/resilient-build.mts`.

**Verified 08/11/2026 — zero LangChain in code we own, both languages.** The only repo hits are
inside `ingest/.venv/Lib/site-packages/litellm/`, which is litellm's own bundled `langgraph` provider
adapter — vendored third-party code. None of the three requirements files (`requirements.txt`,
`requirements-analysis.txt`, `requirements-probe.txt`) declares litellm, langchain or langgraph, and
no Python file we wrote imports litellm. Do not mistake those venv hits for adoption.

### RAGFlow / Dify / Langflow / CrewAI — REJECTED (07/25/2026)

Same RAG and same horizontal-infrastructure reasoning as above. RAG specifically is **deliberately
rejected, not skipped.**

### n8n — REJECTED, but it had the one real argument (07/25/2026)

The honest case: the nested `workflow_call` single point of failure that froze data for three days is
a class of problem n8n's observability would surface. **But our actual missing piece was a freshness
detector on OUTPUTS**, which is far cheaper than running another service (RULE 11). Do not let this
become "adopt n8n" — it becomes "monitor destination timestamps."

### Open WebUI / Gemini CLI / Llama / DeepSeek — REJECTED (07/25/2026)

A chat UI, a terminal agent competing with the one we already use, and two sets of model weights.
None is a product surface we lack.

### Omnigent (Databricks meta-harness) — DO NOT ADOPT (07/30/2026)

Full research: `_RESEARCH/agent-behavior/2026-07-30-omnigent-meta-harness-and-local-ollama-agents.md`.
Alpha software, 331 open issues at time of review, built for a 5,000-engineer org, and its two best
features (bwrap/seatbelt OS sandbox + L7 egress proxy) are exactly what Windows drops. Name check so
nobody re-searches wrong: it is **Omnigent**, not "OmniAgent"; the agents are **Polly** and **Debby**.

**Three ideas worth stealing, at zero dependency cost:** cross-*vendor* review (the reviewer should be
a different vendor than the implementer); Debby's `/debate` structured disagreement; and
policy-as-config cost caps with a *soft* warning tier above the hard guard already in
`refinery/agents/anthropic.mts`.

**On local/Ollama in-house agents:** the measured monthly ceiling was small and most of it was jobs
already ruled out on quality — see the research file for the figures. The seam that would do it is
one file (`refinery/agents/anthropic.mts`), needing no Omnigent, no WSL, no alpha software. The
bucket actually worth attacking is interactive coding spend, which that table does not measure.

---

## 2. Data and transform tooling — REJECTED

### dbt-core — REJECTED, WRONG LAYER (06/28/2026)

Memory: `reference_dbt-evaluated-rejected`. Evaluated as a fix for the pipelines and rejected after
crawling live dbt docs and probing `ingest/`. dbt is the **T in ELT** — it transforms warehouse data
*already loaded*, so it structurally cannot reach the extract/load layer where our problems live.
Point by point: stop re-fetching is dlt incremental cursors, not dbt; rejecting bad data *before* it
lands is the one ask dbt cannot serve (its tests run post-land) and we already hold the right-layer
seam in `ingest/lib/schema_contract.py` + `ingest/lib/guards.py`; lineage-to-affected-brains would be
near-empty because our transforms are Python normalizers and TS packs, not SQL models; our freshness
handling in `ingest/cadence_registry.yaml` is *more* capable than dbt source freshness. Adopting it
also collides with two locked rules — deterministic-math-in-code and thin-pipe.

**The one honest fit** (optional, separate decision): consolidating the SQL-expressible slice into
tested dbt models as a *maintainability* initiative — bounded to SQL, never the packs. Do not
re-propose dbt as a pipeline fix.

### DuckLake — REJECTED

Evaluated and rejected alongside dbt. Do not re-propose as the "what big companies do" answer.

---

## 3. Techniques — REJECTED

### k-means / runtime clustering — REJECTED TWICE (07/22/2026)

Research: `_RESEARCH/real-estate-market/2026-07-22-kmeans-clustering-applicability.md`. Verdict
verbatim: *"we do not use it, and the two places it looks obvious are the two places we already
deliberately rejected it."* **At our N it is theater** (`docs/carve-out/EMAIL-BUILDER-CARVE-OUT.md`)
— a direct RULE 11 application.

**Correct one stale sub-claim while you are here:** "we have no way to run k-means" was never true —
numpy alone is more than enough. The rejection is about value at our volume, *not* about capability.
Do not re-reject it for the wrong reason.

---

## 4. Data vendors — REJECTED / NON-EXISTENT

### RentCast — DEAD, DO NOT RELITIGATE (07/01/2026)

Memory: `feedback_no-rentcast-dont-relitigate`. No API key exists in repo secrets; SteadyAPI
superseded it as the listings/photos source. **The trap:** `fetchSaleListings` in
`lib/listings/rentcast.ts` is empty-tolerant by design, so with no key it silently returns `[]`
forever — it looks like live infrastructure and is not. Never cite it as a current source, never
research its API or license terms again, never build assuming it is wired. It and its import in
`lib/listings/select.ts` are dead-code cleanup candidates.

### ATTOM — NEVER EXISTED

Global rules, verbatim: **there is NO ATTOM** — no MCP server, no API key, not wired anywhere.
`docs/data-intel.md` tags it catalogued-but-never-built. Sold-price reads come from the deed/official
-records and LEEPA lanes, not ATTOM.

### Firecrawl — BANNED VENDOR

RULE 0.4: **crawl4ai is the ONLY web-crawl tool — never Firecrawl.** Named here because it has been
found wired into a self-healing path before; if you see it in code, that is a defect to fix, not a
precedent to follow.

---

## 5. Product and scope — REJECTED

From `docs/carve-out/EMAIL-BUILDER-CARVE-OUT.md`:

- **A paid logo vendor.** Logo.dev was killed; favicon-to-globe fallback is the answer.
- **Per-tenant brain DAGs.** Each rebuild costs a paid model call; the general product needs ONE
  universal upload-to-figures path, not N hand-authored packs per tenant.
- **A second company.** Operator's own baseline (07/25/2026): no company, no users, execution trust
  low. Build this one.

---

## 6. What we actually have, so the comparison is honest

Verified inventory recorded 07/25/2026: 93 packs · 32 hooks · 11 hook test files · `gateNarrative`
plus five or more blocking lints · the data-roots catalog · the checks ledger and its sweeper.

**The two genuinely differentiated things** — worth stating plainly, because every framework above
gets compared against them: (1) an LLM output path that structurally cannot emit an unsourced number,
and (2) a guard harness that proves its own guards actually run.

---

## Related

- `_RESEARCH/agent-behavior/2026-07-30-model-routing-lanes-1-2-3.md` — the routing answer that
  replaces "adopt a framework."
- `_RESEARCH/agent-behavior/2026-07-30-omnigent-meta-harness-and-local-ollama-agents.md`
- `_RESEARCH/competitor-and-strategy/2026-07-25-guardrails-provenance-market-scan.md` — the
  provenance-moat market position these rejections protect.
- `_RESEARCH/real-estate-market/2026-07-22-kmeans-clustering-applicability.md`
