"""Pure person-period replay — no DB, no I/O. Rebuilds any listing's state at any
week-end from its transition history; emits one training row per listing-week.

Label semantics: labels for week W describe events in week W+1 and are written by
label_updates() on the run that has OBSERVED week W+1. build_week_rows() always
emits labels as None — the last observed week is censored by construction.

seed=True transitions are day-1 baseline stamps (transitions.py is_seed): they
establish state and price during replay but are never counted as events.

Static attrs (beds/baths/sqft/type) are read from CURRENT listing_state — stable
listing attributes; price/state/DOM, the fields that genuinely move, are replayed
from transitions."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

_LIVE = frozenset({"active", "new", "coming_soon", "back_on_market"})


def week_start_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _at(t: dict[str, Any]) -> date:
    v = t["at"]
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _history_for(transitions: list[dict], key: tuple[str, str]) -> list[dict]:
    hs = [t for t in transitions
          if (t["address_key"], t["sale_or_rent"]) == key]
    return sorted(hs, key=_at)


def _replay(history: list[dict], upto: date) -> dict[str, Any] | None:
    """State snapshot from all transitions with at <= upto. None if the listing
    hasn't appeared yet. Counters skip seed rows; state/price honor them."""
    seen = [t for t in history if _at(t) <= upto]
    if not seen:
        return None
    state, price, first_price = None, None, None
    cuts, cut_depth_abs, relists = 0, 0, 0
    last_cut: date | None = None
    for t in seen:
        state = t["to_state"]
        if t["price"] is not None:
            price = t["price"]
            if first_price is None:
                first_price = t["price"]
        if t["seed"]:
            continue
        delta = t.get("price_delta")
        if delta is not None and delta < 0:
            cuts += 1
            cut_depth_abs += -delta
            last_cut = _at(t)
        if t["from_state"] == "holding" and t["to_state"] in _LIVE:
            relists += 1
    return {"state": state, "price": price, "first_price": first_price,
            "cuts": cuts, "cut_depth_abs": cut_depth_abs, "relists": relists,
            "last_cut": last_cut}


def build_week_rows(state_rows: list[dict], transitions: list[dict],
                    week_start: date) -> list[dict[str, Any]]:
    week_end = week_start + timedelta(days=6)
    rows: list[dict[str, Any]] = []
    for s in state_rows:
        if s.get("sale_or_rent") != "sale":
            continue
        key = (s["address_key"], "sale")
        snap = _replay(_history_for(transitions, key), week_end)
        if snap is None:
            continue
        listed = s.get("listed_date")
        depth_pct = (round(snap["cut_depth_abs"] / snap["first_price"] * 100, 2)
                     if snap["cut_depth_abs"] and snap["first_price"] else 0.0)
        rows.append({
            "address_key": s["address_key"], "sale_or_rent": "sale",
            "week_start": week_start,
            "listing_id": s.get("listing_id"),
            "zip_code": s.get("zip_code"), "county": s.get("county"),
            "property_type": s.get("property_type"),
            "beds": s.get("beds"), "baths": s.get("baths"),
            "sqft": s.get("sqft"), "lot_acres": s.get("lot_acres"),
            "listed_date": listed,
            "dom_days": (week_end - listed).days if listed else None,
            "state_at_week_end": snap["state"],
            "list_price": snap["price"],
            "cuts_to_date": snap["cuts"],
            "cut_depth_pct_to_date": depth_pct,
            "weeks_since_last_cut": ((week_end - snap["last_cut"]).days // 7
                                     if snap["last_cut"] else None),
            "relists_to_date": snap["relists"],
            "flag_foreclosure": s.get("flag_foreclosure"),
            "flag_new_construction": s.get("flag_new_construction"),
            "sold_next_week": None, "holding_next_week": None,
            "price_cut_next_week": None,
        })
    return rows


def label_updates(transitions: list[dict], week_start: date) -> list[dict[str, Any]]:
    """Labels for rows of `week_start`, from events in the FOLLOWING week."""
    nxt_start = week_start + timedelta(days=7)
    nxt_end = nxt_start + timedelta(days=6)
    by_key: dict[tuple[str, str], dict[str, bool]] = {}
    for t in transitions:
        if t["seed"] or t.get("sale_or_rent") != "sale":
            continue
        at = _at(t)
        if not (nxt_start <= at <= nxt_end):
            continue
        lab = by_key.setdefault((t["address_key"], t["sale_or_rent"]),
                                {"sold_next_week": False,
                                 "holding_next_week": False,
                                 "price_cut_next_week": False})
        if t["to_state"] == "sold":
            lab["sold_next_week"] = True
        if t["to_state"] == "holding":
            lab["holding_next_week"] = True
        delta = t.get("price_delta")
        if delta is not None and delta < 0:
            lab["price_cut_next_week"] = True
    return [{"address_key": k[0], "sale_or_rent": k[1], "week_start": week_start, **lab}
            for k, lab in sorted(by_key.items())]
