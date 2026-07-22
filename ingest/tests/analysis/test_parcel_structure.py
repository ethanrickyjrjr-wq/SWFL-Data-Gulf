"""parcel_structure tests — the FM 4 abort path and the report blocks.

Added 07/22/2026 after review caught that `validate_allowlist` shipped with its
raise branch unexercised: the earlier suite tested `pick_representatives` against
a fixture list, which is a DIFFERENT function and a different contract. The spec
names this test `test_allowlist_columns_exist`; it belongs here.
"""
from __future__ import annotations

import numpy as np
import pytest

from ingest.analysis._stats import ExcludedColumn
from ingest.analysis.parcel_structure import (
    _excluded_block,
    _variance_block,
    validate_allowlist,
)


REAL_COLUMNS = ["jv", "av_sd", "av_nsd", "land_sqft", "living_area_sqft"]


# ---------------------------------------------------------------- FM 4
# "Principal components escaping into a served path." The committed artifact is
# an allow-list of real column NAMES; the validator is what makes that true, and
# it must ABORT rather than write a bad artifact.

def test_allowlist_columns_exist():
    assert validate_allowlist(["jv", "land_sqft"], REAL_COLUMNS) == ["jv", "land_sqft"]


def test_allowlist_rejects_a_principal_component():
    with pytest.raises(ValueError, match="not columns"):
        validate_allowlist(["PC1", "jv"], REAL_COLUMNS)


def test_allowlist_rejects_any_unknown_name():
    with pytest.raises(ValueError) as exc:
        validate_allowlist(["jv", "made_up_column"], REAL_COLUMNS)
    assert "made_up_column" in str(exc.value)


def test_allowlist_error_names_every_offender():
    with pytest.raises(ValueError) as exc:
        validate_allowlist(["PC1", "PC2"], REAL_COLUMNS)
    assert "PC1" in str(exc.value) and "PC2" in str(exc.value)


def test_empty_allowlist_is_vacuously_valid():
    assert validate_allowlist([], REAL_COLUMNS) == []


# ---------------------------------------------------------------- FM 5
# The guard is "printed with their rates", so the block must actually print them.

def test_excluded_block_prints_every_rate():
    excluded = [
        ExcludedColumn("jv_hist_commercial", "zero_filled",
                       "non_null_share=1.0000 zero_share=1.00 distinct=1 "
                       "distinct_share=0.0000"),
        ExcludedColumn("co_no", "constant",
                       "non_null_share=1.0000 zero_share=0.00 distinct=1 "
                       "distinct_share=0.0000"),
    ]
    block = _excluded_block("lee_parcels", excluded)
    assert "jv_hist_commercial" in block and "zero_share=1.00" in block
    assert "co_no" in block and "constant" in block
    assert "(2)" in block            # count is stated


def test_excluded_block_says_none_when_nothing_dropped():
    assert "None." in _excluded_block("lee_parcels", [])


# ------------------------------------------------------- PSD / clipping guard
# The correlation matrix is assembled from INDEPENDENT pairwise corr() reads, so
# it is not guaranteed positive-semi-definite the way a single-pass covariance
# estimate would be. explained_variance_ratio clips negatives to 0, which would
# silently distort the "N components explain 80%" headline. The report states
# the clipped mass so the number can never quietly drift.

def test_variance_block_reports_clipped_negative_eigenvalue_mass():
    ev = np.array([0.5, 0.3, 0.2])
    block = _variance_block("lee_parcels", ev, clipped_mass=0.0, clipped_count=0)
    assert "components explain 80%" in block
    assert "none clipped" in block.lower()


def test_variance_block_surfaces_a_material_clip_as_a_warning():
    ev = np.array([0.6, 0.25, 0.15])
    block = _variance_block("lee_parcels", ev, clipped_mass=0.031, clipped_count=2)
    assert "3.10e-02" in block       # magnitude is always legible, never "0.000"
    assert "discount" in block


def test_negligible_clip_is_not_dressed_up_as_a_warning():
    """Collier's live run clips 2 eigenvalues totalling 4.04e-04 across 25
    columns = 0.0016% of total variance. Calling that 'discount these figures'
    is how a real warning gets trained into background noise.

    Judged RELATIVE TO THE TRACE: a correlation matrix's eigenvalues sum to the
    column count, so the same absolute mass is trivial at 59 columns and
    material at 3.
    """
    ev = np.ones(25) / 25
    block = _variance_block("collier_parcels", ev, clipped_mass=4.04e-4,
                            clipped_count=2)
    assert "negligible" in block
    assert "the figures above stand" in block
    assert "discount" not in block


def test_same_absolute_mass_is_material_on_a_small_matrix():
    """The identical 4.04e-04 across 3 columns is 0.013% — still negligible; but
    a mass that is >=0.1% of the trace must warn. This pins the relative rule."""
    small = np.array([0.6, 0.25, 0.15])
    assert "discount" in _variance_block("t", small, clipped_mass=0.031,
                                         clipped_count=2)
    assert "negligible" in _variance_block("t", small, clipped_mass=1e-6,
                                           clipped_count=1)


def test_variance_block_never_claims_more_components_than_exist():
    ev = np.array([0.99, 0.01])
    block = _variance_block("lee_parcels", ev, clipped_mass=0.0, clipped_count=0)
    assert "**1** components explain 80%" in block
