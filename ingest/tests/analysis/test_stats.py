"""Pure-stats tests for ingest/analysis. Each test is named for the failure mode it
targets in docs/superpowers/specs/2026-07-22-offline-model-analysis-design.md.

No DB, no network — every input here is a synthetic in-memory matrix.
"""
from __future__ import annotations

import numpy as np
import pytest

from ingest.analysis._stats import (
    ColumnProfile,
    correlation_clusters,
    explained_variance_ratio,
    pick_representatives,
    screen_columns,
)


def _p(name, *, n=1000, non_null=1000, distinct=500, zeros=0):
    return ColumnProfile(name=name, n=n, non_null=non_null,
                         distinct=distinct, zeros=zeros)


# ---------------------------------------------------------------- FM 5
# "Column selection made on junk columns." Guard: degeneracy floors applied
# BEFORE clustering, with every exclusion printed with its rate.
#
# Probed live 07/22/2026 (data_lake.lee_parcels, 556,083 rows): the FDOR loader
# ZERO-FILLS — jv_hist_commercial is 100.00% zero, jv_conservation 99.96%,
# sale_prc1 85.47%, and true NULLs are 0 across every numeric column. A pure
# null-rate floor is therefore blind on this source; zero-share is the real
# degeneracy signal. co_no is genuinely constant (cardinality 1).

def test_null_and_cardinality_floor_excludes_constant_and_all_null():
    cols = [
        _p("jv", distinct=224_279),                      # keep
        _p("co_no", distinct=1),                         # constant -> drop
        _p("all_null", non_null=0, distinct=0),          # all-null -> drop
    ]
    kept, excluded = screen_columns(cols, max_zero_share=0.95, min_distinct=2,
                                    min_non_null_share=0.5)
    assert [c.name for c in kept] == ["jv"]
    assert {e.name for e in excluded} == {"co_no", "all_null"}


def test_zero_filled_column_is_excluded_even_with_zero_nulls():
    """The live case a null-rate floor cannot see: 100% non-null, 100% zero."""
    cols = [
        _p("jv", zeros=17, distinct=224_279),
        _p("jv_hist_commercial", zeros=1000, distinct=1),   # 100.00% zero
        _p("jv_conservation", zeros=996, distinct=5),       # 99.60% zero
    ]
    kept, excluded = screen_columns(cols, max_zero_share=0.95, min_distinct=2,
                                    min_non_null_share=0.5)
    assert [c.name for c in kept] == ["jv"]
    assert {e.name for e in excluded} == {"jv_hist_commercial", "jv_conservation"}


def test_identifier_column_is_excluded():
    """FM 13 — a row identifier passes every other floor.

    Found by the 07/22/2026 --profile-only run, not by design: lee_parcels'
    `file_sequence_no` has distinct = 556,083 = exactly the row count. It is
    100% non-null, 0% zero, and maximally high-cardinality, so the sparse /
    constant / zero-fill floors all wave it through — straight into a committed
    allow-list, as a 'feature' that is really a primary key.
    """
    cols = [
        _p("jv", distinct=403),                          # 40.3% of n — a feature
        _p("file_sequence_no", distinct=1000),           # distinct == n — an ID
    ]
    kept, excluded = screen_columns(cols, max_zero_share=0.95, min_distinct=2,
                                    min_non_null_share=0.5,
                                    max_distinct_share=0.99)
    assert [c.name for c in kept] == ["jv"]
    assert [e.name for e in excluded] == ["file_sequence_no"]
    assert excluded[0].reason == "identifier"


def test_high_cardinality_feature_is_not_mistaken_for_an_identifier():
    """The guard must not eat a legitimately granular money column.

    Live rates: jv 224,279 distinct / 556,083 rows = 0.403; av_nsd = 0.470.
    Only distinct/non_null at ~1.0 is an ID.
    """
    cols = [_p("av_nsd", n=556_083, non_null=556_083, distinct=261_096)]
    kept, excluded = screen_columns(cols, max_zero_share=0.95, min_distinct=2,
                                    min_non_null_share=0.5,
                                    max_distinct_share=0.99)
    assert [c.name for c in kept] == ["av_nsd"]
    assert excluded == []


def test_every_exclusion_carries_its_rate():
    """FM 5's guard is 'printed with their rates', never silently dropped."""
    cols = [_p("jv", distinct=100), _p("dead", zeros=1000, distinct=1)]
    _, excluded = screen_columns(cols, max_zero_share=0.95, min_distinct=2,
                                 min_non_null_share=0.5)
    (dead,) = excluded
    assert dead.reason
    assert "1.00" in dead.detail or "100" in dead.detail


# ---------------------------------------------------------------- FM 4
# "Principal components escaping into a served path." The committed artifact is
# an allow-list of real column NAMES; a PC name cannot pass.

def test_representatives_are_real_column_names_never_components():
    names = ["jv", "av_sd", "land_sqft"]
    # jv <-> av_sd are near-collinear (probed live: corr = 0.992).
    m = np.array([
        [1.00, 0.99, 0.20],
        [0.99, 1.00, 0.22],
        [0.20, 0.22, 1.00],
    ])
    labels = correlation_clusters(names, m, threshold=0.8)
    reps = pick_representatives(names, labels, {"jv": 224_279, "av_sd": 140_672,
                                                "land_sqft": 30_632})
    assert set(reps) <= set(names)
    assert not any(r.upper().startswith("PC") for r in reps)


def test_collinear_pair_collapses_to_one_representative():
    names = ["jv", "av_sd", "land_sqft"]
    m = np.array([
        [1.00, 0.99, 0.20],
        [0.99, 1.00, 0.22],
        [0.20, 0.22, 1.00],
    ])
    labels = correlation_clusters(names, m, threshold=0.8)
    reps = pick_representatives(names, labels, {"jv": 224_279, "av_sd": 140_672,
                                                "land_sqft": 30_632})
    # jv and av_sd are one cluster -> exactly one survives; land_sqft its own.
    assert len(reps) == 2
    assert "land_sqft" in reps
    assert ("jv" in reps) != ("av_sd" in reps)


# ---------------------------------------------------------------- PCA read
# Explained variance is a REPORTED NUMBER ONLY — no component is persisted.
# On a correlation matrix, PCA explained variance == eigenvalues / n.

def test_explained_variance_sums_to_one_and_is_ordered():
    m = np.array([
        [1.00, 0.99, 0.20],
        [0.99, 1.00, 0.22],
        [0.20, 0.22, 1.00],
    ])
    ev = explained_variance_ratio(m)
    assert ev.shape == (3,)
    assert ev.sum() == pytest.approx(1.0)
    assert list(ev) == sorted(ev, reverse=True)


def test_two_collinear_columns_hold_one_effective_dimension():
    """Sanity: a near-perfectly collinear pair should not read as 2 dimensions."""
    m = np.array([[1.0, 0.999], [0.999, 1.0]])
    ev = explained_variance_ratio(m)
    assert ev[0] > 0.99


# ---------------------------------------------------------------- FM 9
# "Non-determinism making two dated reports incomparable."

def test_seed_determinism_clustering_is_stable_across_runs():
    names = [f"c{i}" for i in range(6)]
    rng = np.random.default_rng(0)
    a = rng.normal(size=(6, 6))
    m = np.corrcoef(a)
    first = correlation_clusters(names, m, threshold=0.8)
    for _ in range(3):
        assert correlation_clusters(names, m, threshold=0.8) == first
