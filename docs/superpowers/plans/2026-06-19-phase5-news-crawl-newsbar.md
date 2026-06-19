# Phase 5 — News Crawl System + NewsBar UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 16 files, keywords: migration, schema, architecture

**Goal:** First-class SWFL business news pipeline — crawl4ai scrapes 4 local sources daily, scores articles against every active project via the existing `scoreEvent()` + `insertProjectEvent()` stack, and surfaces scored events in a horizontal NewsBar strip in the project workspace with a text-highlighter clip-to-project flow.

**Architecture:** Python DLT crawler → `data_lake.news_articles_swfl` → TypeScript Vercel Cron reads raw rows, extracts brand+ZIP via `news-event-extractor.ts`, scores via `scoreEvent()`, inserts into `project_events` via `insertProjectEvent()` → ProjectWorkspace already receives `activeEvents: ScoredEventSummary[]` → NewsBar pill strip (filtered to `business_news` + `anchor_announced`) → NewsArticleDrawer slide-in with text highlighter → `/api/projects/[id]/clip-news` promotes to `source` item + upgrades event type.

**Tech Stack:** Python 3.13 + crawl4ai 0.8.9 + DLT[postgres], TypeScript/Next.js 15 App Router, Supabase Postgres (data_lake schema), Vercel Cron

## Global Constraints

- crawl4ai is the ONLY web crawl tool — never Firecrawl (operator decree, memory `feedback_crawl4ai-not-firecrawl.md`)
- DLT pipeline uses `write_disposition="merge"` on `article_url` for dedup
- Score via existing `scoreEvent()` (`lib/signals/event-evaluator.ts`) — do not rewrite scoring
- Insert via existing `insertProjectEvent()` (`lib/project/event-insert.ts`) — do not bypass cooldown/batch logic; 14-day cooldown for `news_crawl` source is already wired
- All SQL idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- `data_lake` Postgres schema exists — new table goes there
- Workspace sub-components live in `app/project/[id]/workspace/` — NOT `components/workspace/`
- `business_news: 0.5` event_type multiplier already present in event-evaluator.ts (line 28) — no change needed
- `news_crawl` EventSource and `business_news` EventType already in `lib/signals/types.ts` — no change needed
- Stage files explicitly — never `git add -A` (RULE 1.5)
- `node scripts/safe-push.mjs` for every push (RULE 1)

---

## Session Breakdown

| Session | Scope | Blocker |
|---------|-------|---------|
| **1 (this)** | Pre-work + TS foundation: type expansion, news-event-extractor, cron route, cadence entry | None |
| **2** | Python DLT crawler + SQL schema + GHA workflow | SQL table must be applied before cron can query it |
| **3** | UI: NewsBar + NewsArticleDrawer + clip-news route + wiring | Workspace shell (Piece 1 §A) must be pushed to prod first |

---

## File Map

```
NEW — Session 1
  lib/signals/news-event-extractor.ts          brand + ZIP extraction, QualEvent emitter
  lib/signals/news-event-extractor.test.ts     unit tests (bun test)
  app/api/cron/news-crawl/route.ts             Vercel Cron: reads data_lake → score → insert

MODIFIED — Session 1
  lib/signals/types.ts                         ScoredEventSummary: add id, entity_name, headline, source_url, distance_miles
  lib/project/digest.ts                        activeEvents query: fetch new fields; lift 3-cap to 10 for news surface
  ingest/cadence_registry.yaml                 append news_swfl entry

NEW — Session 2
  docs/sql/20260619_news_articles_swfl.sql     data_lake.news_articles_swfl table + indices
  ingest/pipelines/news_swfl/__init__.py
  ingest/pipelines/news_swfl/pipeline.py       DLT resource + runner
  ingest/pipelines/news_swfl/fetcher.py        crawl4ai multi-source scraper (4 sources)
  ingest/pipelines/news_swfl/normalizer.py     text → ArticleRow
  .github/workflows/news-swfl-ingest.yml       GHA daily cron + dry-run

NEW — Session 3  (requires workspace shell on prod)
  app/project/[id]/workspace/NewsBar.tsx       horizontal pill strip
  app/project/[id]/workspace/NewsArticleDrawer.tsx   slide-in panel + highlighter
  app/api/projects/[id]/clip-news/route.ts     clip → source item + event_type upgrade

MODIFIED — Session 3
  app/project/[id]/ProjectWorkspace.tsx        add NewsBar + drawer state
  app/project/[id]/page.tsx                    pass activeEvents (may need richer query)
```

---

## Pre-Work (run before Session 1 tasks)

Before touching any feature code, verify and close out three open hygiene items.

### PW-A: Commit untracked Phase 3C/4 files

The following files are untracked — they contain Phase 3C/4 work that was written but not committed:

```
app/api/cron/                         (data-readiness route)
docs/sql/20260619_data_readiness_alerts.sql
ingest/data-verification-tolerances.yaml
lib/email/data-readiness.ts
lib/email/verification-sources.ts
```

- [ ] Run `bun tsc --noEmit 2>&1 | head -20` — confirm 0 errors before staging
- [ ] Stage and commit them:
  ```bash
  git add app/api/cron/ docs/sql/20260619_data_readiness_alerts.sql \
    ingest/data-verification-tolerances.yaml lib/email/data-readiness.ts \
    lib/email/verification-sources.ts
  git add docs/superpowers/plans/2026-06-18-branding-save-fix.md \
    docs/superpowers/plans/2026-06-18-pdf-email-blast.md \
    ingest/cadence_registry.yaml
  ```
  (Note: `ingest/cadence_registry.yaml` has unstaged modifications — confirm its changes are intentional before staging)
- [ ] Write SESSION_LOG.md entry, commit, then `node scripts/safe-push.mjs`

### PW-B: Apply project_events SQL migration

- [ ] Check if table exists:
  ```python
  python -c "
  import psycopg, tomllib
  with open('.dlt/secrets.toml','rb') as f: cfg = tomllib.load(f)
  uri = cfg['destination']['postgres']['credentials']
  with psycopg.connect(uri) as c:
      r = c.execute(\"SELECT to_regclass('public.project_events')\").fetchone()
      print('exists:', r[0])
  "
  ```
- [ ] If None → apply migration:
  ```bash
  python -c "
  import psycopg, tomllib, pathlib
  with open('.dlt/secrets.toml','rb') as f: cfg = tomllib.load(f)
  uri = cfg['destination']['postgres']['credentials']
  sql = pathlib.Path('docs/sql/20260619_project_events.sql').read_text()
  with psycopg.connect(uri) as c:
      c.execute(sql); c.commit()
      r = c.execute('SELECT COUNT(*) FROM project_events').fetchone()
      print('row count:', r[0])
  "
  ```

### PW-C: Apply data_readiness_alerts SQL migration

- [ ] Same pattern as PW-B, targeting `data_readiness_alerts`:
  ```python
  python -c "
  import psycopg, tomllib, pathlib
  with open('.dlt/secrets.toml','rb') as f: cfg = tomllib.load(f)
  uri = cfg['destination']['postgres']['credentials']
  sql = pathlib.Path('docs/sql/20260619_data_readiness_alerts.sql').read_text()
  with psycopg.connect(uri) as c:
      c.execute(sql); c.commit()
      print('applied')
  "
  ```

---

## SESSION 1 — TypeScript Foundation

### Task 1: Expand ScoredEventSummary + lift activeEvents cap

The current `ScoredEventSummary` is too lean for the NewsBar drawer (missing `id`, `entity_name`, `headline`, `source_url`, `distance_miles`). The current cap of 3 events is for AI context; the NewsBar can show up to 10.

**Files:**
- Modify: `lib/signals/types.ts:82-88`
- Modify: `lib/project/digest.ts` (activeEvents select + cap)

- [ ] **Step 1: Expand ScoredEventSummary in types.ts**

  Replace lines 82–88:
  ```typescript
  export interface ScoredEventSummary {
    id: string;
    entity_name: string;
    event_type: EventType;
    event_date: string;
    brand_tier: number;
    final_score: number;
    distance_miles: number | null;
    headline: string | null;
    source_url: string | null;
    ai_summary: string;
  }
  ```

- [ ] **Step 2: Update the activeEvents select in digest.ts**

  Find the activeEvents query (the `select` that reads `project_events` for `inject_ai=true`) — it currently fetches `{ ai_summary, event_type, event_date, brand_tier, final_score }`. Add the new fields and lift the cap from 3 to 10:
  ```typescript
  // In the caller (page.tsx or wherever it's fetched) — update the select string to:
  "id, entity_name, event_type, event_date, brand_tier, final_score, distance_miles, headline, source_url, ai_summary"
  // And limit to 10 instead of 3
  ```
  Find the exact location with: `grep -n "inject_ai\|activeEvents\|project_events" app/project/\[id\]/page.tsx`

- [ ] **Step 3: Run tsc to confirm no breakage**
  ```bash
  bun tsc --noEmit 2>&1 | head -30
  ```
  Expected: 0 new errors (existing baseline ~18 accepted-debt errors are OK)

- [ ] **Step 4: Commit**
  ```bash
  git add lib/signals/types.ts lib/project/digest.ts app/project/[id]/page.tsx
  git commit -m "feat(phase5): expand ScoredEventSummary + lift activeEvents cap to 10"
  ```

---

### Task 2: news-event-extractor.ts

Extracts a `QualEvent | null` from a raw news article. Brand detection via alias scan on headline + body. ZIP extraction via SWFL ZIP regex → `zipToCentroid()`. Event type inferred from headline keywords.

**Files:**
- Create: `lib/signals/news-event-extractor.ts`
- Create: `lib/signals/news-event-extractor.test.ts`

**Interfaces:**
- Consumes: `QualEvent` from `lib/signals/types.ts`; `BrandRegistry` from event-evaluator; `zipToCentroid()` from `lib/geo/zip-centroid.ts`
- Produces: `extractEventFromArticle(article: NewsArticleRow, brands: BrandRegistry): QualEvent | null`

- [ ] **Step 1: Write the failing test**

  ```typescript
  // lib/signals/news-event-extractor.test.ts
  import { describe, it, expect } from "bun:test";
  import { extractEventFromArticle } from "./news-event-extractor";
  import type { NewsArticleRow } from "./news-event-extractor";
  import type { BrandRegistry } from "./types";

  const BRANDS: BrandRegistry = {
    walmart: { tier: 1, category: "grocery", weight_open: 10, weight_close: 10, aliases: ["walmart", "wal-mart"] },
    publix: { tier: 1, category: "grocery", weight_open: 9, weight_close: 9, aliases: ["publix"] },
    _unclassified: { tier: 5, category: "unknown", weight_open: 0, weight_close: 0, aliases: [] },
  };

  const baseArticle: NewsArticleRow = {
    id: "a1",
    article_url: "https://naplesnews.com/article/123",
    headline: "Walmart to open new store near 33912",
    body_text: "A new Walmart Supercenter is opening on US-41 in Fort Myers ZIP 33912.",
    source_name: "naples_daily_news",
    published_date: "2026-06-19",
  };

  describe("extractEventFromArticle", () => {
    it("returns QualEvent for known brand + SWFL ZIP", () => {
      const result = extractEventFromArticle(baseArticle, BRANDS);
      expect(result).not.toBeNull();
      expect(result?.entity_name).toBe("Walmart");
      expect(result?.event_type).toBe("opening");
      expect(result?.source).toBe("news_crawl");
      expect(result?.source_url).toBe(baseArticle.article_url);
    });

    it("returns null when no known brand in text", () => {
      const art: NewsArticleRow = { ...baseArticle, headline: "Local restaurant opens in 33912", body_text: "A local eatery opens." };
      expect(extractEventFromArticle(art, BRANDS)).toBeNull();
    });

    it("returns null when no SWFL ZIP in text", () => {
      const art: NewsArticleRow = { ...baseArticle, headline: "Walmart opens in Atlanta", body_text: "New location in GA." };
      expect(extractEventFromArticle(art, BRANDS)).toBeNull();
    });

    it("infers closing from headline", () => {
      const art: NewsArticleRow = { ...baseArticle, headline: "Publix closes Fort Myers Beach store permanently 33931" };
      const result = extractEventFromArticle(art, BRANDS);
      expect(result?.event_type).toBe("closing");
    });

    it("falls back to business_news when keyword unclear", () => {
      const art: NewsArticleRow = { ...baseArticle, headline: "Walmart announces community event 33912" };
      const result = extractEventFromArticle(art, BRANDS);
      expect(result?.event_type).toBe("business_news");
    });
  });
  ```

- [ ] **Step 2: Run test to verify failure**
  ```bash
  bun test lib/signals/news-event-extractor.test.ts
  ```
  Expected: `Cannot find module './news-event-extractor'`

- [ ] **Step 3: Write implementation**

  ```typescript
  // lib/signals/news-event-extractor.ts
  import { zipToCentroid } from "@/lib/geo/zip-centroid";
  import type { QualEvent, BrandRegistry, BrandEntry } from "./types";

  export interface NewsArticleRow {
    id: string;
    article_url: string;
    headline: string;
    body_text: string | null;
    source_name: string;
    published_date: string;
  }

  // SWFL ZIP codes: Lee, Collier, Charlotte, Glades, Hendry, Sarasota ranges
  const SWFL_ZIP_RE = /\b(339\d{2}|341\d{2}|342\d{2}|340\d{2})\b/;

  const OPENING_RE = /\bopen(?:s|ing|ed)?\b|\bgrand opening\b|\bnew location\b|\bcoming soon\b|\bannounces\b/i;
  const CLOSING_RE = /\bclos(?:es|ing|ed|ure)\b|\bshut(?:s|ting)?\b|\bpermanent(?:ly)?\b|\bgoing out of business\b/i;
  const CONSTRUCTION_RE = /\bbreaks ground\b|\bconstruction begins\b|\bpermit filed\b|\bunder construction\b|\bgroundbreaking\b/i;

  /** Match article text against brand registry aliases (case-insensitive whole-word). */
  function detectBrandInText(
    text: string,
    brands: BrandRegistry,
  ): { brandKey: string; entry: BrandEntry; entityName: string } | null {
    const upper = text.toUpperCase();
    for (const [key, entry] of Object.entries(brands)) {
      if (key === "_unclassified") continue;
      if (entry.tier >= 5) continue;
      for (const alias of entry.aliases) {
        // Whole-word match
        const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (pattern.test(upper)) {
          // Capitalize first letter of each word as entity name
          const entityName = alias
            .split(/\s+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
          return { brandKey: key, entry, entityName };
        }
      }
    }
    return null;
  }

  function inferEventType(headline: string): QualEvent["event_type"] {
    if (CONSTRUCTION_RE.test(headline)) return "construction_start";
    if (OPENING_RE.test(headline)) return "opening";
    if (CLOSING_RE.test(headline)) return "closing";
    return "business_news";
  }

  /**
   * Extract a QualEvent from a raw news article row.
   * Returns null when: no known brand found, or no SWFL ZIP in text, or ZIP has no centroid.
   */
  export function extractEventFromArticle(
    article: NewsArticleRow,
    brands: BrandRegistry,
  ): QualEvent | null {
    const text = `${article.headline} ${(article.body_text ?? "").slice(0, 2000)}`;

    const brand = detectBrandInText(text, brands);
    if (!brand) return null;

    const zipMatch = SWFL_ZIP_RE.exec(text);
    if (!zipMatch) return null;

    const centroid = zipToCentroid(zipMatch[0]);
    if (!centroid) return null;

    return {
      entity_name: brand.entityName,
      entity_brand_key: brand.brandKey,
      event_type: inferEventType(article.headline),
      lat: centroid.lat,
      lng: centroid.lng,
      event_date: article.published_date,
      source: "news_crawl",
      headline: article.headline,
      source_url: article.article_url,
    };
  }
  ```

- [ ] **Step 4: Run tests**
  ```bash
  bun test lib/signals/news-event-extractor.test.ts
  ```
  Expected: 5 passed, 0 failed

- [ ] **Step 5: Commit**
  ```bash
  git add lib/signals/news-event-extractor.ts lib/signals/news-event-extractor.test.ts
  git commit -m "feat(phase5): news-event-extractor — brand + ZIP detection, QualEvent emitter"
  ```

---

### Task 3: app/api/cron/news-crawl/route.ts

Vercel Cron fires daily after the Python pipeline writes articles. Reads unprocessed rows from `data_lake.news_articles_swfl`, loads brand registry + radius config, extracts events, scores against every active project, inserts via `insertProjectEvent()`, marks rows processed.

**Files:**
- Create: `app/api/cron/news-crawl/route.ts`

**Interfaces:**
- Consumes: `extractEventFromArticle()` from Task 2; `scoreEvent()` from `lib/signals/event-evaluator.ts`; `insertProjectEvent()` from `lib/project/event-insert.ts`; Supabase service client
- Produces: JSON `{ processed: number, events_inserted: number, events_suppressed: number }`

- [ ] **Step 1: Check how the existing data-readiness cron is structured**
  ```bash
  head -30 app/api/cron/data-readiness/route.ts
  ```
  Confirm: Vercel Cron auth pattern (check `x-vercel-cron` or `Authorization: Bearer $CRON_SECRET`). Mirror that auth guard exactly.

- [ ] **Step 2: Write the route**

  ```typescript
  // app/api/cron/news-crawl/route.ts
  import { createClient } from "@supabase/supabase-js";
  import { scoreEvent, loadBrandRegistry, loadRadiusConfig } from "@/lib/signals/event-evaluator";
  import { insertProjectEvent } from "@/lib/project/event-insert";
  import { extractEventFromArticle } from "@/lib/signals/news-event-extractor";
  import type { NewsArticleRow } from "@/lib/signals/news-event-extractor";

  export const runtime = "nodejs";
  export const maxDuration = 300;

  const BATCH_SIZE = 50;

  export async function GET(req: Request) {
    // Auth: match the pattern from data-readiness cron exactly
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Load scoring config (lazy-cached in evaluator; first load hits disk)
    const brands = await loadBrandRegistry();
    const radiusConfig = await loadRadiusConfig();

    // 1. Fetch unprocessed news articles (newest first, capped at BATCH_SIZE)
    const { data: articles, error: artErr } = await supabase
      .schema("data_lake")
      .from("news_articles_swfl")
      .select("id, article_url, headline, body_text, source_name, published_date")
      .is("processed_at", null)
      .order("scraped_at", { ascending: false })
      .limit(BATCH_SIZE)
      .returns<NewsArticleRow[]>();

    if (artErr) return Response.json({ error: artErr.message }, { status: 500 });
    if (!articles || articles.length === 0) return Response.json({ processed: 0, events_inserted: 0, events_suppressed: 0 });

    // 2. Load active projects with coordinates
    const { data: projects } = await supabase
      .from("projects")
      .select("id, lat, lng, project_type, derived_project_type")
      .not("lat", "is", null)
      .not("lng", "is", null);

    if (!projects || projects.length === 0) {
      // Mark articles processed even if no projects to score against
      await supabase
        .schema("data_lake")
        .from("news_articles_swfl")
        .update({ processed_at: new Date().toISOString() })
        .in("id", articles.map((a) => a.id));
      return Response.json({ processed: articles.length, events_inserted: 0, events_suppressed: 0 });
    }

    let eventsInserted = 0;
    let eventsSuppressed = 0;
    const processedIds: string[] = [];

    for (const article of articles) {
      const qualEvent = extractEventFromArticle(article, brands);
      if (!qualEvent) {
        processedIds.push(article.id);
        continue;
      }

      for (const project of projects) {
        const projectType = (project.project_type ?? project.derived_project_type) as string | null;
        const scored = scoreEvent(
          qualEvent,
          { lat: project.lat, lng: project.lng, project_type: projectType },
          brands,
          radiusConfig,
        );

        if (!scored.inject_ai && !scored.notify_user) continue;

        const result = await insertProjectEvent(supabase, project.id, scored);
        if (result.inserted) eventsInserted++;
        else eventsSuppressed++;
      }

      processedIds.push(article.id);
    }

    // Mark processed
    if (processedIds.length > 0) {
      await supabase
        .schema("data_lake")
        .from("news_articles_swfl")
        .update({ processed_at: new Date().toISOString() })
        .in("id", processedIds);
    }

    return Response.json({
      processed: processedIds.length,
      events_inserted: eventsInserted,
      events_suppressed: eventsSuppressed,
    });
  }
  ```

- [ ] **Step 3: Check that loadBrandRegistry + loadRadiusConfig are exported from event-evaluator.ts**
  ```bash
  grep -n "^export" lib/signals/event-evaluator.ts | head -20
  ```
  If they're not exported by that name, find the actual export name and adjust the import.

- [ ] **Step 4: tsc check**
  ```bash
  bun tsc --noEmit 2>&1 | grep "news-crawl\|news-event" | head -20
  ```
  Expected: no errors in these files

- [ ] **Step 5: Commit**
  ```bash
  git add app/api/cron/news-crawl/route.ts
  git commit -m "feat(phase5): Vercel Cron handler — score news articles against active projects"
  ```

---

### Task 4: cadence_registry.yaml — news_swfl entry

Registers the pipeline so the ops probe and the build-queue tracker know it exists.

**Files:**
- Modify: `ingest/cadence_registry.yaml`

- [ ] **Step 1: Append news_swfl entry**

  Add to the appropriate section (after the last pipeline entry, before any `not_yet_running:` block):
  ```yaml
  news_swfl:
    label: SWFL Business News
    cadence: daily
    schedule: "0 7 * * *"    # 7am UTC — after Python crawler runs at 6am UTC
    tier: 2
    pipeline: ingest/pipelines/news_swfl
    freshness_table: data_lake.news_articles_swfl
    freshness_column: scraped_at
    expected_rows_min: 1
    dlt_schema_name: data_lake
    source_tag: news_crawl
    note: "4 SWFL sources via crawl4ai. Cron at /api/cron/news-crawl scores + inserts into project_events."
  ```

- [ ] **Step 2: Verify registry loads without error**
  ```bash
  node -e "
  const fs = require('fs');
  const yaml = require('js-yaml');
  const reg = yaml.load(fs.readFileSync('ingest/cadence_registry.yaml','utf8'));
  console.log('news_swfl:', JSON.stringify(reg.news_swfl ?? reg.pipelines?.news_swfl, null, 2));
  "
  ```
  If js-yaml not available: `python -c "import yaml; d=yaml.safe_load(open('ingest/cadence_registry.yaml')); print(d.get('news_swfl','MISSING'))"`

- [ ] **Step 3: Commit + push Session 1**
  ```bash
  git add ingest/cadence_registry.yaml
  git commit -m "feat(phase5): cadence registry — news_swfl daily entry"
  ```
  Update SESSION_LOG.md (top entry), then:
  ```bash
  node scripts/safe-push.mjs
  ```

---

## SESSION 2 — Python Crawler + SQL Schema + GHA

### Task 5: data_lake.news_articles_swfl SQL schema

**Files:**
- Create: `docs/sql/20260619_news_articles_swfl.sql`

- [ ] **Step 1: Write SQL**

  ```sql
  -- data_lake.news_articles_swfl
  -- Raw scraped articles from SWFL local news sources.
  -- Processed by app/api/cron/news-crawl which scores + inserts into project_events.

  CREATE TABLE IF NOT EXISTS data_lake.news_articles_swfl (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    article_url    text UNIQUE NOT NULL,
    headline       text NOT NULL,
    body_text      text,
    source_name    text NOT NULL,
    published_date date,
    scraped_at     timestamptz NOT NULL DEFAULT now(),
    processed_at   timestamptz,
    swfl_relevance boolean NOT NULL DEFAULT false
  );

  CREATE INDEX IF NOT EXISTS news_articles_unprocessed
    ON data_lake.news_articles_swfl (scraped_at DESC)
    WHERE processed_at IS NULL;

  GRANT SELECT, INSERT, UPDATE ON data_lake.news_articles_swfl TO service_role;
  NOTIFY pgrst, 'reload schema';
  ```

- [ ] **Step 2: Apply to prod**
  ```python
  python -c "
  import psycopg, tomllib, pathlib
  with open('.dlt/secrets.toml','rb') as f: cfg = tomllib.load(f)
  uri = cfg['destination']['postgres']['credentials']
  sql = pathlib.Path('docs/sql/20260619_news_articles_swfl.sql').read_text()
  with psycopg.connect(uri) as c:
      c.execute(sql); c.commit()
      r = c.execute(\"SELECT COUNT(*) FROM data_lake.news_articles_swfl\").fetchone()
      print('row count:', r[0])
  "
  ```
  Expected: `row count: 0`

- [ ] **Step 3: Commit SQL file**
  ```bash
  git add docs/sql/20260619_news_articles_swfl.sql
  git commit -m "feat(phase5): data_lake.news_articles_swfl schema — applied to prod"
  ```

---

### Task 6: Python DLT pipeline — news_swfl

Four sources: Naples Daily News, Fort Myers News-Press, Lee County Govt, Collier County Govt. crawl4ai scrapes the business/news listing page, extracts article links + headlines, scrapes body of each SWFL-relevant article (capped at 10/source).

**Files:**
- Create: `ingest/pipelines/news_swfl/__init__.py` (empty)
- Create: `ingest/pipelines/news_swfl/pipeline.py`
- Create: `ingest/pipelines/news_swfl/fetcher.py`
- Create: `ingest/pipelines/news_swfl/normalizer.py`

- [ ] **Step 1: normalizer.py**

  ```python
  # ingest/pipelines/news_swfl/normalizer.py
  import re
  from datetime import date
  from typing import TypedDict

  SWFL_TERMS = {
      "fort myers", "cape coral", "naples", "bonita springs", "lehigh acres",
      "marco island", "estero", "bonita", "sanibel", "captiva", "immokalee",
      "collier", "lee county",
  }
  SWFL_ZIP_RE = re.compile(r"\b(339\d{2}|341\d{2}|342\d{2}|340\d{2})\b")


  class ArticleRow(TypedDict):
      article_url: str
      headline: str
      body_text: str
      source_name: str
      published_date: str
      swfl_relevance: bool


  def is_swfl_relevant(text: str) -> bool:
      lower = text.lower()
      return bool(SWFL_ZIP_RE.search(text)) or any(t in lower for t in SWFL_TERMS)


  def normalize(
      article_url: str,
      headline: str,
      body_text: str,
      source_name: str,
      published_date: str | None,
  ) -> ArticleRow:
      clean_body = body_text[:3000].strip()
      pub = published_date or str(date.today())
      return ArticleRow(
          article_url=article_url,
          headline=headline.strip(),
          body_text=clean_body,
          source_name=source_name,
          published_date=pub,
          swfl_relevance=is_swfl_relevant(f"{headline} {clean_body}"),
      )
  ```

- [ ] **Step 2: fetcher.py**

  ```python
  # ingest/pipelines/news_swfl/fetcher.py
  import asyncio
  import re
  from crawl4ai import AsyncWebCrawler
  from .normalizer import normalize, is_swfl_relevant, ArticleRow

  SOURCES = [
      {
          "name": "naples_daily_news",
          "url": "https://www.naplesnews.com/business/",
      },
      {
          "name": "fort_myers_news_press",
          "url": "https://www.news-press.com/business/",
      },
      {
          "name": "lee_county_govt",
          "url": "https://www.leegov.com/news/releases",
      },
      {
          "name": "collier_county_govt",
          "url": "https://www.colliercountyfl.gov/news",
      },
  ]

  LINK_RE = re.compile(r"\[([^\]]{10,120})\]\((https?://[^\)]+)\)")
  MAX_ARTICLES_PER_SOURCE = 10


  async def _scrape_listing(crawler: AsyncWebCrawler, source: dict) -> list[dict]:
      """Scrape a section listing page and return candidate article {headline, url} dicts."""
      result = await crawler.arun(url=source["url"])
      md = result.markdown or ""
      candidates = []
      for headline, url in LINK_RE.findall(md):
          if source["name"] in ("lee_county_govt", "collier_county_govt"):
              # Govt pages: any link title is a release headline
              candidates.append({"headline": headline, "url": url})
          elif any(kw in url for kw in ["/story/", "/article/", "/news/"]):
              candidates.append({"headline": headline, "url": url})
      # SWFL-filter headlines at listing stage to avoid scraping OOT articles
      return [c for c in candidates if is_swfl_relevant(c["headline"])][:MAX_ARTICLES_PER_SOURCE * 2]


  async def _scrape_article(crawler: AsyncWebCrawler, url: str) -> str:
      """Scrape article body text (first 3000 chars of markdown)."""
      try:
          result = await crawler.arun(url=url)
          return (result.markdown or "")[:3000]
      except Exception:
          return ""


  async def _process_source(source: dict) -> list[ArticleRow]:
      async with AsyncWebCrawler() as crawler:
          candidates = await _scrape_listing(crawler, source)
          articles: list[ArticleRow] = []
          for candidate in candidates[:MAX_ARTICLES_PER_SOURCE]:
              body = await _scrape_article(crawler, candidate["url"])
              row = normalize(
                  article_url=candidate["url"],
                  headline=candidate["headline"],
                  body_text=body,
                  source_name=source["name"],
                  published_date=None,  # normalizer fills today's date
              )
              if row["swfl_relevance"]:
                  articles.append(row)
          return articles


  def fetch_all_sources() -> list[ArticleRow]:
      """Synchronously run all source scrapers and return merged article list."""
      async def _run():
          results = await asyncio.gather(
              *[_process_source(s) for s in SOURCES],
              return_exceptions=True,
          )
          articles = []
          for r in results:
              if isinstance(r, Exception):
                  print(f"[news_swfl] source error: {r}")
              else:
                  articles.extend(r)
          return articles

      return asyncio.run(_run())
  ```

- [ ] **Step 3: pipeline.py**

  ```python
  # ingest/pipelines/news_swfl/pipeline.py
  import sys
  import dlt
  from .fetcher import fetch_all_sources

  @dlt.resource(
      name="news_articles_swfl",
      write_disposition="merge",
      primary_key="article_url",
  )
  def news_articles():
      articles = fetch_all_sources()
      print(f"[news_swfl] fetched {len(articles)} SWFL-relevant articles")
      yield from articles


  def build_pipeline():
      return dlt.pipeline(
          pipeline_name="news_swfl",
          destination="postgres",
          dataset_name="data_lake",
      )


  def run(dry_run: bool = False):
      if dry_run:
          articles = fetch_all_sources()
          print(f"[news_swfl] DRY RUN — would insert {len(articles)} articles:")
          for a in articles[:5]:
              print(f"  {a['source_name']}: {a['headline'][:80]}")
          return

      pipeline = build_pipeline()
      load_info = pipeline.run(news_articles())
      print(load_info)


  if __name__ == "__main__":
      dry_run = "--dry-run" in sys.argv
      run(dry_run=dry_run)
  ```

- [ ] **Step 4: __init__.py**
  ```python
  # ingest/pipelines/news_swfl/__init__.py
  ```
  (empty)

- [ ] **Step 5: Dry-run test locally**
  ```bash
  pip install dlt[postgres] crawl4ai playwright
  playwright install chromium
  python -m ingest.pipelines.news_swfl.pipeline --dry-run
  ```
  Expected: prints article headlines from at least 2 sources, no exceptions

- [ ] **Step 6: Commit**
  ```bash
  git add ingest/pipelines/news_swfl/
  git commit -m "feat(phase5): news_swfl DLT pipeline — crawl4ai 4-source scraper"
  ```

---

### Task 7: GHA workflow — news-swfl-ingest.yml

**Files:**
- Create: `.github/workflows/news-swfl-ingest.yml`

- [ ] **Step 1: Write workflow**

  ```yaml
  # .github/workflows/news-swfl-ingest.yml
  name: news-swfl-ingest

  on:
    schedule:
      - cron: "0 6 * * *"    # 6am UTC daily — crawler runs, then cron scores at 7am UTC
    workflow_dispatch:
      inputs:
        dry_run:
          description: "Dry run (no DB writes)"
          type: boolean
          default: false

  jobs:
    ingest:
      runs-on: ubuntu-latest
      timeout-minutes: 30
      env:
        DESTINATION__POSTGRES__CREDENTIALS: ${{ secrets.SUPABASE_DB_URI }}

      steps:
        - uses: actions/checkout@v4

        - uses: actions/setup-python@v5
          with:
            python-version: "3.13"

        - name: Install dependencies
          run: pip install "dlt[postgres]" "crawl4ai>=0.8.9"

        - name: Install crawl4ai browser
          run: crawl4ai-setup

        - name: Run news ingest
          run: |
            python -m ingest.pipelines.news_swfl.pipeline \
              ${{ github.event.inputs.dry_run == 'true' && '--dry-run' || '' }}

        - name: Log failure
          if: failure()
          uses: ./.github/actions/log-cron-incident
          with:
            pipeline: news_swfl
            detail: "GHA runner failed — see workflow logs"
  ```

  (Note: `log-cron-incident` composite action follows the existing incident-capture pattern from `docs/cron-rebuild-failures.md`. Verify the action path exists in `.github/actions/`; if not, omit the last step.)

- [ ] **Step 2: Verify SUPABASE_DB_URI secret exists**
  ```bash
  gh secret list -R ethanrickyjrjr-wq/brain-platform | grep -i supabase
  ```
  If missing: `gh secret set SUPABASE_DB_URI` with the URI from `.dlt/secrets.toml`

- [ ] **Step 3: Commit + push Session 2**
  ```bash
  git add .github/workflows/news-swfl-ingest.yml
  git commit -m "feat(phase5): GHA daily cron for news_swfl ingest"
  ```
  Update SESSION_LOG.md (top entry), then:
  ```bash
  node scripts/safe-push.mjs
  ```

---

## SESSION 3 — UI Layer

> **BLOCKER:** The workspace shell (Piece 1 §A — `ProjectWorkspace.tsx`, `ItemsBoard.tsx`, etc.) must be pushed to prod before Session 3. Confirm with `node scripts/safe-push.mjs` on those files first.

### Task 8: NewsBar.tsx

Horizontal scrollable pill strip. Filters `activeEvents` for news-relevant types (`business_news`, `anchor_announced`, `opening`, `closing`). Sorts by `final_score` descending. Returns null when empty.

**Files:**
- Create: `app/project/[id]/workspace/NewsBar.tsx`

- [ ] **Step 1: Write component**

  ```typescript
  // app/project/[id]/workspace/NewsBar.tsx
  "use client";

  import type { ScoredEventSummary } from "@/lib/signals/types";

  interface Props {
    events: ScoredEventSummary[];
    onSelect: (event: ScoredEventSummary) => void;
  }

  const NEWS_TYPES = new Set(["business_news", "anchor_announced", "opening", "closing"]);

  const PILL_COLOR: Record<string, string> = {
    opening: "bg-green-50 border-green-200 text-green-800",
    anchor_announced: "bg-blue-50 border-blue-200 text-blue-800",
    closing: "bg-red-50 border-red-200 text-red-800",
    business_news: "bg-slate-50 border-slate-200 text-slate-600",
  };

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  export function NewsBar({ events, onSelect }: Props) {
    const newsEvents = events
      .filter((e) => NEWS_TYPES.has(e.event_type))
      .sort((a, b) => b.final_score - a.final_score);

    if (newsEvents.length === 0) return null;

    return (
      <div className="flex gap-2 overflow-x-auto px-4 py-2 border-b border-slate-100 bg-white scrollbar-none">
        {newsEvents.map((ev) => (
          <button
            key={ev.id}
            onClick={() => onSelect(ev)}
            className={`flex-none flex items-center gap-2 rounded-full border px-3 py-1 text-xs whitespace-nowrap hover:opacity-80 transition-opacity ${PILL_COLOR[ev.event_type] ?? PILL_COLOR.business_news}`}
          >
            <span className="font-medium">{ev.entity_name}</span>
            {ev.distance_miles != null && (
              <span className="opacity-60">{ev.distance_miles.toFixed(1)}mi</span>
            )}
            <span className="opacity-50">{formatDate(ev.event_date)}</span>
          </button>
        ))}
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add app/project/[id]/workspace/NewsBar.tsx
  git commit -m "feat(phase5): NewsBar — horizontal scored-event pill strip"
  ```

---

### Task 9: NewsArticleDrawer.tsx

Slide-in right-side drawer. Shows article headline + ai_summary + source link. Browser-native text selection → "Add to Project" button appears inline. Dismiss button sets `dismissed_at`.

**Files:**
- Create: `app/project/[id]/workspace/NewsArticleDrawer.tsx`

- [ ] **Step 1: Write component**

  ```typescript
  // app/project/[id]/workspace/NewsArticleDrawer.tsx
  "use client";

  import { useEffect, useState } from "react";
  import type { ScoredEventSummary } from "@/lib/signals/types";

  interface Props {
    event: ScoredEventSummary | null;
    projectId: string;
    onClose: () => void;
    onClipped: () => void;
  }

  const EVENT_LABEL: Record<string, string> = {
    opening: "Opening",
    closing: "Closing",
    anchor_announced: "Anchor Announced",
    construction_start: "Construction",
    business_news: "News",
  };

  export function NewsArticleDrawer({ event, projectId, onClose, onClipped }: Props) {
    const [selectedText, setSelectedText] = useState<string | null>(null);
    const [clipping, setClipping] = useState(false);
    const [dismissing, setDismissing] = useState(false);

    useEffect(() => {
      if (!event) setSelectedText(null);
    }, [event]);

    function handleMouseUp() {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      setSelectedText(text.length >= 10 ? text : null);
    }

    async function handleClip() {
      if (!event?.id || !selectedText) return;
      setClipping(true);
      await fetch(`/api/projects/${projectId}/clip-news`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, selected_text: selectedText }),
      });
      setClipping(false);
      onClipped();
      onClose();
    }

    async function handleDismiss() {
      if (!event?.id) return;
      setDismissing(true);
      await fetch(`/api/projects/${projectId}/clip-news`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, action: "dismiss" }),
      });
      setDismissing(false);
      onClose();
      // Parent should re-fetch activeEvents after dismiss
    }

    if (!event) return null;

    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 z-40" onClick={onClose} />
        {/* Drawer */}
        <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-slate-200 flex flex-col z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {EVENT_LABEL[event.event_type] ?? "News"}
              </span>
              <span className="text-sm font-semibold text-slate-800">{event.entity_name}</span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">
              ×
            </button>
          </div>

          {/* Body — selectable */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4 text-sm text-slate-700 select-text"
            onMouseUp={handleMouseUp}
          >
            {event.headline && (
              <p className="font-semibold text-slate-900 mb-3 leading-snug">{event.headline}</p>
            )}
            {event.source_url && (
              <a
                href={event.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 underline mb-4 block truncate"
              >
                {event.source_url}
              </a>
            )}
            {event.ai_summary && (
              <p className="text-slate-600 leading-relaxed">{event.ai_summary}</p>
            )}
            <p className="text-xs text-slate-400 mt-6 select-none">
              Select any text above, then click "Add to Project"
            </p>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-100 space-y-2">
            {selectedText && (
              <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500 truncate mb-1">"{selectedText}"</p>
                <button
                  onClick={handleClip}
                  disabled={clipping}
                  className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {clipping ? "Adding…" : "Add to Project"}
                </button>
              </div>
            )}
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              {dismissing ? "Dismissing…" : "Dismiss"}
            </button>
          </div>
        </div>
      </>
    );
  }
  ```

- [ ] **Step 2: Commit**
  ```bash
  git add app/project/[id]/workspace/NewsArticleDrawer.tsx
  git commit -m "feat(phase5): NewsArticleDrawer — slide-in panel + text highlighter + dismiss"
  ```

---

### Task 10: /api/projects/[id]/clip-news/route.ts

Handles both clip (creates source item + upgrades event_type) and dismiss (sets dismissed_at). Uses service-role client — must verify `project_id` matches the authed user's project via RLS.

**Files:**
- Create: `app/api/projects/[id]/clip-news/route.ts`

- [ ] **Step 1: Check how existing routes do RLS auth (cookie client pattern)**
  ```bash
  head -20 app/api/projects/\[id\]/refresh/route.ts
  ```
  Mirror the exact `createServerClient()` pattern used there.

- [ ] **Step 2: Write route**

  ```typescript
  // app/api/projects/[id]/clip-news/route.ts
  import { createServerClient } from "@/lib/supabase/server"; // mirror existing routes
  import { NextResponse } from "next/server";

  interface ClipBody {
    event_id: string;
    selected_text?: string;
    action?: "clip" | "dismiss";
  }

  export async function POST(
    req: Request,
    { params }: { params: { id: string } },
  ) {
    const supabase = createServerClient();
    const projectId = params.id;
    const body: ClipBody = await req.json();

    // Verify project belongs to authed user (RLS will block if not)
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, items")
      .eq("id", projectId)
      .single();

    if (projErr || !project) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const action = body.action ?? "clip";

    // Dismiss path
    if (action === "dismiss") {
      await supabase
        .from("project_events")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", body.event_id)
        .eq("project_id", projectId);
      return NextResponse.json({ ok: true, action: "dismissed" });
    }

    // Clip path — requires selected_text
    if (!body.selected_text?.trim()) {
      return NextResponse.json({ error: "selected_text required" }, { status: 400 });
    }

    // Get the event
    const { data: event, error: evErr } = await supabase
      .from("project_events")
      .select("id, headline, source_url, entity_name, event_type")
      .eq("id", body.event_id)
      .eq("project_id", projectId)
      .single();

    if (evErr || !event) {
      return NextResponse.json({ error: "event_not_found" }, { status: 404 });
    }

    // 1. Append source item to project.items
    const existingItems = (project.items as unknown[]) ?? [];
    const newItem = {
      id: crypto.randomUUID(),
      kind: "source",
      label: event.headline ?? event.entity_name ?? "News clip",
      url: event.source_url ?? null,
      note: body.selected_text.trim(),
      created_at: new Date().toISOString(),
    };

    await supabase
      .from("projects")
      .update({ items: [...existingItems, newItem] })
      .eq("id", projectId);

    // 2. Upgrade event type: business_news → anchor_announced (human confirmation signal)
    if (event.event_type === "business_news") {
      await supabase
        .from("project_events")
        .update({ event_type: "anchor_announced", inject_ai: true })
        .eq("id", body.event_id);
    }

    return NextResponse.json({ ok: true, action: "clipped", item_id: newItem.id });
  }
  ```

- [ ] **Step 3: tsc check**
  ```bash
  bun tsc --noEmit 2>&1 | grep "clip-news" | head -10
  ```

- [ ] **Step 4: Commit**
  ```bash
  git add app/api/projects/[id]/clip-news/route.ts
  git commit -m "feat(phase5): clip-news route — source item + anchor_announced upgrade + dismiss"
  ```

---

### Task 11: Wire NewsBar + Drawer into ProjectWorkspace

Add NewsBar between the BrandingBlock/toolbar area and ItemsBoard. Add drawer state. The `activeEvents` prop already flows in — no page.tsx changes needed beyond verifying the richer select (confirmed in Task 1).

**Files:**
- Modify: `app/project/[id]/ProjectWorkspace.tsx`

- [ ] **Step 1: Add imports**
  ```typescript
  import { NewsBar } from "./workspace/NewsBar";
  import { NewsArticleDrawer } from "./workspace/NewsArticleDrawer";
  ```

- [ ] **Step 2: Add drawer state** (inside the component, after existing useState declarations)
  ```typescript
  const [selectedNewsEvent, setSelectedNewsEvent] = useState<ScoredEventSummary | null>(null);
  ```

- [ ] **Step 3: Add NewsBar + Drawer to JSX**

  Find the comment `Layout: Title → Brand+AI pills (popovers) → ItemsBoard …` in the JSX, which describes the render order. Insert NewsBar between the branding area and `<ItemsBoard>`:

  ```tsx
  {/* News feed — scored nearby events, business_news filtered */}
  <NewsBar
    events={activeEvents}
    onSelect={setSelectedNewsEvent}
  />

  <ItemsBoard … />
  ```

  And add the drawer (outside the main scroll container, before the closing tag of the component root):
  ```tsx
  <NewsArticleDrawer
    event={selectedNewsEvent}
    projectId={id}
    onClose={() => setSelectedNewsEvent(null)}
    onClipped={() => {
      // Force page refresh to reload items + updated events
      router.refresh();
      setSelectedNewsEvent(null);
    }}
  />
  ```

- [ ] **Step 4: tsc + lint check**
  ```bash
  bun tsc --noEmit 2>&1 | grep "ProjectWorkspace\|NewsBar\|NewsArticle" | head -20
  npx next lint app/project/[id]/ProjectWorkspace.tsx 2>&1 | tail -5
  ```

- [ ] **Step 5: Build check**
  ```bash
  npx next build 2>&1 | tail -20
  ```
  Expected: ✓ no errors

- [ ] **Step 6: Commit + push Session 3**
  ```bash
  git add app/project/[id]/ProjectWorkspace.tsx
  git commit -m "feat(phase5): wire NewsBar + NewsArticleDrawer into workspace"
  ```
  Update SESSION_LOG.md (top entry), then:
  ```bash
  node scripts/safe-push.mjs
  ```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| 5A: Daily news crawl, SWFL sources | Task 6 (4 sources: Daily News, News-Press, Lee govt, Collier govt) |
| 5A: Brand extraction + address/ZIP | Task 2 (news-event-extractor) |
| 5A: QualEvent → scoreEvent() → project_events | Task 3 (cron route) |
| 5A: 14-day business_news cooldown | Already wired in event-insert.ts (no change) |
| 5A: cadence_registry entry | Task 4 |
| 5A: 0.5 business_news multiplier | Already wired in event-evaluator.ts line 28 (confirmed) |
| 5B: NewsBar horizontal strip | Task 8 |
| 5B: Ordered by final_score desc | Task 8 (sorted in component) |
| 5B: Color by event type | Task 8 (PILL_COLOR map) |
| 5B: Click → NewsArticleDrawer | Tasks 8+11 |
| 5B: Dismiss → dismissed_at | Task 9 (dismiss button → clip-news?action=dismiss) + Task 10 |
| 5C: Text highlighter → "Add to Project" | Task 9 (onMouseUp + selectedText state) |
| 5C: Selected text → source item | Task 10 (items append) |
| 5C: business_news → anchor_announced upgrade | Task 10 |
| 5C: inject_ai = true on clip | Task 10 |
| Source registry entry | Task 4 (cadence_registry) |
| SQL schema for raw articles | Task 5 |
| GHA cron wrapper | Task 7 |
| Google News (source 2 in spec) | NOT in Task 6 — see note below |

**Gap note — Google News search source:** The spec lists "Google News search" as source 2. Scraping google.com/search is unreliable (aggressive bot detection). Deferred from MVP crawler — the 4 direct-source crawls cover the same article corpus. Add as Task 6b in a follow-up session if direct source yield is low.

**Type consistency check:**
- `ScoredEventSummary.id: string` added in Task 1 → used in Tasks 9, 10 ✓
- `ScoredEventSummary.entity_name: string` added in Task 1 → used in Tasks 8, 9 ✓
- `extractEventFromArticle(article: NewsArticleRow, brands: BrandRegistry): QualEvent | null` defined Task 2 → imported Task 3 ✓
- `clip-news` route body type `ClipBody` aligns with Task 9 fetch calls ✓

**Placeholder check:** None found. All steps contain real commands or real code.
