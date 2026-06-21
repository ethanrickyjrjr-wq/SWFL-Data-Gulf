"""supercrawl4ai — enhanced in-process crawl layer over crawl4ai_client.py.

The old ingest/lib/crawl4ai_client.py is the STABLE BASE — untouched, the workhorse for every
shipped pipeline. supercrawl4ai is the ENHANCED SURFACE: same crawl4ai 0.9.0 in-process SDK, plus
opt-in powers (deterministic table capture, fit-markdown denoise, virtual-scroll, residential proxy
egress, memory-adaptive hardening, dispatch telemetry).

INVARIANT: SuperConfig() with no overrides reproduces the old client's plain capture. Every new
power is a default-off field. Building this module changes NO existing pipeline's output.

IN-PROCESS ONLY: stealth/interactive crawling can never move to the 0.9.0 remote server (it
400-rejects js_code/proxy/cookies over the network). supercrawl4ai is in-process SDK, like the base.

Phase 1 (this module): fetch_super / fetch_many_super / fetch_tables + the SuperConfig surface.
Phase 2 (separate spec): prove virtual_scroll + proxy on the live Crexi grid, migrate crexi over.
"""
from __future__ import annotations

import asyncio
import inspect
import os
from dataclasses import dataclass, field
from typing import Iterable, Optional

from crawl4ai import (
    AsyncWebCrawler,
    BrowserConfig,
    CacheMode,
    CrawlerMonitor,
    CrawlerRunConfig,
    DefaultMarkdownGenerator,
    MemoryAdaptiveDispatcher,
    ProxyConfig,
    PruningContentFilter,
    RateLimiter,
    UndetectedAdapter,
    VirtualScrollConfig,
)
from crawl4ai.async_crawler_strategy import AsyncPlaywrightCrawlerStrategy

from ingest.lib.crawl4ai_client import Crawl4aiError  # re-export the shared error type

__all__ = [
    "SuperConfig",
    "SuperTable",
    "SuperResult",
    "Crawl4aiError",
    "fetch_super",
    "fetch_many_super",
    "fetch_tables",
]


@dataclass
class SuperConfig:
    # content shaping (off => byte-identical capture)
    fit_markdown: bool = False
    tables: bool = False
    remove_overlays: bool = False
    scan_full_page: bool = False
    max_scroll_steps: Optional[int] = None
    scroll_delay: float = 0.2
    virtual_scroll: Optional[VirtualScrollConfig] = None
    # identity / egress  [PROVE: Phase 2]
    stealth: bool = False
    proxy: Optional[str] = None
    # throughput / safety
    concurrency: int = 5
    jitter: tuple[float, float] = (0.0, 0.0)  # (mean_delay, max_range)
    memory_threshold_percent: float = 85.0
    monitor: bool = False
    # fetch tuning
    wait_for: Optional[str] = None
    timeout_ms: int = 60_000
    table_score_threshold: int = 7


@dataclass
class SuperTable:
    headers: list
    rows: list
    caption: str = ""
    metadata: dict = field(default_factory=dict)

    def to_dataframe(self):
        import pandas as pd

        df = pd.DataFrame(self.rows, columns=self.headers or None)
        df.attrs["caption"] = self.caption
        df.attrs["metadata"] = self.metadata
        return df


@dataclass
class SuperResult:
    url: str
    success: bool
    html: str = ""
    markdown: str = ""       # raw_markdown — always present (== old behaviour)
    fit_markdown: str = ""   # only when cfg.fit_markdown
    links: list = field(default_factory=list)
    tables: list = field(default_factory=list)
    error: Optional[str] = None
    dispatch: Optional[dict] = None


# ── config builders ──────────────────────────────────────────────────────────


def _proxy_config(cfg: SuperConfig) -> Optional[ProxyConfig]:
    raw = cfg.proxy or os.environ.get("CRAWL4AI_PROXY")
    return ProxyConfig.from_string(raw) if raw else None


def _browser_config(cfg: SuperConfig) -> BrowserConfig:
    return BrowserConfig(headless=True, enable_stealth=cfg.stealth)


def _run_config(cfg: SuperConfig, *, session_id: Optional[str] = None) -> CrawlerRunConfig:
    """Map SuperConfig -> CrawlerRunConfig. Every field defaults to crawl4ai's own default, so
    SuperConfig() reproduces the old client's CrawlerRunConfig(cache_mode=BYPASS,
    delay_before_return_html=1.0). Byte-identical invariant."""
    kwargs = dict(
        cache_mode=CacheMode.BYPASS,
        wait_for=cfg.wait_for,
        page_timeout=cfg.timeout_ms,
        delay_before_return_html=1.0,
        scan_full_page=cfg.scan_full_page,
        scroll_delay=cfg.scroll_delay,
        remove_overlay_elements=cfg.remove_overlays,
        table_score_threshold=cfg.table_score_threshold,
    )
    if cfg.max_scroll_steps is not None:
        kwargs["max_scroll_steps"] = cfg.max_scroll_steps
    if cfg.virtual_scroll is not None:
        kwargs["virtual_scroll_config"] = cfg.virtual_scroll
    if cfg.fit_markdown:
        kwargs["markdown_generator"] = DefaultMarkdownGenerator(content_filter=PruningContentFilter())
    mean_delay, max_range = cfg.jitter
    if mean_delay or max_range:
        kwargs["mean_delay"] = mean_delay
        kwargs["max_range"] = max_range
    proxy = _proxy_config(cfg)
    if proxy is not None:
        kwargs["proxy_config"] = proxy
    if session_id:
        kwargs["session_id"] = session_id
    return CrawlerRunConfig(**kwargs)


def _strategy(cfg: SuperConfig, bc: BrowserConfig) -> AsyncPlaywrightCrawlerStrategy:
    if cfg.stealth:
        return AsyncPlaywrightCrawlerStrategy(browser_adapter=UndetectedAdapter(), browser_config=bc)
    return AsyncPlaywrightCrawlerStrategy(browser_config=bc)


# ── result mapping ───────────────────────────────────────────────────────────


def _to_super_result(url: str, r, want_tables: bool, want_fit: bool) -> SuperResult:
    if not getattr(r, "success", False):
        return SuperResult(url=url, success=False, error=getattr(r, "error_message", "?"))
    md = getattr(r, "markdown", None)
    if md is None:
        raw_md, fit_md = "", ""
    elif hasattr(md, "raw_markdown"):
        raw_md = md.raw_markdown or ""
        fit_md = (getattr(md, "fit_markdown", "") or "") if want_fit else ""
    else:
        raw_md, fit_md = str(md), ""
    links: list = []
    raw_links = getattr(r, "links", None) or {}
    if isinstance(raw_links, dict):
        for group in raw_links.values():
            for item in group or []:
                href = item.get("href") if isinstance(item, dict) else None
                if href:
                    links.append(href)
    tables: list = []
    if want_tables:
        for t in (getattr(r, "tables", None) or []):
            if isinstance(t, dict):
                tables.append(
                    SuperTable(
                        headers=t.get("headers") or [],
                        rows=t.get("rows") or [],
                        caption=t.get("caption") or "",
                        metadata=t.get("metadata") or {},
                    )
                )
    dispatch = None
    dr = getattr(r, "dispatch_result", None)
    if dr is not None:
        dispatch = {
            "memory_usage": getattr(dr, "memory_usage", None),
            "peak_memory": getattr(dr, "peak_memory", None),
        }
    return SuperResult(
        url=url,
        success=True,
        html=r.html or "",
        markdown=raw_md,
        fit_markdown=fit_md,
        links=links,
        tables=tables,
        dispatch=dispatch,
    )


# ── public surface ───────────────────────────────────────────────────────────


async def _fetch_super_async(url: str, cfg: SuperConfig) -> SuperResult:
    bc = _browser_config(cfg)
    strategy = _strategy(cfg, bc)
    async with AsyncWebCrawler(crawler_strategy=strategy, config=bc) as crawler:
        r = await crawler.arun(url=url, config=_run_config(cfg))
    return _to_super_result(url, r, cfg.tables, cfg.fit_markdown)


def fetch_super(url: str, cfg: Optional[SuperConfig] = None) -> SuperResult:
    """Enhanced single fetch. cfg=None reproduces the old client's plain capture."""
    return asyncio.run(_fetch_super_async(url, cfg or SuperConfig()))


def fetch_tables(
    url: str,
    *,
    stealth: bool = False,
    score_threshold: int = 7,
    min_rows: int = 1,
    min_cols: int = 1,
) -> list:
    """Deterministic, zero-LLM HTML table capture. Returns only tables clearing the floors."""
    res = fetch_super(
        url, SuperConfig(tables=True, stealth=stealth, table_score_threshold=score_threshold)
    )
    return [t for t in res.tables if len(t.rows) >= min_rows and len(t.headers) >= min_cols]


async def _fetch_many_super_async(urls: list, cfg: SuperConfig) -> dict:
    if not urls:
        return {}
    bc = _browser_config(cfg)
    strategy = _strategy(cfg, bc)
    disp_kwargs = dict(
        max_session_permit=cfg.concurrency,
        memory_threshold_percent=cfg.memory_threshold_percent,
        rate_limiter=RateLimiter(
            base_delay=(1.0, 3.0), max_delay=60.0, max_retries=3, rate_limit_codes=[429, 503]
        ),
    )
    if cfg.monitor and "monitor" in inspect.signature(MemoryAdaptiveDispatcher.__init__).parameters:
        disp_kwargs["monitor"] = CrawlerMonitor()
    dispatcher = MemoryAdaptiveDispatcher(**disp_kwargs)
    out: dict = {}
    async with AsyncWebCrawler(crawler_strategy=strategy, config=bc) as crawler:
        results = await crawler.arun_many(urls=urls, config=_run_config(cfg), dispatcher=dispatcher)
        for r in results:
            u = getattr(r, "url", "") or ""
            out[u] = _to_super_result(u, r, cfg.tables, cfg.fit_markdown)
    for u in urls:  # guarantee every requested url is present
        out.setdefault(u, SuperResult(url=u, success=False, error="no result returned"))
    return out


def fetch_many_super(urls: Iterable[str], cfg: Optional[SuperConfig] = None) -> dict:
    """Parallel enhanced fetch via a memory-adaptive dispatcher. Keys by resolved url."""
    return asyncio.run(_fetch_many_super_async(list(urls), cfg or SuperConfig()))
