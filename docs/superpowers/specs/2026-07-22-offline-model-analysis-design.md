# Offline model analysis: parcel structure pass + price-cut RF challenger

**Date:** 2026-07-22 · **Check:** `offline_model_analysis_live_verify`
**Approved by operator in-session 07/22/2026** ("All of it" → scope split confirmed via
brainstorming: this is **Spec A**, offline only. **Spec B** — price-cut as a served check inside
the existing `lib/why-not-selling/` engine — is deferred behind this spec's calibration gate and
is NOT designed here.)

Operator decisions locked in brainstorming Q&A (07/22/2026):
- **Two specs, A gates B.** All three approved items get built; the dependency sets the order.
- **Challenger is re-runnable with committed dated reports** — not one-shot, not a cron.
- **Both validation splits, reported separately** — grouped-CV for the model-class question,
  time-forward for the shipping gate. Never conflated.

## Problem

The platform's first learned model (`docs/superpowers/specs/2026-07-19-sell-odds-model-design.md`,
operator-approved 07/19/2026) commits to regularized logistic regression and rules tree ensembles
out of the **serving** path. Two questions that spec leaves open cannot be answered by reading code:

1. **Which parcel columns should feed the model's parcel cross-link feature?** That spec names
   homestead status + assessment-gap via `address_key` join as a candidate feature. We hold 104
   columns per parcel table, **59 numeric**. Dumping collinear columns into a small model is how
   you get unstable coefficients — and unstable coefficients are exactly what Phase 3 (the
   seller-stress weight retune) reads.
2. **Does the logistic model leave nonlinear signal on the table?** Unanswerable by argument. It
   needs a trained challenger and a scoreboard.

Neither question has a served consequence. Both are prerequisites for spending effort on the
serving build.

## Evidence (probed live 07/22/2026 — RULE 0.5 / 0.4)

- **Panel is built and healthy.** `data_lake.listing_week`: 96,090 rows, 33,397 distinct listings,
  latest `week_start` 07/13/2026, last built 07/20/2026 (one week in arrears by design — labels for
  week W are written by the run observing W+1).
- **Label volume, live probe:** `price_cut_next_week` **2,521** positive events ·
  `holding_next_week` 5,080 · `sold_next_week` **163** · 8,801 labeled rows · **3 distinct labeled
  weeks**. Price-cut base rate ≈ 28% (EPV ≈ 140 across ~18 features) — ample. The sold label at
  1.9% (EPV ≈ 9) is *not* ample; that asymmetry is the whole reason this spec targets price-cut.
- **No feature/label leakage in the panel — VERIFIED, not assumed.**
  `ingest/pipelines/listing_week/builder.py:40` — `_replay()` filters `_at(t) <= upto` with
  `upto = week_end`. `builder.py:105` — `label_updates()` takes labels from the **following**
  week. Features are as-of week-end; labels are week+1. Clean.
- **Parcel width, live probe:** `lee_parcels` and `collier_parcels` are **104 columns each, 59
  numeric**; 556,083 + 290,973 = **847,056 rows**. No label dependency — this analysis is
  unsupervised and runs today.
- **`listing_week` carries NO parcel columns.** Schema is address/geo/structure/price/cut/flag
  features only (`docs/sql/20260719_listing_week.sql`). See "Scope boundary" below — this is
  load-bearing for how the challenger's result must be read.
- **scikit-learn is NOT installed.** Absent from `ingest/requirements.txt` and from
  `ingest/.venv/Lib/site-packages/`. `numpy` 2.5.1 is present transitively.
- **Vendor contract (crawl4ai, 07/22/2026, scikit-learn 1.9.0 stable):**
  - `https://scikit-learn.org/stable/modules/permutation_importance.html` — impurity-based (MDI)
    tree importance is **"strongly biased"** and **"favor[s] high cardinality features (typically
    numerical features) over low cardinality features such as binary features."** Permutation
    importance is model-agnostic, computed on held-out data, and carries no such bias.
  - Same page, on correlated features: *"One way to handle the issue is to cluster features that
    are correlated and only keep one feature from each cluster."*
  - `https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html`
    — `feature_importances_` is documented as "The impurity-based feature importances."

## Scope boundary (load-bearing — read before interpreting any report)

**The challenger trains on the existing `listing_week` panel only.** That panel contains no parcel
columns. Therefore:

- Item 1 (parcel structure pass) informs a **future** model iteration — the panel↔parcel join that
  would carry homestead/assessment-gap features. Building that join is **not in this spec.**
- A challenger report showing "no lift from RF" says nothing whatsoever about whether parcel data
  helps, because parcel data was never in the feature set.
- Any report that could be misread this way carries the boundary statement in its header.

The two analyses share a home and a report format. They do **not** share a feature set.

## Goal

Two decisions and a durable paper trail:

1. A committed **column allow-list** naming which parcel columns earn a place in a future model,
   with the correlation structure that justifies each pick.
2. A committed, dated **challenger report** answering whether a tree ensemble beats regularized
   logistic on the price-cut label — re-runnable as labels accumulate, so the answer sharpens
   instead of being re-litigated.

**Nothing in this spec ships a number, renders a surface, or touches a served path.**

## What we're building

New package `ingest/analysis/` — a third sibling to `pipelines/` (scheduled ingest) and `scripts/`
(operational pass/fail tooling). These produce **evidence and decisions**, which is neither of
those things; mixing them into `scripts/` blurs a boundary that is currently clean.

```
ingest/analysis/
  __init__.py
  _report.py            # shared report header + writer
  parcel_structure.py   # item 1
  challenger.py         # item 2
ingest/requirements-analysis.txt
reports/analysis/       # committed, dated outputs
```

### `_report.py` — shared provenance header

Every report is stamped with: git SHA, as-of date (MM/DD/YYYY), source table row counts, the week
span covered, the exact command that produced it, and the scope-boundary statement above. A
committed report with no provenance is a stale claim; the header is what makes a diff between two
runs meaningful.

### `parcel_structure.py` — item 1

One command over `lee_parcels` + `collier_parcels`:

1. Per-column null-rate and cardinality across all 59 numeric columns.
2. Exclude columns below a null/cardinality floor — **printed with their rates**, never silently
   dropped. **The floor value is NOT set in this spec.** It is chosen at first run from the
   observed distribution and recorded in that run's report, same discipline as the sell-odds
   spec's calibration tolerance — no invented threshold here.
3. Correlation matrix over the survivors; hierarchical clustering on the correlation distance.
4. Emit one representative column per cluster → the committed allow-list.
5. **PCA runs alongside as an explained-variance read only** — how many independent dimensions the
   parcel data actually holds. That number lands in the report. No principal component is persisted,
   served, or written to the allow-list.

Rationale for clustering-over-PCA as the *actionable* output is the vendor's own guidance (quoted
above) plus provenance: a named column can be cited, a principal component cannot.

### `challenger.py` — item 2

One command over `listing_week`, `--as-of` flag, target `price_cut_next_week`:

- Trains regularized logistic regression and `RandomForestClassifier`.
- **Two splits, reported in two clearly separated sections:**
  - **Section 1 — model class.** `GroupKFold` on `address_key` (no listing in both folds). Uses all
    3 weeks. Answers "does RF beat logistic on log loss?" with real power today.
  - **Section 2 — shipping readiness.** Time-forward: train weeks ≤ T, validate weeks > T. Answers
    "is this calibrated going forward?" Reads weak-and-honest now; sharpens weekly.
  - **Only Section 2 is ever the gate.** Section 1 never is, and says so on its face.
- Importances via `sklearn.inspection.permutation_importance` only.
- Runs **twice** — with and without `dom_days` — and reports both (see failure modes).

### Dependency placement

`scikit-learn` goes in a new `ingest/requirements-analysis.txt`, and that path is **added to
`[tool.deptry] requirements_files`** in `pyproject.toml` (already a list). Result: deptry still
sees and checks the dependency, but the scheduled cron runners that install
`-r ingest/requirements.txt` never pull scikit-learn or scipy. RULE 11 — no runner carries weight
for code it never executes. Precedent: `ingest/requirements-probe.txt` already exists.

## Failure modes and their guards (RULE 3.5)

**1. The flattering number gets quoted as the gate.** Two accuracy numbers in one report, and
grouped-CV will read better than time-forward. *Guard:* report template puts the time-forward
number first under an explicit gate label; the grouped-CV section carries a standing caveat line.
*Test:* generator emits both labels.

**2. Leakage through CV folds.** One listing contributes multiple weekly rows; a naive split puts
the same listing in train and validate and inflates the score. *Guard:* `GroupKFold` on
`address_key`. *Test:* no group appears in both folds.

**3. Leakage through cut-derived features.** `cuts_to_date` / `weeks_since_last_cut` are derived
from the same event class being predicted. Verified clean today (evidence above) — it must stay
clean. *Guard + Test:* fixture where the current week contains a cut, asserting `cuts_to_date`
reflects only prior weeks.

**4. Principal components escaping into a served path.** *Guard:* the committed artifact is an
allow-list of column **names** only. *Test:* every entry exists in `information_schema.columns`
for its table — a PC name cannot pass.

**5. Column selection made on junk columns.** Many of the 59 numeric fields may be mostly-null or
constant; correlation over heavy nulls is meaningless. *Guard:* null-rate and cardinality floors
applied before clustering, excluded columns printed with their rates. *Test:* a constant column
and an all-null column are both excluded by the floor.

**6. Impurity importances used anyway** — they are one attribute access away, and the vendor
documents them as strongly biased toward exactly the high-cardinality/binary mix our stress signals
have. *Guard + Test:* `feature_importances_` appears nowhere in `ingest/analysis/`.

**7. Floored days-on-market poisoning the features.** 18,098 of 33,373 active rows are date-floored
(54.2%, probed 07/20/2026 per the sell-odds spec). `dom_days` is a feature. *Guard:* the challenger
runs with and without `dom_days` and reports both. A large gap means the feature carries fiction —
and we find that out in the report rather than in a shipped number.

**8. Reports drifting from the code that produced them.** *Guard:* SHA-stamped header (`_report.py`).

**9. Non-determinism making two dated reports incomparable.** *Guard + Test:* fixed `random_state`,
asserted.

**10. Over-trusting a 3-week window even when correctly labeled.** Three weeks is one narrow
seasonal slice; seasonality is unobserved and no split fixes that. *Guard:* the report states its
week span and carries an explicit unobserved-seasonality caveat. **No code fix — this is a stated
limit**, recorded here so a later reader does not mistake a confident number for a general one.

**11. The challenger's null result misread as "parcels don't help."** See Scope boundary. *Guard:*
the boundary statement is part of the shared report header, not prose someone has to remember.

## Testing (TDD — RULE 3.5, each test named for the failure mode it targets)

- `test_fold_isolation` — no `address_key` in both folds (FM 2)
- `test_asof_feature_semantics` — current-week cut excluded from `cuts_to_date` (FM 3)
- `test_allowlist_columns_exist` — every allow-list entry is a real column (FM 4)
- `test_null_and_cardinality_floor` — constant + all-null columns excluded (FM 5)
- `test_no_impurity_importances` — `feature_importances_` absent from the package (FM 6)
- `test_report_labels_present` — both split sections carry their labels (FM 1)
- `test_seed_determinism` — two runs, identical output (FM 9)
- `test_report_header_provenance` — SHA, as-of, row counts, boundary statement present (FM 8, 11)

## Boundaries (locked)

- No serving. No route, no render, no deliverable, no brain pack change.
- No cron, no scheduled job, no paid API surface, no LLM call, no GPU.
- No new repo-wide CI gate — the guards above are unit tests inside the analysis suite (RULE 3 C2:
  extend existing seams, never erect a new mandatory pre-materialization gate).
- No panel↔parcel join in this spec.
- No change to `refinery/packs/seller-stress-swfl.mts` constants — that remains Phase 3 of the
  sell-odds spec, operator sign-off required (RULE 1).

## Sequencing

Both analyses are independent and can be built in either order. `parcel_structure.py` has no label
dependency and can run to a final answer today. `challenger.py` runs today for a first read and is
re-run as labels accumulate; its Section 2 number is the input to the Spec B go/no-go.
