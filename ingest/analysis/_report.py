"""Shared report header + writer for the offline analysis package.

A committed report with no provenance is a stale claim (see SESSION_LOG 07/20/2026:
a one-day-old spec's 9.9% was quoted as live when the truth was 54.2%). The header
is what makes a diff between two dated runs mean something.

Two constants below are guards, not decoration:

- SCOPE_BOUNDARY (FM 11) travels in every report because the challenger trains on
  listing_week, which carries NO parcel columns. "RF showed no lift" therefore says
  nothing about parcel data. Prose someone has to remember is not a guard; a
  header line is.
- GATE_LABEL / NON_GATE_LABEL (FM 1) exist because two accuracy numbers appear in
  one report and the grouped-CV one reads better. Only time-forward is ever the
  gate, and the labels say so on their face.

Spec: docs/superpowers/specs/2026-07-22-offline-model-analysis-design.md
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

REPORTS_DIR = Path("reports/analysis")

SCOPE_BOUNDARY = (
    "SCOPE BOUNDARY: the challenger trains on the data_lake.listing_week panel, "
    "which contains NO parcel columns. A result showing no lift from a tree "
    "ensemble says nothing about whether parcel data helps — parcel data was "
    "never in the feature set. The parcel structure pass informs a FUTURE model "
    "iteration; the panel-to-parcel join is not built."
)

GATE_LABEL = "SECTION 2 — SHIPPING GATE (time-forward). THIS is the number that gates."
NON_GATE_LABEL = (
    "SECTION 1 — MODEL CLASS (grouped-CV). NOT A GATE. Reads optimistically "
    "relative to time-forward because it uses all weeks; it answers 'which model "
    "class', never 'is this ready to ship'."
)

SEASONALITY_CAVEAT = (
    "CAVEAT (unobserved seasonality): the panel spans a small number of "
    "consecutive weeks — one narrow seasonal slice. No validation split fixes "
    "this. Treat any number here as within-slice, not general."
)

NO_SERVING = (
    "This report ships no number, renders no surface, and touches no served "
    "path. It is evidence for a decision, not a served value."
)


def git_sha() -> str:
    """Short SHA of the commit that produced this report (FM 8)."""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def as_of_display(d: date | None = None) -> str:
    """MM/DD/YYYY — the operator-facing date format, never the raw token."""
    return (d or date.today()).strftime("%m/%d/%Y")


@dataclass
class Report:
    title: str
    command: str
    as_of: date | None = None
    source_counts: dict[str, int] = field(default_factory=dict)
    week_span: str | None = None
    sections: list[str] = field(default_factory=list)

    def header(self) -> str:
        lines = [
            f"# {self.title}",
            "",
            f"- **As of:** {as_of_display(self.as_of)}",
            f"- **Commit:** `{git_sha()}`",
            f"- **Command:** `{self.command}`",
        ]
        for name, count in sorted(self.source_counts.items()):
            lines.append(f"- **Source `{name}`:** {count:,} rows")
        if self.week_span:
            lines.append(f"- **Week span:** {self.week_span}")
        lines += ["", SCOPE_BOUNDARY, "", NO_SERVING, ""]
        return "\n".join(lines)

    def add(self, body: str) -> None:
        self.sections.append(body)

    def render(self) -> str:
        return self.header() + "\n" + "\n\n".join(self.sections) + "\n"

    def write(self, slug: str, directory: Path | None = None) -> Path:
        """Dated, committed output: reports/analysis/YYYY-MM-DD-<slug>.md"""
        target_dir = directory or REPORTS_DIR
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = (self.as_of or date.today()).isoformat()
        path = target_dir / f"{stamp}-{slug}.md"
        path.write_text(self.render(), encoding="utf-8")
        return path
