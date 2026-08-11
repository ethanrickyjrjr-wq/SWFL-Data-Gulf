# crawl4ai launcher shim — cache modes design

**Date:** 07/10/2026
**Status:** BUILT + verified live 07/10/2026 (T1–T14 below). Machine-local tooling.
**Scope:** machine-local tooling only. This file and every artifact it describes are
covered by the `.gitignore` `*crawl4ai*` pattern (verified: `.gitignore:208`). **Nothing
here is ever `git add`-ed or pushed** — CLAUDE.md RULE 0.4 + memory `crawl4ai-never-github`.

---

## 1. Problem

Brandfetch's Brand Context API added a `cachedOnly=true` query parameter (verified live
07/10/2026, https://docs.brandfetch.com/brand-context-api/overview#skip-crawling-cached-only):
return a cached brand context instantly (`200`) or `204 No Content` on a miss, and **never**
crawl the domain live. It is a latency guarantee for interactive frontends — trade coverage
for instant, no-crawl response.

Two facts about our current crawl4ai usage, both established by reading the installed source
(crawl4ai 0.9.0 at `C:\Users\ethan\crawl4ai-venv`), not memory:

1. **We never cache anything.** Our launcher shim (`~/.local/bin/crawl4ai-launcher.py`) shells
   to the official `crwl` CLI, and `crwl crawl` hardcodes `--bypass-cache` with `default=True`
   and no override (`crawl4ai/cli.py:1025`). Every crawl we have ever run skipped the cache in
   both directions. The cache DB (`~/.crawl4ai/crawl4ai.db`) sits effectively empty.
2. **crawl4ai has no cache-only mode.** Its `CacheMode` enum is ENABLED / DISABLED / READ_ONLY
   / WRITE_ONLY / BYPASS. On a cache miss, the crawler loop *always* falls through to a live
   fetch (`crawl4ai/async_webcrawler.py:380`, `if not cached_result or not html:`). `READ_ONLY`
   means "don't write," not "don't crawl." There is no Brandfetch-style fail-fast on miss.

So the Brandfetch capability does not exist in crawl4ai today, and even if we wanted plain
caching, the `crwl` CLI cannot express it — cache-enabled runs must go through the Python
`AsyncWebCrawler` / `CacheMode` API directly.

## 2. Goal

Give the shim an opt-in set of **typed lookup modes** — different ways to get the data/docs we
need — without ever weakening the provably-live default that RULE 0.4 depends on. Bare
`crawl4ai <url>` must behave **exactly** as it does today (live, bypass) so no research fetch
is ever silently served from stale cache.

## 3. Non-goals (considered and deliberately deferred)

Recorded so the decision is explicit and not re-litigated:

- **Stealth crawling (UndetectedAdapter) + page actions.** Real capability we need (Lee Accela,
  memory `crawl4ai-replaces-firecrawl-accela-proven`), but it is *fetch capability*, not
  caching, and it belongs to the in-repo ingest `crawl_client.py` path — a different surface
  than this machine-local shim. Out of scope here.
- **PDF content strategy (DBPR docs).** Same reason: a fetch-strategy concern owned by the
  ingest path, not the shim.
- **Bare retry/backoff.** Adjacent, but `--cache-fallback` (below) covers the "source is down
  right now" case that has actually bitten us (Accela GHA-IP block risk, twice-frozen Anthropic
  account, timed-out captures). Plain retry is a smaller win; park until a flaky-but-uncached
  source recurs.
- **A real `CacheMode.CACHE_ONLY` upstream.** The genuinely missing crawl4ai feature. Belongs
  as a PR to unclecode/crawl4ai, NOT a local patch (any `uv pip install` upgrade would blow a
  patch away, and it violates vendor-first). Parked as a separate, deliberate future choice.

## 4. Approach (chosen: thin launcher + cache helper module)

Rejected alternatives:
- *Fatten the launcher* — inline all cache logic in `crawl4ai-launcher.py`. Mixes two backends
  in one file; the launcher stops being a thin wrapper.
- *Patch/fork crawl4ai or crwl* — rejected. Upgrades erase it; violates vendor-first.

Chosen shape — two files, both machine-local, both `*crawl4ai*`-gitignored:

- **`~/.local/bin/crawl4ai-launcher.py`** stays the router it already is. It reads `argv`,
  classifies, and dispatches:
  - No cache flag, or `--fresh` → existing path verbatim: `crwl crawl <url> -o md` (bypass,
    live). Not one line of this path changes. Existing `-o`/`--output` passthrough and bare
    `crwl`-subcommand passthrough stay exactly as today.
  - Any cache flag → hand the whole `argv` to `crawl4ai_cache.py` and return its exit code.
- **`~/.local/bin/crawl4ai_cache.py`** (new sibling) owns all cache behavior via the stable
  `AsyncWebCrawler` + `CacheMode` API and direct `async_database` reads.

The RULE 0.4 provably-live guarantee is thereby *physically isolated* in the untouched `crwl`
path. All new behavior is confined to one new, easily-reasoned-about, deletable file.

The Python-API import cost (heavier than the `crwl` subprocess spawn) lands **only** on
cache-flag invocations. The default live path still shells straight to `crwl` — the common case
is never taxed.

## 5. The typed mode surface

Every mode is opt-in. Absence of any flag = today's behavior, byte-for-byte.

### Core — built now

| Invocation | Behavior |
|---|---|
| `crawl4ai <url>` | Unchanged. `crwl` bypass, live. RULE 0.4 path, untouched. |
| `crawl4ai --fresh <url>` | Explicit alias for the above — lets "I need this live" be said out loud. Behavior identical to bare. |
| `crawl4ai --cache <url>` | Read/write with smart ETag/Last-Modified revalidation (`CacheMode.ENABLED`, `check_cache_freshness=True`). Serves cache only if the validator says fresh; else re-crawls and rewrites. Also the path that *populates* the cache for later `--cached-only` hits. |
| `crawl4ai --cached-only <url>` | The Brandfetch move. Direct `aget_cached_url()` DB read, **no browser**. Hit → markdown to stdout, exit 0. Miss → nothing on stdout, one-line stderr note, exit 3 (our "204"). Instant by construction. |

### Parked — specced, ready to add when a real need appears

Each maps to one confirmed `async_database` call (`aget_cached_url`, `aget_cache_metadata`,
`aget_total_count`), so adding one later is a small isolated edit, no redesign.

- `--cache-fallback <url>` — **the resilience lane.** Try live first (fresh, honest); if the
  fetch **fails / is blocked / times out**, serve the last-good cached copy instead of returning
  nothing, with a **loud stderr stale-warning naming the cache date**. Degraded-but-disclosed;
  the four-lane ethos exactly (RULE 0.7 — never handcuff a build; fill from the next lane,
  disclose, never invent). Opt-in, never default, never silently substitutes.
- `--cache-status <url>` — is this cached, and how old? Prints timestamp/validators, no fetch.
  The "check before you crawl" lookup.
- `--cache-list [domain]` — enumerate what's cached, optionally filtered by domain. The "what do
  we already hold" lookup.
- `--cache-clear <url | --all>` — purge one URL or wipe. Escape hatch for a known-bad entry.
- `--cache-warm <url...>` — pre-populate cache for a set of URLs so later `--cached-only` hits
  (the Brandfetch "make a standard request to populate" step, batched).
**BUILT change:** the parked `--stale-ok` was superseded by a cleaner, more API-like
`--max-age <D>` modifier on `--cached-only` — return the cached entry only if it is fresher than
the window (`24h`/`30m`/`7d`/raw seconds), else a clean miss (exit 3). More useful than an
unconditional stale-return, and every cached-only hit already discloses age on stderr. All of
`--cache-status`, `--cache-list`, `--cache-warm`, `--cache-clear`, and `--cache-fallback` were
built now (not parked) per operator "make it as good as you possibly can — an API wherever we go."

## 6. Control flow

```
argv → launcher
        ├─ no cache flag / --fresh ──► crwl crawl <url> [-o md]   (live, bypass — UNCHANGED)
        └─ any cache flag ──────────► crawl4ai_cache.py argv → exit code
                                        ├─ --cached-only : aget_cached_url() DB read, no browser
                                        ├─ --cache       : AsyncWebCrawler.arun(ENABLED, validate)
                                        └─ (parked modes route here too)
```

`--cached-only`: open the SQLite cache via `async_database`, `aget_cached_url(url)`. Hit →
`result.markdown` (or requested `-o` shape) to stdout, exit 0. Miss → stderr note, exit 3. Never
launches a browser.

`--cache`: `AsyncWebCrawler.arun(url, CrawlerRunConfig(cache_mode=CacheMode.ENABLED,
check_cache_freshness=True))` — the one path that reads-with-validation *and* writes, so it also
populates the cache for later `--cached-only`.

Output contract is identical to today regardless of backend: clean markdown to stdout by
default, `-o json` etc. respected, only real content on stdout (all diagnostics to stderr).

## 7. Error handling & exit codes

Distinct exit codes so callers branch without parsing text:

- `0` — success (live crawl succeeded, or cache hit).
- `3` — cache miss under `--cached-only`. Not an error; a clean "we don't hold it." Stdout
  empty; stderr one line `cached-only: no cached entry for <url>`. Our `204`. Chosen 3 to stay
  clear of `crwl`'s own 1/2.
- `4` — cache backend couldn't reach the DB (missing/locked SQLite). Stderr says so; suggests
  re-running without the cache flag to go live.
- passthrough — the live path returns whatever `crwl` returns, verbatim. Never masked/remapped.

Guardrails baked in:

- **Never silently substitute cache for live.** A `--cached-only` miss never falls through to a
  crawl — that is the whole invariant. Want a fallback? Run the plain command; the tool won't
  decide that for you. (`--cache-fallback` is the *only* mode that blends the two, and it does so
  loudly and only after a live-fetch *failure*, never on a plain miss.)
- **Never serve unvalidated-as-validated.** `--cache` runs `check_cache_freshness=True`. If a
  vendor sends no ETag/Last-Modified (Mintlify-hosted docs like Brandfetch's may not), the 0.9
  validator treats UNKNOWN as stale and re-crawls (verified: `STALE or UNKNOWN → force recrawl`,
  `async_webcrawler.py:312-319`). Failure mode is "did extra work," never "served stale."
- **Encoding.** Force `PYTHONIOENCODING=utf-8` inside the cache backend so the `⌘`/charmap
  crash hit this session (Windows console cp1252) can't resurface.
- **Stale flag is loud.** Parked `--stale-ok` is the only mode returning an unvalidated entry;
  it prints a stderr warning naming the cache age every time.

## 8. Testing

Files are machine-local and gitignored → a local smoke script (also gitignored), not repo CI:

1. `--cached-only` on a never-fetched URL → exit 3, empty stdout.
2. `--cache` on a fresh URL → exit 0, DB populated (assert `aget_total_count()` incremented).
3. `--cached-only` on that same URL immediately after → exit 0, same markdown, timed sub-second
   to confirm no browser launch.
4. bare `crawl4ai <url>` → still bypasses (assert DB count unchanged), proving the live path
   never touches cache.
5. `--fresh <url>` → behavior identical to bare.

## 9. Build registration — RESOLVED

Operator (07/10/2026): **skip `new-build.mjs`.** Machine-local tooling with no prod surface — a
`*_live_verify` check has nothing to verify. The live drives in §11 ARE the verification.

## 11. Live verification — 07/10/2026 (all passed)

Files: `~/.local/bin/crawl4ai-launcher.py` (router) + `~/.local/bin/crawl4ai_cache.py` (backend),
both outside every repo, both unpushable.

- T1  `--cached-only` on a never-fetched URL → exit 3, empty stdout, clean stderr note.
- T3  `--cache` live crawl of example.com → exit 0, clean markdown to stdout, 2.66s.
- T4  `--cached-only` same URL → exit 0, **0.86s, no browser**.
- T5  cached content **byte-identical** to the live crawl.
- T6  `--cached-only --max-age 0s` → exit 3 (freshness gate treats all as stale).
- T7  `--cache-status -o json` → shows `cached_at`, age, and validators (example.com sends
      Last-Modified, so smart revalidation is live).
- T8b `--cache-fallback` with a forced live outage on the real cached row → exit 0, serves the
      last-good copy with the loud stale-disclosure naming the cache date.
- T9  `--cache-fallback` on an unresolvable + uncached URL → exit 3, empty stdout.
- T10 `--cache-clear <url>` → removed 1 entry (also confirms a malformed/legacy row degrades to a
      clean miss, never a crash).
- T11 **INVARIANT:** bare `crawl4ai <url>` through the launcher → live content, cache count
      unchanged (14→14). The live path never writes cache; RULE 0.4 guarantee holds.
- T12 launcher routes `--cached-only` to the backend (from_cache=true).
- T13 launcher `--fresh` strips the flag and serves live.
- T14 both files confirmed at `~/.local/bin`, physically outside the repo.

## 10. Verification sources (all crawl4ai / code-probe, 07/10/2026)

- Brandfetch `cachedOnly` semantics — https://docs.brandfetch.com/brand-context-api/overview
  (crawled live).
- crawl4ai cache modes — https://docs.crawl4ai.com/core/cache-modes/ (crawled live) +
  installed source: `CacheMode`/`CacheContext` (`async_webcrawler.py:264-348, 380`),
  `crwl` bypass default (`cli.py:1025`), DB API + path (`async_database.py:17-21, 299, 392,
  590`).
