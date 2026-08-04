# HANDOFF — collapse the second HTML producer. Finish the June job.

**Written 08/04/2026.** Read `docs/standards/emails.md` §00 first — it is the map, and it already
carries the diagnosis. This file is the execution plan for the ONE thing §00 names as unfinished.

## Why this exists, in one paragraph

A convergence plan for exactly this merge already exists at
`docs/superpowers/plans/2026-06-16-deliverable-convergence/`. It did the hard half — extracted the
spine, froze ten goldens specifically to prove a collapse is behavior-preserving — then it was
declared green and abandoned. Two months later the leftovers were reported to the operator as
"three engines" and "two paths," as if the sprawl were a design. **Do not start a third design.
Finish this one.** If you cannot finish it, do not start it: leave the tree clean and add to this
file. A half-done refactor here is the exact failure being repaired.

## The target state

ONE thing turns structured content into HTML. Today there are two:

- `renderEmailDocHtml` (`lib/email/render-email-doc.ts`) — blocks → `compileGrid` → table HTML.
  Every block imports `lib/email/blocks/scale.ts`, so typography is enforced by construction.
- `renderGroundedReport` (`lib/deliverable/grounded-report.ts`) — **emits HTML as a string**, so it
  can never import `scale.ts`. Live in `app/p/[id]/page.tsx:457` (email skin) and
  `app/p/[id]/print/route.ts:67` (pdf skin).

Measured 08/03/2026 off `lib/email/__fixtures__/golden/branded.html`: font sizes 13px x8, 10px x6,
11px x4, 12px x3, 15px, 14px, 44px; weights 700 x9, 900, 800, 600. The scale defines seven sizes
(64/44/36/28/16/14/12) and three legal weights (400/500/600). That is the whole problem in numbers.

## Order of work

**Step 0 — the free win, do it first.** `reportToEmailHtml` (`lib/email/activation/render.ts`) has
**zero live callers** — verified by tree-wide grep over `{lib,app,scripts}`; only
`activation/render.test.ts` and the golden test reference it. Delete the wrapper and its test.
The goldens must move to calling `renderGroundedReport` directly, NOT be deleted — they are the
safety net for everything below. Expect green with no behavior change.

**Step 1 — make the debt measurable before changing anything.** Write a test that parses each
golden's HTML and asserts every `font-size` is in `TYPE` and every `font-weight` is in `WEIGHT`
(both from `blocks/scale.ts`). **It will fail. Do not commit it red** — commit it in the same change
as Step 2, so main is never broken. This is the guard that stops the next string-emitting renderer.

**Step 2 — make `renderGroundedReport` read the scale.** It keeps emitting strings; it just stops
inventing numbers. Replace every hardcoded px and weight with `text(role)` / `WEIGHT` lookups. The
role mapping is a judgment call — the big number is `metric`, section heads are `h2`, labels are
`caption`, the freshness line is `mono`. **The ten goldens WILL change here, and that is correct:
they are frozen against the pre-scale output.** Re-freeze them in the same commit and eyeball the
rendered diff — do not re-freeze blind.

**Step 3 — only if 0-2 landed clean.** Consider routing the share page through `EmailDoc` +
`renderEmailDocHtml` so there is literally one producer. This is the expensive half and it is
OPTIONAL; steps 0-2 already give "same rules everywhere," which is what was actually asked for.
Get operator sign-off before starting 3 — it changes what `/p/[id]` renders.

## Failure modes, each with its guard (RULE 3.5 — no design ships without this)

1. **The share page visibly changes and nobody notices.** → The ten goldens. Any diff in Step 0 is
   a bug; any diff in Step 2 must be reviewed by a human looking at the rendered page, not at a
   test result.
2. **The PDF diverges from the email.** `renderGroundedReport` takes `{skin: "email"|"pdf"}` and the
   pdf skin goes through `app/p/[id]/print/route.ts`. → Exercise BOTH skins in the Step-1 test.
   A green email skin proves nothing about the pdf.
3. **A role is mapped wrong and everything is technically legal but looks worse.** A test asserting
   "size is in TYPE" passes on a page where every heading is `caption`. → Guard is human review of
   the re-frozen goldens, not the test. Named here so nobody mistakes green for good.
4. **Someone adds a third string-emitting HTML producer next month.** → The Step-1 test must be
   written to walk the goldens directory, so a new golden is automatically covered. Also:
   `lib/templates/render-html-template.ts` (behind `/api/templates/render`) and
   `lib/insiders/teaser-split.ts` / `lib/email/weekly-read/issue.ts` are further string emitters
   that touch neither system. **Out of scope here — but do not let anyone tell you they are the
   same as this.** Open a check rather than widening this job.
5. **Deleting `reportToEmailHtml` breaks something a grep missed.** Dynamic imports and string-keyed
   dispatch do not show up in a symbol grep. → Before deleting, run `bunx next build` and the full
   `bun test lib/email` + `bun test lib/deliverable`, not just the touched files.

## Do not

- Do not override a repolith claim to edit a held file. On 08/03/2026 `doc/types.ts` and
  `doc/default-docs.ts` were both held; the stale comments in them are tracked as check
  `email_stale_tier_comments` instead. Same discipline here.
- Do not trust a comment as architecture. Every claim in this file was grep-verified 08/03/2026;
  re-verify before acting on it. That is the lesson that produced this file.

## Open checks touching this

- `email_stale_tier_comments` — 4 stale "paid grid / free tier" comment sites.
- `comp_email_font_scale_unverified` — the comps email's rendered output has still never been
  measured against the scale. Independent of this job; do not close it by doing this one.
