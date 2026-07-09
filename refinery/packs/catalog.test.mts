import { test } from "bun:test";
import assert from "node:assert/strict";

import { BRAIN_CATALOG } from "./catalog.mts";
import { PER_PACK_REGISTRY } from "./index.mts";

test("BRAIN_CATALOG: every catalog id exists in PER_PACK_REGISTRY", () => {
  for (const entry of BRAIN_CATALOG) {
    assert.ok(
      Object.hasOwn(PER_PACK_REGISTRY, entry.id),
      `catalog has "${entry.id}" but PER_PACK_REGISTRY does not — remove from catalog or restore the pack`,
    );
  }
});

// Registered in PER_PACK_REGISTRY but intentionally NOT yet surfaced in the public
// BRAIN_CATALOG — in-flight work not ready to ship a catalog entry. A fake catalog
// entry would be worse than this skip: it would advertise an ungraduated brain.
// Remove an id here the moment its real catalog entry lands.
//   tier-divergence-swfl: NEW 2026-06-14, standalone leaf. Graduate to BRAIN_CATALOG
//   only after the first clean live cycle (probe clean + view-parity oracle passes
//   live). docs/superpowers/specs/2026-06-14-tier-divergence-swfl-design.md
//   (home-values-swfl + investor-zip-swfl graduated 07/09/2026 on operator decision —
//   check home_values_investor_zip_not_in_catalog.)
const KNOWN_INCOMPLETE = new Set(["tier-divergence-swfl"]);

test("BRAIN_CATALOG: every PER_PACK_REGISTRY id exists in catalog", () => {
  const catalogIds = new Set(BRAIN_CATALOG.map((e) => e.id));
  for (const id of Object.keys(PER_PACK_REGISTRY)) {
    if (KNOWN_INCOMPLETE.has(id)) continue;
    assert.ok(
      catalogIds.has(id),
      `PER_PACK_REGISTRY has "${id}" but catalog.mts does not — add an entry to BRAIN_CATALOG`,
    );
  }
});

test("BRAIN_CATALOG: domain/scope/ttl_seconds match the pack definition", () => {
  for (const entry of BRAIN_CATALOG) {
    const pack = PER_PACK_REGISTRY[entry.id];
    assert.equal(
      entry.domain,
      pack.domain,
      `catalog "${entry.id}".domain mismatch: ${entry.domain} vs pack ${pack.domain}`,
    );
    assert.equal(entry.scope, pack.scope, `catalog "${entry.id}".scope drifted from pack scope`);
    assert.equal(
      entry.ttl_seconds,
      pack.ttl_seconds,
      `catalog "${entry.id}".ttl_seconds mismatch: ${entry.ttl_seconds} vs pack ${pack.ttl_seconds}`,
    );
  }
});

test("BRAIN_CATALOG: ids are unique", () => {
  const seen = new Set<string>();
  for (const entry of BRAIN_CATALOG) {
    assert.ok(!seen.has(entry.id), `catalog has duplicate id "${entry.id}"`);
    seen.add(entry.id);
  }
});
