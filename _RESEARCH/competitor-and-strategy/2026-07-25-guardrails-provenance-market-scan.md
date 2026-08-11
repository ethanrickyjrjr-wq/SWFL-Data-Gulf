# 07/25/2026 — can we sell the provenance path / guard harness? Live market scan

Question from operator: "How would you make these a finished product we could sell? Is there a
market and is there competition, or is Opus on to something?" — referring to the 07/25 scratchpad
inventory: (1) the LLM output path that structurally cannot emit an unsourced number
(deterministic math in code + narrative-only LLM + `gateNarrative` + facts-only / inference-bait /
grain-guard / smoothing lints, abort-on-fail, prior good file keeps serving), and (2) the 32-hook
guard harness with registration tests.

## Live crawl findings (crawl4ai, 07/25/2026)

**Guardrails AI — guardrailsai.com** (crawled live). Positions as "The AI Reliability Platform."
Sells exactly the category Opus claimed nobody ships: "Deploy runtime guardrails that detect
policy violations, hallucinations, and data leakage. Block bad outputs before they reach users."
Enterprise logos (Masterclass, Changi Airport), government agencies claimed, a DeepLearning.AI
course with Andrew Ng, an OSS framework + hosted hub, plus a pivot into synthetic-data simulation
(Snowglobe). Funded, established, name-owns the literal word "guardrails."

**Cleanlab — cleanlab.ai** (crawled live). "Detect and remediate incorrect responses from any AI
Agent." Real-time hallucination guardrails, trust scores, human-in-the-loop remediation, VPC or
SaaS deployment, logos: BBVA, Tencent, Amazon, Oracle, Google, Databricks, Red Hat. Banner:
**"Cleanlab has been acquired by Handshake AI"** — the category is already consolidating, which
means validated AND late.

Not crawled but known-live in the same lane: NVIDIA NeMo Guardrails (free OSS), Patronus AI,
Galileo, Arthur, Vectara HHEM. The "AI reliability / hallucination-blocking" category is crowded
and funded.

## The correction to Opus's framing

Opus said the 150k-star frameworks "do not have an answer" for stopping invented numbers and the
field is "hand-waving" provenance. **At the marketing level that is false** — Guardrails AI and
Cleanlab both sell "block hallucinations before they reach users" as their headline. What IS true,
and narrower: they all do **probabilistic post-hoc detection** (an LLM/classifier scores another
LLM's output). Ours is **structural prevention** — the model never touches arithmetic, so an
invented number can't occur, and a lint failure aborts the write with the prior good file still
serving. That architectural delta is real. Whether a buyer who can purchase Cleanlab cares about
the delta is the open commercial question — "structurally impossible" vs "99% detected" is a
compliance-officer pitch, not a developer pitch.

## Guard-harness competition = free

The agent-guard-harness market is a gift economy: ECC (~400 skills/hooks/agents, includes
GateGuard fact-forcing, santa-method adversarial review, delivery-gate stop hooks — literally
installed and firing in the session that wrote this file), superpowers, the Claude Code plugin
marketplace. Selling a 32-hook harness competes with free. The differentiated residue is the
incident-derived playbook + the registration-test pattern (hook exists but unwired → test fails)
— that is credibility content / OSS, not a paid product.

## Verdict filed with the operator (see conversation, 07/25)

1. Provenance market: real, validated, funded, consolidating. We would enter late, horizontal,
   and understaffed. The structural-prevention angle is a genuine wedge but a second company.
2. Best use of the asset: keep it as the moat of the vertical product (per the flywheel + 07/17
   "credibility before features") and sell the OUTCOME (verified deliverables), not the engine.
3. Harness: publish, don't sell. Playbook + two laws as content for brand/inbound.
4. Nearest actual revenue remains the already-ranked candidates: the 07/18 top-20 RE list
   (ranks 1–2 marked SMALL, hard part built) and the committed 10-candidate non-RE sweep.
