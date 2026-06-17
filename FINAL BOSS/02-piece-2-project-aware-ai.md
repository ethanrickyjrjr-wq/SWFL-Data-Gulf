# 02 — PIECE 2: Project-Aware AI  🟡 DRAFT (needs brainstorm)

> ⚠️ This is a SCOPED DRAFT derived from the operator's vision + the codebase map — **not an approved design.**
> Before building, run `superpowers:brainstorming` (RULE 3.5) and write `docs/superpowers/specs/<date>-piece2-project-aware-ai-design.md`.

## Intent

The assistant stops being a stateless pill and becomes the **always-prepared Project AI**: it knows a little about
each project (more when there are fewer), knows what you already have and what **overlaps** with your other projects,
and suggests **without nagging**. It surfaces **changing situational prompts** — 3 that depend on what's going on +
1 that just offers to do something — broad when no project is open, focused when one is. Prompts change only on
**project-switch or a question**, not every click. "Give him time to load during click-over." It is **one persistent
assistant in two contexts** (Outside mode ↔ Project mode), joined by the context bus + `project_id` — not two bots
(`00-MASTER-PLAN.md` → The spine).

## Contract

**Depends on (from P1):** the persistent layout/AI · `aiContext/setAiContext` + `{kind:"project",projectId}` PillPage
seam (= the in-session half of the **context bus**, `00-MASTER-PLAN.md`) · `summarizeItem` · `groupItemsByKind` ·
`projects.ui_state` · the digest-prefetch-on-click hook.
**Depends on (from P3, optional/enriching):** `project_feed` (kinds: data-change · engagement · external-event ·
**platform-feature**) + email click events + change-detection — for "7 clicks / Walmart nearby / the new data shows X /
we just got new charts that fit this" prompts. **P2 ships an MVP without P3** using signals that exist today.
**Provides:** the dynamic prompt engine + a project-digest builder (read by the prompt surfaces P1 left in `workspace/*`).

## Scope (proposed)

1. **Project digest builder** — a small, mostly-deterministic summary of one project (its items via `summarizeItem`,
   last activity, deliverables, schedules, scope ZIP/topic). Cheap; this is the AI's "what's in here" context.
2. **Cross-project index** — for the signed-in user, a lightweight map of each project's scope + item identities so the
   AI can say "you already have this 33931 flood metric in *Luxury Clients* — reuse it?" Overlap = identity match on
   existing item fields (no new embeddings for v1).
3. **Dynamic prompt engine** — replaces the static `lib/briefcase/visits.ts` sets with a generator producing **3
   situational + 1 offer**, parameterized by no-project (broad/urgent) vs. project-open (focused), the digest, and (if
   present) P3 signals. Recompute **only** on project-switch or after a question (cache between). Concrete prompts:
   *"Ready to send?"* (a seeded email is staged), *"Pick up where we left off?"*, *"the new data shows X — want it in
   your report?"*, *"this would look good in an email for your luxury clients."*
4. **Wire project buttons → AI** — consume P1's `setAiContext` so each workspace action "prepares" the assistant.
5. **Selective pre-build (background, ONE option, on a strong signal)** — when intent is clear, pre-build a single
   suggested deliverable so a sample thumbnail / one-click PDF is ready on arrival. Stage recipes cheaply (P1); spend an
   LLM pass on **one** option, never all (`00-MASTER-PLAN.md` → Convergence engine). Never block the user on it.
6. **Cross-project assist** — using the index (#2), surface "you already have this in *Project Y* — reuse it?" and line
   up a one-click add. Identity-match is deterministic; the build is the selective tier (#5).

## Existing signals P2 can use on day one (before P3)

Freshness-token diff (master/brain `freshness_token` changed since last open = "new data as of X") · `email_sends`
(something went out) · reconcile verdicts (`swfl_reconcile` — a filed metric is now stale) · "where you left off"
(latest `items.added_at` / last deliverable). These power real prompts without the P3 feed.

## Open decisions for brainstorm

- Prompt generation: deterministic templates vs. a cheap LLM pass vs. hybrid. (Cost/latency vs. naturalness.)
- Does P2 need a `project_ai_memory` table, or is on-the-fly digest enough? (Lean: on-the-fly.)
- How "broad/urgent" no-project prompts are chosen (region master read? most-stale project? newest signal?).
- Overlap UX: inline chip vs. a dedicated "you also have…" line. How aggressive before it's nagging.
- Exactly where the 3+1 prompts render in `workspace/*` and the global pill, and the switch/question refresh trigger.

## Likely key files
`components/briefcase/BriefcaseChat.tsx` · `components/briefcase/BriefcasePanel.tsx` ·
`components/briefcase/BriefcaseProvider.tsx` · `lib/briefcase/visits.ts` (static prompts → replace) ·
`lib/chat/page-context.ts` · `app/api/welcome/chat/route.ts` (analyst mode system prompt) · new `lib/project/digest.ts`
+ `lib/project/prompt-engine.ts`. Reuse `summarizeItem`/`groupItemsByKind` from P1.
