# Task 5 — In-chat flow: build → approve → send → "go weekly?"

**Builder:** Opus · **Wave:** D (parallel with Task 6) · **Depends on:** Task 7 (bridge), Task 4 (email deliverable)

> 🔒 **STATUS / SCOPE LOCK (2026-06-17 — do not revert on checkout/push).** Slice 1 shipped: the in-chat "Send weekly"
> card (`962ad12`, reusing Task 7's recipe lane). **Remaining work here = live-verify the flow end-to-end + close
> `inchat_build_send_schedule_flow` on the runtime signal — nothing more in this folder.** The "build an email *outside*
> → into a project → see it → send from the project page" experience is **no longer Task 5** — it moved to **`FINAL BOSS/`**
> (flagship "email through Projects": `00-MASTER-PLAN.md` → Flagship flow; seed/scope gaps in `01-…` §I; Emailing-lane
> live preview in Piece 4). That is a **rewire onto new project-workspace seams that don't exist yet** — do **not** build
> it on the current `app/project/[id]/ProjectDetail.tsx` (Piece 1 decomposes it). If this banner is wrong, add a
> correcting note; don't delete it.

## Goal

The whole flow lives in the briefcase chat with inline buttons: build → "Looks good?" → pick audience → send → **"Send this every week?"** → confirm. No leaving the chat.

## Why this is Opus

UX orchestration across the chat stream + the send/paywall gate + the propose/confirm hand-off; touches the auth-gated send path. Correctness of the gate (build free, send gated) is load-bearing for monetization.

## Build

1. **Action cards in the chat** (`components/briefcase/BriefcaseChat.tsx` + `/api/welcome/chat`): reuse the existing typed-card channel to emit action frames — `build-result` (preview + `/p/[id]` link + [Looks good]/[Change]), `audience-pick` (chips from the user's `email_audiences` + [Upload contacts]), `send` ([Send] / [Send me a test first]), `go-weekly` ([Yes, weekly]/[Just once]), `confirm-schedule` (the propose card + [Confirm]/[Cancel]).
2. **Wire confirm to the existing two-step contract** — the "weekly?" confirm calls `schedule-command.ts` propose → user confirm → write (Task 7 supplies the recipe→`email_schedules` insert). Nothing writes before confirm.
3. **Gate the send step on auth/paywall** — building + preview is free; tapping Send (one-off or weekly) is the login-capture + send paywall moment (locked monetization model). Build path stays ungated.
4. **First-send default:** offer both [Send a test to me first] and [Send to <audience>] (recommended safe default).

## Tests / acceptance

- E2E (manual + component test): build→approve→audience→send→"weekly?"→confirm runs with inline buttons; no free-text required for finite choices.
- Send step gates on auth/paywall; build does not (assert an anonymous user can build+preview but is gated at Send).
- Confirm inserts exactly one schedule via Task 7; cancel writes nothing.

## Guardrails

Reuses the propose/confirm (no silent mutation). Per RULE 1.5, if built concurrently with Task 6, isolate in a worktree (shared client schedule-action util). Open check `inchat_build_send_schedule_flow`.
