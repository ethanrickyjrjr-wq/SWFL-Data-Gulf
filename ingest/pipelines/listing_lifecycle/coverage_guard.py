"""scan_is_complete — the completeness gate.

A county pull is trustworthy only when COMPLETE; else a WAF-truncated pull reads as mass movement (a
partial Lee pull once made 1,683 homes look like they "came off"). This returns (complete, reason);
diff_states only licenses "pulled by elimination" when complete is True, so an incomplete pull never
manufactures fake withdrawals."""
from __future__ import annotations

from typing import Any

# A pull below this fraction of the last trusted count is a truncation, not real movement.
_DROP_FLOOR = 0.6


def scan_is_complete(
    scan_result: dict[str, Any],
    last_trusted_count: int | None,
    baseline_total: int | None = None,
) -> tuple[bool, str]:
    """`scan_result` carries {exhausted: bool, count: int, last_status: int}. `last_trusted_count`
    is our last COMPLETE pull's count (None on the first-ever pull). `baseline_total` is the
    page-printed county total, a ±sanity floor used only when we have no prior trusted count."""
    exhausted = bool(scan_result.get("exhausted"))
    count = int(scan_result.get("count") or 0)
    last_status = scan_result.get("last_status")

    # (1) natural exhaustion — the walk must have ended on a no-new page with a 200, not an early 403.
    if last_status != 200:
        return False, f"incomplete: last page returned status {last_status}"
    if not exhausted:
        return False, "incomplete: pagination did not reach natural exhaustion"

    # (3) baseline seed — first-ever pull, nothing to self-compare; accept as the baseline.
    if last_trusted_count is None:
        if baseline_total and count < baseline_total * _DROP_FLOOR:
            return False, f"seed pull {count} far below page-printed total {baseline_total}"
        return True, f"seeded baseline ({count} rows)"

    # (2) self-referential stability — a sharp drop vs the last trusted pull is a truncation.
    if count < last_trusted_count * _DROP_FLOOR:
        return False, f"mass-drop: {count} vs last-trusted {last_trusted_count} — truncated pull"

    return True, f"complete ({count} rows vs last-trusted {last_trusted_count})"
