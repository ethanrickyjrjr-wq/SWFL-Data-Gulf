# The Social Design Root — handoff (07/14/2026)

**Shipped:** `7fba5b72` · `6226906d` · `ce697d14` (on `main`).
**Sibling:** `docs/superpowers/handoffs/2026-07-14-email-design-root-handoff.md` (`1aad57ca`, same
day, different session — read both; they are two halves of one problem).
**Amends:** `docs/superpowers/specs/2026-07-14-social-design-elevation-round2.md` (Section A
superseded, in place).

---

## The finding, in one line

**Every unbranded social post we have ever rendered shipped in a teal that is not our teal.**

The canvas accent defaulted to `#0ea5b7`. The brand teal is `#3dc9c0`. Nobody chose `#0ea5b7` —
someone typed a teal from memory, three more files copied it, and **no test held it**
(`design/__tests__/tokens.test.ts` asserts `surfaceDark` and never asserts the accent). That is how
it survived to production.

## The root cause is structural — which is why "be more careful" was never going to fix it

`app/globals.css` **is** the brand root, and it says so in its own comment:

> *"Every interactive element must use these tokens, NOT the raw hex. Changing --gulf-teal cascades
> here automatically — zero manual find-and-replace ever again."*

That promise held for the DOM and **broke everywhere else**, because a canvas has no cascade, resvg
has no cascade, and an email client has no `var()`. **There was no importable palette.** So every
image-rendering path re-typed it by hand — and `lib/charts/social-card.ts` documented the workaround
instead of fixing it:

> *"Verbatim --gulf-teal (app/globals.css:14). SVG can't resolve CSS vars."*

That comment is the whole disease in one sentence: a correct diagnosis, and a copy as the cure.

**Five paths render a social image**, each with a private palette: `lib/social/design/templates.ts` ·
`lib/social/render-social-image.ts` · `lib/charts/social-card.ts` · `lib/social/chart-svg.ts` · the
Konva composer. The house navy existed as both `#0f1d24` and `#0a1419` depending on which one you
were in.

## What landed

**`lib/brand/tokens.ts`** — the palette, importable. `BRAND.teal`, `BRAND.deep`, `BRAND.sand`…
`tokens.test.ts` parses the **real `globals.css` off disk** and fails on drift **in both
directions**, so the two cannot diverge and "add it to globals.css first" is an enforced instruction
rather than a hope. `globals.css` stays the human-facing root; this is its machine-readable face.

**`lib/social/design/system.ts`** — the sibling of email's `scale.ts`. Same construction, different
numbers. It shares the two things that must never fork (the palette; the WCAG math in
`lib/charts/palette`) and keeps local the one thing that must not be shared (the px — a 1080 canvas
and a 600px email do not transfer).

Two rules kill the bug class by construction:

1. **`type(role, format)` returns fontSize AND lineHeight AND fontWeight TOGETHER.** There is no
   accessor that lets you pick a size and forget the leading — the omission that clipped every stat
   in email. (Independently, this is the W3C Design Tokens composite `typography` token. We arrived
   at the spec's own shape without knowing it; that's validation, not a reason to adopt the
   toolchain.)
2. **`ink(role, theme, on)` / `accent(role, theme, on)` return a colour already contrast-checked for
   that role.** `CONTRAST_FLOOR` binds a WCAG floor to each role and `legibleInk` demotes anything
   that misses. **Unreadable is unreachable.**

**The fence:** raw hex under `lib/social/design/**` + `components/email-lab/social/**` is an ESLint
error (`no-restricted-syntax`, zero new deps — mirrors the repo's own untyped-Supabase ban). Verified
it **fires** by feeding it `#0ea5b7`. No allowlist; none expected.

**The rules:** `lib/social/CLAUDE.md`, wired into `inject-focus.mjs` so it loads on every edit here.

---

## Two things the Round-2 spec got wrong (it is amended in place — Sections B/C stand)

**1. Its light-theme accent is only half-right, and the wrong half would have shipped.**
The spec calls `#2a8c85` "the tested default" for light-theme numbers. Measured (WebAIM — and our own
`contrastRatio` reproduces its published figures exactly):

- `#2a8c85` on sand `#f0ede6` = **3.46:1** → clears WCAG AA **large text (3:1)**, **fails normal text
  (4.5:1)**. **Legal as a metric number. Illegal as a label.** The spec never split those.
- `#3dc9c0` on sand = **1.74:1** → fails even the large floor. **Decorative only** — a CTA fill or a
  chart stroke, never a word.
- The spec's *"CTA fill always stays full accent regardless of theme"* is **verified**: teal fill with
  `--text-on-accent` ink is **9.15:1 on either canvas.**

Because the floor is bound to the ROLE, **nobody has to remember which case they're in.**

**2. Its theming approach was the bypass pattern itself.** The spec prescribes "simple per-field
ternaries" in every template. Across 7 templates × N fields, a template can still pick a wrong
colour and nothing catches it — that is precisely the failure this whole effort exists to kill.
Replaced by role-resolved colour: no ternaries, no hex, no theme branch per field.

**Its tokens mostly already existed.** `PANEL` (`#1c3340`) is `--gulf-slate-hi`. `ACCENT_DIM`
(`#2a8c85`) is `--gulf-teal-dim`. The sand surface is `--text-primary`. Design read our palette
correctly; the spec just didn't know it was already there. Only `PANEL_LIGHT` was genuinely new (now
`--gulf-sand-panel`).

---

## The trap this handoff exists to prevent

`min(W,H)` was costing landscape **~42% of its type size**. Landscape (1200×630) is the only format
where height < width, so it alone sized off 630: a `0.028` label rendered **30px on square and 18px
on landscape** — roughly 7pt once a phone downscales the feed image.

**Killing it inverts the bug.** Pure width-scaling hands landscape a 1.11× uplift — typographically
correct (it displays wider) and a trap, because landscape is the **short** canvas:

```
landscape content box = 462px (630 - 2×84 margin) — the tightest we have; story's is 1651
headline(2 lines) + body(2) + CTA   @1.11× = 568px   OVERFLOWS by 106px
                                    @1.00× = 517px   OVERFLOWS by  55px
                                    compacted = 414px   FITS
```

So `widthScale` is **capped at 1.0**: never scale type UP into a shorter canvas. Landscape gets a
square's px, which still kills the 42% shrink.

**And the guard was vacuous.** `system.ts` claimed "the bounds test fails a stack that does not fit"
— but `type()` has **zero consumers today** (templates still run `base * multiplier`), and every
bounds test in the repo exercises the **old** sizing. Round 2 could have migrated, watched the old
tests stay green, and shipped landscape posts running off the canvas. Fixed: the constraint is now a
real primitive — `contentHeight()` / `stackHeight()` / `fits()` — with tests asserting a full stack
does NOT fit landscape and DOES fit square.

> **If you do one thing from this document:** when Round 2 migrates the templates, **write the
> landscape bounds test against the new system.** The existing ones will lie to you.

---

## What is NOT done (all are `checks` — RULE 2.4, nothing parked in prose)

| check | what |
|---|---|
| `social_templates_migrate_to_type_system` | The 5 templates still run `base * multiplier`. Round 2 rebuilds all 5 anyway (theme + chart) — migrate there. **Landscape bounds test is definition-of-done.** |
| `email_blocks_colour_unfenced` | **The biggest one.** Email's `scale.ts` fixed TYPE and its header says it does NOT govern colour. Measured after it landed: `lib/email/blocks/*` holds **30 distinct raw hexes, and only 2 are brand tokens.** The root now exists and email doesn't read it. |
| `brand_has_no_grey_scale` | **The blocker inside the one above.** Most of those 30 are neutral greys, and the brand has **no grey ramp** — so four paths each invented one (`#9CA3AF`, `#6B7280`, `#E5E7EB`…). Adding a ramp is a **design decision, operator/Design call** — not a refactor. Pick it first or the colour work stalls halfway. |
| `email_social_share_type_root` | **Unblocked** — email's `scale.ts` landed. Its `WEIGHT` ladder (600/500/400/500) is **byte-identical** to social's. Extract WEIGHT + the composite shape. **Do NOT unify the px or the role names** — a canvas has no `h2`, an email has no display-stat. |
| `social_card_reads_brand_root` | **Unblocked** — claim released. `TEAL`/`NAVY` are byte-identical to brand tokens: a pure dedupe, zero appearance change. Its `GREY` waits on the ramp. |
| `social_render_engine_off_system` | `render-social-image.ts` still runs a **second** type scale off a different base. Migrating is safe (it already scales off width) but it **is** an appearance change to the brain-data cards — operator look first. |

---

## Live appearance changes in this push (the operator approved these; flagging so nobody is surprised)

- Unbranded social accent: `#0ea5b7` → `#3dc9c0`. **Branded projects are unaffected** — this only ever
  governed the fallback.
- Unbranded social text: `#ffffff` → `#f0ede6` (the house sand, `--text-primary`). White was another
  off-palette value.
- Konva chart-loading placeholder: `#1f2d36` → `--gulf-slate-hi`.

## Two tests caught the author, which is the point

- `--text-tertiary` is **4.23:1** on its own dark canvas. It was assumed to be the safe muted ink; it
  is **large-text-only everywhere**. (`--text-secondary` is the safe one, 8.29:1.)
- `legibleInk` was demoting social labels to email's `#111827` grey — a non-brand colour sneaking in
  through the *fallback*. Fixed by letting it take its neutrals (additive; email's defaults
  unchanged). **A second copy of a fallback is a second brand.**

## Research (crawl4ai, two Sonnet passes — RULE 0.4)

**Rejected, deliberately:** Style Dictionary, DTCG JSON files, stylelint. All solve *multi-platform
fan-out* (one JSON → iOS + Android + CSS). We have **one platform: TypeScript.** They would add a
build step and a generated-vs-source problem to produce the module we hand-wrote better — ours has
*functions* (`compact()`, `fits()`) a token pipeline cannot express. `eslint-plugin-design-tokens`
**does not exist** (npm 404) — don't go looking for it.

**The argument, from IBM Carbon** (carbondesignsystem.com/elements/color/usage):

> *"You cannot implement light or dark mode without using color tokens everywhere in your product.
> **Hard coded values will not change when the mode is switched.**"*

That is mechanical, not stylistic. A raw hex is **invisible to the theme switch**.

**And the thing no source-level lint can ever catch:** the bug that actually bit email was an
*absent* `lineHeight` silently inheriting an injected 24px box. **No linter can see a number that
isn't in the source.** The lint is fast local feedback; **the test on real output is the safety net.**
Build the test first.

## The rule that generalizes

**Extract on copy #2.** A second copy of a fallback is a second brand. If you are about to hand-type
a value that already exists somewhere else in this repo, you are not saving time — you are choosing
which of the two will be wrong later.
