"""Drift-guard: assert every pipeline dir has a matching GHA workflow.

Checks each non-orphan directory under ingest/pipelines/ and
ingest/duckdb_pipelines/ for:
  (a) a matching .github/workflows/*.yml (by name convention)
  (b) workflow_dispatch: present in the YAML
  (c) DESTINATION__POSTGRES__CREDENTIALS referenced in the YAML

Pipelines in ALLOW_LIST are exempt — they are covered in plan PR 3.
Remove entries from the allow-list as their workflows land.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINES_DIR = REPO_ROOT / "ingest" / "pipelines"
DUCKDB_DIR = REPO_ROOT / "ingest" / "duckdb_pipelines"
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"

# Deliberately workflow-less. Each entry is a pipeline that MUST NOT be put on a
# cron; the missing workflow is the correct state, not drift. Re-verified
# 07/22/2026 by reading each module — check `workflowless_pipelines_declare_intent`
# tracks giving these a first-class `run_mode: manual` declaration in
# cadence_registry.yaml so this list can retire.
ALLOW_LIST: set[str] = {
    # PAID web_search on a cron is a LOCKED operator decree (ingest/CLAUDE.md,
    # 07/05/2026) — `web_search_*` scheduled drained the account twice (06/18
    # freeze, 07/05 caught live at ~$6/run). This module makes one
    # web_search_20250305 call PER CORRIDOR. Scheduling it is exactly the
    # forbidden thing; it is run deliberately, by hand.
    "ingest/pipelines/corridor_grounded",
    # One-time discovery scrape + manual ship (ship_live.py). 69 Lee/Collier rows
    # were shipped by hand 07/20/2026; the other 89 are held back pending county
    # resolution. Nothing to re-run on a schedule.
    "ingest/pipelines/community_profiles",
    # crawl4ai research one-offs, not lake pipelines: they capture layout
    # structure and platform-doc facts to inform a build, write no data_lake
    # table, and have no pipeline.py. Re-run by hand when the question comes up.
    "ingest/pipelines/report_design_research",
    "ingest/pipelines/social_best_practices",
}

# Pipeline dirs that are scaffolding/internal only (no workflow needed).
_SKIP_NAMES = {"__pycache__", "__init__.py"}


def _pipeline_dirs() -> list[tuple[Path, str]]:
    """Return (dir_path, allow_list_key) for every pipeline directory."""
    dirs: list[tuple[Path, str]] = []
    for base, prefix in [(PIPELINES_DIR, "ingest/pipelines"), (DUCKDB_DIR, "ingest/duckdb_pipelines")]:
        if not base.exists():
            continue
        for entry in sorted(base.iterdir()):
            if not entry.is_dir():
                continue
            if entry.name in _SKIP_NAMES:
                continue
            # A directory holding only build artifacts is not a pipeline.
            # 07/22/2026: county_planning_swfl, leepa_parcel_zip and
            # parcel_subdivision each red this guard while containing nothing but
            # a gitignored __pycache__ of cpython-314 bytecode — left behind when
            # their source was removed (parcel_subdivision was deliberately
            # dropped, see migrations/20260719_drop_parcel_subdivision.sql) and
            # compiled by a Python 3.14 toolchain that ingest/CLAUDE.md has since
            # pinned away to 3.12. They are invisible to CI (gitignored, never
            # checked out) and only ever redden a local run, which is the worst
            # kind of failure: noise that trains people to ignore this guard.
            #
            # Deliberately narrow — "has no .py source at all". NOT "has no
            # pipeline.py": faf5 legitimately has none and passes today, so that
            # rule would change behaviour for a healthy dir and weaken the guard.
            if not any(entry.glob("*.py")):
                continue
            dirs.append((entry, f"{prefix}/{entry.name}"))
    return dirs


def _workflow_for(pipeline_name: str) -> Path | None:
    """Find the workflow YAML for a pipeline by name convention."""
    # Try both naming schemes: ingest-<name>.yml and <source>-<cadence>.yml
    snake = pipeline_name.replace("_", "-")
    candidates = [
        WORKFLOWS_DIR / f"ingest-{snake}.yml",
        WORKFLOWS_DIR / f"{snake}-monthly.yml",
        WORKFLOWS_DIR / f"{snake}-annual.yml",
        WORKFLOWS_DIR / f"{snake}-quarterly.yml",
        WORKFLOWS_DIR / f"{snake}-daily.yml",
    ]
    # Also search all workflow files for a run step referencing this pipeline module
    module_pattern = re.compile(
        rf"ingest\.(?:pipelines|duckdb_pipelines)\.{re.escape(pipeline_name)}\b"
    )
    for yml in WORKFLOWS_DIR.glob("*.yml"):
        if module_pattern.search(yml.read_text(encoding="utf-8")):
            return yml
    for c in candidates:
        if c.exists():
            return c
    return None


@pytest.mark.parametrize(
    "pipeline_dir,allow_key",
    [
        pytest.param(d, k, id=k)
        for d, k in _pipeline_dirs()
        if k not in ALLOW_LIST
    ],
)
def test_pipeline_has_workflow(pipeline_dir: Path, allow_key: str) -> None:
    """Every non-exempt pipeline dir must have a GHA workflow."""
    name = pipeline_dir.name
    workflow = _workflow_for(name)
    assert workflow is not None, (
        f"{allow_key}: no matching .github/workflows/*.yml found. "
        f"Run 'python -m ingest.scaffold --name={name} ...' to create one, "
        f"or add it to ALLOW_LIST with a 'covered in plan PR N' comment."
    )
    content = workflow.read_text(encoding="utf-8")

    assert "workflow_dispatch:" in content, (
        f"{workflow.name}: missing 'workflow_dispatch:' block. "
        "All ingest workflows must support manual dispatch (with dry_run input)."
    )

    assert "DESTINATION__POSTGRES__CREDENTIALS" in content, (
        f"{workflow.name}: missing DESTINATION__POSTGRES__CREDENTIALS in env block. "
        "All ingest workflows must declare this secret even if the pipeline is Tier 1 "
        "(tier1_inventory.upsert_inventory_row needs it)."
    )
