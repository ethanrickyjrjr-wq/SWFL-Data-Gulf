"""Pure lifecycle diff engine — no DB, no I/O.

Compare today's scan to the stored state per (address_key, sale_or_rent); return MERGE upserts
(never delete) + the durable transition history. The transition IS the signal: a new listing
appears (from_state None), a price moves within active (cut/raise), a listing leaves the active
market → HOLDING (reason TBD), and a holding listing reappears → back on market (relist).

Two gates the operator + advisor review made load-bearing:
- `scan_complete` (from coverage_guard): a prior-live listing absent from an INCOMPLETE pull is a
  scrape gap, NOT a withdrawal — only a complete pull licenses pulled-by-elimination.
- `is_seed` (prior empty for the scope = first-ever run): stamps every emitted transition seed=True
  so the brain's flow metrics exclude the day-1 baseline (else the whole inventory reads as "new")."""
from __future__ import annotations

from typing import Any

# "Live, for sale, should reappear in a complete pull." Absence from a COMPLETE pull => the listing
# left the active market — we move it to HOLDING (reason unknown: sold / pending / withdrawn — the
# source doesn't say, so we don't claim). A records lane resolves holding later; if it reappears in a
# scan, it transitions back out of holding (a relist / back-on-market).
_LIVE_STATES = frozenset({"active", "new", "coming_soon", "back_on_market"})

Key = tuple[str, str]  # (address_key, sale_or_rent)


def _to_int(v: Any) -> int | None:
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def diff_states(
    prior: dict[Key, dict[str, Any]],
    scanned: dict[Key, dict[str, Any]],
    today: str,
    scan_complete: bool,
    is_seed: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    upserts: list[dict[str, Any]] = []
    transitions: list[dict[str, Any]] = []

    for key in set(prior) | set(scanned):
        addr, sor = key
        prev = prior.get(key)
        cur = scanned.get(key)

        if cur is not None:
            state = cur.get("state")
            price = _to_int(cur.get("list_price"))

            if prev is None:
                # APPEARED — first time we've seen this property (this sale/rent side). The new-listing
                # signal is from_state IS NULL, regardless of whether the source labels it new/active.
                upserts.append(_upsert(addr, sor, cur, state, days_in_state=0))
                transitions.append(_transition(addr, sor, None, state, today, cur, price, None, None, is_seed))
                continue

            prev_state = prev.get("state")
            prev_price = _to_int(prev.get("list_price"))

            if state == prev_state:
                # SAME state — merge the row (touch last_seen, age days_in_state); a price move
                # within the state is a cut/raise (needs only presence-in-both, not full completeness).
                days = (_to_int(prev.get("days_in_state")) or 0) + 1
                upserts.append(_upsert(addr, sor, cur, state, days_in_state=days))
                if price is not None and prev_price is not None and price != prev_price:
                    transitions.append(
                        _transition(addr, sor, prev_state, state, today, cur,
                                    price, price - prev_price, _to_int(prev.get("days_in_state")), is_seed)
                    )
            else:
                # STATE CHANGE — the headline signal.
                delta = price - prev_price if (price is not None and prev_price is not None) else None
                upserts.append(_upsert(addr, sor, cur, state, days_in_state=0))
                transitions.append(
                    _transition(addr, sor, prev_state, state, today, cur,
                                price, delta, _to_int(prev.get("days_in_state")), is_seed)
                )
        else:
            # ABSENT today. Move to HOLDING ONLY on a complete pull AND only from a live for-sale
            # state (we don't assert WHY it left — sold/pending/withdrawn is unknown). On an
            # incomplete pull, absence is a scrape gap — leave the row untouched.
            if scan_complete and prev.get("state") in _LIVE_STATES:
                upserts.append(_upsert(addr, sor, prev, "holding", days_in_state=0))
                transitions.append(
                    _transition(addr, sor, prev.get("state"), "holding", today, prev,
                                _to_int(prev.get("list_price")), None, _to_int(prev.get("days_in_state")), is_seed)
                )

    return upserts, transitions


def _upsert(addr: str, sor: str, row: dict[str, Any], state: str, *, days_in_state: int) -> dict[str, Any]:
    """The wide row to MERGE into listing_state. Carries every captured field; first_seen/scraped_at
    are stamped by the pipeline's SQL (first_seen via DEFAULT-on-insert only)."""
    out = {k: v for k, v in row.items() if k not in ("state", "days_in_state")}
    out["address_key"] = addr
    out["sale_or_rent"] = sor
    out["state"] = state
    out["days_in_state"] = days_in_state
    return out


def _transition(addr, sor, from_state, to_state, at, row, price, price_delta, days_in_prev_state, seed):
    return {
        "address_key": addr,
        "sale_or_rent": sor,
        "from_state": from_state,
        "to_state": to_state,
        "at": at,
        "listing_id": row.get("listing_id"),
        "price": price,
        "price_delta": price_delta,
        "days_in_prev_state": days_in_prev_state,
        "seed": seed,
    }
