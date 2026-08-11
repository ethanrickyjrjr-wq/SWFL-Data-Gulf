# crawl4ai launcher shim — anti-bot (stealth / undetected) modes design

**Date:** 07/10/2026
**Status:** BUILT + verified live 07/10/2026 (V0–V7 stealth/undetected + P1–P4 probe below).
Machine-local tooling.
**Scope:** machine-local tooling only. This file and every artifact it describes are covered
by the `.gitignore` `*crawl4ai*` pattern (verified: `git check-ignore` → `.gitignore:208`).
**Nothing here is ever `git add`-ed or pushed** — CLAUDE.md RULE 0.4 + memory
`crawl4ai-never-github`. Sibling to `2026-07-10-crawl4ai-shim-cache-design.md`.

---

## 1. Problem / origin

The cache-modes design (same date) §3 parked **stealth crawling (UndetectedAdapter)** as a
non-goal — real capability we need (Lee Accela, memory `crawl4ai-replaces-firecrawl-accela-proven`),
but argued it belonged to the in-repo ingest `crawl_client.py` path, not the machine-local shim.
Operator (07/10/2026) overrode: build it on the shim first ("work on it *with it*"), ingest path
later — surface answer **"Both, shim first."** Rationale: the shim is the smaller, unpushable,
machine-local piece; get the ad-hoc research lever in hand before touching committed ingest code.

Two facts, both established by probing the installed crawl4ai 0.9.0 source AND live vendor docs
(https://docs.crawl4ai.com/advanced/undetected-browser, crawled in-session 07/10/2026), not memory:

1. crawl4ai 0.9.0 exposes **two layerable anti-bot mechanisms**:
   - **Stealth Mode** — `BrowserConfig(enable_stealth=True)`. playwright-stealth patches:
     removes `navigator.webdriver`, emulates plugins, fixes fingerprint leaks. Minimal perf cost.
     Beats *basic* detection.
   - **Undetected Browser** — `UndetectedAdapter()` + `AsyncPlaywrightCrawlerStrategy(
     browser_config=…, browser_adapter=adapter)` handed to `AsyncWebCrawler(crawler_strategy=…)`.
     Deep browser patches. Moderate cost. Beats *sophisticated* detection (Cloudflare / DataDome).
   - Docs' recommended progression: regular+stealth → undetected → undetected+stealth; and
     `headless=False` "can be detected easier" → headed evades better.
2. A **real latent bug** in the shim's live path, hit *this session*: bare `crawl4ai <url>` on a
   page whose content/logs contain an emoji (`U+274C` ❌) crashes with Windows cp1252
   `'charmap' codec can't encode`. The `crwl` subprocess never got `PYTHONIOENCODING=utf-8`
   (the cache backend already forces it internally; the launcher's live dispatch did not).

## 2. Goal

Give the shim two opt-in anti-bot fetch modes — an escalation ladder to punch through a bot wall —
without weakening the provably-live default (RULE 0.4) or entangling with the cache read path.
Fix the encoding bug in the same pass (one line, and it bit us today).

## 3. Approach (chosen: two composable flags in the existing backend)

Anti-bot behavior lives in `crawl4ai_cache.py` alongside the cache modes (same "API wherever we
go" surface, same exit-code contract). The launcher routes `--stealth`/`--undetected` to the
backend exactly as it routes the cache flags; the bare/`--fresh` live path is untouched.

Rejected: auto-escalating single flag (plain→stealth→undetected). Hides how hard it worked, can
silently launch the heavy browser, and "was it blocked?" detection is fuzzy. **No magic** — you
pick the level; progressive enhancement is documented, run by hand.

## 4. The mode surface

| Invocation | Behavior |
|---|---|
| `crawl4ai --stealth URL` | `enable_stealth=True`. Light, fast. Basic detection. |
| `crawl4ai --undetected URL` | `UndetectedAdapter`. Heavy. Cloudflare/DataDome class. |
| `crawl4ai --undetected --stealth URL` | Both layered — final escalation tier. |
| `--headed` (modifier) | Visible browser window. Escalate when a headless run is still blocked. |
| `crawl4ai --probe URL` | **Recon.** Climb the ladder plain→stealth→undetected→+stealth, classify each tier on real `CrawlResult` fields, stop at the first breakthrough, and print the exact command to use. `--headed` appends a headed tier; `--all-tiers` runs the full matrix; `-o json` for machine output. |

### Probe mode (the recon lever)

The reconnaissance tool that makes the top-20 directory crawls and the Colliers wall cheap:
one command answers "is this crawlable, and how hard?" instead of four manual escalations.

- **Ladder:** `plain → stealth → undetected → undetected+stealth` (+ `+headed` with `--headed`).
  Each tier fetches with `CacheMode.BYPASS` (pure diagnostic — no cache pollution) and a
  `page_timeout` + a hard `asyncio.wait_for` outer bound, so a hanging tier can't sink the probe.
- **Classifier (`classify_tier`)** reads only real fields — `success`, `status_code`,
  `error_message`, markdown length. A tier is BLOCKED on: exception, `success=False`, a status in
  `{401,403,407,409,429,503,509}`, a **hard** challenge marker (`just a moment` / `attention
  required` / `cloudflare ray id` / `datadome` / `px-captcha` / …), a **soft** marker (`captcha` /
  `cloudflare` / `access denied`) *only on a challenge-sized page* (<20KB), or an empty shell (≤30B).
  Otherwise BREAKTHROUGH.
- **Two-tier markers (fixed live 07/10/2026).** The first real probe (johnrwood.com) returned
  http 200 + 40KB of real agent data yet was flagged `blocked (captcha)` — the match was the
  ubiquitous "This site is protected by reCAPTCHA and the Google Privacy…" footer. A bare word is
  NOT proof of a wall. Fix: **hard markers** = unambiguous interstitial phrases (block at any size);
  **soft markers** = ambiguous words (block only when the page is challenge-sized, <20KB); and the
  reCAPTCHA *widget* mention is stripped before the soft scan (a form widget is not a wall). Verified
  9→7/7 synthetic paths + JRW now breaks through at `plain`.
- **Length is a WEAK signal, so it never blocks** (learned the hard way — a 250B floor false-flagged
  example.com's genuine 166B page as "nav-only"). Below 800B it breaks through with an honest
  `thin, verify real content` annotation; the human judges nav-vs-article since generic code can't.
- **Unsinkable by construction:** every tier is independently sandboxed; a crash/timeout/block in
  one tier is recorded and the ladder keeps climbing; a verdict is ALWAYS emitted (breakthrough +
  recommended command, or `BLOCKED at all N tiers` with the closest tier + escalation hint).
- **Exit:** 0 if any tier broke through, 4 if all blocked.

Six deliberate decisions:

1. **No magic escalation** — one flag = one level, matches the cache surface.
2. **Headless default `True`, `--headed` to escalate** — a CLI that pops a Chrome window on every
   crawl is disruptive; keep it quiet by default, headed is the "still blocked?" lever.
3. **Live fetch, write-through cache** — `CacheMode.WRITE_ONLY`: never reads cache (you asked to
   punch through → you want live), always persists, so a later `--cached-only URL` serves the
   expensive stealth result for free. Stealth feeds the one cache.
4. **Encoding fix folded in** — `os.environ.setdefault("PYTHONIOENCODING","utf-8")` at launcher
   `main()` start; subprocess inherits it, so both `crwl.exe` and the backend are UTF-8 safe.
5. **No random UA / proxy yet (YAGNI)** — `enable_stealth` + `UndetectedAdapter` already patch
   fingerprints. Parked until a block survives both modes.
6. **Same exit codes** — `0` success, `2` usage error (bad combo / missing URL / `--headed` alone),
   `4` fetch failed or empty (may still be blocked → escalate). Clean md/json to stdout.

## 5. Guardrails

- Anti-bot flags **cannot** combine with a `--cache*` mode (they already write-through) → exit 2.
- `--stealth`/`--undetected` require a positional URL → exit 2 if missing.
- `--headed` alone (no anti-bot mode) → exit 2.
- A bare URL with no mode flag → exit 2 with a pointer to the live default `crawl4ai <url>`.
- The RULE 0.4 live path stays physically isolated in the untouched `crwl` dispatch.

## 6. Live verification — 07/10/2026 (all passed)

- **V0** `--help` renders — argparse restructure (group `required=False` + positional url) intact.
- **V1** `--stealth https://example.com` → exit 0, clean markdown, `stealth (headless): … crawled and cached`.
- **V2** `--cached-only https://example.com` immediately after → HIT (write-through proven).
- **V3** `--undetected https://example.com` → exit 0, adapter path runs, no crash.
- **V4** guards: `--stealth --cache` → 2 · `--stealth` (no url) → 2 · `--headed URL` (no mode) → 2.
- **V5** encoding fix: `crawl4ai https://docs.crawl4ai.com/advanced/undetected-browser` **through the
  launcher** → heading present ×8, **0 charmap errors** (this exact page crashed pre-fix this session).
- **V6** `--cache-list` → 15 entries (cache grew from the anti-bot write-throughs).

- **V7 (engage check, bot.sannysoft.com)** — the anti-bot machinery demonstrably engages:
  `--undetected` and `--stealth` both yield `WebDriver (New): missing (passed)` +
  `WebDriver Advanced: passed` on the standard detector (a vanilla Playwright browser *fails*
  these). HONEST LIMIT: crawl4ai 0.9.0's *baseline* browser already passes the webdriver row too,
  so this detector can't isolate `enable_stealth`'s marginal delta — its real value is on
  CDP/Cloudflare-class signals (the docs' table rates stealth "Partial" on CDP, undetected full),
  which is exactly the environment-flaky tier below.

**Probe mode (P-series, 07/10/2026):**
- **P1** `--probe https://example.com` → breaks through at tier 1 (plain), stops early, honest
  `thin 166B, verify` note. Recommends `crawl4ai <url>`.
- **P2** guards: `--probe --undetected` → 2 · `--probe` (no url) → 2 · `--all-tiers` alone → 2.
- **P3** `--probe https://www.colliers.com/en/research --all-tiers` → **all four tiers http 200,
  ~24KB, no challenge** from a residential IP. Real intel: the registry's Colliers block
  (cadence_registry.yaml:1191) is IP-reputation-based (fires on GHA datacenter IPs, per the
  swflinc.com note :948), NOT a universal challenge. The probe ruled out HTTP/challenge blocking;
  it can't certify 24KB is content vs nav (the honest THIN limit).
- **P4 (classifier unit test, deterministic)** 9/9 synthetic paths correct: breakthrough · thin-note ·
  empty · http 403 · http 429 · Cloudflare marker · DataDome marker · failed-crawl · exception.
  This is the unsinkable proof — the block/degradation verdicts fire correctly without needing a
  flaky live block.

**Live recon sweep (P5, 07/10/2026) — first real fleet against SWFL brokerages:**
- **The iceberg:** johnrwood.com flagged `blocked (captcha)` on a 40KB http-200 page that a parallel
  live crawl proved fully readable (real agent-directory URLs extracted). Root cause = reCAPTCHA
  footer boilerplate. Fixed (two-tier markers, above); JRW now breaks through at `plain`.
- **Crawlability matrix (homepages, post-fix):** 7/8 break through at the cheapest `plain` tier —
  johnrwood ✓, downingfrye ✓, royalshellrealestate ✓, mvprealty ✓ (301 redirect stub), premierplusrealty ✓,
  viprealty ✓, domainrealty ✓ (odd status 218, content fine). **1 real block:** premiersothebysrealty
  throws **http 429 at ALL 4 tiers** (undetected+stealth included) — server-side rate-limit /
  IP-reputation, NOT a challenge; `--headed` won't beat a 429. Same class as the Colliers (P3) and
  swflinc GHA-IP blocks: the wall is *who's asking*, not *how you ask*. Escalation lane for these =
  residential proxy / throttle, not heavier browser stealth.
- **Contact-data reality (the actual data goal):** JRW roster page yields a wall of real 239-area SWFL
  agent **phones**; individual `/listings/agent/<name>/` profiles expose a per-agent phone but only the
  generic `customercare@johnrwood.com` — **per-agent emails are gated behind a contact form.** The
  DBPR-CSV gap (names, no emails) restated at the source: for JRW-class sites the harvest is
  name+phone, and email needs a different lane (form-submit, or a data vendor).

Not hard-gated (environment-flaky, per §4): a genuinely bot-walled target proving stealth *beats*
a block that plain fails (e.g. the colliers.com challenge when hit from a datacenter IP).
The modes are wired verbatim to the documented + installed API, execute, engage the webdriver
patches, and write through — that is the honest verification boundary on machine-local tooling.

## 7. Verification sources (all crawl4ai / code-probe, 07/10/2026)

- Undetected/stealth API — https://docs.crawl4ai.com/advanced/undetected-browser (crawled live) +
  installed source: `BrowserConfig.enable_stealth`, `UndetectedAdapter`, `AsyncPlaywrightCrawlerStrategy(
  browser_adapter=…)`, `AsyncWebCrawler(crawler_strategy=…)`, `CacheMode.WRITE_ONLY`
  (`async_configs.py`, `browser_adapter.py`, `async_crawler_strategy.py:25,117`).

## 8. Follow-ups (parked, see session answer for detail)

- **Ingest-path port** — wire `enable_stealth`/`UndetectedAdapter` into in-repo `crawl_client.py`
  for the Accela/DBPR/Sunbiz production crawls (the "Both" second half).
- **Random UA / proxy rotation** — escalation tier past undetected+stealth+headed.
- **`--retry`/backoff modifier** — orthogonal resilience lane (cache doc §3 already parked it).
- **Upstream `CacheMode.CACHE_ONLY` PR** — the genuinely missing crawl4ai feature (cache doc §3).
