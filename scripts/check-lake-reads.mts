#!/usr/bin/env bun
/**
 * check-lake-reads — ratchet on raw lake reads in page/loader code.
 *
 * WHY (07/21/2026). From the outage handoff: "a brain went stale, someone
 * bypassed it with a direct query to get correct data, the bypass shipped, and
 * it became the pattern. Each bypass was locally reasonable. The accumulation is
 * a product whose showpiece pages cannot survive a database hiccup and which
 * pays full query cost on every render." On 07/21 `/desk` rendered blank and
 * `/charts` showed a DB error to real visitors, while every brain served fine —
 * brains are local disk reads (`lib/fetch-brain.ts`), raw tables are billed
 * network round-trips that die with PostgREST.
 *
 * This does NOT ban raw reads. Most surviving ones are correct: a brain holds
 * point-in-time values, so a time-series chart or a daily live feed genuinely
 * has to hit the lake — that is what the lake is FOR. What this stops is the
 * SILENT accumulation. Every raw read in the guarded directories must appear in
 * the baseline with a verdict saying why it is not a brain read.
 *
 * Verdicts:
 *   brain_candidate — a brain holds this concept at usable grain+freshness.
 *                     Should be repointed to fetchBrain with the raw query kept
 *                     as an outage fallback. Carries `brain_id`.
 *   series_only     — needs a full time series; brains publish point values.
 *   live_feed       — finer/fresher than any brain (daily counts, newest rows).
 *                     Genuinely new data. Correct as a lake read.
 *
 * Run: bun scripts/check-lake-reads.mts [--update]
 *   (no flag)  fail if any raw read is missing from the baseline
 *   --update   rewrite the baseline from the current tree, preserving verdicts
 *              already recorded for a site. Review the diff before committing.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.join(import.meta.dir, "..");
const BASELINE = path.join(ROOT, "docs", "standards", "lake-read-baseline.json");

/**
 * Directories whose job is rendering pages. A raw read here is a page paying
 * query cost per render. Ingest (`ingest/`), the refinery, and API routes that
 * exist to serve data are deliberately NOT guarded — writing to and reading
 * from the lake is their entire purpose.
 */
const GUARDED = ["lib/desk", "lib/charts", "app/desk", "app/charts", "app/embed"];

export type Verdict = "brain_candidate" | "series_only" | "live_feed";

export interface LakeRead {
  file: string;
  line: number;
  table: string;
  verdict: Verdict | "unclassified";
  brain_id?: string;
  note?: string;
}

/**
 * Find `.from("table")` call sites. Dynamic `.from(view)` (a variable) is
 * recorded with the variable name — it is still a raw read and still needs a
 * verdict; resolving which views it can take is the reviewer's job, not a
 * regex's.
 */
export function findReads(src: string, file: string): LakeRead[] {
  const out: LakeRead[] = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/\.from\(\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*\)/);
    if (!m) continue;
    out.push({
      file,
      line: i + 1,
      table: m[1] ?? m[2] ?? `<dynamic:${m[3]}>`,
      verdict: "unclassified",
    });
  }
  return out;
}

async function walk(dir: string): Promise<string[]> {
  const abs = path.join(ROOT, dir);
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return found; // a guarded dir may not exist in every checkout
  }
  for (const e of entries) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) found.push(...(await walk(rel)));
    else if (/\.(ts|tsx|mts)$/.test(e.name) && !e.name.includes(".test.")) found.push(rel);
  }
  return found;
}

export async function scan(): Promise<LakeRead[]> {
  const reads: LakeRead[] = [];
  for (const dir of GUARDED) {
    for (const file of await walk(dir)) {
      const src = await readFile(path.join(ROOT, file), "utf-8");
      reads.push(...findReads(src, file));
    }
  }
  return reads.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Identity of a read for baseline matching. Line numbers shift constantly with
 *  unrelated edits, so they are NOT part of the key — file + table is. */
export function key(r: LakeRead): string {
  return `${r.file}::${r.table}`;
}

async function main() {
  const update = process.argv.includes("--update");
  const found = await scan();
  const prior: LakeRead[] = JSON.parse(await readFile(BASELINE, "utf-8").catch(() => "[]"));
  const priorByKey = new Map(prior.map((r) => [key(r), r]));

  if (update) {
    // Preserve any verdict already recorded; new sites land unclassified so a
    // human has to rule on them rather than inheriting a default.
    const merged = found.map((r) => {
      const was = priorByKey.get(key(r));
      return was ? { ...r, verdict: was.verdict, brain_id: was.brain_id, note: was.note } : r;
    });
    await writeFile(BASELINE, JSON.stringify(merged, null, 2) + "\n", "utf-8");
    const fresh = merged.filter((r) => r.verdict === "unclassified").length;
    console.log(
      `lake-reads: baseline updated — ${merged.length} sites${fresh ? `, ${fresh} UNCLASSIFIED (rule on these)` : ""}`,
    );
    return;
  }

  const novel = found.filter((r) => !priorByKey.has(key(r)));
  const unclassified = prior.filter((r) => r.verdict === "unclassified");

  if (novel.length) {
    console.error(
      `lake-reads: ${novel.length} NEW raw lake read(s) in page/loader code:\n` +
        novel.map((r) => `  ${r.file}:${r.line} -> ${r.table}`).join("\n") +
        "\n\nA page that re-derives from a raw table pays query cost per render and goes blank when\n" +
        "PostgREST does — that is what took /desk and /charts down on 07/21/2026 while every brain\n" +
        "stayed up. Check docs/BRAIN-CATALOG.md first: if a brain already holds this metric, read the\n" +
        "brain (lib/fetch-brain.ts) and keep the query as a fallback.\n" +
        "If the read is genuinely necessary, run `bun scripts/check-lake-reads.mts --update` and set a\n" +
        "verdict (series_only / live_feed / brain_candidate) explaining why.",
    );
    process.exit(1);
  }

  const stale = prior.filter((p) => !found.some((f) => key(f) === key(p)));
  console.log(
    `lake-reads: ${found.length} known raw read(s), no new ones.` +
      (unclassified.length ? ` ${unclassified.length} still unclassified.` : "") +
      (stale.length ? ` ${stale.length} baseline entr(y/ies) no longer in the tree.` : ""),
  );
}

if (import.meta.main) await main();
