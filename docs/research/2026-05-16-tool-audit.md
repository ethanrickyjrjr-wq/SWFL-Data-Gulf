# Tool Audit — Session 7

**Date:** 2026-05-16
**Context:** Architecture validation + personalization layer research. Session 7.

---

### dlt (data load tool)

- **Verdict:** adopt (decoupled pattern only — no subprocess, no sidecar)
- **What it does:** Python ETL library. 5000+ source connectors, schema inference, incremental loading, Postgres/Supabase destination.
- **Star count / maintained:** ~10k stars, actively maintained, v1.26.0 current
- **Key finding:** Python-only. No JS/TS SDK. No REST server mode. Best pattern: dlt runs as a standalone scheduled Python job outside the Bun refinery, writes to Supabase, TypeScript reads the output table via existing `supabase.mts`. Do NOT spawn Python subprocesses from the refinery. Do NOT build a sidecar. Arsenal v3.1 confirmed this — dlt demoted to Tier 2.
- **Source:** https://dlthub.com/docs/intro | https://github.com/dlt-hub/dlt
- **Date:** 2026-05-16

---

### Sirchmunk MCP

- **Verdict:** adopt (Tier 2 — filesystem semantic search)
- **What it does:** Agentic search engine over local files. No vector DB needed. Monte Carlo Evidence Sampling (DEEP mode) + ripgrep keyword cascade (FAST mode). DuckDB for result cluster caching. MCP server ships as `sirchmunk mcp serve` in stdio mode.
- **Star count / maintained:** 1.1k stars, 116 forks, Apache 2.0. Latest commit April 15 2026 (MCP fix PR). 18 tagged releases, actively maintained.
- **Key finding:** Searches local filesystems, not databases. Best for `brains/*.md` output files. NOT a substitute for pgvector (which handles DB-resident content). MCP server is real and working as of v0.0.2+. Requires OpenAI-compatible LLM API key — not self-contained.
- **Source:** https://github.com/modelscope/sirchmunk
- **Date:** 2026-05-16

---

### pgvector (Supabase native)

- **Verdict:** adopt (Tier 2 — semantic search over DB content)
- **What it does:** Postgres extension for vector similarity search. Ships natively with Supabase — one-click enable, no separate infra.
- **Star count / maintained:** Supabase-maintained, production-grade, part of core Supabase offering.
- **Key finding:** Add `embedding vector(1536)` to `outcomes` and `predictions` tables. Embed `conclusion` on write (Stage 4 or Supabase trigger). Enables "find prior assessments similar to this one" queries. Complements Sirchmunk (filesystem) — not a substitute.
- **Source:** https://supabase.com/docs/guides/database/extensions/pgvector
- **Date:** 2026-05-16

---

### PgMQ (Supabase native queue)

- **Verdict:** adopt (Tier 3 — watch-list event queue)
- **What it does:** Postgres-native message queue extension. Exactly-once delivery via Postgres transactions. Visibility timeout for auto-requeue on crash. Ships with Supabase.
- **Star count / maintained:** Supabase-maintained extension, production use.
- **Key finding:** Zero additional infrastructure. Enables event-driven brain rebuild: source data arrives → queue message → Bun worker pops and runs refinery for that brain. Complements (does not replace) cron for scheduled runs. Prerequisite: at least one external event source is live.
- **Source:** https://supabase.com/docs/guides/queues
- **Date:** 2026-05-16

---

### Langfuse — LLM Observability

- **Verdict:** adopt (Tier 2 — synthesize-quality tracing)
- **What it does:** OSS LLM observability. Traces every Claude call (inputs, outputs, latency, token cost). Self-hostable on Supabase or Vercel.
- **Star count / maintained:** ~6k stars, actively maintained, production-grade.
- **Key finding:** Passively feeds the outcomes table gap ("every brain output disappears"). Log each synthesis run as a Langfuse trace → compare predicted conclusion vs. actual outcome. Reduces manual `predictions` INSERT work. Not slotted in Session 7 per user prioritization — include in next arsenal update.
- **Source:** https://langfuse.com | https://github.com/langfuse/langfuse
- **Date:** 2026-05-16

---

### Mastra — TypeScript Agent Orchestration

- **Verdict:** defer (Tier 3 — re-evaluate at multi-agent milestone)
- **What it does:** TypeScript-native agent orchestration framework. Workflows, memory, tool use.
- **Key finding:** Originally deferred to Month 4+. As of May 2026 in active development. Context engineering pattern (single-Claude personalization) reduces urgency — single-call synthesis works for now. Re-evaluate when parallel brain synthesis per user role becomes a bottleneck. Trigger: roadmap §8.6 multi-agent milestone.
- **Date:** 2026-05-16

---

### Claude Batch API

- **Verdict:** adopt (Tier 3 — cost optimization for scheduled full-DAG refresh)
- **What it does:** Anthropic Batch API runs multiple Claude calls at ~50% cost. Async — results in <24h.
- **Key finding:** Relevant for scheduled 3am full-DAG refresh (5+ brain syntheses at once). `refinery/agents/anthropic.mts` would need a batch-mode path. No urgency until scheduled runs land (roadmap Tier 4 #35). Slot then.
- **Source:** https://docs.anthropic.com/en/docs/build-with-claude/batch-processing
- **Date:** 2026-05-16

---

### User Context Personalization Patterns (2026 best practices)

- **Verdict:** research finding, not a tool
- **Best practice:** "Context engineering" = system-prompt persona + structured user-profile JSON at query time. This is the dominant 2025–2026 production pattern.
- **Key finding:** OWL/SPARQL for role-weighting is NOT the 2026 best practice for LLM personalization — too heavy for this use case. Use OWL for vocabulary schema validation only (Open Ontologies MCP). Role personalization lives in the synthesis layer, not the math layer. The Anthropic Persona Selection Model (Feb 2026) confirms system-prompt persona reliably shifts emphasis and risk framing.
- **Source:** https://arxiv.org/abs/2504.10147 | https://alignment.anthropic.com/2026/psm/
- **Date:** 2026-05-16
