#!/usr/bin/env node
// Notion sync — Big Bird's Brain → Latest Sync hub
//
// Tears down stale Latest Sync content and rebuilds the hub + 4 detail pages
// (Project Audit, Roadmap, Premise Data Replacement, Data Sources Inventory).
// Idempotent: re-running wipes + rebuilds, never duplicates.
//
// Env vars:
//   NOTION_KEY              — Big Bird's Brain integration token (ntn_...)
//   NOTION_LATEST_SYNC_PAGE — optional override (default: 3658729a64598193a737f845f9747bb1)
//
// Usage (local): NOTION_KEY=ntn_... node scripts/notion-sync.mjs
// Usage (GHA):   see .github/workflows/notion-sync-weekly.yml
// Replaceability: port to Supabase Edge Function + pg_cron in ~1 day if needed.

const KEY = process.env.NOTION_KEY;
if (!KEY) {
  console.error("set NOTION_KEY");
  process.exit(2);
}
const LB_PAGE =
  process.env.NOTION_LATEST_SYNC_PAGE || "3658729a64598193a737f845f9747bb1";

const H = {
  Authorization: `Bearer ${KEY}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

async function api(method, path, body) {
  const r = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${t}`);
  return JSON.parse(t);
}

// Brand mapping: brand teal #3DC9C0 / amber #E8A84C → Notion palette
// Notion only supports: default, gray, brown, orange, yellow, green, blue, purple, pink, red
// Mapping decision: teal→blue (closest), bearish-amber→orange, bullish-highlight→green
const COLOR = {
  teal: "blue",
  amber: "orange",
  bullish: "green",
  bearish: "orange",
  neutral: "blue",
  muted: "gray",
};

// ──────────────────────────────────────────────────────────────────────
// Block builders (Notion block objects)
// ──────────────────────────────────────────────────────────────────────
const T = (text, opts = {}) => ({
  type: "text",
  text: { content: text, link: opts.link ? { url: opts.link } : null },
  annotations: {
    bold: !!opts.bold,
    italic: !!opts.italic,
    strikethrough: false,
    underline: !!opts.underline,
    code: !!opts.code,
    color: opts.color || "default",
  },
});
const P = (...rt) => ({
  object: "block",
  type: "paragraph",
  paragraph: { rich_text: rt.map((x) => (typeof x === "string" ? T(x) : x)) },
});
const H1 = (txt, color = "default") => ({
  object: "block",
  type: "heading_1",
  heading_1: { rich_text: [T(txt)], color, is_toggleable: false },
});
const H2 = (txt, color = "default") => ({
  object: "block",
  type: "heading_2",
  heading_2: { rich_text: [T(txt)], color, is_toggleable: false },
});
const H3 = (txt, color = "default") => ({
  object: "block",
  type: "heading_3",
  heading_3: { rich_text: [T(txt)], color, is_toggleable: false },
});
const BUL = (...rt) => ({
  object: "block",
  type: "bulleted_list_item",
  bulleted_list_item: {
    rich_text: rt.map((x) => (typeof x === "string" ? T(x) : x)),
  },
});
const NUM = (...rt) => ({
  object: "block",
  type: "numbered_list_item",
  numbered_list_item: {
    rich_text: rt.map((x) => (typeof x === "string" ? T(x) : x)),
  },
});
const QUOTE = (...rt) => ({
  object: "block",
  type: "quote",
  quote: { rich_text: rt.map((x) => (typeof x === "string" ? T(x) : x)) },
});
const DIVIDER = () => ({ object: "block", type: "divider", divider: {} });
const CODE = (txt, lang = "plain text") => ({
  object: "block",
  type: "code",
  code: { rich_text: [T(txt)], language: lang },
});
const CALLOUT = (emoji, color, ...rt) => ({
  object: "block",
  type: "callout",
  callout: {
    rich_text: rt.map((x) => (typeof x === "string" ? T(x) : x)),
    icon: { type: "emoji", emoji },
    color,
  },
});
// Notion table: 3 columns (Header + Status pill + Notes)
const TABLE = (rows, hasColHeader = true) => ({
  object: "block",
  type: "table",
  table: {
    table_width: rows[0].length,
    has_column_header: hasColHeader,
    has_row_header: false,
    children: rows.map((r) => ({
      object: "block",
      type: "table_row",
      table_row: {
        cells: r.map((cell) =>
          Array.isArray(cell) ? cell : [T(String(cell))],
        ),
      },
    })),
  },
});
const STATUS_PILL = (label, color) => [
  T(label, { bold: true, color: `${color}_background` }),
];

// ──────────────────────────────────────────────────────────────────────
// Step 1 — Wipe existing children of Latest Sync (archive blocks)
// ──────────────────────────────────────────────────────────────────────
async function wipeChildren(pageId) {
  console.log(`[wipe] listing children of ${pageId}`);
  let next,
    archived = 0;
  do {
    const q = next ? `?start_cursor=${next}&page_size=100` : `?page_size=100`;
    const list = await api("GET", `/blocks/${pageId}/children${q}`);
    for (const b of list.results) {
      try {
        await api("DELETE", `/blocks/${b.id}`);
        archived++;
      } catch (e) {
        console.log(`  skip ${b.id} (${b.type}): ${e.message.slice(0, 80)}`);
      }
    }
    next = list.next_cursor;
  } while (next);
  console.log(`[wipe] archived ${archived} blocks`);
}

// ──────────────────────────────────────────────────────────────────────
// Step 2 — Build content for the 4 sections + hub page
// ──────────────────────────────────────────────────────────────────────

// Hub page (Latest Sync replacement) — short, with links
const hubBlocks = () => [
  CALLOUT(
    "🦅",
    "blue_background",
    T("Big Bird's Brain — SWFL Data Gulf hub.", { bold: true }),
    T(" Mirrors the brain-platform repo. Updated 2026-05-27 by Opus 4.7."),
  ),
  P(
    T("Live MCP: ", { color: "gray" }),
    T("https://www.swfldatagulf.com/api/mcp", {
      code: true,
      link: "https://www.swfldatagulf.com/api/mcp",
    }),
  ),
  P(
    T("Public site: ", { color: "gray" }),
    T("https://www.swfldatagulf.com", {
      code: true,
      link: "https://www.swfldatagulf.com",
    }),
  ),
  P(
    T("Install: ", { color: "gray" }),
    T(
      "claude mcp add --transport http swfl https://www.swfldatagulf.com/api/mcp",
      { code: true },
    ),
  ),
  DIVIDER(),

  H2("Current state"),
  BUL(
    T("15 upstream brains feeding ", { color: "gray" }),
    T("master", { code: true }),
    T(". Master is still an index, not yet a synthesizer.", { color: "gray" }),
  ),
  BUL(
    T(
      "Speaker layer renders tier-1/2/3 voice. Every numeric claim traces to a ",
      { color: "gray" },
    ),
    T("source_url", { code: true }),
    T(".", { color: "gray" }),
  ),
  BUL(
    T(
      "Pipeline-freshness standard locked with daily probe + auto-capture incident ledger.",
      { color: "gray" },
    ),
  ),
  BUL(
    T("SESSION_LOG mechanism enforces cross-session continuity.", {
      color: "gray",
    }),
  ),
  BUL(
    T(
      "MCP v1 LIVE in prod. Waitlist + WAF rate-limit + Anthropic Connectors submitted.",
      { color: "gray" },
    ),
  ),

  H2("Recently shipped (2026-05-22 → 2026-05-27)"),
  BUL("housing-swfl (Redfin buy-side, 125 ZIPs)"),
  BUL("permits-swfl second-county join (Collier added)"),
  BUL("corridor character generator Steps 0–4.5"),
  BUL("MCP v1 + waitlist + Anthropic Connectors directory"),
  BUL(
    "Freshness-first chain (PRs #19–#26 — pipeline-freshness standard, scaffold, drift-guard, daily probe, cadence registry, 3 new Tier-1 macro pipelines)",
  ),
  BUL("Firecrawl→Spider fallback rule locked (CLAUDE.md §6 / PR #48)"),

  H2("Not done yet"),
  CALLOUT(
    "⚠️",
    "orange_background",
    T(
      "Master still an index, not synthesizer. No outcomes table. No constitution YAML. Confidence is multiplicative, not Yager-DST. ",
      { bold: true },
    ),
    T("tourism-tdt", { code: true }),
    T(
      " brain LIVE but reads from premise-engine's Supabase — must self-ingest. No watchlist. No regional expansion.",
    ),
  ),

  H2("Sub-pages"),
  P(
    T("Detailed sections live below. The repo also holds dated snapshots in ", {
      color: "gray",
    }),
    T("_AUDIT_AND_ROADMAP/", { code: true }),
    T(" and a full HTML data-sources chart at ", { color: "gray" }),
    T("_AUDIT_AND_ROADMAP/data-sources-inventory.html", { code: true }),
    T(".", { color: "gray" }),
  ),

  DIVIDER(),
  H3("Brand reference"),
  P(
    T("Logo background ", { color: "gray" }),
    T("#080E11", { code: true }),
    T(" · accent teal ", { color: "gray" }),
    T("#3DC9C0", { code: true }),
    T(" / ", { color: "gray" }),
    T("#3ECFB2", { code: true }),
    T(" · bearish amber ", { color: "gray" }),
    T("#E8A84C", { code: true }),
    T(" · IBM Plex Sans + IBM Plex Mono.", { color: "gray" }),
  ),
  CALLOUT(
    "🌊",
    "blue_background",
    T(
      "SWFL Data Gulf wave logo — three stacked sine waves at decreasing opacity (1.0 / 0.65 / 0.3). Generator: ",
      { color: "blue" },
    ),
    T("Downloads/generate-icon.html", { code: true }),
  ),
  P(
    T("Notion color palette is fixed, so this hub uses ", { color: "gray" }),
    T("blue_background", { code: true }),
    T(" for teal and ", { color: "gray" }),
    T("orange_background", { code: true }),
    T(" for amber.", { color: "gray" }),
  ),
];

// ── AUDIT child page
const auditBlocks = () => [
  CALLOUT(
    "🦅",
    "blue_background",
    T("Project audit — 2026-05-27. Source-of-truth snapshot at ", {
      bold: true,
    }),
    T("_AUDIT_AND_ROADMAP/audit-2026-05-27.md", { code: true }),
    T(" in the repo."),
  ),
  P(
    T("Branch: ", { color: "gray" }),
    T("main", { code: true }),
    T(" at ", { color: "gray" }),
    T("53d00c1", { code: true }),
    T(" → ", { color: "gray" }),
    T("5ce39db", { code: true }),
    T(
      " (post-audit commit). Working tree clean except untracked operator-owned fixture.",
      { color: "gray" },
    ),
  ),
  P(
    T("Tests: ", { color: "gray" }),
    T("bun test", { code: true }),
    T(" → 762 pass / 0 fail / 0 skipped (897ms).", { color: "gray" }),
  ),

  H2("Headline state"),
  BUL("15 upstream brains feeding master."),
  BUL(
    T("tourism-tdt", { code: true }),
    T(
      " IS LIVE — reads from premise-engine's Supabase. Flagged for self-ingest in the Premise Data Replacement page.",
    ),
  ),
  BUL(
    "MCP v1 fully live in prod. swfl_fetch returns SSE-framed JSON-RPC; tier-2 master payload carries freshness token SWFL-7421-v53-20260525.",
  ),
  BUL(
    "133 commits in the audit window. Busiest day 2026-05-27 (47 commits, 7 PRs).",
  ),

  H2("What shipped — by day"),
  TABLE([
    ["Day", "Highlight"],
    ["2026-05-22", "Fiverr briefs added."],
    [
      "2026-05-23",
      "Redfin SWFL pipeline; rentals-swfl ZORI brain (PR #9); viz scaffold.",
    ],
    [
      "2026-05-24",
      "MCP v1 step 1 + step 2 foundation; corridor-data pipeline + bundle; URL migration to www.swfldatagulf.com; Resend waitlist email.",
    ],
    [
      "2026-05-25",
      "MCP step 3 /connect; speaker CRLF fix; banned internal pack IDs in MCP; provenance page (PR #13); BLS LAUS + macro-swfl real metrics (PR #14); MarketBeat Flow 3 (PR #18).",
    ],
    [
      "2026-05-26",
      "Freshness-first chain PRs #19–#26 (pipeline-freshness standard, scaffold, drift-guard, daily probe, cadence registry, 3 new Tier-1 macro pipelines); MCP basePath fix (PR #28) — POST live; MCP v1 LIVE IN PROD; permits-swfl v2 (PR #29); SESSION_LOG mechanism; corridor-character Steps 0–2; broker-scrape pipelines killed (PR #41).",
    ],
    [
      "2026-05-27",
      "corridor-character Step 4 — all 26 corridors (PR #42); Step 4.5 type-conditional voice (PR #43); housing-swfl LIVE; permits-swfl Collier join; auto-capture incident ledger; data-intel page; FDOT pagination fix (PR #45); CI catalog drift fix (PR #46); spider extraction-schema fix (PR #47); Firecrawl→Spider plain-scrape wrapper + rule lock (PR #48); 5 stale GH issues closed; CLAUDE.md refactored 21KB→16KB; _AUDIT_AND_ROADMAP/ folder created.",
    ],
  ]),

  H2("Issue board"),
  BUL(
    T("Open: ", { bold: true }),
    T("1 — "),
    T("#44 Cron incident feed (do not close)", { code: true }),
    T(" — sticky."),
  ),
  BUL(
    T("Closed in window: ", { bold: true }),
    T(
      "#33 (epic), #34, #35, #36, #37, #38 — all corridor-character generator sub-issues. Hand-closed in ",
    ),
    T("53d00c1", { code: true }),
    T(" sweep (PRs lacked Fixes # syntax)."),
  ),
  BUL(T("Open PRs: ", { bold: true }), T("0.")),
  BUL(
    T("Stale local branch: ", { bold: true }),
    T("fix/firecrawl-agent-client", { code: true }),
    T(" — upstream gone, commits live in PR #47."),
  ),

  H2("Pipeline status"),
  TABLE([
    ["Pipeline", "Tier", "Cadence", "Status"],
    ["zori_swfl_duckdb", "T1 DuckDB", "30d", "OWN"],
    ["redfin_swfl", "T1 DuckDB", "30d", "OWN — first-fired 2026-05-27"],
    ["hurdat2_fl", "T1 DuckDB", "365d", "OWN"],
    ["storm_history_swfl", "T1 DuckDB", "30d", "OWN"],
    ["usgs", "T1 DuckDB", "30d", "OWN"],
    [
      "faf5",
      "T1 prefix",
      "365d",
      "OWN — incident OPEN (faf_sctg_lookup DDL gap)",
    ],
    ["fred_g17", "T1", "30d", "OWN — first-fired 2026-05-27"],
    ["bls_ppi", "T1", "30d", "OWN — first-fired 2026-05-27"],
    ["census_vip", "T1", "30d", "OWN — first-fired 2026-05-27"],
    ["bls_laus", "T2 dlt", "30d", "OWN"],
    ["bls_qcew", "T2 dlt", "90d", "OWN"],
    ["census_cbp", "T2 dlt", "365d", "OWN"],
    ["usgs_tier2", "T2 dlt", "30d", "OWN"],
    ["fema", "T2 dlt", "90d", "OWN"],
    ["leepa", "T2 dlt", "365d", "OWN"],
    ["fhfa", "T2 dlt", "90d", "OWN"],
    ["fdot", "T2 dlt", "365d", "OWN"],
    ["lee_permits", "T2 dlt", "7d", "OWN"],
    ["collier_permits", "T2 dlt", "30d", "OWN — first cron June 5 2026"],
    ["zori_swfl_tier2", "T2 dlt", "30d", "OWN"],
    ["news_swfl", "T1", "—", "not_yet_running — no consumer brain"],
  ]),
  CALLOUT(
    "🛠",
    "orange_background",
    T("Open incident: ", { bold: true }),
    T("faf5-annual", { code: true }),
    T(" — "),
    T('relation "data_lake.faf_sctg_lookup" does not exist', { code: true }),
    T(". Needs versioned DDL + DLT state clear."),
  ),

  H2("Roadmap state vs. ontology doc"),
  TABLE([
    ["Item", "Status"],
    ["§6.1 Master synthesizer", "NOT STARTED — highest-leverage NOW item"],
    [
      "§6.2 tourism-tdt brain",
      "LIVE (ontology doc says 'not started' — WRONG)",
    ],
    ["§6.3 Per-domain LAKE_ID", "NOT STARTED — mechanical"],
    ["§6.4 NOW acceptance tests", "NOT STARTED — gated on §6.1 + §6.5"],
    [
      "§6.5 Speaker Layer + Tier Table",
      "PARTIAL — speaker exists, tier table not formalized",
    ],
    [
      "§6.6 Trigger Logic + Capability Inventory",
      "PARTIAL — in MCP tool description",
    ],
    ["§6.7 MCP Wrapper", "SHIPPED ✅ LIVE IN PROD"],
  ]),

  H2("Phantom / dead / drift"),
  BUL(
    T(
      "docs/superpowers/plans/2026-05-26-corridor-broker-narrative-promotion/",
      { code: true },
    ),
    T(" — DEAD. Dir gitignored."),
  ),
  BUL(
    T(
      "docs/superpowers/plans/2026-05-25-firecrawl-pipeline-skeleton/README.md",
      { code: true },
    ),
    T(" — PARTIAL. Status banner added 2026-05-27."),
  ),
  BUL(
    T(
      "ingest/pipelines/{marketbeat_swfl, corridor_narratives, county_planning_swfl}/",
      { code: true },
    ),
    T(
      " — pycache dirs only after Sonnet's 2026-05-27 cleanup pass. test_pipeline_drift.py failures (pytest not in CI).",
    ),
  ),
  BUL(
    "MEMORY.md drift fixed 2026-05-27: SHA synced, tourism-tdt premise dep flagged, MCP v1 marked LIVE.",
  ),
  BUL("Stale local branch fix/firecrawl-agent-client."),

  H2("What's actually missing"),
  NUM(
    T("Master synthesizer (§6.1) — oldest unstarted NOW item.", { bold: true }),
  ),
  NUM(
    "Self-ingest tourism-tdt source data — see Premise Data Replacement page.",
  ),
  NUM("Per-domain LAKE_ID refactor (§6.3)."),
  NUM("NOW acceptance tests (§6.4)."),
  NUM("faf5-annual DDL gap."),
  NUM("news_swfl first-fire."),
  NUM(
    "Industry-characters Phase 0 (gate met by Step 4 ship; 8 files in one PR).",
  ),
  NUM(
    "Vercel-side env-var rename (code handles both names; Vercel still on legacy).",
  ),
  NUM("test_pipeline_drift.py cleanup."),

  H2("Recommended next"),
  CALLOUT(
    "🎯",
    "green_background",
    T("Master synthesizer (§6.1). ", { bold: true }),
    T(
      "Single highest-leverage unblock. After master synthesizes, every other roadmap item compounds against a real combined-conclusion endpoint. Right window: 15 upstreams shipped; never more to synthesize.",
    ),
  ),
];

// ── ROADMAP child page
const roadmapBlocks = () => [
  CALLOUT(
    "🦅",
    "blue_background",
    T("Roadmap — 2026-05-27. Source: ", { bold: true }),
    T("_AUDIT_AND_ROADMAP/roadmap-2026-05-27.md", { code: true }),
  ),

  H2("Where we are"),
  P(
    "15 upstream brains feeding master. MCP v1 live in prod. Pipeline-freshness standard locked. SESSION_LOG mechanism enforces cross-session continuity. Speaker layer renders tier-1/2/3 voice. Brain output is deterministic math + cited narrative; every numeric claim traces to a source_url.",
  ),

  H2("NEXT — 1–3 weeks (sequenced, each one PR, each unlocks the next)"),

  H3("1. Master synthesizer (§6.1)"),
  CALLOUT(
    "🎯",
    "green_background",
    T("Why first: ", { bold: true }),
    T(
      "every roadmap item below depends on it. Right window — housing-swfl + permits-swfl Collier + Step 4.5 voice all just landed.",
    ),
  ),
  BUL(
    T("outputProducer", { code: true }),
    T(" on master pack that reads downstream OUTPUT blocks and emits "),
    T("conclusion + key_metrics + caveats + contradicts", { code: true }),
    T("."),
  ),
  BUL(
    T("Close OUTPUT contract: top-level ", { color: "gray" }),
    T("trust_tier", { code: true }),
    T(", ", { color: "gray" }),
    T("direction", { code: true }),
    T(", ", { color: "gray" }),
    T("contradicts: string[]", { code: true }),
    T(" on ", { color: "gray" }),
    T("BrainOutput", { code: true }),
    T(". Atomic backfill across all 15 packs.", { color: "gray" }),
  ),
  BUL(
    T("Expand ", { color: "gray" }),
    T("inference-bait-lint", { code: true }),
    T(
      " to flag because / due to / leading to / which is why / as a result between two different brain IDs in master's OUTPUT.",
      { color: "gray" },
    ),
  ),
  BUL(
    T("Seed outcomes: ", { color: "gray" }),
    T("predictions", { code: true }),
    T(" + ", { color: "gray" }),
    T("outcomes", { code: true }),
    T(" DDL. Log every master refine. No UI yet.", { color: "gray" }),
  ),

  H3("2. Self-ingest tourism-tdt source data"),
  CALLOUT(
    "🛠",
    "orange_background",
    T(
      "Replaces the earlier 'ship tourism-tdt brain' item — that's done. Brain runs against premise-engine's Supabase today. See the Premise Data Replacement page.",
    ),
  ),
  BUL(
    T("New ", { color: "gray" }),
    T("ingest/pipelines/tdt_swfl/", { code: true }),
    T(" reading Lee County Clerk Doc 328 directly → ", { color: "gray" }),
    T("data_lake.tdt_collections", { code: true }),
    T(".", { color: "gray" }),
  ),
  BUL(
    T("Same PR cuts over ", { color: "gray" }),
    T("tourism-tdt-source.mts:TABLE", { code: true }),
    T(" to brain-platform Supabase.", { color: "gray" }),
  ),

  H3("3. Per-domain LAKE_ID refactor (§6.3)"),
  P(
    T("Replace generic ", { color: "gray" }),
    T("SWFL-7421-v…", { code: true }),
    T(" with per-domain tokens (", { color: "gray" }),
    T("FINANCE-v…", { code: true }),
    T(", ", { color: "gray" }),
    T("ENVIRONMENTAL-v…", { code: true }),
    T(", etc.). Mechanical. Unblocks stale-by-domain caveats.", {
      color: "gray",
    }),
  ),

  H3("4. NOW acceptance tests (§6.4)"),
  P(
    T("Test A (operator audit, T3): ", { bold: true }),
    T(
      '"Is now a good time to sign a 5-year accommodation lease on Fort Myers Beach?" → one synthesized conclusion citing macro + tourism + sector credit + CRE + franchise outcomes; contradictions flagged.',
    ),
  ),
  P(
    T("Test B (homebuyer, T2 conversational, via speaker): ", { bold: true }),
    T(
      "\"Under $500K in Lee County, which ZIPs give me the best shot at low flood-insurance costs without sitting in a stagnant neighborhood?\" → phone-screen length, no §, no internal pack IDs, no 'bifurcate.'",
    ),
  ),
  CALLOUT(
    "⚠️",
    "orange_background",
    T(
      "If A returns 'look at each brain individually' → §6.1 isn't done. If B returns an 800-word CRE-analyst dissertation → speaker layer (§6.5) isn't done.",
    ),
  ),

  H3("5. Industry-characters Phase 0"),
  P(
    T(
      "Clones the corridor-character generator pattern across 7 voices. One PR, 8 files: shared slug fn (TS + Python parity), DB migration ",
      { color: "gray" },
    ),
    T("corridor_industry_characters", { code: true }),
    T(", 5-tier voice router, shared ", { color: "gray" }),
    T("IndustryFactPack", { code: true }),
    T(" interface, parameterized clones of ", { color: "gray" }),
    T("corridor_grounded", { code: true }),
    T(" pipeline + synthesizer + lint, 7 cadence_registry entries.", {
      color: "gray",
    }),
  ),

  DIVIDER(),

  H2("NEAR-TERM — 1–3 months"),
  NUM(
    T(
      "Industry-characters Phase 1 — Voices 1–3 (main-street, storm-ready, move-ready). All data live; no new pipes. Three PRs.",
    ),
  ),
  NUM(
    T(
      "Corridor Factor (§7.1) — first Tier 3 derived metric. Single multiplier normalizing business performance by location advantage.",
    ),
  ),
  NUM(
    T("Constitution as YAML (§7.2) — "),
    T("refinery/constitution/master.yaml", { code: true }),
    T(". Plain YAML default; revisit GoRules Zen JDM at rule count ≥ 20."),
  ),
  NUM(T("2-round critique-revision loop at master synthesis. Hard-cap at 2.")),
  NUM(
    T("Yager-DST confidence upgrade (§7.4) — write "),
    T("refinery/lib/confidence-yager.mts", { code: true }),
    T(
      " ourselves (~30 LOC). Stale → ignorance, not disbelief. Conflict → ignorance, not amplified agreement.",
    ),
  ),
  NUM(T("Industry-characters Phases 2–4 — Voices 4–7.")),
  NUM(
    T("Spatial oracle (§7.6) — Supabase RPC "),
    T("corridor_for_point(lat, lon)", { code: true }),
    T("."),
  ),
  NUM(
    T("Report-page side channel (§7.7) — "),
    T("/r/[slug]", { code: true }),
    T(" upgrade: real charts, maps, citation tables, sortable T3 detail."),
  ),
  NUM(T("faf5-annual DDL gap.")),

  DIVIDER(),

  H2("LONG-TERM — 3–12 months"),
  NUM(
    T("Outcomes loop wired up. ", { bold: true }),
    T(
      "Cron grades predictions against observed values; surface drift; flag brains systematically wrong.",
    ),
  ),
  NUM(
    T("Causal layer (§8.1). ", { bold: true }),
    T("Instrumental variable analysis using Hurricane Ian as exogenous shock."),
  ),
  NUM(
    T("Backtests (§8.2). ", { bold: true }),
    T("Every derived metric tested against 2022–2024 outcomes."),
  ),
  NUM(
    T("Scheduled runs + watch-list + real-time subscriptions. ", {
      bold: true,
    }),
    T("3am refinery; brief in inbox by 7am."),
  ),
  NUM(
    T("Regional expansion. ", { bold: true }),
    T("FL-other-cities → FL statewide → national anchor → outlier brain."),
  ),
  NUM(
    T("Multi-tenant /vault (BYO overlay). ", { bold: true }),
    T("Companies overlay their own asset data on SWFL fact packs."),
  ),
  NUM(
    T("Multi-agent inference (§8.6). ", { bold: true }),
    T("Each brain as its own parallel Claude agent."),
  ),
  NUM(
    T("Fine-tuned synthesis model (§8.7). ", { bold: true }),
    T("Constitution stops being prompt, starts being weights."),
  ),

  DIVIDER(),

  H2("North star"),
  CALLOUT(
    "🌊",
    "blue_background",
    T(
      "A homebuyer / analyst / planner / journalist / operator holds three variables in their head. ",
      { bold: true },
    ),
    T("We hold fifty, weighted honestly, with a quoted citation chain. "),
    T("Math is easy. Weighting is everything. ", { bold: true, italic: true }),
    T(
      "Brains is the apparatus that recognizes shockwaves and weights every other brain against them.",
    ),
  ),
];

// ── PREMISE DATA REPLACEMENT child page
const premiseBlocks = () => [
  CALLOUT(
    "🦅",
    "blue_background",
    T("Premise-Engine Data — Self-Ingest Plan. Source: ", { bold: true }),
    T("_AUDIT_AND_ROADMAP/premise-data-replacement.md", { code: true }),
  ),
  P(
    T(
      "Goal: drop every live runtime dependency on premise-engine's Supabase. Self-ingest each feed; cut over the source connector; close the cross-project tether.",
      { italic: true },
    ),
  ),

  H2("Live data dependencies (must replace)"),
  TABLE([
    ["#", "Brain", "Premise table", "Origin", "Self-ingest plan"],
    [
      "1",
      "tourism-tdt",
      "fl_dor_tdt_collections",
      "Florida DOR — TDT collections. Lee County Clerk Doc 328. 103 monthly rows FY2013 → FY2026. Schema: id, county, county_fips, period, collections_usd, returns_filed, source_url, retrieved_at.",
      "New Tier-2 pipeline ingest/pipelines/tdt_swfl/ → data_lake.tdt_collections. Same PR cuts over tourism-tdt-source.mts:TABLE. Promote Collier + Charlotte county equivalents.",
    ],
  ]),

  H2(
    "Historical references (not live data — comment cleanups, no ingest needed)",
  ),
  TABLE([
    ["File", "Mention", "Action"],
    [
      "refinery/sources/cre-source.mts:23",
      "premise-engine RLAIF Phase D training proposals (mostly unapproved/inactive)",
      "Comment-only. Leave or trim.",
    ],
    [
      "refinery/sources/sector-credit-swfl-source.mts:13",
      "Live shape (from premise-engine's 20260509190000_sba_loans_schema.sql)",
      "Schema lineage. SBA loans is brain-platform's own table.",
    ],
    [
      "refinery/types/scoring.mts:2",
      "Three-layer scoring vocabulary (adapted from premise-engine's process doc)",
      "Concept lineage. No code dependency.",
    ],
    [
      "refinery/README.md:30",
      "reads premise-engine Supabase / Sanity",
      "Stale doc. Update once tourism-tdt cut-over lands.",
    ],
    [
      "docs/sql/*_grant.sql",
      "References to premise as origin of grant patterns",
      "Historical. Leave.",
    ],
  ]),

  H2("Sanity dataset — needs verification"),
  P(
    T("Per memory, brain-platform was reading ", { color: "gray" }),
    T("corridorProfile", { code: true }),
    T(" from Sanity dataset ", { color: "gray" }),
    T("lpyl3q9w/production", { code: true }),
    T(". Current code reads ", { color: "gray" }),
    T("corridor_profiles", { code: true }),
    T(
      " from Supabase. Sanity dependency appears dropped already; verify with ",
      { color: "gray" },
    ),
    T('grep -rn "@sanity/client\\|sanityClient" app/ refinery/', {
      code: true,
    }),
    T(".", { color: "gray" }),
  ),

  H2("Sequence"),
  NUM(
    T("Stand up ", { color: "gray" }),
    T("ingest/pipelines/tdt_swfl/", { code: true }),
    T(" → ", { color: "gray" }),
    T("data_lake.tdt_collections", { code: true }),
    T(". Ship in same PR as the cut-over edit to ", { color: "gray" }),
    T("tourism-tdt-source.mts", { code: true }),
    T(" (Data Tier Policy rule 2 — brain-first gate).", { color: "gray" }),
  ),
  NUM("Verify Sanity has no live @sanity/client reads."),
  NUM(
    T("Comment cleanup pass; update ", { color: "gray" }),
    T("refinery/README.md", { code: true }),
    T(".", { color: "gray" }),
  ),
  NUM("Mark premise-engine fully decoupled in SESSION_LOG; date this chart."),

  H2("Why"),
  CALLOUT(
    "⚠️",
    "orange_background",
    T("Two projects sharing a runtime Supabase = silent schema-coupling. ", {
      bold: true,
    }),
    T(
      "premise-engine can drop a column tomorrow and our tourism-tdt brain breaks. Self-ingest means we own the schema, the cadence, the freshness token, and the citation URL — same as every other brain in the lake.",
    ),
  ),
];

// ── DATA SOURCES INVENTORY child page
// Builds the full cross-walk inventory grouped by category, with status pills.
function statusCell(s) {
  const map = {
    OWN: "green",
    PREMISE: "red",
    NEED: "blue",
    PARTIAL: "yellow",
    DEFER: "gray",
  };
  const color = map[s] || "default";
  return [T(s, { bold: true, color: `${color}_background` })];
}
const inventoryBlocks = () => [
  CALLOUT(
    "🦅",
    "blue_background",
    T(
      "Data Sources Inventory — cross-walk of premise-engine's 24+ sources vs. brain-platform's current ingest state. ",
      { bold: true },
    ),
    T("Full HTML version with brand-styled status pills: "),
    T("_AUDIT_AND_ROADMAP/data-sources-inventory.html", { code: true }),
  ),
  CALLOUT(
    "🟢",
    "default",
    T("OWN ", { bold: true, color: "green_background" }),
    T(" we ingest brain-platform-controlled · ", { color: "gray" }),
    T("PREMISE-DEP ", { bold: true, color: "red_background" }),
    T(" we read from premise's Supabase today, must self-ingest · ", {
      color: "gray",
    }),
    T("NEED ", { bold: true, color: "blue_background" }),
    T(" not ingested; premise has it; build it · ", { color: "gray" }),
    T("PARTIAL ", { bold: true, color: "yellow_background" }),
    T(" some coverage; gaps documented · ", { color: "gray" }),
    T("DEFER ", { bold: true, color: "gray_background" }),
    T(" not required for current brains.", { color: "gray" }),
  ),

  H2("🔵 Demographics & Population"),
  TABLE([
    ["Source", "What we get", "Status", "Plan / brain-platform table"],
    [
      "Census ACS 5yr (2020-2024)",
      "Pop, income, age, housing, commute",
      statusCell("NEED"),
      "Build ingest/pipelines/census_acs/; consumer: demographics-swfl (planned)",
    ],
    [
      "Census ACS 1yr (2024)",
      "Faster pop + income estimates",
      statusCell("NEED"),
      "Same pipeline as 5yr; different vintage",
    ],
    [
      "Census CBP",
      "Establishments + employment by NAICS + county",
      statusCell("OWN"),
      "data_lake.census_cbp — Tier 2 dlt, annual",
    ],
    [
      "Census BPS",
      "Building permits by county — new-construction proxy",
      statusCell("NEED"),
      "Monthly. Permits-swfl regional context layer.",
    ],
    [
      "Census B25034",
      "Housing stock age distribution by block group",
      statusCell("NEED"),
      "5yr cycle. Pair with housing-swfl extension.",
    ],
    [
      "Census VIP",
      "Voting-age population",
      statusCell("OWN"),
      "lake-tier1/macro/census_vip/ — first-fired 2026-05-27",
    ],
    [
      "IRS SOI",
      "Income distribution / AGI brackets by zip",
      statusCell("NEED"),
      "Open CSV bulk download. Wealth proxy.",
    ],
    [
      "UF BEBR Projections",
      "FL county pop projections to 2045",
      statusCell("NEED"),
      "Biennial. Pair with demographics-swfl.",
    ],
    [
      "Census LODES WAC",
      "Daytime workplace population by block",
      statusCell("DEFER"),
      "One-shot bulk. No current consumer.",
    ],
  ]),

  H2("🟢 POIs & Competitive Landscape"),
  TABLE([
    ["Source", "What we get", "Status", "Plan / brain-platform table"],
    [
      "Google Places API (New)",
      "Nearby businesses, ratings, OPEN/CLOSED",
      statusCell("DEFER"),
      "5k/mo cap. Per-query cost. Defer.",
    ],
    [
      "OSM Overpass",
      "Open POI data — secondary fallback",
      statusCell("DEFER"),
      "Free. Same trigger as Google Places.",
    ],
    [
      "Foursquare OS Places",
      "~6k SWFL businesses — Apache 2.0",
      statusCell("NEED"),
      "Bulk-loadable. Candidate for cre-swfl + franchise-outcomes enrichment.",
    ],
  ]),

  H2("🟡 Traffic, Corridors & Seasonal Index"),
  TABLE([
    ["Source", "What we get", "Status", "Plan / brain-platform table"],
    [
      "FDOT AADT",
      "Annual avg daily traffic counts",
      statusCell("OWN"),
      "data_lake.fdot_aadt_fl — 103,662 rows",
    ],
    [
      "SWFL Regional Planning Council",
      "Seasonal index (snowbird mult Nov–Apr)",
      statusCell("NEED"),
      "+22% all-business swing. Pair with master synthesizer.",
    ],
    [
      "GoDaddy Venture Forward MAI",
      "Microbusiness activity index by zip",
      statusCell("NEED"),
      "Quarterly. Free. Pair with sector-credit-swfl.",
    ],
    [
      "FGCU RERI",
      "Regional Economic Research Institute indicators",
      statusCell("NEED"),
      "Quarterly. SWFL-specific pulse.",
    ],
    [
      "Lee County TDT",
      "Monthly TDT collections (FY2013→present)",
      statusCell("PREMISE"),
      "READS FROM PREMISE. Plan: ingest/pipelines/tdt_swfl/ → data_lake.tdt_collections; cut tourism-tdt-source.mts over.",
    ],
    [
      "Collier TDT",
      "Collier County TDT collections",
      statusCell("NEED"),
      "Extend Lee TDT pipeline. Two-county coverage.",
    ],
    [
      "Charlotte TDT",
      "Charlotte County TDT collections",
      statusCell("NEED"),
      "Third county. Same pipeline pattern.",
    ],
    [
      "RSW Airport Enplanements",
      "Passenger volume — snowbird arrival proxy",
      statusCell("NEED"),
      "Monthly. Pair with tourism-tdt.",
    ],
  ]),

  H2("🟣 Housing & Land Cover"),
  TABLE([
    ["Source", "What we get", "Status", "Plan / brain-platform table"],
    [
      "Zillow ZORI",
      "Rent index by zip (monthly)",
      statusCell("OWN"),
      "data_lake.zori_swfl + lake-tier1. Brain: rentals-swfl",
    ],
    [
      "Zillow ZHVI",
      "Home value index by zip (monthly)",
      statusCell("NEED"),
      "Sibling of ZORI. ingest/duckdb_pipelines/zhvi_swfl/",
    ],
    [
      "Redfin",
      "Median sale price, DOM, listing velocity (weekly)",
      statusCell("OWN"),
      "lake-tier1/market/redfin_swfl.parquet — Brain: housing-swfl",
    ],
    [
      "NLCD 2024 (USGS)",
      "Land cover classification + change count",
      statusCell("DEFER"),
      "Custom AEA WGS84 CRS. No current env-swfl consumer.",
    ],
    [
      "FHFA HPI",
      "House Price Index (Cape Coral MSA + statewide)",
      statusCell("OWN"),
      "data_lake.fhfa_hpi — Brain: housing-swfl + master",
    ],
    [
      "LeePA Parcels",
      "Lee County parcels (joined 9+10+12) ~585K rows",
      statusCell("OWN"),
      "data_lake.leepa_parcels_tier2 — Brain: properties-lee-value",
    ],
  ]),

  H2("🔴 Risk, Regulatory & Spatial Overlays"),
  TABLE([
    ["Source", "What we get", "Status", "Plan / brain-platform table"],
    [
      "FEMA NFHL",
      "Flood zone polygons (AE / X / VE)",
      statusCell("OWN"),
      "data_lake.fema_nfip_tier2 — Brain: env-swfl",
    ],
    [
      "FEMA NFIP Claims",
      "Flood insurance claims aggregates",
      statusCell("OWN"),
      "env-swfl 2-source storm-vs-baseline + storm-shadow override",
    ],
    [
      "LightBox suite",
      "NFHL / Risk Index / OZ / Wetlands / Geocoding",
      statusCell("DEFER"),
      "Paid sandbox. Defer until paid-tier business case.",
    ],
    [
      "HURDAT2",
      "Atlantic hurricane track database 1851–2024",
      statusCell("OWN"),
      "lake-tier1/environmental/hurdat2_fl.parquet",
    ],
    [
      "NOAA Storm Events",
      "Storm events 1996–2025 SWFL",
      statusCell("OWN"),
      "1,178 SWFL events — Brain: storm-history-swfl",
    ],
    [
      "FL DEP Brownfields",
      "Brownfield site polygons",
      statusCell("NEED"),
      "FDEP ArcGIS FeatureServer. Pair with env-swfl.",
    ],
    [
      "Florida Forever (FNAI)",
      "Conservation lands overlay",
      statusCell("NEED"),
      "SFWMD FNAI. Pair with env-swfl + spatial RPC.",
    ],
    [
      "FL OIR Catastrophe Claims",
      "State insurance-carrier claim aggregates",
      statusCell("NEED"),
      "HTML-only. 240 rows / 13 events. Ian Lee = 95.7% closed.",
    ],
    [
      "USGS Water",
      "USGS water sites + daily readings (SWFL)",
      statusCell("OWN"),
      "data_lake.usgs + lake-tier1",
    ],
    [
      "Lee Permits (Accela)",
      "Lee County building permits (weekly)",
      statusCell("OWN"),
      "data_lake.lee_building_permits — Brain: permits-swfl",
    ],
    [
      "Collier Permits",
      "Collier County building permits (monthly XLSX)",
      statusCell("OWN"),
      "data_lake.collier_building_permits — Firecrawl stealth-scrape",
    ],
  ]),

  H2("🔷 Entity & Business Registry"),
  TABLE([
    ["Source", "What we get", "Status", "Plan / brain-platform table"],
    [
      "Sunbiz (Firecrawl)",
      "FL business survival rates by NAICS/county",
      statusCell("NEED"),
      "Survival rate basis for franchise-outcomes enrichment",
    ],
    [
      "Sunbiz Daily Filings (SFTP)",
      "1440-char fixed-width daily snapshot",
      statusCell("DEFER"),
      "No SFTP infra yet.",
    ],
    [
      "DBPR hrfood7.csv",
      "SWFL licensed food-service establishments",
      statusCell("NEED"),
      "District 7 = SWFL. Rotation outcomes = free closure labels.",
    ],
    [
      "SBA Loans (FOIA)",
      "SBA 7(a) + 504 loan volume by zip/NAICS",
      statusCell("OWN"),
      "data_lake.sba_* — Brain: sector-credit-swfl",
    ],
    [
      "BLS LAUS",
      "County unemployment (Lee + Collier + FL)",
      statusCell("OWN"),
      "data_lake.bls_laus — 328 rows. Brain: macro-swfl",
    ],
    [
      "BLS QCEW",
      "Quarterly Census of Employment + Wages",
      statusCell("OWN"),
      "data_lake.bls_qcew — Brain: sector-credit-swfl",
    ],
    [
      "BLS PPI",
      "Producer Price Index",
      statusCell("OWN"),
      "lake-tier1/macro/bls_ppi/ — first-fired 2026-05-27",
    ],
  ]),

  H2("🟠 Spending, Financial & Economic Indicators"),
  TABLE([
    ["Source", "What we get", "Status", "Plan / brain-platform table"],
    [
      "ESRI Spending Potential",
      "Consumer spending by category + zip",
      statusCell("DEFER"),
      "Only paid source. Per-call cost. Defer.",
    ],
    [
      "FL DOR Sales Tax",
      "County-level taxable sales by industry",
      statusCell("NEED"),
      "Monthly. Actual spend activity by sector.",
    ],
    [
      "FRED",
      "Macro: unemployment, CPI, housing starts, SOFR",
      statusCell("OWN"),
      "data_lake.fred_* — Brain: macro-us / macro-florida / macro-swfl chain",
    ],
    [
      "FRED G.17",
      "Industrial Production index",
      statusCell("OWN"),
      "lake-tier1/macro/fred_g17/ — first-fired 2026-05-27",
    ],
    [
      "FDIC Summary of Deposits",
      "Bank deposits by branch + county",
      statusCell("NEED"),
      "Annual. Pair with sector-credit-swfl.",
    ],
    [
      "FAF5 freight flows",
      "Freight Analysis Framework",
      statusCell("OWN"),
      "lake-tier1/faf5/ — Brain: logistics-swfl. One open DDL incident.",
    ],
  ]),

  H2("🟢 Geocoding, Routing & Spatial Infrastructure"),
  TABLE([
    ["Source", "What we get", "Status", "Plan / brain-platform table"],
    [
      "Mapbox API",
      "Geocoding, isochrones, static maps, directions",
      statusCell("OWN"),
      "Wired via Mapbox MCP. Used by speaker layer + corridor pipeline.",
    ],
    [
      "LightBox Geocoding",
      "Parcel-level address geocoding",
      statusCell("DEFER"),
      "Mapbox covers current load.",
    ],
  ]),

  H2("🟣 AI Inference & Research"),
  TABLE([
    ["Source", "What we get", "Status", "Plan / brain-platform table"],
    [
      "Anthropic API (Opus 4.7, Sonnet 4.6, Haiku 4.5)",
      "Brain narrative renders + corridor character + web_search_20250305",
      statusCell("OWN"),
      "refinery/agents/, refinery/render/speaker.mts",
    ],
    [
      "Perplexity API",
      "Live web research",
      statusCell("DEFER"),
      "Anthropic web_search covers corridor-grounded use case.",
    ],
    [
      "Firecrawl + Spider",
      "HTML scraping (Firecrawl primary, Spider fallback)",
      statusCell("OWN"),
      "ingest/lib/extract_client.py — rule locked PR #48",
    ],
  ]),

  H2("⚪ Deferred (designed in premise, not required for brain-platform yet)"),
  TABLE([
    ["Source", "Trigger to build"],
    [
      "BLS OES — Occupational employment + wage stats",
      "Build when asset-management / lender voice ships",
    ],
    [
      "NPI Registry — Healthcare provider density",
      "Build when healthcare-adjacent brain materializes",
    ],
    ["EPA ECHO (curated)", "Pair with env-swfl extension"],
    ["SWFWMD ERP", "Build when builders-edge voice ships (Phase 2)"],
    ["FL DOR Tax Rolls", "Pair with properties-lee-value extension"],
    ["FL BEAD (broadband)", "Candidate for modernization-velocity card"],
  ]),

  DIVIDER(),
  CALLOUT(
    "📊",
    "blue_background",
    T("Summary: ", { bold: true }),
    T(
      "brain-platform has full ownership of 20 sources. 1 PREMISE-DEP (tourism-tdt must self-ingest). 12 NEED items mapped to future brain consumers. 9 DEFER items. ",
    ),
    T(
      "Self-sufficiency from premise-engine = 1 pipeline + 1 source-connector edit + 1 SESSION_LOG entry.",
      { bold: true },
    ),
  ),
];

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function appendBlocks(pageId, blocks) {
  // Notion limits 100 blocks per request
  for (const batch of chunk(blocks, 90)) {
    await api("PATCH", `/blocks/${pageId}/children`, { children: batch });
  }
}

async function createChild(parentId, title, icon, blocks) {
  const created = await api("POST", "/pages", {
    parent: { page_id: parentId },
    icon: { type: "emoji", emoji: icon },
    properties: {
      title: { title: [{ type: "text", text: { content: title } }] },
    },
    children: blocks.slice(0, 90), // first batch via create
  });
  if (blocks.length > 90) {
    await appendBlocks(created.id, blocks.slice(90));
  }
  return created;
}

(async () => {
  console.log("=== Big Bird's Brain → Latest Sync rebuild ===");

  // 1. Wipe Latest Sync
  await wipeChildren(LB_PAGE);

  // 2. Update Latest Sync title + icon + intro content
  await api("PATCH", `/pages/${LB_PAGE}`, {
    icon: { type: "emoji", emoji: "🦅" },
    properties: {
      title: {
        title: [
          {
            type: "text",
            text: { content: "🦅 Latest Sync — Big Bird's Brain (2026-05-27)" },
          },
        ],
      },
    },
  });
  await appendBlocks(LB_PAGE, hubBlocks());
  console.log("[ok] hub page rebuilt");

  // 3. Create 4 child pages
  const audit = await createChild(
    LB_PAGE,
    "Project Audit — 2026-05-27",
    "📋",
    auditBlocks(),
  );
  console.log("[ok] audit page:", audit.url);
  const roadmap = await createChild(
    LB_PAGE,
    "Roadmap — NEXT / NEAR / LONG",
    "🗺️",
    roadmapBlocks(),
  );
  console.log("[ok] roadmap page:", roadmap.url);
  const premise = await createChild(
    LB_PAGE,
    "Premise Data Replacement Plan",
    "🛠",
    premiseBlocks(),
  );
  console.log("[ok] premise page:", premise.url);
  const inv = await createChild(
    LB_PAGE,
    "Data Sources Inventory",
    "📊",
    inventoryBlocks(),
  );
  console.log("[ok] inventory page:", inv.url);

  // 4. Append link list to Latest Sync hub
  await appendBlocks(LB_PAGE, [
    DIVIDER(),
    H2("Detailed sections"),
    BUL(
      T("📋 Project Audit — ", { bold: true }),
      T(audit.url, { link: audit.url }),
    ),
    BUL(
      T("🗺️ Roadmap — ", { bold: true }),
      T(roadmap.url, { link: roadmap.url }),
    ),
    BUL(
      T("🛠 Premise Data Replacement Plan — ", { bold: true }),
      T(premise.url, { link: premise.url }),
    ),
    BUL(
      T("📊 Data Sources Inventory — ", { bold: true }),
      T(inv.url, { link: inv.url }),
    ),
  ]);

  console.log("\n=== DONE ===");
  console.log("Hub: https://www.notion.so/" + LB_PAGE.replace(/-/g, ""));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
