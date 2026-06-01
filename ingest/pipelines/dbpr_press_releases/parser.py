"""Parse DBPR press-release listing-page markdown into article rows.

The listing page renders full article bodies inline — no per-article scrape needed.
Each article block starts with a `[Title](https://www2.myfloridalicense.com/slug/)` link
followed by a `**Month DD, YYYY**` date line, then the full body text up to a
`###` separator or the "Stay Social" footer.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any

from .constants import NAV_SLUGS

# ── Regex patterns ────────────────────────────────────────────────────────────

# Article listing link: on-domain slug that is NOT a nav page.
# Minimum slug length 12 to skip short nav-like paths.
_ARTICLE_LINK = re.compile(
    r"\[([^\]]+)\]\((https://www2\.myfloridalicense\.com/([a-z0-9][a-z0-9-]{11,})/)\)"
)

# Bold date header inside an article block: **Month DD, YYYY**
_BOLD_DATE = re.compile(
    r"\*\*\s*(January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+(\d{1,2}),\s+(\d{4})\s*\*\*",
    re.IGNORECASE,
)

# Footer date used in ALL articles (new and old format): "Month DD, YYYY/"
# Appears as "January 29, 2026/ [1]..." or "December 15, 2021/ [Like]..."
_FOOTER_DATE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+(\d{1,2}),\s+(\d{4})\s*/",
    re.IGNORECASE,
)

# Inline release date in old table-format: "For Immediate Release<br>Month DD, YYYY"
_TABLE_DATE = re.compile(
    r"For\s+Immediate\s+Release[^<\n]*(?:<br>|\n)\s*"
    r"(January|February|March|April|May|June|July|August|September|"
    r"October|November|December)\s+(\d{1,2}),\s+(\d{4})",
    re.IGNORECASE,
)

_MONTH_MAP: dict[str, int] = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

# Body end: ### horizontal rule or social-links footer
_BODY_END = re.compile(r"\n###\s*\n|\nStay Social", re.IGNORECASE)

# Image lines and social/icon markdown — strip from body
_IMAGE_LINE = re.compile(r"!\[[^\]]*\]\([^)]*\)\n?")
_SOCIAL_LINK = re.compile(r"\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\n?")

Row = dict[str, Any]


def _slug_of(url: str) -> str:
    m = re.search(r"myfloridalicense\.com/([^/?#]+)", url)
    return m.group(1).rstrip("/").lower() if m else ""


def _clean(text: str) -> str:
    text = _IMAGE_LINE.sub("", text)
    text = _SOCIAL_LINK.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _parse_date(month_str: str, day_str: str, year_str: str) -> date | None:
    month = _MONTH_MAP.get(month_str.lower())
    if not month:
        return None
    try:
        return date(int(year_str), month, int(day_str))
    except ValueError:
        return None


def parse_listing_page(markdown: str) -> list[Row]:
    """Parse one listing-page markdown string into a list of article rows.

    Returns rows with: source_url, title, published_date, body_text, scraped_at.
    The enricher later fills: summary, topics, affected_industries,
    geographic_mentions, is_swfl_relevant.
    """
    text = markdown.replace("\r\n", "\n")
    now_iso = datetime.now(timezone.utc).isoformat()

    # Collect all article link positions (deduplicated by URL — the same slug can
    # appear multiple times in the HTML if linked from heading + listing chrome).
    seen_urls: set[str] = set()
    article_positions: list[tuple[int, str, str]] = []  # (pos, url, title)

    for m in _ARTICLE_LINK.finditer(text):
        slug = _slug_of(m.group(2))
        if slug in NAV_SLUGS:
            continue
        url = m.group(2)
        if url in seen_urls:
            continue
        seen_urls.add(url)
        article_positions.append((m.start(), url, m.group(1).strip()))

    rows: list[Row] = []

    for i, (pos, url, link_title) in enumerate(article_positions):
        # Article body runs from this link position to the next article link (or EOF)
        end_pos = article_positions[i + 1][0] if i + 1 < len(article_positions) else len(text)
        block = text[pos:end_pos]

        # Published date — try bold header first (new format), then table format,
        # then footer date (present in ALL articles as "Month DD, YYYY/")
        pub_date: date | None = None
        dm = _BOLD_DATE.search(block)
        if not dm:
            dm = _TABLE_DATE.search(block)
        if not dm:
            dm = _FOOTER_DATE.search(block)
        if dm:
            pub_date = _parse_date(dm.group(1), dm.group(2), dm.group(3))

        # Body — content between the date line and the ### separator / Stay Social
        body_start = dm.end() if dm else 0
        body_block = block[body_start:]
        em = _BODY_END.search(body_block)
        body_raw = body_block[: em.start()] if em else body_block
        body_text = _clean(body_raw)

        # Title — prefer the H2 heading inside the block over the listing link text
        h2 = re.search(r"^##\s+\*{0,2}([^\n*]+?)\*{0,2}\s*$", block, re.MULTILINE)
        title = h2.group(1).strip() if h2 else link_title

        if not body_text and not pub_date:
            continue

        rows.append({
            "source_url": url,
            "title": title,
            "published_date": pub_date.isoformat() if pub_date else None,
            "body_text": body_text or None,
            "scraped_at": now_iso,
        })

    return rows
