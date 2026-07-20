"""Pure markdown-table parser for realtyofnaplesfl.com's curated HOA-fee-
comparison page. This is an EDITORIAL comparison (the page's own text: "typical
ranges based on available data as of early 2026") — every row is a curated
range, not a live per-listing aggregate. is_estimate=True carries the page's
own "(est.)" flag through verbatim; callers must never drop it."""
from __future__ import annotations

import re

_ROW_RE = re.compile(
    r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$",
    re.MULTILINE,
)
_GOLF_MAP = {
    "bundled": "bundled",
    "optional": "optional",
    "optional membership": "optional",
}


def _parse_golf(cell: str) -> str | None:
    """None means no golf mentioned/applicable for this row (e.g. "No golf") —
    str|None per the interface, so "no golf" is NOT itself a string value."""
    normalized = cell.strip().lower()
    for key, value in _GOLF_MAP.items():
        if key in normalized:
            return value
    return None


def _parse_cdd(cell: str) -> bool | None:
    normalized = cell.strip().lower()
    if "no cdd" in normalized:
        return False
    if normalized.startswith("yes"):
        return True
    return None


def parse_hoa_comparison_page(markdown: str) -> list[dict]:
    rows: list[dict] = []
    for match in _ROW_RE.finditer(markdown):
        name, fee, _included, cdd_cell, golf_cell = (g.strip() for g in match.groups())
        if name in ("Community", "---", "") or set(name) == {"-"}:
            continue  # header / separator row
        is_estimate = "(est.)" in fee.lower()
        fee_clean = re.sub(r"\s*\(est\.\)", "", fee, flags=re.IGNORECASE).strip()
        rows.append(
            {
                "name": name,
                "hoa_fee_range": fee_clean,
                "cdd_flag": _parse_cdd(cdd_cell),
                "golf_structure": _parse_golf(golf_cell),
                "is_estimate": is_estimate,
            }
        )
    return rows
