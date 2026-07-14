# PDF/HTML visual-parity test — bugs found, handoff (07/14/2026)

**The ask:** build a regression test catching visual-fidelity drift between the PDF and HTML
renders of an `EmailDoc` (spec: `docs/superpowers/specs/2026-07-14-pdf-html-visual-parity-design.md`,
plan: `docs/superpowers/plans/2026-07-14-pdf-html-visual-parity.md`). Building the test *found a
real, previously-undetected bug* on its first real run. This is a handoff on that bug plus one
non-obvious technical finding from building the harness — read before touching `lib/pdf` or
resuming the plan.

---

## 1. The real bug: agent-hero photo renders at a different aspect ratio in PDF vs HTML

**`lib/email/blocks/AgentHeroBlock.tsx`** (HTML): the photo renders in a fixed `600×300` box
(`PHOTO_HEIGHT = 300`, `maxWidth: "600px"`) — a 2:1 aspect ratio.

**`lib/pdf/email-doc-pdf.tsx`**'s `agent-hero` case (PDF): the photo renders `width: "100%",
height: 200` inside a `View` with `padding: 0` (overriding `s.section`'s normal padding) — since
the LETTER page itself has no horizontal margin, that's the full page width (612pt) × 200pt ≈
3.06:1.

**Measured, not estimated:** rendering the same `EmailDoc` (one `agent-hero` block, a synthetic
400×100 test photo) through both engines and measuring the photo's actual rendered bounding box:
HTML ratio **2.00**, PDF ratio **3.06** — a 53% relative difference. This is not rendering noise
(anti-aliasing, font hinting) — it's two different fixed-dimension boxes, confirmed by reading
both files' style objects, not inferred from the pixels alone.

**Why this matters:** any agent-hero photo that isn't already cropped to roughly 2:1 will be
cropped **differently** in the email a recipient sees vs. the PDF they download/receive as an
attachment — the same photo, visibly different framing depending on which artifact you're
looking at. A portrait-ish or square headshot would lose noticeably more of its top/bottom in
the PDF version than in the email.

**Not yet fixed** — out of scope for the visual-parity build itself (that plan's Global
Constraints explicitly forbid touching `lib/pdf/email-doc-pdf.tsx` / `lib/email/blocks/**`). The
new test (`lib/pdf/__tests__/pdf-html-visual-parity.test.ts`, uncommitted) is currently RED on
this one case, by design — it's accurately reporting a real problem, not a flaky assertion.

**Fix options, not yet decided:**
1. Change the PDF's `agent-hero` `height: 200` → `height` computed from the actual page content
   width to preserve 2:1 (simplest, smallest diff, matches HTML's intent).
2. Change HTML's `AgentHeroBlock` to match the PDF's ~3.06:1 instead (bigger blast radius — every
   live agent-hero photo in every sent/scheduled email would reflow).
3. Pick a single shared ratio constant both engines read (the "one root" pattern used elsewhere in
   `lib/email` — e.g. `lib/brand/fonts.ts` for fonts) so this class of drift can't happen again for
   *any* image block, not just this one.

Option 1 is the obvious minimal fix; option 3 is the more durable one if this is worth doing
properly rather than patching the one instance.

## 2. Secondary finding (not a product bug, but real and worth knowing): Bun can't launch Playwright's browser on this machine

`chromium.launch()` hangs indefinitely when called directly from the Bun runtime on this
(Windows) box — verified with a minimal repro: the browser process actually starts (a real pid),
but Bun never completes the `--remote-debugging-pipe` handshake with it. Works fine under plain
Node. This is a known, unresolved upstream limitation — oven-sh/bun issues #27977, #23826,
#15679, #10120 — not something fixable with a Playwright launch option.

**Workaround already built and committed:** `lib/pdf/__tests__/rasterize.ts`'s `rasterizeHtml()`
spawns Node (`rasterize-html-worker.mjs`) as a subprocess instead of calling Playwright in-process.
PDF-side rasterization (`pdf-to-img` + `canvas`) has no such issue and stays in-process.

**Why this matters beyond this one test:** any *future* code that calls Playwright directly from
a `bun:test` file (or any bun-run script) on this machine will hang the same way. If someone hits
a mysterious test timeout involving Playwright, check whether it's this — the fix is always "run
the Playwright call under Node, not Bun," same pattern as the worker script here.

## 3. Current implementation state

Committed (`main`, this session): dependency install + smoke test (`a1bf6907`), `pixel-utils.ts`
primitives (`08c034cd`), fixtures (`fa348fe2`), rasterization wrappers + the Bun/Playwright
workaround (`0d550101`), plan amendment (`6a554472`).

**Not yet committed:** `lib/pdf/__tests__/pdf-html-visual-parity.test.ts` — contains the Layer 1
(region-strict) + Layer 2 (full-page loose) checks for both fixtures, plus the page-break-bleed
check. Current run: **4 pass, 1 fail** — the agent-hero Layer 1 case above. Everything else is
clean:
- Header logo fixture: HTML/PDF ratio match exactly (4.00 vs 4.00), full-page diff 2.0%.
- Agent-hero full-page loose check (Layer 2): passes (16.6% diff, well under the 50% ceiling) —
  the coarse tripwire isn't sensitive enough to catch this on its own, which is exactly why the
  region-strict layer exists.
- Page-break-bleed check (bug from a *different*, already-fixed incident — `PAGE_TOP_PAD` margin
  math): passes (page 2's content starts 53px from the top, comfortably clear of the 24px floor).

Plan Tasks 6 (page-break check — already written, folded into the same file above) and 7
(full-suite verification, `bunx next build`, SESSION_LOG entry) are not done. Nothing has been
pushed; operator asked to review the diff before any push.

## 4. What's NOT a gap (don't re-litigate)

- The header-logo fixes (`objectFit: "contain"`, `alignItems: "flex-start"`, `PAGE_TOP_PAD`) that
  motivated this whole test suite are confirmed still correct — that's what the passing header
  fixture and page-break checks are proving.
- This is not a flaky test or a tolerance-tuning problem. The plan's own Task 5 instructions
  anticipated needing to *widen* tolerances for systematic rendering noise — a 53% aspect-ratio
  difference from two different hardcoded box dimensions is not that case, and the tolerance was
  deliberately left at 5% rather than loosened to hide it.

## 5. Recommended order

1. Decide which fix option from §1 to take (recommend option 1 for a minimal fix, or option 3 if
   this is worth doing once for every image block rather than per-instance).
2. Fix `lib/pdf/email-doc-pdf.tsx`'s `agent-hero` case accordingly — this is the one place the
   visual-parity plan explicitly deferred, so it's a separate, small, focused change, not a
   continuation of that plan.
3. Re-run `lib/pdf/__tests__/pdf-html-visual-parity.test.ts` — it should go fully green once the
   box dimensions agree; no test code changes needed, it already measures the right thing.
4. Resume the visual-parity plan at Task 7 (full-suite + `bunx next build` + SESSION_LOG) once
   the agent-hero fix lands and the suite is green.
