"""Unit tests for the corridor-pulse distill step (Build #2).

String-shape + pure-function tests only — no network, no DB (the repo has no live DB
in CI, mirroring city_pulse/test_distill.py). Confirms the corridor-flavored SQL,
the corridor tool, and that the pure helpers are single-sourced from the daily module.
"""
from datetime import datetime, timezone

from ingest.pipelines.city_pulse.distill import TTL_DAYS as DAILY_TTL_DAYS
from ingest.pipelines.city_pulse_corridors.distill import (
    EXTRACT_TOOL,
    TTL_DAYS,
    VALID_TOPICS,
    _INSERT_COLUMNS,
    _insert_sql,
    _prune_sql,
    _reconcile_sql,
    build_distill_prompt,
    dedup_key,
    expires_at_for,
    rows_from_extraction,
    slugify_story_key,
)


# ── Pure helpers are single-sourced from the daily module ────────────────────

def test_ttl_is_same_object_as_daily_module():
    # The corridor pipeline reuses (not forks) the volatility taxonomy.
    assert TTL_DAYS is DAILY_TTL_DAYS
    assert TTL_DAYS == {
        "breaking": 1, "transactions": 7, "development": 14,
        "business": 14, "structural": 90,
    }
    assert VALID_TOPICS == set(TTL_DAYS)


def test_dedup_key_is_corridor_and_url_scoped():
    a = dedup_key("Immokalee Rd North Naples", "https://gulfshorebusiness.com/a")
    b = dedup_key("Immokalee Rd North Naples", "https://gulfshorebusiness.com/a/")  # trailing slash
    c = dedup_key("Immokalee Rd North Naples", "https://gulfshorebusiness.com/b")   # different article
    d = dedup_key("Cleveland Ave Fort Myers", "https://gulfshorebusiness.com/a")    # different corridor
    assert a == b          # trailing-slash + case normalized to the same key
    assert a != c          # different article -> different key
    assert a != d          # corridor-scoped
    assert len(a) == 64    # sha256 hexdigest


def test_expires_at_adds_ttl():
    cap = datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert (expires_at_for("breaking", cap) - cap).days == 1
    assert (expires_at_for("structural", cap) - cap).days == 90


# ── EXTRACT_TOOL is corridor-named ───────────────────────────────────────────

def test_extract_tool_is_corridor_named():
    assert EXTRACT_TOOL["name"] == "record_corridor_facts"
    props = EXTRACT_TOOL["input_schema"]["properties"]["facts"]["items"]["properties"]
    assert set(props) == {"topic", "fact", "cite", "story_key", "location_anchor"}
    required = EXTRACT_TOOL["input_schema"]["properties"]["facts"]["items"]["required"]
    assert required == ["topic", "fact", "cite", "story_key", "location_anchor"]


# ── rows_from_extraction — keyed on `corridor` ───────────────────────────────

def _capture():
    return {
        "corridor": "Immokalee Rd North Naples",
        "run_at": "2026-06-01T00:00:00Z",
        "citations": [
            {"url": "https://gulfshorebusiness.com/a", "title": "A",
             "cited_text": "a retail strip sold for $14.2 million"},
        ],
    }


def test_rows_from_extraction_keeps_cited_facts_keyed_on_corridor():
    extraction = {"facts": [
        {"topic": "transactions", "fact": "A retail strip on Immokalee Rd sold for $14.2M",
         "cite": 1, "story_key": "immokalee-rd-retail-trade"},
    ]}
    rows = rows_from_extraction(_capture(), extraction)
    assert len(rows) == 1
    r = rows[0]
    assert r["corridor"] == "Immokalee Rd North Naples"
    assert "city" not in r  # corridor grain, not city
    assert r["topic"] == "transactions"
    assert r["source_url"] == "https://gulfshorebusiness.com/a"
    assert r["cited_text"] == "a retail strip sold for $14.2 million"
    assert r["story_key"] == "immokalee-rd-retail-trade"
    assert r["expires_at"] > r["captured_at"]
    assert len(r["dedup_key"]) == 64


def test_rows_from_extraction_drops_out_of_range_cite():
    extraction = {"facts": [
        {"topic": "transactions", "fact": "Unbacked", "cite": 99, "story_key": "x"},
    ]}
    assert rows_from_extraction(_capture(), extraction) == []


def test_rows_from_extraction_drops_invalid_topic():
    extraction = {"facts": [
        {"topic": "gossip", "fact": "x", "cite": 1, "story_key": "x"},
    ]}
    assert rows_from_extraction(_capture(), extraction) == []


def test_rows_from_extraction_drops_missing_or_nonnumeric_cite():
    for bad in ({}, {"cite": "web-1"}, {"cite": None}):
        extraction = {"facts": [
            {"topic": "transactions", "fact": "f", "story_key": "x", **bad},
        ]}
        assert rows_from_extraction(_capture(), extraction) == []


def test_rows_from_extraction_carries_slugified_story_key():
    extraction = {"facts": [
        {"topic": "transactions", "fact": "f", "cite": 1, "story_key": "Immokalee Rd Retail!"},
    ]}
    rows = rows_from_extraction(_capture(), extraction)
    assert rows[0]["story_key"] == "immokalee-rd-retail"


def test_rows_from_extraction_empty_story_key_is_none_but_fact_kept():
    # missing slug -> None, fact STILL written (never dropped for a slug)
    rows = rows_from_extraction(_capture(), {"facts": [
        {"topic": "transactions", "fact": "f", "cite": 1},
    ]})
    assert len(rows) == 1 and rows[0]["story_key"] is None
    # whitespace-only slug -> None, fact kept
    rows2 = rows_from_extraction(_capture(), {"facts": [
        {"topic": "transactions", "fact": "f", "cite": 1, "story_key": "   "},
    ]})
    assert len(rows2) == 1 and rows2[0]["story_key"] is None


# ── SQL shapes (corridor-grained) ────────────────────────────────────────────

def test_insert_sql_targets_corridor_table_and_columns():
    sql = _insert_sql()
    assert "INSERT INTO data_lake.city_pulse_corridors" in sql
    assert "ON CONFLICT (dedup_key) DO NOTHING" in sql
    for col in ["corridor", "topic", "fact", "source_url", "source_title",
                "cited_text", "captured_at", "expires_at", "dedup_key", "run_at"]:
        assert col in sql
    # No standalone `city` column (the substring "city" only appears in the table
    # name city_pulse_corridors). The robust grain check is in
    # test_insert_columns_includes_story_key_and_corridor.
    assert ", city," not in sql and "(city," not in sql


def test_insert_columns_includes_story_key_and_corridor():
    assert "story_key" in _INSERT_COLUMNS
    assert "corridor" in _INSERT_COLUMNS
    assert "city" not in _INSERT_COLUMNS


def test_prune_sql_deletes_only_expired_from_corridor_table():
    sql = _prune_sql()
    assert sql.startswith("DELETE FROM data_lake.city_pulse_corridors")
    assert "expires_at < now()" in sql


def test_reconcile_sql_shape_is_corridor_scoped():
    sql = _reconcile_sql()
    assert "DISTINCT ON (corridor, story_key)" in sql
    assert "cp.corridor = head.corridor" in sql          # corridor-scoped join, no cross-corridor merge
    assert "LEAST(cp.expires_at, head.keep_expires)" in sql
    assert "IS DISTINCT FROM head.keep_id" in sql
    assert "data_lake.city_pulse_corridors" in sql
    assert "superseded_by" in sql


# ── build_distill_prompt grounding (pure, no network) ────────────────────────

def test_build_distill_prompt_injects_grounding_when_known():
    cites = [{"title": "t", "cited_text": "c", "url": "https://x/a"}]
    grounded = build_distill_prompt("Immokalee Rd North Naples", cites, ["immokalee-rd-retail-trade"])
    assert "already being tracked" in grounded
    assert "immokalee-rd-retail-trade" in grounded
    assert "record_corridor_facts" in grounded


def test_build_distill_prompt_no_grounding_block_when_empty():
    cites = [{"title": "t", "cited_text": "c", "url": "https://x/a"}]
    bare = build_distill_prompt("Immokalee Rd North Naples", cites, [])
    assert "already being tracked" not in bare


# slugify re-exported for parity with the daily module surface
def test_slugify_story_key_reexported():
    assert slugify_story_key("Immokalee Rd!! Retail") == "immokalee-rd-retail"


# ---------------------------------------------------------------------------
# location_anchor (Phase C — zip-radius pulse news)
# ---------------------------------------------------------------------------

def test_extract_tool_has_location_anchor():
    items = EXTRACT_TOOL["input_schema"]["properties"]["facts"]["items"]
    assert items["properties"]["location_anchor"]["type"] == ["string", "null"]


def test_rows_carry_location_anchor():
    extraction = {"facts": [
        {"topic": "business", "fact": "F1", "cite": 1, "story_key": "s-one",
         "location_anchor": "  Coconut Point  "},
        {"topic": "business", "fact": "F2", "cite": 1, "story_key": "s-two",
         "location_anchor": None},
        {"topic": "business", "fact": "F3", "cite": 1, "story_key": "s-three"},
    ]}
    rows = rows_from_extraction(_capture(), extraction)
    assert [r["location_anchor"] for r in rows] == ["Coconut Point", None, None]
