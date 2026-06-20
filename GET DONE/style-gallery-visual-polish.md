# B2 Style Gallery — Visual Polish (backed up to origin, NOT live)

Saved 2026-06-20 during a worktree cleanup. This work was sitting **uncommitted** in a stray
worktree and would have been lost in the prune — it's now committed **and pushed to `origin`**
so it survives and is reachable off-machine. **Nothing here is on `main` or live.** Land it
when ready (see "How to land it").

---

## Saved artifacts — pushed to origin (available off-machine)

Both are committed AND on `origin` — `git fetch` on any machine, then `git switch` the branch.
These are **intentional, operator-directed backup branches — NOT litter; do not auto-prune.**

| What | Category | Branch (on origin) | Commit |
|---|---|---|---|
| **B2 Style Gallery feature** (code, ~1,100 lines) | work to handle (needs reconcile + polish) | `wip/style-gallery-visual-polish` | `f973dcf2` |
| **Email-shell QA screenshots** (reference) | off-machine backup, no action needed | `archive/email-shell-screenshots` | `0dea55e6` |

Access from another machine:

```
git fetch origin
git switch wip/style-gallery-visual-polish     # the feature, to continue/polish
git switch archive/email-shell-screenshots     # screenshots under tmp-email-review/email-layout-shells/
```

**Heads-up — this branch is ~240 commits behind `main`.** It edits
`app/project/[id]/ProjectDetail.tsx`, which `main` has since refactored into `ProjectWorkspace`
(per the FINAL BOSS Piece 1 work). So landing it is **not just visual polish — it needs
reconciliation with the current codebase first.** The branch preserves the work exactly as
saved; don't rebase it blindly into the refactor.

---

## What the Style Gallery is

In-product gallery at `/project/[id]` (`StyleGallery.tsx`) — 3 tabs (Email / PDF / Website),
live iframe thumbnails, click-to-zoom, per-lane actions (Email → "Send to me", PDF → "Open as
PDF", Website → "Build this style"), and a "Create In Your Brand Colors and Logo!" teaser. One
brand-agnostic engine (`renderHtmlTemplate(slug, tokens)`) re-skins every template from the
project's brand (primary/accent color + logo).

**Status: plumbing built, tested (12 green), on disk — but the operator looked at the rendered
output and said "I can't ship this."** The gap is **visual quality**, not architecture.

## What's needed to get it done (the actual task)

Make the templates + gallery look like a premium SWFL Data Gulf product, NOT a generic stock
template — without breaking the token system, the tests, or email/print compatibility:

1. **Kill the generic finance-demo data** (the #1 problem). Shells ship "Total Portfolio
   Value / $4.2M / 847 ZIPs", "Revenue by Region: Northeast/Southeast/Midwest", non-FL ZIPs
   (100xx–129xx). Replace with believable SWFL: median sale price / ZHVI, median rent (ZORI),
   avg annual flood loss, permits, vacancy, AADT, TDT — at Lee/Collier ZIP/corridor grain
   (Fort Myers 33901, Cape Coral 33914, FMB 33931, US-41, Colonial, Pine Island Rd…).
2. **Readable thumbnails** — a 600px email / letter doc scaled to ~248px is microscopic; crop
   the hero region or render larger.
3. **Real logo lockup** (the default renders as a tiny 28px square).
4. **Premium chrome** — type scale, spacing, charts to match the brand kit
   (`docs/fiverr-briefs/assets/`) and the already-good `templates/html/viz/*` (the quality bar —
   consider featuring the viz cards in the gallery).

**Visual feedback loop:** `bun scripts/preview-style-gallery.mts` writes
`style-gallery-preview.html` (open in a browser — no app/env needed). Regenerate after each
change and judge: *does this look shippable?*

## Hard guardrails (breaking any of these breaks the system)

- Keep the `{{TOKEN}}` system — never hardcode brand colors/fonts/logo (sample DATA may be
  hardcoded). New token → add it to `lib/email/templates/preview-brand.ts` + `templates/html/README.md`.
- Email = inbox-safe: inline CSS, table layout, ≤600px, no `<style>` / JS / external fonts.
- Shells keep CAN-SPAM tokens (`{{{RESEND_UNSUBSCRIBE_URL}}}`, `{{PHYSICAL_ADDRESS}}`) — the
  broadcast route hard-blocks without them.
- Doc templates keep `@media print` (PDF is `window.print()`, letter-size).
- Keep `bun test lib/email/templates "app/project/[id]"` green (12 tests).
- Builds are free; SEND is the only paywall — no payment gate.
- Don't touch the plumbing (render pipeline, routes, gallery data flow) — restyle only.

Full self-contained brief (in the saved commit):
`docs/superpowers/plans/2026-06-15-B2-style-gallery-visual-handoff.md`.

## How to land it

Touches live `/api` surfaces (`app/api/email/test-send`, `app/api/projects/[id]/print`) and
`/project/[id]` — RULE 1 "ask for diff review before pushing." So: `git switch
wip/style-gallery-visual-polish`, **reconcile with current `main` first** (the ProjectDetail →
ProjectWorkspace refactor — see the heads-up above), do the visual work, keep tests green, then
bring it onto `main` via review + `git push origin HEAD:main` on the operator's go (no
autonomous push).

## Trigger to build

Before any real SEND of a styled deliverable goes out to a broker/prospect — the deliverables
need to look shippable first.
