# Task 05 — Inbound reply-to-send ("just reply to the email")

**Check key:** `email_inbound_reply` · **Order:** last · **Risk:** low-medium (new webhook; reuses the
existing parser).

## Goal

Let a tenant set up / change a schedule by **replying to the branded email in plain English** — the
magic-feeling version of `WELCOME_SYSTEM`'s "set up by nothing more than them telling you." The
schedule-command **UI** already satisfies the literal promise, so this is the upgrade, not the unblock —
hence last.

## Grounded refs

- No `app/api/email/inbound` route exists (confirmed by glob) — net-new.
- `lib/email/schedule-command.ts` — the existing two-step propose→confirm parser to **reuse** (do not
  re-implement): `SCHEDULE_COMMAND_TOOL`, `validateToolInput`, `summarizeCommand`.
- `app/api/email/schedule-command/route.ts` — the existing route to model the inbound handler on.
- `lib/email/sender-config.ts` / `email_sender_config` — to match an inbound sender → `user_id`.

## Steps

1. **Vendor-First (RULE 1):** WebFetch the live Resend inbound-email + webhook-signature docs
   in-session; confirm the payload shape (from / to / subject / text body) and signature scheme.
2. `app/api/email/inbound/route.ts`: verify the webhook signature; resolve the sender email → `user_id`
   (via `email_sender_config` / contacts); ignore unknown senders.
3. Feed the reply body into the **existing** `schedule-command` parser → `validateToolInput` →
   `summarizeCommand`.
4. Two-step contract preserved: reply to the tenant with the plain-English confirm line; only write the
   row on an affirmative follow-up reply (or a one-tap confirm link). **No silent mutation.**

## Done when

- A reply like "make it twice a week and add Bonita flood" parses into the right action + scope, the
  tenant gets a confirm line, and the row is written only after confirmation.
- Unknown / unverified senders are ignored; signature verified.
- Reuses the parser — no second copy of the intent logic.

## Correctness flags

- **RULE 3 C2:** extends the existing schedule-command seam; no new gate.
- **Vendor-First:** WebFetch Resend inbound in-session; don't trust remembered payload shape.
- **Safety:** signature-verify + sender-match before any parse; two-step confirm before any write.
- **Scope reuse:** the "Bonita flood" capture rides on Task 01's scope param + `lib/place-context.ts`.

> Status lives in the `checks` ledger (`email_inbound_reply`), not in this file.
