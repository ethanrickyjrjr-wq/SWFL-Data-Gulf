// scripts/email/__tests__/fetch-digest-data.test.mts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { parseBrainOutputSection, extractZipMetrics } from "../fetch-digest-data.mts";

describe("parseBrainOutputSection", () => {
  test("extracts JSON from --- OUTPUT --- section", () => {
    const md = `---\nbrain_id: housing-swfl\n---\nNarrative.\n--- OUTPUT ---\n{"key_metrics":[],"detail_tables":[]}`;
    assert.deepEqual(parseBrainOutputSection(md), { key_metrics: [], detail_tables: [] });
  });

  test("returns null when no OUTPUT section", () => {
    assert.equal(parseBrainOutputSection("no output here"), null);
  });

  test("returns null on malformed JSON", () => {
    assert.equal(parseBrainOutputSection("--- OUTPUT ---\nnot json"), null);
  });
});

describe("extractZipMetrics", () => {
  test("maps housing row fields to ZipMetricSnapshot", () => {
    const row = {
      median_sale_price: 412000,
      median_dom: 52,
      months_of_supply: 4.1,
      avg_sale_to_list: 0.97,
      sold_above_list: 0.18,
      inventory: 143,
      homes_sold: 22,
    };
    const result = extractZipMetrics(row);
    assert.equal(result.median_sale_price, 412000);
    assert.equal(result.dom, 52);
    assert.equal(result.months_of_supply, 4.1);
    assert.equal(result.avg_sale_to_list, 0.97);
    assert.equal(result.sold_above_list_pct, 0.18);
    assert.equal(result.inventory, 143);
    assert.equal(result.sale_count_period, 22);
  });

  test("returns all-null for empty row", () => {
    const result = extractZipMetrics({});
    assert.equal(result.median_sale_price, null);
    assert.equal(result.dom, null);
    assert.equal(result.sale_count_period, null);
  });
});
