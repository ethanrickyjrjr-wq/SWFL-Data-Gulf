# Pulse Intelligence Engine — build folder

Everything for this multi-phase build lives here. Design session: 2026-07-07.

## Files
- `00-design.md` — the design spec (full target architecture + Phase 1 scope). **Read first.**
- `01-phase1-plan.md` — Phase 1 implementation plan (capture retrofit + matcher + dedup + eviction + re-enable crons). *(next)*
- Phase 2 / Phase 3 plans land here when their turn comes (each gets its own brainstorm first).

## Phases & checks
- **Phase 1** — crawl4ai capture + Python matcher + 3-layer dedup + 45-day pool eviction + re-enable crons. Check `pulse_crawl4ai_retrofit_live_verify`.
- **Phase 2** — durable event-thread lifecycle ledger (extend `project_events`): promotion, states, open/terminal, rolling summary, active checks, tiered retention. Check `pulse_event_thread_ledger`.
- **Phase 3** — per-user delivery memory + backward-reference composer (`pulse_per_user_delivery_memory`); aggressive all-day crawl + rung-3 targeted paid gap-fill (`pulse_aggressive_gather_gapfill`).

## The three reusable primitives this build creates

This isn't just a pulse fix — it produces three primitives the rest of the platform can reuse:

1. **Free-crawl gather → compact pool → TTL eviction.** A $0 ingest substrate for any web source, self-cleaning so the lake never bloats.
2. **Event-thread lifecycle ledger** (`project_events` extended). One durable thread per story with a state machine (announced → … → terminal), a maintained rolling summary, and an open/terminal watch flag — append O(1) per new article, never re-read history.
3. **Per-user delivery memory + backward-reference composer.** A record of what each user was actually told, so any outbound channel can say "following up on the X I sent you" — and *only* to the people we actually told.

## Where else this pays off (follow-on applications)

Same three primitives, pointed at other sources — each is a later build, not scope here:

- **Listing lifecycle narration.** The platform already tracks `listing_transitions` (active → pending → sold → withdrawn). Wire it through the per-user memory and a drip can say "the 123 Main St listing I flagged when it hit the market just went pending." Ties directly into Property Watch and the New-Listing-lifecycle project.
- **Permit / development pipeline.** Accela permits (crawl4ai already proven there). One thread per project: filed → approved → construction → CO. Exactly the "bought land → follow-up" shape. Feeds `cre-swfl` / permits brains.
- **Business openings & closings.** DBPR public notices (already distilled). Thread a license: filed → open → closed. "The restaurant I mentioned opening on 5th Ave is now open."
- **CRE deal tracking.** Commercial sales / big leases threaded: land buy → entitlement → groundbreaking → opening — the corridor pulse gains narration, not just a fact dump.
- **Property Watch nudges.** `project_events` is already the substrate; the per-user memory stops re-nagging and lets "a comp near your saved listing just sold" fire once, cleanly.
- **Cold-outreach drip intelligence.** The outreach engine gains memory: never re-send the same story, and legitimately "circle back on what I sent you."
- **Distressed / foreclosure / code-enforcement watch.** Public records threaded (filing → auction → sale) — pure lifecycle events with follow-ups.
- **Flywheel backtest (Goals 7–8).** Graded falsifiable direction calls need to know whether a predicted event actually happened. Event threads with an open/terminal watch flag are the exact substrate for scoring a call against reality — the "active check on an open thread" is the same shape as a falsifiable call awaiting its outcome.

The platform-wide unlock is primitive #3: **every user-facing channel gains continuity** — the product stops repeating itself and can always pick up the thread with each specific person. That's a memory moat, not just a cost fix.
