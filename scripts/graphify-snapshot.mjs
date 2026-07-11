#!/usr/bin/env bun
// scripts/graphify-snapshot.mjs — shared graphify-out/ cache across worktrees.
//
// graphify-out/ is gitignored and graph.json alone runs ~43MB (measured 07/11/2026).
// RULE 1.5 worktrees (`node scripts/worktree.mjs new <label>`) check out a fresh
// sibling directory with no graphify-out/ at all, so graphify's own internal
// incremental cache (graphify-out/cache/) starts cold every time — a full
// re-extraction on each new worktree, even though nothing about the codebase
// changed since the last one.
//
// Brought in from evaluating DeusData/codebase-memory-mcp
// (docs/audit/2026-07-11-external-repos-scan/findings.md, item 10): that tool
// commits a compressed graph snapshot to git so teammates skip a cold reindex.
// Committing graphify-out/ here would mean a ~3MB binary diff noise in every PR
// that touches code — not worth it for a single-operator, worktree-based
// workflow. Instead this keeps ONE shared snapshot OUTSIDE git (~/.cache/...)
// that any worktree can restore from, refreshed whenever any worktree runs
// `bun run graphify:update`.
//
// Measured 07/11/2026 (Bun 1.3.14, Bun.zstdCompressSync): graph.json 42.6MB ->
// 2.7MB, 15.8:1, 57ms. Whole graphify-out/ dir is tarred first so the AST
// cache (~1,800 small files) and manifest/labels ride along in one archive.
//
// Usage:
//   bun scripts/graphify-snapshot.mjs save     tar+zstd graphify-out/ -> shared cache
//   bun scripts/graphify-snapshot.mjs restore  seed graphify-out/ from shared cache
//                                               (no-op if graphify-out/ already exists
//                                               or no snapshot has been saved yet)
//
// Both are no-ops on missing input (no graphify-out/ to save; no snapshot to
// restore) — never blocks graphify:update or worktree creation.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
// GNU tar as shipped in Git Bash/MSYS mishandles backslash Windows paths when
// piped via stdin (works fine as a plain -C arg, breaks with `input:` set) —
// forward slashes are accepted by both cmd.exe and MSYS tar, so use those in
// every tar invocation below. (Measured 07/11/2026: backslash path failed
// restore with "tar: C\:\\Users\\...: Cannot open" while save, which never
// pipes stdin, worked with the same string.)
const REPO_ROOT_TAR = REPO_ROOT.replace(/\\/g, "/");
const GRAPHIFY_OUT = resolve(REPO_ROOT, "graphify-out");
const CACHE_DIR = resolve(homedir(), ".cache", "graphify-brain-platform");
const SNAPSHOT = resolve(CACHE_DIR, "snapshot.tar.zst");

const cmd = process.argv[2];

function human(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

if (cmd === "save") {
  if (!existsSync(GRAPHIFY_OUT)) {
    console.log("graphify-snapshot save: no graphify-out/ present — skipping.");
    process.exit(0);
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  const tarBuf = execSync(`tar -cf - -C "${REPO_ROOT_TAR}" graphify-out`, {
    maxBuffer: 1024 * 1024 * 1024,
  });
  const compressed = Bun.zstdCompressSync(tarBuf);
  writeFileSync(SNAPSHOT, compressed);
  const ratio = (tarBuf.length / compressed.length).toFixed(1);
  console.log(
    `graphify-snapshot save: ${human(tarBuf.length)} -> ${human(compressed.length)} (${ratio}:1) -> ${SNAPSHOT}`,
  );
} else if (cmd === "restore") {
  if (existsSync(GRAPHIFY_OUT)) {
    console.log("graphify-snapshot restore: graphify-out/ already present — leaving it alone.");
    process.exit(0);
  }
  if (!existsSync(SNAPSHOT)) {
    console.log(
      "graphify-snapshot restore: no shared snapshot yet — run `bun run graphify:update` once to create one.",
    );
    process.exit(0);
  }
  const compressed = readFileSync(SNAPSHOT);
  const tarBuf = Bun.zstdDecompressSync(compressed);
  execSync(`tar -xf - -C "${REPO_ROOT_TAR}"`, { input: tarBuf, maxBuffer: 1024 * 1024 * 1024 });
  const ageMin = Math.round((Date.now() - statSync(SNAPSHOT).mtimeMs) / 60000);
  console.log(
    `graphify-snapshot restore: seeded graphify-out/ from shared cache (${ageMin} min old). Run 'bun run graphify:update' to bring it current.`,
  );
} else {
  console.error("usage: bun scripts/graphify-snapshot.mjs <save|restore>");
  process.exit(1);
}
