// north-star.test.mjs — the guard for "always a different answer" (08/19/2026).
// Each test is named for the failure mode it stops.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderNorthStar, MAX_LINES } from "./north-star.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ---- failure mode 1: the standing plan exists but never reaches a session ----
// The whole point. The real file must exist and must render non-empty, or every
// session is back to free-form re-diagnosis.

test("the real _ASSISTANT/NORTH-STAR.md exists and renders non-empty", () => {
  const path = join(REPO, "_ASSISTANT", "NORTH-STAR.md");
  assert.ok(existsSync(path), "NORTH-STAR.md is missing — the standing plan has no home");
  const out = renderNorthStar(readFileSync(path, "utf8"));
  assert.ok(out.includes("NORTH STAR"), "banner missing");
  assert.ok(out.includes("standing priorities"), "priorities section missing from the real file");
});

// ---- failure mode 2: the standing plan bloats into a second rulebook ---------
// An oversized always-loaded file is the disease this guard treats. Past the cap
// it must truncate LOUDLY, and the real file must be comfortably under the cap.

test("a bloated file truncates loudly at MAX_LINES", () => {
  const big = Array.from({ length: MAX_LINES + 20 }, (_, i) => `line ${i}`).join("\n");
  const out = renderNorthStar(big);
  assert.ok(out.includes("TRUNCATED"), "silent truncation — bloat would eat context invisibly");
  assert.ok(!out.includes(`line ${MAX_LINES}`), "lines past the cap leaked through");
});

test("the real file is under the cap (its own ≤60-line rule plus headroom)", () => {
  const path = join(REPO, "_ASSISTANT", "NORTH-STAR.md");
  const lines = readFileSync(path, "utf8").replace(/\s+$/, "").split("\n").length;
  assert.ok(lines <= MAX_LINES, `NORTH-STAR.md is ${lines} lines — shrink it, don't raise the cap`);
});

// ---- failure mode 3: an empty/missing file prints a banner over nothing ------
// A banner with no plan under it reads as "there is no standing plan" with extra
// steps; empty input must render nothing so the printer stays silent.

test("empty or whitespace-only input renders nothing", () => {
  assert.equal(renderNorthStar(""), "");
  assert.equal(renderNorthStar("   \n\n  "), "");
});
