# Issue 02 — Root Cleanup + Section Map

**Parent analysis:** `docs/superpowers/specs/2026-06-28-repo-focus-restructure-analysis.md`
**Status:** SPEC-READY breakdown. NOT built. Build via the protocol at the bottom.
**Priority:** #2 — fast, low-risk, can run alongside Issue 01.
**One line:** Get the ~13 plan-doc dirs and one broken folder out of the repo root so the root shows
the real platform; document the real section boundaries; make `graphify` the live "what-connects-to-what."

---

## 1. THE PROBLEM (in detail, with evidence)

The "everything is chaos / everything breaks" feeling at the root is mostly **clutter, not code**.
The real platform is a handful of dirs; the rest of the root is markdown plan-dumps and stray
artifacts. This is cosmetic but real — it buries the signal and makes the repo illegible.

> **CRITICAL framing:** this is NOT a monorepo/workspaces split. The parent analysis proved the TS
> code (`app`/`lib`/`refinery`, 1,000+ cross-edges) is ONE organism and must NOT be carved into
> packages. This issue ONLY relocates docs and deletes dead folders. No code moves. No imports change.

---

## 2. GROUND TRUTH — everything you need so you don't re-investigate

### The real platform (KEEP at root — these are code/content)
`app/` (355 files), `lib/` (505), `ingest/` (404), `refinery/` (400), `components/` (99),
`brains/` (38), `docs/` (739), `scripts/` (88), `.github/` (93), `fixtures/`, `templates/`,
`public/`, `migrations/`, `types/`, `utils/`, `mcp-widget/`, `verification/`, `tools/`,
plus config files. graphify-out is gitignored.

### Clutter to RELOCATE (markdown plan-dumps at root → `docs/_archive/` or `_AUDIT_AND_ROADMAP/`)
Confirmed tracked-file counts:
- `FINAL BOSS/` (10 md) — workspace-shell/project-aware-AI plans
- `GET DONE/` (4), `GO-LIVE/` (1), `HOMEPAGE/` (6 — incl. build_demo python), `Live Data/` (1),
  `SITE FLOW BUILD/` (9), `SOCIAL BUILD/` (16), `TODO/` (5), `UNKNOWN/` (11 — incl. .patch files),
  `_diagrams/` (4 .mmd)
- Likely untracked/gitignored noise: `__scratch__/`, `tmp/`, `downloads/`, `runs/`,
  `awesome-claude-code-toolkit/` (tracked=0).

### Stray broken folder to DELETE
`C:Usersethandevbrain-platformmigrations/` — empty, 0 tracked files. Created by a Windows absolute
path jammed into a relative `mkdir` (a RULE 7 shell-crossing scar). Safe to remove.

### The real section map (measured by import coupling — for the section-map doc + graphify)
- **WEBSITE:** `app/` (pages/api), `components/`, `lib/landing`, `lib/map`, `lib/zip-summary`,
  `lib/citations`.
- **EMAIL/DELIVERABLES:** `lib/email`, `lib/deliverable`, `templates/`, any `app/email-lab`.
- **MCP/ANSWER-ENGINE:** `app/api/mcp`, `mcp-widget/`, `lib/assistant`.
- **DATA-INGEST:** `ingest/` (Python island — zero TS coupling), `.github/workflows`.
- **BRAINS/REFINERY:** `refinery/`, `brains/`.
- Hub = `lib/` (in-degree ~684). One-way clean edge: `refinery → app/components = 0`.
- Cleanly separable (already): `ingest/` (Python), `brains/` (md), `mcp-widget/`, `docs/`.

### graphify (the "what-connects" tool you asked for)
Already builds the cross-section graph: `graphify-out/graph.json` (~31 MB, gitignored, regenerate
with `bun run graphify:update`; app-plane `node scripts/graphify-app-nodes.mjs`). The coupling map
above is exactly what `graphify query "<topic>"` surfaces. The gap was that Claude didn't consult it
— Issue 01's hook injects a `graphify query` pointer to close that.

---

## 3. THE BUILD

1. **Inventory before touching.** For each clutter dir, `ls` it and skim. Memory rule: *look at the
   target before moving/deleting — if it contradicts how it was described, surface it, don't proceed.*
   Some of these (e.g. `FINAL BOSS/`, `SOCIAL BUILD/`) are referenced by active checks/build-queue —
   grep for references first: `grep -rl "FINAL BOSS\|SOCIAL BUILD\|SITE FLOW BUILD" docs/ _AUDIT_AND_ROADMAP/ MEMORY.md`.
2. **Relocate with history preserved:** `git mv "FINAL BOSS" docs/_archive/final-boss` etc. (rename
   to kebab-case, no spaces — spaces in paths are a recurring shell-crossing hazard).
3. **Fix references:** update any link in `docs/`, `MEMORY.md`, `_AUDIT_AND_ROADMAP/build-queue.md`,
   or active checks that pointed at the old path. Do NOT break a live reference.
4. **Delete the stray broken dir** (empty, untracked): `rmdir "C:Usersethandevbrain-platformmigrations"`
   (verify empty first; it has 0 tracked files so git won't notice).
5. **Write the section-map doc** `docs/section-map.md`: the 5 sections, their dirs, the coupling
   summary, the "what's separable vs what's one organism" verdict, and the `graphify query`
   commands per section. This becomes the canonical "where does X live" reference.
6. **(Optional) .gitignore audit:** ensure `__scratch__/`, `tmp/`, `downloads/`, `runs/` are
   ignored so they stop showing at root.

---

## 4. EXECUTION PROTOCOL — do exactly this, in order
1. **Read first (RULE 0.5):** this file + parent analysis. Run the reference-grep in step 1 above.
2. **Brainstorm (RULE 3.5):** confirm the destination layout with Ricky (one `docs/_archive/` vs
   spreading into `_AUDIT_AND_ROADMAP/`). This is reversible but touches many paths — get the target
   shape agreed before moving.
3. **Move in small, reviewable commits** — one logical group per commit (e.g. "relocate FINAL BOSS +
   SOCIAL BUILD plans"), not one giant move. Stage explicit paths only (RULE 1.5 — never `git add -A`).
4. **After each move, `git status` + spot-check** that nothing tracked vanished and no live link broke.
5. **Write `docs/section-map.md`** last, reflecting the final layout.

---

## 5. HARD RULES / GUARDRAILS
- **No code moves. No import changes.** If a relocation would change a TS import path, it's not a
  doc — stop and re-scope.
- **`git mv`, never delete-and-recreate** — preserve history.
- **Rename away spaces** in any path you touch (`FINAL BOSS` → `final-boss`).
- **Check references before moving.** A relocated plan that an open check points to must have its
  reference updated in the SAME commit.
- **Don't delete anything you didn't confirm is dead.** The stray `C:Users…` dir is confirmed empty;
  everything else is RELOCATE, not delete.

## 6. VERIFICATION (definition of done)
- `ls -d */` at root shows the real platform + `docs/`/`_AUDIT_AND_ROADMAP/` + config — no
  ALL-CAPS/spaced plan dirs, no `C:Users…` folder.
- `git log --follow` on a moved file shows preserved history.
- No broken links: re-run the reference-grep; every hit resolves.
- `docs/section-map.md` exists and matches reality; `graphify query` commands in it actually run.

## 7. ANTI-PATTERNS (what NOT to do)
- Treating this as a workspaces/monorepo split (it is NOT — see parent analysis).
- One mega-commit moving everything (un-reviewable, hard to revert).
- Deleting plan docs instead of archiving (they're organizational memory; archive, don't trash).
- Leaving spaces in renamed paths.

## 8. OPEN QUESTIONS for brainstorming
- Single `docs/_archive/` vs. routing some dirs into `_AUDIT_AND_ROADMAP/`?
- Should `docs/section-map.md` be auto-regenerated from graphify, or hand-maintained + linted?
- Does the `_ASSISTANT/` cleanup system (already in flight) want to own archival of these too?
