from unittest.mock import patch, MagicMock

FAKE_FEATURE = {"type": "Feature", "geometry": None, "properties": {"OBJECTID": 1}}
FAKE_CLAIM   = {"claimId": "1", "countyCode": "12071", "buildingDamageAmount": "5000"}


class TestIngestNfhlLayer:
    def test_uploads_to_geometry_bucket(self):
        from ingest.pipelines.fema.resources import ingest_nfhl_layer
        layer = {"name": "flood_zones", "url": "https://hazards.fema.gov/..."}
        with patch("ingest.pipelines.fema.resources.paginate_arcgis", return_value=iter([FAKE_FEATURE])), \
             patch("ingest.pipelines.fema.resources.upload_geojson_gz") as mock_upload, \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer"):
            ingest_nfhl_layer(MagicMock(), layer)
        assert mock_upload.call_args[0][0] == "raw-geometry"

    def test_object_path_contains_layer_name_and_date(self):
        from ingest.pipelines.fema.resources import ingest_nfhl_layer
        layer = {"name": "lomr", "url": "https://hazards.fema.gov/..."}
        with patch("ingest.pipelines.fema.resources.paginate_arcgis", return_value=iter([FAKE_FEATURE])), \
             patch("ingest.pipelines.fema.resources.upload_geojson_gz") as mock_upload, \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer"):
            ingest_nfhl_layer(MagicMock(), layer)
        path = mock_upload.call_args[0][1]
        assert "lomr" in path and path.endswith(".geojson.gz")

    def test_writes_tier1_pointer_with_correct_table_name(self):
        from ingest.pipelines.fema.resources import ingest_nfhl_layer
        layer = {"name": "bfe", "url": "https://hazards.fema.gov/..."}
        mock_pipeline = MagicMock()
        with patch("ingest.pipelines.fema.resources.paginate_arcgis", return_value=iter([FAKE_FEATURE])), \
             patch("ingest.pipelines.fema.resources.upload_geojson_gz"), \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer") as mock_ptr:
            ingest_nfhl_layer(mock_pipeline, layer)
        assert mock_ptr.call_args[0][1] == "fema_bfe"


class TestIngestNfipClaims:
    def test_uploads_csv_gz_to_tabular_cold(self):
        from ingest.pipelines.fema.resources import ingest_nfip_claims
        with patch("requests.get", return_value=MagicMock(json=lambda: {"value": [FAKE_CLAIM]}, raise_for_status=MagicMock())), \
             patch("ingest.pipelines.fema.resources.upload_csv_gz") as mock_upload, \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer"):
            ingest_nfip_claims(MagicMock())
        assert mock_upload.call_args[0][0] == "raw-tabular-cold"
        assert "nfip_claims" in mock_upload.call_args[0][1]

    def test_skips_when_no_claims(self):
        from ingest.pipelines.fema.resources import ingest_nfip_claims
        with patch("requests.get", return_value=MagicMock(json=lambda: {"value": []}, raise_for_status=MagicMock())), \
             patch("ingest.pipelines.fema.resources.upload_csv_gz") as mock_upload, \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer"):
            ingest_nfip_claims(MagicMock())
        assert not mock_upload.called
