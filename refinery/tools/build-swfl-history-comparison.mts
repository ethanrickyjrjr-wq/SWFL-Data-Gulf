import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadObservationManifest,
  type SourceCoverageEntry,
} from "../intelligence/observation-contract.mts";
import {
  comparePriorYearPeriods,
  prepareHistoryComparisonObservations,
  type PeriodAssessment,
  type SeriesPeriodComparison,
} from "../intelligence/compare-periods.mts";

export interface HistoryComparisonPayload {
  schema_version: 1;
  analytical_sha256: string;
  manifest: { run_id: string; sha256: string };
  comparison_window: { from: string; through: string };
  source_ids: string[];
  vintage_selection_policy: string;
  series_comparisons: SeriesPeriodComparison[];
  period_assessments: PeriodAssessment[];
  coverage_matrix: SourceCoverageEntry[];
  source_links: Array<{ source_id: string; url: string }>;
  caveats: string[];
}

type UnhashedPayload = Omit<HistoryComparisonPayload, "analytical_sha256">;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function sourceLinks(
  observations: Awaited<ReturnType<typeof loadObservationManifest>>["observations"],
): Array<{ source_id: string; url: string }> {
  const keys = stableUnique(
    observations
      .filter((observation) => observation.source_url !== null)
      .map((observation) => `${observation.source_id}\u0000${observation.source_url}`),
  );
  return keys.map((key) => {
    const [sourceId, url] = key.split("\u0000");
    return { source_id: sourceId, url };
  });
}

function buildCaveats(coverage: SourceCoverageEntry[]): string[] {
  const caveats = [
    "This is a descriptive latest-evidenced-vintage comparison, not a point-in-time forecast replay.",
    "RSW airport activity and county residential authorizations describe distinct geographies and populations; movements are compared without treating airport counts as county-resident counts.",
    "Agreement or divergence in year-over-year movement does not establish causation, calibrated probability, or a regional bullish/bearish score.",
    "Residential authorizations are not completed homes, project openings, or commercial permits.",
  ];
  for (const item of coverage) {
    for (const failure of item.discovery_failures) {
      caveats.push(`${item.source_id} discovery failure: ${failure}`);
    }
    for (const failure of item.parse_failures) {
      caveats.push(`${item.source_id} parse failure: ${failure}`);
    }
    if (item.missing_count > 0) {
      caveats.push(
        `${item.source_id} coverage reports ${item.missing_count} missing of ${item.expected_count} expected periods/series-periods.`,
      );
    }
  }
  return stableUnique(caveats);
}

export async function buildHistoryComparison(
  manifestPath: string,
  window: { from: string; through: string },
): Promise<HistoryComparisonPayload> {
  const loaded = await loadObservationManifest(manifestPath);
  const comparison = comparePriorYearPeriods(
    prepareHistoryComparisonObservations(loaded.observations),
    window,
  );
  const unhashed: UnhashedPayload = {
    schema_version: 1,
    manifest: {
      run_id: loaded.manifest.run_id,
      sha256: loaded.manifest_sha256,
    },
    comparison_window: { ...window },
    source_ids: [...loaded.manifest.source_ids].sort((a, b) => a.localeCompare(b)),
    vintage_selection_policy: comparison.selection_policy,
    series_comparisons: comparison.series,
    period_assessments: comparison.periods,
    coverage_matrix: [...loaded.manifest.source_coverage].sort((a, b) =>
      a.source_id.localeCompare(b.source_id),
    ),
    source_links: sourceLinks(loaded.observations),
    caveats: buildCaveats(loaded.manifest.source_coverage),
  };
  const analyticalHash = sha256(JSON.stringify(unhashed));
  return { ...unhashed, analytical_sha256: analyticalHash };
}

function displayValue(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderHistoryComparisonMarkdown(payload: HistoryComparisonPayload): string {
  const lines = [
    "# SWFL historical aviation and residential authorization comparison",
    "",
    `Analytical SHA-256: \`${payload.analytical_sha256}\``,
    `Input manifest: \`${payload.manifest.run_id}\` (\`${payload.manifest.sha256}\`)`,
    `Comparison window: ${payload.comparison_window.from} through ${payload.comparison_window.through}`,
    "",
    "This packet compares each native series with its own exact prior-year calendar period. It preserves airport and county scope separately.",
    "",
    "## Period findings",
    "",
    "| Period | Result | Comparable series | Missing/partial series | Directions |",
    "| --- | --- | ---: | ---: | --- |",
    ...payload.period_assessments.map(
      (item) =>
        `| ${item.period_start} to ${item.period_end} | ${item.classification} | ${item.comparable_series_count} | ${item.insufficient_series_count} | ${item.directions.join(", ") || "—"} |`,
    ),
    "",
    "## Exact prior-year comparisons",
    "",
    "| Source / metric / geography | Current period | Current | Prior period | Prior | Change | YoY | Evidence |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: | --- |",
    ...payload.series_comparisons.map((item) => {
      const label = escapeCell(
        `${item.source_id} / ${item.metric_id} / ${item.geo_type}:${item.geo_id} (${item.unit})`,
      );
      const priorPeriod =
        item.prior_period_start && item.prior_period_end
          ? `${item.prior_period_start} to ${item.prior_period_end}`
          : "—";
      const change = displayValue(item.absolute_change);
      const percent = item.percent_change === null ? "—" : `${displayValue(item.percent_change)}%`;
      const evidence =
        item.classification === "comparable"
          ? item.direction
          : `insufficient: ${escapeCell(item.gap_reason ?? "unknown gap")}`;
      return `| ${label} | ${item.period_start} to ${item.period_end} | ${displayValue(item.current_value)} | ${priorPeriod} | ${displayValue(item.prior_value)} | ${change} | ${percent} | ${evidence} |`;
    }),
    "",
    "## Selected vintages and availability",
    "",
    "| Source / metric / geography | Period | Vintage | Available at | Availability basis | Publisher timestamp | First seen | Retrieved | Raw SHA-256 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...payload.series_comparisons.map(
      (item) =>
        `| ${escapeCell(`${item.source_id} / ${item.metric_id} / ${item.geo_type}:${item.geo_id}`)} | ${item.period_start} to ${item.period_end} | ${item.current_vintage_id ?? "—"} | ${item.current_available_at ?? "unknown"} | ${item.current_availability_basis} | ${item.current_published_at ?? "unknown"} | ${item.current_first_seen_at ?? "unknown"} | ${item.current_retrieved_at ?? "unknown"} | ${item.current_source_sha256 ?? "—"} |`,
    ),
    "",
    "## Coverage matrix",
    "",
    "| Source | Expected range | Observed range | Expected | Present | Missing | Discovery / parse notes |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
    ...payload.coverage_matrix.map((item) => {
      const observed =
        item.observed_period.from && item.observed_period.through
          ? `${item.observed_period.from} to ${item.observed_period.through}`
          : "none";
      const notes = [...item.discovery_failures, ...item.parse_failures].join("; ") || "—";
      return `| ${item.source_id} | ${item.expected_period.from} to ${item.expected_period.through} | ${observed} | ${item.expected_count} | ${item.present_count} | ${item.missing_count} | ${escapeCell(notes)} |`;
    }),
    "",
    "## Sources",
    "",
    ...payload.source_links.map((item) => `- ${item.source_id}: ${item.url}`),
    "",
    "## Limits",
    "",
    ...payload.caveats.map((item) => `- ${item}`),
    "",
    `Vintage selection: ${payload.vintage_selection_policy}.`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeHistoryComparison(options: {
  manifestPath: string;
  from: string;
  through: string;
  outDirectory: string;
  invokedAt?: string;
}): Promise<HistoryComparisonPayload> {
  if (!path.isAbsolute(options.outDirectory)) {
    throw new Error("--out must be an absolute output directory");
  }
  const payload = await buildHistoryComparison(options.manifestPath, {
    from: options.from,
    through: options.through,
  });
  const invokedAt = options.invokedAt ?? new Date().toISOString();
  await mkdir(options.outDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(options.outDirectory, "comparison.json"),
      `${JSON.stringify(payload, null, 2)}\n`,
    ),
    writeFile(
      path.join(options.outDirectory, "comparison.md"),
      renderHistoryComparisonMarkdown(payload),
    ),
    writeFile(
      path.join(options.outDirectory, "run-metadata.json"),
      `${JSON.stringify(
        {
          invoked_at: invokedAt,
          manifest_path: path.resolve(options.manifestPath),
          output_directory: path.resolve(options.outDirectory),
          analytical_sha256: payload.analytical_sha256,
        },
        null,
        2,
      )}\n`,
    ),
  ]);
  return payload;
}

function argument(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

async function main(): Promise<void> {
  const manifestPath = argument("--manifest");
  const from = argument("--from");
  const through = argument("--through");
  const outDirectory = argument("--out");
  if (!manifestPath || !from || !through || !outDirectory) {
    throw new Error(
      "Usage: bun refinery/tools/build-swfl-history-comparison.mts --manifest <absolute-path> --from YYYY-MM --through YYYY-MM --out <absolute-directory>",
    );
  }
  const payload = await writeHistoryComparison({ manifestPath, from, through, outDirectory });
  console.log(`Wrote deterministic comparison to ${path.resolve(outDirectory)}`);
  console.log(`Analytical SHA-256: ${payload.analytical_sha256}`);
  console.log(`Series comparisons: ${payload.series_comparisons.length}`);
  console.log(`Period assessments: ${payload.period_assessments.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(
      `build-swfl-history-comparison FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
