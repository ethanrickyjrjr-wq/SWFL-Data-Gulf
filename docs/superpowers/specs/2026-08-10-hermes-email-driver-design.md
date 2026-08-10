# Hermes Email-Builder Driver — transitions feed + build seam + driver skill

**Date:** 08/10/2026 · **Status:** DESIGN — approved shape from operator brainstorm, spec pending operator review
**Check:** `hermes_email_driver_live_verify`
**Research basis (all read this session):**
- `_RESEARCH/agent-behavior/2026-08-10-hermes-skills-hooks-blueprints-research.md` (skills = agentskills.io SKILL.md, webhook/cron triggers, `[SILENT]`, fail-closed `pre_tool_call` hooks)
- `_RESEARCH/agent-behavior/2026-08-09-hermes-continuous-work-research.md` (cron script-first zero-token ticks, kanban circuit breakers, 08/09 pilot: local model fabricated a figure once — Hermes NEVER authors content)
- `_RESEARCH/agent-behavior/2026-08-08-hermes-model-upgrade-research.md` (model ladder, free-tier caps)
- `docs/standards/email-build-playbook.md` PART 0 (one pipe, three dials), `lib/deliverable/recipes/index.ts` (RECIPE_BUILDERS dispatch)
- Piece 2 G1 action surface — **SHIPPED, not pending** (corrected 08/10/2026 after code audit; the check `piece2_g1_action_surface` is closed, commit `c7eab68`): `app/api/projects/[id]/action/route.ts` is a working PROPOSE→CONFIRM dispatcher using `issueProposalNonce`/`verifyProposalNonce` (`lib/email/proposal-nonce.ts`) + `claimOnce` (`lib/email/idempotency.ts`, atomic ON CONFLICT DO NOTHING against `email_send_ledger`). Piece 4 EXTENDS these primitives; it does not reinvent them.
- Token issuance — the ONE existing system is `app/api/tokens/route.ts` + `lib/api-tokens/token.ts` (`mintToken`/`hashToken`) + `user_api_tokens` (hashed, per-user, row-delete revocation). It has NO scope column today; this build adds one (see Auth model below) rather than erecting a second token mechanism.

## Decisions locked in brainstorm (operator, 08/10/2026)

1. **Operator pilot first.** Hermes on the operator's box drives real builds for the operator's brand + the fictional demo account. End-user version comes later, server-side, reusing the same seams.
2. **Events first.** Listing transitions (price cut, status flip, gone/sold), not calendar emails.
3. **Telegram ping + saved draft.** Draft lands in the listing project like a hand-built one; Hermes pings Telegram with what happened + the link.
4. **Pull, never push (operator's own correction).** No inbound traffic to the desktop, no tunnel. Server detects; Hermes fetches changes OUTBOUND from a cursor feed. "All Hermes needs to know are the changes" — correct, and a plain feed endpoint replaces any middle agent.
5. **No schedule while testing.** The tick is fired manually; the cursor makes late ticks lossless. Interval is a config line set after the loop is proven.
6. **Fake test runs.** A test-inject lane creates synthetic transitions scoped to the demo account so every recipe can be rehearsed end-to-end on demand. Only the EVENT is fake — the build uses real lake data through the real gates, and nothing sends.

## Architecture — four small pieces

```
[1] DETECTOR (already exists)          [2] FEED (new, small)
data_lake.listing_transitions   ──►   GET /api/agent-feed/transitions?cursor=…
written by ingest listing_lifecycle    + POST /api/agent-feed/test-inject (demo-scoped)
(idempotent append, keyed on           auth: feed token (read-only scope)
 source, address_key, sale_or_rent,           │  outbound HTTPS pull
 to_state, at)                                ▼
[4] PRODUCT BUILD SEAM (new-ish)      [3] HERMES DRIVER (operator's box)
POST /api/agent/build  (PROPOSE→      cron job (manual fire during pilot) with
CONFIRM shape reused from             pre-agent script: pull feed → [SILENT] if
/api/email/schedule-command;          empty (zero tokens) → else agent turn runs
thin authed dispatcher — the          the swfl-email-driver SKILL: map transition
piece2_g1_action_surface rec,         → recipe_key, call [4], ping Telegram with
first real consumer). Runs the        draft link. Skill authored via /learn after
NORMAL pipe: authorDoc → seam →       one manually walked-through cycle.
brand → one door. Saves draft to
the listing project. Returns
draft id + preview URL. NO SEND
SCOPE EXISTS ON THIS TOKEN.
```

### Piece 1 — detector: no new code
`ingest/pipelines/listing_lifecycle/` already appends transitions idempotently; identity is address + sale_or_rent (never the rotating listing id). The desk movers board already reads the table; this build adds the first AGENT consumer. Data root honored: `docs/standards/data-roots.md` catalogues `listing_transitions` (forward-only sweep — T11: blind before our watch; the feed inherits that honestly and the skill must never phrase a cut as "total").

### Piece 2 — the feed (server, new)
- **Auth model (one system, three scopes — resolves the 08/10 review contradiction):** extend `user_api_tokens` with a `scope` enum column (`agent_feed_read` · `agent_build` · `agent_test_inject`); mint/hash/revoke via the existing `mintToken`/`hashToken` in `lib/api-tokens/token.ts`. No second token mechanism. Hermes holds TWO tokens: one `agent_feed_read`, one `agent_build`. The `agent_test_inject` token is a THIRD credential held only by the operator/Claude for rehearsals — Hermes never holds it. Each is independently revocable by row delete.
- `GET /api/agent-feed/transitions?cursor=<id-or-ts>&addresses=<optional scope>` → rows after cursor, capped page, next-cursor. Requires `agent_feed_read`. Serves ONLY: address, sale_or_rent, from_state→to_state, price_delta if any, at, source_name, `test` flag.
- `POST /api/agent-feed/test-inject` → writes a transition row flagged `test=true`, HARD-scoped: address must belong to the demo account's saved projects (validated server-side), and test rows are excluded from every non-agent consumer (desk boards, rollup views). Requires `agent_test_inject`.
- Test rows live in a separate table (`agent_feed_test_events`), NOT in `data_lake.listing_transitions` — the real table stays pure ingest provenance; the feed UNIONs the two and stamps origin.

### Piece 3 — Hermes driver (operator's box, config not product code)
- Skill `swfl-email-driver` in `~/.hermes/skills/` (agentskills.io SKILL.md; author with `/learn` after one manual walkthrough). Contents: the transition→recipe map (price cut→price-reduced, pending/contract→under-contract, gone+deed→just-sold, new→new-listing, back→back-on-market), the feed pull, the build call, the Telegram message shape. The skill FORBIDS composing prose/figures — payload to the seam is recipe_key + address + transition id ONLY.
- Cron job with pre-agent script (Python): pull feed with stored cursor → nothing new = print `[SILENT]`, agent never wakes, zero tokens → else stdout = the JSON changes, agent turn runs the skill. Pilot: no schedule; fire with `hermes cron run`. Cursor persisted locally by the script.
- `pre_tool_call` shell hook in `~/.hermes/hooks/`: blocks (fail closed) any HTTP call whose URL matches send/schedule/blast patterns. Second layer independent of token scope.

### Piece 4 — build seam (server, the only product-code piece of size)
- `POST /api/agent/build` { recipe_key, address, transition_id } → validates `agent_build` token → resolves subject at the ONE inspection point (`resolveSubject`) → runs the recipe through the normal pipe (`builderFor(key)` → seam → brand → one door) → saves draft into the matching listing project (demo account for test events) → returns { draft_id, preview_url, built_from }.
- **Deliberately single-phase.** The shipped G1 action surface is two-phase (PROPOSE returns a signed nonce, human CONFIRMs) because a human is in that loop. Here the call is machine-to-machine with nobody to confirm, and the output is a DRAFT — the human confirmation happens later, in the product, at send. So idempotency substitutes for the nonce round-trip, using the SAME primitive the G1 surface uses: `claimOnce` (`lib/email/idempotency.ts`) on key `agent-build:<address_key>:<sale_or_rent>:<to_state>:<at>` (the transition natural key, mirroring the `listing_transitions` UNIQUE constraint in `migrations/20260627_listing_lifecycle.sql`). Re-tick, double-fire, replay → claim lost → same draft returned, no duplicate.
- NO send path. The token cannot reach send; drafts are sent only by a human in the product (paywall + click unchanged).

## Failure modes → guards (RULE 3.5, named before build)

1. **Double-build on re-tick / cursor loss** → `claimOnce` on the transition natural key at the seam (same primitive as G1's nonce redemption); the append table's own ON CONFLICT already dedupes upstream. Test: replay same feed page twice, assert one draft.
2. **Flapping listing (state A→B→A same day)** → each transition is a distinct natural key; the skill builds only the LATEST state per address per tick (script collapses per-address before the agent sees it). Test: inject flap, assert one draft for final state.
3. **Fake event leaking to a real account** → test-inject validates address ∈ demo account projects server-side (not trusted from caller); test rows in a separate table; feed stamps origin; build seam routes `test`-origin drafts ONLY to the demo account. Test: inject with a real-account address, assert 403.
4. **Hermes local model invents content or numbers** (happened 08/09) → structurally impossible to matter: the seam accepts recipe_key + address + transition_id only — free text is rejected by schema; all prose/figures come from the pipe's own gates. Test: POST with extra prose field, assert 400.
5. **Send triggered by the agent** → no send scope on the token (server-enforced) + fail-closed `pre_tool_call` hook (client-enforced). Test: attempt send-shaped call from a Hermes session, assert blocked at both layers.
6. **Desktop off / missed ticks** → cursor feed is lossless; next manual tick drains everything since. No timer to miss during pilot. Test: inject 3 events, tick once, assert 3 drafts (post-collapse rules).
7. **Feed or build token leaks** → `agent_feed_read` exposes only transition metadata (no PII beyond an address already public on listing portals); `agent_build` can only create drafts on the two pilot accounts; each revocable independently by row delete in `user_api_tokens`. Rotation documented in the runbook section of the implementation plan.
7b. **Test-inject token leaks or is misused** (its own break, per RULE 3.5 — it is a WRITE credential) → blast radius by construction: it can only create rows in `agent_feed_test_events` whose address is server-validated against the demo account's projects; it cannot touch `data_lake.listing_transitions`, cannot build, cannot send. Worst case = junk test events on the fictional demo account, visible and deletable. Hermes never holds this token. Test: inject with real-account address → 403; inject via feed-read or build token → 403.
8. **T11 phrasing trap** (forward-only sweep understates total cuts) → the skill's Telegram message and the seam's `built_from` label say "price cut observed MM/DD/YYYY", never "total reduction". The email itself already obeys pipe language rules.
9. **Free-tier 429 mid-run** (happened 08/09) → agent turn is one short tool-call chain, not a goal loop; script-only quiet ticks cost zero; if the turn dies, cursor doesn't advance (advance ONLY after seam 200), so next tick retries. Test: kill the turn before seam call, assert cursor unchanged.

## Explicitly out of scope (YAGNI)
- Any schedule/interval tuning; calendar-driven emails (market pulse etc.); the end-user server-side version; social posts per stage; auto-send anything; Hermes kanban/goal cards; new UI. The end-user version later lifts pieces 1-2-4 unchanged and replaces piece 3 with a server worker.

## Testing summary
Unit: feed cursor paging, test-inject scoping, seam schema rejection, idempotency. E2E rehearsal (the "fake test runs" the operator asked for): inject one fake transition per recipe on the demo account → manual tick → assert draft exists in project + Telegram message received + zero sends. Live verify: one REAL transition (next actual price cut in the watch window) produces a draft unprompted → close `hermes_email_driver_live_verify` on that evidence.
