from datetime import date
from unittest.mock import patch

import pytest


def test_dry_run_fetches_but_never_touches_db_or_llm():
    lee = [{"OBJECTID": 1, "STRAP": "S1", "BuildingKey": 10, "SubCondoName": "BAYPOINT CONDO",
            "StreetAddress": "35 BLUEBILL AVE", "PostalCity": "NAPLES", "PostalCode": "34108",
            "ResidentialUnits": 20, "MaxStories": 4.0, "ActualYearBuilt": 1987}]
    collier = [{"OBJECTID": 1, "PermitNumber": "PL20230003897", "ApplicationName": "Baypoint B",
                "AssociationName": "BAYPOINT, A CONDO", "Application_Status": "Milestone Completed",
                "ApplicationStatus": "Cycle Completed", "NextMilestoneInspectionYear": 2034,
                "PermitLocation": "35 Bluebill AVE B,  (BLDG) , Naples", "SiteAddressID": 1}]
    pdf = ("January 2026", [{"permit_number": "PL20230003897", "pdf_text": "x",
                             "co_date": date(1987, 1, 1), "next_milestone_due": date(2034, 1, 1)}])

    with patch("ingest.pipelines.condo_baseline_swfl.pipeline.fetch_lee_buildings", return_value=lee), \
         patch("ingest.pipelines.condo_baseline_swfl.pipeline.fetch_collier_milestone", return_value=collier), \
         patch("ingest.pipelines.condo_baseline_swfl.pipeline.fetch_collier_pdf_rows", return_value=pdf), \
         patch("ingest.pipelines.condo_baseline_swfl.pipeline.get_db_conn") as mock_conn, \
         patch("ingest.lib.local_llm.make_clients") as mock_llm:
        from ingest.pipelines.condo_baseline_swfl.pipeline import main

        result = main(["--dry-run"])

    assert result == 0
    mock_conn.assert_not_called()
    mock_llm.assert_not_called()


def test_dry_run_refuses_half_joined_collier_pdf():
    """A PDF that no longer joins the service must fail loud, not write a baseline."""
    collier = [{"OBJECTID": 1, "PermitNumber": "PL20230003897", "AssociationName": "X",
                "ApplicationStatus": "Not Due", "PermitLocation": "1 A St, Naples"}]
    pdf = ("January 2026", [{"permit_number": "PL99999999999", "pdf_text": "", "co_date": None,
                             "next_milestone_due": None}])
    with patch("ingest.pipelines.condo_baseline_swfl.pipeline.fetch_lee_buildings", return_value=[]), \
         patch("ingest.pipelines.condo_baseline_swfl.pipeline.fetch_collier_milestone", return_value=collier), \
         patch("ingest.pipelines.condo_baseline_swfl.pipeline.fetch_collier_pdf_rows", return_value=pdf):
        from ingest.pipelines.condo_baseline_swfl.pipeline import main

        with pytest.raises(RuntimeError, match="join rate"):
            main(["--dry-run"])
