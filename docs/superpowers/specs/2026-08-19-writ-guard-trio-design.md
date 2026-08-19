# Writ steals: human-only approval tokens + write-time TDD gate + scoped rule injection

**Date:** 2026-08-19
**Decree:** operator, 08/18/2026 night, after the Writ evaluation
(`_RESEARCH/agent-behavior/2026-08-18-writ-governance-runtime-evaluation.md`): "I guess we
need them all." All three mechanisms greenlit. No Docker, no Neo4j, no background service —
each mechanism rides the hook infrastructure this repo already runs (RULE 11).

## Problem

Writ (infinri/Writ, evaluated live 08/18/2026) names the failure this repo keeps hitting:
an instruction in context can be compacted away, diluted, or ignored — instructions and
enforcement are different primitives. We hand-built the enforcement half at PUSH time, but:

1. **Every escape hatch is Claude-settable.** All gates honor `ALLOW_*` / `OPERATOR_*` env
   prefixes that the agent itself can type. No gate here is actually Claude-proof.
2. **Every gate fires at push — after the code exists.** The "dumb fucking code" decree is
   a write-time problem; proof-of-red judges the push, not the write.
3. **Rules load all-at-once or not at all.** The 08/18 rules diet was step one; nothing
   yet delivers a specific rule at the moment of the matching write (Writ's strongest idea).

## What we're building — 3 parts (RULE 0.8 count)

### Part A — human-only approval tokens
- `.claude/hooks/lib/approval-token.mjs` — mint/consume/audit. Tokens live in
  `.claude/approvals/<gate>.token` (gitignored), single-use via atomic rename claim,
  30-minute TTL, every mint/consume/refusal appended to `.claude/approvals/audit.log`.
- `.claude/hooks/mint-approval-on-prompt.mjs` (UserPromptSubmit) — a token is minted ONLY
  when the operator's typed prompt is exactly an approval phrase (`approve <gate>`).
  UserPromptSubmit fires only on genuine human input; Claude cannot fabricate the event.
- `.claude/hooks/check-approvals-guard.mjs` (PreToolUse Edit|Write|Bash) — refuses agent
  writes into `.claude/approvals/` and Bash commands that touch the approvals dir or the
  minter, so the agent cannot mint its own token through the ordinary tool surface.
- First consumer: `check-no-paid-dispatch.mjs` accepts a consumed `paid-dispatch` token as
  approval. The `OPERATOR_APPROVED_PAID_RUN=1` env form stays working (it is the operator's
  own documented command, RULE 1) — migration of the remaining ALLOW_* gates to token-only
  is a follow-up check, not this build.

### Part B — write-time TDD gate
- `.claude/hooks/check-red-before-write.mjs` (PreToolUse Edit|Write) — blocks writing an
  implementation file when THIS session already Write-created its sibling test
  (basename match, same identity rule as the push gate) and the transcript family shows no
  red run of it. Enforces "watch it fail" between writing the test and writing the code —
  the exact moment push-time proof-of-red cannot see. Imports `hasRedMarker`/`basenameKey`
  from `check-proof-of-red-on-push.mjs` (one root, no drift) and `familyShowsLine` from
  `read-evidence.mjs`. Escape: `approve tdd-write` token → session-wide bypass flag in
  `.claude/hooks/.state/` (gitignored).

### Part C — scoped rule injection
- `.claude/hooks/inject-scoped-rules.mjs` (PreToolUse Edit|Write, ALWAYS exit 0) +
  `.claude/hooks/lib/scoped-rules.mjs` (the rule table). When the CONTENT being written
  matches a rule's pattern inside its path scope, the rule's 2–3 line gist + pointer to
  its owning doc is emitted as hook context — once per rule per session (state file keyed
  by session_id). Seed rules: fontFamily guard, h-screen→dvh, Deno imports in
  supabase/functions, ZIP 3 gates, deed-vs-list price domain rules, RULE 0.7b baked-prose
  ladder, RULE 0.7a paid-call ladder, react-set-state-in-effect.
- NOT the topic router inject-focus.mjs rejects: that misfire class keys on PROMPT words;
  this keys on the conjunction of governed path + content actually being written — Writ's
  "what action is happening" trigger, not "what did you type."

## Failure modes, named before building (RULE 3.5)

**A — tokens**
- Token file committed → dir gitignored AND the guard refuses agent writes there.
- Claude mints via Bash (`node -e`, running the minter directly) → approvals-guard blocks
  the ordinary paths; the adversarial residue (vars, eval, base64) is documented honestly —
  same cooperative-agent limit Writ states for itself. This constrains reflex, not malice.
- Stale token reused later → 30-min TTL checked at consume.
- Two gates race one token → atomic `fs.renameSync` claim; exactly one winner.
- Loose phrase mid-sentence mints accidentally → strict whole-prompt regex only.
- Minter bug wedges every prompt → UserPromptSubmit NEVER exits 2; fail open always.

**B — red-before-write**
- Per-edit habit tax (RULE 11) → fires only on the narrow shape: test Write-CREATED this
  session + basename-matched impl write + no red yet. Editing tests, docs, configs never
  blocks; impl-before-test never blocks (push gate remains the backstop).
- Hook IO error wedges the session → every failure path exits 0.
- Windows argv/import.meta mismatch ships a silent no-op (the ce163255 defect) →
  pathToFileURL guard + pure helpers under test.
- Subagent transcript blindness (the 08/18 playbook-hook defect) → familyShowsLine.
- Drift from the push gate's definitions → imports, never copies.

**C — scoped rules**
- Noise on every edit → once per rule per session, state-file dedupe.
- It blocks something → structurally impossible; sole exit code is 0.
- Rule text rots → each entry ≤3 lines + a pointer to the owning doc; the doc stays canon.
- Keyword misfire → path scope AND content pattern must both hit.

## Registration

All three PreToolUse hooks + the UserPromptSubmit minter register in
`.claude/settings.json` (hook-registration.test.mjs enforces the `check-*` ones).
`.claude/settings.json` is claimed by a live parallel session (c2ffeb1a) as of this build —
registration is the LAST edit, made surgically, coordinated against that claim.

## Explicitly out of scope

- Migrating every existing `ALLOW_*` gate to token-only (follow-up check; operator call on
  the paid-run command form).
- Any always-on rule removal (the diet is a separate track).
- Neo4j / retrieval ranking / provenance graph — rejected under RULE 11.
