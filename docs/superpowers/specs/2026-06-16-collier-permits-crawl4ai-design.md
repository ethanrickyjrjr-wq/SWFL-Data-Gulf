# Collier Permits — crawl4ai Migration Design

**Date:** 2026-06-16  
**Status:** Approved  
**Scope:** Replace Firecrawl stealth + Spider residential with crawl4ai (UndetectedAdapter) for the Collier County building permits pipeline. Monthly XLSX architecture unchanged. GHA workflow updated for dry-run probe.

---

## Background

Collier County uses **CityView Portal** (`cvportal.collier.gov`), not Accela. Permits are published as monthly XLSX files on `colliercountyfl.gov`, blocked by an Akamai bot-wall (TLS/JA3 fingerprint; 403s from datacenter AND residential IPs). The existing pipeline (`ingest/pipelines/collier_permits/`) fetches the listing page via Firecrawl stealth and the XLSX binary via Spider residential.

crawl4ai UndetectedAdapter was proven to clear the Lee County Accela WAF from GHA datacenter IPs (run 27602909470, 2026-06-16). The same adapter should bypass Akamai for Collier's listing page. The XLSX binary is downloaded in-browser using crawl4ai's native file-download capability (`accept_downloads=True`, `result.downloaded_files`), eliminating the Spider dependency.

---

## What Does NOT Change

- `normalizer.py` — column map, bucket classification, type coercion
- `geocoder.py` — Census batch geocoder, corridor assignment
- `pipeline.py` — `run_pipeline()`, `main()`, volume guard, dlt write
- `test_pipeline.py` — all tests mock `download_month` / `discover_issued_reports`; fetcher internals are opaque to them

---

## Change 1 — `ingest/lib/crawl4ai_client.py`

### New constructor params for `Crawl4aiSession`

```
accept_downloads: bool = False   (default False; existing callers unaffected)
```

When `accept_downloads=True`:
- `tempfile.mkdtemp()` is called in `__init__`, result stored as `self._downloads_dir: str`
- `BrowserConfig` is constructed with `downloads_path=self._downloads_dir`
- On `__aexit__`, `shutil.rmtree(self._downloads_dir, ignore_errors=True)` runs after `crawler.close()`

`downloads_path` is a `BrowserConfig` constructor param — it cannot be changed per-call. `mkdtemp()` MUST run in `__init__`, not inside `download_step()`.

### New method: `download_step()`

```python
async def download_step(
    self,
    *,
    click_js: str,
    wait_seconds: float = 10.0,
) -> bytes:
```

- Runs `click_js` via `js_code_before_wait` in the **current session page** (i.e., the listing page already loaded by a prior `step()` call).
- Uses `js_only=True` so the page is NOT re-navigated.
- Waits `wait_seconds` via `delay_before_return_html` to allow the browser download to complete.
- Reads and returns `Path(result.downloaded_files[0]).read_bytes()`.
- **Guard:** if `result.downloaded_files` is empty after the wait, raises `Crawl4aiError` with a message naming the wait duration. Never returns empty bytes silently.

Internal `arun()` call:
```python
cfg = CrawlerRunConfig(
    session_id=self.session_id,
    cache_mode=CacheMode.BYPASS,
    js_code_before_wait=click_js,
    js_only=True,
    page_timeout=int(wait_seconds * 1_000) + 10_000,
    delay_before_return_html=wait_seconds,
)
r = await self._crawler.arun(url="", config=cfg)
files = getattr(r, "downloaded_files", None) or []
if not files:
    raise Crawl4aiError(
        f"download_step: no file in downloaded_files after {wait_seconds}s — "
        "anchor may not have been found or clicked"
    )
return Path(files[0]).read_bytes()
```

---

## Change 2 — `ingest/pipelines/collier_permits/fetcher.py`

Full rewrite of the fetch layer. Public interface (`discover_issued_reports`, `download_month`, `download_latest_issued`, `MonthlyReport`) is unchanged — `pipeline.py` requires zero edits.

### New internals

**`_fetch_listing_html() -> str`** (private, sync)
```
asyncio.run(_fetch_listing_html_async())
```

**`_fetch_listing_html_async() -> str`** (private, async)
```python
async with Crawl4aiSession(session_id="collier_listing") as s:
    return await s.step(LISTING_PAGE_URL)
```
Returns `result.html`. Raises `Crawl4aiError` on failure (propagates up).

**`discover_issued_reports() -> list[MonthlyReport]`** (public, unchanged signature)
```python
html = _fetch_listing_html()
return _parse_listing_html(html)
```
`_parse_listing_html(html)` extracts the same logic currently inline in `discover_issued_reports()`.

**`_build_click_js(xlsx_url: str) -> str`** (private, pure function)

Generates JS that finds the XLSX anchor by `href` (tries absolute URL and the raw `href` attribute value, both full and root-relative) and clicks it. Logs to `console.error` if not found (catchable via `capture_console_messages` in future debugging; does not raise from JS since we guard on `downloaded_files`).

```python
def _build_click_js(xlsx_url: str) -> str:
    rel = xlsx_url.replace(BASE_URL, "") if xlsx_url.startswith(BASE_URL) else xlsx_url
    return f"""(() => {{
  const a = Array.from(document.querySelectorAll('a[href]')).find(
    el => el.getAttribute('href') === {json.dumps(xlsx_url)} ||
          el.getAttribute('href') === {json.dumps(rel)}
  );
  if (a) {{ a.click(); }}
  else {{ console.error('collier_permits: XLSX anchor not found for href: ' + {json.dumps(xlsx_url)}); }}
}})();"""
```

**`_download_async(hit: MonthlyReport) -> bytes`** (private, async)

Opens ONE session that handles both the listing navigation AND the download click:
```python
async with Crawl4aiSession(session_id="collier_permits_dl", accept_downloads=True) as s:
    await s.step(LISTING_PAGE_URL)          # navigate + authenticate in browser
    click_js = _build_click_js(hit.url)
    return await s.download_step(click_js=click_js, wait_seconds=10.0)
```

**`download_month(year, month) -> (bytes, str)`** (public, unchanged signature)
```python
reports = discover_issued_reports()
hit = next((r for r in reports if r.year == year and r.month == month), None)
if hit is None:
    ...  # same ValueError as now
filename = hit.url.rsplit("/", 1)[-1]
xlsx_bytes = asyncio.run(_download_async(hit))
if xlsx_bytes[:4] != b"PK\x03\x04":
    raise ValueError(f"Collier XLSX for {filename} is not a valid ZIP/xlsx — proxy may have served an error page")
return xlsx_bytes, filename
```

`download_latest_issued()` calls `download_month(latest.year, latest.month)` — no change needed.

### Removed imports
- `from ingest.lib.firecrawl_client import scrape_with_actions`
- `from ingest.lib.spider_client import download_binary`

### Added imports
- `import asyncio, json`
- `from ingest.lib.crawl4ai_client import Crawl4aiSession, Crawl4aiError`

---

## Change 3 — `.github/workflows/collier-permits-monthly.yml`

### Hold cron, add dry-run dispatch (mirrors Lee pattern)

```yaml
on:
  # SCHEDULE HELD (2026-06-16): crawl4ai migration landed. Schedule re-enables after:
  # (1) GHA dry-run probe passes green (confirms UndetectedAdapter clears Akamai from
  #     datacenter IP, XLSX download succeeds, size logged).
  # (2) collier_first_lake_ingestion gate clears.
  #   schedule:
  #     - cron: "0 12 15 * *"
  workflow_dispatch:
    inputs:
      month:
        description: "YYYY-MM to ingest (default: previous calendar month)"
        required: false
        default: ""
      dry_run:
        description: "Dry run — download and parse only; skip geocode + dlt write"
        required: false
        default: "true"      # ← DEFAULT ON for probe safety
```

### Add Chromium install step (after `pip install -r ingest/requirements.txt`)

```yaml
- name: Install Chromium for crawl4ai
  run: |
    python -m playwright install --with-deps chromium
    python -m patchright install chromium
```

### Remove FIRECRAWL_API_KEY and SPIDER_API_KEY from env block

Only `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `DESTINATION__POSTGRES__CREDENTIALS` remain.

### Dry-run output gate

`pipeline.py`'s `main()` already prints `"collier_permits dry-run: {len(rows)} rows from {filename} (geocode + dlt skipped)"`. Add XLSX size print to `pipeline.py` dry-run path:

```python
if args.dry_run:
    xlsx_bytes, filename = ...
    print(f"XLSX size: {len(xlsx_bytes):,} bytes")   # ← pin real size on first GHA run
    df = pd.read_excel(...)
    rows = normalize_df(df, source_file=filename)
    print(f"collier_permits dry-run: {len(rows)} rows from {filename} (geocode + dlt skipped)")
    return 0
```

---

## Gate Order

```
1. fetcher.py rewrite + crawl4ai_client.py enhancements
      ↓
2. GHA dry-run probe (workflow_dispatch, dry_run=true)
   → must pass green: Akamai bypass confirmed, XLSX downloaded, size logged, row count printed
      ↓
3. open check: collier_first_lake_ingestion
      ↓
4. first live run (workflow_dispatch, dry_run=false)
      ↓
5. re-enable collier cron (uncomment schedule)
```

**Independent from Lee gate.** `lee_permits_first_lake_ingestion` and `collier_first_lake_ingestion` do not block each other.

---

## What Is NOT Changed

- `pipeline.py` — no edits (public interface of `fetcher.py` is preserved)
- `test_pipeline.py` — all tests mock `download_month` / `discover_issued_reports`; no changes needed
- `normalizer.py`, `geocoder.py`, `constants.py` — untouched
- `cadence_registry.yaml` — no structural changes; add a comment noting crawl4ai migration date

---

## Verified Implementation Constraints (post-review nits)

**NIT-1 — Context-manager mandatory at both call sites.**
`shutil.rmtree` fires only inside `__aexit__`. A bare `Crawl4aiSession(...)` constructor call (without `async with`) leaks the `mkdtemp` temp dir. Both call sites in `fetcher.py` MUST use `async with Crawl4aiSession(...) as s:`. No bare constructor calls are permitted.

**NIT-2 — Distinct session IDs required.**
crawl4ai reuses the same browser context when two sessions share the same `session_id`. The two sessions in `fetcher.py` MUST use distinct IDs:
- Listing-only session (inside `_fetch_listing_html_async`): `session_id="collier_listing"`
- Download session (inside `_download_async`): `session_id="collier_download"`
Both use `async with`, so each session is closed before the next opens. No concurrent sessions; no ID collision.

**NIT-3 — Zero dead env refs after dropping Firecrawl/Spider.**
Before the PR is pushed, grep `collier-permits-monthly.yml` and `fetcher.py` (including all imports) for any remaining reference to `FIRECRAWL_API_KEY`, `SPIDER_API_KEY`, `firecrawl_client`, or `spider_client`. Zero hits required. A leftover env lookup fails the dry-run with a missing-key error that masks the WAF-bypass result.

---

## Spec Self-Review

- No TBDs or vague requirements.
- `download_step()` failure guard specified (empty `downloaded_files` → `Crawl4aiError`).
- `mkdtemp()` placement is explicit (`__init__`, not `download_step`).
- Two-session pattern with distinct IDs is explicit; context-manager usage is mandatory.
- XLSX size will be pinned on first GHA dry-run; size is irrelevant to the native-download mechanism (no base64 truncation risk).
- Gate order is fully specified and decoupled from Lee gate.
