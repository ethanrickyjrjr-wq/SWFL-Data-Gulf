"""Small, local-only archival helpers for source-backed research exports.

This deliberately has no database, cloud-storage, or scheduler dependency.  Callers must
explicitly opt into a configured root; content-addressed raw files and exports make a rerun
safe while retaining changed publisher vintages.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_MIN_FREE_BYTES = 20 * 1024**3


class ResearchCaptureError(RuntimeError):
    """A local capture cannot safely proceed."""


@dataclass(frozen=True)
class StoredRaw:
    path: Path
    relative_path: str
    sha256: str
    byte_size: int


@dataclass(frozen=True)
class ExportedCapture:
    observation_path: Path
    manifest_path: Path
    observation_sha256: str
    row_count: int


def resolve_capture_root(configured_root: str | Path | None = None, candidate: str | Path | None = None) -> Path:
    """Resolve an explicit archive root and reject a path escape.

    ``configured_root`` normally comes from SWFL_RESEARCH_ROOT.  There is intentionally no
    guessed drive/default: capture without it is an error.
    """
    raw_root = configured_root or os.environ.get("SWFL_RESEARCH_ROOT")
    if not raw_root:
        raise ResearchCaptureError("SWFL_RESEARCH_ROOT must name an explicit local capture directory")
    root = Path(raw_root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise ResearchCaptureError(f"configured research root does not exist or is not a directory: {root}")
    resolved = Path(candidate).expanduser().resolve() if candidate else root
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ResearchCaptureError(f"capture path is outside configured research root: {resolved}") from exc
    return resolved


def ensure_storage_ready(root: Path, *, min_free_bytes: int = DEFAULT_MIN_FREE_BYTES) -> None:
    usage = shutil.disk_usage(root)
    free = usage.free if hasattr(usage, "free") else usage[2]
    if free < min_free_bytes:
        raise ResearchCaptureError(
            f"research capture free-space floor not met: {free} bytes available < {min_free_bytes} required"
        )


def _safe_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip(".-")
    return cleaned or "source.bin"


def _atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return
    handle, tmp_name = tempfile.mkstemp(prefix=".capture-", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        try:
            os.replace(tmp_name, path)
        except FileExistsError:
            # A concurrent identical capture completed first.  Its content address is the
            # identity, so retaining that completed file is correct.
            pass
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def store_raw_bytes(root: str | Path, *, source_id: str, original_name: str, content: bytes) -> StoredRaw:
    archive_root = resolve_capture_root(root)
    ensure_storage_ready(archive_root)
    digest = hashlib.sha256(content).hexdigest()
    filename = f"{digest}-{_safe_name(original_name)}"
    path = archive_root / "raw" / _safe_name(source_id) / digest[:2] / filename
    _atomic_write(path, content)
    return StoredRaw(
        path=path,
        relative_path=path.relative_to(archive_root).as_posix(),
        sha256=digest,
        byte_size=len(content),
    )


def first_seen_for_release(root: str | Path, *, source_id: str, sha256: str, observed_at: str) -> str:
    """Return the immutable first-seen timestamp for one exact raw release hash."""
    archive_root = resolve_capture_root(root)
    path = archive_root / "metadata" / _safe_name(source_id) / f"{sha256}.json"
    if path.exists():
        try:
            return str(json.loads(path.read_text(encoding="utf-8"))["first_seen_at"])
        except (OSError, ValueError, KeyError) as exc:
            raise ResearchCaptureError(f"invalid release metadata for {source_id}/{sha256}") from exc
    metadata = _canonical_json({"source_id": source_id, "source_sha256": sha256, "first_seen_at": observed_at}) + b"\n"
    _atomic_write(path, metadata)
    return str(json.loads(path.read_text(encoding="utf-8"))["first_seen_at"])


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def write_observations_and_manifest(
    root: str | Path,
    *,
    source_id: str,
    observations: list[dict[str, Any]],
    manifest: dict[str, Any],
) -> ExportedCapture:
    archive_root = resolve_capture_root(root)
    ensure_storage_ready(archive_root)
    jsonl = b"".join(_canonical_json(row) + b"\n" for row in observations)
    digest = hashlib.sha256(jsonl).hexdigest()
    observation_path = archive_root / "exports" / _safe_name(source_id) / f"{digest}.jsonl"
    _atomic_write(observation_path, jsonl)
    manifest_value = dict(manifest)
    manifest_value["schema_version"] = 1
    manifest_value.setdefault("source_ids", [source_id])
    manifest_value["observation_files"] = [{
        "relative_path": observation_path.relative_to(archive_root).as_posix(),
        "sha256": digest,
        "row_count": len(observations),
        "source_id": source_id,
    }]
    manifest_bytes = _canonical_json(manifest_value) + b"\n"
    manifest_digest = hashlib.sha256(manifest_bytes).hexdigest()
    manifest_path = archive_root / "manifests" / _safe_name(source_id) / f"{manifest_digest}.json"
    _atomic_write(manifest_path, manifest_bytes)
    return ExportedCapture(observation_path, manifest_path, digest, len(observations))


def write_combined_history_manifest(
    root: str | Path,
    *,
    requested_period: dict[str, str],
    source_manifests: list[str | Path],
) -> Path:
    """Build a Sol-readable, archive-root manifest from immutable source exports.

    Source manifests intentionally live below ``manifests/``.  Their paths are relative to
    the archive root, while Sol's containment check resolves paths from the combined manifest's
    directory.  This transport manifest therefore lives at the archive root and retains only
    root-relative paths; no raw file or source export is copied or changed.
    """
    archive_root = resolve_capture_root(root)
    required = {"from", "through"}
    if set(requested_period) != required:
        raise ResearchCaptureError("requested_period must contain exactly from and through")
    raw_files: list[dict[str, Any]] = []
    observation_files: list[dict[str, Any]] = []
    coverage: list[dict[str, Any]] = []
    geo_coverage: list[dict[str, Any]] = []
    source_ids: list[str] = []
    for manifest_path in source_manifests:
        source_path = Path(manifest_path).resolve()
        try:
            source_path.relative_to(archive_root)
        except ValueError as exc:
            raise ResearchCaptureError(f"source manifest is outside configured research root: {source_path}") from exc
        try:
            source_manifest = json.loads(source_path.read_text(encoding="utf-8"))
            source_id = source_manifest["source_ids"][0]
            if len(source_manifest["source_ids"]) != 1:
                raise ValueError("must declare exactly one source_id")
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ResearchCaptureError(f"invalid source manifest {source_path}: {exc}") from exc
        if source_id in source_ids:
            raise ResearchCaptureError(f"duplicate source_id in combined manifest: {source_id}")
        source_ids.append(source_id)
        for entry in source_manifest.get("raw_files", []):
            raw_files.append({**entry, "source_id": source_id})
        for entry in source_manifest.get("observation_files", []):
            observation_files.append({**entry, "source_id": source_id})
        source_periods = source_manifest.get("source_periods", {})
        # BPS nests coverage by source id; RSW records the five publisher metric ranges
        # directly.  Normalize both retained v1 source-manifest shapes without rewriting them.
        periods = source_periods.get(source_id, source_periods)
        if "expected_period_count" in periods:
            expected = int(periods["expected_period_count"])
            present = int(periods["present_period_count"])
            missing = len(periods.get("missing", []))
            expected_range = source_manifest.get("requested_date_range") or requested_period
            observed = _period_range_from_observation_files(archive_root, source_manifest["observation_files"])
        else:
            metric_ranges = [item for item in periods.values() if item.get("observed_start") and item.get("observed_end")]
            if not metric_ranges:
                raise ResearchCaptureError(f"source manifest {source_path} has no observed source periods")
            observed = {
                "from": min(item["observed_start"][:7] for item in metric_ranges),
                "through": max(item["observed_end"][:7] for item in metric_ranges),
            }
            expected_range = observed
            expected = _month_count(observed["from"], observed["through"])
            present = expected
            missing = 0
        raw_failures = source_manifest.get("discovery_parse_failures", [])
        # RSW records a list of state/detail objects; BPS records period->failure text.
        # Preserve both shapes so a failed month cannot disappear from the transport report.
        if isinstance(raw_failures, dict):
            failures = [
                {"state": "parse_or_download_failed", "detail": f"{period}: {detail}"}
                for period, detail in sorted(raw_failures.items())
            ]
        elif isinstance(raw_failures, list):
            failures = raw_failures
        else:
            raise ResearchCaptureError(f"invalid discovery_parse_failures in {source_path}")
        coverage.append({
            "source_id": source_id,
            "frequency": "monthly",
            "expected_period": {"from": expected_range["from"], "through": expected_range["through"]},
            "observed_period": observed,
            "expected_count": expected,
            "present_count": present,
            "missing_count": missing,
            "discovery_failures": [str(item.get("detail", item)) for item in failures if isinstance(item, dict) and str(item.get("state", "")).startswith("discovery")],
            "parse_failures": [str(item.get("detail", item)) for item in failures if not (isinstance(item, dict) and str(item.get("state", "")).startswith("discovery"))],
        })
        for geo_id, geo in source_manifest.get("coverage_by_geo", {}).items():
            missing_periods = [item["period"] for item in geo.get("missing", [])]
            geo_coverage.append({
                "source_id": source_id,
                "geo_type": "county_fips",
                "geo_id": geo_id,
                "expected_period": {"from": expected_range["from"], "through": expected_range["through"]},
                # This records the archive span in which the geography has some retained
                # observations.  Counts and missing_ranges, not this span, establish continuity.
                "observed_period": observed,
                "expected_count": int(geo["expected_period_count"]),
                "present_count": int(geo["present_period_count"]),
                "missing_count": len(missing_periods),
                "missing_ranges": _period_ranges(missing_periods),
            })
    if not raw_files or not observation_files:
        raise ResearchCaptureError("combined manifest requires retained raw and observation files")
    payload = {
        "schema_version": 1,
        "run_id": "swfl-history-comparison-" + hashlib.sha256(_canonical_json({"raw_files": raw_files, "observation_files": observation_files})).hexdigest()[:16],
        "source_ids": sorted(source_ids),
        "requested_period": requested_period,
        "source_coverage": sorted(coverage, key=lambda item: item["source_id"]),
        "geo_coverage": sorted(geo_coverage, key=lambda item: (item["source_id"], item["geo_id"])),
        "raw_files": raw_files,
        "observation_files": observation_files,
    }
    content = _canonical_json(payload) + b"\n"
    path = archive_root / f"swfl-history-comparison-manifest-v1-{hashlib.sha256(content).hexdigest()}.json"
    _atomic_write(path, content)
    return path


def _month_count(start: str, through: str) -> int:
    start_year, start_month = map(int, start.split("-"))
    end_year, end_month = map(int, through.split("-"))
    return (end_year - start_year) * 12 + end_month - start_month + 1


def _period_ranges(periods: list[str]) -> list[dict[str, str]]:
    """Compress sorted monthly gaps without losing their boundaries."""
    ordered = sorted(set(periods))
    if not ordered:
        return []
    ranges: list[dict[str, str]] = []
    start = previous = ordered[0]
    for period in ordered[1:]:
        if _month_count(previous, period) != 2:
            ranges.append({"from": start, "through": previous})
            start = period
        previous = period
    ranges.append({"from": start, "through": previous})
    return ranges


def _period_range_from_observation_files(root: Path, entries: list[dict[str, Any]]) -> dict[str, str | None]:
    periods: list[str] = []
    for entry in entries:
        relative = Path(entry["relative_path"])
        if relative.is_absolute():
            raise ResearchCaptureError("observation file path must be archive-root-relative")
        path = (root / relative).resolve()
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise ResearchCaptureError("observation file path escapes archive root") from exc
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                periods.append(str(json.loads(line)["period_start"])[:7])
    return {"from": min(periods) if periods else None, "through": max(periods) if periods else None}
