"""Shared type-coercion helpers for ingest pipelines.

Pure functions, no side effects. Pipelines import these instead of defining
their own _coerce_* variants.
"""
from __future__ import annotations

from datetime import datetime, timezone

SUPPRESSION_TOKENS: frozenset[str] = frozenset({"*", "#", "**", "***", "-", "N/A", "NA"})


def coerce_float(v) -> float | None:
    """Parse numeric string to float, stripping $, commas, whitespace.

    Returns None for empty, null-sentinel, or non-parseable values.
    """
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in {"n/a", "na", "null", "none"}:
        return None
    try:
        return float(s.replace("$", "").replace(",", ""))
    except (ValueError, TypeError):
        return None


def coerce_int(v) -> int | None:
    """Parse numeric string to int via coerce_float."""
    f = coerce_float(v)
    return None if f is None else int(f)


def coerce_date(v) -> str | None:
    """Parse a date to ISO YYYY-MM-DD string.

    Handles:
      - ESRI epoch milliseconds (int/float)
      - ISO datetime strings (T-split, returns date part)
      - ESRI year-month partials like "2024-4" -> "2024-04-01"
      - Plain YYYY-MM-DD
    """
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(int(v) / 1000.0, tz=timezone.utc).date().isoformat()
    s = str(v).strip()
    if not s:
        return None
    if "T" in s:
        s = s.split("T")[0]
    parts = s.split("-")
    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
        return f"{int(parts[0]):04d}-{int(parts[1]):02d}-01"
    return s[:10] if len(s) >= 10 else None


def coerce_suppressed(v, tokens: frozenset[str] = SUPPRESSION_TOKENS) -> None:
    """Explicitly returns None for a BLS-suppressed cell (*, #, etc.).

    Named to make suppression intent visible at the call site — prevents the
    "store None but it looks like 0 was intended" confusion.
    """
    return None
