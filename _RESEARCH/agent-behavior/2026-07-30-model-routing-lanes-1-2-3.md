# Model routing — lanes 1, 2, 3 (+ lane 4 rebuilt from code)

**Date:** 07/30/2026 · **Lane:** RULE 0.4 (ours first, then crawl4ai live) · **Status:** research, no build
**Companion:** `2026-07-30-omnigent-meta-harness-and-local-ollama-agents.md` — read that first; this
file is the other three lanes of the same four-lane question it opened.

**Operator ask (RULE 0.9.3):** "who is good at what is UNKNOWN until researched. Never write a
routing table — which model gets which job — from memory."

**Framing correction up front.** The omnigent file already measured the money: product API spend is
**$50.12/30d**, of which **$27.71 is jobs already ruled out on quality** (the pulse-distill
SONNET-lock precedent), and the bucket that actually matters — interactive coding spend — is
**still unmeasured** (`interactive_coding_spend_unmeasured`). So this is a **capability-fit**
document, not a savings document. Any dollar figure below is a denominator, never an argument.

---

## 0. Lane 4 — OUR JOB INVENTORY (rebuilt; it was vapor)

`route_research_4_job_inventory` was open and untouched, and no file or SESSION_LOG entry carried
lane 4's output — only the 11-row `call_type` cost table in the omnigent file's §5, which is the
*product API* half of a check that asks for "call types **+ coding/agent work**." Rebuilt here from
the code, because lanes 1 and 3 have no rows to index against without it.

### 0a. Product runtime — TypeScript (`refinery/agents/anthropic.mts:19`)

The `CallType` union, 11 values, verbatim from the file:

`synthesis` · `triage` · `assistant_stream` · `assistant_chart` · `email_build` ·
`deliverable_build` · `proof` · `narrative_bake` · `insiders_author` · `factuality_ci` · `other`

Every call routes through `getAnthropic(callType)` (`anthropic.mts:493`), which wraps the messages
and batches surfaces (`wrapMessageSurface` / `wrapBatchesSurface`) so each response lands in
`public.api_usage_log`. This is the ONE metering root.

### 0b. Ingest runtime — Python (8 more call types, grep-verified)

| `call_type` | File |
|---|---|
| `ingest_extract` | `ingest/lib/extract_client.py:202` |
| `ingest_corridor_grounded` | `ingest/pipelines/corridor_grounded/pipeline.py:183` |
| `ingest_corridor_pulse_distill` | `ingest/pipelines/city_pulse_corridors/distill.py:216` |
| `ingest_city_pulse_distill` | `ingest/pipelines/city_pulse/distill.py:251` |
| `ingest_dbpr_notices` | `ingest/pipelines/dbpr_public_notices/summarize.py:26` |
| `ingest_dbpr_press` | `ingest/pipelines/dbpr_press_releases/enricher.py:98` |
| `ingest_report_research` | `ingest/pipelines/report_design_research/crawl_report_designs.py:97` |
| `ingest_marketbeat` | `ingest/pipelines/marketbeat_pdf/extractor.py:505` |

Python meters through `log_api_usage()` (`ingest/lib/api_usage.py:83`) into the same table.

**19 distinct metered call types total** (11 TS + 8 Python).

### 0c. Which model each job actually gets today (grep-verified)

| Constant | Value | Where |
|---|---|---|
| `TRIAGE_MODEL` | `claude-haiku-4-5` | `refinery/agents/anthropic.mts:6` |
| `SYNTHESIS_MODEL` | `claude-sonnet-4-6` | `refinery/agents/anthropic.mts:8` |
| `SEARCH_MODEL` | `claude-sonnet-4-6` | `lib/assistant/gap-fill.ts:29` |
| `DELIVERABLE_MODEL` | `process.env.DELIVERABLE_MODEL \|\| SYNTHESIS_MODEL` | `lib/deliverable/build.ts:51` |
| `EXTRACTION_MODEL` | `claude-haiku-4-5` | `app/api/projects/[id]/extract-pdf/route.ts:22` |
| `ACTION_MODEL` | `claude-haiku-4-5` | `app/api/projects/[id]/action/route.ts:34` |
| `COMMAND_MODEL` | `claude-haiku-4-5` | `app/api/email/schedule-command/route.ts:44` |
| Email lab dial | haiku / sonnet-4-6 / opus-4-8 by `mode` | `lib/email/model-router.ts:12-26` |

So the de-facto routing table already in the code is **two tiers**: Haiku for classification and
extraction, Sonnet for synthesis and narrative, with an operator-triggered Opus escape hatch on the
email lab only.

### 0d. Coding / agent work — the half the cost table never sees

- **17 of 112 GHA workflows** carry `ANTHROPIC_API_KEY` or `anthropics/claude-code-action@v1`.
- **3 run a full Claude Code agent in CI:** `claude-code-automation.yml`, `claude-deploy-triage.yml`,
  `chief-of-staff-nightly.yml` (the last pinned `--model claude-sonnet-4-6`, "judgment only", with a
  deterministic $0 evidence-collection step ahead of it and a deterministic lint gate behind it —
  that is the pattern worth copying).
- **1 uses the SDK directly:** `heal-cron-failure.yml` L2 diagnose step, on `@anthropic-ai/sdk`.
- **9 repo-local subagents** in `.claude/agents/` (answer-engine-guardian, constitution-builder,
  deliverable-builder, ingest-engineer, meddpicc-auditor, project-state-sync, second-order,
  v3-spec-guard, website-builder).
- **Interactive Claude Code sessions — UNMEASURED.** Not in `api_usage_log`, not in any workflow.
  This is the bucket the omnigent file named and it is still the largest unknown on the page.

---

## 1. Lane 1 — WHO IS GOOD AT WHAT

### 1a. 🔴 The finding that is a defect, not a benchmark

The in-repo authority (`claude-api` skill, invoked this session) lists the current catalog as
Fable 5 `claude-fable-5` $10/$50 · **Opus 5 `claude-opus-5` $5/$25** · Opus 4.8 `claude-opus-4-8`
$5/$25 · Opus 4.7 · Opus 4.6 · **Sonnet 5 `claude-sonnet-5` $3/$15 (intro $2/$10 through
08/31/2026)** · Sonnet 4.6 `claude-sonnet-4-6` $3/$15 · Haiku 4.5 `claude-haiku-4-5` $1/$5.

Our `RATES` table (`refinery/agents/anthropic.mts:53-64`) holds **four rows**: sonnet-4-6,
haiku-4-5, opus-4-8, fable-5. **`claude-opus-5` and `claude-sonnet-5` are absent.**

`computeCostUsd` (`anthropic.mts:93-94`) is explicit: `const rate = RATES[model] ?? RATES[baseModelId(model)]; if (!rate) return 0;`
— an unrecognized model **bills $0 rather than guessing**, by design. That design is right, and it
means the failure is silent: the first call routed to Opus 5 or Sonnet 5 logs a row with real token
counts, **`cost_usd = 0`**, and contributes nothing to the daily/monthly spend guard. This is the
exact shape of the Opus-4-8 bug the file's own comment records ("Missing this silently priced every
Opus call at $0") and the Fable-5 one below it. Third instance of the same hole.

**This is a prerequisite to any routing change, not a consequence of one** — adding a routing table
without adding the rate rows makes new routes invisible to the guard.

### 1b. Berkeley Function-Calling Leaderboard V4 — the measure for tool use

`gorilla.cs.berkeley.edu/leaderboard.html`, crawled live 07/30/2026. **Board last updated
2026-04-12** — read that caveat before the numbers.

Column alignment was verified programmatically (35 header columns ↔ 35 data columns per row) after a
first pass collapsed the two distinct **Memory** and **Multi-turn** columns into one. Both are shown
separately below.

| # | Model | Overall | Web search | Memory | Multi-turn | Non-live AST | Live AST | Cost ($) | License |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Claude-Opus-4-5 (FC) | 77.47 | 84.5 | 73.76 | 68.38 | 88.58 | 79.79 | 86.55 | Proprietary |
| 2 | Claude-Sonnet-4-5 (FC) | 73.24 | 81 | 64.95 | 61.37 | 88.65 | 81.13 | 43.73 | Proprietary |
| 4 | **GLM-4.6 (FC thinking)** | 72.38 | 77.5 | 55.7 | 68 | 87.56 | 80.90 | 4.64 | **MIT** |
| 6 | Claude-Haiku-4-5 (FC) | 68.70 | 83.5 | 54.41 | 53.62 | 86.5 | 78.68 | 14.23 | Proprietary |
| 16 | GPT-5.2 (FC) | 55.87 | 75.5 | 45.81 | 28.12 | 81.85 | 70.39 | 85.65 | Proprietary |
| 23 | Qwen3-235B-A22B (Prompt) | 52.15 | 50.5 | 19.35 | 44.62 | **90.33** | 78.68 | 3.12 | Apache-2.0 |
| 39 | Qwen3-8B (FC) | 42.57 | 12 | 14.62 | 41.75 | 87.58 | 80.53 | 43.32 | Apache-2.0 |
| 41 | Qwen3-30B-A3B (FC) | 41.39 | 22.5 | 17.63 | 30 | 85.77 | 77.94 | 5.62 | Apache-2.0 |
| 43 | **Qwen3-14B (FC)** | 41.03 | **10** | 19.57 | 34.75 | **84.94** | **80.01** | 3.38 | Apache-2.0 |
| 62 | Llama-3.3-70B (FC) | 31.90 | 10 | 8.17 | 21.5 | 88.02 | 76.61 | 29.54 | Llama 3 Community |

**The discriminator, and it is the whole finding of this document — it is a gradient, not a cliff:**

- On **single-turn structured tool calls** (the AST columns) the tiers are a **wash**. Qwen3-14B
  scores 84.94 non-live / 80.01 live against Claude-Haiku-4-5's 86.5 / 78.68 — the small open model
  *wins one of the two*. Qwen3-235B posts the highest non-live AST on the entire board (90.33).
- The gap then **widens monotonically with how much state the task carries**, Qwen3-14B vs
  Claude-Haiku-4-5: **multi-turn 34.75 vs 53.62 (1.5×)** → **memory 19.57 vs 54.41 (2.8×)** →
  **agentic web search 10 vs 83.5 (8×)**. Qwen3-30B-A3B traces the same curve (30 / 17.63 / 22.5).

Read plainly: statefulness is the axis. One structured call is a wash; a stateful, tool-using loop
is where the open models fall off, and the fall is steepest exactly where our chat surface lives.

That maps one-to-one onto our inventory — `triage` and the extraction jobs are one-shot structured
calls; `assistant_stream`, `assistant_chart`, and every Claude Code agent are stateful tool loops
with retrieval, which is the 8× column.

Also worth naming: the best open model on the board is **GLM-4.6 (MIT, rank 4, 72.38)** — it beats
Claude-Haiku-4-5 overall. It is ~355B parameters and does not go near 16 GB (see lane 3), so it is
a *hosted-open-weights* option, not a local one.

**Caveats, stated because they bound every number above.** The board is 3½ months stale as of
today. It contains **no Claude 4.6-generation model** and neither `claude-opus-5` nor
`claude-sonnet-5` — its top Claude entries are the 4.5 generation. It likewise contains **no
qwen3.5, qwen3.6, gemma4, or gpt-oss** entry. It therefore ranks the *previous* generation on both
sides of the table. Treat it as evidence about the **shape** of the gap (one-shot vs agentic), which
is a structural property, not as a current head-to-head leaderboard.

### 1c. Where no benchmark exists — and why that is a finding

There is no benchmark that predicts `synthesis`, `narrative_bake`, `insiders_author`, or
`ingest_city_pulse_distill` quality, because the output is judged, not scored. That is not a hole in
this research — it **hardens the pulse-distill precedent**: the only evidence we will ever have for
those jobs is our own A/B (`verification/haiku-vs-sonnet-distill.md`), and that A/B already
returned SONNET-only. A model with no measurable quality proxy is a model we do not swap on a
capability claim.

`factuality_ci` is the sharpest case: it is a **judge**. A weaker judge is a worse gate regardless
of what any leaderboard says.

---

## 2. Lane 2 — THE HIGHWAY WE DO NOT BUILD

RULE 0.9.2: OURS = data, provenance, judgment, the deliverable. NOT OURS = the plumbing.

### 2a. LiteLLM (`docs.litellm.ai`, crawled 07/30/2026)

"**Call 100+ LLMs using the OpenAI Input/Output Format.**" Apache-licensed, `BerriAI/litellm`.
Ships in **two distinct shapes**, and the docs' own comparison table names the audience for each:

| | **Proxy Server (LLM Gateway)** | **Python SDK** |
|---|---|---|
| Who uses it | "Gen AI Enablement / ML Platform Teams" | "Developers building LLM projects" |
| Features | Centralized gateway with authn/authz · **multi-tenant cost tracking per project/user** · per-project logging/guardrails/caching · **virtual keys** · **admin dashboard UI** | Direct library integration · **Router with retry/fallback across deployments** · app-level load balancing + cost tracking · OpenAI-compatible exception handling · observability callbacks (Langfuse, MLflow, …) |

**RULE 11 applied:** the Proxy Server half is the hyperscaler-shaped half — multi-tenant budgets,
virtual keys, an admin dashboard, per-project guardrails. We are one operator with one API key.
That is precisely the dead weight already rejected in Omnigent's session-sharing/SSO/three-tier
policy stack. **The SDK half is the part that survives at our volume**, and only its
retry/fallback Router and its provider fan-out.

Ollama is a first-class listed provider (it appears in the provider dropdown on the docs home
alongside OpenAI, Anthropic, Bedrock, Vertex), so a LiteLLM-mediated local lane is a supported
path rather than a hack.

**The constraint that decides it for us: LiteLLM's SDK is Python.** Our metering seam is TypeScript
(`refinery/agents/anthropic.mts`, 11 of 19 call types). Adopting the SDK covers only the **8 Python
ingest call types**; the 11 TypeScript ones would need the Proxy Server — i.e. the half RULE 11
rejects — or a second, parallel integration. A routing layer that covers 8 of 19 jobs and needs the
dead-weight half to reach the other 11 is not a clean adoption.

### 2b. The layer question, answered honestly

- **vLLM** (`docs.vllm.ai`, v0.26.0, 87.7k stars) is an **inference server**, not a router — it is
  the thing you point a router *at*. Wrong layer for this lane. It also needs Linux; on our box that
  means the WSL2 environment the omnigent file already priced as "a second environment to maintain."
- **OpenRouter** (`openrouter.ai/docs`) is a hosted router. Its docs surface has grown a **Client
  SDKs** section, an **Agent SDK**, a **Batch (beta)** endpoint, an **MCP server**, and a
  machine-readable index at `/docs/llms.txt`. **Contract not pulled this session** — see gaps.
- **Vercel AI Gateway** is the one we are structurally closest to, since we deploy on Vercel and the
  platform guidance loaded into this session says to prefer plain `"provider/model"` strings through
  the gateway rather than provider-specific packages. **Its contract was NOT verified this session**
  — `crawl4ai vercel.com/docs/ai-gateway` returned navigation chrome only, twice. See gaps.
- **Omnigent** — ruled out 07/30 in the companion file (alpha, 331 open issues, and its two best
  features are exactly what Windows drops). Not re-litigated.

### 2c. Verdict

**Adopt nothing yet — and the reason is arithmetic, not preference.** A router's entire value is
provider fan-out, retry across deployments, and key rotation. We have **one provider**. At N=1 the
router adds a dependency, a translation layer, and a place for the cost table to drift, and buys
zero fan-out. What it *would* buy is optionality the moment a second provider exists.

So the decision is **gated on a different question than the one this lane asked**: do we add a
second provider? If yes, the gateway lane opens and Vercel AI Gateway is the first candidate to
evaluate on contract (we are already on the platform, and it is the one place a second provider
costs no new infrastructure). If no, `refinery/agents/anthropic.mts` — which already holds the cost
table, the spend guard, and the usage log in one file — stays the right seam and needs no help.

**What is genuinely ours and should never be routed out:** that metering seam. It is provenance
applied to spend, which is the same discipline as the four-lane rule applied to figures. Every
adoption above must keep writing `api_usage_log`, or it is a downgrade regardless of its feature list.

---

## 3. Lane 3 — OPEN-WEIGHT MODELS THAT FIT 16 GB

Hardware (verified 07/30 in the companion file): **RTX 4060 Ti, 16,380 MiB VRAM**, compute
capability 8.9, fully supported by Ollama. Ollama **not installed**; WSL2 Ubuntu installed, stopped.

### 3a. Real download sizes, live from `ollama.com/library/<model>/tags` (07/30/2026)

Q4_K_M unless noted. The `tools` badge is the vendor's own claim, shown for what it is.

| Model:tag | Size | Fits 16 GB? | `tools` badge | BFCL entry |
|---|---|---|---|---|
| `qwen3.5:2b` | 2.7 GB | ✅ 13.6 GB free | yes | none |
| `qwen3.5:4b` | 3.4 GB | ✅ 12.9 GB free | yes | none |
| `qwen3.5:9b` | 6.6 GB | ✅ **9.7 GB free** | yes | none |
| `gemma4:12b` | 7.6 GB (qat 7.2) | ✅ **8.7 GB free** | yes | none |
| `qwen3:14b` | 9.3 GB | ✅ **7.0 GB free** | yes | **41.03 / web 10** |
| `gemma4:e4b` | 9.6 GB | ✅ 6.7 GB free | yes | none |
| `gpt-oss:20b` | 14 GB | ⚠️ ~2 GB free | yes | none |
| `mistral-small3.2:24b` | 15 GB | ⚠️ ~1 GB free | yes | none |
| `gemma4:26b-a4b-it-qat` | 16 GB | ❌ | yes | none |
| `qwen3.5:27b` / `qwen3.6:27b` | 17 GB | ❌ | yes | none |
| `qwen3:30b` · `qwen3-coder:30b` | 19 GB | ❌ | yes | 41.39 / web 22.5 (30B-A3B) |
| `qwen3.6:35b-a3b` | 24 GB | ❌ | yes | none |
| `qwen3.5:122b` | 81 GB | ❌ | yes | none |

**My candidate list before this crawl was wrong**, and that is worth recording: `qwen3.5`,
`qwen3.6`, `gemma4`, and `nemotron-3-super` are all real, current models that were not in it. RULE
0.4 earned its keep on the first fetch.

### 3b. The second filter: weights are not the budget

Download size is the floor, not the requirement. An agentic tool loop needs real context, and the
KV cache at 32k+ eats the margin. Two of the entries above fail on that alone:

- **`gpt-oss:20b` (14 GB)** and **`mistral-small3.2:24b` (15 GB)** leave ~2 GB and ~1 GB on a card
  that is *also* holding the Windows desktop framebuffer. Ollama will spill layers to CPU and the
  tokens-per-second collapses. They are nominal fits, not working ones.
- The ones with genuine headroom are **`qwen3.5:9b`** (9.7 GB free), **`gemma4:12b`** (8.7 GB free),
  and **`qwen3:14b`** (7.0 GB free).

**Not measured this session:** actual KV-cache consumption at 32k context for those three. That is a
probe (install Ollama, load, `nvidia-smi` at depth), not a crawl, and it is the correct next step —
named in gaps rather than estimated here.

### 3c. Tool-calling reality for the models that fit

This is where lanes 1 and 3 meet, and the answer is uncomfortable:

- Every fitting model carries the `tools` badge. **None of the three with real headroom has a
  measured agentic tool-calling score**, because BFCL predates all of qwen3.5 / gemma4 / gpt-oss.
- The one fitting model that *is* on the board — **`qwen3:14b`** — scores **41.03 overall** against
  Claude-Haiku-4-5's **68.70**, and the whole spread sits in how much state the task carries. It is
  level on single-turn AST (non-live **84.94** vs 86.5, live **80.01** vs 78.85 — it wins that one),
  then falls off as the task accumulates state: **multi-turn 34.75 vs 53.62 (1.5×)**, **memory 19.57
  vs 54.41 (2.8×)**, **agentic web search 10 vs 83.5 (8×)**. Not a cliff at "tool use" — a slope
  against statefulness.
- The best open model on the board, **GLM-4.6 (MIT, 72.38)**, is ~355B and **does not fit** — it is a
  hosted-open-weights option, not a local one.

**Verbatim Ollama contract facts** (from the companion file's §7, unchanged): OpenAI-compatible
endpoint `http://localhost:11434/v1`; native chat `/api/chat`; tool calling supported with the same
`tools: [{type:"function", function:{name, description, parameters}}]` JSON-Schema shape as the
OpenAI/Anthropic contract; structured outputs, streaming, thinking, embeddings also documented;
`CUDA_VISIBLE_DEVICES` selects GPUs.

### 3d. Verdict

**Local viability tracks how much state a job carries, on this hardware, today.** A stateless
one-shot call is a wash (84.94 / 80.01 AST); each step up the statefulness ladder costs more
(1.5× multi-turn → 2.8× memory → 8× agentic search). The models that fit with headroom are
unmeasured on all of it; the one that is measured degrades along exactly that slope. That is not a
reason to skip local — it is a reason to scope it to the low-state end, where the failure mode is
cheap and detectable, which is exactly what the routing table below does.

---

## 4. THE ROUTING TABLE — driven by lane 4's rows, not by vendors

Every row names the benchmark that actually predicts that job class, per §1b/§1c. **This is a
recommendation pending operator sign-off, not a ratified routing policy.**

| Job (lane-4 row) | Predictive benchmark | Today | Local-viable? | Why |
|---|---|---|---|---|
| `triage` | BFCL single-turn AST | haiku-4-5 | **YES — pilot here** | One-shot classification. Open 14B is a wash with Haiku on AST (84.94 vs 86.5). Failure is cheap and detectable. $2.20/mo. |
| `ingest_extract`, `EXTRACTION_MODEL` (PDF), `ACTION_MODEL`, `COMMAND_MODEL` | BFCL single-turn AST + structured outputs | haiku-4-5 | **YES — second wave** | Same shape: one call, schema-checked output. Ollama documents structured outputs natively. |
| `ingest_dbpr_notices` ($0.05/mo) | single-turn AST | haiku | Yes, but pointless | Five cents. Move it only as a free rider on the triage pilot. |
| `assistant_stream`, `assistant_chart` | **BFCL multi-turn + web search** | sonnet-4-6 | **NO** | Stateful tool loop with retrieval — the high-state end of the slope (multi-turn 1.5×, memory 2.8×, web search 8×). |
| `deliverable_build`, `email_build` | none (judged) — but `gateNarrative` gates output | sonnet-4-6 / lab dial | **Conditionally** | The no-invention lint (`lib/deliverable/build.ts`) is what makes a weaker writer *safe to try*. The guard bounds the risk, not the model. |
| `synthesis`, `narrative_bake`, `insiders_author`, `ingest_city_pulse_distill`, `ingest_corridor_pulse_distill` | **none exists** | sonnet-4-6 / fable-5 | **NO — settled** | Pulse-distill SONNET-lock. $27.71 of the $50.12. Re-litigating this needs a new A/B, not a leaderboard. |
| `factuality_ci` | none — it IS the judge | SYNTHESIS_MODEL | **NEVER** | A weaker judge is a worse gate. |
| `proof` | n/a — live evidence | seam-routed | No | Its whole point is proving the real path. |
| Claude Code agents (3 GHA + interactive) | SWE-bench / Terminal-Bench (not pulled) | sonnet-4-6 / session model | **NO** | Longest-horizon tool loops we run. Also the unmeasured-spend bucket. |

**Prerequisite before any row moves:** add `claude-opus-5` and `claude-sonnet-5` to `RATES`
(§1a). Routing without rate rows makes the new route invisible to the spend guard.

---

## 5. Gaps — named, not papered over

1. **Vercel AI Gateway contract UNVERIFIED.** `crawl4ai vercel.com/docs/ai-gateway` returned nav
   chrome only on two attempts. Its pricing, provider list, and BYOK terms are not on the record.
   It is the leading lane-2 candidate *if* a second provider is ever added, so this is the gap that
   matters most.
2. **OpenRouter contract not pulled** — only its docs *structure* (Agent SDK, Batch beta, MCP
   server, `/docs/llms.txt` index). Try the machine-readable index next.
3. **KV-cache headroom at 32k unmeasured** for `qwen3.5:9b` / `gemma4:12b` / `qwen3:14b`. This is a
   probe, not a crawl, and it gates whether "fits" means "works."
4. **BFCL is 3½ months stale** (2026-04-12) — no Claude 4.6-gen entry, no Opus 5 / Sonnet 5, no
   qwen3.5 / qwen3.6 / gemma4 / gpt-oss. The shape finding holds; the specific rankings do not
   describe today's models.
5. **SWE-bench / Terminal-Bench not pulled** — the coding-agent row of the table is the one class
   with no fetched evidence behind it.
6. **Interactive coding spend still unmeasured** (`interactive_coding_spend_unmeasured`, open) —
   the largest bucket on the page remains a blank.

---

## Sources (all live, 07/30/2026)

- `ollama.com/library` + `/library/{qwen3,qwen3.5,qwen3.6,qwen3-coder,gemma4,gpt-oss,mistral-small3.2}/tags` — crawl4ai
- `gorilla.cs.berkeley.edu/leaderboard.html` — BFCL V4, board dated 2026-04-12 — crawl4ai
- `docs.litellm.ai/` + `/docs/providers/ollama` — crawl4ai
- `docs.vllm.ai/en/latest/` (v0.26.0) · `openrouter.ai/docs/quickstart` — crawl4ai
- `vercel.com/docs/ai-gateway` — crawl4ai, **nav only, body not retrieved**
- `claude-api` skill (in-repo authority) — model IDs + pricing, invoked in-session
- Code, grep-verified: `refinery/agents/anthropic.mts` · `ingest/lib/api_usage.py` ·
  `lib/email/model-router.ts` · `lib/assistant/gap-fill.ts` · `lib/deliverable/build.ts` ·
  `app/api/**/route.ts` · `.github/workflows/` · `.claude/agents/`
