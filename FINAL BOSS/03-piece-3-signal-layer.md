# 03 — PIECE 3: Signal Layer (the invisible reporter)  🟡 DRAFT (needs brainstorm)

> ⚠️ SCOPED DRAFT — not an approved design. Run `superpowers:brainstorming` first; write
> `docs/superpowers/specs/<date>-piece3-signal-layer-design.md`. Also re-read **THE BIBLE**
> (`docs/standards/data-and-build-bible.md`) + **PROBE FIRST** before any ingest/cron work.

## Intent

An **agent no one sees** that reports daily happenings to the Project AIs: new data, new features, and engagement on
the user's own work — so Piece 2 can say **"your property got 7 clicks from your emails"**, **"Walmart is building
near your commercial property"**, and **"the new data shows X"**. This is the *fuel*; it has no UI of its own. Page
agents / the build report into one feed the AIs read.

## Contract

**Depends on (from P1/P2):** nothing structural — it's mostly backend + cron. It writes a feed; **P2 reads it.**
**Provides (consumed by P2):** `project_feed`/notifications rows · email click/open events · change-detection deltas
scoped to each project's ZIP/topic.

## Scope (proposed)

1. **Per-project feed table** — `project_feed` (or `notifications`): `{id,user_id,project_id,kind,title,detail,
   ref_url,created_at,read_at}`, RLS owner-all. The **durable half of the context bus** (`00-MASTER-PLAN.md`) — the one
   place situational signals land. `kind ∈ {data-change, engagement, external-event, platform-feature}`, where
   **platform-feature** is the site agent announcing new charts/features ("we just got new charts that fit this").
2. **Email click/open tracking** — wire a **Resend webhook** → write `usage_events.action='click'/'open'` (the
   `action` column already exists) **or** a dedicated `email_events` table; attribute to the user's send via
   `email_sends.reply_token`/`broadcast_id`. This is what makes "7 clicks" real.
3. **Change-detection cron** — daily job comparing each project's scope (ZIP/topic) against the latest lake read
   (freshness-token diff + new permits/listings/news from `city-pulse`-style signals); writes deltas to `project_feed`.
4. **"Near your property" / external-event matcher** — optional, harder: match new permits/large-project news to a
   project's geo. Likely a later sub-phase; the feed + click tracking + freshness deltas are the MVP.

## Reuse / what exists

`usage_events.action` column (ready, unused for clicks) · `email_sends` (reply_token/broadcast_id for attribution) ·
`buyer_intent_events` (reply sensor — the existing "someone warmed up" pattern to mirror) · freshness tokens on every
brain · `city-pulse-swfl` brain (live news facts) · `swfl_reconcile` (stale-metric verdicts) · the cron infra
(`docs/cron-rebuild-failures.md`, `ingest/cadence_registry.yaml`).

## Standards that bind this piece (non-negotiable)

PROBE FIRST before any multi-minute job · destructive writes need a non-null guard (prepush Gate 4) · cron wrapper +
`--dry-run` ship in the same PR · vendor cadence verified live · brain-first ingest gate for any Tier-2 write.
(All in CLAUDE.md + THE BIBLE.)

## Open decisions for brainstorm
- `usage_events.action` vs. a dedicated `email_events` table for clicks (telemetry depth vs. simplicity).
- Resend webhook surface (which events; signature verification; idempotency via the existing send ledger pattern).
- Change-detection grain + cadence (per-ZIP daily? only on master rebuild?) and how to avoid noisy feeds.
- Feed retention + read/unread semantics; how P2 ranks feed items into the 3 situational prompts.

## Likely key files
new `docs/sql/<date>_project_feed.sql` (+ maybe `_email_events.sql`) · new `app/api/webhooks/resend/route.ts` ·
new ingest/cron under `ingest/` + `ingest/cadence_registry.yaml` · `app/api/.../meter` & `usage_events` writers ·
`lib/email/agent-alert.ts` (mirror the reply-sensor pattern). P2 reads `project_feed` via its digest/prompt engine.
