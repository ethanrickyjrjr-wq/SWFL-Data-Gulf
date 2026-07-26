"""Listing-extraction regressions behind the 06/22-07/26/2026 govt-source outage.

The dead sources hid two parse traps: collier.gov's card markup nests an image
inside every article link (LINK_RE captured the IMAGE url as article_url), and
county-site headlines carry no SWFL term (the listing-stage headline filter
dropped everything a county actually publishes).
"""
from .fetcher import MAX_ARTICLES_PER_SOURCE, _extract_candidates

COLLIER = {
    "name": "collier_county_govt",
    "url": "https://www.collier.gov/News-articles",
    "article_path": "/News-articles/",
}
LEE = {"name": "lee_county_govt", "url": "https://www.leegov.com/news"}
PAPER = {"name": "naples_daily_news", "url": "https://www.naplesnews.com/business/"}


def test_full_card_link_yields_article_url_headline_and_real_date():
    # Real collier.gov card shape: image + "Published on" + whole teaser
    # inside ONE link whose text far exceeds LINK_RE's 120-char cap.
    md = (
        "## [ Fee-Waived Dog Adoptions in Honor of International Mutt Day "
        "![mutt day](https://www.collier.gov/files/assets/mutt-day-das.png?w=300) "
        "Published on July 24, 2026 In honor of International Mutt Day on July 31, "
        "Collier County Domestic Animal Services is hosting a fee-waived adoption "
        "event for all shelter dogs.  Tagged as: , Media Releases, Public Notices ]"
        "(https://www.collier.gov/News-articles/2026-News-Articles/July-2026/Mutt-Day)"
    )
    got = _extract_candidates(md, COLLIER)
    assert len(got) == 1
    assert got[0]["url"].endswith("/News-articles/2026-News-Articles/July-2026/Mutt-Day")
    assert ".png" not in got[0]["url"]
    assert got[0]["headline"] == "Fee-Waived Dog Adoptions in Honor of International Mutt Day"
    assert got[0]["published_date"] == "2026-07-24"


def test_card_without_published_on_keeps_full_text_and_none_date():
    md = "[Call for Artists rotating exhibit](https://www.collier.gov/News-articles/2026-News-Articles/July-2026/Call-for-Artists)"
    got = _extract_candidates(md, COLLIER)
    assert len(got) == 1
    assert got[0]["headline"] == "Call for Artists rotating exhibit"
    assert got[0]["published_date"] is None


def test_article_path_scopes_out_nav_links():
    md = (
        "[Pay Water Bill Online Now](https://www.collier.gov/Resident-Resources/Make-a-Payment)\n"
        "[Public Art Committee Meeting](https://www.collier.gov/News-articles/2026-News-Articles/July-2026/Public-Art)\n"
    )
    got = _extract_candidates(md, COLLIER)
    assert [c["url"] for c in got] == [
        "https://www.collier.gov/News-articles/2026-News-Articles/July-2026/Public-Art"
    ]


def test_article_path_source_keeps_headline_without_swfl_term():
    # "Call for Artists" names no SWFL place; a county site is in-scope by
    # construction, so the listing stage must NOT drop it.
    md = "[Call for Artists 2026](https://www.collier.gov/News-articles/2026-News-Articles/July-2026/Call-for-Artists)"
    got = _extract_candidates(md, COLLIER)
    assert len(got) == 1


def test_article_path_cap_still_applies():
    md = "\n".join(
        f"[News release number {i:03d}](https://www.collier.gov/News-articles/x{i})"
        for i in range(50)
    )
    got = _extract_candidates(md, COLLIER)
    assert len(got) == MAX_ARTICLES_PER_SOURCE * 2


def test_govt_source_without_article_path_keeps_swfl_headline_filter():
    md = (
        "[Job Openings This Week](https://www.leegov.com/hr/jobsearch)\n"
        "[Lee County opens new park in Cape Coral](https://www.leegov.com/parks/new)\n"
    )
    got = _extract_candidates(md, LEE)
    assert [c["headline"] for c in got] == ["Lee County opens new park in Cape Coral"]


def test_newspaper_source_unchanged_url_keywords_and_swfl_filter():
    md = (
        "[Naples restaurant opens on Fifth Ave](https://www.naplesnews.com/story/business/2026/07/25/x/)\n"
        "[Tampa Bay stadium deal advances](https://www.naplesnews.com/story/business/2026/07/25/y/)\n"
        "[Subscribe today for full access](https://subscribe.naplesnews.com/offer)\n"
    )
    got = _extract_candidates(md, PAPER)
    assert [c["headline"] for c in got] == ["Naples restaurant opens on Fifth Ave"]
