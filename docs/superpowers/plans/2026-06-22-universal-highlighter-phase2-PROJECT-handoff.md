# HANDOFF — Universal Highlighter **Phase 2: the PROJECT highlighter**

> **Status: HANDOFF, not scoped.** Phase 1 (Outside highlighter → app root) is BUILT + verified (commit `3554411d`, `bun test` 3642/0, `next build` ✓). This doc is the brief for the NEXT Claude to **SCOPE** Phase 2. It is NOT a plan — you write the plan after you probe.
>
> Parent: `docs/superpowers/specs/2026-06-21-one-assistant-unification-RECONCILED-SCOPE.md` (Phase 3C). Phase-1 plan: `docs/superpowers/plans/2026-06-22-universal-highlighter-phase1.md`.

---

## 0. Your job (read this first)

1. **PROBE BEFORE YOU SCOPE (RULE 0.5).** Every file path below is a *hypothesis to verify*, not gospel — I wrote them after building Phase 1, but the project plane I touched less. Open them. `graphify query "project highlighter edit"` if the graph is built; else `Grep`/`Read`. Confirm each surface exists as described before you build on it.
2. **BRAINSTORM the edit UI (RULE 3.5).** The highlight→propose→confirm *interaction* is net-new product behavior. Run `superpowers:brainstorming` on it before writing a line. Do NOT skip — a config/CTA change still qualifies.
3. **Then write the plan, then build.** Use `superpowers:writing-plans` → `superpowers:executing-plans`. Mirror Phase 1's verification bar (§7).

The one-line goal: **on `/project/[id]`, the same root highlighter becomes PROJECT AI — it grounds on the open project, files INTO the project, and can PROPOSE→CONFIRM an edit to the deliverable the user highlighted.** Phase 1 already mounts the highlighter there in OUTSIDE mode; Phase 2 upgrades that page from "outside" to "project."

---

## 1. What the Project Highlighter SHOULD BE (exactly what we discussed)

The operator's frame, locked across the Phase-1 build: **pill and highlighter are ONE assistant — one brain (`/api/assistant`), one file cabinet (the briefcase) — with two triggers (click = pill, highlight = highlighter) and two environments:**

- **OUTSIDE** (everywhere except a project): ask / summarize / **file** — **no editing.** ✅ shipped in Phase 1.
- **INSIDE a project** (`/project/[id]`): **PROJECT AI. Editing happens here.** ← **this is Phase 2.**

Concretely, inside a project the highlighter should:

1. **Ground as PROJECT AI, not OUTSIDE AI.** Highlight text → answer is grounded on the open project's digest (the same context the pill already uses inside a project), with the cross-project TIER-B awareness PROJECT AI already has. Today the highlighter hard-codes `context:"outside"` (see §3-A) — that's the headline gap.
2. **File INTO the project** (not just the anonymous briefcase draft). The user is *in* a project; a filed Q&A/figure should land in that project's items.
3. **Offer to EDIT what was highlighted** — the net-new capability. Highlight a sentence/number in the rendered deliverable → "Rewrite this," "Update this figure," "Tighten this section" → **PROPOSE** the change → **CONFIRM** → it executes through the existing gated edit pipeline. This is the thing Outside deliberately does NOT do.
4. **Stay moat-safe.** An edit that inserts a *number* must still be sourced (four-lane provenance — `[[project_four-lane-provenance-moat]]`); but the user editing their **own** deliverable text is free, not policed (`[[feedback_client-data-not-police]]`). The good news: the edit-execution route already enforces this (§2.4) — you don't re-implement the moat, you ride it.

**Out of scope for Phase 2 (say so in your plan):** anything that re-paywalls building (`[[feedback_build-monetization-model]]` — builds/edits are free; SEND is the paywall). Editing is part of build.

---

## 2. The architecture Phase 1 left for you (the seams are already cut)

Phase 1 was built so Phase 2 is mostly *wiring an existing bus into an existing engine*, not new infrastructure. The symmetry:

| | OUTSIDE / report (`/r/*`) — DONE | PROJECT (`/project/[id]`) — YOUR JOB |
|---|---|---|
| context bus | `lib/highlighter/report-context-store.ts` (NEW in P1) | **`lib/project/ai-context-store.ts` — ALREADY EXISTS** |
| publisher | `components/highlighter/ReportHighlightBridge.tsx` (NEW in P1) | **`app/project/[id]/workspace/ProjectAiContextBridge.tsx` — ALREADY EXISTS** (mounted in `ProjectWorkspace`, publishes the project digest for the pill) |
| root consumer | `GlobalHighlighter` reads `useReportContext()` | `GlobalHighlighter` ALSO reads `useAiContext()` (the project digest) — **you add this branch** |
| engine context | `context:"outside"` + `report_id` | `context:"project"` + `project_id` — **already a first-class path** (§2.3) |

### 2.1 The highlighter already MOUNTS on `/project/*` (Phase 1)
`shouldMountHighlighter` (`lib/briefcase/pill-mount.ts`) returns `true` on `/project/*` (it only suppresses `/p/`,`/embed/`,`/login`,`/auth`). So `GlobalHighlighter` is already live there — **in OUTSIDE mode** (no report context, no project context → `"outside"` thread, region-wide grounding). Phase 2 makes it read the project context and switch to PROJECT mode. **You are upgrading a mount that already exists, not adding one.**

### 2.2 The project digest bus already feeds the root (for the pill)
`ProjectAiContextBridge` (in `app/project/[id]/workspace/`, mounted by `ProjectWorkspace`, keyed by project id) publishes the project digest to `lib/project/ai-context-store.ts`. The root pill (`AppShell` → `AiBriefcasePill` standalone) is already project-aware through it. **`GlobalHighlighter` just needs to read the same store** (`useAiContext()` / `getAiContext()`) — likely **no new project bridge needed.** Verify the digest carries what you need to ground/edit; if not, extend the existing bridge, don't add a parallel one.

### 2.3 The engine ALREADY speaks `context:"project"`
`lib/assistant/contract.ts`: `AssistantContext = "project" | "outside" | "public"`, with `project_id`. `lib/assistant/engine.ts` dispatches `isReportRequest ? runReportPath : runConversationPath`; `conversation-path.ts` already has the **analyst PROJECT-AI voice + project context + cross-project TIER-B read**. So the server side is built. **The gap is purely client-side: the highlighter's converse client never sends `context:"project"`/`project_id` (§3-A).**

### 2.4 The EDIT-EXECUTION pipeline already exists and is moat-safe
**Do not build a new mutation path.** `app/api/deliverables/[id]/edit/route.ts` already does guided edits:
- COSMETIC (template/branding) → in-place, no LLM;
- CONTENT (`items`/`instruction`) → forks a NEW gated version (`supersedes_id`), regenerating the narrative through `assembleDeliverable`'s gated pipeline (**freeze → forced-tool narrative → 4 lints**), so an edit **cannot smuggle unsourced claims** (the moat, enforced). Body: `{ items?, template?, branding?, instruction? }`; planner at `lib/deliverable/edit-plan.ts`; foreign-file guard (`hasForeignFile`) already there.
- Sibling routes: `restyle`, `refresh`, `revoke`, `trash`, `blast` under `app/api/deliverables/[id]/`; project-level `app/api/projects/[id]/{action,build,confirm-value,refresh,assemble}`.
- `confirm-value` is a **PROPOSE→CONFIRM precedent** ("Keep mine" on a metric-collision chip) — study its UX/route shape; your highlight→edit confirm can mirror it.

**So Phase 2's genuinely net-new surface is small:** (a) route the highlighter to PROJECT context client-side, (b) the highlight→propose→confirm **CTA in `HighlightPopup`**, (c) call `/api/deliverables/[id]/edit` (or the right existing route) with an `instruction` derived from the selection. The brain, the bus, the publisher, and the moat-safe mutation already exist.

---

## 3. Landmines I hit building the Outside highlighter (they WILL recur)

Every one of these bit Phase 1. Budget for them.

**A. The converse client hard-codes `context:"outside"`.** `lib/highlighter/converse.ts` `streamConverse` sends `body: { context: "outside", report_id, … }` — literally always outside. **Phase 2 must add `context` + `projectId` to `ConverseInput`** and send `context:"project"` + `project_id` on `/project/*`. This is the analog of the Phase-1 change that made `reportId` optional. Thread it through `converse.ts` → `use-converse.ts` → `HighlightPopup` → `GlobalHighlighter`.

**B. `react-hooks/set-state-in-effect` is a HARD ESLint ERROR here** (`[[feedback_react-set-state-in-effect]]`). The whole bridge/store pattern exists to dodge it: publish in a **lazy `useState` initializer** (client-guarded `typeof window`) + a module-store write (NOT React `setState`) in effects. See `ProjectAiContextBridge` and `ReportHighlightBridge` for the exact shape. Any new project state you add MUST follow it or CI/`next build` breaks.

**C. Hooks-before-early-return.** `GlobalHighlighter` calls *all* hooks before the `shouldMountHighlighter` return. When you add `useAiContext()` (or a project branch), keep it above the return or you trip rules-of-hooks.

**D. Threads are TWO stores, NOT one — the "unified conversation" is briefcase-only.** Reality check on the "one continuous conversation" framing: the **briefcase (filing) is genuinely shared**, but the **conversation threads are separate stores** — the pill uses `useProjectThread(projectId)` (in `BriefcaseChat`), the highlighter uses `HighlighterProvider`'s `thread(key)` (`lib/highlighter/context.tsx`). Phase 1 gave the highlighter its own `"outside"` bucket — *parity in shape* with the pill's `useProjectThread(null)`, NOT a shared store. **Decide deliberately for Phase 2:** should the project highlighter share the pill's `useProjectThread(projectId)` thread (true continuity) or keep a `threadKey = projectId` bucket in `HighlighterProvider` (separate, like Phase 1)? Unifying threads is bigger than Phase 1 attempted — scope it explicitly, don't assume it's free.

**E. The `threadKey` ⟂ grounding split.** Phase 1 split `HighlightPopup`'s `threadKey` (conversation bucket) from `reportId` (grounding only). For Phase 2, grounding = `context:"project"`+`project_id` (NOT a reportId); the thread bucket = your §3-D decision. Keep them separate — passing the pathname/projectId as `reportId` would wrongly flip `isReportRequest` and take the report path.

**F. The bridged-vs-standalone signal is the STORE, not the pathname.** Phase 1 found that keying the pill's mode off the `/r/*` pathname over-suppressed and zero-pilled `/r/search`. `AppShell` now decides on the report-context store. **Do the same for projects:** if you change pill/highlighter behavior on `/project/*`, key it off `useAiContext()` presence, not `pathname.startsWith("/project/")`. And re-run the exhaustive coverage test (§7).

**G. The exhaustive page-coverage test will police you.** `lib/briefcase/page-mount-coverage.test.ts` asserts exactly one pill + one highlighter per page except the clean set, AND **"only `/r/*` pages publish a report context."** Phase 2 must publish the PROJECT context via `ai-context-store` (project bus), NOT a *report* context on `/project/*` — or that test goes red. If project mode changes mount counts, extend the test in the same commit.

**H. Nested `*/` inside a `/** … */` JSDoc block breaks the Turbopack build.** I shipped a comment containing `/*highlighterEnabled*/` and `next build` failed with a parse error. Don't put `*/` inside doc comments.

**I. `use-highlight.ts` is UNTOUCHABLE (INVARIANT).** See §4. Phase 1's #1 invariant; still binding.

**J. The place-frame is parsed by the dock stream, not just the pill's.** Phase 1 wired `onPlace` through `sse.ts` → `converse.ts` → `use-converse.ts` to capture the grounded ZIP from the conversation path's prelude `place` frame (the highlighter's `streamConverse` ignored it before). That capture is reusable for project filing if you need the grounded place; the pill's own capture is a *separate* path (`BriefcaseChat`'s `placeRef` on its own `ChatFrame` stream). Don't assume one captures for the other.

**K. `app/project/layout.tsx` has a HARD GUARD: never `key={pathname}`.** It explicitly does NOT mount the AI (the root does) and forbids remounting the subtree. The highlighter must **persist from the root across project navigation** (like the pill) — do not mount a per-project highlighter that remounts on project switch.

---

## 4. What MUST stay from the current highlighter (do NOT rewrite — reuse/extend)

These are load-bearing; rewriting them re-introduces solved bugs.

- **`lib/highlighter/use-highlight.ts` — UNTOUCHED, byte-for-byte.** The selection engine: `classifyFact`, `expandRangeToWordStart/End` (snap-to-word), `snapCrossRowSelection`, `isWorthySelection`, `MAX_WORDS`, the double-tap window, and the **mobile breakpoint** (`matchMedia("(max-width: 639px)")`, `isNarrow`). Phone + desktop selection behavior must be unchanged. This is INVARIANT #1.
- **`lib/highlighter/position.ts`** — popup positioning + mobile `isNarrow`. Reuse.
- **`components/highlighter/HighlightPopup.tsx`** — **extend, don't rewrite.** Add the edit CTA + project filing here. Keep its mobile positioning, scroll isolation, Esc-close, chip logic. Note the `threadKey`/`reportId`/`filingReportId` split Phase 1 introduced — fold project mode into that shape (a `projectId`/`context` prop, project filing target), don't bolt on a parallel popup.
- **`components/highlighter/GlobalHighlighter.tsx`** — the root mount. Add the project branch (read `useAiContext()`, pick PROJECT vs OUTSIDE). One highlighter, one popup — never a second mount.
- **`lib/highlighter/context.tsx` (`HighlighterProvider`)** — chipFact + thread store, now app-root + flag-gated. Reuse its thread API (or decide §3-D).
- **`lib/highlighter/converse.ts` / `use-converse.ts` / `sse.ts`** — the streaming engine + `onPlace`. **Extend** with `context`/`projectId` (§3-A); don't fork a new client.
- **`lib/briefcase/qa-item.ts` (`buildQaItem`)** — the shared, schema-valid filer. If project filing differs, extend this, don't duplicate.
- **`lib/briefcase/pill-mount.ts` (`shouldMountHighlighter`)** — already covers `/project/*`. Leave it.
- **`lib/highlighter/suggestions.ts`** — chip generation (type-aware). Reuse; maybe add a project-edit chip set.
- **`lib/highlighter/report-context-store.ts`** — the *pattern* to mirror, but for projects you reuse the EXISTING `ai-context-store.ts` instead of cloning it.
- **`components/highlighter/DiscoveryTicker.tsx`** — Phase 1 made it `onReport`-aware (report vs generic tip sets). Phase 2 likely wants a 3-way (report / **project** / generic) — extend the prop, keep `hidden sm:block` (desktop-only INVARIANT).
- **`lib/highlighter/handoff.ts`** — the "Copy for Claude" handoff is **report-referencing** (emits `swfl_fetch report_id=…`). Phase 1 hides it off-report. On a project it's meaningless too — keep it hidden, or design a project-appropriate handoff; don't ship a 404-on-call MCP line.

---

## 5. Open design questions to resolve in your brainstorm (decisions, not code)

1. **Thread store (§3-D):** share the pill's `useProjectThread(projectId)` or keep a separate `HighlighterProvider` bucket? Pick one and justify.
2. **Edit-proposal UX:** does an edit-proposal seam already exist in the workspace (`DeliverableLanes`, `confirm-value`, `planDeliverableEdit`)? Probe before designing new UI — reuse the `confirm-value` PROPOSE→CONFIRM pattern if it fits.
3. **What's editable by highlight?** Only rendered **deliverables** (`/p/[id]` content shown in the workspace), or any project text? Editing flows to `/api/deliverables/[id]/edit` (forks a gated version) — so "edit" means "edit a deliverable," which scopes *what* the user can usefully highlight.
4. **Filing target:** project items vs the anonymous briefcase draft when signed-in inside a project. Where do `qa`/`metric` items land?
5. **Selection → instruction:** how does a highlighted span + a chip ("tighten this") become the `instruction` string `/api/deliverables/[id]/edit` expects? Keep it deterministic where possible.
6. **Moat boundary:** confirm the edit route's 4-lint gate is sufficient (it should be) so you do NOT add a second moat in the popup — and confirm user-authored text stays un-policed (`[[feedback_client-data-not-police]]`).

---

## 6. Probe targets (read these FIRST — RULE 0.5)

- `lib/assistant/contract.ts` — `context:"project"` + `project_id` (the path you must hit).
- `lib/assistant/conversation-path.ts` — the PROJECT-AI voice, project digest fold-in, TIER-B cross-project read.
- `lib/project/ai-context-store.ts` + `app/project/[id]/workspace/ProjectAiContextBridge.tsx` + `app/project/[id]/workspace/ProjectWorkspace.tsx` — the existing project bus + where it mounts.
- `app/project/layout.tsx` — the `key={pathname}` HARD GUARD + "AI persists from root."
- `app/project/[id]/workspace/DeliverableLanes.tsx` — how deliverables render in the workspace (what's highlightable).
- `app/api/deliverables/[id]/edit/route.ts` + `lib/deliverable/edit-plan.ts` + `lib/deliverable/assemble.ts` — the moat-safe edit pipeline you'll drive.
- `app/api/projects/[id]/confirm-value/route.ts` — the PROPOSE→CONFIRM precedent.
- `components/briefcase/BriefcaseChat.tsx` — how the PILL already does project filing (`buildQaItem`) + project thread (`useProjectThread`) + `placeRef`.
- The Phase-1 diff: `git show 3554411d` — the exact shape you're extending.

---

## 7. Verification bar (mirror Phase 1 — non-negotiable)

- `bun test` green (currently 3642/0). **Extend `lib/briefcase/page-mount-coverage.test.ts`** if project mode changes mount conditions; keep "only `/r/*` publishes a *report* context" true.
- `bunx next build` exit 0 (the real gate — clean `npx tsc` is NOT enough; `[[feedback_verify-with-next-build-not-npx-tsc]]`).
- `use-highlight.ts` untouched (assert by diff).
- Exactly one pill + one highlighter on `/project/[id]`; the highlighter is PROJECT-grounded; filing lands in the project; an edit confirm round-trips through the gated route and the public `/p/[id]` reflects the new gated version.
- **Prod live-verify after deploy** (not dev attestation — `[[feedback_checks-prod-evidence-not-dev-attestation]]`): highlight in a project → PROJECT-AI answer (not region-wide) → propose edit → confirm → deliverable updates. Open a `checks` entry for it.
- Pre-push: multi-file + touches `/api/*` + the answer-path root → **diff review before pushing** (RULE 1), `SESSION_LOG.md` entry, `node scripts/safe-push.mjs`, no autonomous push/PR.
