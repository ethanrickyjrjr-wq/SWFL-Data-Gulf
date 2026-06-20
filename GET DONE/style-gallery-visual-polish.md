# B2 Style Gallery — Visual Polish (saved local, NOT live)

Saved 2026-06-20 during a worktree cleanup. This work was sitting **uncommitted** in a stray
worktree and would have been lost in the prune — it's now committed to local branches so it
survives. **Nothing here is on `main` or live.** Land it when ready (see "How to land it").

---

## Saved artifacts — where "them" lives (LOCAL branches, this machine only)

Both are committed locally but **not pushed** — a fresh clone on another machine won't have
them. To make either portable, push the branch (operator's call).

| What | Branch | Commit | Notes |
|---|---|---|---|
| **B2 Style Gallery feature** (code) | `worktree-abstract-dreaming-origami` | `f973dcf2` | Worktree still checked out at `.claude/worktrees/abstract-dreaming-origami` — work there directly. 14 files, ~1,100 lines. |
| **Email-shell QA screenshots** (reference) | `wt/work` | `0dea55e6` | Cross-client render proofs (Gmail/Outlook/phone) + README under `tmp-email-review/email-layout-shells/`. Branch only, no worktree dir. |

Recover the screenshots if ever needed: `git show wt/work:tmp-email-review/email-layout-shells/README.md`
(or `git switch wt/work`).

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
`/project/[id]` — RULE 1 "ask for diff review before pushing." So: do the visual work in the
`.claude/worktrees/abstract-dreaming-origami` worktree, keep tests green, then bring it onto
`main` via review + `git push origin HEAD:main` on the operator's go (no autonomous push).

## Trigger to build

Before any real SEND of a styled deliverable goes out to a broker/prospect — the deliverables
need to look shippable first.
