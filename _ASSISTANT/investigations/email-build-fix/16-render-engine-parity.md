# Lane 16 — Re-verify the three-render-engine font/style divergence

Goal: confirm/refute the 20-day-old memory that `compile-grid.ts` (grid tier) emits an
empty `<Head>` (no web-font `<link>`), diverging from the free-tier renderer. Also check
the PDF engine for the same class of divergence. Report CURRENT verified state.

## What I checked (file:line)

### 1. Free-tier renderer — lib/email/blocks/EmailDocRenderer.tsx
- Line 12: `<Head>{emailHeadChildren(doc)}</Head>` — injects the web-font `<link>` set.
- Line 15: `{msoFontPin(doc)}` — Outlook `[if mso]` font pin at body top.
- Both come from the shared root `lib/email/blocks/email-head.ts` (imported line 7).

### 2. Grid-tier compiler — lib/email/compile-grid.ts  (NOTE: file is at lib/email/,
    NOT lib/email/blocks/ as the starting map stated)
- Line 57: imports `emailHeadChildren, msoFontPin` from `./blocks/email-head` — SAME root.
- Line 195: `createElement(Head, null, ...emailHeadChildren(doc))` — Head is POPULATED
  with the web-font links, NOT empty.
- Line 199: `msoFontPin(doc)` injected as first Body child — identical to free tier.
- Outer shell (Html/Head/Body/Container, lines 192-206) mirrors EmailDocRenderer.

### 3. Shared font-head root — lib/email/blocks/email-head.ts
- Header comment (lines 4-6) EXPLICITLY documents the fix:
  "built in one place so the two paths cannot diverge again (the pre-wave-2 bug: flow had
  the webfont <link>, grid emitted an empty Head)."
- `emailHeadChildren` (38-47): dedup'd `<link rel=stylesheet>` for each family with a
  `webfontUrl`. `msoFontPin` (51-62): `[if mso]` pin forcing safe stacks in Outlook.

### 4. Engine selection — lib/email/render-email-doc.ts
- Line 23: `isGridDoc(doc.blocks) ? compileGrid(doc) : render(EmailDocEmail({doc}))`.
- ONE root; both preview and send go through it (comment lines 5-8 note the earlier
  blast-vs-preview divergence, now closed). So grid + free are font-parity by construction.

### 5. PDF engine — lib/pdf/email-doc-pdf.tsx
- Uses `pdfFont(family)` = `BRAND_FONTS[family].pdf` (lines 34-36), a @react-pdf BUILT-IN
  ("Helvetica" | "Times-Roman"). This is NOT a web font and never will be — documented
  constraint (lines 13-14: "Built-in fonts only — no network font fetch").
- BRAND_FONTS (lib/brand/fonts.ts 34-81): serifs (BOOK_SERIF, PLAYFAIR_SERIF) → Times-Roman;
  all sans → Helvetica. displayFont resolved the same way (line 66). Coherent from the one
  root; the header comment even notes PLAYFAIR_SERIF now correctly lands on Times-Roman
  (previously fell to Helvetica) — that regression is already fixed.

## Verdict
The stale memory claim is **FALSE as of current code.** The grid-tier `<Head>` is populated
with the exact same web-font `<link>` set and MSO pin as the free tier, both sourced from the
single `email-head.ts` root. The "empty Head" bug was fixed (wave 2, spec 2026-07-02) and is
guarded by the shared root. No font/style divergence exists between the two HTML engines.

The PDF engine intentionally uses @react-pdf built-in fonts (Helvetica/Times-Roman) — a
documented platform constraint, not a silent fallback bug; the serif/sans mapping is correct.

This lane finds **no font root cause** for the confirmed build bug (missing hero photo /
generic ZIP email). Font parity is intact across all three engines. The build failure lies
elsewhere (recipe routing / listing-context loading lanes).

## Minor, non-font note (out of lane, flagged for completeness)
`compileGrid` does not emit a `<Preview>` preheader, while `EmailDocEmail` accepts one — but
`renderEmailDocHtml` calls `EmailDocEmail({doc})` with no `preview` arg, so BOTH paths omit
the preheader in production today. Not a divergence in practice, not font-related.
