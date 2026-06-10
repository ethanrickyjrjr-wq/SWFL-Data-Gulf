# Session 5 — Print CSS + PDF v1  ·  **SONNET**  ·  ~1 day

> Read `../shared/conventions.md`, `../AUDIT.md`. **`[AUDIT-FIX C5]`**: HBarChart is already responsive (`clamp()` shipped); the only chart work here is a `beforeprint` final-width frame (gsap animates width 0→% at `HBarChart.tsx:92-126`, so an immediate print can catch `width:0`). No server PDF lib (would trip the lockfile gate). PDF = `window.print()`.

**Goal:** A clean print stylesheet that hides all floating chrome and keeps every citation + freshness token visible, a print-stable chart frame, and "Save as PDF" buttons (metered `export_print`) on `/project/[id]`, `/c/[id]`, `/r/[slug]`.

**Tasks (in order):**
- [ ] `task-01-print-css-block.md` — `@media print` in `app/globals.css`
- [ ] `task-02-hbar-print-frame.md` — `beforeprint` listener sets bars to final widths
- [ ] `task-03-save-as-pdf-buttons.md` — buttons + meter `export_print`; replace S4's `// TODO(S5)`
- [ ] `task-04-real-device-verify.md` — iOS Safari + Android Chrome share-sheet → Save as PDF

**Files:** `app/globals.css` · `components/charts/HBarChart.tsx` · `app/project/[id]/page.tsx` · `app/c/[id]/page.tsx` · `app/r/[slug]/page.tsx`

**Depends on:** S3 (`/c/[id]`), S4 (`/project/[id]`).

**Risk:** iOS fidelity + the gsap zero-width frame → real-device test, not just desktop print preview.

**Diff-review gate:** none. Standard ship.
