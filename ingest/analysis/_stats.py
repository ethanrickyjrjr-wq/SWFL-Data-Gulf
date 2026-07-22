"""Pure statistics for the offline analysis package — no DB, no I/O, no network.

Mirrors the listing_week split: builder.py is pure and db.py holds the I/O seam.
Here _stats.py is pure and _sql.py holds the seam. Everything below operates on
an in-memory profile list or an n-by-n correlation matrix, so the whole surface
is fixture-testable without touching data_lake.

Spec: docs/superpowers/specs/2026-07-22-offline-model-analysis-design.md
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ColumnProfile:
    """One numeric column's degeneracy profile, computed source-side by _sql.py."""

    name: str
    n: int
    non_null: int
    distinct: int
    zeros: int

    @property
    def non_null_share(self) -> float:
        return self.non_null / self.n if self.n else 0.0

    @property
    def zero_share(self) -> float:
        """Share of ALL rows that are literal 0.

        Load-bearing on this source. Probed live 07/22/2026 against
        data_lake.lee_parcels (556,083 rows): the FDOR loader writes 0 rather than
        NULL, so every numeric column reads 100% non-null while
        jv_hist_commercial is 100.00% zero and jv_conservation 99.96%. A
        null-rate floor alone cannot see that; this is the column that can.
        """
        return self.zeros / self.n if self.n else 0.0

    @property
    def distinct_share(self) -> float:
        """Distinct values per non-null row. ~1.0 means a row IDENTIFIER.

        Probed live 07/22/2026: lee_parcels.file_sequence_no has 556,083 distinct
        values over 556,083 rows — a primary key wearing a numeric type. It is
        100% non-null, 0% zero and maximally high-cardinality, so every other
        floor waves it through.
        """
        return self.distinct / self.non_null if self.non_null else 0.0


@dataclass(frozen=True)
class ExcludedColumn:
    name: str
    reason: str
    detail: str


def screen_columns(
    profiles: list[ColumnProfile],
    *,
    max_zero_share: float,
    min_distinct: int,
    min_non_null_share: float,
    max_distinct_share: float | None = None,
) -> tuple[list[ColumnProfile], list[ExcludedColumn]]:
    """Split columns into (kept, excluded) before any correlation is computed.

    FM 5 — correlation over a mostly-degenerate column is meaningless, so the
    floors run FIRST. Every exclusion carries its measured rate so the report can
    print it; nothing is ever dropped silently.

    Thresholds are arguments, never constants: the spec deliberately leaves them
    unset so the first run picks them from the observed distribution and records
    them in that run's report (no invented number).
    """
    kept: list[ColumnProfile] = []
    excluded: list[ExcludedColumn] = []

    for p in profiles:
        detail = (f"non_null_share={p.non_null_share:.4f} "
                  f"zero_share={p.zero_share:.2f} distinct={p.distinct} "
                  f"distinct_share={p.distinct_share:.4f}")
        if p.non_null_share < min_non_null_share:
            excluded.append(ExcludedColumn(p.name, "sparse", detail))
        elif p.distinct < min_distinct:
            excluded.append(ExcludedColumn(p.name, "constant", detail))
        elif p.zero_share > max_zero_share:
            excluded.append(ExcludedColumn(p.name, "zero_filled", detail))
        elif (max_distinct_share is not None
              and p.distinct_share >= max_distinct_share):
            excluded.append(ExcludedColumn(p.name, "identifier", detail))
        else:
            kept.append(p)

    return kept, excluded


def correlation_clusters(
    names: list[str], corr: np.ndarray, *, threshold: float
) -> list[int]:
    """Cluster columns by |correlation|, returning one integer label per column.

    Vendor guidance, scikit-learn 1.9.0 permutation_importance docs (crawl4ai,
    07/22/2026): "One way to handle the issue is to cluster features that are
    correlated and only keep one feature from each cluster."

    Distance is 1 - |corr|, so `threshold` reads as a correlation: 0.8 means
    columns correlated at |r| >= 0.8 land in one cluster. Average linkage on a
    precomputed distance matrix is deterministic — no random_state exists or is
    needed (FM 9).

    AgglomerativeClustering (not scipy.cluster.hierarchy) keeps scipy out of the
    direct import surface deptry checks.
    """
    from sklearn.cluster import AgglomerativeClustering

    if len(names) < 2:
        return [0] * len(names)

    distance = 1.0 - np.abs(np.asarray(corr, dtype=float))
    np.fill_diagonal(distance, 0.0)
    # Guard against tiny floating-point asymmetry from the source-side pairwise
    # corr() reads — the estimator requires an exactly symmetric matrix.
    distance = (distance + distance.T) / 2.0
    distance = np.clip(distance, 0.0, None)

    model = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=1.0 - threshold,
        metric="precomputed",
        linkage="average",
    )
    return [int(x) for x in model.fit_predict(distance)]


def pick_representatives(
    names: list[str], labels: list[int], cardinality: dict[str, int]
) -> list[str]:
    """One named column per cluster — the committed allow-list.

    FM 4: the artifact is a list of real column NAMES, never a component. Within
    a cluster the highest-cardinality column wins (it carries the most
    resolution); ties break on name so two dated runs agree (FM 9).
    """
    by_cluster: dict[int, list[str]] = {}
    for name, label in zip(names, labels):
        by_cluster.setdefault(label, []).append(name)

    reps = [
        sorted(members, key=lambda c: (-cardinality.get(c, 0), c))[0]
        for _, members in sorted(by_cluster.items())
    ]
    return sorted(reps)


def explained_variance_ratio(corr: np.ndarray) -> np.ndarray:
    """PCA explained-variance ratio, descending — a REPORTED NUMBER ONLY.

    PCA on standardized data is the eigendecomposition of the correlation
    matrix, so this answers "how many independent dimensions does the parcel
    data actually hold?" without materializing, persisting, or serving a single
    component (FM 4). It also means the read costs one eigendecomposition of an
    n-by-n matrix rather than a pull of 847,056 rows.

    eigvalsh (not eigvals) because a correlation matrix is symmetric: it returns
    real eigenvalues in deterministic order.
    """
    ratio, _, _ = explained_variance_with_diagnostics(corr)
    return ratio


def explained_variance_with_diagnostics(
    corr: np.ndarray,
) -> tuple[np.ndarray, float, int]:
    """As above, plus how much negative eigenvalue mass had to be clipped.

    This matrix is assembled from INDEPENDENT pairwise corr() reads, so unlike a
    single-pass covariance estimate it is not guaranteed positive-semi-definite:
    a few slightly-negative eigenvalues are possible, and clipping them silently
    would distort the "N components explain 80%" headline that lands in the
    report, the spec and the session log. Reporting the clipped mass means the
    number can be trusted or discounted on evidence rather than on faith.
    """
    raw = np.linalg.eigvalsh(np.asarray(corr, dtype=float))[::-1]
    negative = raw[raw < 0]
    clipped_count = int(negative.size)
    clipped_mass = float(-negative.sum()) if clipped_count else 0.0

    eigenvalues = np.clip(raw, 0.0, None)
    total = eigenvalues.sum()
    if total <= 0:
        return np.zeros_like(eigenvalues), clipped_mass, clipped_count
    return eigenvalues / total, clipped_mass, clipped_count
