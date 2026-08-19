#!/usr/bin/env node
// SessionStart hook — prints the open scratchpad items.
//
// WHY THIS EXISTS. RULE 2.0 says "read _ASSISTANT/SCRATCHPAD.md at session start
// alongside TODAY.md." Until 07/22/2026 that was a rule with no mechanism: the five
// registered SessionStart printers were session-log, kickoff, desk-status,
// closeable-checks and tripwire — the scratchpad was not among them. SESSION_LOG.md
// had BOTH halves wired (this printer's sibling reads it, check-session-log-on-push
// blocks a push without it); the scratchpad, whose entire purpose is that Ricky never
// types an issue twice, had neither. Operator, 07/22: "are we reading session logs and
// writing them or just reading scratchpads???"
//
// Fails SOFT by construction. A missing or malformed scratchpad prints nothing and
// exits 0 — a session-start printer that throws breaks every session opening, which
// is worse than the gap it closes. The parse is in lib/scratchpad-parse.mjs and is
// covered by lib/scratchpad-parse.test.mjs (runs in CI).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderDigest } from "./lib/scratchpad-parse.mjs";
import { renderNorthStar } from "./lib/north-star.mjs";

const PATH = resolve(process.cwd(), "_ASSISTANT/SCRATCHPAD.md");
const STRIKES_PATH = resolve(process.cwd(), "_ASSISTANT/STRIKES.md");
const NORTH_STAR_PATH = resolve(process.cwd(), "_ASSISTANT/NORTH-STAR.md");

// RULE 2 §0b's counter. Parses _ASSISTANT/STRIKES.md (`## shape:` header, one `guard:`
// line, `- strike:` lines) and renders every shape at 2+ strikes whose guard is still
// OWED, plus a one-line tally of guarded shapes. Same fail-soft contract as the digest:
// a missing or malformed registry prints nothing — a broken counter must never wedge
// session start, and a counter that only exists in prose is exactly what §0b replaces.
function renderStrikes(text) {
  const shapes = [];
  let cur = null;
  for (const line of text.split("\n")) {
    const h = line.match(/^## shape:\s*(\S+)/);
    if (h) {
      cur = { slug: h[1], guard: "", strikes: 0 };
      shapes.push(cur);
      continue;
    }
    if (!cur) continue;
    const g = line.match(/^guard:\s*(.+)$/);
    if (g) cur.guard = g[1].trim();
    if (/^- strike:/.test(line)) cur.strikes += 1;
  }
  if (shapes.length === 0) return "";
  const owed = shapes.filter((s) => /^OWED/i.test(s.guard) && s.strikes >= 2);
  const built = shapes.filter((s) => !/^OWED/i.test(s.guard));
  const lines = [];
  lines.push("――― STRIKES (RULE 2 §0b: 3rd strike = build the guard, not another entry) ―――");
  for (const s of owed) {
    lines.push(
      `  🔴 ${s.slug} — ${s.strikes} strikes, guard OWED${s.strikes >= 3 ? " — A NEW SCRATCHPAD ENTRY FOR THIS SHAPE IS BANNED; BUILD THE MECHANISM" : ""}`,
    );
    lines.push(`     ${s.guard}`);
  }
  if (owed.length === 0) lines.push("  no unguarded shape at 2+ strikes");
  lines.push(
    `  guarded: ${built.map((s) => `${s.slug}(${s.strikes})`).join(" · ")} — full registry: _ASSISTANT/STRIKES.md`,
  );
  return lines.join("\n") + "\n";
}

// built-dark-no-consumer guard (08/10/2026, 5 strikes). Scans ingest/cadence_registry.yaml
// for entries whose `consuming_pack:` is `none` — data landed that NOTHING reads. The
// cre_figures consumer decision lived 8+ days in a YAML comment nobody re-opened ("how the
// fuck are these not wired"); this prints the dark list every session start so a parked
// consumer decision can never be invisible again. Deliberate parks keep printing — that
// pressure is the point; wire it or park it with a check. Same fail-soft contract.
function renderDarkRoots(text) {
  const dark = [];
  let cur = null;
  for (const line of text.split("\n")) {
    const n = line.match(/^\s*-\s*name:\s*(\S+)/);
    if (n) {
      cur = n[1];
      continue;
    }
    if (cur && /^\s*consuming_pack:\s*none\b/.test(line)) {
      if (!dark.includes(cur)) dark.push(cur);
    }
  }
  if (dark.length === 0) return "";
  const lines = [];
  lines.push(
    `――― DARK ROOTS — ${dark.length} registry entr${dark.length === 1 ? "y" : "ies"} with consuming_pack: none (data lands, NOTHING reads it) ―――`,
  );
  for (let i = 0; i < dark.length; i += 6) {
    lines.push(`  🔴 ${dark.slice(i, i + 6).join(" · ")}`);
  }
  lines.push(
    "     wire a consumer or park it with a checks entry — a YAML comment is not a deferral",
  );
  return lines.join("\n") + "\n";
}

const REGISTRY_PATH = resolve(process.cwd(), "ingest/cadence_registry.yaml");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  // NORTH STAR prints FIRST — the standing plan outranks every other section here.
  // Guard for the 08/19/2026 "always a different answer" shape: sessions re-diagnosed
  // because nothing put the standing plan in front of them. Same fail-soft contract.
  try {
    const northStar = renderNorthStar(readFileSync(NORTH_STAR_PATH, "utf8"));
    if (northStar) process.stdout.write(northStar);
  } catch {
    // File absent (worktree, fresh clone) — the rest of the digest still prints.
  }

  let text = "";
  try {
    text = readFileSync(PATH, "utf8");
  } catch {
    process.exit(0); // no scratchpad in this repo/worktree — nothing to say
  }

  try {
    const digest = renderDigest(text);
    if (digest) process.stdout.write(digest);
  } catch {
    // Never let a parse bug wedge session start.
  }

  try {
    const strikes = renderStrikes(readFileSync(STRIKES_PATH, "utf8"));
    if (strikes) process.stdout.write(strikes);
  } catch {
    // Registry absent or malformed — the digest above still printed; stay soft.
  }

  try {
    const darkRoots = renderDarkRoots(readFileSync(REGISTRY_PATH, "utf8"));
    if (darkRoots) process.stdout.write(darkRoots);
  } catch {
    // Cadence registry absent or malformed — stay soft.
  }
  process.exit(0);
});
