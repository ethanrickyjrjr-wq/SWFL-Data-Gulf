# Email accent-ink family + save-time palette gate — design

**Date:** 2026-07-09 · **Check:** `email_accent_ink_palette_gate` · **Status:** DECISIONS RATIFIED
07/09/2026 (operator: "good with your §4 ideas") — D1 warn-only, D2 form + pure evaluator, D3 WCAG
AA floors, D4 sequence as written. Build registered as `email_accent_ink_palette_gate_live_verify`
(spec already existed, so the check was opened directly — `new-build.mjs` would have stubbed over
this file). Next step: implementation plan, after `email_contrast_ink_fence` lands.

**Grounding:** every file:line and ratio below probed/computed this session (RULE 0.5) — ratios via
the repo's own `contrastRatio` (`lib/charts/palette.ts:51`). WCAG thresholds verified in-session
from WebAIM (https://webaim.org, quoting WCAG 2.1 verbatim) per RULE 0.4.

---

## 1. Problem

Two related defect families, one deeper class:

**Family A — brand color used as ink with no contrast guard.** `legibleAccent()`
(`lib/email/blocks/on-dark.ts:23`) exists for exactly this but is applied only on dark-band
(`onDark`) branches of five blocks. Everywhere else brand colors render as ink raw:

- Accent ~ primary brand → tagline (`HeaderBlock.tsx:51`) and designation (`AgentHeroBlock.tsx:80`)
  render accent ON the primary fill: **1.00:1 (invisible)** when equal, 1.16:1 for
  cream-on-pale-gold.
- Pale accent → CTA links on white/light surfaces unreadable. **The house DEFAULT fails this
  today:** default accent `#3DC9C0` = **2.04:1 on the white card** (`AgentHeroBlock.tsx:115`,
  `AgentCardBlock.tsx:85`, `ListingBlock.tsx:112`, `SourcesBlock.tsx:53`) and **1.95:1 on the
  footer's `#F9FAFB`** (`FooterBlock.tsx:87,98`). Two committed seed accents also sit below the
  4.5:1 normal-text floor on white (`#B8860B` 3.25:1, `#C17B3E` 3.40:1).
- Pale primary → `ListingBlock.tsx:76` renders the price in `primaryColor` on white (22px/700 =
  large text, 3:1 floor — pale-gold primary `#F5E6C4` ≈ 1.2:1 fails even that).
- Inverse case → `ListingBlock.tsx:59-60` hardcodes dark ink `#06231f` on the ACCENT fill (badge
  chip); a dark-navy accent makes it invisible. Same class as the white-ink trio in
  `email_contrast_ink_fence`, opposite polarity.

**Family B (the deeper class) — nothing gates a SAVED brand palette whose own pairs fail.** A user
saves pale-gold primary + cream accent in the ONE brand form (`components/brand/BrandingBlock.tsx`,
palettes on `user_brand_profiles.color_palettes`); every surface degrades at once and nothing tells
them. Fixing render sites one-by-one is whack-a-mole without (a) one shared primitive and (b)
feedback at the palette source.

The fence spec anticipated this: `2026-07-08-email-grid-fence-system-design.md:184-186` — "none of
Fences 1–5 check color contrast … follow-up fence (contrast-checked band/text pairs) once Fences
1–5 ship." **This design is that follow-up — Fence 6.**

## 2. Outside facts (WebAIM, quoting WCAG 2.1)

- **SC 1.4.3 (AA):** text needs **4.5:1**; large text (18pt+, or 14pt+ bold) needs **3:1**.
  Logotypes and pure decoration are exempt. Our 12–13px taglines/designations/links are NORMAL
  text → 4.5:1 territory; the 22px/700 price is large text → 3:1.
- **SC 1.4.11 (AA):** non-text UI components/graphics need **3:1** against adjacent colors (accent
  borders, social icons, badge fills).
- **Color-only links:** a link identified by color alone (our CTA links set
  `textDecoration: "none"`) needs 3:1 against the surrounding body text plus a non-color cue.
  Noted as a follow-up consideration, not gated here.
- `legibleAccent`'s current **3:1 floor is the large-text/non-text floor** — right for borders and
  big numerals, thin for 12px functional text.

## 3. Design — two halves of one fence

### Tier A — render-time guards (legibility by construction)

Structural-guarantee philosophy: after Tier A, NO palette can produce unreadable ink — a bad
palette costs brand flair (accents quietly fall to a neutral), never legibility.

**One primitive, generalized in place** (`lib/email/blocks/on-dark.ts`):

```ts
/** Keep `preferred` ink when it clears `floor` on `bg`; else fall to the readable
 *  neutral FOR THAT BG (white on dark, #111827 on light) via readableLabel. */
export function legibleInk(preferred: string, bg: string, floor = 3): string;
```

`legibleAccent(accent, bg)` becomes `legibleInk(accent, bg, 3)` with the fallback switched from
unconditional white to the directional neutral. **Backward-compatible by math:** all five existing
call sites (`HeroBlock:23,39`, `MultiColumnBlock:107`, `SignalBlock:41`, `MetricCardBlock:30`,
`ListBlock:56`) invoke it only under `onDark`, where the directional neutral IS white. The
directional pick reuses `readableLabel` — the same root `readableText`
(`lib/email/templates/components/_shared.ts:40`) and the item-1 badge precedent build on, so both
checks converge on ONE ink-pick root instead of forking.

**Site rewiring (the audit table — every raw brand-ink site found):**

| Site | Ink on bg | Role → floor | Fix |
|---|---|---|---|
| `HeaderBlock.tsx:51` tagline | accent on `bgColor ?? primary` | 12px text → 4.5 | `legibleInk(accent, bg, 4.5)` |
| `AgentHeroBlock.tsx:80` designation | accent on primary | 12px text → 4.5 | same |
| `AgentHeroBlock.tsx:115` CTA link | accent on white card | 13px text → 4.5 | `legibleInk(accent, CARD_BG, 4.5)` |
| `AgentCardBlock.tsx:85` CTA link | accent on white card | 13px text → 4.5 | same |
| `FooterBlock.tsx:87,98` links | accent on `#F9FAFB` | 12-13px text → 4.5 | `legibleInk(accent, "#F9FAFB", 4.5)` |
| `ListingBlock.tsx:112` link | accent on `sectionBg ?? white` | 13px text → 4.5 | `legibleInk(accent, bg, 4.5)` |
| `ListingBlock.tsx:76` price | primary on `sectionBg ?? white` | 22px/700 large → 3 | `legibleInk(primary, bg, 3)` |
| `ListingBlock.tsx:59-60` badge chip | hardcoded `#06231f` on accent fill | chip text → 4.5 | ink = `readableText(accent)` (item-1 badge pattern) |
| `SourcesBlock.tsx:53` source links | accent on `sectionBg ?? white` | small text → 4.5 | `legibleInk(accent, bg, 4.5)` |
| `SocialIconsBlock.tsx:41` icons | accent on white | non-text → 3 | `legibleInk(accent, CARD_BG, 3)` |
| Accent borders (`HeaderBlock:22`, `AgentHeroBlock:57`, `SignalBlock:29`) | accent line on fills | decorative | LEAVE — decoration is WCAG-exempt; a low-contrast rule reads as intentional |

Out of scope here: the white-ink trio (`ButtonBlock:18`, `AgentHeroBlock:66`, `HeaderBlock:39`) —
that is `email_contrast_ink_fence`, shovel-ready as written; it ships FIRST and this tier reuses
its landed pattern.

### Tier B — save-time palette warn (feedback at the source)

**Pure evaluator, new sibling of the palette root** — `lib/brand/palette-contrast.ts`:

```ts
evaluateSchemeContrast(scheme: [primary, accent, text, background]) → SchemeWarning[]
// Each: { pair, surface ("accent text on your header color"), ratio, floor, verdict,
//         consequence ("that text will use white instead of your accent") }
```

Evaluates only pairs the renderer actually creates: accent-on-primary, accent-on-white-card,
accent-on-footer, white-on-primary, white-on-accent (button/badge fills), text-on-background,
primary-on-white (price ink). Pure, unit-testable, imports `contrastRatio` from the ONE WCAG root.
Empty slots skip (four-lane spirit: never block on a gap).

**Warn strip in the ONE brand form** (`BrandingBlock.tsx` — covers project pill AND lab accordion,
every entry path): a non-blocking amber strip under the color slots, re-evaluated on slot edit and
on palette-apply (`:141`). Copy is plain language, no system nouns, states the consequence — e.g.
"Your accent is hard to read on white cards (2.1:1 — comfortable is 4.5:1). Emails will use a
darker ink there so text stays readable." Saves are NEVER blocked; colors are NEVER rewritten.

**What does NOT change:** `applyBrand`/`brandGlobalStyle` stay pure data transforms (no UX, no
color mutation — auto-adjusting there would silently violate brand-is-canonical);
`sanitizePalettes` keeps zero contrast logic (it must never DROP a palette over contrast);
no server-side gate (warnings are advisory; the render guards are the enforcement layer).

## 4. Decisions — RATIFIED 07/09/2026 (operator approved the recommendations as written)

- **D1 — DECIDED: warn-only.** Tier A makes output legible by construction, so the gate's job is
  feedback, not safety. Auto-adjust rewrites saved brand colors (violates brand-is-canonical);
  block handcuffs a build (violates never-refuse). Both rejected. Cheap later enhancement (not in
  scope): a "use a darker version of this accent" one-tap suggestion in the strip.
- **D2 — DECIDED: BrandingBlock form + pure `lib/brand` evaluator.** The form is the ONE root all
  brand entry flows through; `applyBrand` is the wrong layer (runs per-render, no UI channel,
  mutation there = silent auto-adjust). Rejected.
- **D3 — DECIDED: 4.5:1 functional text / 3:1 large-text + non-text / decoration exempt**
  (straight WCAG AA per §2). Flat 3:1 everywhere rejected — it leaves 12px links at ratios WCAG
  calls failing, and two committed seed accents sit in exactly that gap.
- **D4 — DECIDED: sequence as written.** `email_contrast_ink_fence` first (as written) → Tier A →
  Tier B. Tiers land as separate commits; Tier B is independently shippable.

## 5. Testing

- `on-dark.test`: `legibleInk` directional fallback with the measured cases in §1 (accent==primary
  → white on dark primary / dark ink on pale primary; `#3DC9C0` on white → dark ink; passing pairs
  untouched), plus the five legacy `legibleAccent` call-site cases stay byte-identical.
- Per-block render tests with two hostile palettes (accent==primary navy; pale-gold+cream) + the
  house default, asserting every table row resolves to a floor-clearing ink.
- `palette-contrast.test`: pair inventory exact, ratios reproduce, empty slots skip, verdict copy
  carries no hex-jargon beyond the ratio.
- Form: strip renders on a failing scheme, absent on a passing one, save proceeds regardless.

## 6. Non-goals

APCA/WCAG-3 scoring (repo root is WCAG 2 `contrastRatio`); email-client dark-mode transforms;
auto-fix color math (possible D1 enhancement later); chart palettes (`lib/charts` has its own
system); retro-editing already-saved user palettes.
