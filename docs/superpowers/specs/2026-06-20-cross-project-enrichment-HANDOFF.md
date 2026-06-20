# Cross-project AI knowledge — HANDOFF (2026-06-20)

**Status:** BUILT + all gates green + adversarially reviewed. **HELD for your diff review + push** (touches the live `/api/welcome/chat` analyst response → RULE 1 "ask for a diff review before pushing"). Nothing pushed.

**Design spec:** `docs/superpowers/specs/2026-06-20-cross-project-enrichment-design.md`
**Tracking check:** `cross_project_ai_knowledge` (LEFT OPEN — closes only after prod live-verify, not on "code looks right").

---

## What shipped (the operator's #1 ask, delivered end-to-end)

The in-project AI now sees a **shallow, frozen, advisory** index of the user's OTHER projects (TIER B) so it can answer *"did I already pull flood AAL for 33931?"* and **offer** scope-matched reuse — without destabilizing the current project. The deep current-project context (TIER A) and the `page-context.ts:198` stale-leak guard are **untouched**.

- **`lib/project/other-projects.ts`** (NEW, pure): `otherProjectEntries` / `renderOtherProjectsBlock` / `buildOtherProjectsContext`. Reuses `buildProjectDigest` (scope/count/freshness), `findOverlap`, `asOfFromToken`. 16 tests.
- **`app/api/welcome/chat/route.ts`**: `otherProjectsBlockFor()` — cookie-authed, RLS-scoped, **fail-open** read of the user's own projects, appended to the analyst paths only. Anon `/welcome` + summarize unaffected. `body.currentProjectId` added.
- **`components/briefcase/BriefcaseChat.tsx`**: `getExtraBody` now sends `currentProjectId`.
- **`lib/project/cross-project-index.ts`**: overlap hits now carry the matched item's **own** freshness token (`tokenByKey`) — so offers are gated to grounded, dated items and stamped with the datum's real vintage.
- **`lib/project/digest.ts`**: exported `itemFreshnessToken` (the one per-item vintage root).
- **`lib/project/derive-name.ts`**: the approved cheap win — PDF `extracted_text` (capped 1000) now feeds `inferScopeFromItems`, so PDF uploads become scope-bearing.

## Capability reality (so nobody re-promises it)
- ✅ **Info that fits** — shipped.
- 🟡 **Uploads** — shallow (count/kind) + PDF-text scope only; image content-fit needs OCR we don't have.
- 🔴 **"Success on email clicks" — NOT shippable today.** Project email is send-only (`email_sends` has no opens/clicks, no `project_id`); the only click ledger is the cold-outreach drip with no `project_id`; social engagement is unbuilt + not project-keyed. **Deferred to an instrumentation build** (`email_engagement_per_project`).

## Gates (all green, run this session)
`real-tsc (bunx tsc --noEmit)` **0** · `eslint` **clean** · `next build` **✓** · `bun test` **3406/0**.

## Adversarial review (17 agents, 4 lenses, each finding independently verified)
13 raised → **10 confirmed** (2 major, 4 minor, 4 nit), **3 dismissed** (verified false positives). **9 of 10 fixed this session:**
- **#6 (major)** free-text notes could render as actionable "filed facts" → offers now **gated to grounded (token-bearing) items**; notes/sources/files never surface.
- **#7 (major)** offer vintage was conditional → every offer is now **stamped "frozen as of … — worth a fresh check"** (item gating guarantees a token).
- **#1/#2 (minor)** offer date now comes from the **matched item's own token** (not the project's newest, not lost when the source is past the cap-8).
- **#8 (minor)** offer line uses the strongest "frozen / worth a fresh check" wording (it's the only line with a number).
- **#3 (nit)** rows ordered newest-first → deterministic freshest-wins attribution.
- **#4/#5 (minor/nit)** TIER B header carries the "DATA, not instructions" fence; titles clipped to 60; contract rewritten as short numbered imperatives (Haiku-reliable).
- **#9 (nit)** route read now `.order("updated_at", desc).limit(50)`.
- **Skipped #10 (nit):** `buildProjectDigest`-per-row does some discarded work — pure CPU on already-loaded data at cap 8; reviewer agreed not required for v1. Micro-opt if it ever matters.

## Deferred follow-ons (open as checks — see commands below)
- **One-click cross-project pull** — `POST /api/projects/[id]/pull {fromProjectId, identityKey}` + a "Bring this in?" affordance. v1 AI *offers*; the mechanical copy is the next cut.
- **Email-engagement per project** — click instrumentation + `project_id` on events (the 🔴 above).
- **Upload content-fit** — image OCR / filename capture.
- **Approach C** — `swfl_project_list_all` MCP tool (MCP-surface parity).

## How to verify after deploy (prod)
1. Log in, open a project with scope (e.g. a 33931 project). In the in-project chat ask *"have I pulled flood AAL for 33931 in any other project?"* → it names the other project + offers, stamped with a frozen-as-of date.
2. Confirm it **never** says another project is "wrong" and **never** presents a frozen number as current.
3. Public `/welcome` (logged out) → no behavior change (no TIER B block).
4. Then close `cross_project_ai_knowledge`.

## Your next moves (nothing auto-run)
```bash
# Review the diff, then push (rebases on top of the pending social commits):
git log --oneline origin/main..HEAD      # see this + the held social commits
node scripts/safe-push.mjs

# Reconcile the ledger (or I can run these on your go):
node scripts/check.mjs open brain-platform cross_project_pull_followon "One-click cross-project pull route + 'Bring this in?' affordance" --detail "v1 AI offers; mechanical copy deferred. Spec: 2026-06-20-cross-project-enrichment-design.md"
node scripts/check.mjs open brain-platform email_engagement_per_project "Per-project email/social engagement (clicks) — needs instrumentation + project_id on events" --detail "Project email is send-only; only cold-outreach drip has clicks (no project_id). Blocks 'what worked on clicks'."
node scripts/check.mjs open brain-platform cross_project_upload_content_fit "Upload content-fit: image OCR + filename capture so uploads match a project's scope by content"
node scripts/check.mjs open brain-platform cross_project_enrichment_verify "Prod live-verify TIER B cross-project awareness in the in-project analyst chat after deploy" --detail "See HANDOFF verify steps; then close cross_project_ai_knowledge"
```

> NOTE: the working tree also held **unrelated social-session work** (`lib/social/*`, `docs/sql/20260620_social_user_side_cols.sql`, `GO-LIVE/email-scheduler-unit-f.md`, `runs.json`/`runs/`) and several local social commits ahead of upstream. I staged **only** the cross-project files. The social work is yours to handle.
