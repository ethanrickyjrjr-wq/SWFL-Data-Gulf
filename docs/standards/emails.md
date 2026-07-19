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
   Any font or block-style change must touch ALL THREE. §4.
6. **Send lanes are separate systems.** Blast (segments) ≠ digest broadcast (audiences) ≠
   outreach ≠ cold email. Don't merge them. §5.
7. **Builds are free; SEND is the paywall** (watermark only, no Stripe on creation).

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
   (the slug lane is functionally dead — §7). There is ONE resolver; never write a second.
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

## 4. RENDER — three engines that disagree

An `EmailDoc` renders through THREE independent engines. A font/style that works on one can
silently fall back on the others. **Any typography or block-style change touches all three.**

1. **Free-tier email** — `lib/email/blocks/EmailDocRenderer.tsx` (`@react-email`). The only
   path that injects the web-font `<link>` in `<Head>`.
2. **Grid-tier email** — `lib/email/blocks/compile-grid.ts` (`compileGrid`; used whenever ANY
   block has a `layout`). As of the 06/29 audit it emitted an EMPTY `<Head>` — web fonts
   silently fall back. Verify current state before typography work. Inline block CSS carries
   (reuses `BlockRenderer`).
3. **PDF** — `lib/pdf/email-doc-pdf.tsx` (`@react-pdf/renderer`, separate `PdfBlock` switch,
   built-in fonts only unless `Font.register` from a pinned CDN URL — `public/` is not in the
   Vercel lambda fs; unresolved variants THROW).

**Outlook:** SVG icons render as text — use the established fallback, never raw SVG.

---

## 5. SEND — the lanes (separate systems, don't merge)

- **One-off blast** — `ContactPickerModal` → `POST /api/deliverables/[id]/blast`, recipients
  from `contact_segments` (`lib/email/segments/`). Attribute/engagement conditions are
  paid-only, enforced server-side in every `/api/segments*` route.
- **Recurring digest broadcast** — `email_audiences` (tag → Resend segment id cache,
  `lib/email/audience-sync.ts`). Different table, different send path from blast.
- **Outreach** — `lib/email/outreach/` (campaign/send/recipients).
- **Cold email** — SETTLED 07/17: separate NON-Resend provider + separate domain; opt-out
  compliance already built. The 21k DBPR prospect list is PARKED outside the repo until the
  operator lifts it. Do not re-raise the legality objection; only provider wiring remains.
- **Schedulers** — `email-scheduler.yml` (multi-tenant, */15 cron) is LIVE but all
  `email_schedules` rows are paused as of 07/16. `daily-email-digest.yml` is DISABLED — §8.
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

## 6. THE FAILURE CATALOG — why emails have actually broken

Every entry is a class of bug, not just an incident. Check your change against each class.

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
  Fix: `NEWS_EXCLUDE` drop-gate BEFORE topic checks in `scripts/email/fetch-digest-data.mts`;
  digest itself killed (§8). CLASS: *curation must DROP, not rank-to-tail; a $ figure can't
  launder a crime story.*
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
- **06/29 — grid-tier renderer had an empty `<Head>`** — web fonts silently fell back on the
  paid tier only. CLASS: *three render engines; test the one you didn't change.*
- **06/28 — hand-editing an AI fill** (about to overwrite web-fresh "60 days" with held "72"
  for consistency). CLASS: *forcing a held number over a web-fresh one IS invention; flag
  inconsistencies, never hand-patch.*

---

## 7. VENDOR REALITY (as of 07/19/2026)

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

**Resend:** broadcast/segment lane only (§5). No native A/B. DMARC gap. Never the cold-email
provider.

---

## 8. KILL LIST — dead by operator decree; never re-propose, never re-enable

- **Daily digest** — `daily-email-digest.yml` disabled 07/16 + schedules paused. Re-enable
  ONLY on explicit operator say-so with content quality signed off.
- **Logo.dev / any paid logo vendor** — custom icons = keyless favicon → globe fallback.
- **`labDestination` / `projects[0]` auto-pick** — deleted; `signedInLabArrival` replaced it.
- **Prompt-regex recipe gating** (`isNewListingRecipePrompt`) — deleted; keys are identity.
- **Hand-editing AI fills** — see §6, 06/28.
- **A second subject resolver / second segments table / second social-platform list / second
  render root** — extend the existing root (RULE C2).
- **The email grid builder is the crown jewel** — never kill or bypass it; drive it.

---

## 9. LOCAL-ONLY RESEARCH (gitignored — on this machine, never committed)

The research behind email/product decisions is deliberately kept out of GitHub
(`.gitignore`: `docs/steadyapi-research/`, `*crawl4ai*`). It exists — go read it locally
instead of re-deriving:

- `docs/steadyapi-research/STEADY-PAINS.md` — THE distilled buyer/seller/agent pain reference
  (weighted, quoted, mapped to what we already hold). Load it whenever writing to customer
  pains. Standing rule: fold every new research round into it or it's stale.
- `docs/steadyapi-research/2026-07-17-*.md`, `2026-07-18-*.md`, `2026-07-19-20-users-launch-kit.md`
  — the dated evidence trail (landscape scans, execution briefs, launch kit).
- `_ASSISTANT/research/2026-07-15-*` — the sell-side copywriting / anti-drift / authority
  research trio behind `FAVORABLE_FRAMING_POLICY`.

Distilled PROCESS facts (vendor behavior, pipeline shape) belong in this committed map;
strategy content stays local. Nothing matching `*crawl4ai*` is ever committed.

---

## 10. VERIFY BEFORE YOU CLAIM ANYTHING WORKS

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
