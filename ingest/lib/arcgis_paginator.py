import time
import requests


def paginate_arcgis(base_url, where="1=1", out_fields="*", bbox=None, page_size=2000):
    """Sync generator. Yields GeoJSON Feature dicts. Retries 3x on 5xx."""
    params = {
        "where": where,
        "outFields": out_fields,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "f": "geojson",
        "resultRecordCount": page_size,
    }
    if bbox is not None:
        params["geometry"] = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"

    offset = 0
    while True:
        params["resultOffset"] = offset
        resp = None
        for attempt in range(3):
            try:
                resp = requests.get(base_url, params=params, timeout=60)
                if resp.status_code >= 500 and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)

        data = resp.json()
        features = data.get("features", [])
        if not features:
            break
        yield from features
        if not data.get("exceededTransferLimit", False):
            break
        offset += len(features)


def paginate_arcgis_tabular(base_url, where="1=1", out_fields="*", page_size=2000):
    """Sync generator. Yields plain attribute dicts (no geometry). Retries 3x on 5xx.

    Use for ArcGIS MapServer layers consumed for their attribute table only.
    f=json (not geojson) → features[].attributes contains the row dict;
    returnGeometry=false drops the SHAPE field server-side to save bytes."""
    params = {
        "where": where,
        "outFields": out_fields,
        "f": "json",
        "returnGeometry": "false",
        "resultRecordCount": page_size,
    }

    offset = 0
    while True:
        params["resultOffset"] = offset
        resp = None
        for attempt in range(3):
            try:
                resp = requests.get(base_url, params=params, timeout=60)
                if resp.status_code >= 500 and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)

        data = resp.json()
        features = data.get("features", [])
        if not features:
            break
        for feat in features:
            yield feat.get("attributes", {})
        if not data.get("exceededTransferLimit", False):
            break
        offset += len(features)


def paginate_arcgis_keyset(
    base_url,
    where="1=1",
    out_fields="*",
    page_size=1000,
    oid_field="OBJECTID",
    geometry=True,
    pause=0.15,
):
    """Sync generator over a LARGE ArcGIS layer, keyed on OBJECTID. Yields GeoJSON Features.

    Why not `paginate_arcgis` (resultOffset)? On big layers the offset walk silently
    TRUNCATES: LeePA layer 12 (~548k) stopped at 40,000 because the server quit
    reporting `exceededTransferLimit`. Keysetting on OBJECTID (where OID > last,
    ordered ascending) has no offset ceiling and fetched the full 548,325.

    Also note the server may cap a page BELOW the requested page_size (LeePA's
    maxRecordCount is 1000), so a short page is NOT the last page — we stop only when
    OBJECTID stops advancing. `pause` throttles us so we stay welcome at the source.
    """
    last_oid = -1
    while True:
        params = {
            "where": f"({where}) AND {oid_field}>{last_oid}",
            "outFields": out_fields if out_fields == "*" else f"{out_fields},{oid_field}",
            "orderByFields": f"{oid_field} ASC",
            "returnGeometry": "true" if geometry else "false",
            "outSR": "4326",
            "f": "geojson" if geometry else "json",
            "resultRecordCount": page_size,
        }
        data = None
        for attempt in range(3):
            try:
                resp = requests.get(base_url, params=params, timeout=120)
                if resp.status_code >= 500 and attempt < 2:
                    time.sleep(2**attempt)
                    continue
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2**attempt)

        features = (data or {}).get("features", [])
        if not features:
            break
        max_oid = last_oid
        for ft in features:
            props = ft.get("properties") if geometry else ft.get("attributes")
            oid = (props or {}).get(oid_field)
            if isinstance(oid, int) and oid > max_oid:
                max_oid = oid
            yield ft
        # Stop only on no forward progress — never on a short page.
        if max_oid == last_oid:
            break
        last_oid = max_oid
        if pause:
            time.sleep(pause)


def arcgis_count(base_url, where="1=1"):
    """Return the canonical row count for an ArcGIS layer via returnCountOnly=true.
    Used as a fail-fast gate: compare to actual paginated rows to detect dropped pages."""
    resp = requests.get(
        base_url,
        params={"where": where, "returnCountOnly": "true", "f": "json"},
        timeout=60,
    )
    resp.raise_for_status()
    return int(resp.json().get("count", 0))
