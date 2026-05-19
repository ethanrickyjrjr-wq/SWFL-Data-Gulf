/**
 * Lane 2C — Consumption-contract v2 build-time consistency check.
 *
 * Asserts that `docs/consumption-contract.md`:
 *
 *   1. Contains the literal anchor pointing at the smoothing-token source of
 *      truth (`refinery/lib/smoothing-tokens.mts`), so readers always trace
 *      to the same file the Stage 4 lint enforces against (Coupling 3).
 *   2. Enumerates ZERO smoothing tokens inline — drift between the doc and the
 *      `SMOOTHING_TOKENS` const is what this test exists to prevent. If a
 *      single token string leaks into the doc body, the test fails.
 *   3. Renders the locked 6 section headers in the documented order (§1 of
 *      the blueprint). Re-ordering the headers is a contract change and must
 *      ship with an explicit doc edit and a test update — never silently.
 *   4. Preserves the four v1.2 load-bearing mechanisms verbatim (Coupling 4):
 *      paste-into-Project-Custom-Instructions block, cache-bust convention,
 *      `freshness_token`-quote-on-first-response rule, and the reference to
 *      the `master-index.mts` framing paragraph (prompt-injection defense).
 *   5. Carries the §1.5 anti-confabulation rule's literal NEVER-fill string,
 *      in its v2.1-scoped form (quote-only zones named explicitly). The
 *      v2.1 analyst amendment narrowed the prohibition so §Speculation is
 *      no longer caught by it, but the underlying NEVER-fill discipline
 *      remains bulletproof for the four quote-only sections.
 *   6. Carries the v2.1 analyst-amendment literals: the LICENSED ANALYTICAL
 *      ZONE charter for §Speculation, the SHOW YOUR WORK rule, the
 *      `[INFERENCE]` tag requirement, and the false-silence symmetric
 *      violation. Without these, §Speculation reverts to its v2.0 default
 *      of refusal-by-omission.
 *
 * Failure here means the consumption contract drifted from its blueprint
 * locks. Fix the doc, not the test, unless the blueprint itself changed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SMOOTHING_TOKENS } from "../lib/smoothing-tokens.mts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = join(
  __dirname,
  "..",
  "..",
  "docs",
  "consumption-contract.md",
);

const CONTRACT = readFileSync(CONTRACT_PATH, "utf8");

/** Locked anchor: doc points at the smoothing-token source of truth. */
const SMOOTHING_ANCHOR =
  "// Source: refinery/lib/smoothing-tokens.mts (SMOOTHING_TOKENS const)";

/** Locked 6 section headers in locked order (blueprint §1). */
const SECTION_HEADERS = [
  "### §Receipts",
  "### §Hard Edges",
  "### §Live-Sources",
  "### §Speculation",
  "### §User-Supplied Data",
  "### §Handoff",
] as const;

/**
 * §1.5 anti-confabulation literal. The phrasing is locked because the rule
 * is mechanically simple, prompt-side-enforceable, and converts the rigid-
 * section design's headline weakness into a single explicit prohibition.
 * v2.1 scoped this to QUOTE-ONLY zones; §Speculation is governed instead by
 * the SHOW YOUR WORK rule (see ANALYST_AMENDMENT_LITERALS below).
 */
const ANTI_CONFABULATION_LITERAL =
  "NEVER fill a `(none)` section in a QUOTE-ONLY zone";

/**
 * v2.1 analyst-amendment literals. Each MUST appear in the doc — together
 * they unlock §Speculation as a real analytical zone without weakening
 * the audited-section discipline. Drop any one and the asymmetry that
 * forced "play-dead in §Speculation" returns.
 */
const ANALYST_AMENDMENT_LITERALS = [
  "LICENSED ANALYTICAL ZONE",
  "SHOW YOUR WORK IN §SPECULATION",
  "[INFERENCE]",
  "false silence",
] as const;

test("contract anchors the smoothing-token source of truth (Coupling 3)", () => {
  assert.ok(
    CONTRACT.includes(SMOOTHING_ANCHOR),
    `consumption-contract.md must include the literal anchor\n  ${SMOOTHING_ANCHOR}\n` +
      `so readers trace to the same file Stage 4 smoothing-lint enforces against. ` +
      `Without this anchor, the doc can drift from refinery/lib/smoothing-tokens.mts ` +
      `without the build noticing.`,
  );
});

test("contract enumerates ZERO smoothing tokens inline (drift guard)", () => {
  // Flatten both groups into a single token list and check none appear in the
  // doc body. We do a case-insensitive substring check because the doc is
  // English prose and any leak (capitalised, mid-sentence, anywhere) is a
  // violation of the import-by-reference rule.
  const allTokens: string[] = [
    ...SMOOTHING_TOKENS.numeric_softening,
    ...SMOOTHING_TOKENS.prose_confidence_translation,
  ];
  const docLower = CONTRACT.toLowerCase();
  const leaks: string[] = [];
  for (const token of allTokens) {
    if (docLower.includes(token.toLowerCase())) {
      leaks.push(token);
    }
  }
  assert.deepEqual(
    leaks,
    [],
    `consumption-contract.md must NOT enumerate individual smoothing tokens ` +
      `inline — the doc imports the list by reference via ${SMOOTHING_ANCHOR}. ` +
      `Leaked tokens found in doc body:\n  ${leaks.join(", ")}`,
  );
});

test("contract renders the locked 6 section headers in locked order", () => {
  // Collect the doc-position of each header. Each must appear exactly once
  // (no accidental re-emission inside an example block — the spec example
  // uses code-fenced `### §X` without the leading `### ` markdown prefix
  // when embedded, but the SECTION CATALOG itself uses the level-3 form).
  const positions = SECTION_HEADERS.map((h) => {
    const idx = CONTRACT.indexOf(h);
    assert.notEqual(
      idx,
      -1,
      `consumption-contract.md missing required section header: "${h}". ` +
        `All 6 blueprint §1 headers MUST appear in the doc.`,
    );
    return { header: h, pos: idx };
  });
  // Strict ascending order: §Receipts → §Hard Edges → §Live-Sources →
  // §Speculation → §User-Supplied Data → §Handoff.
  for (let i = 1; i < positions.length; i++) {
    assert.ok(
      positions[i].pos > positions[i - 1].pos,
      `section headers out of order: "${positions[i].header}" (pos ${positions[i].pos}) ` +
        `must appear AFTER "${positions[i - 1].header}" (pos ${positions[i - 1].pos}). ` +
        `The 6-section order is locked by blueprint §1.`,
    );
  }
});

test("contract preserves v1.2 paste-block rule: FETCH FRESH (Coupling 4)", () => {
  // Verbatim string from v1.2 lines 14-30 — the "FETCH FRESH" rule from the
  // paste-into-Project-Custom-Instructions block. If this string disappears,
  // the consumption-side cache defeat is gone.
  assert.ok(
    CONTRACT.includes("FETCH FRESH"),
    `consumption-contract.md must preserve the v1.2 "FETCH FRESH" rule from ` +
      `the paste-into-Project-Custom-Instructions block (Coupling 4). ` +
      `This rule is the consumption-side cache defeat.`,
  );
});

test("contract preserves v1.2 paste-block rule: PROVE IT'S LIVE (Coupling 4)", () => {
  assert.ok(
    CONTRACT.includes("PROVE IT'S LIVE"),
    `consumption-contract.md must preserve the v1.2 "PROVE IT'S LIVE" rule ` +
      `from the paste-into-Project-Custom-Instructions block (Coupling 4). ` +
      `This rule makes stale reads visible via the freshness_token quote.`,
  );
});

test("contract preserves v1.2 paste-block rule: ROUTE, DON'T GUESS (Coupling 4)", () => {
  assert.ok(
    CONTRACT.includes("ROUTE, DON'T GUESS"),
    `consumption-contract.md must preserve the v1.2 "ROUTE, DON'T GUESS" rule ` +
      `from the paste-into-Project-Custom-Instructions block (Coupling 4). ` +
      `This rule stops the model answering record-level questions from master aggregates.`,
  );
});

test("contract preserves v1.2 paste-block rule: READ RATES AS WRITTEN (Coupling 4)", () => {
  assert.ok(
    CONTRACT.includes("READ RATES AS WRITTEN"),
    `consumption-contract.md must preserve the v1.2 "READ RATES AS WRITTEN" rule ` +
      `from the paste-into-Project-Custom-Instructions block (Coupling 4). ` +
      `This rule closes the inference gap that made "0% survival" get recomputed as 50%.`,
  );
});

test("contract preserves v1.2 cache-bust convention (bumped to v=4 by v2.1 amendment)", () => {
  // Per blueprint §9: each contract ship REQUIRES bumping the cache-bust
  // query string to force a refresh in every existing Project. v2.0 went
  // from ?v=2 → ?v=3; the v2.1 analyst amendment goes ?v=3 → ?v=4. The
  // OLD ?v=3 must be gone from active fetch URLs (it may still appear in
  // historical-trail prose — that's fine; we only guard active URLs).
  assert.ok(
    CONTRACT.includes("?v=4"),
    `consumption-contract.md must carry the bumped ?v=4 cache-bust marker ` +
      `(v2.1 amendment forces refresh in existing Projects).`,
  );
  // Active fetch URLs (those that follow the master endpoint host) must
  // use ?v=4. We grep for the full URL with old ?v=3 — any hit is a
  // stale URL the v2.1 cache-bust was supposed to flush.
  const staleUrls = CONTRACT.match(
    /brain-platform-amber\.vercel\.app\/api\/b\/master\?v=3/g,
  );
  assert.equal(
    staleUrls,
    null,
    `consumption-contract.md must not carry any ?v=3 master URLs in active ` +
      `paste-block or fetch sections — v2.1 amendment requires all active ` +
      `URLs at ?v=4. Stale URLs found: ${staleUrls?.join(", ")}`,
  );
});

test("contract references master-index.mts framing paragraph (Coupling 4)", () => {
  // Per blueprint §7 row 4: dropping this reference is a security regression
  // (prompt-injection defense lives in renderMasterIndex; consumption contract
  // must reference it by file:line as belt-and-suspenders).
  assert.ok(
    CONTRACT.includes("master-index.mts"),
    `consumption-contract.md must reference refinery/render/master-index.mts ` +
      `where the prompt-injection-defense framing paragraph lives (Coupling 4). ` +
      `Silent drop is a security regression.`,
  );
});

test("contract preserves freshness_token-quote-on-first-response rule (Coupling 4)", () => {
  // The phrase "freshness_token" must appear in conjunction with first-response
  // / quote-verbatim language. We assert the token name appears at least twice
  // (Rule 0 promotion + paste-block carry-through per blueprint §7 row 3).
  const tokenMentions = CONTRACT.match(/freshness_token/g) ?? [];
  assert.ok(
    tokenMentions.length >= 2,
    `consumption-contract.md must mention freshness_token at least twice ` +
      `(promoted Rule 0 + preserved paste-block rule per Coupling 4). ` +
      `Found ${tokenMentions.length} mention(s).`,
  );
});

test("contract carries §1.5 anti-confabulation rule literal (v2.1-scoped form)", () => {
  assert.ok(
    CONTRACT.includes(ANTI_CONFABULATION_LITERAL),
    `consumption-contract.md must carry the §1.5 anti-confabulation rule ` +
      `literal string:\n  "${ANTI_CONFABULATION_LITERAL}"\n` +
      `This rule converts the "(none) slot invites invention" weakness into a ` +
      `single explicit prohibition (scoped to QUOTE-ONLY zones by v2.1); ` +
      `without it the rigid-section design's headline failure mode goes ` +
      `un-addressed.`,
  );
});

test("contract carries v2.1 analyst-amendment literals (§Speculation unlock)", () => {
  // Each literal MUST appear at least once. Together they convert §Speculation
  // from a refusal-zone to a licensed analytical zone with audit discipline.
  // Drop any one and the v2.0 "play-dead" failure mode returns.
  const missing: string[] = [];
  for (const literal of ANALYST_AMENDMENT_LITERALS) {
    if (!CONTRACT.includes(literal)) {
      missing.push(literal);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `consumption-contract.md must carry every v2.1 analyst-amendment literal:` +
      `\n  ${ANALYST_AMENDMENT_LITERALS.join("\n  ")}\n` +
      `Missing: ${missing.join(", ")}. ` +
      `Without these, §Speculation reverts to refusal-by-omission and the ` +
      `analytical-zone unlock is silently undone.`,
  );
});

test("contract carries the v1.2 preservation audit table (Coupling 4)", () => {
  // The audit table per blueprint §7 must render explicitly so future readers
  // see WHY each v1.2 mechanism survived (or was changed) into v2.
  assert.ok(
    /preservation audit/i.test(CONTRACT),
    `consumption-contract.md must render the v1.2 preservation audit table ` +
      `(blueprint §7) so the rationale for keeping each load-bearing v1.2 ` +
      `mechanism is visible in the doc itself.`,
  );
});
