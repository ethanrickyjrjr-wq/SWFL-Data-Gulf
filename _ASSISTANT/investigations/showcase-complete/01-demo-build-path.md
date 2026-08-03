# Task 1 findings — the listing-to-close demo-build path

Investigation date: 08/03/2026. Pure discovery, no source files touched.

## 1. The producing script — CONFIRMED ABSENT. The originals are hand-written HTML.

`git log --format='%h %ad %s' --date=short -- public/showcase/listing-to-close/live/05-sold.html`
returns exactly two commits:

- `d3292777` (2026-07-02) `feat(showcase): vendor Latitude 26 lifecycle emails as showcase artifacts`
  — added all five files, 729 insertions, **zero script files in the diff** (`git show --stat
  d3292777` shows only the 5 `.html` paths).
- `85dbe9a9` (2026-07-05) `feat(media): mirror hero photos into our storage at build time` — a later
  patch that rewrote the `<img src>` hero-photo URLs in-place (rdcpix hotlinks → our Supabase
  storage mirror). Producing tool: `scripts/email/tmp-mirror-showcase-heroes.mts`, per its own
  header ("LOCAL ONLY... never commit") and the SESSION_LOG entry for that day — it is a
  gitignored `tmp-*` file (glob `scripts/email/tmp-*`, see `.gitignore`) so it is not present in
  this checkout; it only ever touched hero `<img>` URLs, not full document structure.

`ls scripts/email/` today has no listing-to-close-specific producing script. It has 5 `tmp-*`
scripts (all local-only, gitignored) — `tmp-agent-launch-demos.mts` is the closest real analog
(builds a DIFFERENT showcase, `agent-launch`, through the real engine — see §4) — plus permanent
tools (`campaign-sim.mts`, `outreach-*`, `run-schedules.mts`, etc.) that are unrelated to showcase
capture.

**Definitive confirmation it was hand-authored, not code-produced** — SESSION_LOG.md, entry
"2026-07-02 (main) — folded the campaign session's handoff; false 'lab-built' claim on record"
(~line 17164): *"Operator surfaced that the campaign session CLAIMED the Latitude 26 work was
grid-lab-built — it was hand-written table HTML (no EmailDoc, no deliverable rows)."* And the
entry "2026-07-02 (main) — Latitude 26 gap analysis..." (~line 17182): the operator handed over
`Downloads/latitude26-campaign` (6 lifecycle emails + a social pack for 465 Gordonia Rd, one
invented brand, real lake numbers, all **hand-authored table-HTML**) and a parallel session vendored
those files into `public/showcase/` verbatim. A later commit (`e36f1b8e`, 2026-07-13,
`feat(email): ONE deliverable that actually works`) states it explicitly in its own message:
*"The showcase example was never built by the product: d3292777 vendored the Latitude 26 emails as
hand-written HTML, and capture-showcase only screenshots them. No code path could produce that
flyer. There was no reference implementation to copy."*

So: **no producing script exists, and none ever did** for these five files. `d3292777`'s parent
source (`Downloads/latitude26-campaign`) was never committed to the repo either.

## 2. The render function — `renderEmailDocHtml`, and the live HTML's shape does NOT match it

`app/api/email-lab/render/route.ts` (`POST`, line 30) calls:

```ts
const html = await renderEmailDocHtml(parsed.data);   // parsed.data: EmailDoc (Zod-validated)
```

imported from `@/lib/email/render-email-doc` (line 3). Full definition, `lib/email/render-email-doc.ts:22`:

```ts
export async function renderEmailDocHtml(doc: EmailDoc): Promise<string> {
  return isGridDoc(doc.blocks) ? compileGrid(doc) : render(EmailDocEmail({ doc }));
}
```

This is **the ONE root** (per its own header comment) for turning an `EmailDoc` into HTML —
shared by the render route, the blast-send route, and the scheduled-send runner. Grid docs (any
block carrying a `layout`) go through `compileGrid` (`lib/email/compile-grid.ts`); everything else
goes through `@react-email/render`'s `render()` over `EmailDocEmail` (`lib/email/blocks/EmailDocRenderer.tsx`).

**Shape verification (independent of the SESSION_LOG confession):** `public/showcase/agent-launch/live/01-letter.html`
was genuinely built through this exact root (`scripts/email/tmp-agent-launch-demos.mts` line 132:
`await renderEmailDocHtml(branded)`, confirmed by reading the script — see §4). Its real output
opens:

```
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" ...><html dir="ltr" lang="en">
<head><link rel="preload" .../><meta .../><meta name="x-apple-disable-message-reformatting"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/..."/></head>
<body style="background-color:#FBFAF7;margin:0;padding:0">...
```

— XHTML 1.0 Transitional doctype, no `<style>` block, **every** style is an inline `style="..."`
attribute per element, MSO conditional comments (`<!--[if mso]>`), react-email's `data-id`/column
div wrappers.

`public/showcase/listing-to-close/live/02-new-listing.html` opens instead:

```
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Just Listed — 465 Gordonia Road, Naples · $14,800,000 | Latitude 26 Estates</title>
<style>
  body { margin:0; padding:0; background:#EFE9DD; ... }
  .serif { font-family: Georgia, 'Times New Roman', serif; }
  .sans  { font-family: Arial, Helvetica, sans-serif; }
</style>
</head>
<body>
```

— plain HTML5 doctype, a `<head><style>` block defining **CSS classes** (`.serif`/`.sans`)
referenced via `class="serif"` throughout the body. `@react-email/render` never emits a
class-based `<style>` block shaped like this — this is a hand-authored template. The two shapes
are structurally incompatible; this independently corroborates §1's SESSION_LOG finding.

**Conclusion for Task 2:** the render function to call is `renderEmailDocHtml(doc: EmailDoc):
Promise<string>` from `lib/email/render-email-doc.ts`. Its real output looks like the
`agent-launch` files, not like the current `listing-to-close` files — Task 2's new
`06-open-house.html` / `07-price-reduced.html` will NOT visually match files `01`–`05`'s markup
(different doctype, no `<style>` block, inline styles throughout). That is expected and correct:
`01`–`05` are the artifact we're trying to stop reproducing by hand, not the target shape.

## 3. The demo listing — 465 Gordonia Road, Naples, FL 34108 — no committed fixture

Grepping the live HTML directly:

```
465 Gordonia Road
NAPLES, FLORIDA 34108
$14,800,000 · 6 beds · 7,733 sq ft · 1.52 acres · SFH
listing page: https://www.johnrwood.com/listing/226013192/465-gordonia-road-naples-fl-34108/
```

Grepping the rest of the repo (`scripts/`, `lib/`, `fixtures/`, `docs/`, `app/`) for "Gordonia" /
"Mara Ellison" / "latitude26" / "Latitude 26" turns up **zero hits in `fixtures/`** and zero hits
in any `scripts/` or `lib/` source file. Every hit is either the five live HTML files themselves
or prose (SESSION_LOG.md, `docs/superpowers/specs/2026-07-02-latitude26-gap-and-cockpit-punch-list.md`,
`docs/superpowers/plans/*`, `docs/standards/deliverable-playbook.md`, handoff docs). **There is no
committed `ListingFacts`/`EmailDoc` fixture for this address or brand anywhere in the repo.** The
address and figures exist only as hardcoded strings inside the five hand-written HTML files, and
in the operator's un-committed `Downloads/latitude26-campaign` source folder (never checked in).

`lib/showcase/registry.ts` (`SHOWCASES`, id `"listing-to-close"`, line 96) carries the *narrative*
metadata only — `company: "Latitude 26 Estates · Naples"`, disclosure text ("Demonstration
campaign — Latitude 26 Estates and its agent are fictional. The property, comp, and market data
are real — SWFL Data Gulf (07/01/2026)."), and each slide's `recipe: RECIPES["<key>"]` pointer —
it does not carry or reconstruct the `EmailDoc`/`RecipeBuildContext` that built the HTML, because
none was ever built by code.

## 4. Brand doc — Latitude 26 Estates / Mara Ellison — also no committed fixture; established precedent exists elsewhere

From the live HTML footer (`02-new-listing.html` lines 128–144): agent **Mara Ellison**, title
"Estate Advisor · Latitude 26 Estates", phone "(239) 555-0126", email
"mara@latitude26.example.com", demo business address "26 Latitude Lane, Naples, FL 34102 (demo
address)" (CAN-SPAM postal-address footer requirement, satisfied with a labeled fictional
address). Palette (`#0A2A2C` teal-black, `#B98F45`/`#C7A45C` gold, `#103B3E`, `#EFE9DD`/`#FBF9F5`
backdrops) is hardcoded per-file in raw hex — **not** derived from
`lib/email/brand/branding-to-tokens.ts`'s `brandingToTokens()` (the real brand→tokens root; see
`lib/email/CLAUDE.md`). No `BrandingBlock`/tokens fixture for Latitude 26 exists in the repo.

**The real, working precedent for doing this from code exists for a DIFFERENT showcase** —
`scripts/email/tmp-agent-launch-demos.mts` (local-only, gitignored `tmp-*`, builds
`public/showcase/agent-launch/live/*.html` for the fictional brand "Marisol Vega / Gulfline
Realty"). Read in full; its pipeline, which Task 2 should mirror for Latitude 26:

1. Build a `BrandingBlock`-shaped token set via `brandingToTokens({...})`
   (`@/lib/email/brand/branding-to-tokens`) — agent name/title, brokerage, business address,
   contact email, photo URL, 4 palette colors, display/body font family.
2. Call the REAL author engine, `authorDoc({ prompt, rawDoc, scope, mode: "quality", assets,
   replyEmail })` from `@/lib/email/build-doc` — same module `/api/email-lab/ai` runs — to get a
   real `EmailDoc` back (`payload.doc`), validated with `EmailDocSchema.safeParse`.
3. Apply the brand with a hand-rolled `applyMarisolBrand(doc)` function that mirrors
   `EmailLabShell.tsx`'s `applyBrand()` block-type branches (header/footer/agent-card/agent-hero/
   button) — necessary because `applyBrand`'s real implementation is client-component-only and a
   `bun` script can't import it directly; the header comment calls this "same precedent as
   `tmp-rainbow-fix.mts`."
4. Render with `renderEmailDocHtml(branded)` (§2) and `writeFileSync` the result under
   `public/showcase/<id>/live/<file>.html`.

This is the closest thing in the repo to "a documented, repeatable command that takes
`(recipeKey, demo listing address, demo brand doc)` → standalone HTML" — but it goes through the
generic free-tier `authorDoc` author path with a hand-written prompt, not through a specific
`RecipeKey`/`RECIPE_BUILDERS` entry. For Task 2 (which explicitly needs `buildOpenHouse` /
`buildPriceReduced` — coded recipe builders, not the generic author), the shape to follow is:
construct a `RecipeBuildContext` directly (recipe from `RECIPES[key]`, `currentDoc` = a
brand-carrying skeleton `EmailDoc` built the same `brandingToTokens` + apply-brand way, `facts`/
`resolved` from a REAL resolved subject — see `lib/listings/resolve-subject.ts`, not fabricated),
call `builderFor(key)(ctx)` from `lib/deliverable/recipes/index.ts`, then `renderEmailDocHtml` the
result. `RecipeBuildContext` does not accept a raw address string — the subject must go through
the real resolver (`resolveSubjectListing`) to produce `ListingFacts`, per `docs/standards/emails.md`
§2.4 ("the ONE resolver; never write a second... a miss returns the 'paste your link' ask").

## 5. `RECIPE_BUILDERS` — the builder contract (`lib/deliverable/recipes/index.ts`)

```ts
export interface RecipeBuildContext {
  recipe: Recipe;              // registry entry: skeleton, prose, subject spine, chart policy
  prompt: string;              // user's build-box text, [[blank]] filled
  currentDoc: EmailDoc;        // doc on canvas; brand (globalStyle/header/footer/agent-card) is STICKY
  facts: ListingFacts | null;  // subject==="address": the resolved house; else null
  resolved: boolean;           // false = vendor miss; grid still lands with open slots
  zip?: string;                // subject==="area"|"agent": scoped ZIP
  voice?: VoicePresetId;       // resolved voice pick; coded builders may ignore it
}

export type RecipeBuilder = (ctx: RecipeBuildContext) => Promise<EmailDoc | null>;

export const RECIPE_BUILDERS: Partial<Record<RecipeKey, RecipeBuilder>> = {
  "new-listing": buildNewListing,
  "coming-soon": buildComingSoon,
  "market-comps": buildMarketComps,
  "under-contract": buildUnderContract,
  "just-sold": buildJustSold,
  "open-house": buildOpenHouse,
  "price-reduced": buildPriceReduced,
  // ...agent/area recipes, default-grid terminal fallback
};

export function builderFor(key: RecipeKey): RecipeBuilder | null {
  return RECIPE_BUILDERS[key] ?? null;
}
```

Builders own exactly four decisions (skeleton, cells, chart, prose) and MUST return `null` to fall
through to the generic/default-grid author rather than ever refusing a build (RULE 0.7) — Task 2's
build script must treat a `null` return as a stop-and-report condition (per the plan's own Task 2
Step 2), never as license to hand-author HTML.

## 6. Binding conventions for Task 2 (from `lib/deliverable/CLAUDE.md` + `docs/standards/emails.md`)

- **ONE LANE / ONE render root.** Every build ends at `renderEmailDocHtml` (§2); never hand-build
  or re-derive HTML. `lib/deliverable/CLAUDE.md`: `default-grid` is the terminal fallback and is
  TOTAL (never null, never invented) — but Task 2 wants the actual coded `open-house` /
  `price-reduced` builders, not the fallback.
- **Subject resolution is lake-first, ONE resolver** (`resolveSubjectListing`,
  `lib/listings/resolve-subject.ts`) — never fabricate `ListingFacts`; a genuine miss returns an
  honest "paste the link" ask, not a placeholder.
- **`FAVORABLE_FRAMING_POLICY`** is pasted verbatim into exactly three prompts
  (`authorListingNarrative`, `authorUnderContractNote`, `buildNarratorPrompt`) — irrelevant to
  `open-house`/`price-reduced` unless their builders happen to call one of those three; don't
  paste it elsewhere.
- **Brand overlay fills blanks only** — never overwrites authored content (the `HERO_LABEL`
  address-clobber incident, §7 of `docs/standards/emails.md`). Whatever Task 2's script does to
  apply the Latitude 26 brand to `currentDoc`, it must not stomp builder-authored cells.
  `renderEmailDocHtml`'s grid-vs-free-tier fork ties directly to `isGridDoc()` — whether ANY block
  carries a `layout`.
- **Charts:** `ChartPolicy` per recipe governs whether a chart appears at all; an empty chart slot
  must be dropped (`dropEmptyChartSlot`), never rendered empty.
- **No invented numbers** — every figure in the two new demo emails must trace to the real
  resolved listing record or a cited source, same as the plan's Global Constraints require.
- **Verification commands ruled by the codebase:** `bun test lib/deliverable`, `bunx next build`
  (never `npx tsc`); `bun test lib/showcase` guards registry↔asset parity.

## Summary for the caller

- **Producing script for the original 5 files: CONFIRMED ABSENT.** They were hand-authored table
  HTML (operator-supplied `Downloads/latitude26-campaign`, vendored verbatim in commit `d3292777`,
  2026-07-02); a later commit (`85dbe9a9`) only rewrote hero `<img>` URLs via a local-only,
  gitignored script (`tmp-mirror-showcase-heroes.mts`). No code path ever produced these files —
  confirmed both by SESSION_LOG's own postmortem and by the shape mismatch in §2.
- **Render function:** `renderEmailDocHtml(doc: EmailDoc): Promise<string>` —
  `lib/email/render-email-doc.ts:22` — forks to `compileGrid(doc)` (grid docs) or
  `render(EmailDocEmail({ doc }))` (free-tier `@react-email/render`); imported and called at
  `app/api/email-lab/render/route.ts:30`.
- **Demo address:** 465 Gordonia Road, Naples, FL 34108 — $14,800,000, 6 bd / 7,733 sq ft / 1.52
  acres SFH, listing page johnrwood.com/listing/226013192. No committed fixture; exists only
  inside the five hand-written HTML files and prose docs.
- **Brand:** Latitude 26 Estates / agent Mara Ellison, Estate Advisor, (239) 555-0126,
  mara@latitude26.example.com, demo address 26 Latitude Lane, Naples FL 34102. No committed
  tokens/`BrandingBlock` fixture — hardcoded hex in the hand-written HTML. The real, repeatable
  code pattern to reconstruct an equivalent brand doc lives in
  `scripts/email/tmp-agent-launch-demos.mts` (local-only precedent, different showcase/brand):
  `brandingToTokens()` → `authorDoc()`/`builderFor(key)(ctx)` → hand-rolled brand-apply mirroring
  `EmailLabShell`'s `applyBrand` → `renderEmailDocHtml()` → `writeFileSync`.
