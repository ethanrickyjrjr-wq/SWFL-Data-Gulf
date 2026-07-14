# Handoff — The layout root landed. Now make an email that USES it.

**Date:** 07/14/2026 · **Branch:** main · **Status:** Phase 3 (the seam) SHIPPED and green.
**Phase 4 — the thing that actually changes what a user sees — NOT started.**

---

## Read this first, or you will redo work that is already done

The seam exists. `lib/email/doc/finalize-doc.ts` is the ONLY code in the repo that writes an
`x` or a `y`. Every listing email and the AI author now end there. **Do not build another one,
do not "improve" a builder by hand-positioning it — there is a red test waiting for you.**

**And know what Phase 3 did NOT do: it did not change how a single email looks.** That was
deliberate, and it is the whole reason Phase 4 exists.

---

## The one thing to understand before you touch anything

`finalizeDoc` positions **what the plan tells it to.** Feed it twelve entries that all say
`span: 12` and you get a flat stack of full-width cards out the other end — the exact email you
had before, now blessed by the design system.

**The seam did not buy the layout. It bought the ABILITY to have one.**

Every listing email today is still `span: 12`, top to bottom. `buildLifecycleEmail`
(`lib/email/lifecycle-chrome.ts`) emits ten full-bleed rows. It *can* now say `span: 6` — it
just doesn't. **Making it say so is Phase 4, and it is a design decision, not a refactor.**

That is the trap this handoff exists to disarm: a future session reads "one layout root, all
paths converge, 2,731 tests green" and concludes the layout problem is solved. It is not. The
plumbing is solved. **The emails are still a stack of cards.**

---

## What landed (Phase 3) — the facts, so you don't re-audit them

### `lib/email/doc/finalize-doc.ts` — the seam

`finalizeDoc(plan) → EmailDoc`. Applies, in this order: block cap (the CAN-SPAM footer always
survives) → zone sort (open leads, close trails, footer absolute-last) → row grouping → blessed
spans → positions. A builder hands it a `PlanEntry[]`: `{type, span, newRow, props, height?, id?, isStatic?}`.
**Note what is absent: `x` and `y`.** A builder has no vocabulary for them.

### The height policy — there is exactly one, and it is not negotiable

`row-grouping.ts` groups blocks into a visual row by **band overlap** (`y < rowBottom`). So the
invariant that must hold is: *a row's band may never overlap the next row's band.* Two schemes
satisfied it independently before the seam existed:

- the AI author — `y = row index`, `h = 1` (uniform advisory; email height is content-driven)
- lifecycle — `y` accumulates by a real 1–6 height

**Mixing them would have silently merged the header and the ribbon into a two-column row.** The
unification: `height` is OPTIONAL on a plan entry, defaults to 1, and `y` advances by the row's
TALLEST entry. A plan with no heights reproduces the author's ladder exactly; a plan carrying
real heights reproduces lifecycle's stack exactly. **Do not add a second height policy.**

### The one visual change Phase 3 made, and only one

A `sources` block is a CLOSE-zone block. `lifecycle-chrome` used to place its `tail` *above the
agent card*; the seam's zone fence sorts it to **just above the footer** — where the design system
always said sources go, and where the AI author has always put them. Affects `coming-soon` and
`market-comps` (the only two recipes with a tail). **Verified in the rendered HTML, not just in a
test.** Everything else renders byte-for-byte as before.

### The enforcement — why "no one builds a new one" is now true

`lib/email/design-system-reachability.test.ts`, and read *why* it is shaped this way:

**A flat `w:12` stack is PERFECTLY conformant.** Every row sums to 12. It passes any structural
assertion you can write — and it is exactly the email the layout system exists to eliminate. So
the guard does not test shape. It tests **provenance**:

1. **The marker (runtime).** `finalizeDoc` stamps every doc it returns with a Symbol — dropped by
   `JSON.stringify` (never reaches the database or the schema) but carried through the `{...doc}`
   spreads every recipe does. A doc without the stamp was hand-assembled, however good it looks.
2. **The ledger (source).** `KNOWN_BYPASS` — the exact 14 files still allowed to write a `layout`
   literal. **It may only shrink.** A new file that hand-positions fails the test. There is also a
   test asserting every ledger entry *still bypasses*, so a stale exemption can't rot into a hole.

And the failsafe that makes bypass pointless rather than merely forbidden: `row-grouping.ts:46`
sinks any unpositioned block to `y = 1_000_000` — below the footer, in **both** the HTML and PDF
engines. A builder that skips the seam ships a visibly broken email.

---

## Phase 4 — THE JOB. Make the campaign use its columns.

**Checks:** `email_lifecycle_uses_grid_columns` (opened 07/14/2026) ·
`email_design_system_one_exit_seam` (closed by Phase 3).

**One file: `lib/email/lifecycle-chrome.ts`.** That is the entire blast radius. It is now the
single author of all seven listing emails' shape, so a span change there changes the campaign —
which is exactly why it must be a deliberate, operator-approved design pass and not a drive-by.

Today's spine, all `span: 12`:

```
header · ribbon · photo · hero(address/price) · spec-strip
       · [recipe middle] · narrative · agent-card · CTA · [sources] · footer
```

The obvious candidates — **do not just implement these, show them to the operator first:**

- **agent-card + CTA on one row** (`{8,4}` or `{7,5}`). Today they are two stacked full-width
  cards for one idea ("here's me, here's the ask"). This is the cheapest real win.
- **photo + hero side by side** (`{7,5}` / `{6,6}`) — a listing flyer's actual grammar, instead
  of a photo the reader must scroll past to reach the price.
- **the spec strip** already reads as one row internally; it does not need a span change.

**`{8,4}`, `{7,5}`, `{6,6}` are blessed spans** — `BLESSED_ROW_SPANS` in `doc/block-contract.ts`.
Anything else gets snapped to the nearest blessed multiset, so you cannot invent a row shape.

### The rule you must not break while doing it

**"KEEP EVERYTHING WE HAVE AS A CHOICE — additive, more options, not different ones."** (Operator
ruling; also `showcase_designs_buildable_as_options`.) The 27 starter templates are hand-designed
layouts the operator owns as CHOICES — they already carry ~14 real multi-column rows and they are
**not** the layout problem. Do not collapse them onto one look. Phase 4 is the *campaign chrome*
only.

### How to know if you succeeded

Not a green test. **Render them and look:**

```
bun scripts/dev-render-listing-emails.mts     # 7 emails, real 326 Shore Dr data, zero model calls
```

⚠️ **Run it WITHOUT `--env-file`.** Bun's `.env` overrides the shell, so `ANTHROPIC_API_KEY` gets
picked up anyway and the narrator fires for real money (this bit me on 07/14 — seven live calls).
The deterministic path is the point of the script.

Output lands in `public/dev-emails/*.html` (gitignored). `file://` URLs are blocked in the browser
tool — serve them: `python -m http.server 4599` from that directory.

**Recapture the showcase tiles after ANY visual change:** `bun scripts/capture-seed-previews.mts`.
They are committed screenshots and `seed-previews.test.ts` only guards their EXISTENCE, not their
freshness. A stale tile is what produced the luxury-ring incident — the operator saw a broken email
that had been fixed three days earlier.

---

## Still bypassing the seam (the ledger, and it may only shrink)

Three recipes still carry a private `push()` closure and hand-position:
`sphere-weekly.ts` · `review-reply.ts` · `agent-brand-intro.ts`.

**`sphere-weekly` is the interesting one** — it already emits a real `{6,6}` row
(`sphere-weekly.ts:1073-1074`), by hand. It is proof the columns are wanted and proof nobody had a
seam to ask for them. Convert it and you delete the hand-math, not the design.

Also outstanding, and it is a real gap: **`AUTHOR_TOOL`'s stats schema (`author-doc.ts`) has no
`emphasis` property**, so the AI author can never mark a number as important. `emphasis` is
recipe-only vocabulary today. The dial works (Phase 1+2 fixed it running backwards). The model
just can't reach it. Decide that deliberately.

---

## The lesson, stated once

Phase 1+2 made the type scale executable. Phase 3 made the layout system reachable. **Neither
changed what a user sees, and that was correct both times** — you cannot redesign on top of a
system that isn't binding, because you can't tell your change from the drift.

The system now binds. **Phase 4 is where it finally pays.** Don't stop at green.
