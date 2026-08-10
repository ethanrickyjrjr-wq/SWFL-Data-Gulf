# Hermes Email-Builder Driver — transitions feed + build seam + driver skill

**Date:** 08/10/2026 · **Status:** DESIGN — approved shape from operator brainstorm, spec pending operator review
**Check:** `hermes_email_driver_live_verify`
**Research basis (all read this session):**
- `_RESEARCH/agent-behavior/2026-08-10-hermes-skills-hooks-blueprints-research.md` (skills = agentskills.io SKILL.md, webhook/cron triggers, `[SILENT]`, fail-closed `pre_tool_call` hooks)
- `_RESEARCH/agent-behavior/2026-08-09-hermes-continuous-work-research.md` (cron script-first zero-token ticks, kanban circuit breakers, 08/09 pilot: local model fabricated a figure once — Hermes NEVER authors content)
- `_RESEARCH/agent-behavior/2026-08-08-hermes-model-upgrade-research.md` (model ladder, free-tier caps)
- `docs/standards/email-build-playbook.md` PART 0 (one pipe, three dials), `lib/deliverable/recipes/index.ts` (RECIPE_BUILDERS dispatch)
- Piece 2 memory + open check `piece2_g1_action_surface` (option-b-as-wiring: reuse schedule-command PROPOSE→CONFIRM + build route; thin authed dispatcher is the only net-new)

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
- `GET /api/agent-feed/transitions?cursor=<id-or-ts>&addresses=<optional scope>` → rows after cursor, capped page, next-cursor. Read-only token auth (new scope, no other permissions). Serves ONLY: address, sale_or_rent, from_state→to_state, price_delta if any, at, source_name, `test` flag.
- `POST /api/agent-feed/test-inject` → writes a transition row flagged `test=true`, HARD-scoped: address must belong to the demo account's saved projects, and test rows are excluded from every non-agent consumer (desk boards, rollup views) by the flag. Auth: same operator token.
- Test rows live in a separate table (`agent_feed_test_events`), NOT in `data_lake.listing_transitions` — the real table stays pure ingest provenance; the feed UNIONs the two and stamps origin.

### Piece 3 — Hermes driver (operator's box, config not product code)
- Skill `swfl-email-driver` in `~/.hermes/skills/` (agentskills.io SKILL.md; author with `/learn` after one manual walkthrough). Contents: the transition→recipe map (price cut→price-reduced, pending/contract→under-contract, gone+deed→just-sold, new→new-listing, back→back-on-market), the feed pull, the build call, the Telegram message shape. The skill FORBIDS composing prose/figures — payload to the seam is recipe_key + address + transition id ONLY.
- Cron job with pre-agent script (Python): pull feed with stored cursor → nothing new = print `[SILENT]`, agent never wakes, zero tokens → else stdout = the JSON changes, agent turn runs the skill. Pilot: no schedule; fire with `hermes cron run`. Cursor persisted locally by the script.
- `pre_tool_call` shell hook in `~/.hermes/hooks/`: blocks (fail closed) any HTTP call whose URL matches send/schedule/blast patterns. Second layer independent of token scope.

### Piece 4 — build seam (server, the only product-code piece of size)
- `POST /api/agent/build` { recipe_key, address, transition_id, idempotency_key } → validates token (build-only scope) → resolves subject at the ONE inspection point (`resolveSubject`) → runs the recipe through the normal pipe (`builderFor(key)` → seam → brand → one door) → saves draft into the matching listing project (demo account for test events) → returns { draft_id, preview_url, built_from } . PROPOSE→CONFIRM shape mirrored from `app/api/email/schedule-command` per the piece2_g1 recommendation — unify at orchestrator layer, never transport.
- Idempotency: unique on (address_key, transition natural key). Re-tick, double-fire, replay → same draft, no duplicate.
- NO send path. The token cannot reach send; drafts are sent only by a human in the product (paywall + click unchanged).

## Failure modes → guards (RULE 3.5, named before build)

1. **Double-build on re-tick / cursor loss** → idempotency key on the transition natural key at the seam; the append table's own ON CONFLICT already dedupes upstream. Test: replay same feed page twice, assert one draft.
2. **Flapping listing (state A→B→A same day)** → each transition is a distinct natural key; the skill builds only the LATEST state per address per tick (script collapses per-address before the agent sees it). Test: inject flap, assert one draft for final state.
3. **Fake event leaking to a real account** → test-inject validates address ∈ demo account projects server-side (not trusted from caller); test rows in a separate table; feed stamps origin; build seam routes `test`-origin drafts ONLY to the demo account. Test: inject with a real-account address, assert 403.
4. **Hermes local model invents content or numbers** (happened 08/09) → structurally impossible to matter: the seam accepts recipe_key + address + transition_id only — free text is rejected by schema; all prose/figures come from the pipe's own gates. Test: POST with extra prose field, assert 400.
5. **Send triggered by the agent** → no send scope on the token (server-enforced) + fail-closed `pre_tool_call` hook (client-enforced). Test: attempt send-shaped call from a Hermes session, assert blocked at both layers.
6. **Desktop off / missed ticks** → cursor feed is lossless; next manual tick drains everything since. No timer to miss during pilot. Test: inject 3 events, tick once, assert 3 drafts (post-collapse rules).
7. **Feed token leaks** → read-only feed scope exposes only transition metadata (no PII beyond an address already public on listing portals); build scope can only create drafts on the two pilot accounts; both tokens revocable independently. Rotation documented in the runbook section of the implementation plan.
8. **T11 phrasing trap** (forward-only sweep understates total cuts) → the skill's Telegram message and the seam's `built_from` label say "price cut observed MM/DD/YYYY", never "total reduction". The email itself already obeys pipe language rules.
9. **Free-tier 429 mid-run** (happened 08/09) → agent turn is one short tool-call chain, not a goal loop; script-only quiet ticks cost zero; if the turn dies, cursor doesn't advance (advance ONLY after seam 200), so next tick retries. Test: kill the turn before seam call, assert cursor unchanged.

## Explicitly out of scope (YAGNI)
- Any schedule/interval tuning; calendar-driven emails (market pulse etc.); the end-user server-side version; social posts per stage; auto-send anything; Hermes kanban/goal cards; new UI. The end-user version later lifts pieces 1-2-4 unchanged and replaces piece 3 with a server worker.

## Testing summary
Unit: feed cursor paging, test-inject scoping, seam schema rejection, idempotency. E2E rehearsal (the "fake test runs" the operator asked for): inject one fake transition per recipe on the demo account → manual tick → assert draft exists in project + Telegram message received + zero sends. Live verify: one REAL transition (next actual price cut in the watch window) produces a draft unprompted → close `hermes_email_driver_live_verify` on that evidence.
