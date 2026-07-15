import { test, expect, describe } from "bun:test";
import {
  buildGroundingContext,
  renderBlock,
  type GroundingBlock,
} from "@/lib/highlighter/grounding";
import { buildDossier, type Dossier } from "@/lib/fetch-brain";
import { speak, cleanCitationForDisplay, type ParsedBrain } from "@/refinery/render/speaker.mts";
import type { BrainOutput } from "@/refinery/types/brain-output.mts";

/**
 * REGRESSION — check `answer_jargon_leak_zscore_accela`.
 *
 * CLEAN (rules of engagement, rule 5) forbids internal jargon and vendor/system product
 * names in an answer. Two leak classes were found live:
 *
 *   - z-score / sigma / standard deviations — fixed structurally in grounding.ts
 *     (`STATS_JARGON_RE`). Chat-only ON PURPOSE: a z-score is real, wanted vocabulary on
 *     `/r/*` and in the tier-3 audit. Guarded below so the fixed half stays fixed.
 *
 *   - "Accela" — the permit-software vendor. It was banned ONLY in a prompt
 *     (conversation-path.ts), while `permits-swfl.mts` mints it into the citations and
 *     caveats the model is simultaneously told to cite faithfully. RULE 1 CITE beats a
 *     "don't say this" instruction every time, so the prompt ban lost. Now scrubbed at the
 *     shared root (`scrubVendorSystems`, speaker.mts).
 *
 * THE POINT OF THIS FILE: assert on the REAL render paths, with the REAL strings the packs
 * emit. A unit test on the regex would pass while a render path leaked — the leak was never
 * that the words are unscrubbable, it was that a whole path skipped the scrub.
 */

// The ACTUAL strings permits-swfl.mts emits (refinery/packs/permits-swfl.mts:521, 539, 664).
// Copied verbatim — if a pack reword makes these stale, the test still guards the shapes.
const REAL_CITATION =
  "Lee County Accela Citizen Access — building permit records, daily scrape via Firecrawl + dlt; corridor assignment via nearest-centroid.";
const REAL_ROLLUP_CITATION =
  "Lee + Collier County Building Permits (SWFL rollup) — Lee: Accela; Collier: colliercountyfl.gov monthly XLSX.";
const REAL_CAVEAT =
  "Most recent Lee permit issued 2026-06-16; daily Accela scrape may be stalled (21 days since last issue).";

const ACCELA = /accela/i;

function permitsOutput(): BrainOutput {
  return {
    brain_id: "permits-swfl",
    version: 1,
    refined_at: "2026-06-20T00:00:00Z",
    direction: "bullish",
    magnitude: 0.5,
    confidence: 0.8,
    confidence_dispersion: 0.1,
    joint_integrity: 0.9,
    chain_depth: 1,
    trust_tier: 2,
    upstream_count: 0,
    drivers: [],
    overrides: [],
    // Vendor name in the CONCLUSION (prose) …
    conclusion: "Permit volume is rising; the Lee County Accela feed shows 1,204 issued permits.",
    key_metrics: [
      {
        metric: "permits_issued",
        value: 1204,
        direction: "rising",
        label: "Permits issued",
        variable_type: "extensive",
        units: "count",
        // … in a metric CITATION (the collapsed-source path) …
        source: {
          url: "https://aca-prod.accela.com/LEECOUNTY/",
          fetched_at: "2026-06-20T00:00:00Z",
          tier: 2,
          citation: REAL_CITATION,
        },
      },
    ],
    detail_tables: [
      {
        id: "permits_by_zip",
        // … in a detail-table TITLE and a categorical CELL — the fields renderDetailTables
        // passes through RAW (no per-field scrub touches them; only the block-level pass
        // in renderBlock does, which is exactly why the vendor scrub must run there too).
        title: "Lee permits by ZIP — Accela feed",
        grain: "zip",
        columns: [
          { id: "issued", label: "Issued", display_format: "number" },
          { id: "feed", label: "Feed" },
        ],
        rows: [{ key: "33913", label: "Gateway", cells: { issued: 88, feed: "Accela" } }],
        source: {
          url: "https://aca-prod.accela.com/LEECOUNTY/",
          fetched_at: "2026-06-20T00:00:00Z",
          tier: 2,
          citation: REAL_ROLLUP_CITATION,
        },
      },
    ],
    // … and in a CAVEAT.
    caveats: [REAL_CAVEAT],
    contradicts: [],
    conditional_claims: [],
    grain_boundary: {
      not_available: ["Per-parcel permit valuations are not in the Accela extract."],
      finest_grain: "zip-month",
      routes: [],
    },
    relevance: {
      decay_curve: "weeks",
      half_life_hours: 720,
      computed_at: "2026-06-20T00:00:00Z",
    },
    exogenous_signals: [],
  } as unknown as BrainOutput;
}

function permitsDossier(): Dossier {
  return buildDossier(permitsOutput(), "SWFL-7421-v1-20260620");
}

function parsedPermits(): ParsedBrain {
  return {
    brain_id: "permits-swfl",
    version: 1,
    freshness_token: "SWFL-7421-v1-20260620",
    scope: "SWFL building permits — Lee + Collier",
    refined_at: "2026-06-20T00:00:00Z",
    output: permitsOutput(),
    raw_md: "<tier-3 raw dump is a deliberate audit carve-out; not exercised here>",
  };
}

describe("Accela cannot reach an answer (answer_jargon_leak_zscore_accela)", () => {
  // PATH 1 — the live chat / highlighter / conversation grounding. conversation-path.ts,
  // report-grounding.ts and fetch-reach.ts ALL render through renderBlock, so this one
  // assertion covers every chat surface. The model cannot speak a name it never saw.
  test("PATH 1 — chat grounding (renderBlock): no vendor name in the model's context", () => {
    const block: GroundingBlock = { label: "SWFL permits", dossier: permitsDossier() };
    const rendered = renderBlock(block);

    expect(rendered).not.toMatch(ACCELA);
    // The scrub must not silently EAT the content — the citation still names a real source.
    expect(rendered).toMatch(/permit portal|permit system|permit records/i);
    expect(rendered).toContain("1,204"); // the number survives the scrub
  });

  test("PATH 1 — the whole assembled system prompt carries no vendor name", () => {
    const ctx = buildGroundingContext({
      rules: "RULES",
      gazetteer: "GEO",
      blocks: [{ label: "SWFL permits", dossier: permitsDossier() }],
    });
    expect(ctx).not.toMatch(ACCELA);
  });

  // PATH 2 — the deterministic speaker: `/api/b/[slug]?view=speak` text AND the MCP tool's
  // text content block both come from speak(). grounding.ts is NOT the only path; a fix
  // landed only there would leave this one leaking.
  test("PATH 2 — speak() tier 1 + tier 2 (/api/b text, MCP text block)", () => {
    const brain = parsedPermits();
    for (const tier of [1, 2] as const) {
      const text = speak(brain, { tier });
      expect(text).not.toMatch(ACCELA);
    }
    // Tier 2 renders the caveat + metrics table — prove the caveat kept its meaning.
    const tier2 = speak(brain, { tier: 2 });
    expect(tier2).toMatch(/scrape may be stalled/i);
  });

  // PATH 3 — the raw `_meta.dossier`. THE path a grounding-only fix misses: MCP
  // (app/api/mcp/server.ts) and `/api/b/[slug]?view=speak&format=json` ship this JSON
  // straight to a consuming Claude, and the MCP RESPONSE_CONTRACT explicitly instructs it
  // to read `dossier.detail_tables` and "quote its real numbers with the source".
  test("PATH 3 — buildDossier (MCP _meta.dossier, /api/b format=json) is scrubbed", () => {
    const d = permitsDossier();

    // Field by field, so a future field added to the dossier can't quietly reopen the hole.
    expect(d.conclusion).not.toMatch(ACCELA);
    expect(d.key_metrics[0].source.citation).not.toMatch(ACCELA);
    expect(d.caveats.join(" ")).not.toMatch(ACCELA);
    expect(d.detail_tables![0].title).not.toMatch(ACCELA);
    expect(String(d.detail_tables![0].rows[0].cells.feed)).not.toMatch(ACCELA);
    expect(d.detail_tables![0].source.citation).not.toMatch(ACCELA);
    expect(d.grain_boundary!.not_available.join(" ")).not.toMatch(ACCELA);

    // Every PROSE field in the payload — the belt to the field-by-field assertions above.
    // `source.url` is excluded on purpose; see the carve-out test directly below.
    const prose = JSON.stringify({
      ...d,
      key_metrics: d.key_metrics,
      detail_tables: d.detail_tables,
    }).replace(/"url":"[^"]*"/g, '"url":""');
    expect(prose).not.toMatch(ACCELA);

    // Non-mutating: the caller's BrainOutput is untouched (speak() + the tier-3 audit
    // still read it raw). A mutating scrub here would silently rewrite the audit trail.
    const raw = permitsOutput();
    buildDossier(raw, "t");
    expect(raw.conclusion).toMatch(ACCELA);
  });

  // The scrub must be a TOTAL function. buildDossier was a pure passthrough and could never
  // throw; `resolveReportGrounding` + the MCP route depend on that ("#11 — never throws": a
  // bad brain degrades to master, it does not 500). Caught for real — the first cut did
  // `output.contradicts.map(...)` and crashed on a partial output, which silently degraded
  // 13 grounding tests to ZERO blocks. A scrub that can kill an answer is worse than a leak.
  test("buildDossier never throws on a partial/degraded output (#11)", () => {
    // The EXACT shape lib/highlighter/report-grounding.test.ts's brain mock passes — i.e.
    // what a degraded artifact really looks like on this path. (Scope note: `refined_at` is
    // NOT optional here — `computeMetricChart`, already inside buildDossier, does
    // `output.refined_at.slice(...)` and throws without it. That brittleness pre-dates this
    // change and is left alone; it is reported, not silently widened.)
    const partial = {
      conclusion: "Permits from the Accela feed are rising.",
      direction: "bullish",
      magnitude: 0.42,
      confidence: 0.71,
      refined_at: "2026-06-12",
      key_metrics: [],
      detail_tables: [],
      caveats: [],
      // no `contradicts`, no `conditional_claims`, no `grain_boundary` — as real mocks and
      // degraded artifacts actually arrive. The first cut of the scrub crashed on exactly this.
    } as unknown as BrainOutput;

    expect(() => buildDossier(partial, "SWFL-7421-v1-20260620")).not.toThrow();
    expect(buildDossier(partial, "t").conclusion).not.toMatch(ACCELA);
    // Absent fields pass through untouched — undefined stays undefined, exactly as before.
    expect(buildDossier(partial, "t").contradicts).toBeUndefined();
  });

  // DELIBERATE CARVE-OUT, pinned so nobody "fixes" it by accident.
  //
  // `source.url` is the provenance RECEIPT — the live Lee County permit portal really is
  // hosted at aca-prod.accela.com/LEECOUNTY. Rewriting it to hide the vendor would forge a
  // citation: rule 1 (CITE — every number names a REAL source) and the four-lane moat both
  // outrank the cosmetic win, and a scrubbed URL is a dead or lying link. The established
  // contract is the same one the MCP RESPONSE_CONTRACT already states for internal slugs in
  // `/r/<slug>` URLs: LINK the URL, never SPEAK it as a word in prose. So the vendor name
  // survives in the href and nowhere a sentence can pick it up.
  test("CARVE-OUT — the provenance source URL is preserved, not forged", () => {
    const d = permitsDossier();
    expect(d.key_metrics[0].source.url).toBe("https://aca-prod.accela.com/LEECOUNTY/");
    // …but the human-readable citation that rides WITH it is clean.
    expect(d.key_metrics[0].source.citation).not.toMatch(ACCELA);
  });

  // PATH 4 — the ONE citation authority (report page detail block + ZIP dossier `Source:`).
  test("PATH 4 — cleanCitationForDisplay (report page, ZIP dossier)", () => {
    expect(cleanCitationForDisplay(REAL_CITATION)).not.toMatch(ACCELA);
    expect(cleanCitationForDisplay(REAL_ROLLUP_CITATION)).not.toMatch(ACCELA);
  });

  // The replacement has to read as ENGLISH in a sentence a customer sees — not a
  // placeholder, and not a "County county" doubling. These are the real corpus forms.
  test("the replacement reads as natural English in every real corpus form", () => {
    expect(cleanCitationForDisplay(REAL_CITATION)).toContain("Lee County permit portal");
    expect(cleanCitationForDisplay("Lee County Accela + Collier County Building")).toContain(
      "Lee County permit system",
    );
    expect(cleanCitationForDisplay(REAL_CAVEAT)).toMatch(/daily permit system scrape/i);
    // No article-doubling, no stranded product name, no empty placeholder.
    const all = [REAL_CITATION, REAL_ROLLUP_CITATION, REAL_CAVEAT].map(cleanCitationForDisplay);
    for (const s of all) {
      expect(s).not.toMatch(/County county|the the|\[\w+\]\s*Citizen/i);
      expect(s).not.toMatch(/Citizen Access/i); // the product name never survives alone
      expect(s.trim().length).toBeGreaterThan(10);
    }
  });
});

describe("stats jargon stays fixed (the other half of the check)", () => {
  test("z-score / sigma / standard deviations never reach the chat model", () => {
    const out = permitsOutput();
    out.conclusion = "Permit volume is 2.4 standard deviations above trend.";
    out.key_metrics[0].label = "Permit z-score";
    out.caveats = ["A 3-sigma move; the z-score is computed on a 24-month window."];

    const rendered = renderBlock({
      label: "SWFL permits",
      dossier: buildDossier(out, "SWFL-7421-v1-20260620"),
    });

    expect(rendered).not.toMatch(/z-?score/i);
    expect(rendered).not.toMatch(/\bsigma\b/i);
    expect(rendered).not.toMatch(/standard deviations?/i);
    expect(rendered).toMatch(/index reading/i);
  });
});
