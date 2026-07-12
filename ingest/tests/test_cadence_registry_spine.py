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
