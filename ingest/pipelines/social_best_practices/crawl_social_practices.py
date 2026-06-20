"""
Crawl social-media BEST-PRACTICE guides + PLATFORM DEVELOPER DOCS and extract the
facts our social-posting build needs — so the build doc's cadence/format defaults and
its OAuth/API claims are VERIFIED, not remembered.

This does NOT post anything. It captures, per source: (group 1) per-platform cadence,
best post types for data/charts/listings, image dimensions, hashtag/caption norms, CTA
patterns, best times; (group 2) required OAuth scopes, token lifetimes + refresh,
app-review requirements, rate limits, media-upload steps.

Pattern (proven, mirrors ingest/pipelines/report_design_research/crawl_report_designs.py):
  Crawl4aiSession (stealth) -> BeautifulSoup strip scripts/styles -> Anthropic Haiku
  structured extraction -> JSON.

PREREQS (this WILL NOT run where the web is blocked):
  - pip install -r ingest/requirements.txt   (installs crawl4ai)
  - playwright install chromium
  - export ANTHROPIC_API_KEY=...
  - network egress to the target hosts (this repo's web container blocks them: 403).
    Run on a machine / environment whose network policy allows the open web, OR
    allowlist the hosts below.

USAGE:
  python ingest/pipelines/social_best_practices/crawl_social_practices.py
  python ingest/pipelines/social_best_practices/crawl_social_practices.py --out social-practices.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from typing import Any

from bs4 import BeautifulSoup

from ingest.lib.crawl4ai_client import Crawl4aiSession, Crawl4aiError

# group="practice" -> cadence/format/timing guides. group="devdoc" -> platform API contracts.
# Confirm/replace URLs as needed; if a host blocks, point at an archive/mirror.
TARGETS: list[dict[str, str]] = [
    # --- Group 1: best-practice / cadence / format references -----------------------
    {"group": "practice", "label": "Buffer — posting frequency", "url": "https://buffer.com/resources/social-media-frequency/"},
    {"group": "practice", "label": "Hootsuite — best time to post", "url": "https://blog.hootsuite.com/best-time-to-post-on-social-media/"},
    {"group": "practice", "label": "Sprout Social — best times to post", "url": "https://sproutsocial.com/insights/best-times-to-post-on-social-media/"},
    {"group": "practice", "label": "Later — how often to post", "url": "https://later.com/blog/how-often-to-post-on-social-media/"},
    {"group": "practice", "label": "HubSpot — how often to post", "url": "https://blog.hubspot.com/marketing/how-often-post-social-media"},
    {"group": "practice", "label": "Hootsuite — real estate social", "url": "https://blog.hootsuite.com/social-media-real-estate/"},
    # --- Group 2: platform developer-doc references (verify the build doc's API claims) ---
    {"group": "devdoc", "label": "X API v2 — create post", "url": "https://docs.x.com/x-api/posts/creation-of-a-post"},
    {"group": "devdoc", "label": "X API — OAuth 2.0 (PKCE)", "url": "https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code"},
    {"group": "devdoc", "label": "LinkedIn — Posts API", "url": "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api"},
    {"group": "devdoc", "label": "Meta — Pages publishing", "url": "https://developers.facebook.com/docs/pages-api/posts"},
    {"group": "devdoc", "label": "Meta — Instagram Content Publishing", "url": "https://developers.facebook.com/docs/instagram-platform/content-publishing"},
    {"group": "devdoc", "label": "Google Business Profile — local posts", "url": "https://developers.google.com/my-business/reference/rest"},
]

_SCROLL_JS = "window.scrollTo(0, document.body.scrollHeight);"

_PROMPTS: dict[str, str] = {
    "practice": """\
You are extracting SOCIAL-MEDIA POSTING BEST PRACTICES for a B2B local real-estate data
brand. From the page text below, return STRICT JSON with these keys:
  per_platform_cadence - object mapping platform -> recommended posts/week or /day
  best_post_types      - array of formats that perform for data/charts/listings
  best_times           - object mapping platform -> best days/times (B2B if stated)
  image_dimensions     - object mapping platform -> recommended image size(s)
  hashtag_norms        - 1-2 sentences on hashtag count/style per platform
  caption_norms        - 1-2 sentences on caption length/voice
  cta_patterns         - array of effective call-to-action patterns
  takeaways            - array of 2-4 concrete rules worth coding as defaults
Return ONLY the JSON object. No prose. Use null for anything the page does not state.
Page:
""",
    "devdoc": """\
You are extracting a SOCIAL PLATFORM API CONTRACT so an engineer can post on a user's
behalf. From the developer-doc text below, return STRICT JSON with these keys:
  platform            - the platform name
  post_endpoint       - the API endpoint/method to publish a post (verbatim if shown)
  required_scopes     - array of OAuth scopes needed to post
  auth_flow           - 1 sentence (e.g. OAuth2 PKCE, 3-legged)
  access_token_ttl    - access-token lifetime if stated
  refresh_token       - how refresh works / refresh-token lifetime if stated
  app_review_required - true/false + 1 phrase on what review/approval is needed
  rate_limits         - any posting rate limits stated
  media_upload_steps  - array describing how to attach an image/video (verbatim steps if shown)
  gotchas             - array of constraints worth flagging (e.g. business-account-only, link tax)
Return ONLY the JSON object. No prose. Use null for anything the page does not state.
Page:
""",
}


async def _scrape(label: str, url: str) -> str:
    sid = f"social_{label.replace(' ', '_').replace('/', '_').replace('—', '').lower()}"
    async with Crawl4aiSession(session_id=sid) as sess:
        await sess.step(url, wait_for="css:body", delay_after=3.0)
        # one scroll to trigger lazy content, then capture
        html = await sess.step("", js_before=_SCROLL_JS, js_only=True, delay_after=2.0)
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(" ", strip=True)
    return text[:18_000]  # Haiku context budget


def _extract(label: str, group: str, page_text: str) -> dict[str, Any] | None:
    """Anthropic Haiku structured extraction; prompt keyed by source group."""
    import anthropic

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(f"[warn] ANTHROPIC_API_KEY not set — skipping extraction for {label}", flush=True)
        return None
    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1400,
        messages=[{"role": "user", "content": _PROMPTS[group] + page_text}],
    )
    raw = "".join(block.text for block in msg.content if getattr(block, "type", "") == "text")
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        print(f"[warn] {label}: non-JSON extraction, keeping raw", flush=True)
        return {"_raw": raw}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="social-practices.json")
    args = ap.parse_args()

    results: list[dict[str, Any]] = []
    for t in TARGETS:
        print(f"[crawl] ({t['group']}) {t['label']} <- {t['url']}", flush=True)
        try:
            text = await _scrape(t["label"], t["url"])
        except Crawl4aiError as e:
            print(f"[skip] {t['label']}: scrape failed ({e})", flush=True)
            results.append({"group": t["group"], "label": t["label"], "url": t["url"], "error": str(e)})
            continue
        extracted = _extract(t["label"], t["group"], text)
        results.append({"group": t["group"], "label": t["label"], "url": t["url"], "profile": extracted})

    with open(args.out, "w") as f:
        json.dump({"sources": results}, f, indent=2)
    print(f"[done] wrote {len(results)} source profiles -> {args.out}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
