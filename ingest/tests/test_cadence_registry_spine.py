# ingest/tests/test_cadence_registry_spine.py
"""The Spine — cadence_registry.yaml is the single source of config truth.

Enforces the structured fields Phase 2 (check-registry-identity.mts), Phase 3c
(doctor.volume_severity) and Phase 4 (assert_landed.py) consume. A missing field is a
GAP; the string "none" is a STATED FACT. Silence is what these tests exist to forbid.

Design notes (see the plan's Task 0 — do not "fix" these back):
  * There is NO `min_rows:` field. The row floor is `expected_rows_min` — one
    floor, one authority. A second floor field is a hand-synced pair, i.e. the
    drift class this build kills.
  * There is NO `source_tag:` field. check_freshness.py scopes on `source_name`
    (:238, :382); `source_tag` is read by nothing.
"""

import pathlib
import re

import yaml

REG_PATH = pathlib.Path(__file__).parents[1] / "cadence_registry.yaml"
REG_TEXT = REG_PATH.read_text(encoding="utf-8")
REG = yaml.safe_load(REG_TEXT)

# `nightly: true` = "assert_landed.py gates the nightly chain on this entry."
# It is GATE MEMBERSHIP, not cadence. Pinned by name so that adding a 5th member
# is a conscious edit to this list, never a silent default.
#   active_listings runs daily but is EXCLUDED: its table feeds nothing live
#     (08h D7 — active-listings-swfl reads listing_active_stats over listing_state).
#   market_aggregates_* are EXCLUDED: weekly / monthly, not nightly (08h D12).
NIGHTLY_GATE_SET = {
    "live_search_daily_median_price",
    "live_search_daily_mortgage",
    "listing_lifecycle",
    "city_pulse",
}

# A bare workflow basename. Deliberately excludes `/` and `.` from the leading class so
# that `.github/workflows/foo.yml` yields `foo.yml`, and a doc placeholder like
# `<file>.yml` yields NOTHING (the char before `.yml` must be [A-Za-z0-9_-]).
YML_RE = re.compile(r"[A-Za-z0-9_-]+\.yml")


def _pipelines() -> list[dict]:
    return [e for e in (REG.get("pipelines") or []) if isinstance(e, dict)]


def _parked() -> list[dict]:
    return [e for e in (REG.get("not_yet_running") or []) if isinstance(e, dict)]


def _entries() -> list[dict]:
    return _pipelines() + _parked()


def test_registry_shape_is_71_plus_3():
    """Guards the two helpers above: if the file shape changes, fail here, loudly,
    rather than letting every other test in this file vacuously pass on an empty list."""
    assert len(_pipelines()) == 71, f"expected 71 pipelines: entries, got {len(_pipelines())}"
    assert len(_parked()) == 3, f"expected 3 not_yet_running: entries, got {len(_parked())}"


def test_every_pipelines_entry_declares_a_workflow():
    """SPEC §9 ACCEPTANCE CRITERION. `none` is a stated fact; absence is a gap."""
    missing = [e["name"] for e in _pipelines() if not e.get("workflow")]
    assert not missing, (
        f"{len(missing)} pipelines: entries lack `workflow:` — {missing}\n"
        "Every entry must name its .github/workflows/ file, or the literal `none` "
        "when no workflow writes it (usgs_tier2, mhs_databook)."
    )


def test_every_parked_entry_declares_a_workflow():
    missing = [e["name"] for e in _parked() if not e.get("workflow")]
    assert not missing, f"not_yet_running: entries lack `workflow:` — {missing}"


def test_every_entry_declares_a_consuming_pack():
    """`none` is a stated fact (fred_g17, active_listings). Non-pack consumers are
    allowed as a repo path (census_acs -> lib/zip-summary; news_swfl -> app/insiders):
    a pack-only check would RED a healthy source (08a §B)."""
    missing = [e["name"] for e in _entries() if not e.get("consuming_pack")]
    assert not missing, f"{len(missing)} entries lack `consuming_pack:` — {missing}"


def test_workflow_values_are_a_yml_file_or_the_none_sentinel():
    bad = [
        e["name"]
        for e in _entries()
        if e["workflow"] != "none" and not str(e["workflow"]).endswith(".yml")
    ]
    assert not bad, f"`workflow:` must be a *.yml filename or `none` — {bad}"


def test_no_cron_comment_is_the_sole_carrier_of_a_workflow_filename():
    """SPEC §9 ACCEPTANCE CRITERION: "zero freeform `# Cron:` comments remain load-bearing."

    The `# Cron: <file>.yml` comments (20 of them: :140, :158, :811, :832, :854, :893, :914,
    :940, :964, :989, :1015, :1041, :1064, :1117, :1144, :1168, :1205, :1229, :1281, :1601)
    are the thing spec §3 REPLACES. They are RETAINED as prose — they carry cron timing and
    stagger rationale ("Monday 09:00 UTC ... clears the 08:00 swfl-inc slot") that `workflow:`
    does not capture — but a comment may never again be the ONLY place a workflow filename
    lives. Structured field authoritative; comment descriptive.

    SCOPE: comment lines that mention BOTH `cron` (case-insensitive) and a `*.yml` basename.
    That is exactly the §9 target. The exclusion block's two `# GHA: <file>.yml` lines (:1729
    project-feed-change-detection-daily.yml, :1746 deliverables-retention-sweep-daily.yml) are
    correctly OUT of scope — they name workflows for coverage_exempt tables, which have no
    `pipelines:` entry to carry a `workflow:` field. Verified: neither line contains "cron".
    """
    declared = {
        str(e["workflow"]) for e in _entries() if e.get("workflow") and e["workflow"] != "none"
    }
    orphans: list[str] = []
    for lineno, line in enumerate(REG_TEXT.splitlines(), start=1):
        if not line.lstrip().startswith("#") or "cron" not in line.lower():
            continue
        for basename in YML_RE.findall(line):
            if basename not in declared:
                orphans.append(f"{REG_PATH.name}:{lineno} -> {basename}")
    assert not orphans, (
        f"{len(orphans)} `# Cron:` comment(s) are the SOLE carrier of a workflow filename — "
        "no structured `workflow:` field declares them. A comment nothing can read is exactly "
        "the class this Spine kills. Add the workflow to the entry's `workflow:` field.\n  "
        + "\n  ".join(orphans)
    )


def test_nightly_flag_marks_exactly_the_gate_set():
    """Adding a 5th gate member must be a conscious edit to NIGHTLY_GATE_SET, never
    a silent default. Absence of `nightly:` = not gated (the safe default)."""
    flagged = {e["name"] for e in _pipelines() if e.get("nightly") is True}
    assert flagged == NIGHTLY_GATE_SET, (
        f"nightly gate drift.\n  extra:   {sorted(flagged - NIGHTLY_GATE_SET)}\n"
        f"  missing: {sorted(NIGHTLY_GATE_SET - flagged)}"
    )


def test_every_nightly_entry_is_countable_by_assert_landed():
    """assert_landed.py (Phase 4) needs a table to COUNT and a floor to compare it to.
    city_pulse is lane:tier-1 with no freshness_table -- it MUST carry an explicit
    count_table or it silently drops out of the gate (index correction #6)."""
    by_name = {e["name"]: e for e in _pipelines()}
    for name in sorted(NIGHTLY_GATE_SET):
        e = by_name[name]
        target = e.get("count_table") or e.get("freshness_table")
        assert target, f"{name}: nightly but no count_table/freshness_table to COUNT"
        assert "." in target, f"{name}: count target {target!r} is not schema-qualified"
        floor = e.get("expected_rows_min")
        assert isinstance(floor, int) and floor > 0, (
            f"{name}: nightly but expected_rows_min is {floor!r}. "
            "The floor is expected_rows_min -- there is NO separate min_rows field."
        )


def test_shared_count_targets_require_a_count_filter():
    """R1 -- THE MASKING BUG.

    Two nightly entries both point at data_lake.daily_truth (:50 median, :86 mortgage) and
    neither carries a source_name (:52-54 -- daily_truth has no such column). A bare
    COUNT(*) >= expected_rows_min therefore satisfies MORTGAGE'S floor of 1 with the
    MEDIAN metric's rows: if mortgage never lands again, the gate still reads LANDED.
    count_filter is the per-metric discriminator that makes each count honest.

    daily_truth's writer column `source_tag` CANNOT do this: engine.py:67 hardcodes
    source_tag='live_search' for BOTH metrics. The discriminating column is `metric_key`
    (registry :62 median_sale_price / :93 mortgage_30yr_fixed -> engine.py:268/275/337
    `metric_key=cfg["metric_key"]` -> daily_truth.metric_key, pipeline.py:23-24).

    THE RULE IS COMPUTED FROM THE REGISTRY, NOT HARDCODED: any nightly entry whose count
    target is claimed by another nightly entry must declare its own filter. A third entry
    pointed at an already-claimed table fails here on day one.

    Column EXISTENCE in the live table is deliberately NOT asserted here -- that is a DB
    question and it is Phase 2's job (same reasoning as D2). This test is structural.
    """
    IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")

    targets: dict[str, list[dict]] = {}
    for e in _pipelines():
        if e.get("nightly") is not True:
            continue
        target = e.get("count_table") or e.get("freshness_table")
        targets.setdefault(str(target), []).append(e)

    shared = {t: es for t, es in targets.items() if len(es) > 1}

    # Vacuity guard: names the ONE shared target we know exists today, so this test can
    # never silently degrade into a no-op. The RULE above stays computed.
    assert "data_lake.daily_truth" in shared, (
        "data_lake.daily_truth is the known shared nightly count target (both live_search "
        f"entries write it). Computed shared set is {sorted(shared)} -- if daily_truth is no "
        "longer shared, re-derive this guard before deleting it."
    )

    for target, es in sorted(shared.items()):
        for e in es:
            others = [x["name"] for x in es if x is not e]
            cf = e.get("count_filter")
            assert isinstance(cf, dict), (
                f"{e['name']}: nightly, shares count target {target} with {others}, and declares "
                "NO count_filter. assert_landed would count the other entry's rows and read "
                "LANDED on a source that never landed. Add: "
                "count_filter: {{ column: <discriminator>, value: <literal the pipeline writes> }}"
            )
            assert IDENT.match(str(cf.get("column") or "")), (
                f"{e['name']}: count_filter.column must be a bare column identifier "
                f"(assert_landed interpolates it as an SQL identifier), got {cf.get('column')!r}"
            )
            assert cf.get("value") not in (None, ""), (
                f"{e['name']}: count_filter.value is required — the literal the pipeline "
                "actually writes to that column."
            )
        values = [e["count_filter"]["value"] for e in es]
        assert len(values) == len(set(values)), (
            f"{target}: nightly entries {[e['name'] for e in es]} claim the SAME count_filter "
            f"value {values} — the filter does not discriminate them, so the mask is still open."
        )


def test_no_entry_carries_a_min_rows_field():
    """`min_rows` would duplicate `expected_rows_min` (index correction #6). One
    floor, one authority -- a second floor is the hand-synced-pair drift class."""
    dupes = [e["name"] for e in _entries() if "min_rows" in e]
    assert not dupes, f"`min_rows:` duplicates `expected_rows_min:` -- remove from {dupes}"


def test_orphan_writers_are_not_nightly_gated():
    """active_listings' table feeds nothing live (08h D7); market_aggregates_* are
    weekly/monthly (08h D12). Gating any of them guards a corpse or demands a daily
    landing that by design never comes."""
    by_name = {e["name"]: e for e in _pipelines()}
    for name in ("active_listings", "market_aggregates_histogram", "market_aggregates_details"):
        assert by_name[name].get("nightly") is not True, f"{name} must NOT be nightly-gated"
    assert by_name["active_listings"]["consuming_pack"] == "none", (
        "active_listings' table (active_listings_residential) has no live consumer -- "
        "active-listings-swfl reads listing_active_stats over listing_state (08h D7)"
    )
