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
"""
from __future__ import annotations

import json
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


def _api_get(url: str) -> Any:
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
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
