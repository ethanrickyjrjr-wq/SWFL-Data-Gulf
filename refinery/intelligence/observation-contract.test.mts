import { afterEach, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  loadObservationManifest,
  type ObservationV1,
  validateObservationSet,
} from "./observation-contract.mts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function observation(overrides: Partial<ObservationV1> = {}): ObservationV1 {
  return {
    schema_version: 1,
    source_id: "rsw_monthly",
    metric_id: "total_passenger_movements_monthly",
    definition_version: "1",
    geo_type: "airport",
    geo_id: "RSW",
    period_start: "2025-01-01",
    period_end: "2025-01-31",
    frequency: "monthly",
    value: 10,
    unit: "passenger_movements",
    status: "observed",
    value_basis: "reported",
    published_at: "2025-02-20T15:00:00.000Z",
    first_seen_at: "2025-02-20T16:00:00.000Z",
    retrieved_at: "2025-02-20T16:05:00.000Z",
    available_at: "2025-02-20T15:00:00.000Z",
    availability_basis: "publisher_release",
    source_url: "https://www.flylcpa.com/example.pdf",
    source_sha256: "a".repeat(64),
    vintage_id: "2025-02-release",
    quality_flags: [],
    ...overrides,
  };
}

test("observation v1 preserves an observed zero and requires null for suppressed values", () => {
  const zero = observation({ value: 0 });
  const suppressed = observation({
    period_start: "2025-02-01",
    period_end: "2025-02-28",
    value: null,
    status: "suppressed",
    published_at: "2025-03-20T15:00:00.000Z",
    first_seen_at: "2025-03-20T16:00:00.000Z",
    retrieved_at: "2025-03-20T16:05:00.000Z",
    available_at: "2025-03-20T15:00:00.000Z",
  });

  const validated = validateObservationSet([zero, suppressed], {
    rawFiles: [{ source_id: "rsw_monthly", sha256: "a".repeat(64) }],
  });
  assert.equal(validated[0].value, 0);
  assert.equal(validated[1].value, null);
  assert.throws(
    () =>
      validateObservationSet([suppressed, { ...suppressed, value: 0, vintage_id: "v2" }], {
        rawFiles: [{ source_id: "rsw_monthly", sha256: "a".repeat(64) }],
      }),
    /must have null value/,
  );
});

test("observation v1 rejects nonfinite values, impossible periods, and mismatched units", () => {
  const rawFiles = [{ source_id: "rsw_monthly", sha256: "a".repeat(64) }];
  assert.throws(
    () => validateObservationSet([observation({ value: Number.POSITIVE_INFINITY })], { rawFiles }),
    /finite number or null/,
  );
  assert.throws(
    () =>
      validateObservationSet(
        [observation({ period_start: "2025-02-01", period_end: "2025-02-30" })],
        { rawFiles },
      ),
    /valid ISO calendar date/,
  );
  assert.throws(
    () =>
      validateObservationSet(
        [
          observation(),
          observation({
            period_start: "2025-02-01",
            period_end: "2025-02-28",
            unit: "passengers",
            published_at: "2025-03-20T15:00:00.000Z",
            first_seen_at: "2025-03-20T16:00:00.000Z",
            retrieved_at: "2025-03-20T16:05:00.000Z",
            available_at: "2025-03-20T15:00:00.000Z",
          }),
        ],
        { rawFiles },
      ),
    /unit mismatch/,
  );
});

test("observation identity rejects a duplicate release but preserves a changed vintage", () => {
  const rawFiles = [
    { source_id: "rsw_monthly", sha256: "a".repeat(64) },
    { source_id: "rsw_monthly", sha256: "b".repeat(64) },
  ];
  const first = observation();
  assert.throws(
    () => validateObservationSet([first, { ...first }], { rawFiles }),
    /duplicate observation identity/,
  );
  const revisions = validateObservationSet(
    [
      first,
      observation({
        value: 11,
        source_sha256: "b".repeat(64),
        vintage_id: "2025-03-revision",
        published_at: "2025-03-20T15:00:00.000Z",
        first_seen_at: "2025-03-20T16:00:00.000Z",
        retrieved_at: "2025-03-20T16:05:00.000Z",
        available_at: "2025-03-20T15:00:00.000Z",
      }),
    ],
    { rawFiles },
  );
  assert.equal(revisions.length, 2);
});

test("observation v1 rejects broken raw references and invented availability timestamps", () => {
  assert.throws(
    () => validateObservationSet([observation()], { rawFiles: [] }),
    /does not reference a retained raw file/,
  );
  assert.throws(
    () =>
      validateObservationSet([observation({ available_at: "2025-02-19T15:00:00.000Z" })], {
        rawFiles: [{ source_id: "rsw_monthly", sha256: "a".repeat(64) }],
      }),
    /must equal published_at/,
  );
  assert.throws(
    () =>
      validateObservationSet(
        [observation({ availability_basis: "unknown", available_at: "2025-02-20T15:00:00.000Z" })],
        { rawFiles: [{ source_id: "rsw_monthly", sha256: "a".repeat(64) }] },
      ),
    /must be null when availability_basis is unknown/,
  );
  assert.throws(
    () =>
      validateObservationSet(
        [
          observation({
            published_at: "2025-01-20T15:00:00.000Z",
            available_at: "2025-01-20T15:00:00.000Z",
          }),
        ],
        { rawFiles: [{ source_id: "rsw_monthly", sha256: "a".repeat(64) }] },
      ),
    /cannot precede measurement period_end/,
  );
});

test("manifest loader rejects an invalid observation-file hash", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "observation-contract-"));
  temporaryDirectories.push(directory);
  const rawDirectory = path.join(directory, "raw");
  const exportDirectory = path.join(directory, "exports");
  mkdirSync(rawDirectory, { recursive: true });
  mkdirSync(exportDirectory, { recursive: true });
  const rawBytes = "retained source bytes";
  writeFileSync(path.join(rawDirectory, "rsw.pdf"), rawBytes);
  const row = observation({ source_sha256: sha256(rawBytes) });
  const jsonl = `${JSON.stringify(row)}\n`;
  writeFileSync(path.join(exportDirectory, "rsw.jsonl"), jsonl);
  const manifest = {
    schema_version: 1,
    run_id: "fixture-run",
    source_ids: ["rsw_monthly"],
    requested_period: { from: "2025-01", through: "2025-01" },
    source_coverage: [
      {
        source_id: "rsw_monthly",
        frequency: "monthly",
        expected_period: { from: "2025-01", through: "2025-01" },
        observed_period: { from: "2025-01", through: "2025-01" },
        expected_count: 1,
        present_count: 1,
        missing_count: 0,
        discovery_failures: [],
        parse_failures: [],
      },
    ],
    raw_files: [
      {
        relative_path: "raw/rsw.pdf",
        sha256: sha256(rawBytes),
        byte_size: Buffer.byteLength(rawBytes),
        source_id: "rsw_monthly",
      },
    ],
    observation_files: [
      {
        relative_path: "exports/rsw.jsonl",
        sha256: "f".repeat(64),
        row_count: 1,
        source_id: "rsw_monthly",
      },
    ],
  };
  const manifestPath = path.join(directory, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));

  await assert.rejects(() => loadObservationManifest(manifestPath), /SHA-256 mismatch/);
});
