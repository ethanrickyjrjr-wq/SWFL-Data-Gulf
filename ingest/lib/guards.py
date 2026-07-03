"""Volume-guard assertions for ingest pipelines.

Raise VolumeGuardError pre-promote when a landed row count fails a
floor check. Pipelines import the assert_* functions and call them
after fetching/parsing but before any Tier-2 write.
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)


class VolumeGuardError(RuntimeError):
    """Raised pre-promote when a volume assertion fails. Named for unambiguous GHA log parsing."""

    pass


def assert_vs_canonical(landed: int, canonical: int, floor: float = 0.9, label: str = "") -> None:
    """Assert landed >= floor * canonical.

    Use for ArcGIS / API sources where the total count is queryable. Caller
    fetches the canonical count and passes it as an int.
    """
    if canonical > 0 and landed < int(canonical * floor):
        raise VolumeGuardError(
            f"[volume-guard] {label}: landed {landed:,} rows vs canonical {canonical:,} "
            f"({landed / canonical:.1%} < {floor:.0%} floor) — aborting to avoid silent data loss"
        )


def assert_min_rows(landed: int, minimum: int, label: str = "") -> None:
    """Assert landed >= minimum.

    Use for flat-file / scrape sources where no canonical endpoint exists.
    Set minimum from cadence_registry expected_rows_min.
    """
    if landed < minimum:
        raise VolumeGuardError(
            f"[volume-guard] {label}: landed {landed:,} rows < minimum {minimum:,} — aborting"
        )


def assert_county_coverage(
    rows_by_county: dict[str, int],
    expected_counties: list[str],
    min_per_county: int = 1,
    label: str = "",
) -> None:
    """Assert every dense county in ``expected_counties`` independently cleared a floor.

    A TOTAL-count floor (``assert_min_rows``) and a total-vs-prior check
    (``assert_vs_baseline``) are both blind to a PARTIAL block: Lee lands thousands
    of rows, Collier gets WAF-403'd after a handful of ZIPs, and the total still
    looks healthy — so the run goes green while a dense county silently emptied. This
    guard checks the SHAPE instead: each county named in ``expected_counties`` must
    independently clear ``min_per_county``.

    Differential, not absolute: it only fires when the run OTHERWISE succeeded (at
    least one county landed rows). A total block — nothing landed anywhere — is left
    to the caller's total-empty / baseline guards so this never double-raises or
    false-alarms a bootstrap / all-fail run. Pass only the counties known to be dense
    (never the rural pair that legitimately returns 0), each with a floor set well
    below a healthy county but well above a WAF-truncated one.
    """
    if not any(n > 0 for n in rows_by_county.values()):
        # Nothing landed anywhere — a total block, not a per-county collapse. Defer to
        # the total-empty / baseline guards; don't double-raise here.
        return
    collapsed = [c for c in expected_counties if rows_by_county.get(c, 0) < min_per_county]
    if collapsed:
        detail = ", ".join(f"{c}={rows_by_county.get(c, 0):,}" for c in expected_counties)
        raise VolumeGuardError(
            f"[volume-guard] {label}: county-coverage collapse — "
            f"{', '.join(collapsed)} below floor {min_per_county:,} while other counties landed "
            f"({detail}) — a partial WAF block or filter change silently emptied a dense county"
        )


def assert_vs_baseline(
    landed: int,
    prior: int | None,
    drop_band: float = 0.5,
    spike_band: float = 5.0,
    label: str = "",
) -> None:
    """Assert landed rows haven't collapsed or exploded vs prior load.

    Bootstrap behavior: if prior is None or 0, logs BASELINE_UNAVAILABLE and
    returns without raising. New pipelines will not false-alarm on first run.
    """
    if not prior:
        log.warning(
            "[volume-guard] BASELINE_UNAVAILABLE for %s — skipping baseline check",
            label or "unknown",
        )
        return
    if landed < int(prior * drop_band):
        raise VolumeGuardError(
            f"[volume-guard] {label}: landed {landed:,} rows < {drop_band:.0%} of prior {prior:,} — collapse detected"
        )
    if landed > int(prior * spike_band):
        raise VolumeGuardError(
            f"[volume-guard] {label}: landed {landed:,} rows > {spike_band:.0f}x prior {prior:,} — spike detected"
        )
