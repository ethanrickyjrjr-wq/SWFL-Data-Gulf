"""Two-vendor extraction layer.

This module wraps both firecrawl HTML-scraping modes that have a spider
equivalent. Per the rule in `docs/standards/pipeline-freshness.md` §6:

    firecrawl /v2/scrape   ← spider /scrape         → `scrape_with_fallback()`
    firecrawl /v2/agent    ← spider /ai/scrape      → `extract()`
    firecrawl actions      ← (no spider analogue)   → call firecrawl direct

Why this exists: firecrawl can quietly return `status=completed` with
`data=null` or empty markdown on dead/blocked URLs. Spider's analogues either
return real content or surface a structured HTTP error (404/525) that tells
the operator the URL needs auditing. Wrapping both behind one call site means
pipelines stop silently producing zero rows.

Contract preserved from `firecrawl_client.agent()`:
    extract(prompt, *, urls=[...], schema={...}, max_credits=N,
            strict_constrain_to_urls=bool) -> dict

The returned dict carries the firecrawl response shape (so existing call sites
that use `extract_agent_rows` keep working) plus a `_provenance` list documenting
which vendor served which URL — useful for both debugging and the per-URL
"this URL is dead, audit it" message we want surfaced.

Fallback policy (per-call, not per-URL — firecrawl agent accepts a list):
    1. Try firecrawl across all URLs at once.
    2. If firecrawl returns ≥1 row → return it. (Firecrawl is primary; trust it
       when it works.)
    3. If firecrawl returns 0 rows OR raises FirecrawlError → fall back to
       spider /ai/scrape per URL. Collect rows + per-URL errors.
    4. If spider yields ≥1 row → return combined.
    5. If both vendors yield 0 rows AND we have at least one spider error,
       raise ExtractError summarizing each URL's failure. This is the
       "loud failure" outcome that makes URL audits actionable.

Env: FIRECRAWL_API_KEY (primary), SPIDER_API_KEY (fallback). If
SPIDER_API_KEY is missing, the fallback step is skipped with a warning —
pipelines stay running on firecrawl alone (preserves the pre-spider behavior
when an operator has not provisioned spider).
"""
from __future__ import annotations

import os
from typing import Any, Iterable, Optional

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
    """Plain page-to-markdown scrape with firecrawl primary, spider fallback.

    This is the wrapper that plain `firecrawl_client.scrape()` callers must
    use per the rule in `docs/standards/pipeline-freshness.md` §6. The vendor
    split is:

        firecrawl /v2/scrape   → primary (rich metadata: title, publishedTime, etc.)
        spider    /scrape      → fallback when firecrawl fails or returns empty markdown

    Response shape (firecrawl-/v2/scrape-compatible, so existing callers that
    read `response["data"]["markdown"]` and `response["data"]["metadata"]`
    keep working unchanged):

        {
          "data": {"markdown": "...", "metadata": {...}},
          "_provenance": [
              {"vendor": "firecrawl", "url": "...", "ok": bool, "bytes": N, ...},
              {"vendor": "spider",    "url": "...", "ok": bool, "bytes": N, ...},
          ],
        }

    Fallback policy (per-URL — unlike `extract()` which batches via /v2/agent):
        1. Try firecrawl /v2/scrape.
        2. If firecrawl returns markdown with bytes > 0 → return it. Trust the primary.
        3. If firecrawl raises FirecrawlError OR returns empty markdown → fall back to
           spider /scrape.
        4. If spider yields non-empty markdown → return spider's response (with
           degraded metadata — spider /scrape doesn't surface title/publishedTime).
        5. If both vendors yield empty markdown AND spider errored, raise
           ExtractError. If spider also returned empty without erroring, return
           empty markdown with provenance documenting the trail.

    Env: FIRECRAWL_API_KEY (primary), SPIDER_API_KEY (fallback). If SPIDER_API_KEY
    is missing, fallback is skipped with a provenance note — pipelines stay
    running on firecrawl alone (preserves the pre-spider behavior).
    """
    provenance: list[dict[str, Any]] = []

    # ── 1. Firecrawl primary attempt ────────────────────────────────────────
    fc_error: Optional[str] = None
    try:
        fc_response = firecrawl_scrape(
            url,
            formats=formats,
            only_main_content=only_main_content,
        )
        fc_data = fc_response.get("data", fc_response) if isinstance(fc_response, dict) else {}
        fc_markdown = fc_data.get("markdown", "") if isinstance(fc_data, dict) else ""
        provenance.append({
            "vendor": "firecrawl",
            "url": url,
            "ok": True,
            "bytes": len(fc_markdown),
        })
        if fc_markdown:
            return {
                "data": fc_data,
                "_provenance": provenance,
            }
    except FirecrawlError as exc:
        fc_error = str(exc)
        provenance.append({
            "vendor": "firecrawl",
            "url": url,
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
            "data": {"markdown": "", "metadata": {}},
            "_provenance": provenance + [{
                "vendor": "spider",
                "ok": False,
                "skipped": True,
                "reason": "SPIDER_API_KEY not set; fallback disabled.",
            }],
        }

    spider_error: Optional[str] = None
    try:
        sp_response = spider_scrape(url)
        sp_data = sp_response.get("data", {}) if isinstance(sp_response, dict) else {}
        sp_markdown = sp_data.get("markdown", "") if isinstance(sp_data, dict) else ""
        provenance.append({
            "vendor": "spider",
            "url": url,
            "ok": True,
            "bytes": len(sp_markdown),
        })
        if sp_markdown:
            return {
                "data": sp_data,
                "_provenance": provenance,
            }
    except SpiderError as exc:
        spider_error = str(exc)
        provenance.append({
            "vendor": "spider",
            "url": url,
            "ok": False,
            "error": spider_error,
        })

    # ── 3. Outcome — both vendors empty ─────────────────────────────────────
    if spider_error:
        prefix = f"firecrawl: {fc_error}; " if fc_error else ""
        raise ExtractError(
            f"Both vendors failed for {url}. {prefix}spider: {spider_error}"
        )

    # Both vendors returned empty markdown but neither errored — the URL is
    # alive but has no extractable content. Treat the same as firecrawl
    # returning empty (callers decide whether to skip).
    return {
        "data": {"markdown": "", "metadata": {}},
        "_provenance": provenance,
    }
