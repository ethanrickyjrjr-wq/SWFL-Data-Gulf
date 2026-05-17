from unittest.mock import patch, MagicMock

FAKE_PARCEL = {"type": "Feature", "geometry": None, "properties": {"STRAP": "01-42-24-01-00001.0000"}}


class TestIngestLeepaParces:
    def test_uploads_to_tabular_cold(self):
        from ingest.pipelines.leepa.resources import ingest_leepa_parcels
        with patch("ingest.pipelines.leepa.resources.paginate_arcgis", return_value=iter([FAKE_PARCEL])), \
             patch("ingest.pipelines.leepa.resources.upload_geojson_gz") as mock_upload, \
             patch("ingest.pipelines.leepa.resources.write_tier1_pointer"):
            ingest_leepa_parcels(MagicMock())
        assert mock_upload.call_args[0][0] == "raw-tabular-cold"

    def test_object_path_pattern(self):
        from ingest.pipelines.leepa.resources import ingest_leepa_parcels
        with patch("ingest.pipelines.leepa.resources.paginate_arcgis", return_value=iter([FAKE_PARCEL])), \
             patch("ingest.pipelines.leepa.resources.upload_geojson_gz") as mock_upload, \
             patch("ingest.pipelines.leepa.resources.write_tier1_pointer"):
            ingest_leepa_parcels(MagicMock())
        path = mock_upload.call_args[0][1]
        assert "leepa/parcels/" in path and path.endswith(".geojson.gz")

    def test_writes_tier1_pointer(self):
        from ingest.pipelines.leepa.resources import ingest_leepa_parcels
        with patch("ingest.pipelines.leepa.resources.paginate_arcgis", return_value=iter([FAKE_PARCEL])), \
             patch("ingest.pipelines.leepa.resources.upload_geojson_gz"), \
             patch("ingest.pipelines.leepa.resources.write_tier1_pointer") as mock_ptr:
            ingest_leepa_parcels(MagicMock())
        assert mock_ptr.call_args[0][1] == "leepa_parcels"

    def test_no_bbox_filter(self):
        from ingest.pipelines.leepa.resources import ingest_leepa_parcels
        with patch("ingest.pipelines.leepa.resources.paginate_arcgis", return_value=iter([FAKE_PARCEL])) as mock_pag, \
             patch("ingest.pipelines.leepa.resources.upload_geojson_gz"), \
             patch("ingest.pipelines.leepa.resources.write_tier1_pointer"):
            ingest_leepa_parcels(MagicMock())
        # LeePA is already Lee County — no bbox arg passed
        call_kwargs = mock_pag.call_args[1] if mock_pag.call_args else {}
        assert "bbox" not in call_kwargs
