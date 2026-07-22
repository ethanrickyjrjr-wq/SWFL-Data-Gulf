// scratchpad-parse.test.mjs — the scratchpad's whole job is that Ricky never
// types an issue twice. Until 07/22/2026 it had a RULE and no MECHANISM: five
// SessionStart printers ran (session-log, kickoff, desk-status, closeable-checks,
// tripwire) and NONE of them was the scratchpad, so it was read only when an agent
// remembered to. Proof it failed: 68 lines sat uncommitted in the working tree at
// the start of this session, written by the prior one, never pushed.
//
// Each test below is named for the failure mode it stops. The parse is pure so it
// is proven against fixtures, not only against a tree that happens to pass today.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseScratchpad, openItems, renderDigest, MAX_ITEMS } from "./scratchpad-parse.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ---- failure mode 1: positional classification -----------------------------
// The real file has `## OPEN — raised 07/21/2026` at line 1407, AFTER
// `## RESOLVED` at line 1103. Anything that assumes "everything past RESOLVED is
// closed" silently drops six live items, including the five that item 20-25 flags
// as having no checks entries.

test("an OPEN section that appears after RESOLVED is still open", () => {
  const text = [
    "## OPEN — raised 07/20/2026",
    "### 1. first",
    "body",
    "## RESOLVED",
    "### 2. done thing",
    "body",
    "## OPEN — raised 07/21/2026",
    "### 3. later open thing",
    "body",
  ].join("\n");

  const titles = openItems(text).map((i) => i.title);
  assert.ok(
    titles.some((t) => t.includes("later open thing")),
    "an OPEN section after RESOLVED was classified by position, not by its heading",
  );
  assert.ok(!titles.some((t) => t.includes("done thing")));
});

// ---- failure mode 2: inline closure inside an open section -----------------
// Items get closed in place with a `**RESOLVED 07/21/2026 …**` line rather than
// being moved. Printing those as open is noise, and a digest full of closed items
// is one the operator stops reading — which is the same as not having built it.

test("an item closed inline inside an OPEN section is not reported open", () => {
  const text = [
    "## OPEN — raised 07/21/2026",
    "### 1. still broken",
    "body",
    "### 2. was broken",
    "**RESOLVED 07/21/2026 — operator chose the live wiring.**",
  ].join("\n");

  const titles = openItems(text).map((i) => i.title);
  assert.deepEqual(titles, ["1. still broken"]);
});

test("an item whose title says SHIPPED or CLOSED is not reported open", () => {
  const text = [
    "## OPEN — raised 07/20/2026",
    "### 7. research folder tracked — RESOLVED 07/20/2026",
    "### 17. community data — SHIPPED",
    "### 18. empty-state page — IN PROGRESS",
  ].join("\n");

  const titles = openItems(text).map((i) => i.title);
  assert.deepEqual(titles, ["18. empty-state page — IN PROGRESS"]);
});

// ---- failure mode 2b: prose that MENTIONS a closure word -------------------
// Caught by running the first build against the real file: three items were being
// hidden because a closure word appeared in ordinary prose. Over-filtering is the
// worst possible bug here — it silently buries a gripe the operator raised, which
// is precisely what the scratchpad exists to prevent. A closure must be a STATUS
// STAMP at the head of the line, never a word spotted mid-sentence.
// All three strings below are verbatim from _ASSISTANT/SCRATCHPAD.md.

test("a line saying NOT YET CLOSED does not close the item", () => {
  const text = [
    "## OPEN — raised 07/21/2026",
    "### 0a. THE EGRESS BURNER IS NAMED, WITH BYTES",
    "**NOT YET CLOSED — do not call this fixed.** What is true: no burner-class reads",
  ].join("\n");
  assert.deepEqual(
    openItems(text).map((i) => i.title),
    ["0a. THE EGRESS BURNER IS NAMED, WITH BYTES"],
  );
});

test("prose mentioning SHIPPED or FIXED mid-sentence does not close the item", () => {
  const text = [
    "## OPEN — raised 07/22/2026",
    "### 0ah. SteadyAPI HAS exact sale dates",
    "**CONSEQUENCE FOR WHAT I SHIPPED TODAY (measured, 07/22/2026):** on nearby-home-values,",
    "### 0ag. a records request sat DRAFTED-never-filed",
    "**The bug (FIXED + verified live this session).** scripts/session-kickoff.mjs:100 queried",
  ].join("\n");
  assert.equal(openItems(text).length, 2, "prose mention was treated as a closure stamp");
});

test("a real status stamp at the head of the line still closes the item", () => {
  const text = [
    "## OPEN — raised 07/21/2026",
    "### 20. /demo — what the fuck is it",
    '**RESOLVED 07/21/2026 — operator chose "wire it to live data."** app/demo now reads',
    "### 25. still open thing",
    "body",
  ].join("\n");
  assert.deepEqual(
    openItems(text).map((i) => i.title),
    ["25. still open thing"],
  );
});

test("a title mentioning 'declared resolved' in lowercase prose stays open", () => {
  const text = [
    "## OPEN — raised 07/21/2026",
    "### 22. Equation footnotes STILL SHIPPING — item 13 was declared resolved, only 1 of 4 died",
  ].join("\n");
  assert.equal(openItems(text).length, 1, "lowercase prose in a title was read as a closure");
});

// ---- failure mode 3: the printer dumps the file ----------------------------
// SCRATCHPAD.md is ~1,900 lines. A SessionStart hook that prints it whole burns
// the context it is trying to inform, and RULE 11 says we do not pay a habit tax
// at our volume. The digest is titles only, with a hard ceiling.

test("the digest is a title-only summary, never a dump of the file", () => {
  const big = ["## OPEN — raised 07/22/2026"];
  for (let i = 0; i < 60; i++) {
    big.push(`### ${i}. item number ${i}`);
    big.push("x".repeat(2000)); // body that must never reach the output
  }
  const text = big.join("\n");

  const out = renderDigest(text);
  assert.ok(!out.includes("x".repeat(100)), "item bodies leaked into the digest");
  assert.ok(out.length < 4000, `digest was ${out.length} bytes — too big for session start`);
});

test("overflow past the cap is COUNTED, never silently dropped", () => {
  const big = ["## OPEN — raised 07/22/2026"];
  const n = MAX_ITEMS + 7;
  for (let i = 0; i < n; i++) big.push(`### ${i}. item number ${i}`);

  const out = renderDigest(big.join("\n"));
  assert.ok(/\+\s*7\s+more/.test(out), `overflow not reported in: ${out.slice(-300)}`);
});

test("a long title is truncated with an ellipsis, not wrapped across lines", () => {
  const text = `## OPEN — raised 07/22/2026\n### 1. ${"y".repeat(400)}`;
  const line = renderDigest(text)
    .split("\n")
    .find((l) => l.includes("yyy"));
  assert.ok(line.length < 140, `title line was ${line.length} chars`);
  assert.ok(line.includes("…"));
});

// ---- failure mode 4: the hook crashes the session --------------------------
// A SessionStart hook that throws on a missing or malformed file breaks EVERY
// session opening, which is strictly worse than the gap it was built to close.

test("empty, missing, or malformed input yields a digest and never throws", () => {
  for (const bad of ["", "\n\n", "no headings at all", "### orphan item with no section"]) {
    assert.doesNotThrow(() => renderDigest(bad));
    assert.doesNotThrow(() => openItems(bad));
  }
  assert.doesNotThrow(() => renderDigest(undefined));
  assert.doesNotThrow(() => renderDigest(null));
});

// ---- failure mode 5: today's gripes are invisible --------------------------
// The newest entries are appended at the TOP of the file as `## YYYY-MM-DD — …`
// narrative, OUTSIDE any OPEN section. A digest that only walks OPEN sections
// shows yesterday's list and hides what was raised an hour ago.

test("recent top-of-file dated entries are surfaced, not just OPEN sections", () => {
  const text = [
    "## 2026-07-22 — flood data claim was FALSE",
    "body",
    "## OPEN — raised 07/20/2026",
    "### 1. older thing",
  ].join("\n");

  const out = renderDigest(text);
  assert.ok(out.includes("flood data claim"), "newest dated entry missing from digest");
});

// ---- the live file ---------------------------------------------------------
// Fixtures prove the detector; this proves it against the tree we actually ship.

test("the real SCRATCHPAD.md parses and reports open items", () => {
  const p = join(REPO, "_ASSISTANT", "SCRATCHPAD.md");
  if (!existsSync(p)) return; // parse lib must not require the file to exist

  const text = readFileSync(p, "utf8");
  const parsed = parseScratchpad(text);
  const open = openItems(text);

  assert.ok(parsed.sections.length > 3, "real file parsed into too few sections");
  assert.ok(open.length > 0, "real file reported zero open items — parser is not matching");

  const digest = renderDigest(text);
  assert.ok(digest.length < 6000, `real digest is ${digest.length} bytes — too big`);
  assert.ok(!digest.includes("RESOLVED 07/20/2026"), "a closed item leaked into the digest");
});
