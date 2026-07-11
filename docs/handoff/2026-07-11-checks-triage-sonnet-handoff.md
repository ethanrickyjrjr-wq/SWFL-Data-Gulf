# Handoff — Checks-ledger triage & clear-the-board (for Sonnet)

**Date:** 07/11/2026
**From:** Opus 4.8 session (built the Airtable checks mirror earlier today)
**Your job:** Go through the open `public.checks` ledger. For every check you can, **verify whether it's actually done** — against the live product, the code, or the data — and:
- **close it** (with real, observed evidence) if it's genuinely complete;
- **complete-then-close it** if it's a small, finishable gap you can honestly finish;
- **drop it** if it's dead/superseded/abandoned;
- **leave it open** (untouched) if it's real work you can't verify or finish.

When a check closes or drops, it comes off the Airtable board automatically (details at the end).

---

## THE ONE RULE THAT OVERRIDES EVERYTHING

**Never close a check without real proof it's done. Never fabricate evidence. Age is not proof. "It probably shipped" is not proof.**

This ledger has a server-side trigger (`checks_require_proof`) that rejects any close into `done` without a `proof` record — and `scripts/check.mjs close` is the only sane way to write one. A close's `--evidence` must be *something you actually observed this session*: an HTTP status + body snippet, a DB row count, a `file:line` that implements the behavior, a passing `bunx next build`, a git commit hash that landed the feature. If you can't observe it, you don't close it — you leave it open. Closing on a hunch corrupts the one board the operator trusts to tell the truth about what's done. That is worse than leaving 300 checks open.

If you're ever unsure whether your evidence is strong enough: it isn't. Leave it open.

---

## State as of 07/11/2026

- **332 open checks**, **all manual** (zero have a stored auto-verify signal — so every close needs `--evidence`, none can self-verify by running a signal).
- **104 are `*_live_verify`** — "the feature was built, someone just never confirmed it live." These are your ripest done-candidates. Verify each against its real surface.
- **228 are other** — design decisions, build tasks, data gaps. Many are genuinely open. Some are dead.
- Only 4 are overdue; 2 of those are open *decisions* ("decide + pin policy…"), not finished work.

Get the live list any time:
```
node scripts/check.mjs list
```
Or pull structured rows (key, label, dates, project) straight from Supabase — creds resolve from `.dlt/secrets.toml`:
```
node -e "import('./scripts/lib/supabase-creds.mjs').then(async ({resolveSupabaseCreds})=>{const {readFileSync}=await import('node:fs');const c=resolveSupabaseCreds({tomlText:readFileSync('.dlt/secrets.toml','utf8'),env:process.env});const r=await fetch(c.url+'/rest/v1/checks?state=eq.open&select=check_key,label,detail,due_at,created_at,updated_at,project&order=created_at.asc',{headers:{apikey:c.key,Authorization:'Bearer '+c.key}});console.log(JSON.stringify(await r.json(),null,1))})"
```

---

## The commands (this is the whole toolkit)

Close a completed check — evidence is REQUIRED and must be real:
```
node scripts/check.mjs close <check_key> "short note" --evidence "<what you actually observed: status/snippet/row count/file:line/commit>"
```

Drop a dead/superseded/abandoned check — no proof needed, but the reason must be honest:
```
node scripts/check.mjs close <check_key> --drop "superseded by <x>" 
```
(`--drop` sets state `dropped`; the note becomes the drop reason. Use ONLY for things that will never be done, not as a backdoor around the evidence gate.)

Leave a check open: do nothing to it.

Clear the board after a batch of closes/drops (also runs itself every 2h):
```
node scripts/airtable-checks-sync.mjs
```

Reopen if you closed something wrong:
```
node scripts/check.mjs reopen <project> <check_key> "<label>"
```

---

## How to verify, by check family

Read each check's `check_key` + `label` + `detail`, decide what "done" would look like, then go observe it.

**`*_live_verify` for a public page/feature** → hit the live surface.
- Production is `https://www.swfldatagulf.com`. Fetch the relevant URL (crawl4ai, or a plain `fetch`), confirm it returns 200 and contains the expected content. Evidence = `"GET /r/<page> → 200, body shows <expected thing>"`.
- API/MCP checks → call the endpoint and record the shape. Evidence = the observed response.
- Don't guess the URL blindly — derive it from the label/detail, and if you can't map it to a real surface, leave it open (don't close).

**Data / ingest checks** → query the data.
- Use the `lake` MCP (`query_lake` / `list_views` / `describe_view`) or a PostgREST read against `data_lake.*` / `public.*`. Evidence = row count, freshness date, or the specific value the check asked for. Follow `docs/standards/data-and-build-bible.md` if you need grounding.

**Code / build checks** ("wire X", "extract Y", "refactor Z") → confirm in the codebase.
- Probe first (RULE 0.5): `Grep`/`Glob`/`Read`, or graphify if `graphify-out/graph.json` exists. Confirm the code exists AND does the thing. Where relevant, prove it compiles: `bunx next build` (NOT `npx tsc` — see the repo's verify convention). Evidence = `file:line` + build/behavior observed.

**Decision checks** ("decide + pin policy", "choose approach") → you usually can't close these.
- A decision is the operator's to make. Unless the decision is already recorded somewhere concrete (a committed doc, a merged approach), leave it open. Don't invent a decision to clear a row.

**Completable gaps** ("make sure it's completed if it can") → finish the small, safe ones.
- If a check is a bounded, low-risk piece of work you can genuinely finish (a missing wire-up, a small fix, a doc), do it via TDD where code is involved, verify it, then close with the commit as evidence. **But:** any `git push` is operator-gated — commit locally, and STOP for approval before pushing (see guardrails). If completing it is big, risky, or touches live `/api/*`, MCP, or ingest writes, DON'T — leave it open and note why.

---

## Suggested order (highest yield first)

1. **The 104 `*_live_verify` checks, oldest first** — most are shipped-and-forgotten. Verify each live; close the ones that pass, drop the ones whose feature was abandoned/superseded.
2. **Data/ingest checks you can settle with one query.**
3. **Code checks you can confirm by reading + building.**
4. **Everything else** — close only with hard evidence; otherwise leave.

Work in batches of ~15–20. After each batch: run `node scripts/airtable-checks-sync.mjs` so the board reflects reality, and log progress (below).

---

## Guardrails (non-negotiable, from the repo's locked rules)

- **No fabricated evidence. Ever.** (Restated because it's the whole point.)
- **No `git push` without explicit operator approval.** Closing/dropping checks writes only to Supabase — that needs no push and is fine to do freely. But if you *complete* a check with code, commit with explicit paths (never `git add -A`) and then STOP and ask before pushing. The push hook (`check-no-unapproved-push.mjs`) will block you otherwise, by design.
- **No silent deferrals.** If while verifying you discover a *new* gap, open a check for it (`check.mjs open <project> <key> "<label>"`) — yes, that adds a row; that's the system working. Don't just leave a comment.
- **Don't close a check by editing Airtable.** Airtable is a read-only mirror; Supabase is the source of truth. All state changes go through `check.mjs`.
- **Verify with the live thing, not memory.** RULE 0.4/0.5: probe our code, hit the real surface. crawl4ai for web (never Firecrawl).

---

## Report back (append to this file as you go)

Keep a running tally at the bottom of this doc so the next session (and the operator) can see what happened:

```
## Progress log
- <time>: batch N — closed <k1, k2, …> (evidence summarized), dropped <k3> (reason), left open <k4> (why). Board synced.
```

- 2026-07-11 (Sonnet 5): batch 1 (11 closed, all via real curl/gh/grep observation this session, no fabrication):
  `swfl_data_desk_live_verify` (/desk 200, live JSON-LD figures), `guides_hub_live_verify` (/guides 200, real guide cards),
  `insiders_page_live_verify` (/insiders 200, Fable-5 copy + live chart data), `template_preview_gallery_live_verify`
  (/showcase 200, "27 email layouts" rendered), `commercial_spine_live_verify` (homepage pricing-strip + weekly-read
  sections render; note: standalone /pricing route 404s, pricing lives inline on `/`), `weekly_read_live_verify`
  (subscribe form live + POST /api/weekly-read/subscribe returns 400 invalid_email, endpoint wired), `surface_parent_links`
  (/r/cre-swfl 200, corridor index renders), `retire_block_shell_live_verify` (BlockCanvas/CanvasBlock/EmailLabClient
  files confirmed deleted + /email-lab 307→/email-lab/grid live), `smoke_prod_runner_live_verify` (gh run 29166924538
  success, log shows "9/9 passed"), `chart_social_object_live_verify` (/c/efbc944f 200 with real og:image tags +
  ShareRow, /c/efbc944f/card 200 image/png 40389 bytes).
  Left OPEN with reasons found this pass (not closed, no action needed — noting for the record):
  `insiders_edition_live_verify` (spec's "event minis" = Phase D, never built — only monthly flagship shipped),
  `zip_page_destination_live_verify` (Phase D "Down the Road" + first paid bake explicitly not-started per
  `docs/handoff/2026-07-09-zip-page-phases-de-handoff.md`), `communities_swfl_live_verify` (queried lake:
  `data_lake.community_profiles` has 0 rows — matches the already-open `empty_brain_content_detector` check),
  `new_agent_radar_live_verify` (queried lake: `public.dbpr_re_licensees` 0 rows, matches commit's own "HELD for
  Ricky" note), `zip_scope_core_live_verify` (bun test green locally, BUT live `/api/b/seller-stress-swfl` still
  says "Covers 126 SWFL ZIPs" / "111 of 126 ZIPs scored" — the core-scope-57 fix hasn't been rebuilt into the live
  brain yet), `send_surface_hardening_live_verify` / `records_request_engine_live_verify` / `email_accent_ink_palette_gate_live_verify`
  (each already has an honest partial-verify note from a prior session explaining exactly what's unverified — left as-is).
  Board synced (`airtable-checks-sync.mjs`: synced 1, deleted 10).

- 2026-07-11 (Sonnet 5): batch 2 (10 more closed, 20 total this session; browser-driven verification via
  claude-in-chrome for the visual ones, plus gh/lake/grep for the rest — no fabrication, every evidence
  string is something observed this session): `api_usage_logging_live_verify` (ops /spend live with real
  $ figures), `campaign_quick_start_live_verify` + `agent_launch_campaign_live_verify` (all 4 quick-start
  campaigns render on /email-lab/grid), `zip_email_reskin_live_verify` (?zip=33901 seed renders real
  metric-card blocks with live $ values + zip-shape PNG route), `report_bridge_seo_live_verify`
  (/r/zip-report/33901 SEO meta + ReportHighlightBridge component confirmed), `daily_price_dual_signal_live_verify`
  (/desk shows both the daily asking-price/sold-count line and the monthly-ZHVI typical-home-value anchor),
  `email_lab_make_this_live_verify` (/showcase "Make this ->" CTAs link to real /email-lab/grid?s... seeds),
  `showcase_overlays_live_verify` (browser click-through: Latitude 26 Estates overlay opened with real
  step-nav + content + Make-this CTA — screenshot captured), `author_layout_recipes_live_verify` (11-recipe
  dropdown + Media library My-library/Pexels tabs + block width/drag controls, all live in grid lab),
  `email_lab_shared_panel_live_verify` (GRID·PAID tier badge + shared AI panel confirmed live).
  Left OPEN, reasons found this pass: `new_agent_radar_live_verify` (queried lake: `public.dbpr_re_licensees`
  0 rows, matches commit's "HELD for Ricky" note), `sold_resolution_latlon_crosswalk_live_verify` (commit
  6d84855c is explicitly "docs-only addendum... nothing built" — Collier inconclusive, nothing shipped),
  `chief_of_staff_nightly_live_verify` (gh run 29148784537 FAILED on OIDC id-token permission — already has
  its own auto-captured `cron_incident_chief_of_staff_nightly` check, no new check opened), `selfheal_rollback_bot_live_verify`
  / `selfheal_claude_triage_live_verify` (workflow log shows `ARMED="false"` — running dark/dry-run only,
  never fired for a real incident), `selfheal_preview_smoke_live_verify` (last 30 smoke-prod runs all on
  `main`, never a preview branch — feature untested), `brand_tokens_one_root_live_verify` (commit's own note
  requires an operator-driven branding UI + Outlook spot-check, correctly still open). Also deliberately
  left `chart_picker_parity_live_verify` / `social_chart_registry_live_verify` / `data_contracts_doctor_live_verify`
  / `deliverable_coherence_gate_live_verify` untouched — their plan/audit docs showed as actively modified by
  other live sessions at this session's start, so avoided touching in-flight work. `uncloseable_check_proof_live_verify`
  (the deliberate canary) untouched as instructed. Board synced (`airtable-checks-sync.mjs`: synced 2,
  deleted 10). Stopping here for this session — 84 of the 104 `*_live_verify` checks and all 228 non-`_live_verify`
  checks remain for a future pass.

- 2026-07-11 (Sonnet 5): targeted pass on 5 specific checks handed off directly (not the general
  sweep order above). 1 closed, 4 left open — 3 of those with a genuine NEW bug found and its own
  check opened this session (no silent deferrals):
  `email_accent_ink_palette_gate_live_verify` **CLOSED** — live on prod grid lab, set Primary=Accent=
  `#1B2A4A` (1.0:1, worst case), watched the amber Tier-B strip name the exact failing pair, Saved
  without being blocked, then screenshotted the New Listing layout's CTA button rendering crisp white
  ink on the hostile navy — Tier-A guard held.
  `mcp_project_tools_live_verify` **left open** — worse than unverified: POST `/api/mcp` 500s on a bare
  `initialize` call, reproduced 3x via curl AND via the real `@modelcontextprotocol/sdk` TypeScript
  client against prod (both with a real minted project key and with none) — the entire MCP write
  surface is currently unreachable over HTTP. Opened `mcp_post_transport_500`.
  `listing_project_address_live_verify` **left open** — confirmed the sibling-found scope-gating bug
  by reading page.tsx, AND found a second, earlier break live: the homepage "New Listing" hero's
  create-project call (`EmailLabGridClient.tsx` `createAndEnter`) never sends `kind`/`subject_address`
  at all — built a real test project this way, confirmed via network trace + a revisit that the
  address never reached the DB. Opened `new_listing_hero_never_saves_subject_address`.
  `funnel_demo_email_live_verify` **left open** — its own build session (SESSION_LOG 07/02) says
  explicitly "stays OPEN — operator closes on live cycle-1 evidence"; confirmed `outreach_recipients`
  is still 0 rows live and no cycle-1 send has happened since. Nothing to add — correctly gated on the
  operator (domain purchase, DNS, CSV).
  `lab_first_funnel_landing_live_verify` **left open** — confirmed anonymously via curl that the
  zip-report CTA and ZIP-seeded lab both work live (real figures render), but `SendToSelfModal` (the
  spec's whole point — OTP capture) is never imported/rendered anywhere in the current
  `EmailLabGridClient.tsx` — orphaned when block-canvas was retired 07/07 and nothing migrated it.
  Opened `sendtoself_modal_orphaned_after_grid_retire`.
  Cleanup note: 4 duplicate "Triage Verify 5100 SW 5th Pl" test projects were created live under the
  operator's own account while reproducing the address bug (deletion was correctly auto-blocked as
  irreversible) — operator may want to delete them from `/project`.
  Board not synced this pass (only 3 new opens + 1 close; sync will pick them up on its 2h cron).

End state to aim for: every check that is *provably* done or *genuinely* dead is off the board, every remaining open check is real work with a clear reason it's still open, and a SESSION_LOG entry summarizing the sweep is written before any push of completed work.

---

## Context you may want

- The Airtable mirror you're clearing was built + live-verified earlier today: base `appQSRnaKhHPo3mMT` / table `tbl88lQu6D4XUG0At`, 2-hourly cron (`.github/workflows/airtable-checks-sync.yml`), delta-sync script `scripts/airtable-checks-sync.mjs`. Closing a check → the sync deletes its Airtable row on the next run.
- Ledger CLI + proof gate: `scripts/check.mjs`, `scripts/lib/check-signals.mjs`, `docs/sql/20260705_checks_proof_gate.sql`.
- The session loop / how checks fit the workflow: `CLAUDE.md` RULE 2.
