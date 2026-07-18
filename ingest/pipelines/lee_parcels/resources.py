"""Pull Lee County parcels from the FDOR Statewide Cadastral FeatureServer
and merge them into data_lake.lee_parcels (Tier 2).

Sibling to ingest/pipelines/collier_parcels — identical field scope, pagination,
and chunked-merge shape, filtered to CO_NO=46 (Lee) instead of CO_NO=21
(Collier). Every field on the layer except owner/fiduciary PII (OWN_*/FIDU_*)
and ArcGIS-internal row artifacts (OBJECTID/OID_/ORIG_FID/PARCELNO). Field
meanings verified against FDOR's live 2025 NAL Data File User's Guide, not
guessed from the truncated ArcGIS aliases. No DOR_UC filter — every parcel
type included (residential, commercial, vacant, agricultural, institutional).
"""
from __future__ import annotations

import time

import requests

from ingest.lib.arcgis_paginator import arcgis_count
from ingest.lib.coercion import coerce_float as _coerce_float, coerce_int as _coerce_int
from ingest.lib.guards import assert_vs_canonical

from .constants import LEE_CADASTRAL_URL, LEE_CO_NO_WHERE, OUT_FIELDS


def _s(a: dict, key: str) -> str | None:
    """Text field: str-or-None, matching collier_parcels' convention."""
    v = a.get(key)
    return (str(v).strip() or None) if v not in (None, "") else None


# Tier-2 column hints — identical shape to collier_parcels._TIER2_COLUMNS.
_TIER2_COLUMNS: dict = {
    "parcel_id": {"data_type": "text", "nullable": False, "primary_key": True},
    "co_no": {"data_type": "bigint", "nullable": True},
    "file_type": {"data_type": "text", "nullable": True},
    "assessment_year": {"data_type": "bigint", "nullable": True},
    "basic_stratum": {"data_type": "text", "nullable": True},
    "active_stratum": {"data_type": "text", "nullable": True},
    "group_no": {"data_type": "text", "nullable": True},
    "dor_uc": {"data_type": "text", "nullable": True},
    "pa_uc": {"data_type": "text", "nullable": True},
    "special_assessment_code": {"data_type": "text", "nullable": True},
    "jv": {"data_type": "double", "nullable": True},
    "jv_change": {"data_type": "double", "nullable": True},
    "jv_change_code": {"data_type": "bigint", "nullable": True},
    "av_sd": {"data_type": "double", "nullable": True},
    "av_nsd": {"data_type": "double", "nullable": True},
    "tv_sd": {"data_type": "double", "nullable": True},
    "tv_nsd": {"data_type": "double", "nullable": True},
    "jv_hmstd": {"data_type": "double", "nullable": True},
    "av_hmstd": {"data_type": "double", "nullable": True},
    "jv_non_hmstd_resd": {"data_type": "double", "nullable": True},
    "av_non_hmstd_resd": {"data_type": "double", "nullable": True},
    "jv_resd_non_resd": {"data_type": "double", "nullable": True},
    "av_resd_non_resd": {"data_type": "double", "nullable": True},
    "jv_class_use": {"data_type": "double", "nullable": True},
    "av_class_use": {"data_type": "double", "nullable": True},
    "jv_h2o_recharge": {"data_type": "double", "nullable": True},
    "av_h2o_recharge": {"data_type": "double", "nullable": True},
    "jv_conservation": {"data_type": "double", "nullable": True},
    "av_conservation": {"data_type": "double", "nullable": True},
    "jv_hist_commercial": {"data_type": "double", "nullable": True},
    "av_hist_commercial": {"data_type": "double", "nullable": True},
    "jv_hist_significant": {"data_type": "double", "nullable": True},
    "av_hist_significant": {"data_type": "double", "nullable": True},
    "jv_working_waterfront": {"data_type": "double", "nullable": True},
    "av_working_waterfront": {"data_type": "double", "nullable": True},
    "new_construction_value": {"data_type": "double", "nullable": True},
    "deletion_value": {"data_type": "double", "nullable": True},
    "parcel_split_code": {"data_type": "bigint", "nullable": True},
    "disaster_code": {"data_type": "bigint", "nullable": True},
    "disaster_year": {"data_type": "bigint", "nullable": True},
    "land_value": {"data_type": "double", "nullable": True},
    "land_unit_code": {"data_type": "bigint", "nullable": True},
    "land_unit_count": {"data_type": "double", "nullable": True},
    "land_sqft": {"data_type": "double", "nullable": True},
    "date_last_inspection": {"data_type": "bigint", "nullable": True},
    "improvement_quality": {"data_type": "text", "nullable": True},
    "construction_class": {"data_type": "bigint", "nullable": True},
    "effective_year_built": {"data_type": "bigint", "nullable": True},
    "actual_year_built": {"data_type": "bigint", "nullable": True},
    "living_area_sqft": {"data_type": "double", "nullable": True},
    "building_count": {"data_type": "bigint", "nullable": True},
    "residential_unit_count": {"data_type": "bigint", "nullable": True},
    "special_feature_value": {"data_type": "double", "nullable": True},
    "multi_parcel_sale_1": {"data_type": "text", "nullable": True},
    "qual_cd1": {"data_type": "text", "nullable": True},
    "vi_cd1": {"data_type": "text", "nullable": True},
    "sale_prc1": {"data_type": "double", "nullable": True},
    "sale_yr1": {"data_type": "bigint", "nullable": True},
    "sale_mo1": {"data_type": "bigint", "nullable": True},
    "or_book_1": {"data_type": "text", "nullable": True},
    "or_page_1": {"data_type": "text", "nullable": True},
    "clerk_no_1": {"data_type": "text", "nullable": True},
    "sale_change_code_1": {"data_type": "bigint", "nullable": True},
    "multi_parcel_sale_2": {"data_type": "text", "nullable": True},
    "qual_cd2": {"data_type": "text", "nullable": True},
    "vi_cd2": {"data_type": "text", "nullable": True},
    "sale_prc2": {"data_type": "double", "nullable": True},
    "sale_yr2": {"data_type": "bigint", "nullable": True},
    "sale_mo2": {"data_type": "bigint", "nullable": True},
    "or_book_2": {"data_type": "text", "nullable": True},
    "or_page_2": {"data_type": "text", "nullable": True},
    "clerk_no_2": {"data_type": "text", "nullable": True},
    "sale_change_code_2": {"data_type": "bigint", "nullable": True},
    "legal_description": {"data_type": "text", "nullable": True},
    "homestead_applicant_status": {"data_type": "text", "nullable": True},
    "homestead_co_applicant_status": {"data_type": "text", "nullable": True},
    "market_area": {"data_type": "text", "nullable": True},
    "neighborhood_code": {"data_type": "text", "nullable": True},
    "public_land_flag": {"data_type": "text", "nullable": True},
    "tax_authority_code": {"data_type": "text", "nullable": True},
    "township": {"data_type": "text", "nullable": True},
    "range_code": {"data_type": "text", "nullable": True},
    "section_code": {"data_type": "text", "nullable": True},
    "census_block_group": {"data_type": "text", "nullable": True},
    "phy_addr1": {"data_type": "text", "nullable": True},
    "phy_addr2": {"data_type": "text", "nullable": True},
    "phy_city": {"data_type": "text", "nullable": True},
    "phy_zipcd": {"data_type": "text", "nullable": True},
    "alternate_key": {"data_type": "text", "nullable": True},
    "assessment_transfer_flag": {"data_type": "text", "nullable": True},
    "prev_homestead_owners": {"data_type": "bigint", "nullable": True},
    "assessment_diff_transferred": {"data_type": "double", "nullable": True},
    "prev_homestead_county_no": {"data_type": "bigint", "nullable": True},
    "prev_homestead_parcel_id": {"data_type": "text", "nullable": True},
    "year_value_transferred": {"data_type": "bigint", "nullable": True},
    "file_sequence_no": {"data_type": "bigint", "nullable": True},
    "real_property_submission_id": {"data_type": "text", "nullable": True},
    "master_parcel_id": {"data_type": "text", "nullable": True},
    "state_parcel_id": {"data_type": "text", "nullable": True},
    "special_circumstances_code": {"data_type": "bigint", "nullable": True},
    "special_circumstances_year": {"data_type": "bigint", "nullable": True},
    "special_circumstances_text": {"data_type": "text", "nullable": True},
}


def _normalize(attr_rows: list[dict]) -> list[dict]:
    """Map verbatim ArcGIS attribute keys -> snake_case, coerce, drop no-PARCEL_ID.
    Identical mapping to collier_parcels._normalize."""
    out: list[dict] = []
    for a in attr_rows:
        pid = a.get("PARCEL_ID")
        if not pid:
            continue
        out.append({
            "parcel_id": str(pid),
            "co_no": _coerce_int(a.get("CO_NO")),
            "file_type": _s(a, "FILE_T"),
            "assessment_year": _coerce_int(a.get("ASMNT_YR")),
            "basic_stratum": _s(a, "BAS_STRT"),
            "active_stratum": _s(a, "ATV_STRT"),
            "group_no": _s(a, "GRP_NO"),
            "dor_uc": _s(a, "DOR_UC"),
            "pa_uc": _s(a, "PA_UC"),
            "special_assessment_code": _s(a, "SPASS_CD"),
            "jv": _coerce_float(a.get("JV")),
            "jv_change": _coerce_float(a.get("JV_CHNG")),
            "jv_change_code": _coerce_int(a.get("JV_CHNG_CD")),
            "av_sd": _coerce_float(a.get("AV_SD")),
            "av_nsd": _coerce_float(a.get("AV_NSD")),
            "tv_sd": _coerce_float(a.get("TV_SD")),
            "tv_nsd": _coerce_float(a.get("TV_NSD")),
            "jv_hmstd": _coerce_float(a.get("JV_HMSTD")),
            "av_hmstd": _coerce_float(a.get("AV_HMSTD")),
            "jv_non_hmstd_resd": _coerce_float(a.get("JV_NON_HMS")),
            "av_non_hmstd_resd": _coerce_float(a.get("AV_NON_HMS")),
            "jv_resd_non_resd": _coerce_float(a.get("JV_RESD_NO")),
            "av_resd_non_resd": _coerce_float(a.get("AV_RESD_NO")),
            "jv_class_use": _coerce_float(a.get("JV_CLASS_U")),
            "av_class_use": _coerce_float(a.get("AV_CLASS_U")),
            "jv_h2o_recharge": _coerce_float(a.get("JV_H2O_REC")),
            "av_h2o_recharge": _coerce_float(a.get("AV_H2O_REC")),
            "jv_conservation": _coerce_float(a.get("JV_CONSRV_")),
            "av_conservation": _coerce_float(a.get("AV_CONSRV_")),
            "jv_hist_commercial": _coerce_float(a.get("JV_HIST_CO")),
            "av_hist_commercial": _coerce_float(a.get("AV_HIST_CO")),
            "jv_hist_significant": _coerce_float(a.get("JV_HIST_SI")),
            "av_hist_significant": _coerce_float(a.get("AV_HIST_SI")),
            "jv_working_waterfront": _coerce_float(a.get("JV_WRKNG_W")),
            "av_working_waterfront": _coerce_float(a.get("AV_WRKNG_W")),
            "new_construction_value": _coerce_float(a.get("NCONST_VAL")),
            "deletion_value": _coerce_float(a.get("DEL_VAL")),
            "parcel_split_code": _coerce_int(a.get("PAR_SPLT")),
            "disaster_code": _coerce_int(a.get("DISTR_CD")),
            "disaster_year": _coerce_int(a.get("DISTR_YR")),
            "land_value": _coerce_float(a.get("LND_VAL")),
            "land_unit_code": _coerce_int(a.get("LND_UNTS_C")),
            "land_unit_count": _coerce_float(a.get("NO_LND_UNT")),
            "land_sqft": _coerce_float(a.get("LND_SQFOOT")),
            "date_last_inspection": _coerce_int(a.get("DT_LAST_IN")),
            "improvement_quality": _s(a, "IMP_QUAL"),
            "construction_class": _coerce_int(a.get("CONST_CLAS")),
            "effective_year_built": _coerce_int(a.get("EFF_YR_BLT")),
            "actual_year_built": _coerce_int(a.get("ACT_YR_BLT")),
            "living_area_sqft": _coerce_float(a.get("TOT_LVG_AR")),
            "building_count": _coerce_int(a.get("NO_BULDNG")),
            "residential_unit_count": _coerce_int(a.get("NO_RES_UNT")),
            "special_feature_value": _coerce_float(a.get("SPEC_FEAT_")),
            "multi_parcel_sale_1": _s(a, "M_PAR_SAL1"),
            "qual_cd1": _s(a, "QUAL_CD1"),
            "vi_cd1": _s(a, "VI_CD1"),
            "sale_prc1": _coerce_float(a.get("SALE_PRC1")),
            "sale_yr1": _coerce_int(a.get("SALE_YR1")),
            "sale_mo1": _coerce_int(a.get("SALE_MO1")),
            "or_book_1": _s(a, "OR_BOOK1"),
            "or_page_1": _s(a, "OR_PAGE1"),
            "clerk_no_1": _s(a, "CLERK_NO1"),
            "sale_change_code_1": _coerce_int(a.get("S_CHNG_CD1")),
            "multi_parcel_sale_2": _s(a, "M_PAR_SAL2"),
            "qual_cd2": _s(a, "QUAL_CD2"),
            "vi_cd2": _s(a, "VI_CD2"),
            "sale_prc2": _coerce_float(a.get("SALE_PRC2")),
            "sale_yr2": _coerce_int(a.get("SALE_YR2")),
            "sale_mo2": _coerce_int(a.get("SALE_MO2")),
            "or_book_2": _s(a, "OR_BOOK2"),
            "or_page_2": _s(a, "OR_PAGE2"),
            "clerk_no_2": _s(a, "CLERK_NO2"),
            "sale_change_code_2": _coerce_int(a.get("S_CHNG_CD2")),
            "legal_description": _s(a, "S_LEGAL"),
            "homestead_applicant_status": _s(a, "APP_STAT"),
            "homestead_co_applicant_status": _s(a, "CO_APP_STA"),
            "market_area": _s(a, "MKT_AR"),
            "neighborhood_code": _s(a, "NBRHD_CD"),
            "public_land_flag": _s(a, "PUBLIC_LND"),
            "tax_authority_code": _s(a, "TAX_AUTH_C"),
            "township": _s(a, "TWN"),
            "range_code": _s(a, "RNG"),
            "section_code": _s(a, "SEC"),
            "census_block_group": _s(a, "CENSUS_BK"),
            "phy_addr1": _s(a, "PHY_ADDR1"),
            "phy_addr2": _s(a, "PHY_ADDR2"),
            "phy_city": _s(a, "PHY_CITY"),
            "phy_zipcd": _s(a, "PHY_ZIPCD"),
            "alternate_key": _s(a, "ALT_KEY"),
            "assessment_transfer_flag": _s(a, "ASS_TRNSFR"),
            "prev_homestead_owners": _coerce_int(a.get("PREV_HMSTD")),
            "assessment_diff_transferred": _coerce_float(a.get("ASS_DIF_TR")),
            "prev_homestead_county_no": _coerce_int(a.get("CONO_PRV_H")),
            "prev_homestead_parcel_id": _s(a, "PARCEL_ID_"),
            "year_value_transferred": _coerce_int(a.get("YR_VAL_TRN")),
            "file_sequence_no": _coerce_int(a.get("SEQ_NO")),
            "real_property_submission_id": _s(a, "RS_ID"),
            "master_parcel_id": _s(a, "MP_ID"),
            "state_parcel_id": _s(a, "STATE_PAR_"),
            "special_circumstances_code": _coerce_int(a.get("SPC_CIR_CD")),
            "special_circumstances_year": _coerce_int(a.get("SPC_CIR_YR")),
            "special_circumstances_text": _s(a, "SPC_CIR_TX"),
        })
    return out


def _make_resource(chunk: list[dict]):
    """Zero-arg dlt resource factory — same closure pattern as collier_parcels."""
    import dlt

    @dlt.resource(
        table_name="lee_parcels",
        write_disposition="merge",
        primary_key="parcel_id",
        columns=_TIER2_COLUMNS,
    )
    def lee_parcel_rows():
        yield from chunk

    return lee_parcel_rows


def _promote_to_tier2(rows: list[dict], chunk_size: int = 5_000) -> None:
    """Chunked merge into data_lake.lee_parcels — same retry/backoff shape as
    collier_parcels (a single transient connection timeout must not kill a
    ~20-minute run; merge is idempotent on parcel_id so a retried chunk is safe)."""
    import dlt

    pipeline = dlt.pipeline(
        pipeline_name="lee_parcels",
        destination="postgres",
        dataset_name="data_lake",
    )
    total = len(rows)
    n_chunks = (total + chunk_size - 1) // chunk_size
    for i in range(0, total, chunk_size):
        chunk = rows[i : i + chunk_size]
        last_exc: Exception | None = None
        for attempt in range(4):
            try:
                load_info = pipeline.run(_make_resource(chunk)())
                load_info.raise_on_failed_jobs()
                last_exc = None
                break
            except Exception as exc:  # noqa: BLE001 — transient DB/connection errors
                last_exc = exc
                if attempt < 3:
                    backoff = 2**attempt * 5
                    print(
                        f"  lee_parcels chunk {i // chunk_size + 1}/{n_chunks} "
                        f"attempt {attempt + 1} failed ({type(exc).__name__}); retrying in {backoff}s"
                    )
                    time.sleep(backoff)
        if last_exc is not None:
            raise last_exc
        print(f"  lee_parcels chunk {i // chunk_size + 1}/{n_chunks} ({len(chunk)} rows)")


_OID_BATCH_SIZE = 250  # matches parcel_subdivision's proven ceiling for this layer
SKIPPED_OBJECT_IDS: list[int] = []  # audit trail — every OBJECTID that was unservable


def _fetch_all_object_ids() -> list[int]:
    """All of Lee's OBJECTIDs via `returnIdsOnly=true`.

    collier_parcels' OBJECTID-keyset (`where=... AND OBJECTID>N` + orderByFields +
    resultRecordCount) works for CO_NO=21 but soft-400s on CO_NO=46 — verified live
    07/18/2026: `{"error": {"code": 400, "message": "Cannot perform query. Invalid
    query parameters."}}` in a 200-body response, on the very first page. This is
    the SAME per-county quirk ingest/pipelines/parcel_subdivision/resources.py
    already documented and solved for Lee — reusing its proven returnIdsOnly +
    objectIds pattern here instead of collier_parcels' keyset approach.
    """
    resp = requests.get(
        LEE_CADASTRAL_URL,
        params={"where": LEE_CO_NO_WHERE, "returnIdsOnly": "true", "f": "json"},
        timeout=60,
    )
    resp.raise_for_status()
    body = resp.json()
    if "objectIds" not in body:
        raise RuntimeError(f"lee_parcels returnIdsOnly failed: {body.get('error', body)}")
    return sorted(int(x) for x in (body["objectIds"] or []))


def _fetch_object_id_batch(oids: list[int]) -> list[dict]:
    """Fetch a batch of parcels by explicit `objectIds` (no where/orderBy/
    resultRecordCount — the shape that 400s on this layer for Lee). Same adaptive
    halve-on-failure behavior as parcel_subdivision._fetch_object_id_batch: a
    multi-id batch that soft-400s or times out gets split in half and retried;
    a lone id that still fails is logged + skipped (soft-400) or re-raised
    (transport/5xx — a real row must never be silently dropped)."""
    if not oids:
        return []
    lone = len(oids) == 1
    try:
        resp = requests.post(
            LEE_CADASTRAL_URL,
            data={
                "objectIds": ",".join(map(str, oids)),
                "outFields": OUT_FIELDS,
                "returnGeometry": "false",
                "f": "json",
            },
            timeout=120,
        )
        resp.raise_for_status()
        body = resp.json()
        reason = body.get("error")
    except Exception as exc:  # noqa: BLE001 — transport/5xx, handled below
        if lone:
            raise
        reason = f"transport/5xx: {exc}"
        body = None

    if body is not None and reason is None:
        return body.get("features", [])
    if lone:
        SKIPPED_OBJECT_IDS.append(oids[0])
        print(f"  lee_parcels: OBJECTID {oids[0]} unservable even alone — skipped: {reason}")
        return []
    mid = len(oids) // 2
    print(f"  lee_parcels: objectIds batch of {len(oids)} failed ({reason}) — splitting")
    return _fetch_object_id_batch(oids[:mid]) + _fetch_object_id_batch(oids[mid:])


def _iter_lee_attrs(batch_size: int = _OID_BATCH_SIZE):
    """Retrieve every Lee parcel: one returnIdsOnly call for the full OBJECTID
    list, then fetch in batches by objectIds."""
    oids = _fetch_all_object_ids()
    total_batches = (len(oids) + batch_size - 1) // batch_size
    for n, i in enumerate(range(0, len(oids), batch_size), start=1):
        if n % 20 == 0:
            print(f"  lee_parcels: objectIds batch {n}/{total_batches}")
        for feat in _fetch_object_id_batch(oids[i : i + batch_size]):
            yield feat.get("attributes", feat)


def fetch_lee_parcels() -> list[dict]:
    """Fetch all Lee (CO_NO=46) parcels via returnIdsOnly + objectIds batching, normalized."""
    rows = _normalize(list(_iter_lee_attrs()))
    if SKIPPED_OBJECT_IDS:
        print(
            f"lee_parcels: WARNING — {len(SKIPPED_OBJECT_IDS)} OBJECTID(s) "
            f"unqueryable on the source layer, skipped: {SKIPPED_OBJECT_IDS}"
        )
        SKIPPED_OBJECT_IDS.clear()
    return rows


def ingest_lee_parcels() -> int:
    """Pull Lee parcels from the FDOR cadastral and promote to Tier 2."""
    canonical = arcgis_count(LEE_CADASTRAL_URL, where=LEE_CO_NO_WHERE)
    rows = fetch_lee_parcels()
    if not rows:
        print("lee_parcels: 0 rows — aborting Tier 2 promotion")
        return 0
    assert_vs_canonical(len(rows), canonical, label="lee parcels")
    _promote_to_tier2(rows)
    print(f"lee_parcels: merged {len(rows)} parcels into data_lake.lee_parcels")
    return len(rows)
