# Writ (infinri/Writ) — governance runtime for Claude Code — adopt or steal?

**Source:** https://github.com/infinri/Writ (README read live via `gh repo view`, 08/18/2026, v1.7.0 released 2026-08-08, MIT)
**Asked by operator:** "How can this help us here since Claude sucks."
**Verdict: DO NOT ADOPT. Steal three mechanisms.** Same shape as the Omnigent call (07/30/2026).

## What it is

Python/Docker/Neo4j runtime that sits between Claude Code and the filesystem via hooks. Three claims:

1. **Enforce** — tool-time gates. In "work mode," source writes are REFUSED until a human approves
   a plan and a test file. Approval consumes a one-time secret written only when the HUMAN types the
   approval phrase — the AI cannot self-approve (atomic file claim; self-approval attempts are
   audit-logged). Credential-file writes refused in every mode. A CRITICAL review verdict turns the
   next commit into a confirm prompt the AI can't clear itself.
2. **Inform** — 288-rule rulebook in a Neo4j graph. 7 rules always-on, 25 keyword-gated on writes,
   the rest retrieved by a 5-stage pipeline (keyword + semantic + graph walk). ~2,000 tokens/turn
   FLAT regardless of rulebook size (measured vs 10k synthetic rules). Rules fire on the ACTION
   (file being written contains SQL → SQL rules arrive), not on what the prompt said.
3. **Remember** — provenance graph: commit → approved plan → rule IDs shown/cited → files. Replayed
   as session briefing injection, git notes, PR comments (Bitbucket Cloud ONLY — GitHub unsupported).

## Its own admitted limits (README is unusually honest)

- **The central claim is UNPROVEN, by their own statement**: no measurement exists that a model
  handed the right rule complies more than one handed nothing. Harness exists, never run at scale.
- Fail-OPEN when the background service is down (by design). Subagents SKIP the write gates by
  design. Shell-write inspection has named holes (var-assembled paths, eval/base64, `python -m`).
- Not an adversarial sandbox — constrains a cooperative agent only.
- Rulebook is the author's (12 Magento 2 rules, 1 PHP typing rule); ours would be ported by hand.
- Graph-walk stage — the whole reason Neo4j exists — has never been isolated; contribution may be ~0.

## Overlap with what we already built (why not adopt)

We hand-built most of Writ already: 17+ pre-push gates (`.claude/hooks/`), FOCUS re-injection every
prompt, SCRATCHPAD/STRIKES, checks ledger, SESSION_LOG, proof-of-red, four-lane gate, area
CLAUDE.mds loading by location. Installing Writ = two governance systems fighting (its plan gate vs
our brainstorm/safe-push flow), plus Docker + Neo4j + a Python service on the dev box for a ~40-rule
rulebook — RULE 11 fails it: Neo4j retrieval at our volume is a hyperscaler pattern; a keyword map
in a hook does the same job. Its provenance channel targets Bitbucket; we're GitHub.

## The three mechanisms worth stealing (the actual answer to "how can this help")

1. **WRITE-time gating, not PUSH-time.** Every gate we own fires at push — after the dumb code
   already exists. Writ blocks the Edit/Write call itself until plan/test artifacts exist. We
   already own the hook infra (PreToolUse can hard-deny, even in bypass-permissions mode); shifting
   proof-of-red from push to write for TDD-mandatory areas needs zero new infrastructure.
2. **Scoped rule delivery instead of the always-loaded rulebook.** The 08/18 diet decree ("we can't
   have rules that load every time that claude doesn't read") is exactly Writ's thesis. Their
   mandatory-floor design: 7 universal + the rest keyword/path-gated at the moment of the matching
   write. We did step one (the diet); step two is a PreToolUse hook that injects the relevant rule
   text when a matching file/content is touched. No graph DB needed at our size.
3. **Human-only approval tokens.** Our gate escapes are `ALLOW_*` env vars — which Claude itself can
   set, so every gate is self-approvable. Writ's one-time secret exists only after a human
   keystroke and is claimed atomically. If any gate here should be Claude-proof (paid runs,
   destructive ops), this is the mechanism.

Bonus: their `docs/reference/claude-code-blackbox.md` is a version-pinned empirical map of the hook
payload contract (what a hook receives, what it can return, the tool-call rewrite mechanism) —
useful standalone reference for our own hook work.

## One more honest note

Writ's diagnosis of WHY "Claude sucks" matches our scratchpad history exactly: an instruction in
context can be compacted away, diluted, or ignored, and nothing makes violating it mechanically
impossible — instructions and enforcement are different primitives. Our repo's answer so far has
been more instructions plus push-time hooks. The strikes registry (6 strikes on one shape, guard
OWED) is evidence the instruction half doesn't hold alone. The steal-list above is the enforcement
half, on infrastructure we already run.
