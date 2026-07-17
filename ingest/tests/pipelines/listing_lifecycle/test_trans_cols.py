from ingest.pipelines.listing_lifecycle import distill


def test_trans_cols_includes_days_off_market():
    # append_transitions writes exactly _TRANS_COLS; the new column must be listed or it is
    # silently dropped on every write (t.get() returns None and the column never populates).
    assert "days_off_market" in distill._TRANS_COLS
