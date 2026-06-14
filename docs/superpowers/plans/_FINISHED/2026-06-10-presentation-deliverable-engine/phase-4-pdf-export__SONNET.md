# Phase 4 — PDF export (same project) · SONNET · parallel-ok with Phase 5

> **Contract (inherited):** PDF = export surface of the SAME `/p/[id]` project — NOT a second engine;
> **per-visual as-of on every frame; cover stamp only as an ADDITIONAL summary, never a replacement;**
> NO `git push`. Depends on **Phase 3**.

## Why
A client wants a file to hand over. PDF is the same composed project printed — not a new layout engine.

## Task
- Add a print stylesheet over `app/p/[id]/page.tsx`'s composed frames, exported via `window.print()`
  (per build-queue + `docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md`).
- **GUARDRAIL (hard, operator drift-catch):** each frame keeps **its own** `asOf` caption in print.
  Deliverables mix vintages (ZHVI, rents, flood AAL have different as-of dates). A cover page MAY add a
  summary stamp, but it must **never replace** per-visual dates.
- Implement an explicit **assert** in the build/print path: if the composed set has frames of differing
  `asOf` and the render would collapse them to a single stamp, **fail** (throw / block export). Add a
  test that a mixed-vintage project trips the assert and a uniform-vintage one passes.
- Per the anchoring spec: print may collapse to a cover stamp **only when the vintage is uniform**.

## Acceptance
- Print `/p/[id]` → PDF shows per-visual as-of on every frame.
- Mixed-vintage project: collapse-to-single-stamp assert fires (test proves it).
- Uniform-vintage project: cover stamp allowed; per-visual captions still present.

## Wrap
Commit locally. SESSION_LOG + build-queue. Update README status row 4. **No push.**
