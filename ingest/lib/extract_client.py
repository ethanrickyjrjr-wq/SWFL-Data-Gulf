"""Extraction layer — crawl4ai is the live scraper; Firecrawl/Spider are dormant.

scrape_with_fallback()  — plain page→markdown:  crawl4ai (primary, live) → spider → firecrawl
extract()               — AI structured extract: firecrawl /v2/agent → spider /ai/scrape
                          (NO production callers — see note below)

crawl4ai is the ONLY live scraper (operator decree 2026-06-16): it runs locally (no API
credits) and handles JS-rendered pages. Spider and Firecrawl remain only as DORMANT paid
fallbacks — each gated on its API key (SPIDER_API_KEY / FIRECRAWL_API_KEY, both unset), and
`firecrawl-py` is no longer a dependency (the SDK import in firecrawl_client.agent() is lazy
and raises a caught FirecrawlError if absent). Neither fires today.

extract() (AI structured rows) has zero production callers, so its firecrawl-primary branch
is inert. Rewiring it to a crawl4ai-native path (LLMExtractionStrategy, or the proven
crexi/Haiku fetch→strip→Haiku pattern) is a tracked follow-on that needs a live battle-test.

Contract preserved from `firecrawl_client.agent()`:
    extract(prompt, *, urls=[...], schema={...}, max_credits=N,
            strict_constrain_to_urls=bool) -> dict

Response shape: firecrawl-compatible dict + `_provenance` list.
"""
from __future__ import annotations

import os
from typing import Any, Iterable, Optional

from ingest.lib.crawl4ai_client import Crawl4aiError, fetch_page_markdown
from ingest.lib.firecrawl_client import (
    FirecrawlError,
    agent as firecrawl_agent,
    extract_agent_rows,
    scrape as firecrawl_scrape,
)
from ingest.lib.spider_client import (
    SpiderError,
    ai_scrape as spider_ai_scrape,
    extract_rows as spider_extract_rows,
    scrape as spider_scrape,
)


class ExtractError(RuntimeError):
    """Raised when every vendor returned zero rows AND at least one errored.

    The exception message itemizes each vendor + URL + error so the operator
    knows exactly which URLs need auditing.
    """


def extract(
    prompt: str,
    *,
    urls: Iterable[str],
    schema: Optional[dict[str, Any]] = None,
    model: str = "spark-1-mini",
    max_credits: int = 1000,
    strict_constrain_to_urls: bool = False,
    poll_interval: int = 2,
    timeout: int = 480,
) -> dict[str, Any]:
    """Try firecrawl /v2/agent first, fall back to spider /ai/scrape per URL.

    Returns a dict with the firecrawl response shape so `extract_agent_rows`
    still works:

        {
          "status": "completed",
          "data": {"rows": [...]},
          "_provenance": [
              {"vendor": "firecrawl", "urls": [...], "rows": N, "ok": bool, ...},
              {"vendor": "spider",    "url":  "...", "rows": N, "ok": bool, ...},
          ],
        }
    """
    url_list = list(urls)
    provenance: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []

    # ── 1. Firecrawl primary attempt ────────────────────────────────────────
    fc_error: Optional[str] = None
    try:
        fc_response = firecrawl_agent(
            prompt,
            urls=url_list,
            schema=schema,
            model=model,
            max_credits=max_credits,
            strict_constrain_to_urls=strict_constrain_to_urls,
            poll_interval=poll_interval,
            timeout=timeout,
        )
        fc_rows = extract_agent_rows(fc_response)
        provenance.append({
            "vendor": "firecrawl",
            "urls": url_list,
            "rows": len(fc_rows),
            "ok": True,
            "job_id": fc_response.get("id"),
            "credits_used": fc_response.get("credits_used"),
        })
        if fc_rows:
            return {
                "status": "completed",
                "data": {"rows": fc_rows},
                "_provenance": provenance,
            }
    except FirecrawlError as exc:
        fc_error = str(exc)
        provenance.append({
            "vendor": "firecrawl",
            "urls": url_list,
            "rows": 0,
            "ok": False,
            "error": fc_error,
        })

    # ── 2. Spider per-URL fallback ──────────────────────────────────────────
    if not os.environ.get("SPIDER_API_KEY"):
        # No spider key → preserve pre-fallback behavior: re-raise firecrawl's
        # error if it failed, otherwise return the empty firecrawl response.
        if fc_error is not None:
            raise FirecrawlError(fc_error)
        return {
            "status": "completed",
            "data": {"rows": []},
            "_provenance": provenance + [{
                "vendor": "spider",
                "ok": False,
                "skipped": True,
                "reason": "SPIDER_API_KEY not set; fallback disabled.",
            }],
        }

    spider_errors: list[tuple[str, str]] = []
    for url in url_list:
        try:
            sp_response = spider_ai_scrape(prompt, url=url, schema=schema)
            sp_rows = spider_extract_rows(sp_response)
            provenance.append({
                "vendor": "spider",
                "url": url,
                "rows": len(sp_rows),
                "ok": True,
            })
            rows.extend(sp_rows)
        except SpiderError as exc:
            err = str(exc)
            spider_errors.append((url, err))
            provenance.append({
                "vendor": "spider",
                "url": url,
                "rows": 0,
                "ok": False,
                "error": err,
            })

    # ── 3. Outcome ──────────────────────────────────────────────────────────
    if rows:
        return {
            "status": "completed",
            "data": {"rows": rows},
            "_provenance": provenance,
        }

    if spider_errors:
        details = "\n  - ".join(f"{u}: {e}" for u, e in spider_errors)
        prefix = f"firecrawl: {fc_error}\n  - " if fc_error else ""
        raise ExtractError(
            f"Both vendors returned zero rows. Per-URL failures:\n  - {prefix}{details}"
        )

    # Spider didn't error per-URL but also returned no rows. This is the
    # "URLs aren't dead, they just don't contain the data we asked for" case —
    # callers should treat this the same as firecrawl returning empty.
    return {
        "status": "completed",
        "data": {"rows": []},
        "_provenance": provenance,
    }


def scrape_with_fallback(
    url: str,
    *,
    only_main_content: bool = True,
    formats: Iterable[str] = ("markdown",),
) -> dict[str, Any]:
    """Plain page-to-markdown: crawl4ai primary → spider fallback → firecrawl last-resort.

    Response shape (firecrawl-/v2/scrape-compatible):
        {
          "data": {"markdown": "...", "metadata": {}},
          "_provenance": [{"vendor": "crawl4ai"|"spider"|"firecrawl", "url": "...", ...}],
        }
    """
    provenance: list[dict[str, Any]] = []

    # ── 1. crawl4ai primary (no API credits) ───────────────────────────────
    c4_error: Optional[str] = None
    try:
        md = fetch_page_markdown(url)
        provenance.append({"vendor": "crawl4ai", "url": url, "ok": True, "bytes": len(md)})
        if md:
            return {"data": {"markdown": md, "metadata": {}}, "_provenance": provenance}
        provenance[-1]["ok"] = False
        provenance[-1]["reason"] = "empty markdown"
    except Crawl4aiError as exc:
        c4_error = str(exc)
        provenance.append({"vendor": "crawl4ai", "url": url, "ok": False, "error": c4_error})

    # ── 2. Spider fallback ──────────────────────────────────────────────────
    if os.environ.get("SPIDER_API_KEY"):
        spider_error: Optional[str] = None
        try:
            sp_response = spider_scrape(url)
            sp_data = sp_response.get("data", {}) if isinstance(sp_response, dict) else {}
            sp_markdown = sp_data.get("markdown", "") if isinstance(sp_data, dict) else ""
            provenance.append({"vendor": "spider", "url": url, "ok": True, "bytes": len(sp_markdown)})
            if sp_markdown:
                return {"data": sp_data, "_provenance": provenance}
        except SpiderError as exc:
            spider_error = str(exc)
            provenance.append({"vendor": "spider", "url": url, "ok": False, "error": spider_error})

    # ── 3. Firecrawl last-resort ────────────────────────────────────────────
    if os.environ.get("FIRECRAWL_API_KEY"):
        fc_error: Optional[str] = None
        try:
            fc_response = firecrawl_scrape(url, formats=formats, only_main_content=only_main_content)
            fc_data = fc_response.get("data", fc_response) if isinstance(fc_response, dict) else {}
            fc_markdown = fc_data.get("markdown", "") if isinstance(fc_data, dict) else ""
            provenance.append({"vendor": "firecrawl", "url": url, "ok": True, "bytes": len(fc_markdown)})
            if fc_markdown:
                return {"data": fc_data, "_provenance": provenance}
        except FirecrawlError as exc:
            fc_error = str(exc)
            provenance.append({"vendor": "firecrawl", "url": url, "ok": False, "error": fc_error})

    # ── 4. All vendors empty or errored ────────────────────────────────────
    errors = [e["error"] for e in provenance if not e.get("ok") and "error" in e]
    if errors:
        raise ExtractError(f"All vendors failed for {url}. " + "; ".join(errors))
    return {"data": {"markdown": "", "metadata": {}}, "_provenance": provenance}
