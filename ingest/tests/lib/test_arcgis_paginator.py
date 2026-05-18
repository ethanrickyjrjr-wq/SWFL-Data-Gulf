from unittest.mock import patch, MagicMock

FAKE_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
F1 = {"type": "Feature", "geometry": None, "properties": {"id": 1}}
F2 = {"type": "Feature", "geometry": None, "properties": {"id": 2}}


def _resp(features, status=200):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = {"features": features}
    r.raise_for_status = MagicMock()
    return r


class TestPaginateArcgis:
    def test_yields_features_single_page(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", return_value=_resp([F1, F2])):
            results = list(paginate_arcgis(FAKE_URL))
        assert results == [F1, F2]

    def test_stops_on_empty_page(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", side_effect=[_resp([F1, F2]), _resp([])]):
            results = list(paginate_arcgis(FAKE_URL, page_size=2))
        assert len(results) == 2

    def test_paginates_multiple_full_pages(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", side_effect=[_resp([F1, F2]), _resp([F1])]):
            results = list(paginate_arcgis(FAKE_URL, page_size=2))
        assert len(results) == 3

    def test_includes_bbox_in_params(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", return_value=_resp([])) as mock_get:
            list(paginate_arcgis(FAKE_URL, bbox=(-87.6, 24.4, -79.9, 31.0)))
        params = mock_get.call_args[1]["params"]
        assert "geometry" in params

    def test_omits_geometry_without_bbox(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", return_value=_resp([])) as mock_get:
            list(paginate_arcgis(FAKE_URL))
        params = mock_get.call_args[1]["params"]
        assert "geometry" not in params

    def test_retries_on_500(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        err_resp = MagicMock(status_code=500)
        err_resp.raise_for_status.side_effect = Exception("500")
        with patch("requests.get", side_effect=[err_resp, err_resp, _resp([])]):
            with patch("time.sleep"):
                list(paginate_arcgis(FAKE_URL))
        # No exception = retried successfully on 3rd attempt


# Tabular response shape — f=json&returnGeometry=false yields features[].attributes (no geometry).
ATTR1 = {"attributes": {"FOLIOID": "01-42-24-01-00001.0000", "Just": 150000}}
ATTR2 = {"attributes": {"FOLIOID": "01-42-24-01-00002.0000", "Just": 220000}}


def _attr_resp(features, exceeded=False, status=200):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = {"features": features, "exceededTransferLimit": exceeded}
    r.raise_for_status = MagicMock()
    return r


class TestPaginateArcgisTabular:
    def test_yields_attribute_dicts_not_features(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis_tabular
        with patch("requests.get", return_value=_attr_resp([ATTR1, ATTR2])):
            results = list(paginate_arcgis_tabular(FAKE_URL))
        assert results == [ATTR1["attributes"], ATTR2["attributes"]]
        # Bare attribute dicts have no "attributes" or "geometry" keys.
        for r in results:
            assert "attributes" not in r
            assert "geometry" not in r

    def test_requests_no_geometry_in_params(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis_tabular
        with patch("requests.get", return_value=_attr_resp([])) as mock_get:
            list(paginate_arcgis_tabular(FAKE_URL))
        params = mock_get.call_args[1]["params"]
        assert params["f"] == "json"
        assert params["returnGeometry"] == "false"

    def test_stops_when_exceeded_transfer_limit_false(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis_tabular
        with patch("requests.get", side_effect=[_attr_resp([ATTR1], exceeded=False)]):
            results = list(paginate_arcgis_tabular(FAKE_URL, page_size=1))
        assert len(results) == 1

    def test_continues_when_exceeded_transfer_limit_true(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis_tabular
        with patch("requests.get", side_effect=[
            _attr_resp([ATTR1], exceeded=True),
            _attr_resp([ATTR2], exceeded=False),
        ]):
            results = list(paginate_arcgis_tabular(FAKE_URL, page_size=1))
        assert len(results) == 2


class TestArcgisCount:
    def test_returns_canonical_count(self):
        from ingest.lib.arcgis_paginator import arcgis_count
        resp = MagicMock(status_code=200)
        resp.json.return_value = {"count": 423817}
        resp.raise_for_status = MagicMock()
        with patch("requests.get", return_value=resp):
            n = arcgis_count(FAKE_URL)
        assert n == 423817

    def test_passes_returncountonly_param(self):
        from ingest.lib.arcgis_paginator import arcgis_count
        resp = MagicMock(status_code=200)
        resp.json.return_value = {"count": 0}
        resp.raise_for_status = MagicMock()
        with patch("requests.get", return_value=resp) as mock_get:
            arcgis_count(FAKE_URL, where="COUNTY='LEE'")
        params = mock_get.call_args[1]["params"]
        assert params["returnCountOnly"] == "true"
        assert params["where"] == "COUNTY='LEE'"
        assert params["f"] == "json"
