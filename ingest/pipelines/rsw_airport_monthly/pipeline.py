"""
RSW Airport Monthly Statistics — ingest pipeline (v3).

Source: Lee County Port Authority (LCPA) — Reports and Statistics page
  URL:      https://www.flylcpa.com/about-lcpa/reports-and-statistics/
  Data:     5 metrics — enplanements, deplanements, total_passengers,
            aircraft_operations, total_freight_lbs
  Cadence:  monthly, updated in the first week of the following month
  Coverage: RSW (Southwest Florida International Airport) only

v1 scraped /about/statistics for an HTML table — that URL is now a 404.
v2 fetched only the enplanements PDF.
v3 (this file) fetches all 5 LCPA PDFs and ingests them as separate metrics.

PDF structure (year-as-row, identical across all 5 files):
    Year | JAN | FEB | MAR | ... | DEC | TOTAL
    1983 |     |     |     | ... |
    ...
    2026 | val | val | ...

Parser notes:
  - The header row is identified by the presence of 3+ month abbreviations.
  - Data rows whose first cell is a 4-digit year (19xx/20xx) are extracted.
  - The TOTAL column (rightmost) is skipped.
  - Empty cells produce no row (partial years for the current year are normal).

Usage:
  python -m ingest.pipelines.rsw_airport_monthly.pipeline [--dry-run]

Environment:
  DESTINATION__POSTGRES__CREDENTIALS — psycopg3 URI (required unless --dry-run)
"""
from __future__ import annotations

import argparse
import hashlib
import io
import os
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import unquote, urlparse

import psycopg
import requests

# ── Constants ─────────────────────────────────────────────────────────────────

REPORTS_PAGE_URL = "https://www.flylcpa.com/about-lcpa/reports-and-statistics/"

TABLE = "rsw_airport_monthly"

# All 5 LCPA PDFs.  Keys are metric names stored in the DB.
# pattern: regex matched against S3 URLs found on the reports page (live scrape path)
# fallback: known-good S3 URL — each embeds a Wasabi upload timestamp that goes stale
#   whenever LCPA re-uploads a PDF.  The regex scrape fires first; these only activate
#   on scrape failure.  If the pipeline starts returning 0 rows for a metric, check
#   whether the live PDF moved (scrape REPORTS_PAGE_URL and grab the new S3 URL).
METRICS: dict[str, dict[str, str]] = {
    "enplanements": {
        "pattern": r"(https://s3\.wasabisys\.com/[^\s\"'<>)]*[Ee]nplane[^\s\"'<>)]*\.pdf)",
        "fallback": (
            "https://s3.wasabisys.com/cdn.flylcpa.com/app/uploads/"
            "2024/11/21144941/RSW-Enplanement-Passengers.pdf"
        ),
    },
    "deplanements": {
        "pattern": r"(https://s3\.wasabisys\.com/[^\s\"'<>)]*[Dd]eplane[^\s\"'<>)]*\.pdf)",
        "fallback": (
            "https://s3.wasabisys.com/cdn.flylcpa.com/app/uploads/"
            "2024/12/21142454/Passenger-Deplanements.pdf"
        ),
    },
    "total_passengers": {
        "pattern": r"(https://s3\.wasabisys\.com/[^\s\"'<>)]*[Tt]otal[-_\s]*[Pp]assenger[^\s\"'<>)]*\.pdf)",
        "fallback": (
            "https://s3.wasabisys.com/cdn.flylcpa.com/app/uploads/"
            "2024/11/21145013/Total-Passengers-2026.pdf"
        ),
    },
    "aircraft_operations": {
        "pattern": r"(https://s3\.wasabisys\.com/[^\s\"'<>)]*[Oo]peration[^\s\"'<>)]*\.pdf)",
        "fallback": (
            "https://s3.wasabisys.com/cdn.flylcpa.com/app/uploads/"
            "2024/11/21142550/RSW-Operations.pdf"
        ),
    },
    "total_freight_lbs": {
        "pattern": r"(https://s3\.wasabisys\.com/[^\s\"'<>)]*[Ff]reight[^\s\"'<>)]*\.pdf)",
        "fallback": (
            "https://s3.wasabisys.com/cdn.flylcpa.com/app/uploads/"
            "2024/11/21144911/RSW-Total-Freight.pdf"
        ),
    },
}

ALLOWED_PUBLISHER_HOSTS = {"www.flylcpa.com", "flylcpa.com", "s3.wasabisys.com"}
MAX_PDF_BYTES = 25 * 1024 * 1024
MIN_PDF_BYTES = 1024


class DiscoveryError(RuntimeError):
    """The report page did not contain an acceptable publisher file for a metric."""


class DownloadValidationError(RuntimeError):
    """A purported report file is not a safely parseable PDF."""


@dataclass(frozen=True)
class PdfSelection:
    url: str
    discovery_mode: str
    release_period: date | None

MONTH_ABBREVS = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
]
MONTH_MAP = {abbr: i + 1 for i, abbr in enumerate(MONTH_ABBREVS)}

Row = dict[str, Any]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse_int(s: str) -> int | None:
    clean = re.sub(r"[,\s$]", "", str(s).strip())
    if not clean or clean in ("-", "N/A", "n/a", "—", "–", "*", ""):
        return None
    try:
        return int(clean)
    except ValueError:
        try:
            return int(float(clean))
        except ValueError:
            return None


def _make_id(report_month: date, airport_code: str, metric: str) -> str:
    return f"{report_month.strftime('%Y%m')}_{airport_code}_{metric}"


def _compute_yoy(rows: list[Row]) -> list[Row]:
    """Back-fill yoy_pct_change where current + prior-year rows both exist."""
    by_key: dict[tuple[str, str, int], dict[int, Row]] = {}
    for r in rows:
        rd = date.fromisoformat(r["report_month"])
        key = (r["airport_code"], r["metric"], rd.month)
        by_key.setdefault(key, {})[rd.year] = r

    for _key, year_map in by_key.items():
        for year, cur in year_map.items():
            prv = year_map.get(year - 1)
            if (
                prv is not None
                and cur.get("yoy_pct_change") is None
                and cur.get("value") is not None
                and prv.get("value") is not None
                and prv["value"] != 0
            ):
                cur["yoy_pct_change"] = round(
                    (cur["value"] - prv["value"]) / prv["value"] * 100, 2
                )

    return rows


# ── PDF URL discovery ─────────────────────────────────────────────────────────


def _publisher_url(value: str) -> str | None:
    """Allow only direct LCPA/legacy-CDN PDFs, never arbitrary page links."""
    url = unquote(value.strip().rstrip(")]}>.,\"'"))
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_PUBLISHER_HOSTS:
        return None
    if not parsed.path.lower().endswith(".pdf"):
        return None
    # Wasabi is accepted only for the historical LCPA archive namespace.
    if parsed.hostname == "s3.wasabisys.com" and "cdn.flylcpa.com/app/uploads/" not in parsed.path:
        return None
    if parsed.hostname in {"www.flylcpa.com", "flylcpa.com"} and "/app/uploads/" not in parsed.path:
        return None
    return url


def _release_period(url: str) -> date | None:
    stem = urlparse(url).path.rsplit("/", 1)[-1].replace("-", " ").replace("_", " ")
    match = re.search(r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b", stem, re.I)
    if not match:
        return None
    month = MONTH_MAP[match.group(1).lower()[:3]]
    return date(int(match.group(2)), month, 1)


def _metric_matches(metric: str, url: str) -> bool:
    text = urlparse(url).path.rsplit("/", 1)[-1].lower().replace("_", "-")
    identities = {
        "enplanements": ("enplanement",),
        "deplanements": ("deplanement",),
        "total_passengers": ("total-passenger", "total passenger"),
        "aircraft_operations": ("operation",),
        "total_freight_lbs": ("freight",),
    }
    wanted = identities[metric]
    if not any(token in text for token in wanted):
        return False
    # A file explicitly named deplanements cannot stand in for enplanements.
    return not (metric == "enplanements" and "deplanement" in text)


def discover_pdf_url(metric: str, markdown: str, *, allow_fallback: bool = True) -> PdfSelection:
    """Find the newest legitimate file deterministically, preserving fallback provenance."""
    raw_urls = re.findall(r"https?://[^\s\]\[\"'<>]+", markdown)
    candidates = [u for raw in raw_urls if (u := _publisher_url(raw)) and _metric_matches(metric, u)]
    if candidates:
        # A release period encoded in the publisher filename outranks unknown-date links;
        # URL lexical order makes ties repeatable rather than dependent on page order.
        chosen = max(candidates, key=lambda u: (_release_period(u) or date.min, u))
        return PdfSelection(chosen, "publisher_page", _release_period(chosen))
    fallback = METRICS[metric]["fallback"]
    checked_fallback = _publisher_url(fallback)
    if allow_fallback and checked_fallback and _metric_matches(metric, checked_fallback):
        return PdfSelection(checked_fallback, "legacy_fallback", _release_period(checked_fallback))
    raise DiscoveryError(f"no accepted publisher PDF link for metric {metric}")


def _find_pdf_url(metric: str, pattern: str, fallback: str, markdown: str) -> str:
    """Compatibility wrapper retained for callers of the previous helper."""
    del pattern, fallback
    return discover_pdf_url(metric, markdown).url


def _scrape_reports_page() -> str:
    """Scrape the LCPA reports page once and return markdown.

    Returns empty string on failure (callers will use fallback URLs).
    """
    from ingest.lib.crawl_client import fetch_page_markdown

    try:
        markdown = fetch_page_markdown(REPORTS_PAGE_URL)
        print(f"rsw_airport_monthly: scraped reports page ({len(markdown):,} chars).")
        return markdown
    except Exception as exc:
        print(f"rsw_airport_monthly: reports-page scrape failed ({exc}); will use all fallback URLs.")
        return ""


# ── PDF download ──────────────────────────────────────────────────────────────


def _download_pdf(url: str) -> bytes:
    """Download a bounded PDF from an already validated publisher URL."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; SWFL-Data-Gulf/1.0; "
            "+https://www.swfldatagulf.com)"
        )
    }
    resp = requests.get(url, headers=headers, timeout=(10, 60), stream=True)
    resp.raise_for_status()
    chunks: list[bytes] = []
    size = 0
    for chunk in resp.iter_content(chunk_size=64 * 1024):
        if not chunk:
            continue
        size += len(chunk)
        if size > MAX_PDF_BYTES:
            raise DownloadValidationError(f"download exceeds {MAX_PDF_BYTES} byte PDF limit")
        chunks.append(chunk)
    content = b"".join(chunks)
    validate_pdf_bytes(content)
    return content


def validate_pdf_bytes(content: bytes) -> None:
    if len(content) < MIN_PDF_BYTES:
        raise DownloadValidationError(f"truncated PDF: {len(content)} bytes < {MIN_PDF_BYTES}")
    if not content.startswith(b"%PDF-"):
        raise DownloadValidationError("download is not a PDF (missing %PDF header)")
    if b"%%EOF" not in content[-4096:]:
        raise DownloadValidationError("truncated PDF: missing EOF marker")


# ── PDF parser ────────────────────────────────────────────────────────────────


def parse_pdf(pdf_bytes: bytes, source_url: str, metric: str) -> list[Row]:
    """Parse one LCPA statistics PDF into DB rows for the given metric.

    All 5 LCPA PDFs share the same Year×Month table structure:
      Year | JAN | FEB | ... | DEC | TOTAL
      1983 |     |     | ... (partial)
      1984 | N   | N   | ...
      ...

    The TOTAL column is skipped. Empty cells are skipped (partial years).
    Returns rows sorted by report_month ascending.
    """
    try:
        import pdfplumber  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("pdfplumber not installed — add it to ingest/requirements.txt") from exc

    now_iso = datetime.now(timezone.utc).isoformat()
    rows: list[Row] = []
    month_col_indices: list[tuple[int, int]] = []  # (col_idx, month_num)

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for raw_row in table:
                    if not raw_row:
                        continue
                    cells = [str(c).strip() if c is not None else "" for c in raw_row]

                    # ── Header detection ─────────────────────────────────────
                    lower_cells = [c.lower()[:3] for c in cells]
                    matching_months = [
                        (i, MONTH_MAP[lc])
                        for i, lc in enumerate(lower_cells)
                        if lc in MONTH_MAP
                    ]
                    if len(matching_months) >= 3:
                        month_col_indices = matching_months
                        continue

                    if not month_col_indices:
                        continue

                    # ── Data row ─────────────────────────────────────────────
                    first = cells[0].strip()
                    if not re.match(r"^(19|20)\d\d$", first):
                        continue
                    year = int(first)

                    for col_idx, month_num in month_col_indices:
                        if col_idx >= len(cells):
                            continue
                        value = _parse_int(cells[col_idx])
                        if value is None:
                            continue

                        report_month = date(year, month_num, 1)
                        rows.append({
                            "id": _make_id(report_month, "RSW", metric),
                            "report_month": report_month.isoformat(),
                            "airport_code": "RSW",
                            "metric": metric,
                            "value": value,
                            "yoy_pct_change": None,
                            "period_label": report_month.strftime("%B %Y"),
                            "source_url": source_url,
                            "inserted_at": now_iso,
                        })

    # Deduplicate (same id → keep one)
    seen: dict[str, Row] = {}
    for r in rows:
        seen[r["id"]] = r
    rows = list(seen.values())
    rows.sort(key=lambda r: r["report_month"])

    return _compute_yoy(rows)


def _month_end(month: date) -> date:
    if month.month == 12:
        return date(month.year + 1, 1, 1).fromordinal(date(month.year + 1, 1, 1).toordinal() - 1)
    return date(month.year, month.month + 1, 1).fromordinal(date(month.year, month.month + 1, 1).toordinal() - 1)


def make_observation(
    row: Row,
    *,
    source_url: str,
    source_sha256: str,
    retrieved_at: str,
    discovery_mode: str,
) -> dict[str, Any]:
    """Translate a parsed RSW row into the agreed local observation v1 shape."""
    period_start = date.fromisoformat(row["report_month"])
    flags = [] if discovery_mode == "publisher_page" else ["legacy_fallback_not_freshness"]
    return {
        "schema_version": 1,
        "source_id": "rsw_lcpa_monthly",
        "metric_id": row["metric"],
        "definition_version": "lcpa_monthly_v1",
        "geo_type": "airport",
        "geo_id": "RSW",
        "period_start": period_start.isoformat(),
        "period_end": _month_end(period_start).isoformat(),
        "frequency": "monthly",
        "value": row.get("value"),
        "unit": "pounds" if row["metric"] == "total_freight_lbs" else "count",
        "status": "observed" if row.get("value") is not None else "missing",
        "value_basis": "reported",
        "published_at": None,
        "first_seen_at": retrieved_at,
        "retrieved_at": retrieved_at,
        "available_at": None,
        "availability_basis": "unknown",
        "source_url": source_url,
        "source_sha256": source_sha256,
        "vintage_id": source_sha256,
        "quality_flags": flags,
    }


def _capture_local(
    rows_by_metric: dict[str, tuple[list[Row], PdfSelection, bytes]], root: str, metric_states: dict[str, dict[str, str | int | None]]
) -> dict[str, str]:
    """Persist immutable raw files and a JSONL/manifest without any DB/cloud operation."""
    from ingest.lib.research_capture import first_seen_for_release, store_raw_bytes, write_observations_and_manifest

    captured_at = datetime.now(timezone.utc).isoformat()
    observations: list[dict[str, Any]] = []
    raw_files: list[dict[str, Any]] = []
    source_ranges: dict[str, dict[str, Any]] = {}
    failures = [
        {"metric": metric, "state": str(state.get("state")), "detail": str(state.get("detail") or "")}
        for metric, state in metric_states.items()
        if state.get("state") not in {"observed", "fallback_observed"}
    ]
    for metric, (rows, selection, content) in rows_by_metric.items():
        original_name = urlparse(selection.url).path.rsplit("/", 1)[-1]
        raw = store_raw_bytes(root, source_id="rsw_lcpa_monthly", original_name=original_name, content=content)
        first_seen_at = first_seen_for_release(root, source_id="rsw_lcpa_monthly", sha256=raw.sha256, observed_at=captured_at)
        raw_files.append({"relative_path": raw.relative_path, "sha256": raw.sha256, "byte_size": raw.byte_size, "source_url": selection.url})
        observations.extend(make_observation(row, source_url=selection.url, source_sha256=raw.sha256, retrieved_at=first_seen_at, discovery_mode=selection.discovery_mode) for row in rows)
        source_ranges[metric] = {
            "observed_start": rows[0]["report_month"] if rows else None,
            "observed_end": rows[-1]["report_month"] if rows else None,
            "discovery_mode": selection.discovery_mode,
            "source_url": selection.url,
            "caveat": "fallback cannot establish freshness" if selection.discovery_mode == "legacy_fallback" else None,
        }
    exported = write_observations_and_manifest(root, source_id="rsw_lcpa_monthly", observations=observations, manifest={
        "run_id": captured_at,
        "source_ids": ["rsw_lcpa_monthly"],
        "raw_files": raw_files,
        "requested_date_range": None,
        "source_periods": source_ranges,
        "expected_period_count": None,
        "present_period_count": len(observations),
        "missing_periods": [],
        "discovery_parse_failures": failures,
    })
    return {"observations": str(exported.observation_path), "manifest": str(exported.manifest_path)}


# ── DB upsert ─────────────────────────────────────────────────────────────────

UPSERT_SQL = f"""
INSERT INTO {TABLE} (
    id, report_month, airport_code, metric,
    value, yoy_pct_change, period_label, source_url, inserted_at
)
VALUES (
    %(id)s, %(report_month)s, %(airport_code)s, %(metric)s,
    %(value)s, %(yoy_pct_change)s, %(period_label)s, %(source_url)s, %(inserted_at)s
)
ON CONFLICT (id) DO UPDATE SET
    value          = EXCLUDED.value,
    yoy_pct_change = EXCLUDED.yoy_pct_change,
    period_label   = EXCLUDED.period_label,
    source_url     = EXCLUDED.source_url,
    inserted_at    = EXCLUDED.inserted_at
"""


def upsert_rows(rows: list[Row], conn_str: str) -> int:
    if not rows:
        return 0
    with psycopg.connect(conn_str) as conn:
        with conn.cursor() as cur:
            cur.executemany(UPSERT_SQL, rows)
        conn.commit()
    return len(rows)


# ── Orchestration ─────────────────────────────────────────────────────────────


def run(dry_run: bool, conn_str: str | None, *, capture_local: bool = False) -> None:
    # Step 1: scrape the reports page once to get all PDF links
    page_markdown = _scrape_reports_page()

    all_rows: list[Row] = []
    rows_by_metric: dict[str, tuple[list[Row], PdfSelection, bytes]] = {}
    metric_states: dict[str, dict[str, str | int | None]] = {}

    for metric, cfg in METRICS.items():
        try:
            selection = discover_pdf_url(metric, page_markdown)
        except DiscoveryError as exc:
            metric_states[metric] = {"state": "discovery_failed", "detail": str(exc), "source_url": None}
            print(f"rsw_airport_monthly [{metric}]: {exc}; keeping other metrics.")
            continue
        pdf_url = selection.url

        print(f"rsw_airport_monthly [{metric}]: downloading PDF...")
        try:
            pdf_bytes = _download_pdf(pdf_url)
        except Exception as exc:
            metric_states[metric] = {"state": "download_failed", "detail": str(exc), "source_url": pdf_url}
            print(f"rsw_airport_monthly [{metric}]: download failed ({exc}); keeping other metrics.")
            continue
        print(f"rsw_airport_monthly [{metric}]: downloaded {len(pdf_bytes):,} bytes.")

        try:
            rows = parse_pdf(pdf_bytes, source_url=pdf_url, metric=metric)
        except Exception as exc:
            metric_states[metric] = {"state": "parse_failed", "detail": str(exc), "source_url": pdf_url}
            print(f"rsw_airport_monthly [{metric}]: parse failed ({exc}); keeping other metrics.")
            continue
        if not rows:
            metric_states[metric] = {"state": "zero_rows", "detail": "PDF parsed no monthly observations", "source_url": pdf_url}
            print(f"rsw_airport_monthly [{metric}]: zero rows; keeping other metrics.")
            continue
        metric_states[metric] = {
            "state": "observed" if selection.discovery_mode == "publisher_page" else "fallback_observed",
            "detail": None,
            "source_url": pdf_url,
            "max_observation_month": rows[-1]["report_month"],
        }
        print(f"rsw_airport_monthly [{metric}]: parsed {len(rows)} rows.")
        all_rows.extend(rows)
        rows_by_metric[metric] = (rows, selection, pdf_bytes)

    if not all_rows:
        raise RuntimeError(
            "rsw_airport_monthly: zero rows parsed across all metrics. "
            "Check that pdfplumber can read the files and that the table structure "
            "matches the expected year-as-row format."
        )

    # Summary
    metrics_seen = sorted({r["metric"] for r in all_rows})
    years = sorted({r["report_month"][:4] for r in all_rows})
    print(
        f"rsw_airport_monthly: total {len(all_rows)} rows  "
        f"metrics={metrics_seen}  "
        f"years={years[0]}–{years[-1]}"
    )
    for metric in METRICS:
        print(f"rsw_airport_monthly [{metric}]: state={metric_states.get(metric, {'state': 'not_attempted'})}")

    # Print most-recent 30 rows (6 metrics × 5 months) for inspection
    recent = sorted(all_rows, key=lambda r: (r["report_month"], r["metric"]), reverse=True)[:30]
    for r in recent:
        pct_str = f" {r['yoy_pct_change']:+.1f}%" if r["yoy_pct_change"] is not None else ""
        print(
            f"  {r['airport_code']:<4}  {r['period_label']:<16}  "
            f"{r['metric']:<25}  {r['value']:>12,}{pct_str}"
        )

    if capture_local:
        capture = _capture_local(rows_by_metric, os.environ.get("SWFL_RESEARCH_ROOT", ""), metric_states)
        print(f"rsw_airport_monthly: local capture only (no DB/cloud writes): {capture}")
        return

    if dry_run:
        print("rsw_airport_monthly: --dry-run, skipping DB write.")
        return

    if not conn_str:
        raise RuntimeError(
            "DESTINATION__POSTGRES__CREDENTIALS not set — cannot write to DB."
        )
    written = upsert_rows(all_rows, conn_str)
    print(f"rsw_airport_monthly: upserted {written} rows into {TABLE}.")


# ── CLI ───────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="RSW monthly aviation statistics ingest pipeline (LCPA PDFs — all 5 metrics)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Download and parse, print rows, do not write to DB.",
    )
    parser.add_argument(
        "--capture-local",
        action="store_true",
        help="Retain immutable raw PDFs plus local JSONL/manifest under SWFL_RESEARCH_ROOT; never writes DB/cloud.",
    )
    args = parser.parse_args(argv)

    conn_str = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    run(dry_run=args.dry_run, conn_str=conn_str, capture_local=args.capture_local)
    return 0


if __name__ == "__main__":
    sys.exit(main())
