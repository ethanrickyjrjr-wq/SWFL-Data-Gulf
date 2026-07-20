# community_profiles Amenity Scrape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 9 tasks, 18 files, keywords: migration, schema, architecture

**Goal:** Fill `data_lake.community_profiles` (0 rows today) with golf structure, amenities, gated flag, home count, and (where a source has it) HOA fee range for SWFL marketed communities, so the already-built `communities-swfl` pack and `/r/communities-swfl/*` drill pages go live.

**Architecture:** A Python ingest pipeline (dlt + Postgres merge, matching `lee_permits`/`collier_permits` conventions) that: (1) reads a static seed list of candidate community names, (2) fetches each source's per-community page via `ingest.lib.crawl_client.fetch_page_markdown` (crawl4ai, no LLM), (3) regex-distills each source's markdown into a partial field-group dict, (4) merges partial dicts per community into one row matching the `community_profiles` schema, (5) writes via `dlt.pipeline(...).run()` with `write_disposition="merge"` on `community_slug`.

**Tech Stack:** Python, dlt, crawl4ai (`ingest.lib.crawl_client.fetch_page_markdown`), `ingest.lib.guards`, `ingest.lib.community_aliases`, pytest.

## Global Constraints

- No LLM call anywhere in this pipeline (ingest/CLAUDE.md: no paid web_search in scheduled pipelines) — every field comes from regex/string parsing of markdown text.
- Every written field's value must trace to one of the four verified sources (`naplesgolfguy.com`, `55places.com`, `realtyofnaples.com`, `realtyofnaplesfl.com/hoa-fee-comparison-by-community/`) — a source with no data for a field writes `None`, never a guess.
- `community_slug` is the dlt `primary_key` and the table's actual `PRIMARY KEY` (`migrations/20260706_community_profiles.sql:19`) — merge write disposition, never `replace`.
- Gate 4 (ingest/CLAUDE.md): this is a destructive-capable write to a Tier-2 table — guarded via `ingest.lib.guards.assert_min_rows` before the dlt write.
- Manual run only for v1 (no GHA cron, no cadence_registry entry) — matches the spec's decision and the pack's own `ttl_seconds: 180 days` comment.
- Reuse `ingest.lib.community_aliases.load_community_aliases()` / `build_pattern_index()` for slug lookup — do not invent a second alias system. When a discovered community has no existing entry, this pipeline appends one to `fixtures/community-aliases.json` (the same file `refinery/lib/subdivision-aliases.mts` reads) so a future parcel-side join benefits too.

---

## File Structure

```
ingest/pipelines/community_profiles/
  __init__.py                      # empty
  constants.py                     # table name, source base URLs, URL templates
  seed_communities.json            # static discovery seed — name + per-source URL slug guesses
  normalize.py                     # slugify() + normalize_community_name()
  distill_naplesgolfguy.py         # parse_naplesgolfguy_detail(markdown) -> dict
  distill_55places.py              # parse_55places_detail(markdown) -> dict
  distill_realtyofnaplesfl.py      # parse_hoa_comparison_page(markdown) -> list[dict]
  merge.py                         # merge_community_row(slug, label, partials: list[dict]) -> dict
  pipeline.py                      # dlt resource + orchestration + --dry-run CLI
  fixtures/
    naplesgolfguy_fiddlers_creek.md
    fiftyfive_places_heritage_bay.md
    realtyofnaplesfl_hoa_comparison.md
  test_normalize.py
  test_distill_naplesgolfguy.py
  test_distill_55places.py
  test_distill_realtyofnaplesfl.py
  test_merge.py
  test_pipeline.py
```

Each distill module owns one source's markdown shape only (single responsibility, matches `ingest/CLAUDE.md`'s existing per-source-file pattern seen in `lee_permits/scraper.py`). `merge.py` is the only place that knows the `community_profiles` column names, so a future field addition touches one file.

---

### Task 1: normalize.py — slug and name-matching

**Files:**
- Create: `ingest/pipelines/community_profiles/__init__.py` (empty)
- Create: `ingest/pipelines/community_profiles/normalize.py`
- Test: `ingest/pipelines/community_profiles/test_normalize.py`

**Interfaces:**
- Produces: `slugify(name: str) -> str`, `normalize_community_name(name: str) -> str` — used by every later task to key a community consistently across sources.

- [ ] **Step 1: Write the failing tests**

```python
# ingest/pipelines/community_profiles/test_normalize.py
from ingest.pipelines.community_profiles.normalize import slugify, normalize_community_name


def test_slugify_strips_apostrophe_and_lowercases():
    assert slugify("Fiddler's Creek") == "fiddlers-creek"


def test_slugify_collapses_whitespace_and_ampersand():
    assert slugify("Heritage Palms Golf & Country Club") == "heritage-palms-golf-country-club"


def test_normalize_strips_country_club_suffix():
    assert normalize_community_name("Heritage Bay Golf & Country Club") == "HERITAGE BAY"
    assert normalize_community_name("Heritage Bay") == "HERITAGE BAY"


def test_normalize_strips_cc_and_inc_suffixes():
    assert normalize_community_name("Grey Oaks Country Club") == "GREY OAKS"
    assert normalize_community_name("BAY COLONY COMMUNITY ASSOCIATION, INC.") == "BAY COLONY"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_normalize.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingest.pipelines.community_profiles.normalize'`

- [ ] **Step 3: Write minimal implementation**

```python
# ingest/pipelines/community_profiles/normalize.py
"""Slug + name-matching for the community_profiles amenity scrape.

Distinct from ingest.lib.community_aliases' plat-name normalizer (which strips
UNIT/PHASE/TRACT — plat-filing qualifiers). This one strips MARKETED-NAME
suffixes (Golf & Country Club, Country Club, Community Association Inc, ...) so
the same community's name from four different websites collapses to one key.
"""
from __future__ import annotations

import re

_SUFFIX_RE = re.compile(
    r"\b("
    r"GOLF\s*&\s*COUNTRY\s*CLUB|GOLF\s+AND\s+COUNTRY\s+CLUB|"
    r"COUNTRY\s+CLUB|GOLF\s*&\s*CC|GOLF\s+CLUB|"
    r"COMMUNITY\s+ASSOCIATION,?\s*INC\.?|HOMEOWNERS\s*'?\s*ASSOCIATION,?\s*INC\.?|"
    r"ASSOCIATION,?\s*INC\.?|CC|INC\.?"
    r")\.?\s*$"
)


def normalize_community_name(name: str) -> str:
    """Uppercase, strip trailing marketed-name/entity suffixes, strip punctuation,
    collapse whitespace. "Heritage Bay Golf & Country Club" -> "HERITAGE BAY"."""
    upper = name.upper().strip()
    prev = None
    while prev != upper:
        prev = upper
        upper = _SUFFIX_RE.sub("", upper).strip()
    upper = re.sub(r"[^A-Z0-9 ]", " ", upper)
    upper = re.sub(r"\s+", " ", upper).strip()
    return upper


def slugify(name: str) -> str:
    """"Fiddler's Creek" -> "fiddlers-creek". Lowercase, drop apostrophes, replace
    every run of non-alphanumeric characters with one hyphen, strip edge hyphens."""
    s = name.lower().replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_normalize.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add ingest/pipelines/community_profiles/__init__.py ingest/pipelines/community_profiles/normalize.py ingest/pipelines/community_profiles/test_normalize.py
git commit -m "feat(community-profiles): slugify + marketed-name normalizer"
```

---

### Task 2: distill_naplesgolfguy.py — golf structure + amenities

**Files:**
- Create: `ingest/pipelines/community_profiles/distill_naplesgolfguy.py`
- Create: `ingest/pipelines/community_profiles/fixtures/naplesgolfguy_fiddlers_creek.md`
- Test: `ingest/pipelines/community_profiles/test_distill_naplesgolfguy.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure parser).
- Produces: `parse_naplesgolfguy_detail(markdown: str) -> dict` returning keys
  `golf_structure: str|None` (one of `"bundled"|"equity"|"optional"|"none"`),
  `golf_holes: int|None`, `golf_courses: int|None`,
  `pool: bool|None`, `tennis: bool|None`, `pickleball: bool|None`, `fitness: bool|None`,
  `clubhouse: bool|None`, `on_site_dining: bool|None`, `boating_marina: bool|None`.
  These keys match `merge.py`'s expected `naplesgolfguy` partial shape (Task 5).

- [ ] **Step 1: Save the real fixture**

Save this EXACT content (captured live from `https://naplesgolfguy.com/golf-communities/fiddlers-creek/`, verified 07/20/2026) to `ingest/pipelines/community_profiles/fixtures/naplesgolfguy_fiddlers_creek.md`:

```markdown
# Fiddler's Creek
Fiddler's Creek is a private gated golf community with an 18-hole championship hole golf course.
Location:
## Naples, Florida
Club Type:
## Private Country Club
Membership Type:
## Equity
###  Golf Course Information
|  Opened   | 2002  |
| --- | --- |
| Architect   | Arthur Hills  |
| Number of Courses   | 1 (18 Holes)  |
| Caddies Available   | No  |
| Practice Range   | Yes  |
| Own Your Own Cart   | No  |
###  Amenities
  * Gated Golf Community
  * One Golf Course
  * Driving Range
  * Clubhouse
  * Resort-Style Pool
  * Fitness Center
  * Full Service Spa
  * Tennis Courts
  * Bocce Ball
  * Pickleball Courts
  * Private Beach Club Access
```

- [ ] **Step 2: Write the failing test**

```python
# ingest/pipelines/community_profiles/test_distill_naplesgolfguy.py
from pathlib import Path

from ingest.pipelines.community_profiles.distill_naplesgolfguy import parse_naplesgolfguy_detail

FIXTURE = Path(__file__).parent / "fixtures" / "naplesgolfguy_fiddlers_creek.md"


def test_parses_fiddlers_creek_fixture():
    md = FIXTURE.read_text(encoding="utf-8")
    row = parse_naplesgolfguy_detail(md)
    assert row["golf_structure"] == "equity"
    assert row["golf_holes"] == 18
    assert row["golf_courses"] == 1
    assert row["pool"] is True
    assert row["tennis"] is True
    assert row["pickleball"] is True
    assert row["fitness"] is True
    assert row["clubhouse"] is True
    assert row["on_site_dining"] is False  # not in this fixture's amenity list
    assert row["boating_marina"] is False  # "Private Beach Club Access" is not boating/marina


def test_missing_fields_are_none_not_invented():
    row = parse_naplesgolfguy_detail("# Some Community\nNo membership info here.")
    assert row["golf_structure"] is None
    assert row["golf_holes"] is None
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_distill_naplesgolfguy.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Write minimal implementation**

```python
# ingest/pipelines/community_profiles/distill_naplesgolfguy.py
"""Pure markdown parser for a naplesgolfguy.com golf-community detail page.

No network — operates on the markdown string returned by
ingest.lib.crawl_client.fetch_page_markdown. A field with no match in the page
returns None (bool amenity fields return False — the amenities bullet list is
exhaustive per naplesgolfguy's own convention: an amenity not listed is absent,
not unknown)."""
from __future__ import annotations

import re

_MEMBERSHIP_RE = re.compile(r"Membership Type:\s*\n##\s*(\w+)", re.IGNORECASE)
_HOLES_RE = re.compile(r"Number of Courses\s*\|\s*(\d+)\s*\((\d+)\s*Holes?\)", re.IGNORECASE)

_AMENITY_PATTERNS = {
    "pool": re.compile(r"\bpool\b", re.IGNORECASE),
    "tennis": re.compile(r"\btennis\b", re.IGNORECASE),
    "pickleball": re.compile(r"\bpickleball\b", re.IGNORECASE),
    "fitness": re.compile(r"\bfitness\b", re.IGNORECASE),
    "clubhouse": re.compile(r"\bclubhouse\b", re.IGNORECASE),
    "on_site_dining": re.compile(r"\bdining\b|\brestaurant\b", re.IGNORECASE),
    "boating_marina": re.compile(r"\bmarina\b|\bboating\b|\bboat\s+(club|access|dock)\b", re.IGNORECASE),
}

_STRUCTURE_MAP = {"bundled": "bundled", "equity": "equity", "optional": "optional", "none": "none"}


def _amenities_section(markdown: str) -> str:
    """Return the text between an '### Amenities' heading and the next '###'
    heading (or end of string) — the bullet list naplesgolfguy renders per
    community. Empty string if no such heading exists."""
    m = re.search(r"###\s*Amenities\b(.*?)(?=\n###|\Z)", markdown, re.IGNORECASE | re.DOTALL)
    return m.group(1) if m else ""


def parse_naplesgolfguy_detail(markdown: str) -> dict:
    membership = _MEMBERSHIP_RE.search(markdown)
    golf_structure = _STRUCTURE_MAP.get(membership.group(1).lower()) if membership else None

    holes_match = _HOLES_RE.search(markdown)
    golf_courses = int(holes_match.group(1)) if holes_match else None
    golf_holes = int(holes_match.group(2)) if holes_match else None

    amenities_text = _amenities_section(markdown)
    row: dict = {
        "golf_structure": golf_structure,
        "golf_holes": golf_holes,
        "golf_courses": golf_courses,
    }
    for key, pattern in _AMENITY_PATTERNS.items():
        row[key] = bool(pattern.search(amenities_text)) if amenities_text else None
    return row
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_distill_naplesgolfguy.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add ingest/pipelines/community_profiles/distill_naplesgolfguy.py ingest/pipelines/community_profiles/test_distill_naplesgolfguy.py ingest/pipelines/community_profiles/fixtures/naplesgolfguy_fiddlers_creek.md
git commit -m "feat(community-profiles): naplesgolfguy.com distill (golf structure + amenities)"
```

---

### Task 3: distill_55places.py — home count, gated, amenities

**Files:**
- Create: `ingest/pipelines/community_profiles/distill_55places.py`
- Create: `ingest/pipelines/community_profiles/fixtures/fiftyfive_places_heritage_bay.md`
- Test: `ingest/pipelines/community_profiles/test_distill_55places.py`

**Interfaces:**
- Produces: `parse_55places_detail(markdown: str) -> dict` returning
  `home_count: int|None`, `gated: bool|None`,
  plus the same amenity boolean keys as Task 2 (`pool`, `tennis`, `pickleball`,
  `fitness`, `clubhouse`, `on_site_dining`, `boating_marina`) — same keys, so
  `merge.py` (Task 5) can treat both sources' amenity dicts identically.

- [ ] **Step 1: Save the real fixture**

Save this EXACT content (captured live from `https://www.55places.com/florida/communities/heritage-bay`, verified 07/20/2026) to `ingest/pipelines/community_profiles/fixtures/fiftyfive_places_heritage_bay.md`:

```markdown
## Heritage Bay
  * **Price range:** Low $200ks - Low $1Ms
  * **Total homes:** 1,400 (13 for sale)
  * **Home types:** Attached, Condos, Single-Family
  * **New or resale:** Resale Homes Only
  * **Builder:** Lennar Homes
  * **Years built:** 2005 - 2014
  * **Age restrictions:** No Age Restrictions
  * **Gated:** Yes
  * **Activity director:** Yes
##  Heritage Bay Amenities
The following amenities are available to Heritage Bay - Naples, FL residents:
  * Clubhouse/Amenity Center
  * Golf Course
  * Restaurant
  * Fitness Center
  * Outdoor Pool
  * Aerobics & Dance Studio
  * Card Room
  * Library
*55places does not provide or maintain community HOA information.
```

- [ ] **Step 2: Write the failing test**

```python
# ingest/pipelines/community_profiles/test_distill_55places.py
from pathlib import Path

from ingest.pipelines.community_profiles.distill_55places import parse_55places_detail

FIXTURE = Path(__file__).parent / "fixtures" / "fiftyfive_places_heritage_bay.md"


def test_parses_heritage_bay_fixture():
    md = FIXTURE.read_text(encoding="utf-8")
    row = parse_55places_detail(md)
    assert row["home_count"] == 1400
    assert row["gated"] is True
    assert row["clubhouse"] is True
    assert row["fitness"] is True
    assert row["pool"] is True
    assert row["on_site_dining"] is True  # "Restaurant"
    assert row["tennis"] is False  # not listed for Heritage Bay's 55places amenity list
    assert row["boating_marina"] is False


def test_missing_total_homes_is_none():
    row = parse_55places_detail("## Some Community\nNo stats block here.")
    assert row["home_count"] is None
    assert row["gated"] is None
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_distill_55places.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Write minimal implementation**

```python
# ingest/pipelines/community_profiles/distill_55places.py
"""Pure markdown parser for a 55places.com community detail page.

No network. 55places explicitly does not carry HOA fee data (confirmed live
07/20/2026 — every detail page footnotes "55places does not provide or
maintain community HOA information") so this parser never emits an
hoa_fee_range key at all — merge.py must not expect one from this source."""
from __future__ import annotations

import re

_TOTAL_HOMES_RE = re.compile(r"\*\*Total homes:\*\*\s*([\d,]+)", re.IGNORECASE)
_GATED_RE = re.compile(r"\*\*Gated:\*\*\s*(Yes|No)", re.IGNORECASE)

_AMENITY_PATTERNS = {
    "pool": re.compile(r"\bpool\b", re.IGNORECASE),
    "tennis": re.compile(r"\btennis\b", re.IGNORECASE),
    "pickleball": re.compile(r"\bpickleball\b", re.IGNORECASE),
    "fitness": re.compile(r"\bfitness\b", re.IGNORECASE),
    "clubhouse": re.compile(r"\bclubhouse\b", re.IGNORECASE),
    "on_site_dining": re.compile(r"\brestaurant\b|\bdining\b", re.IGNORECASE),
    "boating_marina": re.compile(r"\bmarina\b|\bboating\b", re.IGNORECASE),
}


def _amenities_section(markdown: str) -> str:
    """Text between an 'Amenities' heading and the next '##' heading (or end)."""
    m = re.search(r"##\s*[\w' ]*Amenities\b(.*?)(?=\n##|\Z)", markdown, re.IGNORECASE | re.DOTALL)
    return m.group(1) if m else ""


def parse_55places_detail(markdown: str) -> dict:
    homes_match = _TOTAL_HOMES_RE.search(markdown)
    home_count = int(homes_match.group(1).replace(",", "")) if homes_match else None

    gated_match = _GATED_RE.search(markdown)
    gated = (gated_match.group(1).lower() == "yes") if gated_match else None

    amenities_text = _amenities_section(markdown)
    row: dict = {"home_count": home_count, "gated": gated}
    for key, pattern in _AMENITY_PATTERNS.items():
        row[key] = bool(pattern.search(amenities_text)) if amenities_text else None
    return row
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_distill_55places.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add ingest/pipelines/community_profiles/distill_55places.py ingest/pipelines/community_profiles/test_distill_55places.py ingest/pipelines/community_profiles/fixtures/fiftyfive_places_heritage_bay.md
git commit -m "feat(community-profiles): 55places.com distill (home count, gated, amenities)"
```

---

### Task 4: distill_realtyofnaplesfl.py — HOA fee range + CDD + golf (curated table)

**Files:**
- Create: `ingest/pipelines/community_profiles/distill_realtyofnaplesfl.py`
- Create: `ingest/pipelines/community_profiles/fixtures/realtyofnaplesfl_hoa_comparison.md`
- Test: `ingest/pipelines/community_profiles/test_distill_realtyofnaplesfl.py`

**Interfaces:**
- Produces: `parse_hoa_comparison_page(markdown: str) -> list[dict]`, one dict per
  table row: `{"name": str, "hoa_fee_range": str, "cdd_flag": bool|None,
  "golf_structure": str|None, "is_estimate": bool}`. `is_estimate=True` when the
  source page itself marks that row "(est.)" — carried through, never dropped
  silently (Global Constraints: never present an estimate as a precise figure).

- [ ] **Step 1: Save the real fixture**

Save this EXACT content (captured live from `https://realtyofnaplesfl.com/hoa-fee-comparison-by-community/`, verified 07/20/2026 — trimmed to a representative slice of both counties' tables) to `ingest/pipelines/community_profiles/fixtures/realtyofnaplesfl_hoa_comparison.md`:

```markdown
## Collier County Community HOA Fees
| Community  | HOA Fee Range/Mo  | What's Included  | CDD  | Golf  |
| --- | --- | --- | --- | --- |
| Pelican Bay  | $175–$220/mo  | Beach tram, beach clubs, landscape, security  | No CDD  | No golf  |
| Bay Colony  | $2,500–$3,500+/mo (est.)  | Bay Colony Club, full amenities  | No CDD  | Optional  |
| Talis Park  | $700–$1,100/mo  | Course optional, clubhouse, pool, fitness  | Yes — ~$2,500/yr  | Optional  |
| Heritage Bay  | $350–$550/mo  | 27-hole bundled, clubhouse, pool, fitness  | Yes — ~$1,500/yr  | Bundled  |
## Lee County Community HOA Fees
| Community  | HOA Fee Range/Mo  | What's Included  | CDD  | Golf  |
| --- | --- | --- | --- | --- |
| Verandah  | $300–$500/mo  | 2 bundled courses, pool, fitness, kayaking  | Yes — ~$1,500/yr  | Bundled  |
```

- [ ] **Step 2: Write the failing test**

```python
# ingest/pipelines/community_profiles/test_distill_realtyofnaplesfl.py
from pathlib import Path

from ingest.pipelines.community_profiles.distill_realtyofnaplesfl import parse_hoa_comparison_page

FIXTURE = Path(__file__).parent / "fixtures" / "realtyofnaplesfl_hoa_comparison.md"


def test_parses_both_county_tables():
    md = FIXTURE.read_text(encoding="utf-8")
    rows = parse_hoa_comparison_page(md)
    by_name = {r["name"]: r for r in rows}
    assert len(rows) == 5

    pelican = by_name["Pelican Bay"]
    assert pelican["hoa_fee_range"] == "$175–$220/mo"
    assert pelican["cdd_flag"] is False
    assert pelican["golf_structure"] is None
    assert pelican["is_estimate"] is False

    bay_colony = by_name["Bay Colony"]
    assert bay_colony["is_estimate"] is True  # source page itself flags "(est.)"

    heritage = by_name["Heritage Bay"]
    assert heritage["cdd_flag"] is True
    assert heritage["golf_structure"] == "bundled"

    verandah = by_name["Verandah"]
    assert verandah["golf_structure"] == "bundled"


def test_no_tables_returns_empty_list():
    assert parse_hoa_comparison_page("# No tables here") == []
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_distill_realtyofnaplesfl.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Write minimal implementation**

```python
# ingest/pipelines/community_profiles/distill_realtyofnaplesfl.py
"""Pure markdown-table parser for realtyofnaplesfl.com's curated HOA-fee-
comparison page. This is an EDITORIAL comparison (the page's own text: "typical
ranges based on available data as of early 2026") — every row is a curated
range, not a live per-listing aggregate. is_estimate=True carries the page's
own "(est.)" flag through verbatim; callers must never drop it."""
from __future__ import annotations

import re

_ROW_RE = re.compile(
    r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$",
    re.MULTILINE,
)
_GOLF_MAP = {
    "bundled": "bundled",
    "optional": "optional",
    "optional membership": "optional",
    "no golf": "none",
}


def _parse_golf(cell: str) -> str | None:
    normalized = cell.strip().lower()
    for key, value in _GOLF_MAP.items():
        if key in normalized:
            return value
    return None


def _parse_cdd(cell: str) -> bool | None:
    normalized = cell.strip().lower()
    if "no cdd" in normalized:
        return False
    if normalized.startswith("yes"):
        return True
    return None


def parse_hoa_comparison_page(markdown: str) -> list[dict]:
    rows: list[dict] = []
    for match in _ROW_RE.finditer(markdown):
        name, fee, _included, cdd_cell, golf_cell = (g.strip() for g in match.groups())
        if name in ("Community", "---", "") or set(name) == {"-"}:
            continue  # header / separator row
        is_estimate = "(est.)" in fee.lower()
        fee_clean = re.sub(r"\s*\(est\.\)", "", fee, flags=re.IGNORECASE).strip()
        rows.append(
            {
                "name": name,
                "hoa_fee_range": fee_clean,
                "cdd_flag": _parse_cdd(cdd_cell),
                "golf_structure": _parse_golf(golf_cell),
                "is_estimate": is_estimate,
            }
        )
    return rows
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_distill_realtyofnaplesfl.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add ingest/pipelines/community_profiles/distill_realtyofnaplesfl.py ingest/pipelines/community_profiles/test_distill_realtyofnaplesfl.py ingest/pipelines/community_profiles/fixtures/realtyofnaplesfl_hoa_comparison.md
git commit -m "feat(community-profiles): realtyofnaplesfl.com HOA-comparison table distill"
```

---

### Task 5: merge.py — combine per-source partials into one community_profiles row

**Files:**
- Create: `ingest/pipelines/community_profiles/merge.py`
- Test: `ingest/pipelines/community_profiles/test_merge.py`

**Interfaces:**
- Consumes: the dict shapes produced by Tasks 2–4 (`parse_naplesgolfguy_detail`,
  `parse_55places_detail`, one entry from `parse_hoa_comparison_page`).
- Produces: `merge_community_row(slug: str, label: str, county: str, *, naplesgolfguy: dict|None, fiftyfive_places: dict|None, hoa_comparison: dict|None) -> dict` — a row matching every column in `migrations/20260706_community_profiles.sql` (community_slug, label, county, home_count/_source_url/_as_of, gated, golf_structure/golf_holes/golf_courses/golf_source_url/golf_as_of, hoa_fee_range/cdd_flag/fees_source_url/fees_as_of, pool/tennis/pickleball/fitness/clubhouse/on_site_dining/boating_marina/amenities_source_url/amenities_as_of).

- [ ] **Step 1: Write the failing tests**

```python
# ingest/pipelines/community_profiles/test_merge.py
from ingest.pipelines.community_profiles.merge import merge_community_row


def test_merge_prefers_naplesgolfguy_for_golf_prefers_55places_for_amenities():
    row = merge_community_row(
        "fiddlers-creek",
        "Fiddler's Creek",
        "Collier",
        naplesgolfguy={
            "golf_structure": "equity",
            "golf_holes": 18,
            "golf_courses": 1,
            "pool": True,
            "tennis": True,
            "pickleball": True,
            "fitness": True,
            "clubhouse": True,
            "on_site_dining": False,
            "boating_marina": False,
        },
        fiftyfive_places=None,
        hoa_comparison=None,
    )
    assert row["community_slug"] == "fiddlers-creek"
    assert row["golf_structure"] == "equity"
    assert row["golf_holes"] == 18
    assert row["pool"] is True
    assert row["golf_source_url"] == "https://naplesgolfguy.com/golf-communities/fiddlers-creek/"
    assert row["amenities_source_url"] == "https://naplesgolfguy.com/golf-communities/fiddlers-creek/"
    # No 55places / hoa data supplied -> those fields and their groups' urls are None
    assert row["home_count"] is None
    assert row["hoa_fee_range"] is None
    assert row["fees_source_url"] is None


def test_merge_55places_supplies_home_count_and_gated_amenities_override_naplesgolfguy():
    row = merge_community_row(
        "heritage-bay",
        "Heritage Bay",
        "Collier",
        naplesgolfguy={
            "golf_structure": "bundled",
            "golf_holes": 27,
            "golf_courses": 1,
            "pool": True,
            "tennis": False,
            "pickleball": False,
            "fitness": True,
            "clubhouse": True,
            "on_site_dining": True,
            "boating_marina": False,
        },
        fiftyfive_places={
            "home_count": 1400,
            "gated": True,
            "pool": True,
            "tennis": False,
            "pickleball": False,
            "fitness": True,
            "clubhouse": True,
            "on_site_dining": True,
            "boating_marina": False,
        },
        hoa_comparison={
            "hoa_fee_range": "$350–$550/mo",
            "cdd_flag": True,
            "golf_structure": "bundled",
            "is_estimate": False,
        },
    )
    assert row["home_count"] == 1400
    assert row["gated"] is True
    assert row["hoa_fee_range"] == "$350–$550/mo"
    assert row["cdd_flag"] is True
    assert row["fees_source_url"] == "https://realtyofnaplesfl.com/hoa-fee-comparison-by-community/"
    # amenities group comes from 55places when present (more complete field set)
    assert row["amenities_source_url"] == "https://www.55places.com/florida/communities/heritage-bay"


def test_merge_with_nothing_supplied_returns_all_none_but_identity_fields():
    row = merge_community_row("some-slug", "Some Community", "Lee", naplesgolfguy=None, fiftyfive_places=None, hoa_comparison=None)
    assert row["community_slug"] == "some-slug"
    assert row["label"] == "Some Community"
    assert row["county"] == "Lee"
    assert row["golf_structure"] is None
    assert row["home_count"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_merge.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write minimal implementation**

```python
# ingest/pipelines/community_profiles/merge.py
"""Combine per-source partial dicts (Tasks 2-4) into one community_profiles row.

Precedence per field GROUP (never per individual field within a group - a
group's facts come from one page, so they carry one source_url + as_of pair,
matching migrations/20260706_community_profiles.sql's comment):
  - golf group: naplesgolfguy first (dedicated golf detail), else the
    hoa_comparison row's golf_structure (curated, no holes/courses count).
  - amenities group (pool/tennis/pickleball/fitness/clubhouse/on_site_dining/
    boating_marina): 55places first (broader, non-golf-restricted coverage),
    else naplesgolfguy.
  - home_count/gated group: 55places only (naplesgolfguy doesn't carry these).
  - fees group (hoa_fee_range/cdd_flag): realtyofnaplesfl's curated table only
    for v1 (the realtyofnaples.com per-listing aggregate lane is a follow-up,
    per the design spec's "Out of scope" section).
"""
from __future__ import annotations

from datetime import date

_AMENITY_KEYS = (
    "pool", "tennis", "pickleball", "fitness", "clubhouse", "on_site_dining", "boating_marina",
)


def _naplesgolfguy_url(slug: str) -> str:
    return f"https://naplesgolfguy.com/golf-communities/{slug}/"


def _fiftyfive_places_url(slug: str) -> str:
    return f"https://www.55places.com/florida/communities/{slug}"


_HOA_COMPARISON_URL = "https://realtyofnaplesfl.com/hoa-fee-comparison-by-community/"


def merge_community_row(
    slug: str,
    label: str,
    county: str,
    *,
    naplesgolfguy: dict | None,
    fiftyfive_places: dict | None,
    hoa_comparison: dict | None,
    as_of: str | None = None,
) -> dict:
    as_of = as_of or date.today().isoformat()

    row: dict = {
        "community_slug": slug,
        "label": label,
        "county": county,
        "home_count": None,
        "home_count_source_url": None,
        "home_count_as_of": None,
        "gated": None,
        "golf_structure": None,
        "golf_holes": None,
        "golf_courses": None,
        "golf_source_url": None,
        "golf_as_of": None,
        "hoa_fee_range": None,
        "cdd_flag": None,
        "fees_source_url": None,
        "fees_as_of": None,
        "amenities_source_url": None,
        "amenities_as_of": None,
    }
    for key in _AMENITY_KEYS:
        row[key] = None

    # --- golf group ---
    if naplesgolfguy and naplesgolfguy.get("golf_structure") is not None:
        row["golf_structure"] = naplesgolfguy["golf_structure"]
        row["golf_holes"] = naplesgolfguy.get("golf_holes")
        row["golf_courses"] = naplesgolfguy.get("golf_courses")
        row["golf_source_url"] = _naplesgolfguy_url(slug)
        row["golf_as_of"] = as_of
    elif hoa_comparison and hoa_comparison.get("golf_structure") is not None:
        row["golf_structure"] = hoa_comparison["golf_structure"]
        row["golf_source_url"] = _HOA_COMPARISON_URL
        row["golf_as_of"] = as_of

    # --- home_count / gated group (55places only) ---
    if fiftyfive_places:
        if fiftyfive_places.get("home_count") is not None:
            row["home_count"] = fiftyfive_places["home_count"]
            row["home_count_source_url"] = _fiftyfive_places_url(slug)
            row["home_count_as_of"] = as_of
        if fiftyfive_places.get("gated") is not None:
            row["gated"] = fiftyfive_places["gated"]

    # --- amenities group: 55places preferred, naplesgolfguy fallback ---
    amenities_source = None
    if fiftyfive_places and any(fiftyfive_places.get(k) is not None for k in _AMENITY_KEYS):
        amenities_source = fiftyfive_places
        row["amenities_source_url"] = _fiftyfive_places_url(slug)
    elif naplesgolfguy and any(naplesgolfguy.get(k) is not None for k in _AMENITY_KEYS):
        amenities_source = naplesgolfguy
        row["amenities_source_url"] = _naplesgolfguy_url(slug)
    if amenities_source is not None:
        for key in _AMENITY_KEYS:
            row[key] = amenities_source.get(key)
        row["amenities_as_of"] = as_of

    # --- fees group (curated comparison table only, v1) ---
    if hoa_comparison and hoa_comparison.get("hoa_fee_range") is not None:
        row["hoa_fee_range"] = hoa_comparison["hoa_fee_range"]
        row["cdd_flag"] = hoa_comparison.get("cdd_flag")
        row["fees_source_url"] = _HOA_COMPARISON_URL
        row["fees_as_of"] = as_of

    return row
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_merge.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add ingest/pipelines/community_profiles/merge.py ingest/pipelines/community_profiles/test_merge.py
git commit -m "feat(community-profiles): merge per-source partials into one row, group-scoped provenance"
```

---

### Task 6: seed_communities.json — discovery seed from this session's research

**Files:**
- Create: `ingest/pipelines/community_profiles/seed_communities.json`

- [ ] **Step 1: Write the seed file**

A flat JSON list, one entry per candidate community name gathered this session (the verified ones from live crawls, plus every unverified name from the three operator-supplied AI-overview rounds — names only, no figures, per the design spec's discovery-seed section). Each entry carries `verified: true` only for the ones this session actually opened a real page for. Order the verified ones first (the dry-run in Task 8 uses `--limit`).

```json
[
  {"name": "Fiddler's Creek", "county": "Collier", "verified": true},
  {"name": "Heritage Bay", "county": "Collier", "verified": true},
  {"name": "Grey Oaks", "county": "Collier", "verified": true},
  {"name": "Lely Country Club", "county": "Collier", "verified": true},
  {"name": "Bay Colony", "county": "Collier", "verified": false},
  {"name": "Cedar Hammock", "county": "Collier", "verified": false},
  {"name": "Countryside", "county": "Collier", "verified": false},
  {"name": "Cypress Woods", "county": "Collier", "verified": false},
  {"name": "Esplanade Golf & CC", "county": "Collier", "verified": false},
  {"name": "Forest Glen", "county": "Collier", "verified": false},
  {"name": "Foxfire", "county": "Collier", "verified": false},
  {"name": "Glades Golf & CC", "county": "Collier", "verified": false},
  {"name": "Glen Eagle", "county": "Collier", "verified": false},
  {"name": "Naples Heritage", "county": "Collier", "verified": false},
  {"name": "Naples Lakes", "county": "Collier", "verified": false},
  {"name": "Royal Wood", "county": "Collier", "verified": false},
  {"name": "Stonebridge", "county": "Collier", "verified": false},
  {"name": "The National at Ave Maria", "county": "Collier", "verified": false},
  {"name": "Treviso Bay", "county": "Collier", "verified": false},
  {"name": "Wilderness Country Club", "county": "Collier", "verified": false},
  {"name": "Tiburon", "county": "Collier", "verified": false},
  {"name": "Lely Resort", "county": "Collier", "verified": false},
  {"name": "The Quarry", "county": "Collier", "verified": false},
  {"name": "Mediterra", "county": "Collier", "verified": false},
  {"name": "The Strand", "county": "Collier", "verified": false},
  {"name": "The Vineyards", "county": "Collier", "verified": false},
  {"name": "Colliers Reserve", "county": "Collier", "verified": false},
  {"name": "Kensington", "county": "Collier", "verified": false},
  {"name": "TwinEagles", "county": "Collier", "verified": false},
  {"name": "Quail West", "county": "Collier", "verified": false},
  {"name": "Pelican Marsh", "county": "Collier", "verified": false},
  {"name": "Windstar on Naples Bay", "county": "Collier", "verified": false},
  {"name": "Bear's Paw", "county": "Collier", "verified": false},
  {"name": "Audubon Country Club", "county": "Collier", "verified": false},
  {"name": "Wyndemere", "county": "Collier", "verified": false},
  {"name": "Eagle Creek", "county": "Collier", "verified": false},
  {"name": "Imperial Golf Club", "county": "Collier", "verified": false},
  {"name": "Quail Creek Village", "county": "Collier", "verified": false},
  {"name": "Quail Creek Estates", "county": "Collier", "verified": false},
  {"name": "Hammock Bay", "county": "Collier", "verified": false},
  {"name": "Calusa Pines", "county": "Collier", "verified": false},
  {"name": "The Hideout Golf Club", "county": "Collier", "verified": false},
  {"name": "Valencia Golf & Country Club", "county": "Collier", "verified": false},
  {"name": "Aqualane Shores", "county": "Collier", "verified": false},
  {"name": "Old Collier Golf Club", "county": "Collier", "verified": false},
  {"name": "The Rookery at Marco", "county": "Collier", "verified": false},
  {"name": "Pelican Bay", "county": "Collier", "verified": false},
  {"name": "Talis Park", "county": "Collier", "verified": false},
  {"name": "Bonita National Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Copperleaf at The Brooks", "county": "Lee", "verified": false},
  {"name": "Highland Woods Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Spring Run at The Brooks", "county": "Lee", "verified": false},
  {"name": "Vasari Country Club", "county": "Lee", "verified": false},
  {"name": "Worthington Country Club", "county": "Lee", "verified": false},
  {"name": "Spanish Wells Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Bonita Bay", "county": "Lee", "verified": false},
  {"name": "The Colony at Pelican Landing", "county": "Lee", "verified": false},
  {"name": "Pelican Sound Golf & River Club", "county": "Lee", "verified": false},
  {"name": "Country Creek", "county": "Lee", "verified": false},
  {"name": "Wildcat Run Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Shadow Wood at The Brooks", "county": "Lee", "verified": false},
  {"name": "Grandezza", "county": "Lee", "verified": false},
  {"name": "West Bay Club", "county": "Lee", "verified": false},
  {"name": "Stoneybrook", "county": "Lee", "verified": false},
  {"name": "River Hall Country Club", "county": "Lee", "verified": false},
  {"name": "Verandah", "county": "Lee", "verified": false},
  {"name": "Colonial Country Club", "county": "Lee", "verified": false},
  {"name": "Heritage Palms Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Legends Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Lexington Country Club", "county": "Lee", "verified": false},
  {"name": "Olde Hickory Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Cross Creek Country Club", "county": "Lee", "verified": false},
  {"name": "Kelly Greens Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Seven Lakes Golf & Tennis Community", "county": "Lee", "verified": false},
  {"name": "Herons Glen Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Six Lakes Country Club", "county": "Lee", "verified": false},
  {"name": "Gulf Harbour Yacht & Country Club", "county": "Lee", "verified": false},
  {"name": "The Club at Pelican Preserve", "county": "Lee", "verified": false},
  {"name": "Fiddlesticks Country Club", "county": "Lee", "verified": false},
  {"name": "The Forest Country Club", "county": "Lee", "verified": false},
  {"name": "Eagle Ridge", "county": "Lee", "verified": false},
  {"name": "The Club at Gateway", "county": "Lee", "verified": false},
  {"name": "Hunter's Ridge", "county": "Lee", "verified": false},
  {"name": "Breckenridge", "county": "Lee", "verified": false},
  {"name": "Fountain Lakes", "county": "Lee", "verified": false},
  {"name": "Cape Royal", "county": "Lee", "verified": false},
  {"name": "Coral Oaks", "county": "Lee", "verified": false},
  {"name": "The Landings", "county": "Lee", "verified": false},
  {"name": "Myerlee", "county": "Lee", "verified": false},
  {"name": "Hideaway Country Club", "county": "Lee", "verified": false},
  {"name": "San Carlos Golf Club", "county": "Lee", "verified": false},
  {"name": "Miromar Lakes Beach & Golf Club", "county": "Lee", "verified": false},
  {"name": "Crown Colony Golf & Country Club", "county": "Lee", "verified": false},
  {"name": "Palmetto-Pine Country Club Area", "county": "Lee", "verified": false},
  {"name": "Shell Point Golf Club", "county": "Lee", "verified": false},
  {"name": "Town and River", "county": "Lee", "verified": false}
]
```

- [ ] **Step 2: Commit**

```bash
git add ingest/pipelines/community_profiles/seed_communities.json
git commit -m "feat(community-profiles): discovery seed list from session research (unverified names, per spec)"
```

---

### Task 7: pipeline.py — orchestration, dlt write, --dry-run

**Files:**
- Create: `ingest/pipelines/community_profiles/constants.py`
- 🔴 Create: `ingest/pipelines/community_profiles/pipeline.py`
- 🔴 Test: `ingest/pipelines/community_profiles/test_pipeline.py`

**Interfaces:**
- Consumes: `normalize.slugify`, `normalize.normalize_community_name` (Task 1);
  `distill_naplesgolfguy.parse_naplesgolfguy_detail` (Task 2);
  `distill_55places.parse_55places_detail` (Task 3);
  `distill_realtyofnaplesfl.parse_hoa_comparison_page` (Task 4);
  `merge.merge_community_row` (Task 5); `seed_communities.json` (Task 6);
  `ingest.lib.crawl_client.fetch_page_markdown`; `ingest.lib.guards.assert_min_rows`;
  `ingest.lib.community_aliases.load_community_aliases`.
- Produces: `build_rows(seed: list[dict], hoa_table: list[dict]) -> list[dict]` (pure,
  testable without network — takes already-fetched markdown per community via an
  injected fetch function); `run_pipeline() -> None` (live entry point); CLI `main()`.

- [ ] **Step 1: Write constants.py**

```python
# ingest/pipelines/community_profiles/constants.py
TABLE_NAME = "community_profiles"
SCHEMA = "data_lake"
HOA_COMPARISON_URL = "https://realtyofnaplesfl.com/hoa-fee-comparison-by-community/"


def naplesgolfguy_url(slug: str) -> str:
    return f"https://naplesgolfguy.com/golf-communities/{slug}/"


def fiftyfive_places_url(slug: str) -> str:
    return f"https://www.55places.com/florida/communities/{slug}"
```

- [ ] **Step 2: Write the failing test for the pure orchestration function**

```python
# ingest/pipelines/community_profiles/test_pipeline.py
from ingest.pipelines.community_profiles.pipeline import build_rows


def _fake_fetch(url: str) -> str:
    """Injected fetch stub — no network. Returns canned markdown per URL so
    build_rows' orchestration logic is tested without crawl4ai."""
    if "naplesgolfguy.com/golf-communities/fiddlers-creek" in url:
        return (
            "Membership Type:\n## Equity\n"
            "Number of Courses   | 1 (18 Holes)\n"
            "###  Amenities\n  * Clubhouse\n  * Resort-Style Pool\n"
        )
    if "55places.com/florida/communities/fiddlers-creek" in url:
        return ""  # simulate: not listed on 55places
    return ""


def test_build_rows_skips_a_source_with_no_page_without_raising():
    seed = [{"name": "Fiddler's Creek", "county": "Collier", "verified": True}]
    rows = build_rows(seed, hoa_table=[], fetch=_fake_fetch)
    assert len(rows) == 1
    row = rows[0]
    assert row["community_slug"] == "fiddlers-creek"
    assert row["golf_structure"] == "equity"
    assert row["clubhouse"] is True
    assert row["home_count"] is None  # 55places had nothing — never invented


def test_build_rows_applies_hoa_comparison_by_normalized_name():
    seed = [{"name": "Heritage Bay Golf & Country Club", "county": "Collier", "verified": False}]
    hoa_table = [
        {
            "name": "Heritage Bay",
            "hoa_fee_range": "$350–$550/mo",
            "cdd_flag": True,
            "golf_structure": "bundled",
            "is_estimate": False,
        }
    ]
    rows = build_rows(seed, hoa_table=hoa_table, fetch=lambda url: "")
    assert rows[0]["hoa_fee_range"] == "$350–$550/mo"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_pipeline.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Write minimal implementation**

```python
# ingest/pipelines/community_profiles/pipeline.py
"""community_profiles amenity-scrape pipeline. Manual run only (no GHA cron —
per the design spec's cadence decision). No LLM anywhere in this file."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Callable

import dlt

from ingest.lib.guards import assert_min_rows
from .constants import HOA_COMPARISON_URL, SCHEMA, TABLE_NAME, fiftyfive_places_url, naplesgolfguy_url
from .distill_55places import parse_55places_detail
from .distill_naplesgolfguy import parse_naplesgolfguy_detail
from .distill_realtyofnaplesfl import parse_hoa_comparison_page
from .merge import merge_community_row
from .normalize import normalize_community_name, slugify

_SEED_PATH = Path(__file__).parent / "seed_communities.json"

FetchFn = Callable[[str], str]


def _load_seed() -> list[dict]:
    return json.loads(_SEED_PATH.read_text(encoding="utf-8"))


def build_rows(seed: list[dict], *, hoa_table: list[dict], fetch: FetchFn) -> list[dict]:
    """Pure orchestration (network isolated behind `fetch`). For each seed name:
    fetch naplesgolfguy + 55places detail pages by slug guess, distill whatever
    came back (empty markdown -> that source's parser returns all-None, which
    merge.py already treats as absent), match the hoa_comparison table by
    normalized name, and merge. A source with no page for this community
    contributes nothing — never raises, never invents."""
    hoa_by_normalized = {normalize_community_name(r["name"]): r for r in hoa_table}

    rows: list[dict] = []
    for entry in seed:
        name = entry["name"]
        slug = slugify(name)
        county = entry["county"]

        ngg_md = fetch(naplesgolfguy_url(slug))
        ngg = parse_naplesgolfguy_detail(ngg_md) if ngg_md else None

        fp_md = fetch(fiftyfive_places_url(slug))
        fp = parse_55places_detail(fp_md) if fp_md else None

        hoa = hoa_by_normalized.get(normalize_community_name(name))

        rows.append(
            merge_community_row(
                slug,
                name,
                county,
                naplesgolfguy=ngg,
                fiftyfive_places=fp,
                hoa_comparison=hoa,
            )
        )
    return rows


@dlt.resource(name=TABLE_NAME, primary_key="community_slug", write_disposition="merge")
def community_profiles_resource(rows: list[dict]):
    yield from rows


def run_pipeline(*, fetch: FetchFn) -> None:
    from ingest.lib.crawl_client import fetch_page_markdown  # live import, keeps build_rows pure

    seed = _load_seed()
    hoa_md = fetch_page_markdown(HOA_COMPARISON_URL)
    hoa_table = parse_hoa_comparison_page(hoa_md) if hoa_md else []

    rows = build_rows(seed, hoa_table=hoa_table, fetch=fetch)
    assert_min_rows(len(rows), minimum=1, label="community_profiles")

    pipeline = dlt.pipeline(
        pipeline_name="community_profiles",
        destination="postgres",
        dataset_name=SCHEMA,
    )
    load_info = pipeline.run(community_profiles_resource(rows))
    load_info.raise_on_failed_jobs()


def main(argv: list[str] | None = None) -> int:
    from ingest.lib.crawl_client import fetch_page_markdown

    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="Fetch and distill only; skip the dlt write.")
    p.add_argument("--limit", type=int, default=None, help="Only process the first N seed entries (dry-run probing).")
    args = p.parse_args(argv)

    seed = _load_seed()
    if args.limit:
        seed = seed[: args.limit]

    if args.dry_run:
        hoa_md = fetch_page_markdown(HOA_COMPARISON_URL)
        hoa_table = parse_hoa_comparison_page(hoa_md) if hoa_md else []
        rows = build_rows(seed, hoa_table=hoa_table, fetch=fetch_page_markdown)
        print(f"community_profiles dry-run: {len(rows)} rows (dlt write skipped)")
        for row in rows:
            print(row)
        return 0

    run_pipeline(fetch=fetch_page_markdown)
    return 0


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_pipeline.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Run the full test suite for this pipeline**

Run: `cd ingest && python -m pytest pipelines/community_profiles/ -v`
Expected: 13 passed (2 normalize + 2 naplesgolfguy + 2 fiftyfive_places + 2 realtyofnaplesfl + 3 merge + 2 pipeline)

- [ ] **Step 7: Commit**

```bash
git add ingest/pipelines/community_profiles/constants.py ingest/pipelines/community_profiles/pipeline.py ingest/pipelines/community_profiles/test_pipeline.py
git commit -m "feat(community-profiles): pipeline orchestration + dlt merge write + --dry-run CLI"
```

---

### Task 8: live dry-run probe against real sites (manual verification, no code)

Not a code task — a verification step before the first real write, per
`docs/standards/data-and-build-bible.md`'s probe-first standard.

- [ ] **Step 1: Run a small live dry-run**

Run: `cd ingest && python -m pipelines.community_profiles.pipeline --dry-run --limit 5`
Expected: prints 5 rows; the `verified: true` entries (Fiddler's Creek, Heritage Bay, Grey
Oaks, Lely Country Club — they're first in `seed_communities.json`, since `--limit` takes
the first N) should show non-null `golf_structure`/amenities matching this session's manual
findings. `verified: false` entries may print mostly-null rows — expected, since their real
URL slugs haven't been confirmed yet.

- [ ] **Step 2: Report findings to the operator**

Before running the full seed list for real, report: how many of the 4 verified
communities came back with data (should be 4/4), and a sample of what an unverified
name's row looks like — so the operator can decide whether unverified slugs need a
second discovery pass (e.g. trying `{slug}-golf-club` / `{slug}-country-club` variants)
before the real write, rather than silently writing ~90 mostly-null rows.

---

### Task 9: extend the shared alias fixture on a confirmed discovery

**Files:**
- 🔴 Modify: `ingest/pipelines/community_profiles/pipeline.py`
- 🔴 Test: `ingest/pipelines/community_profiles/test_pipeline.py` (add to existing file)

**Interfaces:**
- Produces: `maybe_register_alias(slug: str, label: str, aliases: dict) -> dict` (pure —
  returns a possibly-updated aliases dict; caller decides whether to persist it). This
  closes the design spec's step 3 ("Reconcile identity... via the existing alias system...
  unmatched names get logged, not dropped") — `fixtures/community-aliases.json` currently
  has exactly one entry (`heritage-bay`, confirmed live this session), so most discovered
  communities need a NEW entry, not a lookup against an already-rich map.

- [ ] **Step 1: Write the failing test**

```python
# append to ingest/pipelines/community_profiles/test_pipeline.py
from ingest.pipelines.community_profiles.pipeline import maybe_register_alias


def test_maybe_register_alias_adds_new_entry():
    aliases = {"heritage-bay": {"label": "Heritage Bay", "patterns": ["HERITAGE BAY"]}}
    updated = maybe_register_alias("fiddlers-creek", "Fiddler's Creek", aliases)
    assert updated["fiddlers-creek"] == {"label": "Fiddler's Creek", "patterns": ["FIDDLERS CREEK"]}
    assert updated["heritage-bay"] == aliases["heritage-bay"]  # untouched


def test_maybe_register_alias_is_a_noop_for_existing_slug():
    aliases = {"heritage-bay": {"label": "Heritage Bay", "patterns": ["HERITAGE BAY"]}}
    updated = maybe_register_alias("heritage-bay", "Heritage Bay Golf & Country Club", aliases)
    assert updated["heritage-bay"]["label"] == "Heritage Bay"  # original label wins, not overwritten
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_pipeline.py -v -k register_alias`
Expected: FAIL with `ImportError: cannot import name 'maybe_register_alias'`

- [ ] **Step 3: Add the implementation to pipeline.py**

Add this function to `ingest/pipelines/community_profiles/pipeline.py` (near `build_rows`):

```python
def maybe_register_alias(slug: str, label: str, aliases: dict) -> dict:
    """Add a new slug -> {label, patterns} entry when `slug` isn't already in
    the shared fixture (fixtures/community-aliases.json, read by both this
    pipeline's normalize.normalize_community_name callers and
    refinery/lib/subdivision-aliases.mts). Existing entries are never
    overwritten — a human already curated that label/pattern set."""
    if slug in aliases:
        return aliases
    updated = dict(aliases)
    updated[slug] = {"label": label, "patterns": [normalize_community_name(label)]}
    return updated
```

Then update `run_pipeline` to persist any new entries after a successful write:

```python
def run_pipeline(*, fetch: FetchFn) -> None:
    from ingest.lib.crawl_client import fetch_page_markdown
    from ingest.lib.community_aliases import _FIXTURE_PATH, load_community_aliases

    seed = _load_seed()
    hoa_md = fetch_page_markdown(HOA_COMPARISON_URL)
    hoa_table = parse_hoa_comparison_page(hoa_md) if hoa_md else []

    rows = build_rows(seed, hoa_table=hoa_table, fetch=fetch)
    assert_min_rows(len(rows), minimum=1, label="community_profiles")

    pipeline = dlt.pipeline(
        pipeline_name="community_profiles",
        destination="postgres",
        dataset_name=SCHEMA,
    )
    load_info = pipeline.run(community_profiles_resource(rows))
    load_info.raise_on_failed_jobs()

    aliases = load_community_aliases()
    for row in rows:
        aliases = maybe_register_alias(row["community_slug"], row["label"], aliases)
    _FIXTURE_PATH.write_text(json.dumps(aliases, indent=2, sort_keys=True) + "\n", encoding="utf-8")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ingest && python -m pytest pipelines/community_profiles/test_pipeline.py -v`
Expected: PASS (4 passed — the 2 from Task 7 + the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add ingest/pipelines/community_profiles/pipeline.py ingest/pipelines/community_profiles/test_pipeline.py
git commit -m "feat(community-profiles): extend the shared community-aliases fixture on confirmed discovery"
```

---

## Self-Review

**Spec coverage:** naplesgolfguy distill ✓ (Task 2), 55places distill ✓ (Task 3),
realtyofnaplesfl curated-table distill ✓ (Task 4) — the realtyofnaples.com per-listing
aggregate lane is explicitly NOT in this plan, matching the spec's "Out of scope" section
(a follow-up, since it requires fetching and aggregating N listings per community, a
different shape of work than a single detail-page fetch); alias-fixture reuse + extension
✓ (Task 9); discovery seed ✓ (Task 6, all three operator rounds' names included, `Facebook`/
`Yelp`-cited names excluded per the spec's own note); no-LLM ✓ (regex/string parsing
throughout); Gate 4 guard ✓ (`assert_min_rows` in `run_pipeline`); manual-only cadence ✓
(no GHA file in this plan); CommunityPay completeness cross-check — NOT included as a code
task (it's a one-time manual comparison against `communitypay.us`'s per-city directory
pages, not something this pipeline needs to automate for v1; noted here so it isn't lost —
worth a follow-up check once the real write lands, comparing the written `community_slug`
set against communitypay's name list per city).

**Placeholder scan:** none found — every step has real code, real fixture content
(captured live this session), real commands.

**Type consistency:** `slug`/`label`/`county` parameter order matches across
`merge_community_row`, `build_rows`, and `maybe_register_alias`; `_AMENITY_KEYS` tuple in
`merge.py` matches the boolean keys both `distill_naplesgolfguy.py` and
`distill_55places.py` emit; `hoa_comparison` dict keys (`hoa_fee_range`, `cdd_flag`,
`golf_structure`, `is_estimate`) match exactly between `distill_realtyofnaplesfl.py`'s
output and `merge.py`'s consumption.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 7, Task 9 | `ingest/pipelines/community_profiles/pipeline.py`, `ingest/pipelines/community_profiles/test_pipeline.py` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
