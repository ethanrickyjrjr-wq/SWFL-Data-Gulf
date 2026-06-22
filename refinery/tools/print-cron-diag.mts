// Print the CRON-DIAG line for brains/_build-report.json to stderr, so a FAILING
// workflow step (whose conclusion `gh run view --log-failed` captures) surfaces the
// real master-HOLD cause to the cron classifier.
//
// Why this exists (Phase-1 build 02): the refinery rebuild runs in daily-rebuild.yml's
// "Run refinery (resilient)" step, which is `continue-on-error: true` — GitHub rewrites
// that step's conclusion to `success`, so its stdout/stderr (including cli.mts's own
// CRON-DIAG echo) is EXCLUDED from `--log-failed`. The job fails via a later gate step
// ("Fail job on hard HOLD"), whose conclusion IS `failure`. Running this from that gate
// step puts the CRON-DIAG line where the classifier can see it → classify-cron-failure.mjs
// records DETERMINISTIC_HOLD instead of bucketing UNKNOWN (Phase-1 _CONTRACT A).
//
// Reuses formatCronDiag (the single source of truth, unit-tested in resilient-build.test.mts).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { formatCronDiag, type BuildReport } from "../lib/resilient-build.mts";

async function main(): Promise<void> {
  const reportPath = path.join(process.cwd(), "brains", "_build-report.json");
  try {
    const report = JSON.parse(await readFile(reportPath, "utf-8")) as BuildReport;
    console.error(formatCronDiag(report.outcomes ?? []));
  } catch (err) {
    // No report (crash before the write, or a cold start) — still emit one line so the
    // failed-log tail isn't silent; never throw (the gate step's own `exit 1` is the
    // failure signal, not this tool's exit code).
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`CRON-DIAG failureClass=unknown reason=no _build-report.json (${msg})`);
  }
}

main();
