<!-- ══════════════════════════════════════════════════════════════════════ -->
<!-- READ THIS FIRST. This is the ONE map of the email system.                -->
<!-- Written 07/19/2026 from code + SESSION_LOG, the day after "all emails    -->
<!-- broken." Every claim below was verified against the repo that day.       -->
<!-- File:line numbers drift — re-check them; the SHAPE is code-verified.     -->
<!-- ══════════════════════════════════════════════════════════════════════ -->

# EMAILS — the one map

**Who reads this:** anyone (agent or human) about to touch anything email — the lab, a recipe,
a template, a render engine, a send path, a schedule. `lib/email/CLAUDE.md` and
`lib/deliverable/CLAUDE.md` are the in-context convention digests; THIS file is the full picture
they point at.

**Update rule (same as data-roots):** every email postmortem, operator decree, or vendor-behavior
change lands HERE in the same session it happens. A map that lags one incident is how the next
session ships the same bug again.

**Sibling docs — don't duplicate them:**
- `docs/standards/deliverable-playbook.md` — the DOCTRINE (claim gate, recipe table, invention
  is claim-shaped not number-shaped). Deep reference; this map indexes it.
- `docs/standards/email-images.md` — image handling specifics.
- `docs/standards/data-roots.md` — which table feeds any NUMBER an email shows. Its authority
  picks are pending operator sign-off — treat as recommendations, verify before relying.

---

## 1. THE 60-SECOND VERSION

1. **One build path.** Every door carries a **recipe key** into `authorDoc()`
   (`lib/email/build-doc.ts`). The key is the identity — never the prompt string, never a
   regex over the prompt. A prompt-regex gate once silently killed 15 of 17 recipes (07/13).
2. **The subject is resolved from OUR lake first.** `resolveSubjectListing`
   (`lib/listings/resolve-subject.ts`) reads `data_lake.listing_dom` before any vendor call.
   The vendor's exact-address lookup DIED silently on 07/19 and every address email shipped
   empty. Never wire a vendor lookup for data the nightly sweep already lands.
3. **Drive the builder — never hand-author.** Fill-with-AI pulls LIVE web data; retyping its
   numbers, "fixing" its output by hand, or overriding a fresh web value with a staler held one
   IS the invented number the moat forbids (operator blowup 06/28).
4. **Nothing silent.** A recipe build that fails validation must be LOUD (it now is —
   `console.error` in the dispatcher), a resolver miss must ask for the link/photo — never
   render the placeholder grid, never invent, never refuse the build (RULE 0.7).
5. **Three render engines** disagree with each other (free-tier email / grid-tier email / PDF).
   Any font or block-style change must touch ALL THREE. §5.
6. **The design system is CODE, not taste.** Every font size, weight, line-height, and spacing
   value comes from `lib/email/blocks/scale.ts` (`text()`, `label()`, `statRole()`) — the
   executable form of the researched `app/_design/05-color-and-type.md`. Hand-typing a px value
   in an email block is the bug, not a style choice. §4.
7. **Send lanes are separate systems.** Blast (segments) ≠ digest broadcast (audiences) ≠
   outreach ≠ cold email. Don't merge them. §6.
8. **Builds are free; SEND is the paywall** (watermark only, no Stripe on creation).

### THE CUT — 07/19/2026, operator decree: ONE email system (EmailDoc/authorDoc)

Executed same day:
- 🟢 `/api/email-lab/render` is **EmailDoc-only** — the legacy `{template, tokens}` branch is
  DELETED (its last poster, `components/email-lab/parked/classic-templates.ts`, deleted with it).
- 🟢 Blast route sends **block-canvas only** — the grounded token-template fallback is gone;
  a docless deliverable gets 422 `legacy_deliverable_rebuild_in_lab`. Email SENDING now has
  exactly one render root: `renderEmailDocHtml`.
- 🟢 All run outputs live under gitignored `runs/` (campaign-out, insiders-runs, outreach-runs,
  weekly-read-runs — writers + weekly-read.yml repointed).
- 🟢 **The scheduler worker is EmailDoc-only** (same-day rip): the digest / grounded-report /
  scoped / token-template lanes are DELETED from `scripts/email/run-schedules.mts` — the two
  keepers are the sequence one-shot (frozen doc) and the block-canvas occurrence (fresh
  re-build). A legacy row now throws a loud per-row error until re-linked to a saved Email Lab
  design. `lib/email/scoped-content.ts` + `lib/email/recurring-report.ts` DELETED
  (`resolveReportZip` relocated into `lib/deliverable/schedule-recipe.ts`, its one consumer).
- 🟢 The digest GENERATOR island is **DELETED** (07/19, on the operator's word): `build-digest` /
  `fetch-digest-data` / `hero-tokens` / `freshness-preflight` / `DigestEmail.tsx` / `log-io`
  (+ all their tests) + the disabled `daily-email-digest.yml`. Deliberately KEPT:
  `scripts/email/types.ts` (theme root — `SWFL_THEME`/`BrandTheme` feed live templates, outreach,
  and the social rasterizer) and `setup-digest-segment.mts` (provisions the Resend segment the
  broadcast route still uses as its default audience).

Staged (open checks — the map is wrong the day these close if it isn't updated):
- 🟡 `email_prospect_seed_block_canvas` — `lib/prospects/open-project.ts:29` still SEEDS new
  legacy `template:"email"` rows from the prospect-claim funnel.
- 🟢 `grounded_report_out_of_email` — DONE 07/19: `grounded-report` relocated to
  `lib/deliverable/grounded-report.ts` (+ both tests), all importers repointed; `lib/email`
  keeps only the activation wrapper (`activation/render.ts`) over the spine.
- 🟢 The site-footer daily-digest signup is CUT (07/19, closes `footer_dead_digest_cta`) —
  the capture component is renamed `SubscribeCapture` with NO product defaults (its one live
  instance is the zip-report weekly-read capture). `/api/email/subscribe` stays (broadcast
  list enrollment) but now has NO UI poster — product call tracked in
  `general_email_list_no_signup_surface`.
- 🟡 `web_chart_lib_consolidation` — recharts (6 files) + echarts (2 files) are WEB chart
  surfaces (zero imports inside lib/email); port to the bklit/visx kit, then drop both deps.
- Note: `/api/templates/render` + `lib/templates/render-html-template.ts` are the **viz-template
  showcase** (a WEBSITE surface, `/showcase` previews) — not part of the email system, not in
  this cut. `lib/email/templates/charts` stays: it feeds the LIVE social/og rasterizer.

---

## 2. THE PIPELINE — how an email actually gets built

```
DOOR                      IDENTITY                 BUILD                        AFTER
homepage hero  ─┐   lib/lab-entry/          authorDoc()                  applyBrand overlay
campaign btn   ─┼─→ destination.ts +   ─→   lib/email/build-doc.ts  ─→   (client-side)
showcase       ─┤   arrival.ts              recipe lane │ free author         │
lab pick       ─┘   (?recipe=<key>)              │                        3 render engines
seed card ──→ same skeleton, unfilled       resolveSubject                    │
                                            (lake-first)                 send lanes / PDF
```

**Step by step, with the owning file:**

1. **Doors** — `lib/lab-entry/destination.ts` (URL builders) + `arrival.ts` (pure `planArrival()`:
   which doc, which popups, whether to auto-build). EVERY navigation into the lab goes through
   these; `destination.static.test.ts` fails the suite on any raw `/email-lab` nav string. A
   recipe arrival opens the BLANK skeleton (`skeleton-clean-white`) — never the fake-fill demo
   doc. The generic on-mount auto-build is dead (it built the wrong-listing email).
2. **Identity** — `lib/deliverable/recipes.ts` = THE root for what a recipe IS. `RECIPE_KEYS`
   (14 keys as of 07/19/2026 — count the file, don't trust this number later): the 7-recipe
   listing lifecycle (new-listing → just-sold, ONE shared address spine + resolver), 5 area/agent
   recipes (ZIP/city/agent spine — never force the flyer on them), 2 social. Each recipe declares
   `positioning: "sell-side" | "story-side"` and a `ChartPolicy`. Parity across every surface is
   enforced by `recipes.parity.test.ts`.
3. **Dispatch** — `authorDoc()` resolves `recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)`.
   The address reaches the builder from the scope FIELD or the PROMPT TEXT (the lab's campaign
   button seeds only text) — the builder decides, never the door.
4. **Subject resolution** — `resolveSubjectListing()` in `lib/listings/resolve-subject.ts`.
   Lane 0 = LAKE-FIRST (`listing_dom` authority view: house-number + ZIP narrow fetch, canonical
   street match, zero vendor quota). Vendor address-slug + ≤800-row city scan are FALLBACKS only
   (the slug lane is functionally dead — §8). There is ONE resolver; never write a second.
   A miss returns the "paste your link or add a photo" ask — an honest gap, never a placeholder.
5. **Recipe builders** — `lib/deliverable/recipes/*.ts` (per-key builders; prose prompts like
   `authorListingNarrative` live in `recipes/shared.ts`; `FAVORABLE_FRAMING_POLICY` is pasted
   verbatim into exactly THREE prompts — see `lib/deliverable/CLAUDE.md` for which, and which
   two must NEVER get it).
6. **Skeletons / seeds** — `lib/email/doc/default-docs.ts` (`SEED_DOCS`). **THE SLOT RULE:**
   a field whose right answer depends on real data stays EMPTY (`""`) with the instruction in
   the label — `docSkeleton` skips empty fields, so empty = open slot the AI fills, filled =
   "the current answer" it may keep. A label is an instruction, not a caption.
   Playbook: `docs/superpowers/specs/2026-07-08-seed-slot-playbook-handoff.md`.
7. **Validation** — `EmailDocSchema` (`lib/email/doc/schema.ts`) — **strip-mode**: a new prop
   missing from its `*PropsSchema` is silently dropped on every save/load/AI-fill. Every new
   prop gets a schema entry + round-trip test. An invalid recipe build logs a LOUD error and
   falls back to the generic author (a real email — never a refusal, never camouflage).
8. **Truth gates** — `lib/deliverable/claims.ts` (CODE computes every comparison/count/ordering;
   the narrator receives settled sentences — invention is CLAIM-shaped, not number-shaped:
   playbook Part 1–2), `gateNarrative` (`lib/deliverable/build.ts`, the no-invention output
   lint), `narrative-lint.ts`, `assertHeroChartCoherence` (`lib/deliverable/chart-coherence.ts`
   — headline within ~3× of the chart's plotted range; CI over every seed + soft at runtime),
   `lib/email/voice-guard.ts` (product voice — NOT the operator's personal ricky-voice skill).
9. **Charts** — `buildChartForQuestion` (`lib/email/build-doc.ts`). Every plotted number is
   REAL (four-lane); the model selects points, never writes a number. `ChartPolicy` per recipe:
   a chart ONLY when the deliverable is ABOUT a number, about the SUBJECT. Empty chart slot =
   drop the slot. Seeds never author charts — reserve an `image` block; `upsertChartBlock`
   replaces it.
10. **Brand overlay** — runs client-side AFTER authoring. TWO files exist:
    `lib/project/apply-brand.ts` (project side — stamps project tokens like `HERO_LABEL`) and
    `lib/email/brand/apply-brand.ts` (email side). **An overlay fills BLANKS; it never
    overwrites authored content** — `HERO_LABEL` clobbered the authored listing address on
    07/19; the fix (fill only blank/house-default labels) is pinned in `apply-brand.test.ts`.
    Read both files before touching brand behavior.
11. **Save model** — `use-autosave.ts` (5s debounce + `pagehide` keepalive; an empty prompt
    never wipes the stored build prompt) + `use-leave-guard.ts`. Canvas shell:
    `components/email-lab/EmailLabGridShell.tsx` — it surfaces schema-parse failures in both
    build paths (they used to be SILENT; 07/19 fix).

---

## 3. WHERE THINGS LIVE — the component map

| Concern | ONE root | Never |
|---|---|---|
| Recipe identity | `lib/deliverable/recipes.ts` | restate skeleton values there |
| Lab entry/arrival | `lib/lab-entry/` | raw `/email-lab` URLs anywhere |
| Skeletons/seeds | `lib/email/doc/default-docs.ts` | fill data-dependent slots |
| Build engine | `lib/email/build-doc.ts` (`authorDoc`) | a second build path |
| Subject resolver | `lib/listings/resolve-subject.ts` | a second resolver |
| Doc schema | `lib/email/doc/schema.ts` | a prop without a schema entry |
| Tier dial (free/paid) | `lib/email/lab/capabilities.ts` (`FEATURE_ROUTING`/`FONT_ROUTING`) | hardcoding a tier diff in a component |
| Social platform list | `lib/email/social/platforms.ts` (8 display) | confusing it with the 5 PUBLISHABLE channels (`lib/social/channels/index.ts`) |
| Contact segmentation (blast) | `lib/email/segments/` → `contact_segments` | merging with `email_audiences` |
| Audience cache (digest broadcast) | `lib/email/audience-sync.ts` → `email_audiences` | merging with segments |
| CSV export escaping | `lib/email/csv-escape.ts` (escape at EXIT) | sanitizing contacts on import |
| Charts in deliverables | `buildChartForQuestion` | a model writing a number |

**Socials = TWO unwired systems.** `lib/social/` is a complete publish/schedule engine (OAuth,
5 channel adapters, cron, `SOCIAL_PUBLISH_ENABLED` dry-mode default, resvg PNG rasterizer);
`lib/email/social-calendar/` is the lab's Generate-Week (EmailDoc cards, paid-only). The seam
is `SocialModel` vs `EmailDoc`. Confirm which system you're in before building.

---

## 4. THE DESIGN SYSTEM — fonts, sizes, spacing, and where every number came from

The visual rules were **researched for days, written into `app/_design/`, committed — and then
read by ZERO CODE**, because they lived in markdown and markdown cannot be imported. Measured
07/14/2026, before the executable form existed: 17 distinct font sizes in use where the scale
defines 7 · 30 fontWeight declarations, ZERO compliant · `tabular-nums` (required on every
numeric cell) used ZERO times · ~30 text nodes with no lineHeight, silently inheriting
@react-email's injected ABSOLUTE `lineHeight: 24px` — a 36px stat clipped into a 24px box was
the mechanical cause of "the emails look uneven." The lesson is structural: **research that
lives only in a doc does not govern anything; it must become a typed code root that makes
violations uncompilable.**

**The provenance chain — doc → code root → enforced API:**

| Layer | Source doc (the research) | Executable root (what code reads) |
|---|---|---|
| Type scale, weights, leading, tracking, spacing tokens | `app/_design/05-color-and-type.md` | `lib/email/blocks/scale.ts` — every constant cites its doc line |
| Shared weights (email + social) | social-design-root handoff 07/14 | `lib/brand/weight.ts` |
| Fonts (6 families, all engines) | brand-tokens-one-root spec 07/02 | `lib/brand/fonts.ts` — stack + webfontUrl + pdf built-in + canvas face per family; `font-parity.test.ts` |
| Canvas geometry | render-stack research 06/28 | `lib/email/grid-schema.ts` |
| Style atoms / section padding | scale.ts | `lib/email/blocks/styles.ts` (`PAD_Y`, `MUTED`, `BORDER`) |
| Contrast / legible ink | ink-fence spec+plan 07/09 (WCAG floors) | `lib/email/blocks/on-dark.ts` (`legibleInk`); math from `lib/charts/palette.ts` (ONE root) |
| Unbranded seed palette | — | `lib/email/doc/skeleton-style.ts` (`NEUTRAL_SKELETON_STYLE`, grayscale — never ship SWFL navy/teal on an unbranded seed) |
| Brand → tokens | brand-tokens-one-root spec 07/02 | `lib/email/brand/branding-to-tokens.ts` + `apply-brand-style.ts` |
| Charts | `app/_design/07-charts-and-dataviz.md` + taskC chart-type verification 07/01 | `lib/email/templates/charts/chart-defaults.ts` |

**The numbers themselves (from `scale.ts`, which cites `05-color-and-type.md` per line):**
- **Type scale (px):** hero 64 · h1 44 · metric 36 · h2 28 · body 16 · caption 14 · mono 12.
  Seven roles. There is no eighth. A "compact" variant is `compact(role)` — ONE STEP DOWN the
  ladder (operator ruling 07/14: density is a variant, never a second scale, no new numbers).
- **Weights:** 600 display · 500 section-headers/emphasis/mono · 400 body. Never 700/800.
- **Leading:** display (28px+) 1.1 · body 1.55 · caption 1.4 — always unitless, never absolute.
- **Tracking:** −0.015em at display sizes · +0.06em on uppercase labels.
- **Spacing:** 8px base grid, tokens `0/4/8/12/16/24/32/48/64/96` — typed as a union, so an
  off-grid literal is a COMPILE error. Card padding 24 · metric row 12 · table row 8.
- **Numerics:** `tabular-nums` on every figure (`text(role, {numeric: true})`).
- **The API rule:** `text(role)` returns size+leading+weight TOGETHER — you cannot pick a size
  and forget the line-height; the injected-24px bug is unreachable. `statRole()` is the
  importance dial (primary > default > muted, monotonic at every density). `lines(role, n)`
  derives reserved heights — never hand-type a `minHeight`.
- **Scope:** scale.ts unifies RHYTHM, not appearance — color, block order, and what a template
  looks like remain per-template choices (operator ruling 07/14).

**Fonts (policy operator-locked 07/02):** progressive enhancement, auto-safe, no toggles. The
email-safe `stack` is ALWAYS inline; `webfontUrl` is an additive `<Head>` link (~24% of clients
honor @font-face, per caniemail); Outlook is pinned to the stack via `[if mso]` (its @font-face
bug otherwise lands on Times New Roman). Six families; `Record<FontFamily, …>` + `FONT_ROUTING`
(`lib/email/lab/capabilities.ts`) mean a new font cannot ship without a complete entry AND a
tier route.

**Canvas (from the 06/28 render-stack research, values re-verified against vendor docs
in-session that day):** react-grid-layout v2.2.3 · 12 columns · 600px email canvas · rowHeight
30 (advisory — email height is content-driven) · margin [8,8]. Users pick width PRESETS
(Full/⅔/½/⅓ = 12/8/6/4 cols) — the 12-col grid is internal plumbing. `isGridDoc()` (any block
with a `layout`) is what routes a doc to the grid renderer vs the free-tier stack. NOTE: a
07/06 gridstack-migration plan exists in `docs/superpowers/plans/` but gridstack is NOT in
`package.json` — the canvas is still react-grid-layout; treat that plan as not-current.

**Contrast:** WCAG floors 4.5:1 functional text · 3:1 large text (18pt+/14pt+bold) and icons;
decoration exempt. `legibleInk(preferred, bg, floor)` guards every raw brand-ink site at
render; a low-contrast saved palette warns (non-blocking) — saves never blocked, colors never
rewritten.

**Render-stack decisions from the 06/28 research — settled, do not re-evaluate:** react-email
compiles blocks to table HTML (MJML REJECTED — same model, extra binary); Photopea is the
in-browser photo editor (free, iframe, no key); Craft.js for editor state; Graphite is a
design-side SVG tool only (no data injection for 12–18mo); Inkscape is GHA-only (no desktop
binaries on Vercel); GIMP, SendGrid/Twilio, Beefree, Easy Email, Litmus all rejected —
reasons in `docs/superpowers/specs/2026-06-28-email-lab-ai-design-research.md` §8.

---

## 5. RENDER — three engines that disagree

An `EmailDoc` renders through THREE independent engines. A font/style that works on one can
silently fall back on the others. **Any typography or block-style change touches all three.**

1. **Free-tier email** — `lib/email/blocks/EmailDocRenderer.tsx` (`@react-email`). The only
   path that injects the web-font `<link>` in `<Head>`.
2. **Grid-tier email** — `lib/email/compile-grid.ts` (`compileGrid`; used whenever ANY block
   has a `layout`). The 06/29 empty-`<Head>` font gap is FIXED (verified 07/19): both email
   engines build their head from the SHARED `lib/email/blocks/email-head.ts`
   (`emailHeadChildren` + `msoFontPin`) — keep it that way; never hand-build a `<Head>`.
3. **PDF** — `lib/pdf/email-doc-pdf.tsx` (`@react-pdf/renderer`, separate `PdfBlock` switch,
   built-in fonts only unless `Font.register` from a pinned CDN URL — `public/` is not in the
   Vercel lambda fs; unresolved variants THROW).

**Outlook:** SVG icons render as text — use the established fallback, never raw SVG.

---

## 6. SEND — the lanes (separate systems, don't merge)

- **One-off blast** — `ContactPickerModal` → `POST /api/deliverables/[id]/blast`, recipients
  from `contact_segments` (`lib/email/segments/`). Attribute/engagement conditions are
  paid-only, enforced server-side in every `/api/segments*` route. **Block-canvas only**
  (07/19 cut): a deliverable without an EmailDoc gets 422 — rebuild it in the lab.
- **Recurring digest broadcast** — `email_audiences` (tag → Resend segment id cache,
  `lib/email/audience-sync.ts`). Different table, different send path from blast.
- **Outreach** — `lib/email/outreach/` (campaign/send/recipients).
- **Cold email** — SETTLED 07/17: separate NON-Resend provider + separate domain; opt-out
  compliance already built. The 21k DBPR prospect list is PARKED outside the repo until the
  operator lifts it. Do not re-raise the legality objection; only provider wiring remains.
- **Schedulers** — `email-scheduler.yml` (multi-tenant, */15 cron) is LIVE but all
  `email_schedules` rows are paused as of 07/16. The worker (`run-schedules.mts`) is
  **EmailDoc-only** since the 07/19 rip — frozen sequence one-shots + block-canvas
  occurrences; legacy rows error loudly. `daily-email-digest.yml` is DELETED (07/19) — §9.
- **Sender** — verified `hello@swfldatagulf.com` via Resend (`RESEND_API_KEY` in `.env.local`
  + gh secrets). Resend has NO native A/B; DMARC gap noted 06/27.
- **CAN-SPAM = 4 real requirements** (corrected 07/02 — it was wrongly "3" in older docs):
  working opt-out, accurate headers, no misleading subject, AND a valid physical postal
  address in every commercial email. The footer `address` field is its home (from the brand
  profile's `business_address`); the lab nudges non-blocking when empty. No compliance lecture
  in product copy.
- **Paywall** — builds free (watermark only); send is the paywall.
- **Test recipients** — operator inboxes ethanrickyjrjr@gmail.com + allstatecoop@gmail.com.
  `allstatecoop@gmail.com` is a FULLY FICTIONAL demo account: never treat as a real client,
  never send it anything externally-visible.

---

## 7. THE FAILURE CATALOG — why emails have actually broken

Every entry is a class of bug, not just an incident. Check your change against each class.

- **07/20 — the operator received "Under Contract" THREE TIMES, and a formula footnote shipped
  to a real inbox.** Both found by the campaign simulator (§6, `scripts/email/campaign-sim.mts`)
  on its first live run. (1) THREE concurrent sender processes ran the same campaign: the agent
  harness reported two background runs as killed/stopped, the `bun` processes SURVIVED and kept
  sending on their original cadence, and a "resume" was started on top of two live senders.
  Deliverable rows are the proof — `under-contract` built at 20:04:12 AND 20:04:13, one second
  apart, plus a third at 20:15; stages 4–7 each sent 3×. The run-state file did NOT prevent it
  because the duplicate-send guard was read ONCE at startup: that defends re-running a FINISHED
  campaign, not two live processes, and all three held a snapshot taken before the others acted.
  Fix: a PID+heartbeat lock that refuses a second live sender, AND a re-read of run state from
  disk in the moment before each send (the real net — it survives a stale or forced lock).
  (2) `specFootnote` emitted "*Computed from list price ÷ listed square footage." under every
  lifecycle spec strip. Killed by operator decree: $/sq ft is the most self-evident derivation in
  residential real estate and BOTH OPERANDS SIT IN THE SAME STRIP, so the sentence was a developer
  narrating a formula. The surviving rule: **a derived cell earns a note when the derivation is
  NON-OBVIOUS or could be MISREAD** — price-reduced's "previous price = ask + reduction on record"
  (uncheckable from the page) and just-sold's "$/Sq Ft is the SALE price ÷ sq ft" (distinguishes it
  from the list-price version) both keep theirs. CLASSES: *a concurrency guard read once at startup
  is not a concurrency guard — re-read the authority immediately before the irreversible act; a
  reported process kill is a claim, not a fact; provenance is for numbers the reader CANNOT check,
  and explaining arithmetic they can do in their head reads as a spreadsheet export, not an agent.*
  META-CLASS, and the reason this entry exists at all: *the sends were verified against the
  program's OWN state file and declared correct. The inbox — the only authority on what a
  subscriber received — was never checked. Verify a send against the recipient, never against
  your own record of having sent it.*

- **07/19 (fixed 07/20) — sources "accordion" shipped as a wall of text in Gmail; baseline +
  next email were ~99% identical.** Three defects, one inbox review: (1) SourcesBlock's
  `<details>` accordion — Gmail REPLACES `<details>/<summary>` with `<u></u>` (caniemail,
  verified in-session), so the closed accordion rendered permanently expanded; a code comment
  claiming "Gmail honors <details>" was wrong. Fix: email render is compact BY CONSTRUCTION —
  one "Sources (N) — view all" line linking to the report's `#section-sources` (`viewAllUrl`
  prop); the accordion stays canvas-only. (2) The baseline welcome shows ALL current area
  events, alerts bypass cadence, and lifecycle bursts re-fire from the same weekly counts —
  so the next day's "alert" restated the welcome. Fix: every confirmed send stores each shown
  event's `eventKey()` on the subscriber row (`last_event_keys`, migration 20260720); the next
  alert/weekly EXCLUDES them ("nothing_new" reported skip). (3) The heat leaderboard ranked 0
  of 19 areas — momentum needs the PREVIOUS 30-day sold window and the lake's transition
  history starts 07/02, so demanding all four components blanked the block. Fix: a component
  NO area holds drops from the formula for everyone (weights renormalize); a component SOME
  areas hold keeps the strict exclusion. CLASSES: *an email client is not a browser — verify
  interactive HTML per client, not per spec; content-identity dedupe must survive cadence
  bypasses; an all-or-nothing input rule on a young lake silently blanks features.*

- **07/19 — the inventory card served a MONTH-OLD vendor snapshot as "homes for sale now"** (Redfin
  end-of-month 639 for 33908 while realtor.com's public page showed 1,153 — and our own daily sweep
  held 918 the whole time). Labeling the vendor on the card was tried first; operator killed that:
  fix the ROOT, not the caption. `active_inventory` primary now reads `active-listings-swfl`
  (`listing_active_stats`, our daily realtor.com sweep — the data-roots authority) across the ZIP
  page, weekly-read/zip-seed cards, and activation emails; Redfin demoted to a labeled monthly
  cross-check in the rail. CLASS: *when a fresher root we already hold covers the concept, serving
  the staler vendor is a defect — repoint, don't relabel. data-roots names the authority; consumers
  must actually read it.*
- **07/19 — "ALL EMAILS BROKEN" (empty skeleton, `applied: true`).** The vendor's exact-address
  search slug silently degraded to the bare city feed → every address-spine recipe resolved no
  subject → honest empty grid shipped with a 200. Root fix: lake-first resolver (§2.4).
  CLASS: *vendor behavior drifts silently; a lookup for data we already hold is a defect;
  a "success" response with empty output must be surfaced, not returned.*
- **07/19 — brand overlay clobbered the authored address; DOM cell fell back to a dead vendor
  chain; editor-only "KICKER" placeholder leaked onto flyer heroes.** CLASS: *overlays fill
  blanks only; prefer lake-carried fields over vendor re-fetch; editor affordances must never
  render on output paths.*
- **07/16 — digest shipped crime/courts news ("WE AREN'T A NEWS EMAILER ABOUT SWINDLERS").**
  Fix (historical): `NEWS_EXCLUDE` drop-gate BEFORE topic checks in `fetch-digest-data.mts`;
  digest itself killed (§9). The generator — and with it the gate — was deleted 07/19, so any
  future City Voices email consumer must REBUILD the drop-gate before its first send.
  CLASS: *curation must DROP, not rank-to-tail; a $ figure can't launder a crime story.*
- **07/13 — invention is CLAIM-shaped.** Seven workers built seven deliverables; four shipped
  falsehoods with ZERO invented digits (inverted comparison, phantom DOM interval, fabricated
  ordering, "widening" from one level, wrong count, wrong city as subject). Fix: the claim gate
  (`claims.ts`) — code computes relations, the narrator gets settled sentences. Full story:
  playbook Part 1. CLASS: *a digit lint can't see an invented comparison; a confidently wrong
  SUBJECT is worse than a gap.*
- **07/13 — prompt-regex identity killed 15/17 recipes** (only new-listing matched the regex;
  everything else fell to the free author's photo-less grab-bag). Fix: key dispatch. CLASS:
  *identity by string/regex WILL drift; keys are identity.*
- **07/13 — silent recipe-validation fallback** seated a Lee County figure in a NATIONAL
  headline slot, rendered fine, looked fine. Fix: LOUD error on invalid recipe output. CLASS:
  *a fallback that looks like success is the disease wearing a lab coat.*
- **07/14 — the design system existed only as markdown, so nothing obeyed it.** 17 rogue font
  sizes, zero compliant weights, zero `tabular-nums`, ~30 nodes clipped by an invisible
  injected 24px line-height — "the emails look uneven" for weeks. Fix: `scale.ts` (§4), typed
  so violations don't compile. CLASS: *research that lives only in a doc is read by zero code;
  encode it as a typed root or it never happened.*
- **06/29 — grid-tier renderer had an empty `<Head>`** — web fonts silently fell back on the
  paid tier only. CLASS: *three render engines; test the one you didn't change.*
- **06/28 — hand-editing an AI fill** (about to overwrite web-fresh "60 days" with held "72"
  for consistency). CLASS: *forcing a held number over a web-fresh one IS invention; flag
  inconsistencies, never hand-patch.*

---

## 8. VENDOR REALITY (as of 07/19/2026)

**SteadyAPI** (the listing vendor — NEVER surface this name to end users; it's plumbing):
- Quota 50k/mo, 1 req/s live limit — use the headroom, but **real spend only on the final
  serve; mock the dev loop.**
- `/search` returns NO property-type field — property type is a request FILTER only
  (enum value `condos`).
- **Address-slug centering is DEAD** (07/19): `location=<street>_<city>_FL_<zip>` returns rows
  byte-identical to the bare city slug. The lake-first resolver made this survivable; the slug
  lane remains as fallback. Re-probe due ~08/19/2026 (`steady_search_slug_drift_reprobe`
  check) — if permanently dead, delete the lane.
- General lesson: probe vendor behavior LIVE (crawl4ai / direct probe) before building on it;
  a behavior verified once (slug centering, 07/08) can be gone eleven days later.

**Resend:** broadcast/segment lane only (§6). No native A/B. DMARC gap. Never the cold-email
provider.

**Gmail (all platforms):** does NOT support `<details>/<summary>` — the tags are replaced
with `<u></u>`, so nothing interactive-collapsible survives (caniemail HTML5-semantics,
verified 07/19/2026). Email-side "collapsed" content must be compact by construction
(count + link out), never a client-side accordion.

---

## 9. KILL LIST — dead by operator decree; never re-propose, never re-enable

- **Daily digest** — killed 07/16 (workflow disabled + schedules paused); generator island
  permanently DELETED 07/19 on the operator's word. Nothing is left to re-enable — a revival
  is a from-scratch build, ONLY on explicit operator say-so, and must rebuild the
  `NEWS_EXCLUDE` crime/courts drop-gate (§7, 07/16 entry) before any send.
- **Logo.dev / any paid logo vendor** — custom icons = keyless favicon → globe fallback.
- **`labDestination` / `projects[0]` auto-pick** — deleted; `signedInLabArrival` replaced it.
- **Prompt-regex recipe gating** (`isNewListingRecipePrompt`) — deleted; keys are identity.
- **Hand-editing AI fills** — see §7, 06/28.
- **A second subject resolver / second segments table / second social-platform list / second
  render root** — extend the existing root (RULE C2).
- **The email grid builder is the crown jewel** — never kill or bypass it; drive it.

---

## 10. THE RESEARCH SHELF — everything we researched before writing this code

The email system was NOT designed from vibes; each layer has a research artifact behind it.
Before re-deriving, re-crawling, or re-evaluating ANYTHING email, check this shelf — most
"open questions" were answered, verified via crawl4ai, and written down already.

**Committed (in the repo — read these first):**
- `app/_design/` — THE design-doc series (00-START-HERE → 07-charts-and-dataviz +
  QUICK-REFERENCE): product brief, motion rules, surface recipes, color & type (the §4
  numbers' source), voice & microcopy, charts/dataviz, anime.js docs mirror.
- `docs/superpowers/specs/2026-06-28-email-lab-ai-design-research.md` — the render-stack
  research (grid canvas, Photopea, react-email, Graphite, Inkscape + the full rejected list).
  Header says it: "Do NOT re-crawl these topics. Build from here."
- `_ASSISTANT/research/2026-07-01-ai-deliverable-design-quality-research.md` (+
  `design-quality-BCD-handoff`, `taskB-wcag-contrast-verification`,
  `taskC-charttype-verification`, `social-safezone-meta-firstparty-verification`,
  `email-social-ai-pipeline-report`) — the design-QUALITY research: 8pt grid +
  internal≤external spacing, M3 grouping/rhythm, type-scale ratios, WCAG contrast math,
  chart-type selection — all crawl4ai-verified with sources.
- `_ASSISTANT/research/2026-07-01-listing-lifecycle-marketing-research.md` — the lifecycle
  recipes' marketing research.
- `_ASSISTANT/research/2026-07-15-*` — sell-side copywriting / anti-drift / authority trio
  behind `FAVORABLE_FRAMING_POLICY`.
- `docs/superpowers/plans/2026-07-08-ai-design-and-email-marketing-hacks-sweep.md`,
  `2026-07-09-email-ink-fence-and-palette-gate.md`, `2026-06-29-email-lab-text-styling.md`,
  `2026-07-06-email-grid-gridstack-*` (NOT executed — §4) — the design/build plan trail.
- `docs/standards/deliverable-playbook.md` + `docs/standards/email-images.md`.

**Local-only (gitignored — on this machine, never committed):**
- `docs/steadyapi-research/STEADY-PAINS.md` — THE distilled buyer/seller/agent pain reference
  (weighted, quoted, mapped to what we already hold). Load it whenever writing to customer
  pains. Standing rule: fold every new research round into it or it's stale.
- `docs/steadyapi-research/2026-07-17-*.md`, `2026-07-18-*.md`, `2026-07-19-20-users-launch-kit.md`
  — the dated evidence trail (landscape scans, execution briefs, launch kit).

Distilled PROCESS facts (vendor behavior, pipeline shape, design constants) belong in this
committed map; strategy content stays local. Nothing matching `*crawl4ai*` is ever committed.

---

## 11. VERIFY BEFORE YOU CLAIM ANYTHING WORKS

1. `bun test` the touched surfaces — `lib/email` + `lib/deliverable` + `lib/listings` is
   ~2,800 tests as of 07/19 and runs in seconds. Recipe touched → `recipes.parity.test.ts`.
   Seed touched → `preview-fill.test.ts` (chart coherence CI).
2. `bunx next build` — NOT `npx tsc` (the ruled verification command).
3. **A code fix is NOT live until it's deployed/rebuilt.** Verify served bytes / the rendered
   canvas on prod, not the diff. Open a `checks` live-verify entry for anything you can't
   verify this session (RULE 2.4 — no silent deferrals).
4. Real vendor/API spend only on the final serve; mock the dev loop.
5. Live-verify IN THE LAB by driving the builder (one-line prompt, then observe) — never by
   hand-assembling the doc you wish it had built.
