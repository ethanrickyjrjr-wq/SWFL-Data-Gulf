import { test } from "bun:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { cityPulseSwfl } = await import("./city-pulse-swfl.mts");

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
  cityPulseSwfl.corpusSummary([frag()]);
  const out = cityPulseSwfl.outputProducer({} as never);

  assert.ok(out.key_metrics.length >= 1, "expected at least 1 key_metric");

  for (const m of out.key_metrics) {
    assert.ok(
      typeof m.source === "object" && m.source !== null,
      "metric.source is missing",
    );
    assert.ok(m.source.url.length > 0, "metric missing source url");
    assert.ok(m.source.citation.length > 0, "metric missing citation");
  }

  // The Amazon signal's receipt must point at its real source URL.
  assert.ok(
    out.key_metrics.some(
      (m) => m.source.url === "https://gulfshorebusiness.com/a",
    ),
    "expected a metric sourced from https://gulfshorebusiness.com/a",
  );
});

// ── Test 3: empty data → valid neutral output, no throw ───────────────────────

test("city-pulse-swfl: empty data yields a valid neutral output, no throw", () => {
  cityPulseSwfl.corpusSummary([]);
  const out = cityPulseSwfl.outputProducer({} as never);

  assert.equal(out.key_metrics.length, 0);
  assert.equal(out.direction, "neutral");
  assert.ok(out.caveats.length >= 1, "expected at least 1 caveat");
});
