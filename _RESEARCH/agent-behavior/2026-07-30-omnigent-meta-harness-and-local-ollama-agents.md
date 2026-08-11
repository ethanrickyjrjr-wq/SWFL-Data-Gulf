# Omnigent (Databricks) + local Ollama agents — what it is, and what it's worth to US

**Date:** 07/30/2026 · **Lane:** RULE 0.4 (ours first, then crawl4ai live) · **Status:** research, no build
**Operator ask:** "how do we use omniagent by databricks or create our own? they built polly and
debbie… we said [multi-agent] wasn't the way, but it seems it is something we need to look into
more. figure out how we run more inhouse on open source with ollama and combine what we can do
with claude and make free inhouse agents to make us more efficient and rely less on paying others."

---

## 0. Name correction (so nobody re-searches the wrong string)

It is **Omnigent**, not "OmniAgent". The agents are **Polly** and **Debby**, not "Debbie".
Searching "OmniAgent" finds nothing; searching "Omnigent" finds everything.

- Announcement: `databricks.com/blog/introducing-omnigent-meta-harness-combine-control-and-share-your-agents`,
  **06/13/2026**, by Matei Zaharia, Kasey Uhlenhuth, Corey Zumar.
- Source: `github.com/omnigent-ai/omnigent` — **Apache 2.0**, status **alpha**, 7.9k stars,
  1,948 commits, 1,154 branches, 331 open issues, 456 open PRs (as of 07/30/2026).
- Docs: `omnigent.ai`. Built by the **Databricks AI team and Neon**.
- Python 3.12+. PyPI `omnigent`. CLI installs as both `omnigent` and `omni`.

---

## 1. What Omnigent actually is

A **meta-harness** — a layer *above* Claude Code / Codex / Cursor / OpenCode / Hermes / Pi.
Databricks' stated thesis, verbatim: "however each agent harness calls into its LLM internally,
the interface to users is the same: messages and files in, text streams and tool calls out."
So they wrapped both terminal CLIs and SDKs behind one API.

What it adds on top of a single harness:

- **Composition** — mix harnesses/models in one session; swap with a one-line change.
- **Contextual policies** — stateful guardrails, not prompt-based. Their example: after an agent
  installs a new npm package, require human approval to `git push`.
- **Cost policies** — `cost_budget` builtin with `max_cost_usd` (hard) + `ask_thresholds_usd` (soft).
  Policies stack server-wide / per-agent / per-session, stricter session rules checked first.
- **OS sandbox ("Omnibox")** — bwrap (Linux) / seatbelt (macOS), plus an L7 egress proxy that can
  inject a GitHub token *only* on approved requests so the agent never sees it.
- **Collaboration** — share a live session by URL, co-drive, fork. Multi-user auth, OIDC/SSO.
- **Any device** — terminal, web UI (`localhost:6767`), mobile, macOS desktop app.
- **Custom agents = one YAML file.** No subclassing, no framework code. "The YAML file **is** the agent."

### The custom-agent YAML contract (verbatim shape)

```yaml
spec_version: 1
name: my_agent
prompt: You are a helpful data analyst.
executor:
  type: omnigent
  config:
    harness: claude-sdk     # claude-native, codex, codex-native, cursor, cursor-native,
                            # hermes, hermes-native, opencode, pi, pi-native, openai-agents
  model: claude-sonnet-4-6
tools:
  word_count:               # a local Python function; schema auto-generated from the signature
    type: function
    callable: mypackage.mymodule.word_count
  docs:                     # an MCP server (local command or remote URL)
    type: mcp
    url: https://example.com/mcp
  researcher:               # a SUB-AGENT the supervisor can delegate to
    type: agent
    prompt: Search for relevant information and summarize it.
    tools: { word_count: inherit }
policies:
  budget:
    type: function
    handler: omnigent.policies.builtins.cost.cost_budget
    factory_params: { max_cost_usd: 5.00, ask_thresholds_usd: [3.00] }
```

Run: `omni run ./my-agent/`. Agents can author agents — you describe one in chat and it writes the YAML.

### Polly (the multi-agent coder)

Supervisor that **writes no code itself**. Decomposes a goal, delegates each sub-task to a sub-agent
on **its own harness and its own git worktree**, then routes each diff to a reviewer **from a
different vendor than the one that wrote it**. Each implementer opens its own PR. **Polly never
merges — the human decides.**

| Sub-agent | Harness | Role |
|---|---|---|
| `claude_code` | `claude-native` | implementer |
| `codex` | `codex-native` | implementer |
| `opencode` | `opencode-native` | implementer |
| `cursor` | `cursor-native` | implementer |
| `hermes` | `hermes-native` | implementer (Nous Research) |
| `pi` | `pi` | **review/explore specialist, headless — "the only worker that can run ANY gateway model"** |

Skills: `/fanout` (parallel independent tasks, own worktree + own PR each), `/cross-review`
(diff → different-vendor reviewer, blocking issues loop back until clean), `/investigate`
(read-only delegation + synthesis).

**Roster preflight** — from `examples/polly/config.yaml` verbatim: on the FIRST turn Polly runs
exactly one `command -v claude codex opencode cursor-agent hermes pi || true` and routes work
ONLY to workers whose binary resolved. A missing worker is reported to the human. So Polly
**degrades gracefully** rather than hard-failing on a partial roster.

**Headless bypass stances** (because nobody is watching to answer a tool-approval prompt):
`claude-native` → `permission_mode: auto`; `codex-native` → `yolo: true`
(`--dangerously-bypass-approvals-and-sandbox`); `cursor-native` → `yolo: true` (`--yolo`).
Bypass only skips the interactive prompt — the `blast_radius` policy still DENYs the catastrophic set.

### Debby (the two-headed brainstormer)

Every question goes to **both** a Claude head and a GPT head simultaneously; answers shown side by
side. `/debate` runs multi-round mutual critique until convergence. Needs both an Anthropic and an
OpenAI credential. Use for architecture calls, comparing approaches, catching single-model blind spots.

---

## 2. Ollama is a first-class citizen — verbatim from the README

Omnigent takes four credential kinds: API key, **Subscription** (Claude Pro/Max or ChatGPT via the
official CLIs), **Gateway**, and Databricks workspace. The Gateway row reads:

> Any OpenAI- or Anthropic-compatible `base_url` and key (OpenRouter, LiteLLM, **Ollama**, vLLM, Azure)

And the explicit base-URL table:

| Provider | For | Base URL | Key |
|---|---|---|---|
| OpenRouter | Claude Code | `https://openrouter.ai/api` (**not** `/api/v1`) | `sk-or-…` |
| OpenRouter | Codex / OpenAI agents | `https://openrouter.ai/api/v1` | `sk-or-…` |
| **Ollama (local)** | **Codex / OpenAI agents** | **`http://localhost:11434/v1`** | **any value (Ollama ignores it)** |

Note the constraint: **Ollama is listed for the Codex/OpenAI-agents lane, not the Claude lane.**
Inside Polly, the worker documented as able to run "ANY gateway model" is **`pi`**.

---

## 3. 🔴 THE WINDOWS PROBLEM — this is the finding that matters

The README has an explicit Windows section. Verbatim: Omnigent "runs natively on Windows in a
**degraded mode**." The `install_oss.sh` bootstrap is POSIX-only.

**Works on Windows:** `omnigent server`, the web UI, and SDK-based harnesses
(`omnigent run <agent.yaml>` with **claude-sdk / cursor / codex**). Agents run under a Windows Job
Object for process-tree containment.

**NOT available on Windows** (needs Linux/macOS or WSL):
- the native `omnigent claude` / `codex` / `cursor` **tmux/PTY terminal wrappers**;
- `bwrap`/`seatbelt` filesystem & network sandboxing **and the L7 egress proxy** — the Job Object
  contains the process tree and enforces resource limits but does **NOT isolate filesystem or network**.

**Consequences for us, ranked:**

1. **Polly as shipped does not run on our box.** Five of its six workers are `-native` harnesses —
   exactly the tmux/PTY class Windows lacks. `tmux` is a hard prerequisite for those wrappers.
2. **The one worker that can run a local Ollama model (`pi`) is the one Windows least supports.**
   The Windows-viable list names claude-sdk, cursor, codex — it does **not** name `pi`, `hermes`,
   `opencode`, or `openai-agents`. So on Windows the local-model lane inside Polly is the *first*
   thing to break, not the last.
3. **The preflight checks the BINARY, not harness support.** `command -v claude` can resolve on
   Windows while the `claude-native` harness still cannot launch (no tmux/PTY). So Polly may mark a
   worker AVAILABLE and then fail at dispatch. Graceful degradation does not cover this case.
4. **`--harness <x>` does not fix it.** The README states sub-agents keep their own harness; the flag
   changes Polly's brain only. Any fix is per-sub-agent YAML edits.
5. **Unverified:** whether an SDK worker inherits a non-prompting stance. The documented bypass
   configs (`permission_mode: auto`, `yolo: true`) are specified for the `-native` harnesses. An SDK
   implementer that stalls on an approval prompt with nobody watching is a **silent hang, not an error**.
6. **Losing the sandbox is not cosmetic.** The egress proxy (never let the agent see the GitHub
   token) and filesystem isolation are the two features that would most justify Omnigent for a
   solo operator running `yolo: true` workers. On Windows both are gone.

**WSL2 Ubuntu is already installed on this machine (state: Stopped).** That is the escape hatch, at
the cost of maintaining a second environment.

---

## 4. Our hardware — good enough, verified 07/30/2026

- **NVIDIA GeForce RTX 4060 Ti, 16 GB VRAM** (`nvidia-smi`: 16380 MiB). Ignore the WMI
  `AdapterRAM` reading of 4 GB — that is the known 32-bit overflow, not the real number.
- 31.8 GB system RAM, 28 logical cores.
- Ollama hardware docs list `RTX 4060 Ti` under **compute capability 8.9** — fully supported.
  Requires driver 550+; ours is 32.0.15.9186 (well past).
- **Ollama is NOT installed.** WSL2 Ubuntu installed, stopped.

16 GB VRAM is a genuinely usable local-inference box — comfortably runs quantized 14B–30B-class
models. It is not a frontier-model replacement.

---

## 5. 🔴 THE MONEY — measured, and it kills the premise

Queried `public.api_usage_log` directly, **paginated** (the first attempt returned exactly 1000 rows
— the PostgREST max-rows truncation — and undercounted by 59%; the floor it reported was $20.64).

**Last 30 days: 3,209 calls, $50.12 total.**

| call_type | 30-day cost |
|---|---|
| `narrative_bake` | $11.98 |
| `ingest_city_pulse_distill` | $8.75 |
| `assistant_stream` | $7.48 |
| `synthesis` | $6.98 |
| `email_build` | $6.40 |
| `deliverable_build` | $3.61 |
| `triage` | $2.20 |
| `other` | $1.79 |
| `factuality_ci` | $0.86 |
| `ingest_dbpr_notices` | $0.05 |
| `proof` | $0.01 |

By model: `claude-sonnet-4-6` $40.15 · `claude-haiku-4-5` $9.97.

Last 7 days: 275 calls, $4.49 — depressed by the 07/24–07/26 empty-wallet outage, so read the
30-day number as the honest run-rate.

**There are two cost buckets and they need opposite answers:**

- **Product API spend — $50/month.** This is the entire table above. Moving `triage` to a local
  model saves **$2.20/month**. Moving *everything* local saves $50/month and puts the product's
  own output quality at risk.
- **Interactive coding spend — the Claude Code subscription.** NOT in this table at all. This is
  where the real money is, and it is the only bucket Omnigent addresses.

**RULE 11 check:** Databricks built Omnigent for a 5,000+ engineer org. Real-time session sharing,
multi-user auth, SSO, invite links, three-tier policy stacking — all dead weight for one operator.
The two parts that *do* justify themselves at our volume are **cross-vendor review** and **hard
cost caps**.

---

## 6. What can honestly go local — and what can't

The binding precedent is already on the books: **`pulse-distill` is locked SONNET-only after Haiku
hallucinated.** That is a documented rejection of a cheaper *frontier* model on one of our narrative
jobs. A quantized 14B–30B local model sits well below Haiku. Any proposal to move
`synthesis` / `narrative_bake` / `insiders_author` / `ingest_city_pulse_distill` local re-litigates
settled ground — and those four are $27.71 of the $50.12.

**Honest local candidates** — jobs whose output is *structurally checked*, not judged:

- **`triage`** ($2.20/mo) — classification. Wrong answers are cheap and detectable.
- Anything downstream of **`gateNarrative`** (`lib/deliverable/build.ts`) — the no-invention lint is
  the guard that makes a weaker writer *safe to try*. The guard, not the model, is what bounds the risk.

**Leave alone:**

- **`factuality_ci`** — it is a *judge*. A weaker judge is a worse gate. Never trade down here.
- Everything narrative/synthesis, per the pulse-distill precedent.

---

## 7. Ollama contract facts (verbatim, for whenever we do wire it)

- OpenAI-compatible endpoint: **`http://localhost:11434/v1`**. Native chat API: `/api/chat`.
- **Tool calling is supported** — `tools: [{type: "function", function: {name, description,
  parameters}}]`, same JSON-Schema shape as the OpenAI/Anthropic contract. Docs example uses `qwen3`.
- Also documented: streaming, thinking, **structured outputs**, vision, embeddings, web search.
- `CUDA_VISIBLE_DEVICES` selects GPUs; an invalid ID (e.g. `-1`) forces CPU.
- Full machine-readable doc index at `docs.ollama.com/llms.txt`.

---

## 8. Verdict

**Do not adopt Omnigent as infrastructure.** Alpha software, 331 open issues, built for a 5,000-
engineer org, and its two best features (OS sandbox + egress proxy) are exactly what Windows drops.

**Do steal three ideas, which cost nothing and need no new dependency:**

1. **Cross-vendor review** (Polly's actual insight) — the reviewer must be a *different vendor* than
   the implementer. Our `santa-method` / `orch-review` already gesture at this with same-vendor
   agents; a genuinely independent second vendor is the upgrade.
2. **Debby's `/debate`** — two heads, side by side, mutual critique before converging. This is the
   direct answer to the operator's own standing complaint that every idea gets replaced by a new
   idea saying the last one sucked (07/20/2026). Structured disagreement instead of serial override.
3. **Policy-as-config cost caps** — `max_cost_usd` hard + `ask_thresholds_usd` soft. We already have
   a spend guard in `refinery/agents/anthropic.mts`; the *soft warning tier* is the missing piece,
   and it is adjacent to the `billing_deadman_alarm` gap already logged 07/26.

**On "free in-house agents on Ollama":** the ceiling on this idea is **$50/month**, and $27.71 of
that is jobs we have already ruled out on quality. The seam that would do it —
`refinery/agents/anthropic.mts` — is one file, already holds the cost table, spend guard and usage
log, and needs no Omnigent, no WSL, and no alpha software. If we do it, `triage` is the pilot,
because it is classification with a cheap failure mode.

**The bucket actually worth attacking is interactive coding spend, which this table does not
measure.** Before spending a session on local models, measure that.

---

## Sources (all crawl4ai, 07/30/2026)

- `databricks.com/blog/introducing-omnigent-meta-harness-combine-control-and-share-your-agents` (06/13/2026)
- `github.com/omnigent-ai/omnigent` — README
- `raw.githubusercontent.com/omnigent-ai/omnigent/main/examples/polly/config.yaml` — Polly's real config
- `omnigent.ai/docs/use/builtin-agents/polly` · `/debby` · `omnigent.ai/docs/use/custom-agents`
- `docs.ollama.com/capabilities/tool-calling` · `docs.ollama.com/gpu`
- Live: `public.api_usage_log` (paginated), 30-day window ending 07/30/2026
- Live: `nvidia-smi`, `Get-CimInstance Win32_ComputerSystem`, `wsl -l -v`

---

## CORRECTION 08/03/2026 — Ollama IS now installed. §4's "Ollama is NOT installed" is STALE.

Live probe this session (not memory, not docs):

- `ollama --version` → **0.32.5**, daemon up and answering on `http://localhost:11434`.
- One model pulled: **`gemma4:12b`** — 11.9B params, Q4_K_M, 262144 context, 7.56 GB on disk,
  capabilities `completion, tools, thinking, vision`. Pulled 07/26/2026 (before this file was
  written on 07/30 — so §4 was already wrong the day it was filed).

**Wire-protocol fact, probed directly — this is the one that decides any "point our seam at Ollama"
plan.** Ollama does NOT serve the Anthropic shape:

- `POST http://localhost:11434/v1/messages` (Anthropic) → **HTTP 000, no endpoint**
- `POST http://localhost:11434/v1/chat/completions` (OpenAI) → **200, real completion returned**

So it is NOT a `baseURL` swap on the Anthropic SDK. Anything routed to Ollama needs an
OpenAI-shaped client, which means it bypasses `getAnthropic()` — the seam that enforces the spend
cap and writes `public.api_usage_log`. Per this file's own lane-3 conclusion, dropping the
`api_usage_log` write is a downgrade, not a saving.

Asked in the context of: the factuality CI gate (`lib/deliverable/factuality-grader.ts`, routed via
`getAnthropic("factuality_ci")`, `SYNTHESIS_MODEL = claude-sonnet-4-6`) failing 14/14 on an
exhausted Anthropic credit balance. That workflow is `runs-on: ubuntu-latest` — a GitHub-hosted
cloud runner with no GPU and no route to a localhost daemon on the operator's box.
