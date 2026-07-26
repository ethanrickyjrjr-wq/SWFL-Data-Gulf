# HANDOFF — Compose Insiders Edition Issue No. 001 (written 07/26/2026, pre-press session)

You are composing the FIRST issue. Everything is collected; nothing is written. This doc is the
exact start order. The operator pasted this to start you — treat it as the decree to build.

## 0. Read order (do not skip; do not re-collect what is already banked)

1. `_FABLE5/FABLE5.md` (desk boot) → `_FABLE5/playbook.md` (craft rules) — read BEFORE authoring.
2. `_FABLE5/collection/2026-07.md` — the whole file. The 07/16 + 07/19 + 07/26 sections are the
   issue's raw material: thesis, numbers audit, copy gates, atlas pairs, rate/cash/insurance
   research, chart plan. The 07/26 section is the final pre-press bank.
3. `_FABLE5/desk/2026-07.md` — the month's picks with weights (the 07/26 triage has the two [4]s
   the fact-check section leads with).
4. Spec `docs/superpowers/specs/2026-07-10-insiders-edition-design.md` + plan
   `docs/superpowers/plans/2026-07-10-insiders-edition-plan.md`.
5. `docs/standards/data-roots.md` top section before any number you re-pull.

## 1. Prerequisites — verify, then proceed

- Brains rebuilt 07/26 (chain green; billing outage over). Confirm the live as-of is current
  before composing: fetch the master speak view and read its as-of line.
- The narrative-bake leg is RED by a known, unrelated defect (5 surfaces vs no-invention
  validator; prior text serves). Ignore for the issue.
- June ZHVI tier data had NOT landed as of 07/26 (`data_lake.tier_divergence_swfl` max
  2026-05-31). Check again; if June landed, refresh the lead-chart series + YoY lines and say
  June. If not, the banked May series stands — label May, no apology.
- Two commits may be local-only (`863918c6`, `88a41599` — desk/collection/atlas/chart frames).
  If `git log origin/main..HEAD` shows them unpushed, ask the operator to push before compose.

## 2. The issue, fixed points (already decided — do not re-litigate)

- ONE thesis: **bifurcation** — the market reprices down while the top tier falls least; the
  record prints are thin-sample mix riding cash. Sub-threads (max two): FMB re-capitalization,
  access repricing. Anything not serving these demotes to The Tape or dies (keeps for August).
- Six legs already banked, each independent: ZHVI tier gaps · cut:raise events · ZORI rent map ·
  SOH lock-in · Lehigh sole inventory riser · NABOR 61% cash vs NAR 25% national.
- Architecture: masthead "Issue No. 001 · July 2026 · SWFL" (canonical page never changes after
  send) → The Tape (12–15 one-line sourced numbers, zero commentary) → THE LEAD (bifurcation) →
  "What the papers said / what the ledger says" (the 07/23 "coldest housing markets" story vs
  Lee −11.25% sold 3Y / Naples −1.57% / tier data — cold is real, uniform cold is false) →
  ONE COMMUNITY ATLAS (7 cities × top/entry pairs, spread ratios; collection 07/26 §1; the gap
  itself bifurcates: 242x coastal → 4.6x inland) → THE WATCH (Marco Hilton decision 07/31 · APF
  lease council vote · FMB resort milestones — each with what we expect + what proves us wrong)
  → falsifier ledger (every [INFERENCE] preregistered: base, direction, falsifier, grade-by
  date; Issue 002 grades them in print) → RECEIPTS CLOSER (count the issue's own audit: N
  numbers, M named sources, zero invented, four lanes, county-to-community grain — "everything
  above was built the way your emails and reports get built").
- ATLAS GATE: present the pair table (collection 07/26 §1, including the recommended swaps —
  Miromar Lakes for Fort Myers, Ibis Landing for Lehigh, Ville de Marco for Marco entry) to the
  operator for sign-off BEFORE composing that section. Check: `insiders_atlas_pair_signoff`.

## 3. Copy gates (all hard-won; violating any one is the fact-check section's own crime)

- ZHVI = "typical-value tier index", ZORI = "rent index" — NEVER "median".
- TDT: trailing-12-month or Lee-only. Never "combined April".
- Active counts labeled: "active listings incl. land & commercial" (~29.5k class) vs unqualified
  = homes-only. Never mixed.
- ONE price-cut stat per section, labeled (Realtor 17.5% falling · Redfin 40.84% rising · our
  lake's cut:raise events — different animals). FRESH PULL REQUIRED: 07/26 live event window
  read Lee 3,283:292 (~11:1), Collier 1,006:125 (~8:1) — events began 07/01, so windows and
  the banked 07/16 figures are NOT comparable; re-pull at compose and cite one, labeled.
- Two clocks stated explicitly: market-heat "tightening vs last year" beside seller-stress
  "elevated vs 2019–21" — both true, incompatible baselines, say so.
- Sold-anchor scope labels always: Realtor "Naples" $625,000 (postal, all types) vs Redfin City
  of Naples SFR $4,425,000 (40 sales) — never adjacent unlabeled.
- Lehigh Acres = CITY grain only. Communities compare only to communities (grain-matched).
- Sources: full list in a CLOSED ACCORDION at the bottom; marquee names (Realtor.com, Zillow,
  Freddie Mac, FDOR, FEMA, Redfin, NABOR, Citizens/FLOIR) may be name-dropped inline. As-of
  dates MM/DD/YYYY, once. No system nouns, no internal ids, no jargon.
- Every number stated: re-pull LIVE at compose (brains are 07/26; the collection's banked values
  are anchors and drift alarms, not print-ready copies).

## 4. Charts — the law of this session

- RENDER THROUGH THE REAL BKLIT ESTATE ONLY. `components/charts/vendor/bklit/` +
  `renderBklitStaticSvg` (see `email-svg.tsx` for the two proven producers and the category
  new Date() trap). NEVER hand-roll a plain SVG imitation — that mistake is why this line
  exists. Dark press treatment proven 07/26 (see the Listed→Sold artifact).
- The four (cap ~4, bench the rest): (1) LEAD zhvi-area — real bklit AreaChart, top vs starter
  tier, series banked at `_FABLE5/collection/zhvi-tier-series-2026-07.json` (33907 tells it
  hardest: starter −31.6% from peak vs top −17.7%); (2) papers-vs-ledger dot-plot (cross-coast
  thin-sample medians); (3) two-clocks z-gauge pair; (4) atlas gap — bklit bars of the per-city
  multiples, or the new `dumbbell-gap` frame (skeleton in `lib/charts/svg/`, collision-fixed) if
  it gets a bklit-grade dark skin first.
- The LOGO is `public/logo-mark.png` (three graded waves) via the house-brand default. Never
  draw the mark, never improvise brand.

## 5. Process + money

- `bun scripts/email/insiders-run.mts --month 2026-07` — DRY_RUN default; paid authoring ONLY
  with `INSIDERS_LIVE_AUTHOR=1` (≤ $20/issue ledger). Preview + spend ledger land in
  `runs/insiders-runs/<stamp>/`.
- Voice charge (playbook + collection 07/16 §6): Thompson pace, Nature numbers, Chronicle
  paragraphs, ATTOM/CoStar vocabulary. Drama in rhythm, never in figures; extremes stated
  plainly BECAUSE they're big; falsifiers mandatory on every inference; zero hedging on
  computed facts.
- Sends are operator commands only (`INSIDERS_APPROVED=1` + postal + From). CAN-SPAM: a REAL
  postal address must render — the placeholder-leak defect (`flyer_canspam_placeholder_sent`)
  is exactly what must not recur. After send: retro from `retro/TEMPLATE.md`, promotions →
  checks, same session.
- The Listed→Sold teaser artifact (built 07/26, real bklit + real logo) is the post-issue
  announcement candidate — do not fold it into the issue.

## 6. Order of work for THIS session

1. Verify prerequisites (§1). 2. Atlas sign-off (§2 gate) — the ONE operator question, ask it
first with the table. 3. Re-pull every stateable number; note drifts vs the collection bank.
4. DRY compose → preview → hand the operator the preview path + the spend ledger. 5. Stop.
The live author run and the send are his buttons, not yours.
