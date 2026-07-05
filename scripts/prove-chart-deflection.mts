/**
 * prove-chart-deflection.mts — PROVE the report-path chart fix on a LIVE Haiku answer.
 *
 * The scenario the 23-day-old prove-deflection.mts NEVER tested, and the gate's
 * findDeflection was BLIND to until this push: a CHART REQUEST on the REPORT path
 * (buildGroundedSystemPrompt → buildGroundingContext, lib/highlighter/grounding.ts),
 * grounded on cre-swfl (commercial real estate) — EXACTLY the 2026-06-21 screenshot
 * ("Chart home values over time" → "I can't chart that for you … outside this report's
 * scope", plus a raw SWFL-7421-v…-YYYYMMDD token leak).
 *
 * Three configs, scored with the EXACT detectors the push-gate uses (findDeflection +
 * findLeak from .claude/hooks/check-answer-fix-proof.mjs, now chart-aware):
 *
 *   FIXED+chart  = real buildGroundedSystemPrompt with chartNote set (a home-values chart
 *                  WAS drawn) → CHARTS directive says "describe it, never refuse" + the
 *                  freshness line is the clean as-of DATE (freshnessDirective).
 *   FIXED-chart  = real buildGroundedSystemPrompt, no chartNote (a scope with no chart) →
 *                  still "never flatly refuse", still no raw token.
 *   BASELINE     = the same prompt with the two pre-fix atoms restored: the raw-token
 *                  "Quote this freshness token …" line + the old CHARTS line. Faithful —
 *                  those are the ONLY two atoms the fix changed.
 *
 * Prod model/params mirror lib/assistant/report-path.ts: claude-haiku-4-5 (TRIAGE_MODEL),
 * max_tokens 760, no temperature (API default), system + one user turn.
 *
 * Run:  bun run scripts/prove-chart-deflection.mts
 */
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "../refinery/agents/anthropic.mts";
import { TRIAGE_MODEL } from "../refinery/agents/anthropic.mts";
import { parseBrainMarkdown } from "../refinery/render/speaker.mts";
import { buildDossier } from "../lib/fetch-brain";
import { buildGroundedSystemPrompt } from "../lib/grounded-answer";
import type { GroundingBlock } from "../lib/highlighter/grounding";
import {
  buildChartForIntent,
  zhviChartSpecFromRows,
  summarizeChartForGrounding,
} from "../lib/build-chart-for-intent.mts";
import type { ChartRow } from "../types/viz";
import { findDeflection, findLeak } from "../.claude/hooks/check-answer-fix-proof.mjs";

const QUESTION = "Chart home values over time";
const ROLLS = 12;
const MAX_TOKENS = 760;
const fs = await import("node:fs/promises");
const { execSync } = await import("node:child_process");

// Representative live-shape ZHVI sample (the real path reads data_lake.zhvi_pivoted; in a
// credless harness env that read returns empty, so we summarize a faithful sample so the
// proof exercises the REAL behavior: the model is handed the chart's real figures).
const SAMPLE_ZHVI: ChartRow[] = [
  { month: "2020-01", cape_coral: 250000, fort_myers: 240000, naples: 380000 },
  { month: "2022-06", cape_coral: 410000, fort_myers: 395000, naples: 620000 },
  { month: "2024-06", cape_coral: 385000, fort_myers: 372000, naples: 600000 },
  { month: "2026-04", cape_coral: 388000, fort_myers: 374000, naples: 610000 },
];

// Prefer the LIVE chart (if lake creds are present); else summarize the faithful sample.
async function chartSummary(): Promise<string> {
  let chart = null;
  try {
    chart = await buildChartForIntent({ chart_type: "area", scope: "zhvi" });
  } catch {
    /* credless env → fall through to sample */
  }
  if (!chart) chart = zhviChartSpecFromRows(SAMPLE_ZHVI, "2026-04");
  return chart ? summarizeChartForGrounding(chart) : "SWFL Home Values (ZHVI)";
}

function creBlock(creMd: string): GroundingBlock {
  const cre = parseBrainMarkdown(creMd);
  return {
    label: "SWFL commercial corridors",
    dossier: buildDossier(cre.output, cre.freshness_token),
  };
}

function fixedWithChart(creMd: string, summary: string): string {
  return buildGroundedSystemPrompt({
    question: QUESTION,
    selectionType: "metric",
    blocks: [creBlock(creMd)],
    chartNote: summary,
  });
}

function fixedNoChart(creMd: string): string {
  return buildGroundedSystemPrompt({
    question: QUESTION,
    selectionType: "metric",
    blocks: [creBlock(creMd)],
  });
}

/** BASELINE: restore the two pre-fix atoms in the real prompt. */
function baseline(creMd: string): string {
  const block = creBlock(creMd);
  const token = block.dossier.freshness_token;
  let s = fixedNoChart(creMd);
  // Pre-fix raw-token leak line (replaces freshnessDirective's clean as-of date).
  s = s.replace(
    /State the data's recency exactly once, in plain words — "as of [\d/]+"\. Never print an internal freshness token, code, or version string\./,
    `Quote this freshness token exactly once in your answer: ${token}`,
  );
  // Pre-fix CHARTS line (no "never flatly refuse").
  s = s.replace(
    /CHARTS — if asked to chart or visualize: NEVER tell the user to build it themselves \(no "pull it into Excel \/ Sheets \/ Tableau \/ Python"\) and NEVER flatly refuse with "I can't chart that" or "that's outside this report's scope\." Keep your answer about the numbers; the report shows a chart of its key data, and you can offer to pull a specific view we don't already show\./,
    "CHARTS — if asked to chart or visualize, NEVER tell the user to build it themselves (no 'pull it into Excel / Sheets / Tableau / Python'). Keep your answer about the numbers; the report shows a chart of its key data.",
  );
  return s;
}

async function callHaiku(client: Anthropic, system: string): Promise<string> {
  const res = await client.messages.create({
    model: TRIAGE_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: QUESTION }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

interface Scored {
  answer: string;
  deflect: string | null;
  leak: string | null;
  bad: boolean;
}

async function runBatch(client: Anthropic, system: string, rolls: number): Promise<Scored[]> {
  const out: Scored[] = [];
  for (let i = 0; i < rolls; i++) {
    let answer = "";
    try {
      answer = await callHaiku(client, system);
    } catch (e) {
      answer = `__ERROR__: ${(e as Error).message}`;
    }
    const deflect = findDeflection(answer);
    const leak = findLeak(answer);
    out.push({ answer, deflect, leak, bad: Boolean(deflect || leak) });
    process.stderr.write(out[i].bad ? "x" : ".");
  }
  process.stderr.write("\n");
  return out;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      JSON.stringify({ key_loaded: false, reason: "run with `bun run` so .env.local loads" }),
    );
    return;
  }
  const client = getAnthropic("proof");
  const creMd = await fs.readFile("brains/cre-swfl.md", "utf-8");
  const observedAt = execSync('bash -lc "date -u +%Y-%m-%dT%H:%M:%SZ"', {
    encoding: "utf-8",
  }).trim();

  const summary = await chartSummary();
  const fc = fixedWithChart(creMd, summary);
  const fn = fixedNoChart(creMd);
  const bl = baseline(creMd);

  // Confirm the baseline reconstruction actually restored the pre-fix atoms (else the
  // contrast is meaningless). A loud guard, not a silent pass.
  const baselineFaithful =
    /Quote this freshness token exactly once/.test(bl) && !/never flatly refuse/i.test(bl);

  process.stderr.write(`BASELINE (pre-fix atoms restored=${baselineFaithful}):\n`);
  const blResults = await runBatch(client, bl, ROLLS);
  process.stderr.write(`FIXED + chart (chartNote set):\n`);
  const fcResults = await runBatch(client, fc, ROLLS);
  process.stderr.write(`FIXED - chart (no chartNote):\n`);
  const fnResults = await runBatch(client, fn, ROLLS);

  const badCount = (r: Scored[]) => r.filter((x) => x.bad).length;
  const firstClean = (r: Scored[]) => r.find((x) => !x.bad)?.answer ?? null;

  const report = {
    key_loaded: true,
    observed_at: observedAt,
    model: TRIAGE_MODEL,
    harness: "scripts/prove-chart-deflection.mts",
    question: QUESTION,
    chart_summary: summary,
    rolls: ROLLS,
    baseline_faithful: baselineFaithful,
    baseline_bad: badCount(blResults),
    baseline_bad_rate: badCount(blResults) / ROLLS,
    fixed_with_chart_bad: badCount(fcResults),
    fixed_with_chart_bad_rate: badCount(fcResults) / ROLLS,
    fixed_no_chart_bad: badCount(fnResults),
    fixed_no_chart_bad_rate: badCount(fnResults) / ROLLS,
    worked: badCount(fcResults) === 0 && badCount(fnResults) === 0,
    sample_baseline_bad: blResults.find((r) => r.bad) ?? null,
    sample_fixed_with_chart_clean: firstClean(fcResults),
    sample_fixed_no_chart_clean: firstClean(fnResults),
    fixed_with_chart_clean_answers: fcResults.filter((r) => !r.bad).map((r) => r.answer),
    baseline_breakdown: blResults.map((r) => ({ bad: r.bad, deflect: r.deflect, leak: r.leak })),
    fixed_with_chart_breakdown: fcResults.map((r) => ({
      bad: r.bad,
      deflect: r.deflect,
      leak: r.leak,
    })),
    fixed_no_chart_breakdown: fnResults.map((r) => ({
      bad: r.bad,
      deflect: r.deflect,
      leak: r.leak,
    })),
    fixed_with_chart_bad_answers: fcResults.filter((r) => r.bad).map((r) => r.answer),
    fixed_no_chart_bad_answers: fnResults.filter((r) => r.bad).map((r) => r.answer),
  };
  await fs.writeFile(
    "scripts/.prove-chart-deflection-result.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(1);
});
