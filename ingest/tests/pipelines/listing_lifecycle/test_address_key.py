"""Deterministic tests for the address_key normalizer (no network, no DB).

address_key is the property identity: a relisting gets a NEW listing id, so keying on the id reads a
relist as two unrelated events. We key on the normalized street address + ZIP instead."""
from __future__ import annotations

from ingest.pipelines.listing_lifecycle.address_key import address_key


def test_relist_same_address_same_key():
    # 11145 2nd Ave under two listing ids must collapse to one property (spec finding #3).
    assert address_key("11145 2nd Ave", "33971") == address_key("11145 2nd Avenue", "33971")


def test_case_and_punctuation_insensitive():
    assert address_key("14150 OSTROM AVE.", "33971") == address_key("14150 ostrom ave", "33971")


def test_unit_is_part_of_condo_identity():
    a = address_key("3006 Caring Way Unit 301", "33990")
    b = address_key("3006 Caring Way Unit 414", "33990")
    assert a != b
    assert "UNIT301" in a


def test_same_street_different_zip_is_distinct():
    assert address_key("100 Main St", "33901") != address_key("100 Main St", "33902")


def test_zip_normalized_to_five_digits():
    assert address_key("100 Main St", "33901-1234") == address_key("100 Main St", "33901")


def test_empty_inputs_are_deterministic_not_crash():
    assert address_key("", "") == address_key("", "")
