#!/usr/bin/env node
// print-worktree-drift.mjs — SessionStart: every OTHER checkout of this repo, and what it is.
//
// Born 08/30/2026, operator verbatim: "why would there be 6 other checkouts carrying the old
// shit CLAUDE.md and not have .claude/playbooks????? Just do it all correctly!!!!! Tired of
// problems not being fixed." Six RULE 1.5 worktrees from July sat 560–808 commits behind
// main — three fully merged and clean (dead), two holding one unlanded commit each (the
// 07/22 four-lane isMeta fix; the 08/03 permits pack wiring), one holding superseded
// subagent work — and every one of them ran the pre-diet rules. scripts/worktree.mjs says a
// worktree is "self-deleting"; nothing ever ran `cleanup`, and nothing printed the drift.
//
// This prints ONE line per worktree that is not in sync — DEAD (run cleanup), UNLANDED
// (commits not on main), DIRTY (uncommitted work), STALE (far behind, nothing to land),
// DRIFT (in sync but its CLAUDE.md is not main's) — and stays silent for active, in-sync
// work. Pure classification is tested; the git plumbing fails OPEN (a broken line here must
// never delay a session). Read-only: it never removes anything.

import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const STALE_BEHIND = 200;
const STALE_DAYS = 14;

/** Pure: what is this worktree? */
export function classifyWorktree(w) {
  const stale = w.behind >= STALE_BEHIND || w.ageDays >= STALE_DAYS;
  let status = "OK";
  if (w.dirty > 0 && stale) status = "DIRTY";
  else if (w.merged && w.ahead === 0 && w.dirty === 0 && (w.behind > 0 || w.ageDays >= 1))
    status = "DEAD";
  else if (w.ahead > 0 && !w.merged && stale) status = "UNLANDED";
  else if (w.ahead === 0 && !w.merged && stale) status = "STALE";
  if (status === "OK" && !w.claudeMdMatchesMain) status = "DRIFT";
  return { ...w, status };
}

/** Pure: the printed line, or "" when there is nothing to say. */
export function renderLine(c) {
  if (c.status === "OK") return "";
  const label = basename(String(c.path)).replace(/^bp-/, "");
  const claude = c.claudeMdMatchesMain ? "" : " · CLAUDE.md differs from main (old rules)";
  const detail = {
    DEAD: `merged + clean, ${c.behind} behind — run: node scripts/worktree.mjs cleanup ${label}`,
    UNLANDED: `${c.ahead} commit(s) not on main, ${c.behind} behind — land it or cleanup ${label}`,
    DIRTY: `${c.dirty} uncommitted file(s), ${c.behind} behind, last touched ${c.ageDays}d ago`,
    STALE: `${c.behind} behind main, nothing to land — cleanup ${label}`,
    DRIFT: `in sync with main but`,
  }[c.status];
  return `  ${c.status.padEnd(8)} ${label} (${c.branch}) — ${detail}${claude}`;
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** Every worktree except the one this session runs in. Fail-open per entry. */
export function surveyWorktrees(root) {
  const out = [];
  let porcelain;
  try {
    porcelain = git(root, ["worktree", "list", "--porcelain"]);
  } catch {
    return out;
  }
  const self = resolve(root).replace(/\\/g, "/").toLowerCase();
  let mainRef = "origin/main";
  try {
    git(root, ["rev-parse", "--verify", "origin/main"]);
  } catch {
    mainRef = "main";
  }
  let mainClaude = "";
  try {
    mainClaude = git(root, ["rev-parse", `${mainRef}:CLAUDE.md`]);
  } catch {
    /* no CLAUDE.md on main — drift check degrades to "matches" */
  }
  for (const block of porcelain.split(/\n\n+/)) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] || "(detached)";
    if (!path) continue;
    if (resolve(path).replace(/\\/g, "/").toLowerCase() === self) continue;
    try {
      const dirty = git(path, ["status", "--porcelain"]).split("\n").filter(Boolean).length;
      const ahead = Number(git(path, ["rev-list", "--count", `${mainRef}..HEAD`]));
      const behind = Number(git(path, ["rev-list", "--count", `HEAD..${mainRef}`]));
      let merged = false;
      try {
        git(path, ["merge-base", "--is-ancestor", "HEAD", mainRef]);
        merged = true;
      } catch {
        merged = false;
      }
      const ts = Number(git(path, ["log", "-1", "--format=%ct"]));
      const ageDays = Math.floor((Date.now() / 1000 - ts) / 86400);
      let claudeMdMatchesMain = true;
      try {
        claudeMdMatchesMain =
          !mainClaude || git(path, ["rev-parse", "HEAD:CLAUDE.md"]) === mainClaude;
      } catch {
        claudeMdMatchesMain = false;
      }
      out.push(
        classifyWorktree({
          path,
          branch,
          dirty,
          ahead,
          behind,
          merged,
          ageDays,
          claudeMdMatchesMain,
        }),
      );
    } catch {
      /* one unreadable worktree never hides the others */
    }
  }
  return out;
}

function main() {
  try {
    const lines = surveyWorktrees(process.cwd()).map(renderLine).filter(Boolean);
    if (lines.length === 0) return;
    process.stdout.write(
      "――― WORKTREES out of sync with main (RULE 1.5: a worktree is self-deleting — nothing ran cleanup) ―――\n" +
        lines.join("\n") +
        "\n",
    );
  } catch {
    /* fail open */
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
