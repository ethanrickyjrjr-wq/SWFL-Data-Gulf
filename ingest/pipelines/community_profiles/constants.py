TABLE_NAME = "community_profiles"
SCHEMA = "data_lake"
HOA_COMPARISON_URL = "https://realtyofnaplesfl.com/hoa-fee-comparison-by-community/"


def naplesgolfguy_url(slug: str) -> str:
    return f"https://naplesgolfguy.com/golf-communities/{slug}/"


def fiftyfive_places_url(slug: str) -> str:
    return f"https://www.55places.com/florida/communities/{slug}"
