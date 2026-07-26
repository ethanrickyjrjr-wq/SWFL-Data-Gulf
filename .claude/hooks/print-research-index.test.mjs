// Tests for print-research-index.mjs. node:test + node:assert — NOT bun:test.
// CI runs this directory via `node --test .claude/hooks/*.test.mjs` (ci.yml) and
// node's ESM loader cannot resolve the `bun:` protocol, so a bun:test import here
// would abort the file before a single assertion runs.
//
// Each test is named for the failure mode it prevents.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderIndex } from "./print-research-index.mjs";

const FIXTURE = `# RESEARCH INDEX — check here BEFORE crawl4ai

Preamble prose that is instructions to a human, not an inventory.

## Categories

**agent-behavior/** — how the agent steers (2)
- \`2026-01-01-alpha.md\`
- \`2026-01-02-beta.md\` — a conclusion worth carrying

**audits/** — dated deep passes (1)
- \`2026-01-03-gamma.md\`

---

## Not moved, still worth checking

- **\`_FABLE5/\`** — the desk.
`;

// FM1: the whole point is discoverability — the file list must survive.
test("renders every category and every research filename", () => {
  const out = renderIndex(FIXTURE);
  assert.match(out, /agent-behavior/);
  assert.match(out, /audits/);
  assert.match(out, /2026-01-01-alpha\.md/);
  assert.match(out, /2026-01-02-beta\.md/);
  assert.match(out, /2026-01-03-gamma\.md/);
  assert.match(out, /a conclusion worth carrying/, "one-line conclusions must survive");
});

// FM2: a session that reads a silent Grep miss as "we have no research" is the
// original failure. The banner is the entire mitigation — it must always print.
test("always states that Grep cannot see these files", () => {
  const out = renderIndex(FIXTURE);
  assert.match(out, /INVISIBLE to repo-wide Grep/);
  assert.match(out, /NOT evidence the research is absent/);
  assert.match(out, /path=_RESEARCH|--no-ignore/, "must name the escape hatch");
});

// FM3: stop at the next H2 — trailing sections are pointers, not inventory, and
// letting them through grows the session-start injection without adding signal.
test("stops at the section after Categories", () => {
  const out = renderIndex(FIXTURE);
  assert.doesNotMatch(out, /_FABLE5/, "bled past the Categories section");
  assert.doesNotMatch(out, /Preamble prose/, "included the human-facing preamble");
});

// FM4: fail SOFT. A malformed or restructured index must print nothing rather
// than throw — a session-start printer that throws breaks every session opening.
test("returns empty string when the Categories section is missing", () => {
  assert.equal(renderIndex("# Index\n\nno categories heading here\n"), "");
  assert.equal(renderIndex(""), "");
});

// FM5: an empty Categories section must not emit a lone banner claiming an
// inventory it does not have.
test("returns empty string when Categories is present but empty", () => {
  assert.equal(renderIndex("## Categories\n\n## Next\n- thing\n"), "");
});
