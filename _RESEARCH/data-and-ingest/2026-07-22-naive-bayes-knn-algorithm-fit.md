# Naive Bayes / KNN — where they fit, where they don't, and what was already decided

Researched 07/22/2026. Operator ask, verbatim: *"any way we can use Naive Bayes? use crawl4ai to
research and come up with some ideas. even KNN. look at them both. looking at other algos on
scratchpad, so compare and figure out which ones we need where to make us better."*

Vendor facts are crawl4ai-fetched from scikit-learn 1.9.0 (stable) IN SESSION, quoted verbatim.
Our-code facts are probed, not remembered.

---

## 0. READ THIS FIRST — most of this question was already answered on 07/13/2026

**This is a repeat ask, nine days later, and the prior answer was never surfaced back to the
operator.** Found by grepping `naive bayes|k-nearest|KNN` across all `.md` (2 hits, both prior art).

On 07/13/2026 the operator asked: *"DO WE HAVE LOGISTIC REGRESSION CHARTS / LINEAR Regression /
SVMs / KNN... most important is linear regression. would like to be able to use it anywhere."*
That produced `docs/superpowers/specs/2026-07-13-trend-fit-engine-design.md`, whose
**"Follow-ups: logistic regression, SVM, KNN"** section concluded, verbatim:

- **KNN** — *"the comp engine is already KNN-shaped (nearest properties in feature space), but the
  neighbor search happens **at the vendor**; `comp-helper.ts` slices the top 6 of what is handed
  back. Owning the distance function is a real option — but it is a comps build, not a charts
  build."*
- **Logistic regression** — *"the strongest follow-up. Its blocker is a labeled training set and a
  backtest, not a chart."*
- **SVM** — *"no use case surfaced. Not pursued."*

Two checks are open from that pass and have sat 8 days untouched:
- `knn_own_the_comp_distance` [idea]
- `logistic_regression_listing_outcome` [idea]

**Independent research this session reached the same KNN conclusion by a different route.** That is
corroboration, not news. Treat the 07/13 finding as settled and do not re-derive it a third time.

**What IS new in this document:**
1. **Naive Bayes was never covered by the 07/13 pass** — zero mentions repo-wide. It is the only
   genuinely open part of the question, and the answer turns out to be *no, and here's the specific
   reason.*
2. **KNN's priority changed.** On 07/13 it was an [idea] with no deadline. It now maps onto a
   **dated defect**, `comps_no_size_band_guard` (due Jul 26), plus operator scratchpad item 23.
   Same conclusion, higher urgency, concrete trigger.

---

## 1. The corpus this compares against (RULE 0.4 — ours first)

- `docs/superpowers/plans/2026-06-14-redfin-data-strategy/findings-algorithms.md` — the housing
  signal set: Cox proportional hazards for listing survival, Zillow Market Heat Index (3 components,
  weights unpublished), z-score composites, months-of-supply regime thresholds, foreclosure-auction
  lead indicators. Sourced and cited.
- `docs/superpowers/specs/2026-07-19-sell-odds-model-design.md` — discrete-time hazard model,
  **operator-approved 07/19**. States outright: *"This is the platform's first learned model"* and
  *"any binary classifier can estimate the per-interval conditional hazard."*
- `docs/superpowers/specs/2026-07-13-trend-fit-engine-design.md` — see §0.
- `.firecrawl/algo-viz-build.md`, `.firecrawl/qaiser-algo-viz.md` — **NOISE.** An unrelated GitHub
  "Algorithm Visualizer" student repo. Not part of this corpus.
- `.firecrawl/search-ibuyer-algo.json` — iBuyer ML search results. Context only, no methodology.

**Consequence:** there is an approved model design already. The honest question is which algorithm
goes *inside* it, not what replaces it.

---

## 2. The vendor facts that actually discriminate

Definitions skipped deliberately. These are the claims that change the recommendation.

### Naive Bayes — scikit-learn 1.9.0, verbatim
https://scikit-learn.org/stable/modules/naive_bayes.html

- *"They require a small amount of training data to estimate the necessary parameters."*
- *"The decoupling of the class conditional feature distributions means that each distribution can
  be independently estimated as a one-dimensional distribution. This in turn helps to alleviate
  problems stemming from the curse of dimensionality."*
- *"famously document classification and spam filtering"*
- **THE DISQUALIFIER:** *"although naive Bayes is known as a decent classifier, it is known to be a
  **bad estimator**, so the probability outputs from `predict_proba` are **not to be taken too
  seriously**."*

https://scikit-learn.org/stable/modules/calibration.html

- *"`GaussianNB` (Naive Bayes) tends to **push probabilities to 0 or 1**... This is mainly because
  it makes the assumption that features are conditionally independent given the class, which is not
  the case in this dataset which contains 2 **redundant features**."*
- *"`LogisticRegression` is more likely to return **well calibrated** predictions by itself as it
  has a canonical link function for its loss... the so-called **balance property**."*
- *"Ideally, the calibrator is fit on a dataset **independent of** the training data used to fit the
  classifier."*

### KNN — scikit-learn 1.9.0, verbatim
https://scikit-learn.org/stable/modules/neighbors.html

- *"Being a **non-parametric** method, it is often successful in classification situations where the
  decision boundary is very irregular."*
- *"`weights = 'distance'` assigns weights proportional to the **inverse of the distance** from the
  query point."*
- *"In cases where the data is **not uniformly sampled**, radius-based neighbors classification...
  can be a better choice. The user specifies a fixed radius r, such that points in **sparser
  neighborhoods use fewer nearest neighbors**."*
- *"the KD tree approach is very fast for **low-dimensional (D<20)** neighbors searches, it becomes
  inefficient as D grows very large: this is one manifestation of the... **curse of
  dimensionality**."*
- *"Efficient brute-force neighbors searches can be very competitive for **small data samples**."*
  Brute force query time `O[DN]`; KD/Ball tree `O[D log(N)]` at small D.

---

## 3. Naive Bayes is disqualified from sell odds — the one place it looks tempting

The sell-odds spec serves **P(sells within 90 days)** to a seller on the Why Isn't It Selling
report. That is a *calibrated-probability* product, not a decision product.

scikit-learn says NB is a **bad estimator** whose probabilities are **not to be taken seriously**,
and names the exact mechanism: **correlated features push its outputs to 0 or 1.**

Our listing features are maximally correlated. `data_lake.listing_state` carries list_price, beds,
baths, sqft, lot_acres, property_type — sqft ↔ beds ↔ baths ↔ price are near-collinear by
construction. **We would feed NB the precise input class that breaks its calibration**, then print
the result to a homeowner as odds. Sourced but wrong is worse than absent, because it is checkable
and it will be checked.

**The tempting-but-wrong argument, named so nobody re-proposes it:** *"we only have a couple hundred
labels, and NB needs little training data, so use NB for sell odds."* The premise is true; the
conclusion is still wrong. The binding constraint on sell odds is **label maturity**, not algorithm
sample-efficiency. NB does not buy an earlier ship date — it buys a miscalibrated number sooner.
Calibration cannot rescue it either: sklearn requires the calibrator be fit on data *independent* of
training, and splitting a couple hundred labels three ways is not a model.

### Label counts — QUERIED LIVE 07/22/2026, not read from the spec

Scratchpad items 9/11 exist because a spec's number was spoken as a live fact and was off by 5.5×.
So these were queried, not quoted. `data_lake.listing_transitions`, live:

- **sold 208** · withdrawn 56 · holding 9,117 · active 45,664
- Earliest transition **06/27/2026**, latest **07/19/2026**

The 07/19 spec said 195 sold / 43 withdrawn / 9,101 holding. Live is modestly higher — the spec was
directionally right and is now stale by a few days' accrual. Nothing here changes the NB verdict.

**⚠️ NEW FINDING, not part of the original question — the label record has been silent for 3 days.**
`max(at)` is **07/19/2026**; today is 07/22/2026. The outcome table the entire sell-odds model
depends on has recorded nothing for three days. That window contains the 07/21 PostgREST
outage/egress throttle, so the likeliest explanation is a stalled pipeline rather than a market that
stopped moving — but **that is a hypothesis, not a measurement.** Nobody has checked whether the
lifecycle job is running.

This matters beyond sell odds: **a labeling pipeline that silently stops does not announce itself**
— it looks exactly like "no listings sold." The maturity date for 90-day cohorts (~late Sept 2026,
counting 90 days from the 06/27 start) is only real if labels are actually accruing. Owed: confirm
`listing_lifecycle` is still writing transitions.

**Logistic regression remains the correct classifier inside the approved hazard model** — vendor-
stated balance property, calibrated by construction, and its fitted coefficients ARE the
seller-stress retune the spec already promises. This matches the 07/13 finding
(`logistic_regression_listing_outcome`) and changes nothing about the approved design.

### Where NB *would* belong — and why no surface qualifies today

NB's home ground per the vendor is *"document classification and spam filtering"* — decisions,
not probabilities, where the bad-estimator flaw does not bite. Candidates, honestly ranked:

1. **City Voices crime/courts/disaster gate.** Today a keyword drop; keyword gates fail on phrasing
   they never saw, and this gate is why the daily digest was KILLED 07/16 after crime news shipped.
   A text classifier is the shape that generalizes. **BUT** the digest is dead and operator-locked
   ("NEVER re-enable without Ricky"), and no labeled corpus of killed items exists. **Not
   actionable. Named, not proposed.**
2. **`lib/email/listing-intent.ts`** — `isListingIntent` / `isNewListingRecipePrompt` are hand-tuned
   regexes, and `subjectAddressFromPrompt` already carries a 07/20 postmortem where a naturally-typed
   prompt matched nothing and silently dropped the address. Classic regex brittleness. **BUT** no
   labeled prompt corpus, tiny volume, and a misclassification here silently builds the wrong email.
   The regex is honest about what it matches; a classifier would be confidently wrong. **Not worth
   it at our volume (RULE 11).**

**Verdict: no live surface justifies Naive Bayes today.** It is the right tool for a text-decision
problem we do not have a corpus for. Forcing it onto sell odds is the documented wrong move.

---

## 4. KNN → comp selection. The recommendation, and it closes a dated defect.

### FIRST — what "use KNN" does and does not mean here (read before anything else)

**It does NOT mean a trained model, a Python/scikit-learn runtime, a model artifact, labels, or any
ML infrastructure.** Nothing gets trained. sklearn is cited above as the *reference for the method*;
the *implementation* is a deterministic TypeScript distance rank next to the existing comp code.

Concretely, "own the comp distance function" (the 07/13 check's own phrasing) means: scale the
features, filter to a size/price/recency band, order by a weighted distance, take the top N —
computed in code, precomputed or bounded-SQL for egress. It is unsupervised, deterministic, and
reproducible: the same subject always yields the same comps, and every comp can be printed with the
facts that made it comparable.

That is a *better `ORDER BY`*, not a machine-learning project — which is also why it passes RULE 11.
The reason to name KNN at all is that it tells you the correct shape (scaling, distance weighting,
radius-vs-fixed-k in sparse markets) instead of inventing another hand-tuned score like the one
`rankListings` already carries.

### The case

Not a new feature — the fix for a defect already in the ledger:

> `comps_no_size_band_guard` [defect, due Jul 26] — *"Comp set has no SIZE-BAND guard: 460 and 684
> sq ft rows compared against a 1,978 sq ft subject make the ask look wildly overpriced."*

Plus operator scratchpad item 23: *"only one comp??????????? has to be other sales near by in last
6 months."*

**What comp selection is today** (probed — `lib/assistant/comp-helper.ts`,
`lib/deliverable/recipes/market-comps.ts`): one vendor "nearby" call, `COMP_POOL = 12`, filtered by
`isComparableHome` (must have beds AND sqft — a vacant-lot guard added 07/13), capped at
`MAX_COMPS = 6`. **There is no similarity computation at all.** No size band, no price band, no
recency window, no distance weighting. "Comparable" currently means *"the vendor put it in the
nearby list and it isn't bare land."* This is exactly the 07/13 finding, re-verified.

`lib/listings/select.ts` `rankListings` is the same shape: a hand-written
`score() = (has coords ? 2 : 0) + (residential ? 1 : 0)`, then newest-first.

**Why KNN is right-sized here and not a hyperscaler import (RULE 11):** a comp IS a nearest
neighbor — the textbook definition of the problem, not an analogy. Dimensionality is tiny (sqft,
beds, baths, lat/lon, year built — ~6 features, well inside the vendor's `D<20` KD-tree sweet
spot). N is ~33k active listings / 604k parcels: small for a spatial index, impossible by eye. Two
vendor facts map directly onto our geography — `weights='distance'` gives inverse-distance
weighting so a house two streets over outranks one across the county, and **radius-based neighbors
handles non-uniform sampling**, which is precisely Cape Coral (dense) vs Hendry (sparse). Fixed k
returns garbage in a thin market; a radius does not.

**The product argument, which outranks the technical one:** the explanation IS the deliverable.
"Here are the 6 nearest sold homes by size, age and distance, each with its distance from yours" is
a sentence we can print, cite, and defend. That satisfies "deterministic math, narrative prose" —
the neighbor set is computed in code, the model only narrates. A boosted tree cannot say this.

**Egress constraint — hard, not a preference.** The neighbor index is built at **ingest/build
time** into a table, never a per-request scan of the lake. Naive KNN-over-the-lake at query time is
structurally the same pattern as the lake-MCP burner killed on 07/21.

---

## 5. Ranking — what actually makes us better

By (defect closed × ships now × RULE 11 fit):

1. **KNN comp selection** — closes a dated defect, needs zero labels, ships now, explanation is the
   product. Check `knn_own_the_comp_distance` already exists; `comps_no_size_band_guard` is its
   forcing function.
2. **Logistic regression inside the approved hazard model** — already approved and already checked
   (`logistic_regression_listing_outcome`). Blocked only on label maturity (late Sept 2026;
   Lee-only viable sooner, Collier/Hendry blocked by the 54.2% DOM floor).
3. **Naive Bayes** — no qualifying surface. Do not force it.

Unchanged from the existing corpus: Cox PH is the approved sell-odds design; z-score composites are
what seller-stress does by hand today and get replaced by fitted coefficients; Zillow MHI is a
benchmark to compare against, never to reimplement (weights unpublished). Still genuinely open and
unresearched: **regime clustering** (unsupervised, needs no labels — the most plausible next
question) and **seasonal adjustment / STL**.

---

## 6. Failure modes, named before any build (RULE 3.5)

If KNN comps is built, these are the ways it breaks and the guard for each:

- **F1 — Unscaled features.** sqft (~2,000) dwarfs beds (~3) in Euclidean distance, so the "nearest"
  neighbor matches square footage and nothing else. *Guard:* explicit per-feature scaling,
  unit-tested with a fixture where an unscaled run picks a visibly wrong neighbor.
- **F2 — Per-request lake scan.** The egress-burner pattern re-armed. *Guard:* precompute at build
  time; a test that fails if the comp path issues an unbounded lake read.
- **F3 — Thin market returns garbage.** Fixed k in Hendry pulls neighbors 20 miles out and calls
  them comparable. *Guard:* radius cap with honest degradation — return 3 real comps and say so,
  never pad to 6.
- **F4 — Stale comps.** A 2019 sale is not a comp. *Guard:* hard recency window (operator said 6
  months), enforced in the query, tested.
- **F5 — Grain collapse.** `listing_state.property_type` collapses every condo into `single_family`
  (known, logged). A condo would be comped against single-family homes. *Guard:* this is a
  PRE-EXISTING data defect that KNN would **amplify** — it must be checked before comps ship, not
  discovered after.
- **F6 — A number nobody can check.** A raw distance score displayed without units. *Guard:* never
  show the distance metric; show the comparable facts (sqft, beds, miles, sale date) so the reader
  verifies the comp themselves.

---

## 7. What is NOT established here

- **No build is approved.** This is research. A KNN comps build needs `superpowers:brainstorming` +
  `scripts/new-build.mjs` per RULE 3.5.
- The **F5 condo/property-type grain defect** is cited from prior logs, **not re-probed this
  session.**
- **Comp-set quality was not measured.** Item 23's "only one comp" is the operator's observation and
  was never root-caused — that email built during the 07/21 PostgREST outage window, so an empty
  result may be an outage artifact rather than a query defect. Rule it out before blaming the query.
- **Regime clustering and seasonal adjustment remain unresearched.**
