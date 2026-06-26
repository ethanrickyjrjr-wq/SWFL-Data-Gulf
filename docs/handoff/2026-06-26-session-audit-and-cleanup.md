# Session Handoff — 2026-06-26 Audit + Cleanup

## What I actually wanted to do

Started the session asking "find all tasks I was told we need to complete in the past 2 days, confirm by code what is done, look at what's currently in commits and being worked on, then tell me what needs done."

The first answer was bullshit — a SESSION_LOG/build-queue summary dressed up as a code audit. Pushed back, got a real one.

## What the code audit actually found

**One Assistant Phase 3 — mostly already done, build queue was stale**

The build queue said Phase 3 was `⬜` (client flip, charts-in-panel, highlighter-to-root, web-fallback #12). Code said it was mostly shipped:
- Dock calls `/api/assistant` via `lib/highlighter/converse.ts:127` — already done
- `AskAiDock` imports and renders `DockChart` — already done
- `HighlighterProvider` in `app/layout.tsx:72` at root — already done
- `webFallback` wired in `lib/assistant/conversation-path.ts:620,702` — already done
- `/api/converse` and `/api/welcome/chat` both fully deleted (not forwarded)

The one real gap: `use-assistant` hook doesn't exist. Build queue wanted `useConverse` + `useChatStream` merged into one hook. Functionally the routes work without it — it's a cleanup. **Not blocking anything.**

**N6 send-status gap — real, fixed this session**

`app/api/email/send-status/route.ts:64` hardcoded `.eq("template_id", "report")`. Block-canvas EmailDoc schedules (template_id="block-canvas") were invisible to the UI — the "you have a schedule" banner never showed after scheduling from the Email Lab. Fixed: added Lane 1 block-canvas query when `deliverableId` is provided. `SendWeeklyHandle` was also not forwarding `deliverableId` to the fetch despite having it as a prop.

**Uncommitted working tree — two parallel sessions' worth of work, now committed**

Seven modified files from two separate sessions were sitting uncommitted. Not related to each other, staged and committed separately.

## What shipped this session

| commit | what |
|---|---|
| `d00e78b5` | report-shell.tsx freshnessToken removed from footer render (kept prop for callers); typed Supabase plan doc added |
| `efed09e1` | "Worth knowing" caveats section removed from /r/[slug] and /r/housing-swfl; ISO date → MM/DD/YYYY in sanitizeProse + test; BHHS brand entry |
| `02c9144c` / `302d2b5a` | daily-rebuild REBUILD_PAT fix — bot was structurally locked out of main (GH013 ruleset; GitHub Actions integration 422s on user-owned repos) |
| `fba0acf9` | Email Lab add-blocks panel in sidebar; chart-miss actionable message; debug logging in buildPromptChart |
| `eef9f13f` | send-status block-canvas lane + SendWeeklyHandle deliverableId forwarded |
| `e0b629f7` | chart fallback to housing-swfl/active-listings-swfl/market-heat-swfl when no topic keyword matched |

## What's still genuinely open (code-confirmed)

**Typed Supabase client migration** — plan at `docs/superpowers/plans/2026-06-26-typed-supabase-client-migration.md`. Five tasks. Nothing started. Opus recommended. Goal: generate `database.types.ts` from the live prod DB, thread `<Database>` generic through the four client factories in `utils/supabase/`. Catches "real column, wrong table" at compile time (the exact bug that caused the ai-material 404 this session — `projects` table has no `scope_kind/scope_value` columns).

**`use-assistant` hook consolidation** — merge `useConverse` (lib/highlighter/) and `useChatStream` (lib/chat/) into one hook at `lib/assistant/use-assistant.ts`. Not blocking. Do it when cleaning up the One Assistant track.

**`one_assistant_unify_live_verify` check** — still open (due Jun 23, overdue). This is a prod deploy smoke, not a code gap. After next Vercel deploy: verify /r/* dock question on a missing surface degrades gracefully, off-/r/* pill answers, /welcome still funnel-voiced.

**Overdue prod-verify checks** — all code is shipped, just need a Vercel deploy + smoke:
- `root1_unify_live_verify` (Jun 17)
- `piece2_live_verify` (Jun 23)
- `briefcase_email_pdf_deliverable` (Jun 17)
- `welcome_live_cards_verify` (Jun 15)
- `global_nav_signed_in_live_verify` (Jun 16)
- `zip_quick_summary_live_verify` (Jun 26 — today, ACS demographic cards on /r/zip-report/33908)

**`reenable_daily_rebuild_after_tonight`** — the daily-rebuild was disabled to skip a run. The REBUILD_PAT fix is now pushed. Dispatch a `workflow_dispatch` on daily-rebuild to prove brains land on main with the PAT, then close the check and re-enable the schedule if it was left disabled.

## Next session priorities

1. Verify daily-rebuild fires correctly with REBUILD_PAT (dispatch → confirm brains commit lands)
2. Typed Supabase migration (5 tasks, Opus, run from the plan doc)
3. Vercel deploy → close the overdue verify checks
