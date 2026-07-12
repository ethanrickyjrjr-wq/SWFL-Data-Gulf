import { test } from "bun:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { newsSwfl, coreCountyForMentions } = await import("./news-swfl.mts");

import type { RawFragment } from "../types/fragment.mts";
import type { DbprPressReleaseNormalized } from "../sources/dbpr-press-releases-source.mts";
import type { DbprPublicNoticeNormalized } from "../sources/dbpr-public-notices-source.mts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

let _seq = 0;

function pressFrag(over: Partial<DbprPressReleaseNormalized> = {}): RawFragment {
  _seq += 1;
  return {
    fragment_id: `dbpr_press_releases:test:${_seq}`,
    source_id: "dbpr_press_releases",
    source_trust_tier: 2,
    fetched_at: "2026-07-01T00:00:00Z",
    raw: {},
    normalized: {
      kind: "dbpr-press-release",
      source_url: `https://www2.myfloridalicense.com/press-releases/test-${_seq}`,
      title: `Test release ${_seq}`,
      published_date: daysAgo(30),
      summary: null,
      topics: [],
      affected_industries: [],
      geographic_mentions: [],
      is_swfl_relevant: false,
      scraped_at: null,
      ...over,
    } as unknown,
  } as RawFragment;
}

function noticeFrag(over: Partial<DbprPublicNoticeNormalized> = {}): RawFragment {
  _seq += 1;
  return {
    fragment_id: `dbpr_public_notices:test:${_seq}`,
    source_id: "dbpr_public_notices",
    source_trust_tier: 2,
    fetched_at: "2026-07-01T00:00:00Z",
    raw: {},
    normalized: {
      kind: "dbpr-public-notice",
      pdf_url: `https://www2.myfloridalicense.com/public-notices/test-${_seq}.pdf`,
      respondent_name: null,
      county: "Lee",
      case_number: null,
      violation_type: "unlicensed_activity",
      industry: "construction",
      pdf_summary: null,
      response_deadline: daysAgo(30),
      last_seen_at: null,
      scraped_at: null,
      ...over,
    } as unknown,
  } as RawFragment;
}

function metricValue(out: { key_metrics: { metric: string; value: unknown }[] }, name: string) {
  return out.key_metrics.find((m) => m.metric === name)?.value;
}

// ── Test 1: deterministic flags ───────────────────────────────────────────────

test("news-swfl: deterministic flags", () => {
  assert.equal(newsSwfl.skipSynthesisAgent, true);
  assert.equal(newsSwfl.skipTriageAgent, true);
  assert.equal(newsSwfl.input_brains.length, 0);
});

// ── Test 2: core-county mention matcher ───────────────────────────────────────

test("news-swfl: coreCountyForMentions resolves county AND place names, core-only", () => {
  assert.equal(coreCountyForMentions(["Lee County"]), "Lee");
  assert.equal(coreCountyForMentions(["Collier County"]), "Collier");
  // City-only mentions must resolve — the ingest flag counted these too, and
  // DBPR releases usually name the city, never the county.
  assert.equal(coreCountyForMentions(["Fort Myers"]), "Lee");
  assert.equal(coreCountyForMentions(["Naples"]), "Collier");
  // Non-core SWFL counties resolve to null (Lee + Collier core scope):
  assert.equal(coreCountyForMentions(["Charlotte County"]), null);
  assert.equal(coreCountyForMentions(["Sarasota County", "Punta Gorda"]), null);
  // Word-boundary guards — substrings must not fire:
  assert.equal(coreCountyForMentions(["Leesburg"]), null);
  assert.equal(coreCountyForMentions(["International Drive"]), null);
  // A statewide sweep that names a core county alongside others still counts:
  assert.equal(coreCountyForMentions(["Orange County", "Lee County", "Duval County"]), "Lee");
  assert.equal(coreCountyForMentions([]), null);
});

// ── Test 3: press relevance recomputed from mentions, not the ingest flag ─────

test("news-swfl: 5-county ingest flag is ignored — only Lee/Collier mentions count", () => {
  const fragments = [
    // Ingest flagged relevant (old 5-county rule) but mentions only non-core:
    pressFrag({
      is_swfl_relevant: true,
      geographic_mentions: ["Charlotte County", "Sarasota County"],
      published_date: daysAgo(20),
    }),
    // City-only core mention — must count even though the county is never named:
    pressFrag({
      is_swfl_relevant: true,
      geographic_mentions: ["Fort Myers"],
      published_date: daysAgo(25),
    }),
    // Statewide, no mentions — excluded from relevant, included in total:
    pressFrag({
      is_swfl_relevant: false,
      geographic_mentions: [],
      published_date: daysAgo(15),
    }),
    // Prior-window core release (drives momentum baseline):
    pressFrag({
      is_swfl_relevant: true,
      geographic_mentions: ["Collier County"],
      published_date: daysAgo(120),
    }),
  ];

  newsSwfl.corpusSummary!(fragments);
  const out = newsSwfl.outputProducer!({} as never);

  assert.equal(
    metricValue(out, "dbpr_swfl_releases_90d"),
    1,
    "only the Fort Myers release is core-relevant; the Charlotte/Sarasota one must not count",
  );
  assert.equal(metricValue(out, "dbpr_swfl_releases_prior_90d"), 1);
  assert.equal(
    metricValue(out, "dbpr_total_releases_90d"),
    3,
    "statewide total keeps every release in the window",
  );
});

// ── Test 4: notices from non-core counties are dropped from every count ───────

test("news-swfl: non-core county notices (Charlotte/Sarasota/Manatee/Monroe) are excluded", () => {
  const fragments = [
    noticeFrag({ county: "Lee", industry: "construction" }),
    noticeFrag({ county: "Collier", industry: "hospitality", violation_type: "disciplinary" }),
    // Out of core scope — present in the scrape, must not count anywhere:
    noticeFrag({ county: "Charlotte", industry: "construction" }),
    noticeFrag({ county: "Sarasota", industry: "construction" }),
    noticeFrag({ county: "Manatee", industry: "hospitality" }),
    noticeFrag({ county: "Monroe", industry: "construction" }),
  ];

  newsSwfl.corpusSummary!(fragments);
  const out = newsSwfl.outputProducer!({} as never);

  assert.equal(
    metricValue(out, "dbpr_notices_construction_90d"),
    1,
    "only the Lee construction notice counts; Charlotte/Sarasota/Monroe dropped",
  );
  assert.equal(
    metricValue(out, "dbpr_notices_abt_90d"),
    1,
    "only the Collier hospitality notice counts; Manatee dropped",
  );
  assert.equal(metricValue(out, "dbpr_notices_lee_90d"), 1);
  assert.equal(metricValue(out, "dbpr_notices_collier_90d"), 1);
  // The conclusion's notice count is the core-filtered one:
  assert.ok(
    out.conclusion.includes("2 individual enforcement notices"),
    `conclusion should count 2 core notices; got: ${out.conclusion}`,
  );
});

// ── Test 5: empty data → valid neutral output, no throw ───────────────────────

test("news-swfl: empty data yields a valid neutral output", () => {
  newsSwfl.corpusSummary!([]);
  const out = newsSwfl.outputProducer!({} as never);

  assert.equal(out.key_metrics.length, 0);
  assert.equal(out.direction, "neutral");
  assert.ok(out.caveats.length >= 1);
});
