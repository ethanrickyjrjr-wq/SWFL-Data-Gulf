"""LeePA ParcelInfo layer 23 "Comparable Sales" -> data_lake.leepa_comparable_sales.

The one LeePA surface carrying BedRooms / Bathrooms. Joins to data_lake.leepa_parcels
on FOLIOID, which that table already holds — no new crosswalk needed.

GRAIN WARNING (data-roots T10): SaleYear + SaleMonth are separate integers. This is
MONTH grain and it does NOT fix sale-date recency. Nothing here may synthesize a
day-of-month.
"""
from __future__ import annotations

import hashlib
import secrets as _secrets
import time
from datetime import date

import dlt

from ingest.lib.arcgis_paginator import arcgis_count, paginate_arcgis_keyset
from ingest.lib.coercion import coerce_float as _coerce_float, coerce_int as _coerce_int
from ingest.lib.guards import VolumeGuardError, assert_min_rows, assert_vs_canonical
from ingest.lib.storage_uploader import upload_csv_gz
from ingest.lib.tier1_inventory import upsert_inventory_row

from .constants import COMP_SALES_OUT_FIELDS, LEEPA_COMP_SALES_URL, TABULAR_BUCKET

# Floor for the fetched-vs-canonical volume guard. 90% of 108,881 (live count
# 07/22/2026) is ~97,992 — a resultOffset truncation at 40,000 (the documented
# layer-12 failure on this exact host) trips this loudly.
_MIN_ROWS = 90_000

# Non-null floors, measured live 07/22/2026 before any code was written:
#   FOLIOID  — the join key. Load-bearing; a vendor rename nulls the column and the
#              table becomes unjoinable while the row count still looks healthy.
#   BedRooms — the whole point of pulling this layer. 75,746 of 108,881 rows have
#              BedRooms > 0 = 69.6%, so the floor is 0.5, NOT 0.9. Land and some
#              non-residential rows legitimately carry 0; a 0.9 floor false-trips.
_FOLIOID_NONNULL_FLOOR = 0.99
_BEDROOMS_PRESENT_FLOOR = 0.50


# Tier 2 column hints — pin the schema so it is stable across re-ingests.
# folioid is TEXT to match data_lake.leepa_parcels.folioid (character varying,
# verified via information_schema 07/22/2026). Layer 23 serves FOLIOID as an int;
# storing it as int here would make the join to leepa_parcels an int = text
# comparison that silently fails or forces a cast on every query.
_TIER2_COMP_SALES_COLUMNS: dict = {
    "comp_id":        {"data_type": "text",   "nullable": False, "primary_key": True},
    "folioid":        {"data_type": "text",   "nullable": True},
    "sale_year":      {"data_type": "bigint", "nullable": True},
    "sale_month_num": {"data_type": "bigint", "nullable": True},
    # First-of-month DATE built from sale_year + sale_month_num, for range queries only.
    # The day component is an artifact of the DATE type, NOT a fact from the source —
    # render as "May 2026", never "05/01/2026" (data-roots T10).
    "sale_month":     {"data_type": "date",   "nullable": True},
    "sale_price":     {"data_type": "double", "nullable": True},
    "deed_type":      {"data_type": "text",   "nullable": True},
    "dor_code":       {"data_type": "text",   "nullable": True},
    "building_count": {"data_type": "bigint", "nullable": True},
    "bedrooms":       {"data_type": "double", "nullable": True},
    "bathrooms":      {"data_type": "double", "nullable": True},
    "nbhd_land":      {"data_type": "text",   "nullable": True},
    "pool":           {"data_type": "text",   "nullable": True},
    "year_built":     {"data_type": "bigint", "nullable": True},
    "gross_area":     {"data_type": "double", "nullable": True},
    "imp_code":       {"data_type": "bigint", "nullable": True},
}


def _sale_month_date(year, month) -> str | None:
    """First-of-month ISO date from the source's two separate integers.

    Returns None on an out-of-range or missing month — never guesses. The day is
    always 1 because the source has no day: this is a range-query affordance, not a
    claim of day precision.
    """
    y, m = _coerce_int(year), _coerce_int(month)
    if y is None or m is None or not (1 <= m <= 12) or not (1900 <= y <= 2100):
        return None
    return date(y, m, 1).isoformat()


def _comp_id(attrs: dict) -> str:
    """Deterministic content hash — the merge key.

    NOT FOLIOID: a parcel can sell more than once, so folioid repeats across the
    108,881 rows and would collapse a parcel's sale history to one row.

    NOT OBJECTID: it is the layer's OID, reassigned when the appraiser republishes,
    so keying on it would overwrite unrelated rows on the next annual run.

    A hash of the sale's own identifying content (parcel + when + deed + price, the
    raw SalePrice string exactly as served) is stable across republishes, which is
    what makes the merge idempotent.
    """
    parts = [
        str(attrs.get("FOLIOID") or ""),
        str(attrs.get("SaleYear") or ""),
        str(attrs.get("SaleMonth") or ""),
        str(attrs.get("DeedType") or ""),
        str(attrs.get("SalePrice") or ""),
    ]
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()


def _normalize(attrs: dict) -> dict:
    """Map one layer-23 attribute dict to the Tier-2 row shape.

    SalePrice arrives as a FORMATTED STRING ("$245,000"), not a number — the single
    trap in this layer. ingest.lib.coercion.coerce_float already strips $ and commas
    and returns None for unparseable values, so no bespoke parser is needed here.
    """
    folio = attrs.get("FOLIOID")
    return {
        "comp_id":        _comp_id(attrs),
        "folioid":        None if folio is None else str(folio),
        "sale_year":      _coerce_int(attrs.get("SaleYear")),
        "sale_month_num": _coerce_int(attrs.get("SaleMonth")),
        "sale_month":     _sale_month_date(attrs.get("SaleYear"), attrs.get("SaleMonth")),
        "sale_price":     _coerce_float(attrs.get("SalePrice")),
        "deed_type":      attrs.get("DeedType"),
        "dor_code":       attrs.get("dorcode"),
        "building_count": _coerce_int(attrs.get("BuildingCount")),
        "bedrooms":       _coerce_float(attrs.get("BedRooms")),
        "bathrooms":      _coerce_float(attrs.get("Bathrooms")),
        "nbhd_land":      attrs.get("NbhdLand"),
        "pool":           attrs.get("Pool"),
        "year_built":     _coerce_int(attrs.get("YearBuilt")),
        "gross_area":     _coerce_float(attrs.get("GrossArea")),
        "imp_code":       _coerce_int(attrs.get("ImpCode")),
    }


def fetch_comp_sales(max_resumes: int = 8) -> list[dict]:
    """Keyset-paginate layer 23 and return raw attribute dicts.

    KEYSET, not resultOffset: the offset walk silently TRUNCATES on this host — LeePA
    layer 12 stopped at 40,000 of ~548k because the server quit reporting
    exceededTransferLimit (see arcgis_paginator.paginate_arcgis_keyset). At 108,881
    rows layer 23 is well past that ceiling, so the offset walk is not an option.

    geometry=False: the SHAPE polygon more than doubles the payload (measured 07/22/2026:
    100 rows = 27,629 bytes without vs 58,929 with) for a polygon the parcel spine
    already holds.

    RESUME ENVELOPE — measured, not speculative. gissvr.leepa.org stalls intermittently
    deep in a long walk: on 07/22/2026 this pull reached 90,000 rows and then hit three
    consecutive 120s read timeouts while individual pages before and after served in
    ~0.5s. The shared paginator retries 3x and then raises, which throws away all 90,000
    rows already in hand and makes a ~109-page pull a coin flip. So we re-enter the
    shared paginator from the last OBJECTID we actually banked instead of forking or
    loosening it — every other caller keeps the existing retry semantics.

    Correctness of the resume: the paginator composes `({where}) AND OBJECTID>{internal}`
    and walks ascending, so re-entering with `OBJECTID>{last_oid}` is a strict
    continuation — no gap and no overlap. OBJECTIDs are deduped anyway because a resume
    that races the boundary must not double-count against the volume guard.
    """
    rows: list[dict] = []
    seen: set = set()
    last_oid = -1
    resumes = 0

    while True:
        try:
            for feature in paginate_arcgis_keyset(
                LEEPA_COMP_SALES_URL,
                where=f"OBJECTID>{last_oid}",
                out_fields=COMP_SALES_OUT_FIELDS,
                page_size=1000,  # the layer's maxRecordCount
                geometry=False,
            ):
                attrs = feature.get("attributes") or {}
                if not attrs:
                    continue
                oid = attrs.get("OBJECTID")
                if oid is not None:
                    if oid in seen:
                        continue
                    seen.add(oid)
                    if oid > last_oid:
                        last_oid = oid
                rows.append(attrs)
                # Progress marker every ~10 pages: distinguishes "slow" from "dead"
                # and records the last-good point a resume restarts from.
                if len(rows) % 10_000 == 0:
                    print(f"    ...{len(rows):,} rows", flush=True)
            return rows
        except Exception as exc:  # noqa: BLE001 — resume, then re-raise if out of budget
            resumes += 1
            if resumes > max_resumes:
                raise
            backoff = min(15 * resumes, 60)
            # ASCII only in this line: it prints on a cp1252 Windows console where an
            # em-dash renders as a replacement char.
            print(
                f"    fetch stalled after {len(rows):,} rows at OBJECTID {last_oid} "
                f"({type(exc).__name__}) - resume {resumes}/{max_resumes} in {backoff}s",
                flush=True,
            )
            time.sleep(backoff)


def _assert_shape(normalized: list[dict]) -> None:
    """Non-null guards on the load-bearing columns, BEFORE any write (Gate 4).

    Volume guards answer "did enough rows arrive?". These answer "did the columns
    survive?" — the failure a row count is structurally blind to: a vendor field
    rename (FOLIOID -> FolioID, BedRooms -> Bedrooms) nulls an entire column while
    108k healthy-looking rows land on top of good data.
    """
    total = len(normalized)
    if total == 0:
        raise VolumeGuardError("[volume-guard] leepa_comparable_sales: 0 normalized rows — aborting")

    nonnull_folio = sum(1 for r in normalized if (r.get("folioid") or "").strip())
    folio_rate = nonnull_folio / total
    print(f"  folioid non-null rate: {folio_rate:.1%} ({nonnull_folio:,}/{total:,})", flush=True)
    if folio_rate < _FOLIOID_NONNULL_FLOOR:
        raise VolumeGuardError(
            f"[volume-guard] leepa_comparable_sales: folioid non-null {folio_rate:.1%} < "
            f"{_FOLIOID_NONNULL_FLOOR:.0%} floor — likely a vendor field-name break (verify the "
            f"FOLIOID mapping). The join key to leepa_parcels is the whole value of this table. Refusing to write."
        )

    # "Present" for BedRooms means > 0, not merely non-null: the source serves 0 for
    # land and some non-residential rows, so a non-null check would pass even if every
    # value were zeroed out.
    beds_present = sum(1 for r in normalized if (r.get("bedrooms") or 0) > 0)
    beds_rate = beds_present / total
    print(f"  bedrooms>0 rate: {beds_rate:.1%} ({beds_present:,}/{total:,})", flush=True)
    if beds_rate < _BEDROOMS_PRESENT_FLOOR:
        raise VolumeGuardError(
            f"[volume-guard] leepa_comparable_sales: bedrooms>0 {beds_rate:.1%} < "
            f"{_BEDROOMS_PRESENT_FLOOR:.0%} floor (69.6% measured 07/22/2026) — likely a vendor "
            f"field-name break (verify the BedRooms mapping). Beds/baths is the entire reason this "
            f"layer is pulled. Refusing to write."
        )

    # SalePrice is the formatted-string field — if the vendor changes its format, every
    # value silently becomes None while the row count stays perfect. Report, don't gate:
    # a genuinely price-less deed type is legitimate, so this is visibility, not a floor.
    priced = sum(1 for r in normalized if r.get("sale_price") is not None)
    print(f"  sale_price parsed rate: {priced / total:.1%} ({priced:,}/{total:,})", flush=True)
    dated = sum(1 for r in normalized if r.get("sale_month"))
    print(f"  sale_month derived rate: {dated / total:.1%} ({dated:,}/{total:,})", flush=True)


def _make_comp_sales_resource(chunk: list[dict]):
    """Zero-parameter resource factory.

    dlt's spec_from_signature turns function args into a dataclass and rejects mutable
    list defaults; closing over `chunk` from the outer scope sidesteps it entirely.
    Same shape as leepa/_make_leepa_resource.
    """

    @dlt.resource(
        table_name="leepa_comparable_sales",
        write_disposition="merge",
        primary_key="comp_id",
        columns=_TIER2_COMP_SALES_COLUMNS,
    )
    def comp_sales_rows():
        yield from chunk

    return comp_sales_rows


def _promote_to_tier2(rows: list[dict], chunk_size: int = 5_000) -> None:
    """Chunked merge into data_lake.leepa_comparable_sales.

    merge, not replace, on two counts. (1) Mechanical: replace at this volume blows the
    Supabase pooler — the same failure that forced leepa_parcels onto chunked merge
    (and FAF5 before it), and 108,881 rows is over half that table's load. (2) Semantic:
    the appraiser regenerates this layer on a rolling window, so a replace would delete
    sales that merely aged out of the source's window even though they remain true
    historical sales. The content-hash comp_id keeps the merge idempotent — a re-run of
    the same vintage updates in place instead of duplicating.
    """
    total = len(rows)
    n_chunks = (total + chunk_size - 1) // chunk_size
    for i in range(0, total, chunk_size):
        chunk = rows[i : i + chunk_size]
        pipeline = dlt.pipeline(
            pipeline_name=f"leepa_comp_t2_{_secrets.token_hex(4)}",
            destination="postgres",
            dataset_name="data_lake",
        )
        load_info = pipeline.run(_make_comp_sales_resource(chunk)())
        load_info.raise_on_failed_jobs()
        print(f"  leepa_comparable_sales chunk {i // chunk_size + 1}/{n_chunks} ({len(chunk)} rows)", flush=True)


def ingest_leepa_comp_sales() -> None:
    """Fetch layer 23, archive to Tier 1, guard, then merge into Tier 2."""
    today = date.today().isoformat()

    print("Fetching LeePA layer 23 (Comparable Sales)...", flush=True)
    raw = fetch_comp_sales()
    print(f"  fetched {len(raw):,} rows", flush=True)

    # Volume guards on the FETCHED count, before the write. Deliberately not on the
    # final table count: merge dedup legitimately leaves the table below canonical.
    canonical = arcgis_count(LEEPA_COMP_SALES_URL)
    print(f"  canonical count: {canonical:,}", flush=True)
    assert_vs_canonical(len(raw), canonical, label="leepa comparable_sales")
    assert_min_rows(len(raw), _MIN_ROWS, label="leepa comparable_sales")

    normalized = [_normalize(r) for r in raw]
    _assert_shape(normalized)

    # Tier 1 cold archive — best-effort, never sinks the Tier 2 load.
    try:
        object_path = f"leepa/comparable_sales/{today}.csv.gz"
        upload_csv_gz(TABULAR_BUCKET, object_path, raw, list(raw[0].keys()))
        upsert_inventory_row(
            bucket=TABULAR_BUCKET, path=object_path, vintage=today, byte_size=None,
            pack_id="properties-lee-value", source_url=LEEPA_COMP_SALES_URL,
        )
    except Exception as exc:  # noqa: BLE001 — archive is best-effort
        print(f"  Tier-1 archive failed ({exc}) — continuing to Tier 2", flush=True)

    _promote_to_tier2(normalized)
    print(f"LeePA comparable sales complete: {len(normalized):,} rows merged.", flush=True)
