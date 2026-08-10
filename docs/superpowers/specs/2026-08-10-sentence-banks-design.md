# Per-recipe sentence banks: allowed words in code, typed fill-in slots for the builder

> **Recommended model:** ⚡ Sonnet — keywords: architecture

**Date:** 2026-08-10 (brainstormed 08/09/2026)
**Check:** `sentence_banks_live_verify`
**Operator decree (08/09/2026):** *"CODE IN WHAT WORDS ARE ALLOWED TO BE SAID AND LEAVE BLANK THE
NUMBERS AND DATES AND ADDRESSES, COMMUNITY INFO, OPEN HOUSE TIME, ETC — BUILDER CAN FILL IN FOR
EACH DIFFERENT BUILD."* Four design picks confirmed in the brainstorm; a five-point adversarial
review (second model, 08/09/2026) was verified claim-by-claim against the code and folded in.

## Honest scope statement

All 17 recipes already have working builders (playbook line 96). This is NOT greenfield — it is a
retrofit of the PROSE layer under shipped emails. What makes it safe: a recipe without a bank
builds byte-identical to today (no-bank-no-change is a hard rule, test-enforced), and rollout is
one email per session with a render + acceptance run each, the same discipline every walked email
already got.

## Problem

Every fact-bearing sentence in a lifecycle email today is model-written and then GATED (the claim
audit drops prose carrying ungiven facts). Gating catches inventions but cannot make the words
good: the same research that decided each email's craft (14 files in
`_RESEARCH/email-and-social/`, 2 in `_RESEARCH/voice-and-positioning/`) lives in prompts and walk
notes, not in code, so nothing pins WHICH words ship. Meanwhile the slots the builder must fill by
hand (open house time above all — zero open-house columns in the lake, probed live 08/09/2026;
the vendor's own doc examples show its `open_houses` field only ever `[]`/`null`; the render
harness takes date/time as typed arguments) have no typed home in the prose — they exist only as
grid cells.

Vendor practice (fetched live 08/09/2026, filed:
`_RESEARCH/email-and-social/2026-08-09-merge-tag-fallback-vendor-docs.md`): Mailchimp and HubSpot
both document that an unfilled personalization token with no default ships a LITERAL BLANK into
the send; Klaviyo documents a per-tag `|default:` filter. Per-token fallback text is the strongest
guard any of them offers. Ours must be stronger: a gap never ships.

## Goal

Each recipe carries an approved-sentence bank written from ITS research file. Every sentence that
states a fact comes from the bank, with typed blanks. Code fills blanks from the recipe's
already-resolved facts (the sourcing ladder is upstream and unchanged); unfilled blanks render as
labeled open slots on canvas for the builder; at send time an unfilled sentence drops whole and a
missing ESSENTIAL slot blocks the send by name. Model prose shrinks to connective warmth only —
digit-free, audited — and is SKIPPED entirely when bank + facts already satisfy the word floor.

## Decisions (operator-confirmed 08/09/2026)

1. **Strictness:** bank-only for fact sentences; free connective stays model-written but
   digit-free (the market-pulse invariant, generalized).
2. **Unfilled at send:** drop the sentence whole; each recipe may mark 1–2 slots ESSENTIAL
   (open house time on open-house; the cut amount on price-reduced) — an essential blank blocks
   the send with a message naming the blank. Scheduled sends treat an essential gap as
   skip-with-log, never a silent half-email.
3. **Rollout:** the 7 lifecycle listing emails, one per session. **First target: price-reduced**
   — its acceptance build ships TODAY with the paragraph as an open slot (no paid description →
   narrator never fires), so the bank adds prose where there is currently NONE, instead of
   retrofitting under open-house's crafted, signed-off invitation narrator. Its playbook walk
   (§2.7) is still owed and gets written in the same session as its bank.
4. **Architecture:** one shared engine + a bank file per recipe beside its builder.

## What we're building

### A. Shared engine — `lib/deliverable/language.ts` (new, PURE — no I/O, no LLM)

- Types: `SentenceTemplate` = fixed words + typed slots. Slot types: `number`, `money`, `date`,
  `time`, `address`, `community`, `text`. Each slot: canvas label (the instruction — SEED_DOCS
  label law), optional `essential: true`.
- `fillSentences(bank, facts)` — resolves slots from the recipe's already-built facts object
  (never fetches; the four-lane ladder runs upstream). Dates MM/DD/YYYY. Money formatted once,
  here.
- `dropUnfilled(sentences)` — a sentence missing any slot value is dropped WHOLE.
  Precedent note (both live in the codebase, each right for its case): `voice-guard.ts:13` is
  phrase-surgical because model prose may carry a cited number in the same sentence;
  `shared.ts:616`'s scaffold-strip is sentence-level delete-only ("one bad clause is one bad
  clause"). A template sentence is the second case with even less to lose — its only content IS
  the slot; fixed words around a hole are the vendor blank-space failure we exist to beat.
- `essentialGaps(bank, facts)` — returns named essential blanks for the send gate.
- `auditBankTemplates(bank)` — test helper: every template digit-free outside its slots
  (generalizes `auditConnective`, market-pulse.ts:522, which is `auditClaims` with an empty
  settled set — nothing market-pulse-specific).
- `bodyWordCount(paragraph)` — for the floor guard (D).

### B. Per-recipe banks — `<recipe>.language.ts` beside `<recipe>.ts`

- Header cites the research file(s) the sentences came from, by path.
- The bank EXTENDS that email's Voice Card (playbook §1.20) — the walk section gains a "bank"
  subsection listing the sentences verbatim. No parallel mapping doc.
- Slot fill sources, stated per slot in the bank file: numbers/prices/addresses/dates from the
  recipe's facts (lake-resolved); community from the community match (auto-fill on hit, sentence
  drops on miss); open house time ALWAYS builder-typed (lane 4 — see Problem for the three-lane
  evidence).
- Voice is per-email: a bank must carry the register its research decided (just-sold's "ONE
  detail, in plain human words"; open-house's invitation craft). `auditBankTemplates` checks
  digits, never diction — it must not flatten voices across recipes.

### C. Integration — the narrator seam in `recipes/shared.ts`

- Filled bank sentences are inserted by CODE into the paragraph. They are NEVER round-tripped
  through the model — the model cannot rewrite them.
- The connective call (when it runs) gets the filled sentences as fixed context plus permission
  to add 1–2 digit-free sentences. Backstop: the EXISTING claim gate — the claim audit +
  anchors inside `authorListingNarrative` (shared.ts:606–634), which drops any addition carrying
  an ungiven fact. (`fillNarrative` at shared.ts:283 is only the placement step — a slot-filler,
  not a gate; `clearNarrativeSlots` must still run first, its documented landmine.)
- **RULE 0.7b compliance:** the bank is the baked lane for factual prose. If bank + facts alone
  reach the 50-word floor, the connective model call is SKIPPED — a zero-metered-call build
  (price-reduced's 08/09/2026 acceptance run already proved the zero-call path renders clean).
- No-bank-no-change: `bankFor(recipeKey)` returns null for un-banked recipes and the builder
  runs exactly today's path.

### D. Send gate + canvas

- Canvas: unfilled slots ride the existing open-slot mechanics (SEED_DOCS empty-value +
  instruction-label rule; OpenSlot rendering). No new canvas machinery.
- Manual send: `essentialGaps` non-empty → block with the named blank ("Open house time is
  empty"). Non-essential gaps → sentence already dropped, send proceeds.
- Floor guard (NEW — nothing in the build path counts body words today, verified 08/09/2026):
  after drops, if body prose lands under 50 words (`docs/standards/emails.md` §0.1 — the floor
  bites harder than the ceiling), the build logs it and the connective call (if skipped) is
  re-enabled to reach the floor; if it still can't, the email ships with the grid + what prose
  it has and the shortfall is logged loudly — never blocked on a nice-to-have, never padded with
  invented filler.

## Failure modes → guards (RULE 3.5)

1. Bank sentence smuggles a digit → `auditBankTemplates` red test per bank file (same invariant
   voice-presets already enforces on its own text).
2. Model rewrites a bank sentence → structurally impossible: code inserts filled sentences; the
   model only ADDS, and the claim gate (shared.ts:606) drops additions carrying ungiven facts.
3. Slot fills from the wrong lane → slots read the recipe's already-resolved facts object only;
   the engine never fetches. The ladder's order is enforced where it already lives.
4. Essential-blank block strands a scheduled send → scheduled path: skip-with-log (the
   campaign-sim/run-schedules lane), manual path: block with the named blank.
5. Bank drifts from its research → citation header + the bank test quotes its research file's
   load-bearing lines; the playbook walk section updates in the same session as the bank
   (existing playbook law: never pre-fill a walk from memory).
6. Un-banked recipe changes behavior → `bankFor` null path is test-pinned byte-identical to
   today's build for one golden recipe.
7. Sentence drops push the body under the 50-word floor → floor guard in D (count, re-enable
   connective, loud log — the floor was previously unguarded ANYWHERE in the build path).
8. Bank flattens a researched voice → per-recipe register review in the walk session (human
   gate, the same render-and-look law every walked email follows); `auditBankTemplates`
   deliberately checks digits only.

## Testing

TDD per unit (standing rule): engine tests first (slot typing, fill, drop-whole, essential
gaps, digit audit, floor count), then per-bank tests named for the failure mode they target.
Every bank lands with a render + acceptance run off the rendered bytes (the harness pattern
`scripts/email/render-price-reduced.mts` established) in the same session.

## Rollout

1. Engine + `price-reduced.language.ts` + §2.7 walk (same session, one PR-shaped change).
2. Remaining lifecycle emails one per session in playbook order: coming-soon, open-house (voice
   preserved per FM8), then the rest of the seven.
3. Area/agent recipes only after the lifecycle seven prove the pattern — market-pulse keeps its
   own coded-sentence system (it IS the pattern's origin; do not port it backwards).

## Evidence trail

- Live probes 08/09/2026: zero open-house columns in the lake; vendor doc's `open_houses` only
  `[]`/`null` in examples; 359/384 paid rows carry a description; 121 baked narratives on hand.
- Research filed: `_RESEARCH/email-and-social/2026-08-09-merge-tag-fallback-vendor-docs.md`.
- Adversarial review 08/09/2026: five claims verified against code — two confirmed (claim-gate
  misattribution, first-target swap), two refined (drop-whole precedent, probe wording), one
  refuted with artifacts (the ESP claim was crawled live, just unfiled — the filing gap is fixed).
