# Email fence polish — contrast ink, sources autofill, palette demo figures, cadence enrichment

**Date:** 2026-07-09 · **Status:** HANDOFF — reviewed with operator, checks open, nothing implemented.
**Checks:** `email_contrast_ink_fence` · `email_sources_accordion_autofill` · `email_palette_demo_figures` · `email_cadence_enrichment`
**Recommended model:** ⚡ Sonnet. Read `lib/email/CLAUDE.md` first (slot rule, capabilities dial, one-root rules).

Source of these findings: 07/09/2026 full review of the fence system (`2026-07-08-email-grid-fence-system-design.md`),
all 27 SEED_DOCS, and the brand-persistence path, against the 07/08 research sweeps. Every item below
carries its evidence; two carry fresh crawl verification (RULE 0.4) done 07/09/2026.

**Coordinate with `2026-07-09-template-preview-gallery-design.md`:** land item 4 (cadence enrichment)
BEFORE the gallery's capture run, or the 27 preview webps need re-capturing.

---

## 1. Contrast ink fence (`email_contrast_ink_fence`) — do this first

**Defect:** three blocks hardcode white text on user-brand-colored fills:
- `lib/email/blocks/ButtonBlock.tsx:18` — label `#ffffff` on `props.bgColor ?? globalStyle.primaryColor`
- `lib/email/blocks/AgentHeroBlock.tsx:66` — name strip
- `lib/email/blocks/HeaderBlock.tsx:39` — header text

`applyBrand` overlays the user's saved colors (account: `user_brand_profiles`; project:
`projects.branding`), so a light brand primary makes every CTA unreadable.

**Proof (07/09/2026, repo's own `contrastRatio` from `lib/charts/palette`):** white on pale gold
`#E8D9A0` = 1.41:1 · cream `#F5F0E1` = 1.14:1 · light blue `#A8D8E8` = 1.54:1 · blush `#F4C2C2` =
1.57:1 · house teal `#3DC9C0` = 2.04:1. WCAG AA floor: 4.5:1 normal text, 3:1 large. Only the house
navy `#0f1d24` passes (17.19:1) — which is why nothing looks broken today.

**Fix:** route ink through the existing dark-band machinery — `isDarkBg` (`lib/email/blocks/on-dark.ts`)
already picks white-vs-`#111827` by WCAG math, render-time, never persisted; `lib/email/templates/components/badge.ts`
already does exactly this for badge fills. Apply the same pick to the three hardcoded sites (label ink,
strip ink, header ink). This was the fence spec's own deferred follow-up ("contrast-checked band/text
pairs"), now demonstrated.

**Tests:** unit per block — pale fill → dark ink, dark fill → white ink; keep byte-identical output for
the house default (navy → white) so existing snapshots/sends don't shift. Verify in all three engines'
shared path (these blocks are the shared React components — the ONE render root `render-email-doc.ts`
covers free + grid; check the legacy token rail separately only if it renders these blocks).

**Out of scope (own check, 07/09: `email_accent_ink_palette_gate`):** the ACCENT-ink family —
`HeaderBlock.tsx:51` tagline + `AgentHeroBlock.tsx:80` designation render `accentColor` ON
`primaryColor` fills, `AgentHeroBlock.tsx:115` CTA link renders it on white; `legibleAccent()`
(`on-dark.ts`) exists unused at all three. Needs its own plan (save-time palette gate) — don't
fold it in here.

## 2. Sources accordion autofill (`email_sources_accordion_autofill`)

**Defect:** THE-GOAL rule 1 says sources ride in the collapsed list — but no production path in the
lab AI-fill flow ever creates or fills a `sources` block. Re-verified 07/09 (second pass): `type:
"sources"` appears in tests, welcome frames, the assistant, and ONE production composer —
`lib/email/zip-seed.ts:174`, the deterministic map-click seed, which already fills the accordion from
held citations and is the pattern to copy. None of the 27 seeds carry one; `assembleAuthoredDoc`
(`lib/email/author-doc.ts`) never appends one. Data-rich AI-filled emails send with zero visible
provenance — the moat is invisible on the flagship surface.

**Key fact:** at assembly time the figures the AI actually used are known (`figuresById` /
`collectAnchorNumbers`), and each `MarketFigure` already carries `source` + `as_of`. Nothing new to
fetch — the citations are in hand and dropped.

**Fix:** in `assembleAuthoredDoc`, when ≥1 held figure was consumed, upsert ONE `sources` block filled
from the used figures (dedupe by source), `note` carrying the as-of (MM/DD/YYYY, stated once).
Precision (07/09 second pass): `MarketFigure` is `{key, label, value, source, as_of?}` — NO `url`
field — so entries are label-only `{label: figure.source}`, exactly zip-seed's lifecycle-citation
shape. UPSERT, not append: `sources` is `authorable: true` in `block-contract.ts` (it rides the AI
vocabulary via `AUTHORABLE_TYPES` — `build-doc.ts:929`) but `applyContent` has no `sources` case, so
an AI-emitted one materializes as an inert `{sources: []}` block that renders null — fill/replace that
empty instead of adding a second (or flip `sources` to `authorable: false` like `metric-card`;
implementer's call). Fence 2 zone `close` already sorts it above the footer — no placement code.
Respect the existing contract: `SourcesProps.sources[]` stays data-seeded (the AI still cannot write
citations; assembly restates held ones). Renders default-collapsed via the existing `SourcesBlock`
(`fb033c2b` wired rendering). Outlook watch: `<details>` renders permanently OPEN in Outlook (per
`SourcesBlock.tsx`'s own header) — once every data-rich send carries the accordion, cap the autofilled
list (~6; the schema allows 30) so degraded clients never see a citation wall.

**Tests:** fill with 2 figures from distinct sources → one sources block, 2 deduped entries, sits
between last body block and footer; fill that uses zero figures → no sources block; an AI-emitted
`sources` block with invented entries is still stripped/ignored (existing schema behavior — assert it).

## 3. Palette demo figures (`email_palette_demo_figures`)

**Defect:** Track A emptied baked figures from the SEEDS, but `DEFAULT_BLOCK_PROPS`
(`lib/email/doc/default-docs.ts:48-143`) still ships them: hero `$485K`, stats `34 / 3.2 mo / ↑4%`,
listing `$489,000 · 4521 Surfside Blvd, Cape Coral` (the same fake-address class emptied from
listing-digest), metric-card `$485K / #12 of 57`. Two paths reintroduce the risk Track A killed:
(a) palette-added blocks (`createBlock`) carry them into real canvases; (b) any future seed that
partially overrides a block silently inherits them — the exact root cause of the market-letter and
weekly-pulse drift bugs (07/09 session log). `docSkeleton` (`build-doc.ts:317`) then shows a filled
value to the AI as "the current answer — may be kept."

**Fix:** apply THE SLOT RULE to the palette defaults for number-bearing fields — value `""`, the
instruction moved into the label (hero label: "The headline number and what it measures"; stats labels
stay "Median DOM" etc. with empty values; listing figure fields empty; leave `metric-card` alone if
preferred — it has no palette menu entry and is data-seeded — but emptying it too is harmless and
consistent). Keep structural/brand defaults (button labels, footer, agent-card copy) filled — that is
the slot rule's other half.

**Guard (kills the class):** a test in `schema.test.ts` (or a sibling) asserting no `DEFAULT_BLOCK_PROPS`
figure-bearing field (`hero.value`, `stats[].value`, `listing.price/beds/baths/sqft/address`) is
non-empty, and — the drift half — every SEED_DOCS block's figure fields are `""` even when the seed
only partially overrides. metric-card consistency (07/09 second pass): if you empty it, empty the SET —
`metricValue`, `rankText` ("#12 of 57"), `movementText` ("↑ 4% YoY"), `sub`, and `barPct: 62` all
carry demo numbers — and add them to the guard; if you leave it alone (defensible: no palette menu
entry, data-seeded only), leave it OUT of the guard so the test matches the decision. NOTE: `lib/email/doc/schema.test.ts` was
claim-locked by a parallel session on 07/09 (`repolith claim list`) — check the claim before editing;
a new test file avoids the collision entirely.

**Watch:** `createBlock("hero")` currently has a test asserting `props.value` is **defined**
(`schema.test.ts:310`) — `""` is defined, so it should pass, but re-run the suite; also eyeball the
add-block UX once (an added Big Number block now renders an empty value — confirm the canvas shows the
label instruction acceptably, same as seeds do).

## 4. Cadence enrichment (`email_cadence_enrichment`)

**Finding:** richness is inverted vs cadence — weekly-pulse (2 charts + 3 KPIs) outguns every
monthly/annual template. Agreed fixes, all in `lib/email/doc/default-docs.ts`, all slot-rule-true
(new slots ship EMPTY with instruction labels; only structure/style is authored):

- **year-in-review (annual):** add a second chart as a `{6,6}` pair (full-year price trend + a
  second full-year shape, e.g. monthly sales volume — labels instruct, values empty). The template's
  own inline citation (housingwire/highnote convention, `default-docs.ts:1189`) supports the deeper
  cascade. Optionally `displayFontFamily: "PLAYFAIR_SERIF"` — keepsake register (crawl evidence below).
- **monthly-digest:** add either a second chart or a `list` block ("The month in 3 lines" — `lead`
  date-tags, empty `text` with instruction), so monthly > weekly in depth.
- **magazine-issue:** seed `imageUrl: ""` on both `multi-column` feature columns —
  `MultiColumnColumn.imageUrl` exists and is unused; a magazine without feature images is a
  newsletter with a masthead. (URLs are user-owned — the AI can never fill them; the canvas shows
  the empty slot. Correct per the moat.)
- **market-spotlight (the DEFAULT template):** reserve one chart `image` block so the front-door
  template of a data company carries a data visual; `upsertChartBlock` replaces reserved blocks
  in place — pure seed data.
- **just-sold (linear):** add a property-photo `image` slot (`kind: "photo"`, ratio `3:2`) —
  the grid twin has one; every real just-sold email leads with the photo.
- **luxury-market-report:** set `displayFontFamily: "PLAYFAIR_SERIF"` (body stays sans — Fence 4
  legal, serif display on sans body). **Crawl-verified 07/09/2026** (luxurypresence.com, the
  real-estate luxury marketing vendor): "An agent serving the luxury segment might choose a refined
  serif like Playfair Display." Same source's counter-signal — 2026 real-estate typography otherwise
  trends minimalist sans — is why the OTHER nine grid templates correctly stay sans; do not
  serif-ify them.
- **Fence 3 — add `"16:9"` to `PHOTO_RATIOS`** (`block-contract.ts` + `types.ts` PhotoRatio + the
  canvas ratio picker), default stays `3:2`. **Crawl-verified 07/09/2026** (mailmodo.com email image
  guide): banners run full email width with height "typically 300px to 500px" — so 3:2 (600×400) is
  in-range and stays default; 16:9 (600×338) is the documented wider option that buys above-the-fold
  room (search consensus: recipients see the top 300–500px before scrolling). This is an OPTION on
  the variety axis, not a new default — behavior-neutral for every existing doc.
- Deliberately UNCHANGED: editorial-letter, market-letter, minimal, the 4 skeletons (plain-by-design,
  research-backed), welcome, stay-in-touch, and the remaining event templates.

**Tests:** seeds still parse (`schema.test.ts` "every seed builds a valid, parseable doc" covers it);
new blocks' figure fields empty (the item-3 guard covers it); Fence-4 legality of the luxury pairing
is enforced by `apply-brand-style.ts` already — add the seed-level assertion next to the editorial
pairing test.

---

## Retraction on the record (so nobody re-adds it)

The 07/09 review initially flagged "Fence 1 escape hatch: 4+ block rows bypass blessed multisets."
WRONG on the AI path: `author-doc.ts` caps rows at ≤3 (`:777` row grouping; `:706` comment) before
spans ever snap — `padTrimToGrid` is unreachable there. No fix needed; do not "close" this hole.

## Crawl evidence (RULE 0.4, fetched live 07/09/2026 via crawl4ai)

- https://www.luxurypresence.com/blogs/brand-fonts-real-estate-website/ — luxury segment → refined
  serif (Playfair Display named); 2026 trend otherwise minimalist sans/geometric; "limit to two or
  three typefaces: one for headlines, one for body" (validates the 2-slot Fence-4 system); "apply
  your fonts the same way everywhere — website, social graphics, email" (validates account-level
  brand persistence).
- https://www.mailmodo.com/guides/email-image-size/ — banner width = email body width (600px+),
  height "typically 300px to 500px," adjustable by layout.
- Search corroboration (WebSearch 07/09/2026, not crawled): tabular.email 2026 size guide
  (600–640px container consensus; heroes 600×200–300 named), moosend/unlayer banner guides.
  tabular.email crawl itself failed (Windows cp1252 — fixed for future runs with `PYTHONUTF8=1`
  before the crawl4ai shim).
