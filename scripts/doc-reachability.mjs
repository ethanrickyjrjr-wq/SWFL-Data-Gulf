#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// DOC REACHABILITY CENSUS — "is every path in this project noticeable to Claude
// when it needs it?", answered as a NUMBER instead of an opinion.
//
// *** WHY THIS FILE EXISTS. *** On 08/05/2026 the operator was told the doc-linking
// work was "done" and "we are all good." It had covered 8 files out of 1,533
// markdown files. His reply, verbatim: *"To say you are done and we are all good is
// the biggest lie I've heard from Claude. We have so many files and sections and
// areas that there is no way we are good."* He was right, and nothing in the repo
// could have contradicted me, because the size of the problem had never been
// measured. This script is that measurement. Run it before ever saying "good."
//
// It is also the standing answer to the failure RULE 0.4 names in its own text — the
// research we have already paid for goes unread. A document nothing points at is a
// document no agent will ever be led to. That is not a filing problem, it is an
// invisibility problem, and it is countable:
//
//   REACHABLE BY PATH  another tracked file mentions this doc's full repo-relative
//                      path. Strong: an agent reading that file gets a usable pointer.
//   REACHABLE BY NAME  only the bare filename appears somewhere. Weak and deliberately
//                      NEVER merged into the strong number — "README.md" matches
//                      everything and leads to nothing.
//   ORPHAN             no other tracked file mentions it in any form. It exists and is
//                      invisible.
//
// USAGE
//   node scripts/doc-reachability.mjs                 full census, human-readable
//   node scripts/doc-reachability.mjs --orphans       list every orphan, nothing else
//   node scripts/doc-reachability.mjs --json          machine-readable
//   node scripts/doc-reachability.mjs --check         exit 1 if orphans exceed the
//                                                     baseline below (ratchet mode)
//
// *** THE BASELINE IS A RATCHET, NOT A TARGET. *** It records where we were when the
// census was built. It may only ever be lowered. Raising it to make --check pass is
// the same move as deleting a failing test.
// ═══════════════════════════════════════════════════════════════════════════════
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Measured 08/05/2026: **240 orphans of 1,533 docs.** Lower this as orphans are closed;
 *  never raise it to make `--check` pass.
 *
 *  THE ONE TIME IT WAS RAISED, AND WHY THAT WAS NOT GAMING: it went 229 -> 240 within the
 *  hour it was written, because the FIRST version scanned only `git ls-files` and therefore
 *  counted 0 of the 80 gitignored `_RESEARCH/` docs. Widening a blind instrument surfaced 11
 *  more orphans that were always there. **No orphan was created; the ruler got honest.**
 *  That is the ONLY admissible reason to raise this number, it must be stated in the same
 *  commit, and "the measurement changed" must never be used to launder an actual regression. */
const ORPHAN_BASELINE = 240;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Files worth SEARCHING for a mention. A doc referenced only from a binary or a
 *  lockfile is not meaningfully reachable, so those are not scanned. */
const SCANNABLE = /\.(md|ts|tsx|mts|mjs|js|jsx|py|ya?ml|json|sql|toml|sh|txt)$/i;

/** A generated or vendored blob can "mention" a path by coincidence and would report
 *  an orphan as reachable. Reachability must come from something a human wrote. */
const NOT_EVIDENCE = /^(node_modules|\.next|dist|build|coverage|graphify-out)\//;

/** Guard against a single huge generated file dominating the scan. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Directories that are GITIGNORED ON PURPOSE but are still first-class documents an
 *  agent is required to read. `_RESEARCH/` is the whole point: RULE 0.4 makes it the
 *  FIRST thing opened, and its own index says "a research file not listed in this index
 *  does not exist."
 *
 *  *** THIS LIST EXISTS BECAUSE THE FIRST VERSION OF THIS SCRIPT WAS ITSELF A LYING
 *      INSTRUMENT. *** It measured reachability with `git ls-files` alone, so it counted
 *      0 of the 80 `_RESEARCH/` docs — a census about unread documents that excluded the
 *      documents most loudly documented as unread, and reported the total as if complete.
 *      Same failure class as the Apify spend receipt that counted rows-added and printed
 *      "$0 spent" while $2.00 was charged (08/05/2026). An instrument that can lie is
 *      worse than no instrument, so the blind spot is closed here rather than caveated. */
const UNTRACKED_DOC_ROOTS = ["_RESEARCH"];

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

function trackedFiles() {
  const git = execSync("git ls-files", { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 })
    .toString()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  // Gitignored-but-required docs are unioned in, then deduped — a path could be both.
  const extra = UNTRACKED_DOC_ROOTS.flatMap((d) => walk(d));
  return [...new Set([...git, ...extra])];
}

export function census() {
  const tracked = trackedFiles();
  const docs = tracked.filter((f) => f.toLowerCase().endsWith(".md"));
  const scannable = tracked.filter((f) => SCANNABLE.test(f) && !NOT_EVIDENCE.test(f));

  const corpus = new Map();
  let unreadable = 0;
  for (const f of scannable) {
    try {
      const p = join(ROOT, f);
      if (statSync(p).size > MAX_BYTES) continue;
      corpus.set(f, readFileSync(p, "utf8"));
    } catch {
      unreadable++;
    }
  }

  const byPath = [];
  const byNameOnly = [];
  const orphans = [];

  for (const doc of docs) {
    const name = basename(doc);
    const needle = doc.replace(/\\/g, "/");
    let strong = false;
    let weak = false;
    for (const [f, text] of corpus) {
      // A file mentioning ITSELF is not reachability — someone else must point at it.
      if (f === doc) continue;
      if (text.includes(needle)) {
        strong = true;
        break;
      }
      if (!weak && text.includes(name)) weak = true;
    }
    if (strong) byPath.push(doc);
    else if (weak) byNameOnly.push(doc);
    else orphans.push(doc);
  }

  return { docs, scanned: corpus.size, unreadable, byPath, byNameOnly, orphans };
}

function groupByDir(files) {
  const out = {};
  for (const f of files) {
    const d = f.includes("/") ? f.split("/").slice(0, 2).join("/") : "(repo root)";
    out[d] = (out[d] ?? 0) + 1;
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));
if (isMain) {
  const r = census();
  const pct = (n) => `${((n / r.docs.length) * 100).toFixed(1)}%`;

  if (argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          docs: r.docs.length,
          scanned: r.scanned,
          reachableByPath: r.byPath.length,
          reachableByNameOnly: r.byNameOnly.length,
          orphans: r.orphans.length,
          orphanBaseline: ORPHAN_BASELINE,
          orphanList: r.orphans,
        },
        null,
        2,
      ),
    );
  } else if (argv.includes("--orphans")) {
    for (const o of r.orphans) console.log(o);
  } else {
    console.log(`\n  DOC REACHABILITY CENSUS — brain-platform`);
    console.log(`  scanned ${r.scanned} tracked text files · ${r.docs.length} markdown docs\n`);
    console.log(
      `  reachable by FULL PATH   ${String(r.byPath.length).padStart(5)}  ${pct(r.byPath.length)}`,
    );
    console.log(
      `  reachable by NAME ONLY   ${String(r.byNameOnly.length).padStart(5)}  ${pct(r.byNameOnly.length)}   ambiguous — a basename match leads nowhere`,
    );
    console.log(
      `  ORPHANED, ZERO MENTIONS  ${String(r.orphans.length).padStart(5)}  ${pct(r.orphans.length)}   INVISIBLE — nothing will ever lead an agent here\n`,
    );
    console.log(`  ORPHANS BY AREA:`);
    for (const [d, n] of groupByDir(r.orphans)) console.log(`    ${String(n).padStart(5)}  ${d}`);
    console.log(
      `\n  baseline ${ORPHAN_BASELINE} · --orphans to list them · --check to fail on regression\n`,
    );
  }

  if (argv.includes("--check")) {
    if (r.orphans.length > ORPHAN_BASELINE) {
      console.error(
        `\nFAIL — ${r.orphans.length} orphaned docs, baseline is ${ORPHAN_BASELINE}. ` +
          `${r.orphans.length - ORPHAN_BASELINE} doc(s) became invisible. Point something at them, ` +
          `or lower the baseline ONLY after actually closing orphans.\n`,
      );
      process.exit(1);
    }
    console.log(
      `OK — ${r.orphans.length} orphans, at or below the baseline of ${ORPHAN_BASELINE}.`,
    );
  }
}
