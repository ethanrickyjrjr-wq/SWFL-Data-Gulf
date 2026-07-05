"""Volume-guard assertions for ingest pipelines.

Raise VolumeGuardError pre-promote when a landed row count fails a
floor check. Pipelines import the assert_* functions and call them
after fetching/parsing but before any Tier-2 write.
"""
from __future__ import annotations

import logging
from datetime import date, datetime

log = logging.getLogger(__name__)


class VolumeGuardError(RuntimeError):
    """Raised pre-promote when a volume assertion fails. Named for unambiguous GHA log parsing."""

    pass


class ContentStaleError(RuntimeError):
    """Raised pre-promote when the freshest CONTENT date is missing or too old.

    Distinct from VolumeGuardError on purpose: this is a stalled-source / dead-scrape
    signal, NOT a row-count problem. A merge pipeline can write a fresh _dlt_loads row
    (LOAD-fresh) every run while re-merging the same stale content — the row count looks
    healthy while the newest content date never advances. That is exactly how lee_permits
    sat 18 days stale behind 3 green cron runs. Named for unambiguous GHA log parsing and
    cron-failure classification (CONTENT_STALE -> investigate source/scraper, do NOT retry)."""

    pass


def assert_content_fresh(
    newest,
    max_age_days: int,
    label: str = "",
    today: date | None = None,
) -> None:
    """Assert the freshest content date is no older than ``max_age_days``.

    ``newest`` is MAX(content_date) across the freshly-fetched batch — the newest
    period_end / issued_date / month the source actually produced THIS run, not the load
    timestamp. Accepts a ``date``/``datetime`` (permits: ``issued_date``) or an ISO string
    (redfin: ``period_end`` is stored as text); anything else is a caller error.

    Raises ContentStaleError when:
      - ``newest`` is None            — source produced no dated rows (dead scrape / empty pull)
      - ``today - newest > max_age``  — content stalled past the allowed age

    ``max_age_days`` is the pipeline's own GATING threshold (content lag + one cadence +
    buffer), deliberately TIGHTER than the daily probe's ``cadence * tolerance``: the probe
    is loose for observability, this trips the cron red. ``today`` is injectable for tests.
    """
    ref = today or date.today()
    if newest is None:
        raise ContentStaleError(
            f"[content-guard] {label}: no dated rows in the fetched batch — source produced "
            f"nothing datable (dead scrape / empty pull) — aborting"
        )
    if isinstance(newest, str):
        newest = date.fromisoformat(newest[:10])
    elif isinstance(newest, datetime):
        newest = newest.date()
    age = (ref - newest).days
    if age > max_age_days:
        raise ContentStaleError(
            f"[content-guard] {label}: newest content date {newest.isoformat()} is {age}d old "
            f"(> {max_age_days}d max) — content stalled; the load may be LOAD-fresh but the "
            f"source has not advanced — aborting"
        )


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
