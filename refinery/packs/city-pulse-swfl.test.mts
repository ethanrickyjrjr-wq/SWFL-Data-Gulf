import { test } from "bun:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { cityPulseSwfl } = await import("./city-pulse-swfl.mts");
const { cityPulseSource } = await import("../sources/city-pulse-source.mts");

import type { RawFragment } from "../types/fragment.mts";

// ── Helper: build a minimal RawFragment carrying a CityPulseNormalized ─────────

function frag(over: Record<string, unknown> = {}): RawFragment {
  return {
    fragment_id: "city-pulse:test:1",
    source_id: "city-pulse",
    source_trust_tier: 2,
    fetched_at: "2026-05-30T00:00:00Z",
    raw: {},
    normalized: {
      kind: "city-pulse",
      city: "Naples",
      topic: "transactions",
      fact: "Amazon bought $60M of land",
      source_url: "https://gulfshorebusiness.com/a",
      source_title: "Amazon expands inland",
      cited_text: "Amazon paid $60M",
      captured_at: "2026-05-29T09:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
      ...over,
    } as unknown,
  } as RawFragment;
}

// ── Test 1: deterministic flags ───────────────────────────────────────────────

test("city-pulse-swfl: deterministic flags", () => {
  assert.equal(cityPulseSwfl.skipSynthesisAgent, true);
  assert.equal(cityPulseSwfl.skipTriageAgent, true);
  assert.equal(cityPulseSwfl.input_brains.length, 0);
});

// ── Test 2: each surfaced signal carries a source receipt with its url ────────

test("city-pulse-swfl: each surfaced signal carries a source receipt with its url", () => {
  cityPulseSwfl.corpusSummary!([frag()]);
  const out = cityPulseSwfl.outputProducer!({} as never);

  assert.ok(out.key_metrics.length >= 1, "expected at least 1 key_metric");

  for (const m of out.key_metrics) {
    assert.ok(typeof m.source === "object" && m.source !== null, "metric.source is missing");
    assert.ok(m.source.url.length > 0, "metric missing source url");
    assert.ok(m.source.citation.length > 0, "metric missing citation");
  }

  // The Amazon signal's receipt must point at its real source URL.
  assert.ok(
    out.key_metrics.some((m) => m.source.url === "https://gulfshorebusiness.com/a"),
    "expected a metric sourced from https://gulfshorebusiness.com/a",
  );
});

// ── Test 3: empty data → valid neutral output, no throw ───────────────────────

test("city-pulse-swfl: empty data yields a valid neutral output, no throw", () => {
  cityPulseSwfl.corpusSummary!([]);
  const out = cityPulseSwfl.outputProducer!({} as never);

  assert.equal(out.key_metrics.length, 0);
  assert.equal(out.direction, "neutral");
  assert.ok(out.caveats.length >= 1, "expected at least 1 caveat");
});

// ── Test 4 (M1): cited_text-null → citation falls back to url shape ───────────

test("city-pulse-swfl: cited_text null falls back to url-based citation", () => {
  const fragNoText = frag({
    cited_text: null,
    source_title: null,
    source_url: "https://example.com/fallback",
  });
  cityPulseSwfl.corpusSummary!([fragNoText]);
  const out = cityPulseSwfl.outputProducer!({} as never);

  assert.ok(out.key_metrics.length >= 1, "expected at least 1 key_metric");
  for (const m of out.key_metrics) {
    assert.ok(
      typeof m.source?.citation === "string" && m.source.citation.length > 0,
      "citation must be a non-empty string even when cited_text is null",
    );
    // url-fallback shape must contain the source_url
    assert.ok(
      m.source.citation.includes("https://example.com/fallback"),
      `citation should contain source_url; got: ${m.source.citation}`,
    );
  }
});

// ── Test 5 (M2): fixture source round-trip ─────────────────────────────────────

test("city-pulse-swfl: fixture source round-trip — ≥1 metric, all with non-empty url", async () => {
  const allFragments = await cityPulseSource.fetch();
  assert.ok(allFragments.length >= 1, "fixture must return at least 1 fragment");

  cityPulseSwfl.corpusSummary!(allFragments);
  const out = cityPulseSwfl.outputProducer!({} as never);

  assert.ok(out.key_metrics.length >= 1, "expected at least 1 key_metric from fixture");

  for (const m of out.key_metrics) {
    assert.ok(
      typeof m.source?.url === "string" && m.source.url.length > 0,
      `every key_metric must have a non-empty source.url; metric "${m.metric}" failed`,
    );
  }
});

// ── Test 6 (story_key): superseded fixture row never surfaces (head-only) ─────

test("city-pulse-swfl: superseded fixture row is hidden (supersession)", async () => {
  const allFragments = await cityPulseSource.fetch();

  // Fixture row id 3 (superseded_by: 1) must be filtered at the source, mirroring
  // the live .is("superseded_by", null) query.
  const supersededUrl = "https://gulfshorebusiness.com/amazon-lehigh-rumor";
  assert.ok(
    !allFragments.some((f) => (f.raw as Record<string, unknown>).source_url === supersededUrl),
    "superseded row must not be returned by the source",
  );

  cityPulseSwfl.corpusSummary!(allFragments);
  const out = cityPulseSwfl.outputProducer!({} as never);

  for (const m of out.key_metrics) {
    assert.ok(
      m.source.url !== supersededUrl,
      `superseded row leaked into key_metrics: ${m.metric}`,
    );
    assert.ok(
      !String(m.value).includes("earlier version of the story"),
      `superseded fact text leaked into key_metrics: ${m.metric}`,
    );
  }
});

// ── Test 7 (Phase C): pulse_by_zip detail table — one row per geocoded ZIP ────

test("city-pulse-swfl: emits pulse_by_zip with one row per geocoded ZIP", () => {
  const fragments = [
    frag({
      zip_code: "33901",
      geo_grain: "point",
      location_anchor: "2000 Main St",
      fact: "Newest 33901 fact",
      captured_at: "2026-07-09T12:00:00Z",
      source_url: "https://x.example/new",
    }),
    frag({
      zip_code: "33901",
      geo_grain: "point",
      location_anchor: "2001 Main St",
      fact: "Older 33901 fact",
      captured_at: "2026-07-08T12:00:00Z",
      source_url: "https://x.example/old",
    }),
    frag({ zip_code: null, geo_grain: "city", fact: "City-wide fact" }),
  ];
  cityPulseSwfl.corpusSummary!(fragments);
  const out = cityPulseSwfl.outputProducer!({} as never);

  const table = out.detail_tables?.find((t) => t.id === "pulse_by_zip");
  assert.ok(table, "expected a pulse_by_zip detail table");
  assert.equal(table.grain, "zip");
  // fetchDetailRow matches the FIRST row by exact key — one row per ZIP only.
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].key, "33901");
  assert.equal(table.rows[0].cells.items, 2);
  assert.equal(table.rows[0].cells.latest_fact, "Newest 33901 fact");
  assert.ok(table.source.citation.length > 0, "table needs a source receipt");
});

test("city-pulse-swfl: pulse_by_zip omitted when nothing is geocoded", () => {
  cityPulseSwfl.corpusSummary!([frag({ zip_code: null, geo_grain: "city" })]);
  const out = cityPulseSwfl.outputProducer!({} as never);
  assert.equal(
    out.detail_tables?.find((t) => t.id === "pulse_by_zip"),
    undefined,
  );
});
