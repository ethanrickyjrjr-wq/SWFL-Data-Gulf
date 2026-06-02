import { test } from "bun:test";
import assert from "node:assert/strict";

const { normalizeRow } = await import("./corridor-pulse-source.mts");

// The corridor rename lands at the canonical display layer (corridor-display.mts
// displayNameFor), applied in normalizeRow — durable across weekly re-ingest, and
// keyed on the FULL collapsed name, never a substring. These tests pin the two
// traps the operator flagged:
//   1. "Estero Blvd Fort Myers Beach" (the FMB barrier-island beach road) renders
//      as the plain place "Fort Myers Beach".
//   2. Exact-token only: the inland Village-of-Estero corridor and the mainland
//      "Fort Myers" corridors must NEVER fold into Fort Myers Beach (they are
//      distinct submarkets; a substring match would silently merge them).

test("normalizeRow: Estero Blvd Fort Myers Beach → Fort Myers Beach", () => {
  const n = normalizeRow({ corridor: "Estero Blvd Fort Myers Beach" });
  assert.equal(n.corridor, "Fort Myers Beach");
});

test("normalizeRow: inland Estero corridor never folds into Fort Myers Beach", () => {
  // The Three Oaks / Coconut Rd corridor at the Estero–Bonita boundary is inland
  // Lee County, ~12 mi north of the beach — must keep its own identity.
  const n = normalizeRow({
    corridor: "three-oaks-pkwy-coconut-rd-estero-bonita-boundary",
  });
  assert.notEqual(n.corridor, "Fort Myers Beach");
});

test("normalizeRow: mainland Fort Myers corridors never fold into Fort Myers Beach", () => {
  for (const c of ["Cleveland Ave Fort Myers", "Summerlin Rd Fort Myers"]) {
    const n = normalizeRow({ corridor: c });
    assert.notEqual(n.corridor, "Fort Myers Beach");
  }
});

test("normalizeRow: unmapped corridor degrades to its own name, never blank", () => {
  const n = normalizeRow({ corridor: "Immokalee Rd North Naples" });
  assert.ok(n.corridor.length > 0);
  assert.notEqual(n.corridor, "Fort Myers Beach");
});
