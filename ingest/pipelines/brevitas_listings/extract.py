"""
Brevitas active listings extraction for Estero + Fort Myers Beach FL.

Two-call strategy (no body-text parsing — avoids layout ambiguity):
  1. GET brevitas.com/api/search  → JSON pins (uuid, price, type) for each city.
  2. GET brevitas.com/api/search/listings/{uuids}  → HTML card batch.
     Each card contains:
       - href slug  → address for slugs that start with a house number
       - sqft text  → parsed from stripped card HTML
  Price comes from the search API pin (lease PSF or sale price; distill filters by threshold).
  City is known from the search target, so address city/state don't need the body text.

No headless browser, no Cloudflare clearance — Brevitas's API responds to plain HTTP with
the right headers. Playwright is NOT needed here; urllib + the JSON API is sufficient.

WAF / runner-IP note: the JSON API stays plain-HTTP, but GitHub-hosted-runner datacenter IPs
get categorically 403'd by the edge (the contract is unchanged — it just refuses GH's IPs).
When CRAWL4AI_PROXY is set (the cron's residential proxy, same repo-wide secret the crawl4ai
pipelines use), _api_get routes urllib through it; unset, the connection is direct and every
byte of prior behavior is preserved (local runs, dry-runs, and every other pipeline unaffected).
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from typing import Any

SEARCH_TARGETS: list[dict[str, str]] = [
    {
        "city": "Estero",
        "label": "Estero FL",
        "place_id": "ChIJTXMBstoR24gRpA9wHI_NlLM",
        "county": "Lee+County",
    },
    {
        "city": "Fort Myers Beach",
        "label": "Fort Myers Beach FL",
        "place_id": "ChIJ51guLIw324gRUjC4CQjWz9Q",
        "county": "Lee+County",
    },
]

_HEADERS = {
    "Accept": "application/json, text/html, */*",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://brevitas.com/",
    "X-Requested-With": "XMLHttpRequest",
}

_SQFT_PAT = re.compile(r"([\d,]+)\s*(?:sqft|sq\.?\s*ft)\b", re.IGNORECASE)
_SLUG_ADDR_PAT = re.compile(
    r"^\d[\d\w]*-",  # slug starts with a house number followed by dash
)


def _proxy_url_from_env() -> str | None:
    """Normalize CRAWL4AI_PROXY into a single ``scheme://[user:pass@]host:port`` URL that
    urllib's ProxyHandler understands, or None when the var is unset/blank.

    Mirrors the accepted string formats of crawl4ai's ``ProxyConfig.from_string``
    (crawl4ai/async_configs.py) so the SAME repo-wide secret value works here — WITHOUT
    importing crawl4ai. This pipeline hits a clean JSON API over plain urllib and must stay
    browser/Playwright-free; pulling in crawl_client just for the proxy parse would drag in
    the whole crawl4ai/Playwright import graph. Supported inputs (from_string's own list):
      - ``http://user:pass@host:port`` / ``http://host:port`` / ``socks5://host:port`` — passed
        through verbatim (urllib embeds the userinfo and forwards Proxy-Authorization into the
        HTTPS CONNECT tunnel; verified against CPython 3.12 urllib/request.py do_open).
      - ``host:port:user:pass`` / ``host:port`` — colon forms, defaulted to an http:// proxy.

    Returns None when unset — a strict no-op: every other pipeline, and local/dry-run use with
    no secret, keeps the exact direct-connection behavior it has today.

    NOTE: urllib natively proxies http(s) CONNECT proxies only (the residential-proxy norm for
    a WAF bypass). A socks5 value would need PySocks, which we deliberately do not add — the
    string is passed through so the value is honored identically to the crawl4ai path, not
    silently rewritten.
    """
    raw = os.environ.get("CRAWL4AI_PROXY", "").strip()
    if not raw:
        return None
    if "://" in raw:
        return raw  # already a full proxy URL (creds embedded if present)
    parts = raw.split(":")
    if len(parts) == 4:
        host, port, user, password = parts
        return f"http://{user}:{password}@{host}:{port}"
    if len(parts) == 2:
        host, port = parts
        return f"http://{host}:{port}"
    raise ValueError(f"Invalid CRAWL4AI_PROXY format: {raw!r}")


def _proxy_opener() -> urllib.request.OpenerDirector | None:
    """Return a urllib opener that routes every request through CRAWL4AI_PROXY, or None when
    the var is unset. None => the caller falls back to the default ``urllib.request.urlopen``,
    byte-identical to the pre-proxy code path (the residential proxy is opt-in via the env var,
    which only the GitHub Actions cron sets — see .github/workflows/ingest-brevitas-listings.yml)."""
    url = _proxy_url_from_env()
    if url is None:
        return None
    # Passing our own ProxyHandler suppresses build_opener's default (system-env) ProxyHandler,
    # so exactly this proxy is used for both http and https targets.
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": url, "https": url})
    )


def _api_get(url: str) -> Any:
    req = urllib.request.Request(url, headers=_HEADERS)
    opener = _proxy_opener()
    # Unset proxy => the exact prior transport (urllib.request.urlopen); set => route via proxy.
    open_fn = opener.open if opener is not None else urllib.request.urlopen
    with open_fn(req, timeout=20) as r:
        return json.loads(r.read())


def _build_search_url(city: str, place_id: str, county: str) -> str:
    c = city.replace(" ", "+")
    return (
        f"https://brevitas.com/api/search"
        f"?location={c}%2C+FL"
        f"&transaction_type=for_lease"
        f"&city={c}"
        f"&county={county}"
        f"&state=FL&state_full=Florida&country=United+States"
        f"&place_id={place_id}"
    )


def _address_from_slug(slug: str, city: str) -> str | None:
    """
    Reconstruct a street address from a Brevitas URL slug.

    Brevitas slugs fall into two patterns:
      - Address slugs: "2915-estero-boulevard-fort-myers-beach-fl-33931"
        (start with a house number → can reconstruct street)
      - Name slugs:    "end-unit-in-upscale-office-park"
        (no house number → not an address; return None)
    """
    if not _SLUG_ADDR_PAT.match(slug):
        return None

    # Strip trailing -city-fl-zipcode suffix
    city_slug = city.lower().replace(" ", "-")
    cleaned = re.sub(
        rf"-{re.escape(city_slug)}-fl-\d{{5}}$", "", slug, flags=re.I
    )
    if cleaned == slug:
        cleaned = re.sub(r"-fl-\d{5}$", "", slug, flags=re.I)

    # Dash-separated tokens → title-cased street address
    tokens = cleaned.split("-")
    return " ".join(t if t.isdigit() else t.title() for t in tokens)


def _sqft_from_card_html(html: str) -> int | None:
    text = re.sub(r"<[^>]+>", " ", html)
    m = _SQFT_PAT.search(text)
    return int(m.group(1).replace(",", "")) if m else None


def _fetch_search_pins(city: str, place_id: str, county: str) -> list[dict]:
    url = _build_search_url(city, place_id, county)
    data = _api_get(url)
    return data.get("pins", [])


def _fetch_cards(uuids: list[str]) -> dict[str, dict]:
    """Batch-fetch HTML cards for a list of UUIDs. Returns {uuid: card_dict}."""
    if not uuids:
        return {}
    uuid_str = ",".join(uuids)
    url = f"https://brevitas.com/api/search/listings/{uuid_str}"
    data = _api_get(url)
    return {item["uuid"]: item for item in data.get("items", [])}


def _build_rows(pins: list[dict], cards: dict[str, dict], city: str) -> list[dict[str, Any]]:
    rows = []
    for pin in pins:
        uuid = pin.get("uuid", "")
        price = pin.get("price")
        prop_type = pin.get("type") or None

        card = cards.get(uuid, {})
        card_html = card.get("html", "")

        # Source URL: prefer the full href from the card; fall back to /p/{uuid}
        href_m = re.search(r'href="(https?://brevitas\.com/p/[^"]+)"', card_html)
        source_url: str | None = href_m.group(1) if href_m else (
            f"https://brevitas.com/p/{uuid}" if uuid else None
        )

        # Address: extract from URL slug when it encodes a street address
        slug = ""
        if href_m:
            slug_m = re.search(r"/p/[^/]+/([^\"?#]+)", href_m.group(1))
            slug = slug_m.group(1) if slug_m else ""

        street_addr = _address_from_slug(slug, city)
        if not street_addr:
            # Slug is a name/marketing title — use it as the listing name; address will be
            # city-level only (still useful for the brain's aggregation at city grain).
            name = pin.get("name") or slug.replace("-", " ").title() or uuid
            street_addr = name

        sqft = _sqft_from_card_html(card_html)

        rows.append({
            "address": street_addr.strip(),
            "city": city,
            "state": "FL",
            "property_type": prop_type,
            "sqft": sqft,
            "price": float(price) if price is not None else None,
            "source_url": source_url,
            "uuid": uuid,
        })
    return rows


def fetch_listings_for_city(target: dict[str, str]) -> list[dict[str, Any]]:
    """
    Fetch Brevitas search API + card batch for one city.
    Returns raw listing dicts (empty list on error).
    """
    city = target["city"]
    label = target["label"]
    try:
        pins = _fetch_search_pins(city, target["place_id"], target["county"])
        if not pins:
            print(f"[warn] Brevitas: 0 pins from search API for {label}", flush=True)
            return []

        time.sleep(1)  # be polite between the two API calls
        uuids = [p["uuid"] for p in pins if p.get("uuid")]
        cards = _fetch_cards(uuids)

        rows = _build_rows(pins, cards, city)
        print(f"  {len(pins)} pins, {len(cards)} cards fetched", flush=True)
        return rows

    except Exception as exc:
        print(f"[warn] Brevitas error for {label}: {exc}", flush=True)
        return []
