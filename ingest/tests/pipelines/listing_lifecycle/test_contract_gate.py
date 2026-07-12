"""The Locus-A gate on listing_lifecycle — the batch that reaches upsert_state is contract-clean.

The gate is exercised directly (evaluate_batch + the raise), not by running the pipeline: run()
needs a live SteadyAPI key and a DB. What is proven here is the CONTRACT of the gate — the
orchestrator's obligations — plus the one structural fact a unit test can pin: that the gate is
wired at the merge call and not at diff_states."""
import re
from pathlib import Path

import pytest

from ingest.lib.guards import ContentContractError
from ingest.quality.contracts import evaluate_batch

_PIPELINE = Path(__file__).parents[3] / "pipelines" / "listing_lifecycle" / "pipeline.py"


def _up(**kw):
    base = {"address_key": "A:33901", "sale_or_rent": "sale", "state": "active",
            "property_type": "single_family", "list_price": 350000, "beds": 3, "sqft": 1800,
            "lot_acres": 0.2, "zip_code": "33901", "county": "Lee"}
    base.update(kw)
    return base


def test_the_gate_supplies_source_name_via_ctx_not_from_the_row():
    """source_name is NOT in distill._STATE_COLS — upsert_state injects it as a SCALAR.
    Without ctx the price floor's `source_name = 'api_feed'` predicate is
    unevaluable and the contract silently scopes to nothing."""
    from ingest.pipelines.listing_lifecycle.distill import _STATE_COLS

    assert "source_name" not in _STATE_COLS

    rows = [_up(property_type="condo", list_price=7000, beds=1, sqft=855)]
    _, _, with_ctx = evaluate_batch(rows, "data_lake.listing_state", ctx={"source_name": "api_feed"})
    floor = next(c for c in with_ctx["contracts"] if c["name"] == "listing_state_home_price_floor")
    assert floor["violations"] == 1 and floor["status"] == "VIOLATIONS"


def test_a_scrape_source_batch_is_out_of_scope_for_the_api_feed_floor():
    """`--source scrape` lands under source_name='lifecycle_seed'. Source-B rows are not the
    contaminated class and the floor must not reach them."""
    rows = [_up(property_type="condo", list_price=7000, beds=1, sqft=855)]
    _, _, stats = evaluate_batch(rows, "data_lake.listing_state",
                                 ctx={"source_name": "lifecycle_seed"})
    floor = next(c for c in stats["contracts"] if c["name"] == "listing_state_home_price_floor")
    assert (floor["in_scope"], floor["violations"]) == (0, 0)


def test_the_orchestrator_raises_ContentContractError_on_abort_never_evaluate_batch():
    """PURITY: the raise lives in the CALLER. evaluate_batch returns abort as DATA."""
    rows = [_up(property_type="condos") for _ in range(600)]  # bypassed-normalizer token
    clean, quarantined, stats = evaluate_batch(rows, "data_lake.listing_state",
                                               ctx={"source_name": "api_feed"})
    assert stats["abort"] is True and clean == []
    with pytest.raises(ContentContractError, match="property_type_allowlist"):
        raise ContentContractError(stats["abort_reason"])   # what the pipeline gate does


def test_the_gate_is_wired_AT_the_merge_call_not_at_diff_states():
    """ups/trans are MUTATED IN PLACE between diff_states and upsert_state (county/
    days_on_market set; apply_off_market_resolutions rewrites states to sold/withdrawn and
    attaches sold_price). A gate at diff_states evaluates a batch THAT IS NOT THE ONE THAT
    LANDS. Whitespace-tolerant on purpose (correction C-1): the call is multi-line."""
    src = _PIPELINE.read_text(encoding="utf-8")
    norm = re.sub(r"\s+", " ", src)
    gate = norm.index("evaluate_batch( ups,")
    diff = norm.index("ups, trans = diff_states(")
    merge = norm.index("distill.upsert_state(ups")
    offmarket = norm.index("apply_off_market_resolutions(")
    assert diff < offmarket < gate < merge, "the gate must sit between the mutations and the merge"
    assert re.search(r"ups\s*,\s*quarantined\s*,\s*cstats\s*=\s*evaluate_batch", src), (
        "the merge must consume the CLEAN batch"
    )
