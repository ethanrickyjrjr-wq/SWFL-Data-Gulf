"""backfill_baths.fold_baths_updates — the pure fold from /nearby-home-values responses to
UPDATE payloads. Mirrors test_backfill_listed_date: the only new logic is the fold; fetch and
write reuse audited pieces (_get_with_retry, _cluster_by_latlon, distill._get_conn)."""
from ingest.pipelines.listing_lifecycle.backfill_baths import fold_baths_updates


def _prop(pid, baths):
    return {"property_id": pid, "description": {"baths": baths}}


def test_folds_only_wanted_ids_and_parses_string_baths():
    props = [_prop("111", "2.5"), _prop("222", 3), _prop("999", "2")]
    updates = fold_baths_updates(props, wanted_ids={"111", "222"})
    assert updates == [
        {"property_id": "111", "baths": 2.5},
        {"property_id": "222", "baths": 3.0},
    ]


def test_skips_unparseable_and_missing_baths():
    props = [_prop("111", "n/a"), _prop("222", None), {"property_id": "333"}]
    assert fold_baths_updates(props, wanted_ids={"111", "222", "333"}) == []


def test_first_value_wins_on_duplicate_property_id():
    # Overlapping clusters can return the same property twice — never emit two updates.
    props = [_prop("111", "2.5"), _prop("111", "3.0")]
    assert fold_baths_updates(props, wanted_ids={"111"}) == [
        {"property_id": "111", "baths": 2.5}
    ]
