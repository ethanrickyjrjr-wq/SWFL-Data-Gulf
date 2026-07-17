// lib/zip-report/registry-coverage.test.ts
//
// Structural invariant: every pack the metric registry (ZIP_METRIC_SOURCES)
// reads MUST be in REGISTRY_PACK_IDS, the one list the assembly root loads.
// A spec whose pack is never loaded fails silently — buildRegistryCandidates
// is empty-tolerant by design, so the citation just never renders anywhere
// (the active-listings-swfl rail-citation hole, check
// active_listings_rail_citations_never_render, shipped exactly this way).
import { expect, test } from "bun:test";
import { REGISTRY_PACK_IDS } from "./assemble";
import { ZIP_METRIC_SOURCES } from "./candidates";

test("every pack the metric registry references is loaded by the assembly root", () => {
  const loaded = new Set<string>(REGISTRY_PACK_IDS);
  const referenced = [...new Set(ZIP_METRIC_SOURCES.map((s) => s.packId))];
  const missing = referenced.filter((id) => !loaded.has(id));
  expect(missing).toEqual([]);
});
