# GridStack migration — PDF & Outlook safety addendum

**Status:** plan (companion to `docs/superpowers/specs/2026-07-06-email-grid-autoheight-gridstack-design.md`)
**Date:** 07/06/2026
**Why a separate file:** this is the execution plan for the PDF/Outlook safety net; the parent spec is
the design. The "Spec corrections" below were folded back into the spec (07/06/2026) once its stale
repolith claim was released — the spec's "Scope and blast radius", "Out of scope", and "Testing"
sections now carry the accurate `h`-via-grouping picture. This doc remains the detailed plan.

---

## What the operator asked

"Make sure we can turn into PDFs and works well with Outlook." I probed the real render pipeline
(RULE 0.5) instead of trusting the spec's prose. Finding: the spec's blast-radius claim is wrong in a
way that would mislead the implementer, but the correct picture does **not** threaten the migration
decision — it just names the one thing to test.

## The one factual correction

The spec's "Scope and blast radius" says `compile-grid.ts` and `row-grouping.ts` "read only `x`, `y`,
and `w` … never `h`," and "Out of scope" says the PDF "never read `h`." **Both are false.**

- `lib/email/doc/row-grouping.ts` **reads `h`** — `effectiveLayout` sets `h: l?.h ?? 1` (line 34) and
  the band-overlap grouping uses `curBottom = max(y + h)` (line 60) to decide which blocks share a row.
- That file is the **ONE shared root** consumed by BOTH output engines: `compile-grid.ts` (Outlook
  ghost-table columns) and `lib/pdf/email-doc-pdf.tsx` (`groupRows(doc.blocks)`, line 806).

## The correct blast radius (precise)

`h` reaches the output **only through grouping, never through sizing.** Traced:

- **Outlook email** (`compile-grid.ts`): column widths come from `w` via `colSpanToPx`; block heights
  are natural HTML flow. `h` is never used to size anything.
- **PDF** (`email-doc-pdf.tsx`): cells size from `flex: eff.w`; content flows across pages via
  `<Page wrap>`. `h` is never used to size anything.

So the sent email and PDF were **already content-driven and never clipped.** Clipping is an
**editor-canvas-only** bug (RGL's `overflow-hidden` fixed box) — exactly what the migration fixes.

The migration changes `h` **values** (static `DEFAULT_H` → content-measured `sizeToContent`, persisted
back into `block.layout.h` via `GridCanvas`'s `onLayoutChange`). The only thing those new values touch
downstream is **which blocks group into a visual row**. That grouping is the entire downstream surface.

## The bounded risk

Grouping is a band-overlap rule. The single geometry it can mis-group: a **tall block beside a short
block, with a third block below the short one**. The tall block's band `[y, y+h]` can swallow the
below-neighbor into the same row → a spurious extra column (3-col ghost table in Outlook, 3-flex-cell
row in the PDF).

This mostly **pre-exists** under `DEFAULT_H` (a large static height does the same). Whether the
migration **amplifies** it depends on two GridStack facts the spec did NOT verify:

1. **`cellHeight` default** — if it's ≈ RGL's `rowHeight: 30`, content-measured `h` stays in the same
   scale and grouping barely moves. If it's small, content → large `h`, widening the tall-beside-short case.
2. **Compaction / `float` behavior** — if GridStack **top-aligns** side-by-side widgets (same `y` for a
   multi-column row), same-`y` blocks group correctly regardless of `h` magnitude (the common case:
   full-width stacks + occasional equal-height 2-col rows is safe). If it **staggers `y`**, the edge case widens.

## Required work (in priority order)

**1. Pin the two GridStack vendor facts in-session (crawl4ai, RULE 0.4)** — during implementation,
before wiring `sizeToContent`, confirm from `gridstack/gridstack.js` docs:
   - GridStack's default `cellHeight` (and whether we should set it to `30` to match the current scale).
   - Whether `sizeToContent` writes the measured `h` back onto the node (`gridstackNode.h`) so it
     persists into `block.layout.h`, and whether a multi-column row top-aligns or staggers `y`.
   Write findings into `SESSION_LOG.md`.

**2. Grouping-stability test (the actual "PDF + Outlook works" deliverable).** Add to
`lib/email/doc/row-grouping.test.ts`: feed GridStack-shaped layouts through `groupRows` and assert row
composition matches visual intent — one assertion serves both engines since they share the root. Cases:
   - normal same-`y` 2-column row → one row of two (must NOT split);
   - full-width stack → each its own row;
   - **tall-beside-short + below-neighbor** → the below-neighbor is its OWN row, NOT a spurious third
     column (this is the regression guard).

**3. Golden render of the reported-screenshot doc.** Build the doc that clipped (long Sources citation
line, a stats row, a signal bullet list) and assert:
   - through `compileGrid` — the intended full-bleed blocks render single-column (NOT ghost-tabled),
     and any real 2-col row still emits the MSO ghost table;
   - through `EmailDocPdf` — all blocks present (the 10-type fidelity audit already guards drops), no
     block swallowed into a wrong flex row.

**4. Scope discipline — test first, harden only on failure.** Only if case 3 in the grouping test fails
do we touch grouping (e.g. decouple it from content-`h` by keying on `y`-top proximity, or clamp the
`h` used for band math). Do NOT pre-emptively redesign grouping — realistic 600px emails are mostly
full-width stacks with occasional equal-height 2-col rows, where the edge case rarely bites. Redesigning
it is beyond "make sure PDF/Outlook work."

## What does NOT change (confirmed, for Outlook specifically)

- Ghost-table column widths are `w`-driven (`colSpanToPx`) — unaffected by any `h` change.
- The MSO conditional-comment ghost tables, `msoFontPin`, and `emailHeadChildren` are unaffected — none read `h`.
- The SVG-icons-render-as-text Outlook fallback (`lib/email/CLAUDE.md`) and the social/footer roots are untouched.
- PDF is the **safest** engine here: `<Page wrap>` means tall auto-height content flows across pages
  and can never clip regardless of `h`.

## Spec corrections to fold back in (verbatim edits)

In **"Scope and blast radius"**, replace the "read only `x`, `y`, and `w` … never `h`" paragraph +
first bullet with an accurate statement: `h` is used in the output ONLY for grouping (never sizing);
`row-grouping.ts` DOES read `h` and is shared by the Outlook compiler AND the PDF engine; the free
renderer never groups. In **"Out of scope"**, change "the PDF export — untouched; they never read `h`"
to "the PDF export renders the same content-flowed blocks; it reads `h` only via the shared grouping
root, covered by the grouping-stability test above — not by a code change in the PDF engine itself."
Add the four Required-work items to the spec's **"Testing"** section.
