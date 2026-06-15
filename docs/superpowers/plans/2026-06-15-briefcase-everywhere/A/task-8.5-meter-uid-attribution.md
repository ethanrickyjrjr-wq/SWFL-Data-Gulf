# A-8.5 — Meter uid-attribution — **OPUS**

## Goal
Attribute web build/deliver events to the **real `auth.uid`** so the 30-day trial window (watermark
toggle), the send paywall, MCP-connected detection, and the future memory layer all have a
substrate. This is the one prerequisite that unblocks the whole ladder. (OPUS: touches the metering
spine + a migration; getting the identity exactly right is load-bearing.)

## Change
- **Migration:** idempotent `ADD COLUMN IF NOT EXISTS user_id uuid` on `usage_events` (confirmed
  absent today — the table is `client_id text` only, write-only).
- On web **build / deliver_share / deliver_email**, write the real `auth.uid` to `user_id` when a
  session exists. The MCP path keeps writing `client_id = mcp:<uid>`. A logged-out action stays
  `sdg_cid`.
- **`is_example`/sentinel example rows write NO usage event** — else they poison uid-attribution the
  moment this lands.
- Closes the `meter_uid_attribution` check (`docs/paywall-moat-gates.md`).

## One identity
`auth.uid == mcp:<uid> == projects.user_id`. Do **not** invent a parallel scheme — every downstream
gate (trial, send cap, discount, memory) reads off this single identity.

## Prod-evidence gate (not dev attestation)
This is the 4th authored-but-unapplied migration in the recent pattern. **Verify the live row**, and
add a dedicated prod-migration-applied check (mirror the `email_schedule_scope` prod-verify pattern).

## Acceptance test
- A logged-in web **build/send** writes `usage_events.user_id = auth.uid` (query the **prod** row).
- An MCP build writes `client_id = mcp:<owner_uid>` with `MCP_BEARER_TOKEN` **OFF** (install-keyed,
  not bearer-keyed).
- A logged-out action stays `sdg_cid` (no `user_id`); an `is_example` build writes no event.
- `meter_uid_attribution` closes on live row evidence.
