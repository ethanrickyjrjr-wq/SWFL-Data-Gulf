import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export type ObservationFrequency = "daily" | "monthly" | "quarterly" | "annual";
export type ObservationStatus = "observed" | "missing" | "suppressed" | "unavailable";
export type ValueBasis = "reported" | "estimated" | "mixed" | "unknown";
export type AvailabilityBasis = "publisher_release" | "first_seen" | "unknown";

export interface ObservationV1 {
  schema_version: 1;
  source_id: string;
  metric_id: string;
  definition_version: string;
  geo_type: string;
  geo_id: string;
  period_start: string;
  period_end: string;
  frequency: ObservationFrequency;
  value: number | null;
  unit: string;
  status: ObservationStatus;
  value_basis: ValueBasis;
  published_at: string | null;
  first_seen_at: string | null;
  retrieved_at: string | null;
  available_at: string | null;
  availability_basis: AvailabilityBasis;
  source_url: string | null;
  source_sha256: string | null;
  vintage_id: string | null;
  quality_flags: string[];
}

export interface RawFileEntry {
  relative_path?: string;
  sha256: string;
  byte_size?: number;
  source_id: string;
}

export interface ObservationFileEntry {
  relative_path: string;
  sha256: string;
  row_count: number;
  source_id: string;
}

export interface SourceCoverageEntry {
  source_id: string;
  frequency: ObservationFrequency;
  expected_period: { from: string; through: string };
  observed_period: { from: string | null; through: string | null };
  expected_count: number;
  present_count: number;
  missing_count: number;
  discovery_failures: string[];
  parse_failures: string[];
}

export interface GeographyCoverageEntry {
  source_id: string;
  geo_type: string;
  geo_id: string;
  expected_period: { from: string; through: string };
  observed_period: { from: string | null; through: string | null };
  expected_count: number;
  present_count: number;
  missing_count: number;
  missing_ranges: Array<{ from: string; through: string }>;
}

export interface ObservationManifestV1 {
  schema_version: 1;
  run_id: string;
  source_ids: string[];
  requested_period: { from: string; through: string };
  source_coverage: SourceCoverageEntry[];
  geo_coverage: GeographyCoverageEntry[];
  raw_files: Required<RawFileEntry>[];
  observation_files: ObservationFileEntry[];
}

export interface LoadedObservationManifest {
  manifest: ObservationManifestV1;
  observations: ObservationV1[];
  manifest_sha256: string;
  manifest_path: string;
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/;

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    fail(context, "must be an object");
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(context, "must be a non-empty string");
  }
  return value;
}

function requireIdentifier(value: unknown, context: string): string {
  const stringValue = requireString(value, context);
  if (!IDENTIFIER_RE.test(stringValue)) {
    fail(context, `contains unsupported characters: ${JSON.stringify(stringValue)}`);
  }
  return stringValue;
}

function requireInteger(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(context, "must be a non-negative safe integer");
  }
  return Number(value);
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], context: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(context, `must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function requireNullableString(value: unknown, context: string): string | null {
  if (value === null) return null;
  return requireString(value, context);
}

function requireStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) fail(context, "must be an array");
  return value.map((item, index) => requireString(item, `${context}[${index}]`));
}

function requireSha256(value: unknown, context: string): string {
  const hash = requireString(value, context);
  if (!SHA256_RE.test(hash)) fail(context, "must be a lowercase 64-character SHA-256");
  return hash;
}

function parseCalendarDate(value: unknown, context: string): Date {
  const dateString = requireString(value, context);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) fail(context, "must be a valid ISO calendar date (YYYY-MM-DD)");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail(context, "must be a valid ISO calendar date (YYYY-MM-DD)");
  }
  return date;
}

function validateUtcTimestamp(value: string | null, context: string): void {
  if (value === null) return;
  if (!UTC_TIMESTAMP_RE.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(context, "must be a valid UTC timestamp ending in Z or +00:00, or null");
  }
}

function dateIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function expectedPeriodEnd(start: Date, frequency: ObservationFrequency): string {
  if (frequency === "daily") return dateIso(start);
  if (frequency === "monthly") {
    return dateIso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)));
  }
  if (frequency === "quarterly") {
    return dateIso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0)));
  }
  return `${start.getUTCFullYear()}-12-31`;
}

function validatePeriod(
  startString: string,
  endString: string,
  frequency: ObservationFrequency,
  context: string,
): void {
  const start = parseCalendarDate(startString, `${context}.period_start`);
  parseCalendarDate(endString, `${context}.period_end`);
  if (frequency !== "daily" && start.getUTCDate() !== 1) {
    fail(context, `${frequency} period_start must be the first calendar day`);
  }
  if (frequency === "quarterly" && ![0, 3, 6, 9].includes(start.getUTCMonth())) {
    fail(context, "quarterly period_start must begin in January, April, July, or October");
  }
  if (frequency === "annual" && startString.slice(5) !== "01-01") {
    fail(context, "annual period_start must be January 1");
  }
  const expectedEnd = expectedPeriodEnd(start, frequency);
  if (endString !== expectedEnd) {
    fail(context, `${frequency} period_end must be ${expectedEnd}, received ${endString}`);
  }
}

function parseObservation(value: unknown, index: number): ObservationV1 {
  const context = `observation[${index}]`;
  const row = requireRecord(value, context);
  if (row.schema_version !== 1) fail(`${context}.schema_version`, "must equal 1");

  const frequency = requireEnum(
    row.frequency,
    ["daily", "monthly", "quarterly", "annual"] as const,
    `${context}.frequency`,
  );
  const periodStart = requireString(row.period_start, `${context}.period_start`);
  const periodEnd = requireString(row.period_end, `${context}.period_end`);
  validatePeriod(periodStart, periodEnd, frequency, context);

  const status = requireEnum(
    row.status,
    ["observed", "missing", "suppressed", "unavailable"] as const,
    `${context}.status`,
  );
  if (row.value !== null && (typeof row.value !== "number" || !Number.isFinite(row.value))) {
    fail(`${context}.value`, "must be a finite number or null");
  }
  if (status === "observed" && row.value === null) {
    fail(`${context}.value`, "must be a finite number when status is observed");
  }
  if (status !== "observed" && row.value !== null) {
    fail(`${context}.value`, `must have null value when status is ${status}`);
  }

  const publishedAt = requireNullableString(row.published_at, `${context}.published_at`);
  const firstSeenAt = requireNullableString(row.first_seen_at, `${context}.first_seen_at`);
  const retrievedAt = requireNullableString(row.retrieved_at, `${context}.retrieved_at`);
  const availableAt = requireNullableString(row.available_at, `${context}.available_at`);
  validateUtcTimestamp(publishedAt, `${context}.published_at`);
  validateUtcTimestamp(firstSeenAt, `${context}.first_seen_at`);
  validateUtcTimestamp(retrievedAt, `${context}.retrieved_at`);
  validateUtcTimestamp(availableAt, `${context}.available_at`);
  for (const [field, timestamp] of [
    ["published_at", publishedAt],
    ["first_seen_at", firstSeenAt],
    ["retrieved_at", retrievedAt],
    ["available_at", availableAt],
  ] as const) {
    if (timestamp !== null && timestamp.slice(0, 10) < periodEnd) {
      fail(`${context}.${field}`, `cannot precede measurement period_end ${periodEnd}`);
    }
  }

  const availabilityBasis = requireEnum(
    row.availability_basis,
    ["publisher_release", "first_seen", "unknown"] as const,
    `${context}.availability_basis`,
  );
  if (availabilityBasis === "publisher_release" && availableAt !== publishedAt) {
    fail(`${context}.available_at`, "must equal published_at for publisher_release availability");
  }
  if (availabilityBasis === "first_seen" && availableAt !== firstSeenAt) {
    fail(`${context}.available_at`, "must equal first_seen_at for first_seen availability");
  }
  if (availabilityBasis === "unknown" && availableAt !== null) {
    fail(`${context}.available_at`, "must be null when availability_basis is unknown");
  }

  const sourceUrl = requireNullableString(row.source_url, `${context}.source_url`);
  const sourceSha256 =
    row.source_sha256 === null
      ? null
      : requireSha256(row.source_sha256, `${context}.source_sha256`);
  const vintageId = requireNullableString(row.vintage_id, `${context}.vintage_id`);
  if (status === "observed" && (!sourceUrl || !sourceSha256 || !vintageId)) {
    fail(context, "observed values require source_url, source_sha256, and vintage_id");
  }

  return {
    schema_version: 1,
    source_id: requireIdentifier(row.source_id, `${context}.source_id`),
    metric_id: requireIdentifier(row.metric_id, `${context}.metric_id`),
    definition_version: requireIdentifier(row.definition_version, `${context}.definition_version`),
    geo_type: requireIdentifier(row.geo_type, `${context}.geo_type`),
    geo_id: requireIdentifier(row.geo_id, `${context}.geo_id`),
    period_start: periodStart,
    period_end: periodEnd,
    frequency,
    value: row.value as number | null,
    unit: requireIdentifier(row.unit, `${context}.unit`),
    status,
    value_basis: requireEnum(
      row.value_basis,
      ["reported", "estimated", "mixed", "unknown"] as const,
      `${context}.value_basis`,
    ),
    published_at: publishedAt,
    first_seen_at: firstSeenAt,
    retrieved_at: retrievedAt,
    available_at: availableAt,
    availability_basis: availabilityBasis,
    source_url: sourceUrl,
    source_sha256: sourceSha256,
    vintage_id: vintageId,
    quality_flags: requireStringArray(row.quality_flags, `${context}.quality_flags`),
  };
}

export function observationIdentity(observation: ObservationV1): string {
  return [
    observation.source_id,
    observation.metric_id,
    observation.definition_version,
    observation.geo_type,
    observation.geo_id,
    observation.period_start,
    observation.period_end,
    observation.vintage_id ?? "<missing-vintage>",
  ].join("|");
}

export function observationSeriesIdentity(observation: ObservationV1): string {
  return [
    observation.source_id,
    observation.metric_id,
    observation.definition_version,
    observation.geo_type,
    observation.geo_id,
    observation.frequency,
  ].join("|");
}

export function validateObservationSet(
  values: unknown[],
  options: { rawFiles: RawFileEntry[] },
): ObservationV1[] {
  const observations = values.map(parseObservation);
  const rawHashes = new Set(
    options.rawFiles.map(
      (item) => `${item.source_id}|${requireSha256(item.sha256, "raw file hash")}`,
    ),
  );
  const identities = new Set<string>();
  const units = new Map<string, string>();

  for (const observation of observations) {
    const identity = observationIdentity(observation);
    if (identities.has(identity)) {
      fail("observations", `duplicate observation identity ${identity}`);
    }
    identities.add(identity);

    if (
      observation.source_sha256 !== null &&
      !rawHashes.has(`${observation.source_id}|${observation.source_sha256}`)
    ) {
      fail(
        identity,
        `source_sha256 ${observation.source_sha256} does not reference a retained raw file for ${observation.source_id}`,
      );
    }

    const series = observationSeriesIdentity(observation);
    const previousUnit = units.get(series);
    if (previousUnit !== undefined && previousUnit !== observation.unit) {
      fail(series, `unit mismatch: ${previousUnit} versus ${observation.unit}`);
    }
    units.set(series, observation.unit);
  }
  return observations;
}

function validateYearMonth(value: unknown, context: string): string {
  const result = requireString(value, context);
  if (!YEAR_MONTH_RE.test(result)) fail(context, "must be YYYY-MM");
  return result;
}

function parsePeriodRange(value: unknown, context: string): { from: string; through: string } {
  const range = requireRecord(value, context);
  const from = validateYearMonth(range.from, `${context}.from`);
  const through = validateYearMonth(range.through, `${context}.through`);
  if (from > through) fail(context, "from must not be after through");
  return { from, through };
}

function parseNullablePeriodRange(
  value: unknown,
  context: string,
): { from: string | null; through: string | null } {
  const range = requireRecord(value, context);
  if (range.from === null && range.through === null) return { from: null, through: null };
  const parsed = parsePeriodRange(value, context);
  return parsed;
}

function parseManifest(value: unknown): ObservationManifestV1 {
  const manifest = requireRecord(value, "manifest");
  if (manifest.schema_version !== 1) fail("manifest.schema_version", "must equal 1");
  if (!Array.isArray(manifest.source_ids) || manifest.source_ids.length === 0) {
    fail("manifest.source_ids", "must be a non-empty array");
  }
  const sourceIds = manifest.source_ids.map((item, index) =>
    requireIdentifier(item, `manifest.source_ids[${index}]`),
  );
  if (new Set(sourceIds).size !== sourceIds.length) {
    fail("manifest.source_ids", "contains duplicates");
  }

  if (!Array.isArray(manifest.source_coverage)) {
    fail("manifest.source_coverage", "must be an array");
  }
  const sourceCoverage = manifest.source_coverage.map((value, index): SourceCoverageEntry => {
    const context = `manifest.source_coverage[${index}]`;
    const coverage = requireRecord(value, context);
    const sourceId = requireIdentifier(coverage.source_id, `${context}.source_id`);
    if (!sourceIds.includes(sourceId)) fail(context, `unknown source_id ${sourceId}`);
    const expectedCount = requireInteger(coverage.expected_count, `${context}.expected_count`);
    const presentCount = requireInteger(coverage.present_count, `${context}.present_count`);
    const missingCount = requireInteger(coverage.missing_count, `${context}.missing_count`);
    if (presentCount + missingCount !== expectedCount) {
      fail(context, "present_count + missing_count must equal expected_count");
    }
    return {
      source_id: sourceId,
      frequency: requireEnum(
        coverage.frequency,
        ["daily", "monthly", "quarterly", "annual"] as const,
        `${context}.frequency`,
      ),
      expected_period: parsePeriodRange(coverage.expected_period, `${context}.expected_period`),
      observed_period: parseNullablePeriodRange(
        coverage.observed_period,
        `${context}.observed_period`,
      ),
      expected_count: expectedCount,
      present_count: presentCount,
      missing_count: missingCount,
      discovery_failures: requireStringArray(
        coverage.discovery_failures,
        `${context}.discovery_failures`,
      ),
      parse_failures: requireStringArray(coverage.parse_failures, `${context}.parse_failures`),
    };
  });
  const coverageSourceIds = sourceCoverage.map((item) => item.source_id);
  if (
    new Set(coverageSourceIds).size !== coverageSourceIds.length ||
    sourceIds.some((sourceId) => !coverageSourceIds.includes(sourceId))
  ) {
    fail("manifest.source_coverage", "must contain exactly one entry for every declared source_id");
  }

  if (!Array.isArray(manifest.geo_coverage)) {
    fail("manifest.geo_coverage", "must be an array");
  }
  const geoCoverage = manifest.geo_coverage.map((value, index): GeographyCoverageEntry => {
    const context = `manifest.geo_coverage[${index}]`;
    const coverage = requireRecord(value, context);
    const sourceId = requireIdentifier(coverage.source_id, `${context}.source_id`);
    if (!sourceIds.includes(sourceId)) fail(context, `unknown source_id ${sourceId}`);
    const expectedCount = requireInteger(coverage.expected_count, `${context}.expected_count`);
    const presentCount = requireInteger(coverage.present_count, `${context}.present_count`);
    const missingCount = requireInteger(coverage.missing_count, `${context}.missing_count`);
    if (presentCount + missingCount !== expectedCount) {
      fail(context, "present_count + missing_count must equal expected_count");
    }
    if (!Array.isArray(coverage.missing_ranges)) {
      fail(`${context}.missing_ranges`, "must be an array");
    }
    return {
      source_id: sourceId,
      geo_type: requireIdentifier(coverage.geo_type, `${context}.geo_type`),
      geo_id: requireIdentifier(coverage.geo_id, `${context}.geo_id`),
      expected_period: parsePeriodRange(coverage.expected_period, `${context}.expected_period`),
      observed_period: parseNullablePeriodRange(
        coverage.observed_period,
        `${context}.observed_period`,
      ),
      expected_count: expectedCount,
      present_count: presentCount,
      missing_count: missingCount,
      missing_ranges: coverage.missing_ranges.map((range, rangeIndex) =>
        parsePeriodRange(range, `${context}.missing_ranges[${rangeIndex}]`),
      ),
    };
  });

  if (!Array.isArray(manifest.raw_files) || manifest.raw_files.length === 0) {
    fail("manifest.raw_files", "must be a non-empty array");
  }
  const rawFiles = manifest.raw_files.map((value, index) => {
    const context = `manifest.raw_files[${index}]`;
    const entry = requireRecord(value, context);
    const sourceId = requireIdentifier(entry.source_id, `${context}.source_id`);
    if (!sourceIds.includes(sourceId)) fail(context, `unknown source_id ${sourceId}`);
    return {
      relative_path: requireString(entry.relative_path, `${context}.relative_path`),
      sha256: requireSha256(entry.sha256, `${context}.sha256`),
      byte_size: requireInteger(entry.byte_size, `${context}.byte_size`),
      source_id: sourceId,
    };
  });

  if (!Array.isArray(manifest.observation_files) || manifest.observation_files.length === 0) {
    fail("manifest.observation_files", "must be a non-empty array");
  }
  const observationFiles = manifest.observation_files.map((value, index) => {
    const context = `manifest.observation_files[${index}]`;
    const entry = requireRecord(value, context);
    const sourceId = requireIdentifier(entry.source_id, `${context}.source_id`);
    if (!sourceIds.includes(sourceId)) fail(context, `unknown source_id ${sourceId}`);
    return {
      relative_path: requireString(entry.relative_path, `${context}.relative_path`),
      sha256: requireSha256(entry.sha256, `${context}.sha256`),
      row_count: requireInteger(entry.row_count, `${context}.row_count`),
      source_id: sourceId,
    };
  });

  return {
    schema_version: 1,
    run_id: requireString(manifest.run_id, "manifest.run_id"),
    source_ids: sourceIds,
    requested_period: parsePeriodRange(manifest.requested_period, "manifest.requested_period"),
    source_coverage: sourceCoverage,
    geo_coverage: geoCoverage,
    raw_files: rawFiles,
    observation_files: observationFiles,
  };
}

async function resolveContainedFile(
  root: string,
  relativePath: string,
  context: string,
): Promise<string> {
  if (path.isAbsolute(relativePath)) fail(context, "must be relative to the manifest directory");
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(context, "escapes the manifest directory");
  }
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(resolved)]);
  const realRelative = path.relative(realRoot, realFile);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    fail(context, "resolves outside the manifest directory");
  }
  return realFile;
}

function hashBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function loadObservationManifest(
  manifestPath: string,
): Promise<LoadedObservationManifest> {
  if (!path.isAbsolute(manifestPath)) {
    fail("manifest path", "must be absolute");
  }
  const manifestBytes = await readFile(manifestPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    fail("manifest", `invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = parseManifest(parsed);
  const root = path.dirname(manifestPath);

  for (const [index, entry] of manifest.raw_files.entries()) {
    const filePath = await resolveContainedFile(
      root,
      entry.relative_path,
      `manifest.raw_files[${index}]`,
    );
    const [bytes, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
    if (fileStat.size !== entry.byte_size) {
      fail(
        entry.relative_path,
        `byte-size mismatch: manifest=${entry.byte_size}, actual=${fileStat.size}`,
      );
    }
    const actualHash = hashBytes(bytes);
    if (actualHash !== entry.sha256) {
      fail(entry.relative_path, `SHA-256 mismatch: manifest=${entry.sha256}, actual=${actualHash}`);
    }
  }

  const unvalidated: unknown[] = [];
  for (const [index, entry] of manifest.observation_files.entries()) {
    const filePath = await resolveContainedFile(
      root,
      entry.relative_path,
      `manifest.observation_files[${index}]`,
    );
    const bytes = await readFile(filePath);
    const actualHash = hashBytes(bytes);
    if (actualHash !== entry.sha256) {
      fail(entry.relative_path, `SHA-256 mismatch: manifest=${entry.sha256}, actual=${actualHash}`);
    }
    const lines = bytes
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "");
    if (lines.length !== entry.row_count) {
      fail(
        entry.relative_path,
        `row-count mismatch: manifest=${entry.row_count}, actual=${lines.length}`,
      );
    }
    for (const [lineIndex, line] of lines.entries()) {
      try {
        const parsedRow: unknown = JSON.parse(line);
        const row = requireRecord(parsedRow, `${entry.relative_path}:${lineIndex + 1}`);
        if (row.source_id !== entry.source_id) {
          fail(
            `${entry.relative_path}:${lineIndex + 1}`,
            `contains observation for ${String(row.source_id)} but manifest assigns the file to ${entry.source_id}`,
          );
        }
        unvalidated.push(parsedRow);
      } catch (error) {
        fail(
          `${entry.relative_path}:${lineIndex + 1}`,
          `invalid JSONL: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  const observations = validateObservationSet(unvalidated, { rawFiles: manifest.raw_files });
  for (const observation of observations) {
    if (!manifest.source_ids.includes(observation.source_id)) {
      fail("manifest.source_ids", `does not declare observation source ${observation.source_id}`);
    }
  }
  return {
    manifest,
    observations,
    manifest_sha256: hashBytes(manifestBytes),
    manifest_path: manifestPath,
  };
}
