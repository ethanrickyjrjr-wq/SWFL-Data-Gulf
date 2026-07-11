# crawl4ai — the rules of the road (so we stop rediscovering this every week)

**Locked 07/11/2026.** crawl4ai is the ONLY web-crawl tool (RULE 0.4). Firecrawl is never used.
The shim `crawl4ai <url>` lives at `C:\Users\ethan\.local\bin\` and pins the venv at
`C:\Users\ethan\crawl4ai-venv`. All crawl4ai files are gitignored (`*crawl4ai*`) — **this doc is the
one exception** (no `crawl4ai` in the *filename*), so the rules survive in git while the tool itself
stays local.

The 07/10/2026 install added a cache layer + an anti-bot escalation ladder + a `--probe` recon mode.
Nobody was using them. Here are the rules so we do.

---

## RULE A — a page that comes back empty/nav-chrome is NOT a dead end. PROBE it.

The single most-repeated mistake: run bare `crawl4ai <url>`, get junk, give up, fall back to
curl/WebSearch. Wrong. When a fetch looks empty, short, or is just nav chrome:

```
crawl4ai --probe <url>            # climbs plain → stealth → undetected → +stealth, tells you the winner
crawl4ai --probe <url> --all-tiers -o json   # full evidence matrix, don't stop at first breakthrough
crawl4ai --probe <url> --headed   # last resort: visible browser tier
```

The probe tells you the exact command that breaks through. Then run THAT command. Verified 07/11/2026:
`floridarevenue.com` breaks through on `plain` (200, 28 KB) — it was never bot-protected; the "empty"
results were a wrong URL (a real 404) and grep-and-dismiss (see Rule B).

## RULE B — READ the markdown. Do not `grep | head` it and declare it empty.

`crawl4ai <url> | grep -i thing | head` returning nothing means **your grep missed**, not that the page
is empty. Pages render as full markdown; the fact you want is usually there under a heading you didn't
grep for. If the content matters, read it — pipe to a file and open it, or read the whole stdout. Grep is
for locating within known-good content, never for deciding a crawl "failed."

## RULE C — escalate deliberately, cheapest tier first.

| Tier | Command | When |
| --- | --- | --- |
| plain | `crawl4ai <url>` | default; provably live (bypasses cache) |
| stealth | `crawl4ai --stealth <url>` | light navigator/plugin patches; mild bot walls |
| undetected | `crawl4ai --undetected <url>` | UndetectedAdapter; Cloudflare/DataDome class |
| both | `crawl4ai --undetected --stealth <url>` | final headless escalation |
| headed | add `--headed` | escalate when all headless tiers are blocked |

Don't jump to `--undetected` reflexively — it's slower. Probe first, use the tier the probe names.

## RULE D — use the cache for reliability, never for freshness-critical reads.

```
crawl4ai --cache <url>            # live crawl + write-through cache (etag/last-modified validators)
crawl4ai --cache-fallback <url>   # live first, serve cached copy if the live fetch fails  ← reliability
crawl4ai --cached-only <url> --max-age 24h   # instant DB read, no browser, only if fresh enough
crawl4ai --cache-status <url>     # metadata + age, no fetch
```

`--cache-fallback` is the "make it work every time" flag for flaky-but-static sources. But RULE 0.4's
default is provably-live: bare `crawl4ai <url>` and `--fresh` always hit the network. Never serve a cached
number as if it were a live read — cite the fetch, not the cache.

## RULE E — crawl4ai is for WEB PAGES (HTML→markdown). It is NOT for JSON/REST APIs.

This is the distinction that got blurred on 07/11/2026. An ArcGIS FeatureServer, a Census API, a
PostgREST view — those are **API calls**, done with `curl`/`requests`/the SDK, not crawl4ai. When those
are flaky it is *not* a crawl4ai problem and the anti-bot ladder won't help. See the source-liveness
handoff for how to check REST/ArcGIS sources correctly. crawl4ai's job starts and ends at rendered pages.

## RULE F — throttling is real; space your calls.

Hammering a host with rapid sequential fetches (or ArcGIS with rapid `curl`s) trips WAF/rate limits and
you get timeouts that look like the source being down. One request, wait, next. If you must sweep many
URLs, use crawl4ai's own deep-crawl/batch rather than a shell `for` loop of fetches.

## RULE G — re-install / verify (from CLAUDE.md RULE 0.4, kept here so it's one page)

```
# verify
C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -c "import crawl4ai; print(crawl4ai.__version__)"
# reinstall
uv venv C:\Users\ethan\crawl4ai-venv --python 3.12 && uv pip install --python C:\Users\ethan\crawl4ai-venv crawl4ai && C:\Users\ethan\crawl4ai-venv\Scripts\python.exe -m playwright install chromium
```

---

### The one-line version
Probe when empty → run the tier it names → read the markdown (don't grep-dismiss) → `--cache-fallback`
for reliability → and never point crawl4ai at a REST API.
