#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// ORPHAN DELETION — removes ONLY markdown that (a) nothing in the repo references and
// (b) lives in a directory whose own name declares it dead.
//
// Operator, 08/05/2026: *"We delete the shit we don't use."* / *"Take care of it all."*
//
// *** WHY A SCRIPT AND NOT A ONE-LINER. *** A `git rm` over an xargs list is unreviewable
// — you cannot see what it will do until it has done it. This prints the exact list,
// refuses to touch anything that is not a `.md` orphan, and defaults to DRY RUN.
//
// SAFETY, IN LAYERS:
//  1. Only paths the live census reports as ORPHANED — zero inbound references across
//     every tracked text file. Recomputed at run time, never read from a stale list.
//  2. Only inside DEAD_DIRS below, each named by its own author as archived/finished/closed.
//  3. Only `.md` (plus committed `desktop.ini` Windows artifacts). Those directories also
//     contain .py/.html/.json that are NOT orphans — this must never touch them. Verified
//     08/05/2026: docs/_archive/superseded alone holds 111 tracked files, of which only 39
//     are orphaned markdown.
//  4. Dry run by default. `--apply` is required to remove anything.
//  5. Everything stays in git history. Rollback is one `git revert <commit>`.
//
//   node scripts/doc-burndown-delete.mjs            # show what would go
//   node scripts/doc-burndown-delete.mjs --apply    # actually remove + stage
//
// AFTER APPLYING: re-measure and LOWER the baseline in doc-reachability.mjs to the new
// count, in the same commit. That is how this ratchets forward instead of drifting back.
// ═══════════════════════════════════════════════════════════════════════════════
import { execFileSync } from "node:child_process";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { census } from "./doc-reachability.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directories whose own names declare the contents dead. NOT a guess — `superseded`,
 *  `_FINISHED` and a closed `investigations` folder are self-describing. `docs/_archive/parked`
 *  is deliberately ABSENT: parked work is deferred, not dead, and may come back. */
const DEAD_DIRS = ["docs/_archive/superseded/", "docs/_FINISHED/", "_ASSISTANT/investigations/"];

const APPLY = process.argv.includes("--apply");

const r = census();
const orphans = new Set(r.orphans);

const doomed = [...orphans]
  .filter((f) => DEAD_DIRS.some((d) => f.startsWith(d)))
  .filter((f) => f.toLowerCase().endsWith(".md"))
  .sort();

// Windows Explorer artifacts that were committed by accident. Not documents at all.
let junk = [];
try {
  junk = execFileSync("git", ["ls-files"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString()
    .split("\n")
    .map((s) => s.trim())
    .filter((f) => basename(f).toLowerCase() === "desktop.ini");
} catch {
  /* git unavailable — junk stays empty, the .md pass still works */
}

const all = [...doomed, ...junk];

const byDir = {};
for (const f of doomed) {
  const d = DEAD_DIRS.find((x) => f.startsWith(x));
  byDir[d] = (byDir[d] ?? 0) + 1;
}

console.log(`\n  ORPHANED MARKDOWN IN SELF-DECLARED-DEAD DIRECTORIES`);
console.log(
  `  (orphan = zero references across ${r.byPath.length + r.byNameOnly.length + r.orphans.length} docs / all tracked text files)\n`,
);
for (const [d, n] of Object.entries(byDir)) console.log(`    ${String(n).padStart(4)}  ${d}`);
if (junk.length)
  console.log(`    ${String(junk.length).padStart(4)}  desktop.ini (Windows artifacts)`);
console.log(`\n  TOTAL: ${all.length} file(s)\n`);

for (const f of all) console.log(`    ${f}`);

// A non-.md slipping through would mean the filters above are broken. Refuse rather than
// "mostly work" — silently deleting a .py is not recoverable by a reader's attention.
const violation = all.find(
  (f) => !f.toLowerCase().endsWith(".md") && basename(f).toLowerCase() !== "desktop.ini",
);
if (violation) {
  console.error(`\nABORT — non-markdown in the delete set: ${violation}\n`);
  process.exit(1);
}

if (!APPLY) {
  console.log(`\n  DRY RUN — nothing removed. Re-run with --apply to remove and stage these.`);
  console.log(
    `  Current orphan count: ${r.orphans.length}. After this: ~${r.orphans.length - doomed.length}.`,
  );
  console.log(`  Rollback after applying: git revert <commit>\n`);
  process.exit(0);
}

execFileSync("git", ["rm", "--quiet", "--", ...all], { cwd: ROOT, stdio: "inherit" });
console.log(`\n  REMOVED and STAGED ${all.length} file(s).`);
console.log(`  NEXT, IN THE SAME COMMIT:`);
console.log(`    node scripts/doc-index.mjs                 # regenerate the map`);
console.log(`    node scripts/doc-reachability.mjs          # read the new orphan count`);
console.log(`    -> LOWER ORPHAN_BASELINE in scripts/doc-reachability.mjs to that number`);
console.log(`    node scripts/doc-ratchet.mjs record        # log the improvement\n`);
