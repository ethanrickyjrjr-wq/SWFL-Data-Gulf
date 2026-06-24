# Email Lab Block Canvas — Build Plan (file-isolated)

**Spec:** `docs/superpowers/specs/2026-06-24-email-lab-block-canvas-design.md` (rev 3)
**Goal of this folder:** one task card per unit of work, each owning a **disjoint set of files**, so multiple sessions/agents build in parallel without ever editing the same file.

---

## The one rule that prevents collisions

> Two tasks may run **at the same time** iff (a) every task they depend on is done, and (b) their **Owns** file sets do not overlap. The matrix below guarantees no overlap within a wave.

Each card lists exactly the files it may touch. **Do not edit a file you don't own.** If you need a shared file changed, that's a different card. Use `node scripts/worktree.mjs new <label>` (RULE 1.5) when running truly concurrent sessions; otherwise serialize by wave.

---

## Model legend

| | When | Why |
|---|---|---|
| 🔵 **OPUS** | contract correctness · cross-cutting state · prompt/no-invention judgment · modifying LIVE files | a wrong call here poisons downstream or breaks prod |
| 🟢 **SONNET** | one isolated file · fully specified by the spec · pattern-following | mechanical, low-ambiguity, cheap to parallelize |

---

## Build order (DAG)

```
WAVE 0   00 foundation ───────────────────────────────────  🔵 OPUS  (solo · BLOCKS EVERYTHING)
              │
        ┌─────┼───────────┬───────────┬───────────┐
WAVE 1  10 blocks×10   11 history   12 ai-route  31 inspector  32 add-panel   (ALL PARALLEL)
        🟢            🟢          🔵          🟢            🟢
              │
WAVE 2   20 renderers ──► 21 render-route                      🟢 / 🟢   (20 → 21)
              │
WAVE 3   30 canvas-block ──► 33 block-canvas                   🟢 → 🔵
              │
WAVE 4   40 client integration (both clients) ───────────────  🔵 OPUS  (modifies LIVE files)
              │
WAVE 5   50 drag-to-reorder ─────────────────────────────────  🟢 SONNET (after Wave 4 VERIFIED)

DEFERRED 90 persistence + recurring ─────────────────────────  🔵 OPUS  (pending sequencing decision)
```

**Earliest-start note:** anything depending only on **00** can start the moment 00 lands — that's `10, 11, 12, 31, 32` (five parallel tracks). Strict waves below are a practical batching; the matrix is the real source of truth.

---

## File-ownership matrix (no two concurrent tasks share a file)

| Task | Model | Depends on | Owns (only edit these) |
|---|---|---|---|
| **00** foundation | 🔵 | — | `lib/email/doc/types.ts`, `lib/email/doc/schema.ts`, `lib/email/doc/default-docs.ts` |
| **10** blocks×10 | 🟢 | 00 | `lib/email/blocks/{Header,Hero,Stats,Signal,Text,Image,AgentCard,Button,Divider,Footer}Block.tsx` |
| **11** history | 🟢 | 00 | `lib/email/doc/history.ts` |
| **12** ai route | 🔵 | 00 | `app/api/email-lab/ai/route.ts` |
| **20** renderers | 🟢 | 10 | `lib/email/blocks/BlockRenderer.tsx`, `lib/email/blocks/EmailDocRenderer.tsx` |
| **21** render route | 🟢 | 20 | `app/api/email-lab/render/route.ts` |
| **30** canvas-block | 🟢 | 20 | `components/email-lab/CanvasBlock.tsx` |
| **31** inspector | 🟢 | 00 | `components/email-lab/BlockInspector.tsx` |
| **32** add-panel | 🟢 | 00 | `components/email-lab/AddBlockPanel.tsx` |
| **33** block-canvas | 🔵 | 30, 31, 32, 11 | `components/email-lab/BlockCanvas.tsx` |
| **40** clients | 🔵 | 33, 12, 21 | `app/email-lab/EmailLabClient.tsx`, `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` |
| **50** drag | 🟢 | 40 (shipped+verified) | `components/email-lab/CanvasBlock.tsx`, `components/email-lab/BlockCanvas.tsx`, `package.json`, `bun.lock` |
| **90** persistence+recurring | 🔵 | 40 + operator decision | TBD (new route + cron wrapper) |

⚠️ **50 re-opens files 30 + 33 own.** Never run 50 concurrently with anything in Waves 3–4. By Wave 5 nothing else is in flight, so it's safe — just don't overlap it.

---

## Per-task gates (every card)

- End green: `bun test` + `bunx next build` (verify with **next build**, not bare `tsc` — local tsc ≠ Vercel).
- Touch ONLY your **Owns** files.
- **Task 50 only:** `package.json` change → `bun install` + `git add bun.lock` in the same commit (pre-push Gate 1).
- No `git add -A` — stage explicit paths (RULE 1.5).

---

## Suggested dispatch

- **Solo build:** 00 → 10 → (11,12,20,21,31,32) → (30,33) → 40 → 50.
- **Max parallel (worktrees):** 00 solo. Then fan out 10/11/12/31/32 to 5 agents. Join at 20→21 and 30→33. 40 solo (live files). 50 last.
- Cards are self-contained; hand one card file to one agent.
