# Jev (TypeSafe AI "System One" decision model) — evaluation

Date: 09/21/2026 · Raised by operator from https://x.com/0xricker/status/2101705843200721203
Crawled live (crawl4ai 0.9.0) 09/21/2026:
- the tweet + the quoted X article "Jev Engineering: The 10-Step Guide to Giving Your Agents a
  Decision Brain" (via api.fxtwitter.com — full article blocks come back in the JSON)
- independent review: https://wavect.io/blog/jev-ai-decision-model-review/
NOT crawled this pass: docs.typesafe.ai, evals.typesafe.ai, typesafe.ai/team (cited by the review only).

## What it is

A hosted, closed, PAID decision model from TypeSafe AI (founder Diogo Almeida, RLHF/InstructGPT
co-inventor per the review's reading of TypeSafe's team page). You send structured state + typed
questions; it returns a typed answer with probabilities. It cannot write text. Three primitives:
Choice (pick one of up to 255 declared options), Score (place on a rubric), Noul (yes/no
probability). Questions against the same state run in parallel. Vendor-stated price $0.042 per
million input tokens, no output charge; vendor-stated latency 70–500 ms.

The tweet itself is an influencer thread (0xRicker, 10k followers, Bali) repackaging the vendor's
pitch as a discipline called "Jev Engineering": request → structured state → router → cheapest
capable model → worker → relevance/approval checks → execution gate → tool.

## The headline numbers

"193x faster, 444x cheaper" = TypeSafe's OWN four-workflow evaluation, which TypeSafe itself calls
near the high end of real gains. Vendor-designed harness, model-generated reference labels, not an
independent audit (wavect review). Do not repeat as fact.

## Vendor-published failure modes (Jev 1.13 "jaggedness" page, via the review)

Literal; weak on numeric precision and DATE COMPARISON; distracted by large irrelevant state;
steerable by adversarial text in the state; typed ≠ correct; probabilistic, not deterministic;
confidence is not authorization.

## Does it run here / overlap map

- Reachable: yes, it is just an HTTPS API. But it is a NEW PAID VENDOR (global rule 9: three
  alternatives + recorded comparison before adoption — not done, not warranted yet).
- Model routing: already answered 07/30/2026 (`2026-07-30-model-routing-lanes-1-2-3.md`) — a
  router's value is provider fan-out and we have ONE provider. Still true.
- The "decisions don't belong to an LLM" half: our pipeline already goes further. Factory rule is
  deterministic math; fetch/count/grade needs no model (NORTH STAR #2). Hooks, pre-push gates,
  spend guards, `gateNarrative`, spec-validator = our execution gate, in code, at $0.
- Its weak spots (numbers, dates, big state) are exactly what our data is made of.
- Volume (RULE 11): measured product API spend was $50.12 / 30 days (07/30 research). 444x cheaper
  on the decision slice of $50 is cents. Interactive coding is Max plan, not metered.
- Compaction-as-relevance-filter (step 9): Claude Code owns compaction; not ours to swap.

## Verdict: DO NOT ADOPT. Steal the shape (mostly already held).

The one reusable idea is the sorting test: creates text → LLM; picks/scores/yes-no on meaning →
small classifier; exact rule → code. We already run the third pile hard. The only place the middle
pile exists for us is semantic triage inside metered jobs (e.g. "is this news item relevant to
this ZIP", pulse distill relevance). If one of those ever shows up as a real cost or latency line,
the first lane is the local box (Qwen3-14B is level with Haiku on one-shot schema-checked calls,
07/30 research) — free, already owned — before any new vendor.

Serves no current NORTH STAR priority (1–5 are free-data fetch, deterministic comparison, one
forecast test, small-slice ops, the dossier). Nothing to build.
