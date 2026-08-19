# HANDOFF — recipes-as-config: seam LIVE, 2 of 7 migrated, wave re-scoped on measurement

**Date:** 08/19/2026 · **Pushed through:** `26c3e4f3` · **Plan:** `docs/superpowers/plans/2026-08-19-recipes-as-config.md` (read its ⚠ MEASURED RE-SCOPE section before touching Tasks 6–11) · **Spec:** `docs/superpowers/specs/2026-08-18-recipes-as-config-amendment-design.md` · **Check:** `recipes_as_config_live_verify` (OPEN — closes only on operator live-verify: a real Lab build of a migrated recipe renders correctly in prod).

Treat every claim below as verifiable, not as authority (inherited-plan skepticism). Each section names the command that re-proves it.

## §1 What is BUILT and LIVE on main

**The seam (commits `4341323b` + `59910796`), five files in `lib/deliverable/recipes/`:**

- `config.ts` — `RecipeConfig` (JSON-serializable DATA; `config.test.ts` round-trips every configured recipe — that fleet test is the wall against the config-becomes-a-DSL failure the spec names). Also owns `renderTemplate` ("{street}" fill; unknown → "") and `subjectFor` (the deterministic street → city → bare ladder; `suppressAddress` skips the street rung; `bareWithDays` fires only when a derivation resolved `{days}`).
- `cell-catalog.ts` — `CELL_CATALOG` (beds/baths/sqft/price-per-sqft/lot/type), each key owning label + formatter. Labels are checked CLEAN against cell-policy at authoring level by `cell-catalog.test.ts`, so a cost-family cell cannot even be authored; the chrome's render-time `stripBannedCells` backstop is unchanged. `resolveCells(keys, facts)` → StatItems through the shared `spec()` (open-slot semantics, one weight across the row).
- `derivations.ts` — `DERIVATIONS` (keyed "recipe-key/name" functions: `(ctx, params) → {blocks, subjectVars?, anchors?}`) + `FINISHERS` (keyed doc-level passes: `(ctx, doc, params) → doc`, for structural narrators). Registration direction is ONE-WAY: derivations.ts imports recipe modules, never the reverse (that direction is what avoids a load-time cycle through config-builder — do not flip it). A config referencing a missing key fails `derivations.test.ts` at CI; a throwing derivation degrades to no blocks (RULE 0.7).
- `config-builder.ts` — `buildFromConfig`, the ONE control flow: address gate (street-or-city, the "FL"-hero lesson) → derivations → template var pack (on `suppressAddress` the `{address}` var is STRUCTURALLY EMPTY so a wrong template renders nothing rather than leaking a street) → chrome → `buildLifecycleEmail` (UNTOUCHED — still the one layout authority) → subject → generic narrator (framing/strips/banned-phrase drop, all config data) → finishers.
- `index.ts` — `builderFor(key)`: config present → `buildFromConfig`; else the legacy `RECIPE_BUILDERS` entry. Both production consumers (`build-doc.ts:1364`, `registry-seam.test.ts`) already went through `builderFor`, so the dispatch seam was one function. **THE FENCE (in `builderFor`'s comment, normative): never add a feature to a legacy hand-coded builder — migrate the touched slice first.**

**Migrated recipes — config literals live INSIDE `RECIPES` in `lib/deliverable/recipes.ts` (the one registry gained a `config?` field; there is NO second store):**

- **under-contract** (`3bdef5cd`): 654 → 272 lines (−382). Config carries subject templates, spec cell keys, CTA, narrator strips (`daysOnMarket/lotSize/yearBuilt/hoaFee`), the SOLD_LANGUAGE list (as `bannedNarrativePhrases` — `SOLD_LANGUAGE` in under-contract.ts is now a DERIVED view of that same array), and the framing strings verbatim. The speed ladder stayed as code: `"under-contract/speed"` (middle) + `"under-contract/speed-sources"` (tail), sharing ONE live read per build via a `WeakMap` memo keyed on ctx.
- **coming-soon** (`398a7117` after schema extension `59910796`): builder + hand-kept FIELDS deleted; `COMING_SOON_FIELDS` / `teaserSpecs` remain as derived compat views. Suppression is structural three ways: `suppressAddress` (empty `{address}` var), `heroLabel: {withCity: "{city}, {state}", fallback: "{region}"}`, and the teaser narrator as the first FINISHER (`"coming-soon/teaser-narrator"`: de-identified fact sheet in → `redactStreetLine` on the output → `leaksStreet` drops a still-leaking paragraph to an open slot, with the loud console.warn). Scarcity = `"coming-soon/scarcity"` + `"coming-soon/scarcity-sources"` (memoized single read; chart accent = `ctx.currentDoc.globalStyle.accentColor`, correct because the editorial palette is dead and the chrome copies globalStyle verbatim).

## §2 The parity evidence (how it was proven, so you can re-prove)

Per recipe: run the acceptance script BEFORE migration, save the Downloads HTML; migrate; run it AFTER; diff with block ids (`id="…"`, `blk_…`), chart cache URLs, and the ONE live LLM narrative paragraph normalized out. Both migrations came back **byte-IDENTICAL** under that normalization. Re-run any time:

```
bun --env-file=.env.local scripts/email/render-under-contract.mts   # 6/6 assertions
bun --env-file=.env.local scripts/email/render-coming-soon.mts      # suppression 4/4 ABSENT
bun test lib/deliverable    # 1183/0 at handoff
bun test lib/email          # 1810/0 at handoff
bunx next build             # exit 0 at handoff — CHECK THE EXIT CODE, not the tail
```

Both scripts + both test suites now drive `builderFor(...)` — the exact production seam — instead of importing the deleted builders. `registry-seam.test.ts` (every builder ×2, two contexts, identical docs) is the determinism gate; derivations that read the clock or DB degrade to null in its cred-less env by design.

## §3 The MEASURED classification of the remaining 5 (do NOT re-derive; do NOT force)

Counted from the files in-session 08/19/2026 (full reasoning in the plan's re-scope section):

- **new-listing (180 lines)** — already thin; delegates to shared `buildListingFlyer`. Its one computed input (lake-first DOM, vendor fallback `resolveSubjectListDate`) would need an async catalog cell. Payoff ≈ 0. Leave until the flyer itself is configured.
- **open-house (297)** — migratable at the cost of 4 schema additions: a `dom` catalog cell; an `"rsvp"` CTA destination (agent-card ctaUrl → facts.sourceUrl ladder); `photoLink: "source"`; and a SECOND framing axis (date-present vs date-absent bullets) + `invitation: true` narrator mode. Do it when a second consumer wants any of those; alone they are warts.
- **just-sold (736) · price-reduced (669) · market-comps (1717)** — COMPUTATION-MAJORITY. Hero/specs/photo/chart/prose all hang off per-recipe data ladders (just-sold's close ladder off the comp call + facts patching + photo badging + sentence-bank body; market-comps' price-case engine). Forcing config here = hero-override/photo-override/facts-patch hooks = the builder re-implemented behind keys, net deletion ≈ 0 — the spec's own named failure mode. Their duplicated share (chrome, subject ladders, strips, guards) is already fleet-owned by the seam.

## §4 Where to CONTINUE (in order)

1. **Operator live-verify → close `recipes_as_config_live_verify`:** a real Lab build of under-contract and coming-soon on prod renders correctly (the local acceptance runs are green; the check closes on prod evidence, not dev attestation).
2. **New recipes land CONFIG-FIRST** (spec migration rule 2): the 08/02 promotion queue (monthly-newsletter, year-in-review, …) should be authored as config literals — that queue is the layer's proving ground, not six more 700-line files.
3. **Per-touch slices on the computation-majority three** (the fence enforces this): next session that touches just-sold/price-reduced/market-comps content moves the touched piece (a cell → catalog, a guard → config, a subject ladder → `subjectFor`) without forcing the whole file.
4. **Quick-swap (operator-decided: CYCLE button, PAID — route `"paid-only"` in `lib/email/lab/capabilities.ts`, never hardcode a tier)** stays parked until ≥2 recipes have an authored ALTERNATE grid family. The config layer now makes alternates cheap to author; nothing about swap is built yet.
5. **open-house migration** if/when its 4 extensions earn a second consumer.

## §5 Landmines for the next session

- **The cycle trap:** a recipe module may import `config.ts`/`cell-catalog.ts`/`recipes.ts` but NEVER `config-builder.ts` or `derivations.ts` — derivations.ts imports recipe modules at load time, and the reverse edge is a TDZ crash at module init.
- **Gate 15 (capture freshness):** any push touching `lib/deliverable/recipes/` or `lib/email/` must re-run the touched emails' acceptance scripts AND commit the refreshed `public/new-emails/*.html` (the harness writes to Downloads; copy over). Bit this session.
- **The playbook + area fences:** hooks block recipe edits until the session has Read `docs/standards/email-build-playbook.md`, `lib/deliverable/CLAUDE.md` (and `scripts/CLAUDE.md` for the render scripts). Read them first, not after the block.
- **`tmp/*.mts` scratch probes are typechecked by `next build`** even though gitignored — deleting an export can break the build from a file `git status` never shows (bit this session: `tmp/verify-openslot.mts`; a commit claimed build-green prematurely because of it — always check the build's EXIT CODE).
- **Prettier rewrites on commit** (lint-staged): don't re-Edit from stale content after a commit; Read first.
- **The status page is generated** — `bun scripts/email/status.mts` after any registry change; `status.test.mts` goes red on a stale page. It now carries a `config` column (yes = migrated).
- **A parallel session was active on this checkout** (writ-guard-trio, `38c41fba` — new push-approval token mechanics live in `.claude/hooks/`; expect `approve <gate>` prompts to matter). Explicit paths only, check `git log origin/main..HEAD` before any push, ask before bundling foreign commits.
