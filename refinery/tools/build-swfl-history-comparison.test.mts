import { afterEach, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ObservationV1 } from "../intelligence/observation-contract.mts";
import {
  buildHistoryComparison,
  writeHistoryComparison,
} from "./build-swfl-history-comparison.mts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixtureObservation(
  sourceId: "rsw_lcpa_monthly" | "census_bps_county",
  geoType: "airport" | "county_fips",
  geoId: string,
  period: "2024-01" | "2025-01",
  value: number,
  sourceHash: string,
): ObservationV1 {
  const end = period.endsWith("01") ? `${period}-31` : `${period}-28`;
  return {
    schema_version: 1,
    source_id: sourceId,
    metric_id:
      sourceId === "rsw_lcpa_monthly" ? "total_passengers" : "residential_units_authorized_monthly",
    definition_version: "1",
    geo_type: geoType,
    geo_id: geoId,
    period_start: `${period}-01`,
    period_end: end,
    frequency: "monthly",
    value,
    unit: sourceId === "rsw_monthly" ? "passenger_movements" : "housing_units_authorized",
    status: "observed",
    value_basis: "reported",
    published_at: `${Number(period.slice(0, 4))}-02-20T15:00:00.000Z`,
    first_seen_at: `${Number(period.slice(0, 4))}-02-20T16:00:00.000Z`,
    retrieved_at: `${Number(period.slice(0, 4))}-02-20T16:05:00.000Z`,
    available_at: `${Number(period.slice(0, 4))}-02-20T15:00:00.000Z`,
    availability_basis: "publisher_release",
    source_url:
      sourceId === "rsw_lcpa_monthly"
        ? "https://www.flylcpa.com/example.pdf"
        : "https://www2.census.gov/econ/bps/County/example.txt",
    source_sha256: sourceHash,
    vintage_id: `${sourceId}-${period}`,
    quality_flags: [],
  };
}

function writeFixtureManifest(): string {
  const root = mkdtempSync(path.join(tmpdir(), "history-comparison-"));
  temporaryDirectories.push(root);
  mkdirSync(path.join(root, "raw"), { recursive: true });
  mkdirSync(path.join(root, "exports"), { recursive: true });

  const rawFiles = [
    {
      source_id: "rsw_lcpa_monthly",
      relative_path: "raw/rsw.pdf",
      bytes: "rsw-public-release",
    },
    {
      source_id: "census_bps_county",
      relative_path: "raw/bps.txt",
      bytes: "bps-public-release",
    },
  ].map((item) => ({ ...item, sha256: sha256(item.bytes) }));
  for (const item of rawFiles) {
    writeFileSync(path.join(root, item.relative_path), item.bytes);
  }

  const observations = [
    fixtureObservation("rsw_lcpa_monthly", "airport", "RSW", "2024-01", 100, rawFiles[0].sha256),
    fixtureObservation("rsw_lcpa_monthly", "airport", "RSW", "2025-01", 120, rawFiles[0].sha256),
    fixtureObservation(
      "census_bps_county",
      "county_fips",
      "12071",
      "2024-01",
      10,
      rawFiles[1].sha256,
    ),
    fixtureObservation(
      "census_bps_county",
      "county_fips",
      "12071",
      "2025-01",
      15,
      rawFiles[1].sha256,
    ),
  ];
  const jsonl = `${observations.map((item) => JSON.stringify(item)).join("\n")}\n`;
  writeFileSync(path.join(root, "exports/observations.jsonl"), jsonl);

  const manifest = {
    schema_version: 1,
    run_id: "TEST-ONLY-history-fixture",
    source_ids: ["census_bps_county", "rsw_lcpa_monthly"],
    requested_period: { from: "2024-01", through: "2025-01" },
    source_coverage: [
      {
        source_id: "rsw_lcpa_monthly",
        frequency: "monthly",
        expected_period: { from: "2024-01", through: "2025-01" },
        observed_period: { from: "2024-01", through: "2025-01" },
        expected_count: 13,
        present_count: 2,
        missing_count: 11,
        discovery_failures: [],
        parse_failures: [],
      },
      {
        source_id: "census_bps_county",
        frequency: "monthly",
        expected_period: { from: "2024-01", through: "2025-01" },
        observed_period: { from: "2024-01", through: "2025-01" },
        expected_count: 26,
        present_count: 4,
        missing_count: 22,
        discovery_failures: ["TEST-ONLY omitted fixture months"],
        parse_failures: [],
      },
    ],
    raw_files: rawFiles.map((item) => ({
      source_id: item.source_id,
      relative_path: item.relative_path,
      sha256: item.sha256,
      byte_size: Buffer.byteLength(item.bytes),
    })),
    observation_files: [
      {
        source_id: "combined",
        relative_path: "exports/observations.jsonl",
        sha256: sha256(jsonl),
        row_count: observations.length,
      },
    ],
  };
  const manifestPath = path.join(root, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

test("identical input produces an identical analytical payload and hash", async () => {
  const manifestPath = writeFixtureManifest();
  const first = await buildHistoryComparison(manifestPath, {
    from: "2025-01",
    through: "2025-01",
  });
  const second = await buildHistoryComparison(manifestPath, {
    from: "2025-01",
    through: "2025-01",
  });
  assert.deepEqual(first, second);
  assert.equal(first.analytical_sha256, second.analytical_sha256);
  assert.equal(first.period_assessments[0].classification, "agreement");
  assert.equal(first.coverage_matrix.length, 2);
});

test("writer keeps invocation time outside deterministic JSON and Markdown", async () => {
  const manifestPath = writeFixtureManifest();
  const root = path.dirname(manifestPath);
  const firstOut = path.join(root, "out-a");
  const secondOut = path.join(root, "out-b");
  await writeHistoryComparison({
    manifestPath,
    from: "2025-01",
    through: "2025-01",
    outDirectory: firstOut,
    invokedAt: "2026-09-18T12:00:00.000Z",
  });
  await writeHistoryComparison({
    manifestPath,
    from: "2025-01",
    through: "2025-01",
    outDirectory: secondOut,
    invokedAt: "2026-09-18T13:00:00.000Z",
  });

  assert.equal(
    readFileSync(path.join(firstOut, "comparison.json"), "utf8"),
    readFileSync(path.join(secondOut, "comparison.json"), "utf8"),
  );
  assert.equal(
    readFileSync(path.join(firstOut, "comparison.md"), "utf8"),
    readFileSync(path.join(secondOut, "comparison.md"), "utf8"),
  );
  assert.notEqual(
    readFileSync(path.join(firstOut, "run-metadata.json"), "utf8"),
    readFileSync(path.join(secondOut, "run-metadata.json"), "utf8"),
  );
});

test("builder exposes sources, revisions, coverage gaps, and release caveats", async () => {
  const manifestPath = writeFixtureManifest();
  const payload = await buildHistoryComparison(manifestPath, {
    from: "2025-01",
    through: "2025-01",
  });
  assert.deepEqual(payload.source_ids, ["census_bps_county", "rsw_lcpa_monthly"]);
  assert.ok(payload.source_links.some((item) => item.url.includes("flylcpa.com")));
  assert.ok(payload.source_links.some((item) => item.url.includes("census.gov")));
  assert.ok(payload.coverage_matrix.some((item) => item.missing_count > 0));
  assert.ok(payload.caveats.some((item) => item.includes("distinct geographies")));
  assert.ok(payload.series_comparisons.every((item) => item.current_vintage_id));
});
