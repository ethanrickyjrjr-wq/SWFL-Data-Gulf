# Predictive analytics + lead-mining models — how it's done, what we hold, what to build

**Date:** 07/22/2026 · **Trigger:** operator — "crawl4ai predictive analytics and lead mining
models… really figure it out… how it's done, what new data we need, what data we hold, what
system we need built better."

**STATUS: RESEARCH, NOT A PLAN.** Nothing in this file is approved. The only approved and moving
model on this platform is the sell-odds discrete-time hazard model
(`docs/superpowers/specs/2026-07-19-sell-odds-model-design.md`, Phase 0 done). This file does not
reopen it. Anything below tagged **[CANDIDATE]** still owes `superpowers:brainstorming`, a
failure-modes section, and operator sign-off before a line of code. Do not inherit this as a plan —
that is the documented LittleBird failure mode.

---

## ADDENDUM 07/22/2026 — the training substrate stopped accumulating three days ago

**Measured live this session. This invalidates §1a's "train now rather than wait for
late-September cohorts" premise until it is fixed.** Not a modelling problem; a dark clock.

Verified chain, end to end:

1. Commit `185810fd` (07/12, *"CRON CUTOVER — nightly-chain is the sole clock; 12 standalone cron
   lines retired"*) commented out the `schedule:` blocks in **both**
   `.github/workflows/listing-lifecycle-daily.yml` and `active-listings-daily.yml`.
2. **`nightly-chain.yml` — the new sole clock — is disabled at the API.** The session-start tripwire
   flags it YELLOW ZOMBIE CRON, but frames it only as "the registry expects rows it will never get."
   Nobody connected it to the label supply.
3. Last `nightly-chain` run: **07/19 04:23** (repository_dispatch, 58m30s, success). It wrote
   `listing_state.last_seen = 07/19 04:28:56`. Exact match — that is the freeze point.
4. Since then: **zero `listing_transitions` in 3 days**, against 3,846 in the prior 7.
   `listing_transitions` max(at) = 07/19, total 55,045.

**Why no surface caught it:** both workflows still report `active` in `gh workflow list` — the cron
is dead in *source*, not at the API. That is the exact inverse of the zombie-cron pattern the
tripwire tests for, so it passes every status check while delivering nothing.

**Correction to the open check:** `listing_transitions_label_stall_since_0719` hypothesised the
07/21 PostgREST outage. **Disproven** — the stall starts 07/19, two days before it.

**The second-order finding, which is the actual deadline.** `listing_week` is currently *healthy*:
the 07/20 Monday run wrote 33,397 rows stamped `week_start = 07/13`, correct by design (it stamps
the week it covers). Three clean weeks on file: 06/29 → 30,849 · 07/06 → 31,844 · 07/13 → 33,397.
But the panel builds **from `listing_state`**. With state frozen at 07/19, the **07/27** Monday run
writes a full week of plausible, well-formed person-period rows in which nothing ever sells — from
stale state, with no error. That is §7 failure mode 1 and the check's own phrase *"a stalled labeler
is indistinguishable from 'nothing sold'"* arriving as silently-poisoned training data rather than a
visible gap. **A green pipeline writing confident wrong labels is worse than a red one.**

**Not fixed here — ask-first (RULE 1):** re-enabling a cron plus a catch-up sweep means paid
SteadyAPI vendor calls and `data_lake.*` writes. Operator's call, and the *why* matters: the crons
were retired deliberately, so the fix is to restore the clock (re-enable `nightly-chain`), not to
un-comment the 12 retired lines and undo the cutover.

---

## THE SPINE — read this if you read nothing else

**We already hold every feature a propensity-to-list model runs on, except the identity and the
mailing address.**

Probed live 07/22/2026 against `ingest/pipelines/lee_parcels/constants.py` and
`ingest/pipelines/collier_parcels/constants.py`:

- **Tenure** — `SALE_YR1`/`SALE_MO1`/`SALE_PRC1` **and** `SALE_YR2`/`SALE_MO2`/`SALE_PRC2`. We hold
  the last **two** sales per parcel. Years-since-last-sale is the single most-used feature in every
  commercial propensity-to-list model, and we have it plus the prior-transaction delta.
- **Equity proxy** — `JV` (just/market value) against the recorded sale price, per parcel.
- **Owner-occupancy / absentee proxy** — `JV_HMSTD` / `AV_HMSTD`. Florida homestead exemption
  requires permanent residency, so **not-homesteaded is a defensible absentee/second-home/investor
  proxy** without touching a single owner field. Live counts per `docs/standards/data-roots.md:70`:
  Lee is 211,838 homesteaded of 556,083 parcels — the non-homesteaded remainder is a very large
  population in a second-home market.
- **SOH lock-in** — the `jv_hmstd − av_hmstd` gap (Lee median 31.6%, `lee_parcels_summary`). This is
  a *negative* propensity signal nobody else models: Save-Our-Homes lock-in plausibly suppresses
  sell-through, and we hold the portability chain to quantify the cost of moving.
- **Property attributes** — `ACT_YR_BLT`, `EFF_YR_BLT`, `DOR_UC`/`PA_UC` use codes, `NO_BULDNG`,
  living area, land value.
- **Outcomes to train on** — `listing_week` (weekly person-period panel, backfilled live 07/19,
  30,849 + 31,844 rows), `listing_transitions` (event log from 06/27/2026), `listing_dom`.

**What we deliberately do not hold:** the 14 owner/fiduciary fields (`OWN_*` / `FIDU_*`) — owner
name and owner mailing address. Verified zero matches in both pipelines' `OUT_FIELDS`.
`ingest/cadence_registry.yaml:934` states it plainly: *"120 fields total, 102 now pulled… Remaining
18-field gap is deliberate: 14 owner/fiduciary PII fields (OWN_*/FIDU_*)…"*

So the gap between us and SmartZip/CoreLogic/Datazapp is **not modelling capability and not
features. It is identity resolution and contactability** — and that was a policy choice, not a
technical limit.

### Where the missing identity actually lives (and it's already half-built)

`lee_deed_official_records` — **parked**, `ingest/cadence_registry.yaml:2169`. Its decoded schema
already includes **`grantors[]` and `grantees[]`** — real names — plus `consideration` (sale price),
`record_date`, `doc_type`, `legal_full`, `subdivision`, and a derived `parcel_strap` that joins
`lee_parcels`. Two facts from its own `source_scope` matter enormously here:

1. **Doc types beyond DEED are available and not pulled** — verbatim: *"doc types beyond DEED
   (MORTGAGE, LIEN, CERTIFICATE OF TITLE, PLAT, …) are available but not currently pulled."*
   Those are precisely the distress/life-event triggers the lead-gen industry monetizes.
   **Certificate of Title = completed foreclosure. Lien = distress. Mortgage = new financing
   event.** This is the highest-value unpulled data on the platform for this purpose.
2. **The blocker is access, not permission** — Akamai blocks unattended access to `or.leeclerk.org`
   (crawl4ai + CDP Chromium + curl + curl_cffi-Chrome-TLS all failed 07/20/2026). LOAD is
   automatable; FETCH is manual. Operator directive 07/20: backfill a little at a time.

And the legal posture is favorable: **FS 501.702(19) excludes "publicly available information" from
the definition of "personal data"** (crawled 07/22/2026, flsenate.gov). County deed records and the
FDOR parcel roll are public record.

---

## THE FORK — decide who the output points at before anything else

"Lead mining" has two readings and they diverge hard. Same math; completely different product,
different compliance surface, different strategic position.

**Fork A — mine leads for US (customer acquisition).**
Who do we sell to. Two sub-lanes, both with real assets already:
- **Agents as customers** — `dbpr_re_licensees` is live: ~30,100 Lee+Collier individual RE agents
  (Lee 18,015 / Collier 12,085), weekly Monday cron, with name, mailing address, license dates,
  status, employer. Feeds `public.new_re_agents` for the new-agent outreach radar. **Verified
  ceiling: no email or phone anywhere in `RE_rgn7.csv` (23 columns, mailing address only), and the
  DBPR online detail page doesn't render email either** — email is public record obtainable only via
  a Chapter 119 records request, tracked outside that pipeline. Related: the 21k DBPR prospect list
  parked outside the repo; cold email is settled (separate provider + separate domain) — do not
  re-raise the AUP question, only operational wiring remains.
- **Owners as customers** — propensity scoring to find homeowners likely to transact, then market
  our seller-side product to them. **This is the lane that carries the fair-housing exposure in
  §6.** Read it before liking this idea.

**Fork B — the scoring capability AS the product.**
We compute the score and show it to the person it describes. Our own 07/17 landscape research
(`_RESEARCH/competitor-and-strategy/2026-07-17-buyer-seller-agent-augmentation-landscape.md`) is
unambiguous that this is the validated whitespace, and it is the direction the platform is already
pointed: Homebot ships a "Likely to Sell Score" (ML over 150M+ rows) that displays on the *agent's*
clients tab, never the homeowner's own report; CoreLogic's "Sell Score" is a 0–1000 propensity-to-
list value shipped as a searchable MLS attribute for agent farming; Datazapp sells a "Home Seller
Score" at $0.025–$0.04/record in 5 tiers to nine buyer types — agents, lenders, investors,
roofers, recruiters — everyone except the homeowner it describes. One industry source states the
stress score is *"deliberately not included in shared reports, since those exist specifically to help
agents negotiate, not to be shown to the person they describe."*

**My read:** Fork B is where our prior research, the seller-stress whitespace, and the existing
approved sell-odds spec all already point, and it is the lane where our *missing* identity data
stops being a weakness — a homeowner who asks about their own address hands you the identity
voluntarily. Fork A's owner sub-lane requires exactly the PII we deliberately excluded and buys us
the fair-housing problem the incumbents have. Fork A's *agent* sub-lane is cheap, already built, and
uncontroversial. Ricky steers; both stay in the file.

---

## 1. How it's actually done — the method layer

Four distinct model shapes get lumped under "predictive analytics." Confusing them is the most
common way these builds go wrong.

### 1a. Time-to-event (hazard) — "will this sell, and when?"

Already our approved lane. Discrete-time survival: each listing-week is one training row
("given still active at week N, did it sell during N+1?"), any binary classifier estimates the
per-interval conditional hazard, censoring is native, 90-day odds compound 13 weekly hazards.
Named source in the spec: *"Survival prediction models: an introduction to discrete-time
modeling,"* BMC Medical Research Methodology (2022),
https://link.springer.com/article/10.1186/s12874-022-01679-6.

Why it beats a flat classifier: listings that haven't resolved yet still teach the model. With
labels starting 06/27/2026, that's the difference between training now and waiting for
late-September mature cohorts.

Note the corroboration already on file: `docs/superpowers/plans/2026-06-14-redfin-data-strategy/
findings-algorithms.md` independently surfaced **Cox proportional hazards for listing survival** and
**foreclosure-auction lead indicators** from the housing-signal literature. Same family, arrived at
twice, from different directions.

### 1b. Propensity / lead scoring — "who is likely to transact at all?"

The commercial category. Structurally it's a binary classifier over household + property + market
features, scored for everyone, ranked, and sliced into tiers (Datazapp's 5, CoreLogic's 0–1000).
Standard feature families, and our coverage of each:

- Tenure since last sale — **HELD**
- Equity / LTV — **PARTIAL** (equity proxy from JV vs sale price; no mortgage balance)
- Owner-occupancy / absentee — **HELD** (homestead proxy)
- Property attributes, age, type — **HELD**
- Local market velocity — **HELD** (richest part of our stack)
- Life events: death, divorce, probate, foreclosure, new mortgage — **NOT HELD** (this is the
  unpulled deed doc-type set — §3)
- Demographics, household composition, income — **NOT HELD, and mostly should stay that way** (§6)
- Behavioral intent: CMA requests, valuation-page visits — **NOT HELD but cheaply buildable from
  our own first-party traffic**, and it's the highest-signal, lowest-risk feature class available.
  Homebot's model uses exactly this.

### 1c. Uplift / incrementality — "who is likely to transact BECAUSE we contacted them?"

The method the entire lead-gen industry sells around and does not actually do. Verbatim from
https://en.wikipedia.org/wiki/Uplift_modelling (crawled 07/22/2026), Radcliffe's four segments:

- *The Persuadables* — respond only because they were targeted
- *The Sure Things* — would have responded anyway
- *The Lost Causes* — won't respond either way
- *The Do Not Disturbs / Sleeping Dogs* — **less likely to respond because they were targeted**

And the load-bearing sentence: *"Traditional response modelling often targets the Sure Things,
being unable to distinguish them from the Persuadables."* A propensity score sold as a lead list is
a response model. It systematically bills agents for contacting people who were going to list
anyway.

Implementation is off-the-shelf: `causalml` (Uber) ships S-, T-, X-, and R-Learner meta-learners
plus uplift random forests on KL-divergence / Euclidean / Chi-square / ΔΔP / IDDP splitting criteria
(https://causalml.readthedocs.io/en/latest/methodology.html, crawled 07/22/2026).

**The catch, and it's fatal to a naive version:** uplift requires a randomized control — a holdout
of people you deliberately do *not* contact. Without it you are not measuring uplift, you are
measuring correlation and calling it causation. That is a real constraint on a small operation, but
it is also the only honest version of "our leads convert better."

### 1d. Valuation / regression — "what is it worth, how long will it take?"

The AVM lane (Zestimate, Redfin Estimate, HouseCanary, ClearAVM). Crowded, commoditized, and our
07/17 research found the genuinely open slot is adjacent and unclaimed: **nobody predicts
sale-to-list ratio forward for a specific active listing** — it exists only as a backward-looking
aggregate.

The clustering variant is already settled: see `_RESEARCH/real-estate-market/
2026-07-22-kmeans-clustering-applicability.md`. Two-stage cluster→per-cluster-interpretable-model is
the one legitimate use (WI25 paper, 43,309 listings, 36–58% MAE gain), parcel grain only, cluster
never a user-visible label. Do not re-litigate. Same for KNN/Naive Bayes — settled 07/13 and
re-confirmed 07/22, see `_RESEARCH/data-and-ingest/2026-07-22-naive-bayes-knn-algorithm-fit.md`.

### 1e. The three method traps that decide whether any of this is honest

**Calibration.** A ranked score can be perfectly ordered and completely wrong about magnitude. Since
we serve numbers to consumers, calibration is not optional. From
https://scikit-learn.org/stable/modules/calibration.html (crawled 07/22/2026), verbatim and
directly relevant:

- *"A lower Brier loss… does not necessarily mean a better calibrated model, it could also mean a
  worse calibrated model with much more discriminatory power."* — Brier alone is **not** a
  calibration gate. Decompose it, or pair it with a reliability curve. The sell-odds spec's gate
  ("Brier score + reliability curve documented in the training report") is correctly specified;
  this is the source that says why the second half matters.
- Reliability diagrams bin predictions and plot fraction-of-positives against mean predicted
  probability — that is the actual calibration evidence.
- Two correction methods: `"sigmoid"` (Platt) and `"isotonic"`. Vendor's own guidance: isotonic
  *"will perform as well as or better than sigmoid when there is enough data (greater than ~1000
  samples) to avoid overfitting"*; it is *"more prone to overfitting, especially on small
  datasets."* Also — isotonic introduces ties and can move AUC; sigmoid is strictly monotonic and
  preserves ranking.
- Sigmoid *"can be a problem for highly imbalanced classification problems, where outputs do not
  have equal variance."* Weekly sell hazard is exactly that.

**Leakage.** From https://scikit-learn.org/stable/common_pitfalls.html (crawled 07/22/2026),
verbatim: *"Data leakage occurs when information that would not be available at prediction time is
used when building the model."* Vendor's own rules: split first, before any preprocessing; learn
transforms from train only; use a Pipeline so CV can't cheat; feature selection on train only.

Our specific exposures, which are worse than the generic case:
- `listing_week` freezes features as-of each week for exactly this reason — that design is correct,
  don't undo it.
- **Time-based split only.** The sell-odds spec already locks this ("train on weeks ≤ T, validate on
  weeks > T — never random split"). A random split over a person-period panel leaks the same
  listing's future into its own past.
- A parcel-grain join to `lee_parcels`/`collier_parcels` must use the assessment vintage that was
  current *at that week*, not today's roll.

**Class imbalance.** Weekly sell hazard is a rare-event problem (195 sold / 43 withdrawn / 9,101
holding transitions as of 07/19/2026). Resampling changes the base rate and therefore destroys
calibration unless you correct back — which is why the honest move for a probability we intend to
*print* is class weights + calibration, not SMOTE. `imbalanced-learn` exists if needed
(https://imbalanced-learn.org/stable/introduction.html).

---

## 2. What the industry actually sells

From our own 07/17/2026 landscape pass (all crawled directly then; vendor homepages re-crawled
07/22/2026 returned JS shells with no content — the 07/17 findings stand as the sourced record):

- **Homebot** — "Likely to Sell Score," ML over 150M+ rows (CMA requests, equity, rate, tenure,
  demographics), predicts listing likelihood in the next 9 months. 8M+ homeowners reached via
  monthly digests distributed through loan officers/agents. **Score shows on the agent's clients
  tab, not the homeowner's report.**
- **CoreLogic Realist "Sell Score"** — 0–1000 propensity-to-list, shipped as a searchable MLS
  attribute for building farming lists.
- **Datazapp "Home Seller Score"** — $0.025–$0.04/record, 5 propensity tiers, sold to nine
  categories of buyer, none of them the homeowner.
- Also named in that pass: SmartZip, Offrs, Catalyze AI, Likely.AI, Revaluate, Remine, BatchData,
  Prospektr.ai, DealPredictor, LeadFlow, Goliath.
- **RedX** sells expired/cancelled-listing win-back leads to agents — an event our own
  `listing_transitions` state machine already tracks.

Two structural observations worth more than the vendor list:

1. **Price anchors the whole category at $0.025–$0.04 per record.** Any Fork-A "sell lists" idea is
   entering a market where the unit price is fractions of a cent and the incumbents have national
   coverage. Rule 11 applies hard: we hold two counties. We cannot win a list-volume business.
2. **The category's entire value proposition is contactability, which is the one thing we don't
   have.** They sell name + mailing address + phone. We have neither the identity fields nor the
   phone. Competing on their axis means acquiring exactly the PII we excluded on purpose.

---

## 3. What new data we'd need — sized, ranked by value-per-unit-of-pain

**1. Deed doc types beyond DEED — MORTGAGE, LIEN, CERTIFICATE OF TITLE.** Highest value on the
list. These are the life-event/distress triggers the entire lead industry monetizes, they carry
names, they join to parcels via `parcel_strap`, and they are public record (so outside FS
501.702(19)'s "personal data"). The pipeline decoder already exists. Blocker is the Akamai fetch
wall, not permission or schema. **[CANDIDATE]**

**2. First-party behavioral intent.** Who looked up their own address, requested a valuation, opened
a digest, returned three times in a week. Homebot's model runs on exactly this. It is
self-generated, needs no vendor, carries no acquisition cost, and is *consented* — the person came
to us. Strongest signal-to-risk ratio available. **[CANDIDATE]**

**3. Collier deed/official records.** We hold Lee only (parked). Collier is the second core county
and `collier_clerk.com` was crawlable 07/22/2026 where Lee's was not — worth a liveness probe.
**[CANDIDATE]**

**4. Mortgage balance / origination.** Turns our equity *proxy* into real equity. Partially derivable
from the deed MORTGAGE doc type in item 1 (original amount + date + rate era → amortization
estimate). Do not buy this; derive it.

**5. Owner name + mailing address (`OWN_*`).** Technically one line in `OUT_FIELDS`. **Deliberately
excluded, and I am not recommending reversing that** — it converts every downstream surface into a
PII system, and it is only required for Fork A's owner sub-lane, the weakest lane in this file.
Flagging it as a *known, cheap, reversible* decision, not proposing it.

**Explicitly NOT needed:** demographics, household composition, income, consumer-behavior append
files. These are the features that generate the §6 fair-housing exposure, and they are the ones
Homebot's own feature list includes. Skipping them is a positioning asset, not a gap.

**Open — could not source this pass:** NAR seller-tenure base rates (nar.realtor returned a nav
shell), CoreLogic and HouseCanary methodology (JS shells). Do not fill these from memory. Our own
`listing_week` panel will produce a real local base rate that beats a national average anyway.

---

## 4. What system needs building better

Ranked by leverage, all **[CANDIDATE]** unless noted.

**1. Nothing consumes the five built checks.** `lib/why-not-selling/checks/` holds five tested
pure-function checks — price-position, price-cuts, market-speed, cumulative-time, anchor-gap — and
**zero code imports them** (`docs/superpowers/plans/2026-07-20-listing-signal-assembly.md`, scratchpad
item #5). The single highest-leverage move in this entire document is not a model. It is giving
already-written code a route. Already covered by an approved spec + open check
`why_isnt_it_selling_live_verify` — this is execution, not new research.

**2. The DOM substrate is 54.2% censored and unevenly.** Live 07/20/2026: 18,098 of 33,373 active
rows date-floored. **Lee 58.9% real, Collier 14.0%, Hendry 14.9%.** DOM is a top-3 feature for every
model in this file. Any Collier or region-wide cohort statistic is an artifact of which listings
survived the backfill wipe. The only fix is `dom_backfill_repull_17k` (~17.2k vendor calls),
declined by the operator 07/20. **Consequence to carry forward: every model here is Lee-first, and
that is a data fact, not a preference.**

**3. There is no model-serving seam.** The sell-odds spec designed the right one — fitted
coefficients as a **versioned JSON file in the repo**, serving as deterministic TypeScript (dot
product + sigmoid + hazard compounding), training offline in Python, no model runtime in the number
path. That pattern generalizes to every model in this document and should be treated as the house
standard the first time a second model appears, not re-invented per model.

**4. Training dependencies don't exist yet.** Corrected fact from the 07/22 k-means pass: **numpy IS
present** (pandas≥2.0.0 hard-requires it, so it's on every GHA runner). **scikit-learn and scipy are
genuinely absent.** Adding sklearn to `ingest/requirements.txt` is the actual first line of code for
any Phase-2 training job. Node side has no stat library at all (`echarts` only; `echarts-stat`
evaluated and rejected), so serving-side math stays hand-written — same as `trailingSlope` and
`pearson()` in `lib/desk/correlation.ts` already are.

**5. No holdout discipline exists anywhere.** If uplift (§1c) is ever attempted, a randomized
never-contacted control group has to be designed into the outreach system *before* the first
campaign. Retrofitting it is impossible — you cannot reconstruct a control group after the fact.
This is the one item on this list with a hard ordering constraint.

**6. Identity resolution has no root.** Deed grantee names ↔ parcel ↔ listing `address_key` ↔
`contacts` is four different key spaces. `parcel_strap` (landed 07/19) and `address_key` exist;
person-level joining does not. Per RULE 0.55 this needs a named root before anyone writes a second
joiner, or we get the 2–14× divergence problem the data-roots catalog was built to stop.

---

## 5. What's buildable right now with zero new data

Ordered cheapest-first. All **[CANDIDATE]**.

- **Absentee / non-homesteaded owner map by ZIP and subdivision.** Pure SQL over parcels we already
  hold. Answers "where are the second homes and investor holdings" at any grain. No PII, no new
  ingest, cited to the FDOR roll.
- **Tenure distribution by area.** Years-since-last-sale off `SALE_YR1`. Produces a *local* base
  rate for "how long people hold here" — the number NAR publishes nationally and we could publish
  for SWFL specifically.
- **SOH lock-in cost-of-waiting.** We hold the portability chain. Nobody models lock-in as a
  *negative* propensity signal; it's differentiated and it's already half-specced in the
  soh-portability work.
- **Cohort facts (sell-odds Phase 1).** Pure SQL over `listing_week`, no model: "N listings like
  yours; X% sold within 90 days." Lane-1 countable, cited to our own tracker. Already specced and
  gated on suppression floors, not on us.
- **New-construction supply-pressure alert.** Our permits pack + listing velocity. The 07/17 research
  documented severe, well-sourced builder-incentive pressure with zero seller-facing alert product.

---

## 6. Legal — three regimes, three triggers

**Scoring public data is clean. Contacting people is regulated. Gating eligibility is a different
statute entirely.** Sourced 07/22/2026.

**Trigger 1 — you contact someone.**
- **TSR / National DNC** (https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule):
  entity-specific DNC is independent of the national registry — *"It is a TSR violation to call any
  consumer who has asked not to be called again."* Civil penalty **$53,088 per violation**. An
  Established Business Relationship exemption exists.
- **FS 501.059(8)(a)** (https://www.flsenate.gov/Laws/Statutes/2024/501.059): no unsolicited
  telephonic sales call using an automated dialing system or recorded message **without prior
  express written consent** — and the statute reaches *telephone call, text message, or voicemail
  transmission*. Willful violation: court may award **up to three times** the base amount.
- CAN-SPAM for email — already built (opt-out compliance, separate provider + separate domain).
  Settled; do not re-litigate.

**Trigger 2 — the score touches a protected class.**
This is the one that would actually hurt us, and it has a live precedent.
`https://www.justice.gov/opa/pr/justice-department-secures-groundbreaking-settlement-agreement-meta-platforms-formerly-known`
(crawled 07/22/2026) — DOJ v. Meta, *"the department's first case challenging algorithmic bias under
the Fair Housing Act."* Verbatim, the two theories pleaded:

> *"The department's lawsuit alleges both disparate treatment and disparate impact discrimination…
> disparate treatment because it intentionally classifies users on the basis of FHA-protected
> characteristics and designs algorithms that rely on users' FHA-protected characteristics…
> disparate impact discrimination because the operation of its algorithms affects Facebook users
> differently on the basis of their membership in protected classes."*

Meta was required to **stop using the "Special Ad Audience" / "Lookalike Audience" tool for housing
ads entirely** and rebuild ad delivery under DOJ approval and court oversight.

**Read for us, and it is not abstract:** a lookalike audience built from past sellers is the exact
banned mechanism. Geography proxies race. Homestead status proxies familial status and national
origin. Tenure proxies age. **Disparate impact does not require intent** — "we never used race" is
not a defense, which is precisely why the second theory was pleaded. Any Fork-A owner-targeting
build must carry, as a named guard in its failure-modes section: no protected-class features, no
lookalike/similar-audience targeting for housing, and an outcome-disparity audit of who the model
actually surfaces — not just an audit of what went in.

**Trigger 3 — the score gates credit, insurance, employment, or housing eligibility.**
Then it is a **consumer report** under the FCRA and the whole permissible-purpose, accuracy, adverse-
action, and dispute apparatus attaches. A seller-facing "here are your odds" number does not cross
this line. A score sold to a lender or an insurer to decide something about that person does.

**Florida Digital Bill of Rights** (FS 501.702, crawled 07/22/2026): the definition of *"personal
data"* explicitly *"does not include deidentified data or publicly available information"* — which
covers the parcel roll and deed records. **But its applicability threshold (a revenue floor plus one
of several conditions, one being deriving 50%+ of global gross annual revenue from online
advertising) lives in a subsection I did not pull. Verify applicability before claiming FDBR does
not attach to us — do not assume it from this file.**

---

## 7. Name the break — failure modes any build here must answer

1. **A ranked list is not a calibrated probability.** Shipping a ranking as a percentage is the
   default failure. Guard: reliability curve + decomposed Brier, not Brier alone (§1e).
2. **Leakage via today's parcel roll on last year's week.** Guard: vintage-aware joins; time-forward
   split only.
3. **Censored DOM makes Collier cohorts fiction.** Guard: suppress on **coverage**, not just sample
   size — a 60-row Collier ZIP can clear an N≥30 floor while representing 14% of its book.
4. **Disparate impact without a protected-class feature in sight.** Guard: outcome audit on who the
   model surfaces, plus a hard no-lookalike-targeting rule for housing (§6).
5. **Uplift claimed without a control group.** Guard: randomized holdout designed in before campaign
   one, or don't use the word.
6. **A model score becomes a cited fact.** Guard: the sell-odds spec's rule generalizes — cohort
   count leads (lane-1, countable), the estimate follows, always worded as estimated, never printed
   outside the training distribution. A model output is never a source.
7. **Research doc read as an approved plan.** Guard: this section, plus every **[CANDIDATE]** tag.

---

## 8. Bottom line

We are one deliberate policy decision and one Akamai wall away from having the same raw material the
propensity-scoring industry sells — and we have better market-velocity data than any of them at SWFL
grain. But competing on their axis means buying PII we excluded on purpose, entering a
$0.025/record market with two counties of coverage, and inheriting the DOJ-v-Meta problem.

The asymmetry worth exploiting is the opposite one. They have identity and no honesty constraint;
we have outcomes, provenance discipline, and a validated whitespace where the score faces the person
it describes. The approved sell-odds model is already the right first instance of that. The most
valuable thing in this document is not a new model — it is that five tested checks are sitting dark
with no consumer, and that the deed doc-types we already know how to decode are the only genuinely
new data worth chasing.

---

## Sources crawled 07/22/2026

Method: scikit-learn calibration + common-pitfalls (leakage), causalml methodology, imbalanced-learn,
Wikipedia uplift modelling. Legal: FTC Telemarketing Sales Rule guidance, FS 501.059, FS 501.702,
DOJ v. Meta settlement release, FTC FCRA furnisher guidance, eCFR 24 CFR Part 100 Subpart C.
Local: Lee + Collier Clerk official-records pages, Florida DOR exemptions.
**Returned JS shells with no usable content (do not cite as verified):** SmartZip, Offrs, Catalyze
AI, Likely.AI, CoreLogic, HouseCanary, NAR buyers-and-sellers profile, Florida Bar FDBR article,
arXiv abstract page. Vendor facts in §2 come from the 07/17/2026 landscape pass, which crawled them
successfully then.

## Cross-refs

- `docs/superpowers/specs/2026-07-19-sell-odds-model-design.md` — the approved model; Phase 0 done
- `docs/superpowers/plans/2026-07-20-listing-signal-assembly.md` — the dark-engine gap map
- `docs/superpowers/plans/2026-06-14-redfin-data-strategy/findings-algorithms.md` — Cox hazards,
  foreclosure-auction lead indicators, Market Heat components
- `_RESEARCH/data-and-ingest/2026-07-22-naive-bayes-knn-algorithm-fit.md` — NB/KNN, settled
- `_RESEARCH/real-estate-market/2026-07-22-kmeans-clustering-applicability.md` — clustering, settled
- `_RESEARCH/competitor-and-strategy/2026-07-17-buyer-seller-agent-augmentation-landscape.md` — vendors
- `_RESEARCH/competitor-and-strategy/STEADY-PAINS.md` — distilled pain reference
- `docs/standards/data-roots.md` — parcel table map, DOM trap T1
- `ingest/cadence_registry.yaml:2169` — parked Lee deed pipeline + its unpulled doc types
