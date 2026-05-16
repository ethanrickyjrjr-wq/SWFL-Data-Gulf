# Tool Research & Personalization Layer Design

| Field   | Value                                            |
| ------- | ------------------------------------------------ |
| Date    | 2026-05-16                                       |
| Session | 7                                                |
| Status  | Draft — for Opus integration into arsenal        |
| Touches | arsenal-master-stack.md, ontology-and-roadmap.md |

---

## 1-Line Summary

The current Bayesian stack is architecturally sound and not a trap. Add four things: (1) context-JSON user personalization at the master synthesis layer, (2) `roleImplication` dimension in SKOS vocabulary, (3) pgvector for semantic search over brain OUTPUTs, (4) PgMQ for watch-list infrastructure — all Supabase-native, zero new infra.

---

## Architecture Validation

**Verdict: Build is logical. No decisive-better alternative found. No trap.**

The four-pillar stack (SKOS disambiguation → Stack Graph DAG → Bayesian confidence → tooling) maps cleanly to best practices for multi-source intelligence systems as of 2026. The critical architectural insight the research confirmed: **the math layer (confidence, trust tiers, freshness) must stay deterministic and role-agnostic. Personalization belongs in the narrative synthesis layer, not in the confidence computation.** Mixing user preference into confidence scores would corrupt the honesty guarantee.

The "hurricane means different things to different people" problem is **not a brain architecture problem** — it is a synthesis framing problem. The brains produce the same deterministic facts for everyone. How those facts are weighted in the narrative answer is where user context lives. This is the right separation.

**Depth question — how many hops until master?**
Current longest chain: 4 hops (franchise-outcomes → master → macro-swfl → sector-credit-swfl). This is appropriate. Do NOT add intermediate aggregation layers yet. Master becomes a real synthesizer (§6.1 of roadmap) before adding depth. Adding layers before master can synthesize would produce more hops with no more intelligence.

**SKOS tagging — structured correctly?**
Current `scopeNote` is per-brain, which is right for domain disambiguation. The gap is there is no per-user-role implication attached to concepts. A hurricane concept today has a CRE brain meaning; it should also have `roleImplication` entries (insurance seller → exposure risk rises, homebuyer → contract contingency window, traveler → cancel/rebook, operator → business interruption). This is a vocabulary addition, not a vocabulary restructure.

---

## Decision 1 — dlt (Confirmed: Demoted to Tier 2)

**Status as of Arsenal v3.1: already demoted. This decision is locked.**

The reason: TDT data was already in Supabase from premise-engine. The tourism-tdt brain (now live as of Session 7) used a standard Supabase source connector, identical in shape to `franchise-source.mts`. No Python in the TypeScript pipeline at all.

**The right dlt pattern for future sources (template):**

- dlt runs as a standalone scheduled Python job, outside the Bun refinery
- dlt writes to Supabase (its native Postgres destination)
- TypeScript reads via existing `supabase.mts` — same as all other connectors
- No subprocess. No sidecar. No Python process management inside the refinery.
- Wire dlt only when a new source has no native Supabase path (Python-SDK-only sources)

**What this means for the template:**
The "clean template for future FRED/SBA sources" is not a dlt template — it is the existing TypeScript source connector pattern. `macro-swfl-source.mts` IS the template: fixture mode + live mode, single `normalize()`, implements `SourceConnector`, returns `RawFragment[]`. FRED and SBA already use this pattern. New sources should follow it. If a source is Python-only, dlt ingests it to Supabase and the TypeScript connector reads the output table.

---

## Decision 2 — User Context Personalization (Approach A: Now)

**The 2026 best-practice pattern: system-prompt persona + structured context JSON at query time.**

This is "context engineering" — designing all information the model sees before generating, not just the prompt. The separation: deterministic math stays untouched, narrative synthesis is steered by the user context block.

### Implementation spec

**At query time**, the CLI or API accepts an optional `--user-context` parameter:

```json
{
  "role": "insurance_seller",
  "priority_dims": [
    "flood_risk",
    "replacement_cost_delta",
    "reinsurance_trigger"
  ],
  "horizon": "immediate",
  "location": "SWFL",
  "first_time": false
}
```

**In `refinery/stages/3-synthesis.mts`** (or master's `outputProducer`), the synthesis prompt gets a role-framing block before the brain OUTPUT blocks:

```
You are synthesizing intelligence for: insurance seller focused on immediate flood exposure in SWFL.
Priority dimensions: flood_risk, replacement_cost_delta, reinsurance_trigger.
Weight your conclusion and caveats through this lens. Do not alter the key_metrics values.
```

**For first-time users or non-AI users:** prompt for role at query time with a short menu. Persist the choice to Claude Project Memory for subsequent queries. No user-brain in the DAG — profile lives at the query layer.

**SKOS extension:** add `roleImplication` to each concept in `brain-vocabulary.json`:

```json
"MD-001": {
  "prefLabel": "bullish",
  ...
  "roleImplication": {
    "insurance_seller":  "rising claims environment, re-underwrite exposed lines",
    "homebuyer":         "competition increases, act faster on properties",
    "operator":          "foot traffic up, staffing pressure follows",
    "investor":          "cap rate compression likely, underwrite carefully"
  }
}
```

Stage 2.5 normalization already runs before synthesis — it is the natural place to look up `roleImplication` for each metric in the OUTPUT and append it as synthesis context.

**What does NOT change:** confidence formula, trust tiers, freshness tokens, SKOS `prefLabel`/`scopeNote`, the DAG. None of these touch user context. The math layer is role-agnostic by design.

**Path to Approach B (Week 8–10):** When GoRules Zen constitution is evaluated (≥20 rules), encode role-aware override rules: `if user_role = insurance_seller AND hurricane_event = true THEN weight flood_risk × 2`. This makes personalization auditable and deterministic. Approach A is the bridge.

---

## Tool Addition 1 — pgvector (Supabase Native)

**What:** Postgres extension for vector similarity search. Ships natively with Supabase — no separate vector DB, no infrastructure addition.

**Why now:** The outcomes table and brain OUTPUT blocks will accumulate. When a user asks "show me all prior assessments similar to this one" or "find brains that previously flagged flood risk in this corridor," you need semantic search over those records. pgvector handles this without Sirchmunk's local-filesystem limitation.

**Sirchmunk vs pgvector:**

- Sirchmunk: searches local `brains/*.md` files by Monte Carlo evidence sampling. Best for: "find all brain output files that mention cap_rate in a bearish context." Filesystem-bound.
- pgvector: searches Supabase rows by embedding similarity. Best for: semantic search over `outcomes`, `predictions`, `source_connectors`, or any DB-resident content.

Both are needed. They are not substitutes.

**Implementation:**

- Enable via Supabase dashboard (one click, no migration needed on managed Supabase)
- Add `embedding vector(1536)` column to `outcomes` and `predictions` tables
- Embed the `conclusion` text of each brain OUTPUT on write (Stage 4 or a Supabase trigger)
- `similarity_search(query_text) → [outcome_id, similarity_score]` RPC

**Arsenal slot:** Tier 2 (short-term) — unblocks semantic "prior prediction" retrieval once outcomes table has rows.

---

## Tool Addition 2 — PgMQ (Supabase Native Queue)

**What:** Postgres-native message queue extension. Ships with Supabase. Zero additional infrastructure — no Redis, no Kafka, no SQS.

**Why:** The watch-list infrastructure (roadmap Tier 4 #36) requires an event queue: FRED publishes → brain rebuilds. Without a queue, every new source event requires a manual CLI run or a polling loop. PgMQ turns source data arrival into a Postgres `INSERT` and lets a worker pop tasks.

**The pattern:**

```sql
-- When a FRED series observation arrives (via dlt or direct fetch):
SELECT pgmq.send('brain_rebuild_queue', '{"brain_id": "macro-swfl", "trigger": "SOFR_update"}');

-- The Bun refinery worker polls:
SELECT pgmq.read('brain_rebuild_queue', 30, 1);
-- Runs the refinery for that brain_id
-- Deletes the message on success
```

**Why this beats Kafka/Redis for us:**

- No separate process to operate or monitor
- Supabase already handles backups, replication, and access control
- Exactly-once delivery semantics via Postgres transactions
- Visibility timeout (the `30` above) means crashed workers re-queue automatically

**What it does NOT replace:** scheduled runs (still use cron). PgMQ handles event-driven rebuild. Cron handles the 3am FRED pulse.

**Supabase docs:** `supabase.com/docs/guides/queues` — wired as an extension, no custom SQL migration.

**Arsenal slot:** Tier 3 (medium-term) — implement when the first watch-list trigger is needed. Prerequisite: at least one external event source (e.g., FRED webhook, Accela RSS) is live.

---

## Other Tools Evaluated (Not Slotted)

### Langfuse — LLM Observability

Track synthesis quality, auto-log every Claude call with inputs/outputs, feeds the outcomes table. OSS, self-hostable on Supabase. **Recommended: add to Tier 2 alongside pgvector.** Addresses the gap "every brain output disappears into the customer's decision" (roadmap §5.4). Enables automatic logging without manual `predictions` table writes.

Not slotted this session because user selected pgvector and PgMQ for deep-dive. Include in next arsenal update.

### Mastra — TypeScript Agent Orchestration

Was deferred to Month 4+ in roadmap. As of May 2026 it is in active development. **Recommend: re-evaluate at the §8.6 multi-agent milestone** (each brain = its own Claude agent). The context engineering pattern (Decision 2 above) reduces urgency — we can run personalized synthesis with a single Claude call for now. Re-evaluate when parallel brain synthesis becomes a bottleneck.

### Claude Batch API

Batch API runs multiple brain syntheses at ~50% cost reduction. Relevant when running full DAG refresh (5+ brains). No code change needed for the refinery — `refinery/agents/anthropic.mts` would need a batch mode path. **Slot as Tier 3 when scheduled runs land** (roadmap Tier 4 #35).

---

## Implementation Order (Arsenal Integration Priority)

```
IMMEDIATE (fold into arsenal v3.1 or v3.2):
  1. SKOS roleImplication field — add to brain-vocabulary.json spec (Tier 1 #1 update)
  2. user_context parameter — add to refinery/stages/3-synthesis.mts (Tier 1 new item, Lane A extension)
  3. pgvector enable — Supabase dashboard + outcomes/predictions schema (Tier 2, alongside #5)

SHORT-TERM (Tier 2 additions):
  4. Langfuse — wire synthesis tracing (Tier 2 new item)

MEDIUM-TERM (Tier 3 additions):
  5. PgMQ — watch-list event queue (Tier 3 new item, prerequisite for roadmap §8.3)
  6. Mastra — re-evaluate at multi-agent milestone (Tier 3 #x, update existing deferred slot)
```

---

## What to Fold Into Arsenal (Ops Note for Opus)

When integrating this doc into `docs/arsenal-master-stack.md`:

1. **Add to Tier 1 #3 (Stage 2.5):** append `roleImplication` lookup to the normalization spec. Stage 2.5 is where SKOS lookups happen — natural home for role context injection.

2. **Add new Tier 1 item: `user_context` parameter.** Lane A extension. `refinery/stages/3-synthesis.mts` (or master pack's `outputProducer`) accepts optional `userContext`. CLI flag `--user-context='{"role":"..."}'`. First-time prompt flow for no-context sessions.

3. **Add new Tier 2 item: pgvector.** Semantic search over `outcomes` and `predictions`. Supabase native. Prerequisite: outcomes table has rows (already live from Session 6).

4. **Add new Tier 2 item: Langfuse.** LLM observability. Auto-logs synthesis calls. Feeds outcomes table passively.

5. **Add new Tier 3 item: PgMQ.** Event-driven brain rebuild queue. Prerequisite: one external event source live.

6. **Update Tier 2 #12 (Sirchmunk):** note the filesystem-vs-database distinction vs pgvector. Both needed, neither is a substitute for the other.

7. **Update Tier 3 (Mastra deferred slot):** note re-evaluation trigger is the multi-agent milestone, not a calendar date.

8. **Update Tier 2 #7 (dlt note):** confirm the architectural decision — dlt runs decoupled, outside the Bun refinery, writes to Supabase. TypeScript connector reads output table. The dlt-source.mts wrapper was not built and is not needed.
