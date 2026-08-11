# K-means / clustering — do we use it, and where would it actually earn its keep?

**Date:** 07/22/2026 · **Trigger:** operator question "Do we use K means cluster anywhere / use
crawl4ai to figure out how we can use it" · **Verdict: we do not use it, and the two places it
looks obvious are the two places we already deliberately rejected it.**

---

## 1. Code probe (RULE 0.5) — zero k-means, and that was on purpose

Grep across the repo for `kmeans|KMeans|k-means|cluster_centers|sklearn.cluster|dbscan|
agglomerative|silhouette_score`:

- **No implementation anywhere.** Two inert mentions only, both in docs, neither wired:
  - `docs/superpowers/specs/2026-07-13-trend-fit-engine-design.md:59` — notes ecStat ships
    `clustering` (kMeans), in the same breath as **rejecting ecStat**.
  - `docs/superpowers/plans/2026-06-14-redfin-data-strategy/findings-ai-products.md:99` — the
    arXiv two-stage-cluster paper, logged as "Status: Research."
- **Dependencies — CORRECTED 07/22/2026.** An earlier draft of this file (and the chat answer that
  went with it) said "no scikit-learn, **no numpy**, no scipy" and concluded there was "no way to
  run one." **The numpy half was wrong.** `pandas>=2.0.0` is declared in
  `ingest/requirements.txt`, and pandas lists **NumPy (min 1.26.0) as a hard REQUIRED dependency**
  — vendor's own install page, "pandas requires the following dependencies"
  (https://pandas.pydata.org/docs/getting_started/install.html, crawled 07/22/2026). So **numpy is
  installed on every GHA runner** that does `pip install -r ingest/requirements.txt` (27+ workflows
  do). Genuinely absent: **scikit-learn and scipy** — those two only.
  **Consequence:** "we have no way to run k-means" was never true. numpy alone is more than enough;
  Lloyd's algorithm is a nested loop. The blocker was never capability — see §3's three guards.
  Node side does have **no** stat/cluster lib (`echarts ^6.1.0` only; `echarts-stat` evaluated and
  not adopted), so a TS-side implementation would be hand-written — same as `trailingSlope` (OLS)
  and `pearson()` (`lib/desk/correlation.ts`) already are.
- The only sklearn string in the tree is `.github/scripts/pypi-import-map.json:9` — a
  name-mapping table for a dependency linter, not a usage.

### The two deliberate rejections

1. **`lib/email/zip-events/market-areas.ts:5`** — verbatim: *"a subscriber's market area is a
   stable, citable fixture fact, **never runtime clustering**."* The 58 Lee+Collier ZIPs are
   grouped by `scripts/geo/build-market-areas.mts` with an explicit, ordered, hand-auditable rule
   set — place anchor → barrier lock → nearest-anchor fill by centroid (`MAX_JOIN_MILES = 12`) →
   price-band flag (`BAND_RATIO_MAX = 2`) — plus a hand-authored `OVERRIDES` map. That override
   map exists *because the auto pass produced garbage*: it put Everglades City in "the Immokalee
   market" 36 miles away and gave Cape Coral 12 ZIPs. Output is **committed and human-reviewed**;
   diffs must be intentional.
2. **The trend-fit engine (07/13/2026)** rejected ecStat wholesale — wrong layer (ECharts-only,
   so web gets it and the monetized deliverable path gets nothing). kMeans came along for the ride.

So the shape we'd reach for k-means to build, we already built — deterministically, with an
operator escape hatch.

---

## 2. crawl4ai pass (RULE 0.4) — 07/22/2026

### scikit-learn's own limitations page
Source: https://scikit-learn.org/stable/modules/clustering.html (crawled 07/22/2026)

Verbatim, the vendor's own caveats:

- *"Inertia makes the assumption that clusters are convex and isotropic... It responds poorly to
  elongated clusters, or manifolds with irregular shapes."* — **coastal SWFL submarkets are
  elongated by construction** (barrier islands, corridors, the Caloosahatchee). This is the exact
  failure geometry.
- *"Given enough time, K-means will always converge, however this may be to a local minimum. This
  is highly dependent on the initialization of the centroids."* Mitigations named: `init='k-means++'`,
  repeated `n_init`. Note also, on spectral's kmeans assignment: *"can be unstable... unless you
  control the `random_state`, it may not be reproducible from run-to-run."*
- *"Inertia is not a normalized metric"* + curse of dimensionality; PCA suggested as a pre-step.
- `MiniBatchKMeans` / `BisectingKMeans` exist for scale; `kmeans_plusplus` can seed other algorithms.

**Read for us:** determinism is achievable (`random_state` + `k-means++` + fixed `n_init`), but it
is a *pin*, not a property. Re-run on next month's data and memberships move anyway — which is the
churn the market-areas fixture was built to prevent.

### The real-estate precedent
Source: https://arxiv.org/abs/2508.03156 (crawled 07/22/2026) — Gümmer, Rosenberger et al.,
*"Unveiling Location-Specific Price Drivers: A Two-Stage Cluster Analysis for Interpretable House
Price Predictions"*, accepted at WI25 (Wirtschaftsinformatik), Sept 2025, Münster.

Verbatim abstract claim: two-stage clustering — *"first grouping properties based on minimal
location-based features before incorporating additional features"* — each cluster then modeled with
linear regression or a GAM. On **43,309 German house listings from 2023**: **36% MAE improvement for
the GAM, 58% for LR** vs. the same models without clustering.

The load-bearing detail is *why* it works: they cluster **properties**, not regions, and clustering
is a **preprocessing step for a per-cluster interpretable model** — not a labeling product. The win
is "the price drivers differ by cluster," surfaced through LR/GAM coefficients you can read.

---

## 3. Where it would and wouldn't earn its keep here

**Wouldn't — ZIP grain.** N = 58 ZIPs (Lee 12071 + Collier 12021). Clustering 58 points into ~10
groups is theater; the rules already encode more local knowledge than inertia can recover, and the
`OVERRIDES` map is proof the rules needed *human* correction, not a better objective function.
Rule 11 applies: this is a hyperscaler pattern at a rounding-error N.

**Would, if anything — parcel grain.** Real N exists here, and it exceeds the paper's:
- `lee_parcels` — 556,083 parcels / 104 cols (FDOR, landed 07/18/2026)
- `collier_parcels` — 290,973 parcels / 104 cols (FDOR)
- `parcel_subdivision_v` — 604,362 homes-only rows
(counts per `docs/standards/data-roots.md` lines 68–71.)

The honest framing is the paper's, not ours: **cluster parcels as a preprocessing step for a
per-cluster interpretable price model**, where the deliverable is the *coefficient story* ("in this
cluster, year built moves price; in that one, it doesn't"), never a cluster label shown to a user.

### The three constraints any proposal must clear (name-the-break, RULE 3.5)

1. **Provenance.** A cluster ID is not a citable source. Four-lane requires "this ZIP is in the Cape
   Coral market because <rule>", not "the algorithm put it there." A cluster label can never be the
   cited reason for a number we serve.
2. **Churn.** `market-areas.ts` requires membership not move week to week. K-means membership moves
   when data lands, even with `random_state` pinned. Guard would have to be: freeze to a reviewed
   fixture (i.e. exactly what we already do) — at which point the clustering bought us nothing the
   rules didn't.
3. **Geometry.** sklearn's own words: poor on elongated clusters. Our submarkets are elongated.

### The clustering-shaped trap worth naming
The open comp-set defect — *"460 and 684 sq ft rows compared against a 1,978 sq ft subject"* — reads
like it wants clustering. It does not. It wants a **size-band rule**. That is the general pattern
here: the problems that look clustering-shaped are solved better, cheaper, and citably by an
explicit rule at our N.

---

## Bottom line

We use zero k-means, by two documented decisions, and both still hold. The one place it could
legitimately pay is parcel-grain preprocessing for an interpretable per-cluster price model (the
WI25 result, at an N larger than theirs) — and even there the cluster is scaffolding for the model,
never a labeled output. Nothing here is a build recommendation; it's the map of where the idea
survives contact with our constraints.
