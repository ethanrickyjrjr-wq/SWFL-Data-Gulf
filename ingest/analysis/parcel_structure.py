"""Item 1 — parcel structure pass.

Answers "which parcel columns should feed a future model's parcel cross-link
feature?" by measuring the correlation structure of the numeric columns and
keeping ONE NAMED representative per correlated cluster. PCA runs alongside as an
explained-variance read only: it reports how many independent dimensions the
parcel data holds, and no component is ever persisted or served (a named column
can be cited; a principal component cannot).

Every statistic is computed source-side — see _sql.py for why that is not
negotiable.

THRESHOLDS ARE NOT BAKED IN. The spec deliberately leaves them unset. Run
--profile-only first, read the observed distribution, then pass the floors you
chose; the run records them in its own report. That is the difference between a
measured threshold and an invented one.

    python -m ingest.analysis.parcel_structure --profile-only
    python -m ingest.analysis.parcel_structure --max-zero-share 0.95 \
        --min-distinct 2 --min-non-null-share 0.5 --corr-threshold 0.8

Spec: docs/superpowers/specs/2026-07-22-offline-model-analysis-design.md
"""
from __future__ import annotations

import argparse
import sys

from ingest.analysis import _sql
from ingest.analysis._report import Report
from ingest.analysis._stats import (
    ColumnProfile,
    correlation_clusters,
    explained_variance_ratio,
    pick_representatives,
    screen_columns,
)

SCHEMA = "data_lake"
TABLES = ["lee_parcels", "collier_parcels"]


def validate_allowlist(allowlist: list[str], real_columns: list[str]) -> list[str]:
    """FM 4 — every entry must be a real column. A PC name cannot pass.

    Returns the allow-list unchanged, or raises. This runs before anything is
    written, so a violation aborts rather than committing a bad artifact.
    """
    real = set(real_columns)
    bogus = [c for c in allowlist if c not in real]
    if bogus:
        raise ValueError(
            f"allow-list contains names that are not columns of the source table: "
            f"{bogus}. An allow-list entry must be a citable column."
        )
    return allowlist


def _distribution_block(table: str, profiles: list[ColumnProfile]) -> str:
    lines = [
        f"### `{table}` — observed distribution ({len(profiles)} numeric columns)",
        "",
        "Ordered by zero-share, descending. Read this to CHOOSE the floors; the "
        "floors are not chosen for you.",
        "",
        "    column                          non_null_share  zero_share  distinct",
    ]
    for p in sorted(profiles, key=lambda x: -x.zero_share):
        lines.append(
            f"    {p.name:<30}  {p.non_null_share:>13.4f}  {p.zero_share:>10.4f}  "
            f"{p.distinct:>8,}"
        )
    return "\n".join(lines)


def _excluded_block(table: str, excluded) -> str:
    if not excluded:
        return f"### `{table}` — excluded columns\n\nNone."
    lines = [f"### `{table}` — excluded columns ({len(excluded)})", "",
             "FM 5: printed with their rates, never silently dropped.", ""]
    for e in sorted(excluded, key=lambda x: (x.reason, x.name)):
        lines.append(f"- `{e.name}` — **{e.reason}** ({e.detail})")
    return "\n".join(lines)


def _clusters_block(table: str, names: list[str], labels: list[int],
                    allowlist: list[str], threshold: float) -> str:
    by_cluster: dict[int, list[str]] = {}
    for name, label in zip(names, labels):
        by_cluster.setdefault(label, []).append(name)

    lines = [
        f"### `{table}` — correlation clusters (|r| >= {threshold})",
        "",
        f"{len(names)} screened columns collapse to **{len(by_cluster)} clusters**. "
        "The representative is the highest-cardinality member.",
        "",
    ]
    for label, members in sorted(by_cluster.items()):
        rep = next((m for m in members if m in allowlist), members[0])
        others = [m for m in sorted(members) if m != rep]
        tail = f" (absorbs: {', '.join(f'`{o}`' for o in others)})" if others else ""
        lines.append(f"- **`{rep}`**{tail}")
    return "\n".join(lines)


def _variance_block(table: str, ev) -> str:
    cumulative = ev.cumsum()
    n80 = int((cumulative < 0.80).sum()) + 1
    n95 = int((cumulative < 0.95).sum()) + 1
    lines = [
        f"### `{table}` — PCA explained variance (reported only, never served)",
        "",
        f"- **{n80}** components explain 80% of variance.",
        f"- **{n95}** components explain 95% of variance.",
        f"- First component alone: {ev[0]:.1%}.",
        "",
        "This is a dimensionality READ. No component is persisted, written to the "
        "allow-list, or served — the allow-list is named columns only (FM 4).",
    ]
    return "\n".join(lines)


def run(args) -> int:
    command = "python -m ingest.analysis.parcel_structure " + " ".join(sys.argv[1:])
    report = Report(
        title="Parcel structure pass — column allow-list + dimensionality read",
        command=command.strip(),
    )

    conn = _sql.get_conn()
    try:
        for table in TABLES:
            all_numeric = _sql.fetch_numeric_columns(conn, SCHEMA, table)
            n_rows = _sql.fetch_row_count(conn, SCHEMA, table)
            report.source_counts[f"{SCHEMA}.{table}"] = n_rows

            profiles = _sql.fetch_profiles(conn, SCHEMA, table, all_numeric)
            report.add(_distribution_block(table, profiles))

            if args.profile_only:
                continue

            kept, excluded = screen_columns(
                profiles,
                max_zero_share=args.max_zero_share,
                min_distinct=args.min_distinct,
                min_non_null_share=args.min_non_null_share,
                max_distinct_share=args.max_distinct_share,
            )
            report.add(_excluded_block(table, excluded))

            if len(kept) < 2:
                report.add(f"### `{table}`\n\nFewer than 2 columns survived the "
                           "floors — nothing to cluster.")
                continue

            names = [p.name for p in kept]
            matrix = _sql.fetch_correlation_matrix(conn, SCHEMA, table, names)
            labels = correlation_clusters(names, matrix,
                                          threshold=args.corr_threshold)
            allowlist = pick_representatives(
                names, labels, {p.name: p.distinct for p in kept}
            )
            validate_allowlist(allowlist, all_numeric)

            report.add(_clusters_block(table, names, labels, allowlist,
                                       args.corr_threshold))
            report.add(_variance_block(table, explained_variance_ratio(matrix)))
            report.add(
                f"### `{table}` — ALLOW-LIST ({len(allowlist)} columns)\n\n"
                + "\n".join(f"- `{c}`" for c in allowlist)
            )
    finally:
        conn.close()

    floors = (
        "### Floors used\n\n"
        + ("Profile-only run — no floors applied, no allow-list produced.\n"
           if args.profile_only else
           f"- max_zero_share = {args.max_zero_share}\n"
           f"- min_distinct = {args.min_distinct}\n"
           f"- min_non_null_share = {args.min_non_null_share}\n"
           f"- max_distinct_share = {args.max_distinct_share}\n"
           f"- corr_threshold = {args.corr_threshold}\n\n"
           "Chosen from the observed distribution above, not from the spec.")
    )
    report.add(floors)

    slug = "parcel-structure-profile" if args.profile_only else "parcel-structure"
    path = report.write(slug)
    print(f"wrote {path}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--profile-only", action="store_true",
                   help="Report the observed distribution and stop, so the "
                        "floors can be chosen from data rather than invented.")
    p.add_argument("--max-zero-share", type=float, default=0.95)
    p.add_argument("--min-distinct", type=int, default=2)
    p.add_argument("--min-non-null-share", type=float, default=0.5)
    p.add_argument("--max-distinct-share", type=float, default=0.99,
                   help="Drop columns whose distinct/non-null ratio is at or "
                        "above this — a row identifier, not a feature "
                        "(lee_parcels.file_sequence_no is exactly 1.0).")
    p.add_argument("--corr-threshold", type=float, default=0.8)
    return run(p.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
