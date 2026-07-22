"""Item 2 — offline challenger: does a tree ensemble beat regularized logistic
on the price-cut label?

This NEVER serves. The sell-odds spec commits the serving path to deterministic
TypeScript (dot product + sigmoid + hazard compounding) and rules tree ensembles
out of it. What a tree ensemble can do is tell us, offline, whether the linear
model is leaving nonlinear signal on the table. That question is unanswerable by
argument; it needs a trained challenger and a scoreboard.

Target is `price_cut_next_week`, not `sold_next_week`. Live probe 07/22/2026:
2,521 price-cut events vs 163 sold — 15x. At 163 events (EPV ~9 across ~18
features) a challenger is theatre; at 2,521 (EPV ~140) it is a real experiment.

TWO SPLITS, AND ONLY ONE OF THEM IS A GATE:
  Section 1, grouped-CV on address_key — answers "which model class?" with real
  power today. NEVER a gate; it reads optimistically because it uses every week.
  Section 2, time-forward — answers "is this calibrated going forward?" Reads
  weak and honest now, sharpens as weeks accumulate. THIS is the gate.

Importances come from permutation_importance only. Vendor verbatim (sklearn
1.9.0, crawl4ai 07/22/2026): impurity-based importance is "strongly biased" and
favours "high cardinality features ... over low cardinality features such as
binary features" — exactly the mix our stress signals have.

    python -m ingest.analysis.challenger
    python -m ingest.analysis.challenger --holdout-weeks 1 --folds 5

Spec: docs/superpowers/specs/2026-07-22-offline-model-analysis-design.md
"""
from __future__ import annotations

import argparse
import sys

import numpy as np

from ingest.analysis import _sql
from ingest.analysis._report import (
    GATE_LABEL,
    NON_GATE_LABEL,
    SEASONALITY_CAVEAT,
    Report,
)

SCHEMA = "data_lake"
TABLE = "listing_week"
TARGET = "price_cut_next_week"

# Fixed so two dated reports are comparable (FM 9).
RANDOM_STATE = 20260722

GROUP_COL = "address_key"
WEEK_COL = "week_start"

_NUMERIC = [
    "beds", "baths", "sqft", "lot_acres", "list_price",
    "cuts_to_date", "cut_depth_pct_to_date", "weeks_since_last_cut",
    "relists_to_date",
]
_CATEGORICAL = ["property_type", "county", "state_at_week_end"]
_BINARY = ["flag_foreclosure", "flag_new_construction"]

# FM 7 — dom_days is fiction on 54.2% of the active book (18,098 of 33,373 rows
# are date-floored; the 07/18 backfill was wiped). Both variants are always run
# and both are reported; a large gap between them means the feature carries the
# fiction, and we learn that here rather than in a shipped number.
VARIANTS = [("with_dom", True), ("without_dom", False)]


def feature_columns(*, include_dom: bool) -> list[str]:
    cols = _NUMERIC + _BINARY + _CATEGORICAL
    return (cols + ["dom_days"]) if include_dom else cols


def panel_sql(features: list[str]) -> str:
    """Only LABELED rows, only the columns actually used.

    FM 12: a model cannot be fitted on aggregates, so this is the one place the
    analysis reads rows — which makes the narrowing load-bearing. The panel holds
    96,090 rows but only ~8,801 are labeled, and the last observed week is
    censored by construction (builder.py writes labels for week W on the run that
    observes W+1), so an unfiltered pull would be ~11x the data and most of it
    unusable.
    """
    cols = [GROUP_COL, WEEK_COL, TARGET] + features
    projected = ", ".join(_sql._safe(c) for c in cols)
    return (
        f"SELECT {projected} FROM {_sql._safe(SCHEMA)}.{_sql._safe(TABLE)} "
        f"WHERE {_sql._safe(TARGET)} IS NOT NULL"
    )


def group_folds(groups: np.ndarray, y: np.ndarray, *, n_splits: int):
    """Grouped, stratified folds — no address_key on both sides (FM 2).

    A listing contributes one row per week it is live, so a naive split puts the
    same listing in train and validate and inflates the score.
    """
    from sklearn.model_selection import StratifiedGroupKFold

    splitter = StratifiedGroupKFold(
        n_splits=n_splits, shuffle=True, random_state=RANDOM_STATE
    )
    return list(splitter.split(np.zeros(len(y)), y, groups))


def time_forward_split(weeks: np.ndarray, *, holdout_weeks: int):
    """Train on weeks <= T, validate on the last `holdout_weeks` weeks."""
    distinct = sorted(set(weeks.tolist()))
    if len(distinct) <= holdout_weeks:
        raise ValueError(
            f"need more than {holdout_weeks} distinct week(s) for a time-forward "
            f"split; the panel has {len(distinct)}"
        )
    cutoff = distinct[-holdout_weeks]
    train_idx = np.where(weeks < cutoff)[0]
    valid_idx = np.where(weeks >= cutoff)[0]
    return train_idx, valid_idx


def build_model(kind: str, features: list[str]):
    """Pipeline: impute + scale numerics, one-hot the categoricals, then fit."""
    from sklearn.compose import ColumnTransformer
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler

    numeric = [c for c in features if c not in _CATEGORICAL]
    categorical = [c for c in features if c in _CATEGORICAL]

    pre = ColumnTransformer([
        ("num", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), numeric),
        ("cat", Pipeline([
            ("impute", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore",
                                     min_frequency=20)),
        ]), categorical),
    ])

    if kind == "logistic":
        # l1_ratio=0 is ridge (pure L2). `penalty=` is deprecated in sklearn 1.8
        # and REMOVED in 1.10 — the installed 1.9.0 says so verbatim: "Use
        # l1_ratio=0 instead of penalty='l2'". Writing it the old way would have
        # run green today and broken on the next bump.
        model = LogisticRegression(
            l1_ratio=0, C=1.0, max_iter=2000,
            class_weight="balanced", random_state=RANDOM_STATE,
        )
    elif kind == "forest":
        model = RandomForestClassifier(
            n_estimators=400, min_samples_leaf=20, n_jobs=-1,
            class_weight="balanced_subsample", random_state=RANDOM_STATE,
        )
    else:
        raise ValueError(f"unknown model kind: {kind}")

    return Pipeline([("pre", pre), ("model", model)])


def _scores(y_true, proba) -> dict[str, float]:
    from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

    out = {
        "log_loss": float(log_loss(y_true, proba, labels=[0, 1])),
        "brier": float(brier_score_loss(y_true, proba)),
        "base_rate": float(np.mean(y_true)),
        "n": int(len(y_true)),
    }
    # AUC is undefined on a single-class fold; report it only when both appear.
    out["roc_auc"] = (float(roc_auc_score(y_true, proba))
                      if len(set(y_true.tolist())) > 1 else float("nan"))
    return out


def _fmt(scores: dict[str, float]) -> str:
    auc = "n/a" if np.isnan(scores["roc_auc"]) else f"{scores['roc_auc']:.4f}"
    return (f"log loss {scores['log_loss']:.4f} · Brier {scores['brier']:.4f} · "
            f"ROC AUC {auc} · base rate {scores['base_rate']:.1%} · "
            f"n = {scores['n']:,}")


def _rows_to_arrays(rows, colnames, features):
    import pandas as pd

    frame = pd.DataFrame(rows, columns=colnames)
    y = frame[TARGET].astype(int).to_numpy()
    groups = frame[GROUP_COL].astype(str).to_numpy()
    weeks = frame[WEEK_COL].to_numpy()
    return frame[features], y, groups, weeks


def _section_grouped(X, y, groups, features, folds: int) -> str:
    lines = [f"## {NON_GATE_LABEL}", ""]
    for kind in ("logistic", "forest"):
        oof = np.zeros(len(y), dtype=float)
        for train_idx, valid_idx in group_folds(groups, y, n_splits=folds):
            model = build_model(kind, features)
            model.fit(X.iloc[train_idx], y[train_idx])
            oof[valid_idx] = model.predict_proba(X.iloc[valid_idx])[:, 1]
        lines.append(f"- **{kind}** — {_fmt(_scores(y, oof))}")
    return "\n".join(lines)


def _section_timeforward(X, y, groups, weeks, features, holdout: int) -> str:
    from sklearn.inspection import permutation_importance

    train_idx, valid_idx = time_forward_split(weeks, holdout_weeks=holdout)
    lines = [
        f"## {GATE_LABEL}",
        "",
        f"Train n = {len(train_idx):,} · validate n = {len(valid_idx):,} "
        f"(last {holdout} week(s) held out).",
        "",
    ]
    for kind in ("logistic", "forest"):
        model = build_model(kind, features)
        model.fit(X.iloc[train_idx], y[train_idx])
        proba = model.predict_proba(X.iloc[valid_idx])[:, 1]
        lines.append(f"- **{kind}** — {_fmt(_scores(y[valid_idx], proba))}")

        imp = permutation_importance(
            model, X.iloc[valid_idx], y[valid_idx],
            scoring="neg_log_loss", n_repeats=5,
            random_state=RANDOM_STATE, n_jobs=-1,
        )
        order = np.argsort(imp.importances_mean)[::-1][:8]
        top = ", ".join(
            f"`{features[i]}` {imp.importances_mean[i]:+.4f}" for i in order
        )
        lines.append(f"  - permutation importance (neg log loss): {top}")
    return "\n".join(lines)


def run(args) -> int:
    command = "python -m ingest.analysis.challenger " + " ".join(sys.argv[1:])
    report = Report(
        title="Price-cut challenger — tree ensemble vs regularized logistic",
        command=command.strip(),
    )

    conn = _sql.get_conn()
    try:
        report.source_counts[f"{SCHEMA}.{TABLE}"] = _sql.fetch_row_count(
            conn, SCHEMA, TABLE
        )
        for label, include_dom in VARIANTS:
            features = feature_columns(include_dom=include_dom)
            with conn.cursor() as cur:
                cur.execute(panel_sql(features))
                rows = cur.fetchall()
                colnames = [d.name for d in cur.description]

            X, y, groups, weeks = _rows_to_arrays(rows, colnames, features)
            if label == VARIANTS[0][0]:
                span = f"{min(weeks):%m/%d/%Y} – {max(weeks):%m/%d/%Y}"
                report.week_span = f"{span} ({len(set(weeks.tolist()))} weeks)"

            report.add(
                f"# Variant: {label}\n\n"
                f"Labeled rows: {len(y):,} · positives: {int(y.sum()):,} "
                f"({y.mean():.1%}) · features: {len(features)}"
            )
            report.add(_section_grouped(X, y, groups, features, args.folds))
            try:
                report.add(
                    _section_timeforward(X, y, groups, weeks, features,
                                         args.holdout_weeks)
                )
            except ValueError as exc:
                report.add(f"## {GATE_LABEL}\n\nNOT RUN — {exc}. The gate cannot "
                           "be evaluated yet; no shipping decision follows from "
                           "this report.")
    finally:
        conn.close()

    report.add(f"### Caveats\n\n{SEASONALITY_CAVEAT}")
    report.add(
        "### How to read the two variants\n\n"
        "FM 7 — `dom_days` is date-floored on 54.2% of the active book. If "
        "`with_dom` beats `without_dom` by a wide margin, the model is leaning on "
        "a field that is substantially fiction, and the honest number is the "
        "`without_dom` one."
    )
    path = report.write("challenger")
    print(f"wrote {path}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--folds", type=int, default=5,
                   help="Grouped-CV folds for Section 1 (never the gate).")
    p.add_argument("--holdout-weeks", type=int, default=1,
                   help="Weeks held out for the Section 2 shipping gate.")
    return run(p.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
