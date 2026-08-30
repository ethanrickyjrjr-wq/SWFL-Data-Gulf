# Zillow compliant-real-estate-chatbot + fair-housing-guardrail — can they help our email prose?

Crawled 08/29/2026 via crawl4ai + `gh api`:
- https://github.com/zillow/compliant-real-estate-chatbot (19 stars, last push 03/21/2025, license NOASSERTION)
- https://github.com/zillow/fair-housing-guardrail (39 stars, last push 04/08/2026, AI PUBS OPEN RAIL-S 0.1)
- paper: https://arxiv.org/abs/2410.10860

## What they are
1. **compliant-real-estate-chatbot** — a Llama3-8B fine-tune (`zillow/realestateLM_llama3-8b`, HF, GATED — request access)
   trained on gpt-4o-generated synthetic Q&A/dialogs + a "safety" split of non-compliant queries with
   refusal-shaped answers. It is a CHAT model. README disclaimer verbatim: "This model is not designed to
   ensure compliance and should not be used as such."
2. **fair-housing-guardrail** — a text CLASSIFIER: (a) a stop-phrase list check (`utils/stop_phrases.py`:
   lemmatize+stem tokens, exact-phrase / unigram / bigram match against the list) run BEFORE (b) a
   fine-tuned BERT-base (binary compliant/non-compliant) or RoBERTa-large (multi-class:
   non-compliant-age/-disability/…). The fine-tuned weights AND the labeled dataset are BY REQUEST
   (fair-housing-guardrail-oss-support@zillowgroup.com). Public in-repo: a 5-line sample stop list
   ("no vouchers", "no kids", "kids not allowed", "veterans not allowed", "christians only"), a 1.9KB
   sample_data_multiclass.jsonl, training/eval notebooks. Zillow's own recommendation: use the
   classifier IN COMBINATION with a fair-housing-specific prompt.

## What we hold today (code opened this session)
- `lib/deliverable/recipes/shared.ts:113` — ONE prompt line: "No steering language, no describing who
  'should' want this property." PROMPT-ONLY. No code guard.
- `lib/email/voice-guard.ts` `VOICE_TELLS` — the keyed regex root that already strips AI-tells / clichés
  from every EmailDoc field (detect → strip → single regeneration ask). Zero fair-housing entries.
- `_RESEARCH/voice-and-positioning/2026-07-15-sell-side-copywriting-research.md` §97 already names the
  hard line (NAR SoP 10-1/10-3: never describe who belongs there — "perfect for families", "ideal for
  retirees", "safe neighborhood") and ASSUMED a code guard existed. It does not.

## Verdict
- The chatbot model: DO NOT ADOPT. An 8B Llama writing our email prose is a worse writer than the
  narrator we run, needs GPU hosting we don't have (RULE 0.9 plumbing, RULE 11 volume), is gated, and
  its own README says it doesn't ensure compliance. Nothing to steal from the fine-tune itself.
- The guardrail: DO NOT ADOPT the classifier (weights by request, Python+torch service for a
  ~150-word email at our volume). STEAL the shape of the stop-phrase check — it is ~20 lines and
  we already have the exact seat for it: fair-housing entries in `VOICE_TELLS`, label
  `"fair-housing"`, so detect/strip/regenerate machinery applies unchanged. The phrase list must
  come from a NAMED source (HUD advertising guidance / NAR SoP 10 word lists), never typed from
  memory; the 5 public sample phrases are seeds, not the list.
- Their public `sample_data_multiclass.jsonl` rows can serve as red-test fixtures for the guard.
- License note: OpenRAIL-S carries use restrictions; irrelevant if we copy the SHAPE, not the code.

## Status — BUILT 08/29/2026 (same session), operator said "Go"
NOT in voice-guard.ts after all: that file turned out to have ZERO runtime importers (its spec §4 seat, the
free-author repair loop, was deleted 08/02/2026 — check `voice_guard_unwired`). The phrase list + `fairHousingHits`
+ `auditClaims` kind `"fair-housing"` + the CLAIM_PROHIBITION bullet live in `lib/deliverable/claims.ts` (THE claim
gate root, 10 callers), and the string primitive is wired at: `lintAuthoredProse` / `filterAnchoredVariants`
(author-doc.ts), `lintFactText` (narrative-lint.ts), `dropFairHousingFields` at both `applyPatch` seats
(build-doc.ts), `assembleDraft` (build-week.ts), the social canvas author (design/author.ts). Word list source:
NY/OK Press Association "Fair Housing Advertising Word and Phrase List" (texaspress.com PDF) — its ACCEPTABLE
column is the false-positive test set. Live-verify: `fair_housing_lint_live_verify`.
