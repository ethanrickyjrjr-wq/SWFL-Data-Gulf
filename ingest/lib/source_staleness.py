"""Vendor-file staleness tripwire — the HEADER arm of the content-stale guard.

Twin of ``ingest.lib.guards.assert_content_fresh``, which gates on the newest
dated row the source PRODUCED (period_end / issued_date). This module gates on
what the vendor's own HTTP ``Last-Modified`` header says about the FILE. Two
different signals; a pipeline that has both catches a freeze twice — the header
trips the cycle the vendor stops republishing, the content gate trips whenever
the rows stop advancing (including on sources that serve no usable header).

WHY THIS IS NOT ``assert_content_fresh`` (the one question this module has to
answer): the None cases are opposites. ``assert_content_fresh(None)`` RAISES —
no dated rows means a dead scrape. Here, an absent or unparseable
``Last-Modified`` means "we could not look" (HEAD 403'd, S3 omitted the header,
the vendor sent junk), which must DEGRADE to a warning and leave the content
gate as the decider. Flattening the two into one function would make every
HEAD failure a red cron.

The strike shape this exists for: ``stale-source-served-silently`` — the legacy
Redfin dump froze at Last-Modified 06/02/2026 and kept serving HTTP 200s for six
weeks behind green crons. ``redfin_swfl`` looked at the header from
07/17/2026 (commit ed0b2efd) but only PRINTED a note; nothing ever raised.

Raises ``guards.ContentStaleError`` — re-exported, the same class object, never
a second one with the same name: ``.github/scripts/classify-cron-failure.mjs``
classifies CONTENT_STALE (investigate the source, do NOT retry) off the class
name and the ``[content-guard]`` prefix, and existing ``except ContentStaleError``
handlers must keep working.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from email.utils import parsedate_to_datetime

from ingest.lib.guards import ContentStaleError

__all__ = [
    "ContentStaleError",
    "assert_advanced",
    "head_last_modified",
    "parse_last_modified",
]

log = logging.getLogger(__name__)


def _as_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise TypeError(f"expected date/datetime/ISO str, got {type(value).__name__}")


def assert_advanced(
    *,
    vendor_last_modified=None,
    last_landed=None,
    max_stale_days: int,
    today: date | None = None,
    label: str = "",
) -> None:
    """Assert the vendor republished the file within ``max_stale_days``.

    ``vendor_last_modified`` is what ``head_last_modified()`` read off the live
    object. ``None`` (HEAD failed / header absent / header junk) LOGS and returns
    — see the module docstring; the caller's content gate is the backstop, so
    only wire this into pipelines that have one.

    ``last_landed`` does NOT gate. It only shapes the message (did this run
    re-see the same object we already hold, or a newer-but-still-old one). Age
    alone decides, deliberately: redfin_swfl's doctrine is that a mid-cycle rerun
    legitimately sees an unchanged object, so non-advancement by itself is never
    fatal — a frozen file only becomes fatal once it is also too old. Pass it
    when you already have it for free (a Tier-1 inventory row's
    ``source_last_modified``); pass nothing when reading it would cost a DB
    round-trip.

    ``max_stale_days`` is the pipeline's GATING threshold (publish lag + one
    cadence + buffer) — same doctrine as ``assert_content_fresh``: tighter than
    the daily probe's loose observability window, because this one trips the
    cron red. ``today`` is injectable for tests.
    """
    vendor = _as_date(vendor_last_modified)
    subject = label or "unknown"
    if vendor is None:
        log.warning(
            "[content-guard] %s: no usable Last-Modified on the source object — "
            "skipping the header tripwire (content gate still applies)",
            subject,
        )
        return

    ref = today or date.today()
    age = (ref - vendor).days
    log.info("[content-guard] %s: vendor Last-Modified %s (%dd old)", subject, vendor, age)
    if age <= max_stale_days:
        return

    landed = _as_date(last_landed)
    held = (
        f" and it is not newer than what we already landed ({landed.isoformat()}) — "
        f"this run would re-land data we hold"
        if landed is not None and vendor <= landed
        else ""
    )
    raise ContentStaleError(
        f"[content-guard] {subject}: vendor file was last published {vendor.isoformat()}, "
        f"{age}d ago (> {max_stale_days}d max){held} — the source has FROZEN while still "
        f"serving 200s; aborting before promote. DO NOT RE-RUN: check the vendor's download "
        f"page for a moved/renamed path"
    )


def parse_last_modified(raw: str | None) -> date | None:
    """RFC-2822 ``Last-Modified`` header -> ``date``; ``None`` when unreadable.

    Separate from ``head_last_modified`` for the pipeline that already HEADs the
    source for its own ETag note and stores the raw header string in its Tier-1
    inventory row (``redfin_swfl``): it can parse the string it holds and the
    string it stored last run instead of paying a second HEAD.

    ``parsedate_to_datetime`` RAISES ``ValueError`` on 3.12 for a malformed
    header — it does not return None — so junk is caught here, not at the call
    site. Never raises.
    """
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw).date()
    except (ValueError, TypeError) as exc:
        log.warning("[content-guard] unparseable Last-Modified %r (%s)", raw, exc)
        return None


def head_last_modified(url: str, *, timeout: int = 60) -> date | None:
    """One ``requests.head``; return the ``Last-Modified`` date or ``None``.

    ``None`` on every failure mode — request error, missing header, unparseable
    header. Never raises: an unreadable header is an observability loss, not a
    pipeline failure. See ``assert_advanced``.
    """
    import requests  # lazy: keeps the pure arm importable with no network deps

    try:
        resp = requests.head(url, timeout=timeout, allow_redirects=True)
        resp.raise_for_status()
        return parse_last_modified(resp.headers.get("Last-Modified"))
    except Exception as exc:  # RequestException & friends — all degrade
        log.warning("[content-guard] HEAD %s failed (%s) — Last-Modified unknown", url, exc)
        return None
