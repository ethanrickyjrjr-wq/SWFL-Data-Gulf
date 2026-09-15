# refinery/ — the brain factory (Class-B conventions)

Pack-specific rules live in `refinery/packs/CLAUDE.md` — read that when touching packs.
The brain-factory non-negotiables that live OUTSIDE packs/:

- **Validators gate writes** — `refinery/validate/spec-validator.mts` (+ facts-only,
  inference-bait, smoothing lints). Failure aborts; the prior file stays intact. Never
  bypass or weaken a validator to make a write land.
- **The OUTPUT contract** is `refinery/types/brain-output.mts`. Type changes ship with
  all-pack backfill in one commit (atomic type-lift). After edits to types/** or
  packs/**, run the v3-spec-guard agent.
- **Cycle detection** — the topological sort throws on upstream cycles; downstream reads
  only `--- OUTPUT ---` of upstream (thin pipe), never branches.
- **`brain-input:*` bypass** forces the Stage 2 composite to max; the **stale-upstream
  caveat** auto-appends and propagates `min(self, upstream)` confidence. The freshness
  token is quoted on first response (lake protocol #2).
- **Rules of engagement** — ONE root: `refinery/lib/rules-of-engagement.mts` (verbatim;
  the FOCUS hook re-injects the gist). Don't create a second copy.
- Deterministic math in code; LLMs synthesize narrative only.
- **Two model backends, ONE root** — `refinery/agents/anthropic.mts` hands out the client.
  `LLM_PROVIDER=api` (default) is the SDK on `ANTHROPIC_API_KEY`; `LLM_PROVIDER=claude-code`
  is `claude -p` on the machine's claude.ai subscription login (2026-09-15, operator: "run
  the rebuild through a sonnet, we have Max") — `refinery/agents/claude-code-provider.mts`,
  forced-tool shape only, API key stripped from the child, ledger rows priced at $0 under
  `claude-code/<model>`. Never `--bare` (it turns the login off). Proof:
  `LLM_PROVIDER=claude-code SKIP_USAGE_LOG=1 bun scripts/prove-claude-code-provider.mts`.
