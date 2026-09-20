"""Tests for the shared source-staleness tripwire (ingest.lib.source_staleness).

Sibling of test_guards.py on purpose: this module is guards' twin — same
exception class, different SIGNAL (the vendor's HTTP Last-Modified header vs
the newest dated row in the content).
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from ingest.lib import source_staleness as ss
from ingest.lib.guards import ContentStaleError


class _Resp:
    def __init__(self, headers: dict, exc: Exception | None = None):
        self.headers = headers
        self._exc = exc

    def raise_for_status(self) -> None:
        if self._exc:
            raise self._exc


class TestAssertAdvanced:
    def test_raises_when_vendor_file_older_than_last_landed_plus_window(self):
        with pytest.raises(ss.ContentStaleError):
            ss.assert_advanced(
                vendor_last_modified=date(2026, 5, 31),
                last_landed=date(2026, 5, 31),
                max_stale_days=55,
                today=date(2026, 8, 18),
            )

    def test_passes_when_vendor_advanced(self):
        ss.assert_advanced(
            vendor_last_modified=date(2026, 8, 1),
            last_landed=date(2026, 6, 30),
            max_stale_days=55,
            today=date(2026, 8, 18),
        )

    def test_unknown_vendor_date_degrades_instead_of_raising(self):
        """THE reason this is not assert_content_fresh: a failed/absent HEAD is
        'we could not look', not 'the source is dead'. assert_content_fresh(None)
        raises; this must return so the content gate stays the decider."""
        ss.assert_advanced(
            vendor_last_modified=None,
            last_landed=date(2026, 5, 31),
            max_stale_days=55,
            today=date(2026, 8, 18),
        )

    def test_unchanged_but_recent_does_not_raise(self):
        """Mid-cycle reruns legitimately re-see the same object (redfin_swfl
        doctrine) — non-advancement alone is never fatal."""
        ss.assert_advanced(
            vendor_last_modified=date(2026, 8, 10),
            last_landed=date(2026, 8, 10),
            max_stale_days=55,
            today=date(2026, 8, 18),
        )

    def test_raises_even_when_last_landed_unknown(self):
        """Tier-2 merge pipelines have no inventory row; age alone still gates."""
        with pytest.raises(ss.ContentStaleError):
            ss.assert_advanced(
                vendor_last_modified=date(2026, 5, 31),
                max_stale_days=55,
                today=date(2026, 8, 18),
            )

    def test_accepts_datetime_and_iso_string(self):
        with pytest.raises(ss.ContentStaleError):
            ss.assert_advanced(
                vendor_last_modified="2026-05-31",
                max_stale_days=55,
                today=date(2026, 8, 18),
            )

    def test_message_carries_content_guard_prefix_and_label(self):
        """classify-cron-failure.mjs:157 matches /\\bContentStaleError\\b|\\[content-guard\\]/."""
        with pytest.raises(ss.ContentStaleError) as exc:
            ss.assert_advanced(
                label="redfin_lee",
                vendor_last_modified=date(2026, 5, 31),
                last_landed=date(2026, 5, 31),
                max_stale_days=55,
                today=date(2026, 8, 18),
            )
        msg = str(exc.value)
        assert "[content-guard]" in msg
        assert "redfin_lee" in msg
        assert "2026-05-31" in msg

    def test_is_the_same_exception_class_as_guards(self):
        """One root: the cron classifier and every existing `except ContentStaleError`
        must keep working, so this must NOT be a second class with the same name."""
        from ingest.lib.guards import ContentStaleError

        assert ss.ContentStaleError is ContentStaleError


def test_content_arm_dominates_at_equal_thresholds():
    """THE invariant that sets every wired threshold, pinned so it stays true.

    content_age = header_age + publish_lag, and publish_lag > 0 always (a vendor
    cannot publish a month before it closes). So at an EQUAL threshold the
    content gate always crosses first and the header arm is dead weight: a wired
    max_stale_days must sit below (content gate - publish lag) to add anything.

    Worked on the real numbers: redfin all_counties.csv, publish lag ~13d,
    content gate 55d -> the content arm fires at header_age 42, so the header
    arm is wired at 35.
    """
    from ingest.lib.guards import assert_content_fresh

    lag, gate, today = 13, 55, date(2026, 9, 20)
    # The day the content arm first trips: header_age 43 -> content_age 56 > 55.
    header_date = today - timedelta(days=43)
    period_end = header_date - timedelta(days=lag)

    with pytest.raises(ContentStaleError):
        assert_content_fresh(period_end, gate, label="x", today=today)
    # ...and at the SAME threshold the header arm is still silent. Dead weight.
    ss.assert_advanced(
        vendor_last_modified=header_date, max_stale_days=gate, today=today, label="x"
    )
    # Wired below the crossover, it leads instead.
    with pytest.raises(ContentStaleError):
        ss.assert_advanced(
            vendor_last_modified=header_date, max_stale_days=35, today=today, label="x"
        )


class TestParseLastModified:
    """The parse half, used directly by pipelines that already HEAD the source
    and store the raw header string (redfin_swfl) — no second HEAD."""

    def test_parses_rfc_2822(self):
        assert ss.parse_last_modified("Sat, 12 Sep 2026 07:11:04 GMT") == date(2026, 9, 12)

    def test_none_and_empty_and_junk_all_return_none(self):
        assert ss.parse_last_modified(None) is None
        assert ss.parse_last_modified("") is None
        assert ss.parse_last_modified("not a date") is None


class TestHeadLastModified:
    def test_parses_rfc_2822_header_to_date(self, monkeypatch):
        import requests

        monkeypatch.setattr(
            requests,
            "head",
            lambda *a, **k: _Resp({"Last-Modified": "Sat, 12 Sep 2026 07:11:04 GMT"}),
        )
        assert ss.head_last_modified("https://example.test/f.csv") == date(2026, 9, 12)

    def test_missing_header_returns_none(self, monkeypatch):
        import requests

        monkeypatch.setattr(requests, "head", lambda *a, **k: _Resp({}))
        assert ss.head_last_modified("https://example.test/f.csv") is None

    def test_malformed_header_returns_none(self, monkeypatch):
        """parsedate_to_datetime raises ValueError on 3.12 for garbage — it does
        not return None. A junk header must degrade, not crash the run."""
        import requests

        monkeypatch.setattr(
            requests, "head", lambda *a, **k: _Resp({"Last-Modified": "not a date"})
        )
        assert ss.head_last_modified("https://example.test/f.csv") is None

    def test_request_failure_returns_none(self, monkeypatch):
        import requests

        def boom(*a, **k):
            raise requests.RequestException("WAF said no")

        monkeypatch.setattr(requests, "head", boom)
        assert ss.head_last_modified("https://example.test/f.csv") is None
