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
