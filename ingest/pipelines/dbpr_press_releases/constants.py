"""DBPR Press Releases ingest — constants."""

BASE_URL = "https://www2.myfloridalicense.com/press-releases/"
PAGE_URL = "https://www2.myfloridalicense.com/press-releases/page/{n}/"

# Weekly cron: pages 1-2 (buffer for tight publishing cadences).
# Backfill: --backfill crawls all 30 pages.
DEFAULT_PAGES = 2
BACKFILL_PAGES = 30

TABLE = "dbpr_press_releases"
TIER1_BUCKET = "lake-tier1"
TIER1_PREFIX = "news/dbpr"

# Slugs on www2.myfloridalicense.com that are site chrome, NOT articles.
# Article URLs have longer descriptive slugs; nav slugs are short/known.
NAV_SLUGS = frozenset({
    "press-releases",
    "news-room",
    "contact-us",
    "licensing-and-regulation",
    "online-services",
    "about-us",
    "departments-secretary",
    "department-overview",
    "department-divisions",
    "annual-regulatory-plans",
    "reports-and-publications",
    "open-government",
    "disclaimer",
    "accessibility",
    "privacy-policy",
    "emergency",
    "mobile-app",
    "alcoholic-beverages-and-tobacco",
    # Additional nav/chrome pages not covered by length filter
    "office-status",
    "abt",
    "datamart",
    "news-room",
    "media-room",
    "hurricane-resources",
    "disaster-contractors-network",
})

# SWFL counties / cities — used for is_swfl_relevant quick-check in parser
# (enricher does the authoritative LLM check; this is a fast pre-filter)
SWFL_TERMS = (
    "lee county", "lee co.", "collier county", "collier co.",
    "charlotte county", "sarasota county", "hendry county",
    "fort myers", "cape coral", "bonita springs", "estero",
    "naples", "marco island", "punta gorda", "port charlotte",
    "north port", "venice", "sarasota",
)

# Anthropic model for enrichment step
ENRICH_MODEL = "claude-sonnet-4-6"
ENRICH_BATCH_SIZE = 10  # rows per run (keeps latency predictable on weekly cron)
