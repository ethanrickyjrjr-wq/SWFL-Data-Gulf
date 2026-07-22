"""Challenger tests (FM 2, 6, 7, 9, 12). Pure logic + a source scan — no DB."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import numpy as np
import pytest

from ingest.analysis import challenger

PACKAGE = Path("ingest/analysis")


# ---------------------------------------------------------------- FM 6
# "Impurity importances used anyway." Vendor (sklearn 1.9.0, permutation_importance
# docs): MDI importance is "strongly biased" and favours high-cardinality features
# "over low cardinality features such as binary features" — precisely the mix our
# stress signals have. The guard is that the attribute appears NOWHERE.

def test_no_impurity_importances_anywhere_in_the_package():
    offenders = [
        p.name for p in PACKAGE.glob("*.py")
        if "feature_importances_" in p.read_text(encoding="utf-8")
    ]
    assert offenders == [], (
        f"{offenders} reference feature_importances_; permutation_importance is "
        "the only importance this package is allowed to report."
    )


def test_challenger_uses_permutation_importance():
    src = (PACKAGE / "challenger.py").read_text(encoding="utf-8")
    assert "permutation_importance" in src


# ---------------------------------------------------------------- FM 2
# "Leakage through CV folds." One listing contributes multiple weekly rows.

def test_fold_isolation_no_address_in_both_sides():
    groups = np.array([f"addr{i // 3}" for i in range(30)])   # 10 listings x 3 weeks
    y = np.array([i % 2 for i in range(30)])
    for train_idx, valid_idx in challenger.group_folds(groups, y, n_splits=3):
        assert not (set(groups[train_idx]) & set(groups[valid_idx]))


def test_group_folds_cover_every_row_exactly_once_as_validation():
    groups = np.array([f"addr{i // 3}" for i in range(30)])
    y = np.array([i % 2 for i in range(30)])
    seen: list[int] = []
    for _, valid_idx in challenger.group_folds(groups, y, n_splits=3):
        seen.extend(valid_idx.tolist())
    assert sorted(seen) == list(range(30))


# ---------------------------------------------------------------- time-forward
# Section 2 is the ONLY gate. Train on weeks <= T, validate on weeks > T.

def test_time_forward_split_never_trains_on_the_future():
    weeks = np.array([date(2026, 6, 29)] * 5 + [date(2026, 7, 6)] * 5
                     + [date(2026, 7, 13)] * 5)
    train_idx, valid_idx = challenger.time_forward_split(weeks, holdout_weeks=1)
    assert weeks[train_idx].max() < weeks[valid_idx].min()


def test_time_forward_holdout_is_the_last_week():
    weeks = np.array([date(2026, 6, 29)] * 5 + [date(2026, 7, 6)] * 5
                     + [date(2026, 7, 13)] * 5)
    _, valid_idx = challenger.time_forward_split(weeks, holdout_weeks=1)
    assert set(weeks[valid_idx]) == {date(2026, 7, 13)}


def test_time_forward_split_raises_when_too_few_weeks():
    weeks = np.array([date(2026, 7, 13)] * 5)
    with pytest.raises(ValueError):
        challenger.time_forward_split(weeks, holdout_weeks=1)


# ---------------------------------------------------------------- FM 7
# "Floored days-on-market poisoning the features." 54.2% of active rows are
# date-floored, and dom_days is a feature. Run both ways, report both.

def test_feature_sets_run_with_and_without_dom_days():
    with_dom = challenger.feature_columns(include_dom=True)
    without = challenger.feature_columns(include_dom=False)
    assert "dom_days" in with_dom
    assert "dom_days" not in without
    assert set(without) < set(with_dom)


def test_variants_are_both_reported():
    assert challenger.VARIANTS == [("with_dom", True), ("without_dom", False)]


# ---------------------------------------------------------------- FM 9
# "Non-determinism making two dated reports incomparable."

def test_seed_is_fixed_and_shared():
    assert isinstance(challenger.RANDOM_STATE, int)
    src = (PACKAGE / "challenger.py").read_text(encoding="utf-8")
    assert "random_state=RANDOM_STATE" in src


# ---------------------------------------------------------------- FM 12
# The challenger DOES need rows (you cannot fit a model on aggregates), so the
# guard is that it pulls only LABELED rows and only the columns it uses.

def test_panel_query_pulls_only_labeled_rows():
    sql = challenger.panel_sql(challenger.feature_columns(include_dom=True))
    assert "IS NOT NULL" in sql
    assert challenger.TARGET in sql


def test_panel_query_never_selects_star():
    sql = challenger.panel_sql(challenger.feature_columns(include_dom=True))
    assert "*" not in sql
