# Price-cut challenger — tree ensemble vs regularized logistic

- **As of:** 07/22/2026
- **Commit:** `49c62771`
- **Command:** `python -m ingest.analysis.challenger --folds 5 --holdout-weeks 1`
- **Source `data_lake.listing_week`:** 96,090 rows
- **Week span:** 06/29/2026 – 07/06/2026 (2 weeks)

SCOPE BOUNDARY: the challenger trains on the data_lake.listing_week panel, which contains NO parcel columns. A result showing no lift from a tree ensemble says nothing about whether parcel data helps — parcel data was never in the feature set. The parcel structure pass informs a FUTURE model iteration; the panel-to-parcel join is not built.

This report ships no number, renders no surface, and touches no served path. It is evidence for a decision, not a served value.

# Variant: with_dom

Labeled rows: 8,801 · positives: 2,521 (28.6%) · features: 15

## SECTION 1 — MODEL CLASS (grouped-CV). NOT A GATE. Reads optimistically relative to time-forward because it uses all weeks; it answers 'which model class', never 'is this ready to ship'.

- **logistic** — log loss 0.5527 · Brier 0.1906 · ROC AUC 0.7893 · base rate 28.6% · n = 8,801
- **forest** — log loss 0.5274 · Brier 0.1802 · ROC AUC 0.8075 · base rate 28.6% · n = 8,801

## SECTION 2 — SHIPPING GATE (time-forward). THIS is the number that gates.

Train n = 4,777 · validate n = 4,024 (last 1 week(s) held out).

- **logistic** — log loss 0.5746 · Brier 0.2016 · ROC AUC 0.7903 · base rate 27.6% · n = 4,024
  - permutation importance (neg log loss): `property_type` +0.0641, `cuts_to_date` +0.0293, `relists_to_date` +0.0210, `list_price` +0.0118, `baths` +0.0068, `beds` +0.0043, `dom_days` +0.0027, `county` +0.0025
- **forest** — log loss 0.5816 · Brier 0.2043 · ROC AUC 0.7698 · base rate 27.6% · n = 4,024
  - permutation importance (neg log loss): `property_type` +0.0495, `list_price` +0.0399, `sqft` +0.0088, `county` +0.0080, `dom_days` +0.0079, `lot_acres` +0.0044, `beds` +0.0040, `flag_new_construction` +0.0017

# Variant: without_dom

Labeled rows: 8,801 · positives: 2,521 (28.6%) · features: 14

## SECTION 1 — MODEL CLASS (grouped-CV). NOT A GATE. Reads optimistically relative to time-forward because it uses all weeks; it answers 'which model class', never 'is this ready to ship'.

- **logistic** — log loss 0.5558 · Brier 0.1916 · ROC AUC 0.7823 · base rate 28.6% · n = 8,801
- **forest** — log loss 0.5377 · Brier 0.1838 · ROC AUC 0.7987 · base rate 28.6% · n = 8,801

## SECTION 2 — SHIPPING GATE (time-forward). THIS is the number that gates.

Train n = 4,777 · validate n = 4,024 (last 1 week(s) held out).

- **logistic** — log loss 0.5786 · Brier 0.2035 · ROC AUC 0.7859 · base rate 27.6% · n = 4,024
  - permutation importance (neg log loss): `property_type` +0.0750, `cuts_to_date` +0.0319, `relists_to_date` +0.0216, `list_price` +0.0120, `baths` +0.0069, `beds` +0.0043, `county` +0.0024, `sqft` +0.0018
- **forest** — log loss 0.5816 · Brier 0.2038 · ROC AUC 0.7791 · base rate 27.6% · n = 4,024
  - permutation importance (neg log loss): `property_type` +0.0396, `list_price` +0.0323, `sqft` +0.0109, `county` +0.0090, `lot_acres` +0.0045, `beds` +0.0038, `cuts_to_date` +0.0016, `flag_new_construction` +0.0015

### Caveats

CAVEAT (unobserved seasonality): the panel spans a small number of consecutive weeks — one narrow seasonal slice. No validation split fixes this. Treat any number here as within-slice, not general.

### How to read the two variants

FM 7 — `dom_days` is date-floored on 54.2% of the active book. If `with_dom` beats `without_dom` by a wide margin, the model is leaning on a field that is substantially fiction, and the honest number is the `without_dom` one.
