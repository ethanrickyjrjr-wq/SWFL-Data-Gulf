/**
 * `crawl4ai_doctor_preflight_monthly_crons` — the doctor preflight step ships
 * ADVISORY (`continue-on-error: true`, step named "crawl4ai preflight (advisory)")
 * until one confirmed green run of that step post-dates the 2026-06-21 step-add
 * commit (0ec6804), then flips to BLOCKING (plain "crawl4ai preflight", no
 * continue-on-error) — same shape as the 7 workflows already flipped
 * (e.g. active-listings-daily.yml).
 *
 * marketbeat-pdf-ingest.yml's precondition cleared: run 29411199476
 * (2026-07-15, schedule-triggered) shows the advisory step completed
 * `conclusion: success` — confirmed via `gh run view 29411199476 --json jobs`.
 *
 * rsw-airport-monthly.yml, fgcu-reri-monthly.yml, and collier-permits-monthly.yml
 * have NOT cleared the precondition yet (no confirmed green run of the step
 * since 06/21 — verified via `gh run list` 2026-07-22) and stay advisory here on
 * purpose. Flip each only after a confirmed post-06/21 green run.
 */
import { describe, expect, test } from "bun:test";

async function readWorkflow(file: string): Promise<string> {
  const url = new URL(`../../../.github/workflows/${file}`, import.meta.url);
  return await Bun.file(url).text();
}

interface PreflightStep {
  name: string;
  continueOnError: boolean;
}

function findPreflightStep(yaml: string): PreflightStep {
  const doc = Bun.YAML.parse(yaml) as Record<string, unknown>;
  const jobs = (doc.jobs ?? {}) as Record<string, unknown>;
  for (const job of Object.values(jobs)) {
    const steps = ((job as Record<string, unknown>).steps ?? []) as Record<string, unknown>[];
    for (const step of steps) {
      const name = String(step.name ?? "");
      if (name.startsWith("crawl4ai preflight")) {
        return { name, continueOnError: step["continue-on-error"] === true };
      }
    }
  }
  throw new Error("no crawl4ai preflight step found");
}

describe("crawl4ai doctor preflight — advisory-to-blocking flip", () => {
  test("marketbeat-pdf-ingest.yml: precondition cleared (green run 29411199476, 2026-07-15) — step is BLOCKING", async () => {
    const step = findPreflightStep(await readWorkflow("marketbeat-pdf-ingest.yml"));
    expect(step.name).toBe("crawl4ai preflight");
    expect(step.continueOnError).toBe(false);
  });

  test("rsw-airport-monthly.yml: precondition NOT yet cleared (no green run since 06/21) — stays ADVISORY", async () => {
    const step = findPreflightStep(await readWorkflow("rsw-airport-monthly.yml"));
    expect(step.name).toBe("crawl4ai preflight (advisory)");
    expect(step.continueOnError).toBe(true);
  });

  test("fgcu-reri-monthly.yml: precondition NOT yet cleared (last run 06/05, before the step existed) — stays ADVISORY", async () => {
    const step = findPreflightStep(await readWorkflow("fgcu-reri-monthly.yml"));
    expect(step.name).toBe("crawl4ai preflight (advisory)");
    expect(step.continueOnError).toBe(true);
  });

  test("collier-permits-monthly.yml: precondition NOT yet cleared (schedule trigger itself commented out) — stays ADVISORY", async () => {
    const step = findPreflightStep(await readWorkflow("collier-permits-monthly.yml"));
    expect(step.name).toBe("crawl4ai preflight (advisory)");
    expect(step.continueOnError).toBe(true);
  });
});
