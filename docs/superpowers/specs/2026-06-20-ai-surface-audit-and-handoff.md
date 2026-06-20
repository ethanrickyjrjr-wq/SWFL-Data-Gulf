# AI Surface Audit + Handoff — 2026-06-20

**What this is:** A full audit of every AI surface in brain-platform (9 surfaces), verified against code with the burden of proof flipped (every "missing" claim had to be *proven absent* in code + git, per the operator's "make sure these aren't built already"). Two safe fixes shipped this session; everything else is captured below as a prioritized punch list. The next session can act from this doc without re-auditing.

Method: multi-agent workflow (9 surface audits → adversarial gap-verification → 4 web-research angles), every load-bearing finding re-verified by hand.

---

## Build & code health — GREEN (verified 2026-06-20)

The earlier "RED build" was a **local `node_modules/prettier` extracted empty** — repaired by `bun install`. Not a code bug; Vercel/CI never at risk (`prettier@3.8.3` pinned in `bun.lock`, frozen-lockfile installs extract it fresh).

| Check | Result |
|---|---|
| `next build` | ✅ EXIT 0 (clean) |
| `bun test` | ✅ 3169 / 0 / 0 after `bun install` |
| `prettier/standalone` | ✅ resolves |
| `refinery:typecheck` | 🟡 baseline debt only (`bun:test`/`vitest` module errors accepted) — run alone, do not gate |
| eslint | ✅ clean |

If a fresh clone shows the prettier error locally: `bun install`. Done.

---

## Shipped this session

1. **Silenced noisy test** — `app/api/projects/[id]/route.test.ts`: added `insert: async () => ({ error: null })` to the fake Supabase so `logActivity`'s fire-and-forget insert stops logging a caught `TypeError`. (7 pass / 0 fail, no noise.)
2. **Killed the `report` 422 dead-end** — `app/api/projects/[id]/action/route.ts`: the ask-to-build classify enum (`:92`), prompt (`:104`), and `template_id` example (`:77`) listed `report`, which is **not** a valid `TemplateId` → non-deterministic 422 on "build me a report." Pointed the enum at the four scope-free templates `["market-overview","bov-lite","client-email","one-pager"]`. (`email` deliberately excluded — the action branch passes no scope, so `email` would render empty; see #B below.)

**Correction to the audit's suggestion:** the audit said "use all 5 ids incl. `email`." Verified against `assemble.ts` + `email-deliverable.ts:63` — the scope-less action branch + `buildEmailDeliverableModel` returning `null` without a ZIP means `email` there renders empty. Four templates is the correct fix.

---

## Per-surface verdict (does the AI work right there?)

| Surface | Works right? | Evidence |
|---|---|---|
| MCP tools (`swfl_fetch`, `swfl_reconcile`, `swfl_project_*`) | ✅ Yes | 6 tools, real distinct handlers, HOW-TO-ANSWER box in content (`app/api/mcp/*`) |
| Two-agent voice routing | ✅ Yes | Correct voice per `/welcome` vs `/r/*` vs `/project`; only open items are prod live-verify checks |
| Per-project deep context (spec 2026-06-18 Phases 0–5) | 🟡 Mostly | Engine built (activity log, valued items, freshness flag, significance registry + evaluator, lazy refresh, scored events, news pipeline); gaps are wiring/UI |
| AI builds templates | 🟡 Mostly (now better) | 4-of-5 templates end-to-end via 4 entry points sharing one gated `assembleDeliverable`; `report`-422 fixed this session |
| Schedule emails by asking | 🟡 Built, doesn't fire | Full ask→propose→confirm→write-row spine works; **cron paused** |
| Print/export incl. uploads | 🟡 Mostly | Upload→vision-extract→cited prose→frozen snapshot→print works; uploaded *file pages* not embedded in email PDF |
| Refinery synthesis AI | 🟡 Mostly | Deterministic master, structural cite-or-no-claim, validators gate writes; `_meta.rules` drop on claude.ai host |
| **Cross-project knowledge (AI knows ALL your projects)** | 🔴 **No** | In-project AI is hard-scoped to one project (`page-context.ts:198` "stale-leak defense") |

---

## Remaining work — prioritized punch list

### P1 — small, safe, high value
- **`B`. Expose `email` as a one-off buildable template (`#7`/`#8`).** Add `{ id: "email", label: "Email (send-ready)" }` to `app/project/[id]/workspace/BuildActions.tsx:5`, AND thread the project's scope into the build call so it doesn't render empty. The web build route + action branch must pass `scope_kind`/`scope_value` (the project has them) into `assembleDeliverable` (it already accepts them — `assemble.ts:59-60`). Add a guard: if `email` selected and no ZIP scope, return a clear "Email needs a ZIP/place scope" message instead of a null render.
- **`recentActivity` read-path is dead (`#4`, major).** `lib/project/activity.ts:75 readRecentActivity()` has **zero callers**; the AI never sees "email sent 2 days ago." Fix: call `readRecentActivity(supabase, id)` in `app/project/[id]/page.tsx` (alongside the existing `computeSignificantChanges`/`activeEvents` loads), thread it as a prop into `ProjectWorkspace` → the `buildProjectDigest({...})` call at `ProjectWorkspace.tsx:389-410` + its `useMemo` deps. Consumer already wired (`digest.ts:306`, `page-context.ts:116,209`) — pure threading, no type changes. Add a `digest.test.ts` assertion.
- **Surface RESTYLE in the in-workspace modal.** The pill strip is **already live on `/p/[id]`** (`app/p/[id]/TemplateSwitcher.tsx`, owner-gated, `page.tsx:526`) — DO NOT rebuild it. Only gap: it's not in the in-workspace `DeliverableModal`. Optional: mount `TemplateSwitcher` there too.
- **Schedule confirm card → echo concrete first send.** Return `computeNextRunAt()` on the *propose* branch of `app/api/email/schedule-command/route.ts` and render "First email: Mon Jun 23, 9:00am ET — then weekly" + live contact count in `ChatScheduleCard.tsx`. Disambiguate bare hours ("at 6" → "6am or 6pm?") via the existing `needsClarification` branch.

### P2 — features (brainstorm first)
- **Cross-project AI knowledge (`#1`, the operator's #1 ask).** See the spec below — Approach A.
- **Email blast stale-data verification (`#5`, major).** `app/api/deliverables/[id]/blast/route.ts` never runs the readiness ladder → can email 7-day-stale figures. Libs exist (`lib/email/data-readiness.ts`, `verification-sources.ts`, cron `app/api/cron/data-readiness/route.ts`) but nothing calls them at send. Wire a send-time check: for each metric item, consult `data_readiness_alerts` (or run `verifyMetricItem` inline for ad-hoc blasts which have no pre-computed row), substitute/omit stale values with an honest note. Mirror in the scheduled path (`lib/email/scheduler.ts` / `scripts/email/run-schedules.mts`).
- **NewsBar + clip-news UI (`#6`, major).** Backend scores news into `project_events` (AI sees them), but no user-facing strip or "highlight → add to project" flow. Build per `docs/superpowers/plans/2026-06-19-phase5-news-crawl-newsbar.md` Tasks 8–11. FIRST verify (a) `ProjectWorkspace`/`ItemsBoard` live in prod, (b) `data_lake.news_articles_swfl` + `project_events` have real rows. Components live at `app/project/[id]/workspace/NewsBar.tsx` (per the plan's Global Constraint, NOT `components/workspace/`). Task 1 (`ScoredEventSummary` fields) already shipped.
- **Uploaded file pages in email PDF (`#8`/print).** `pdf-lib` server merge (report bytes + uploaded artifact) → new `app/p/[id]/pdf/route.ts`. **Avoid** self-hosting Chromium/Puppeteer on Vercel (15s cold starts, 50MB limit). Cheap interim: fix the print skin CSS (`@page{margin:1in;size:letter}`, `break-inside:avoid` on tables/metric rows, `thead{display:table-header-group}`, `print-color-adjust:exact`).

### P3 — operator-gated / edge
- **Email scheduler go-live** (in order): (1) apply `docs/sql/20260612_email_schedule_claim_fn.sql` (`claim_due_email_schedules` RPC) to prod — idempotent, service-role-only, inert while cron paused, safe to apply now; (2) `gh secret set DIGEST_BROADCAST_SECRET` + wire into `email-scheduler.yml` env; (3) uncomment the `*/15` cron at `email-scheduler.yml:12-13` (diff-review before push, RULE 1); (4) close `email_scheduler_f_live_verify` only on an observed real fire→send→re-arm. Tracked in `GO-LIVE/email-scheduler-unit-f.md`.
- **Unwired activity types** (`scope_changed`, `mcp_connected`; minor). Add after the `recentActivity` read-path lands: `scope_changed` in `app/api/projects/[id]/route.ts` PATCH (ZIP change), `mcp_connected` in `app/api/projects/[id]/mcp-key/route.ts` POST. Keep the type-union forward-declarations.
- **Refinery `_meta.rules` drop on claude.ai (`#9`, minor).** The lean rules block (`[INFERENCE]` tag + below-ZIP guard) rides in `_meta.rules`, which the claude.ai connector strips. Move it into response *content* (the proven channel — see `project_mcp-response-contract-in-content`).
- **Gemini leg** (`live_search/engine.py`, `gemini-3.5-flash`) — the only non-Anthropic LLM call; its own `GEMINI_API_KEY` gate. Flag for whoever owns ingest.

---

## Cross-project AI knowledge — spec (Approach A)

> **EXPANDED + BUILT (2026-06-20):** see `docs/superpowers/specs/2026-06-20-cross-project-enrichment-design.md` — the brainstormed, operator-approved design supersedes this section on any conflict. Two refinements landed there: (a) the leak-boundary guardrail below is relaxed for **confirmed scope+identity overlaps** (those carry the matched item's value, per the "client data can be used by a client" decree — own-files-only); (b) "success on email clicks" is **deferred** (no per-project engagement data exists today).

**Problem:** The in-project AI sees only the current project. Confirmed: `lib/chat/page-context.ts:198` hard-scopes context (`digest.projectId !== pid → undefined`, commented "stale-leak defense"); the cross-project layer (`lib/project/cross-project-index.ts` `findOverlap`/`buildCrossProjectIndex`) is **dead-wired** (`BriefcasePanel.tsx:67` calls `projectPrompts({digest, visits})` with no `overlap`; zero non-test callers); `app/api/welcome/chat/route.ts` has no `projects`-table query.

**Design (read-only "your projects" digest):**
1. In `app/api/welcome/chat/route.ts` analyst path, load the authed user's projects (RLS-scoped `select id, title, scope, item_count` — same shape `app/api/projects/assemble/route.ts:35` already uses), excluding the current one. Cap ~8, newest first.
2. Emit a **clearly-separate** system-prompt block, distinct from the deep single-project context:
   ```
   OTHER PROJECTS (read-only — titles/scope only, not their filed data):
   • Cape Coral 33904 — 6 items
   • Naples retail corridor — 3 items
   ```
3. Pass it through `lib/chat/page-context.ts` (new field on `ProjectPageContext`, e.g. `otherProjects: string[]`) and `BriefcaseChat` `getExtraBody`.

**Why A:** Directly answers "did I already pull flood AAL for 33931 anywhere?" with the least risk. **Preserves the stale-leak guard** — the current project stays the *deep* context; other projects are a shallow read-only index. No new tables. Low effort.

**Explicitly rejected:** B (wire `cross-project-index` into chips only) — doesn't give the AI conversational knowledge. C (`swfl_project_list_all` MCP tool) — more auth surface; good as a follow-on to A, not instead of it.

**Guardrails:** Do NOT remove the `projectId===path` guard. Do NOT expose other projects' *filed item values* (only title/scope/count) — that's the leak boundary. Respects RLS (user's own projects only).

---

## Already built — DO NOT rebuild
- Phase 0 project-activity root (`lib/project/activity.ts` + writers wired into create/rename/branding/file/refresh/send) — only the *read-path* is unwired (P1 above).
- Phases 1–4: valued briefcase digest, `freshnessIsNew`, `significance-registry.yaml` + change evaluator, lazy refresh-on-access, scored nearby-events injection.
- News pipeline backend (`ingest/pipelines/news_swfl/*` + scoring cron) — only the UI is missing.
- Schedule-by-asking create path (NL parse → propose/confirm → real `email_schedules` row) — only the *firing* is blocked.
- Zero-LLM RESTYLE strip (`app/p/[id]/TemplateSwitcher.tsx`) — live on `/p/[id]`.
- `cross-project-index` — exists; needs wiring, not rebuilding.
- MCP surface + two-agent routing — complete.
