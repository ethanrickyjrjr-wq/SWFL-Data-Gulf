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
