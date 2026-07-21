// Proof that the focus-injection hook builds correct UserPromptSubmit output.
// Run: node .claude/hooks/inject-focus.test.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  loadRules,
  buildAdditionalContext,
  buildHookOutput,
  DEFAULT_RULES,
  AREA_DIRS,
} from "./inject-focus.mjs";

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
    pass++;
  } catch (e) {
    console.log("  FAIL  " + name + " — " + e.message);
    fail++;
  }
}

// --- loadRules: file wins, absent falls back to the built-in canon ---
check("loadRules returns file contents (trimmed) when the file reads", () => {
  const txt = loadRules({ read: () => "  RULE ONE\nRULE TWO  \n" });
  assert.equal(txt, "RULE ONE\nRULE TWO");
});

check("loadRules falls back to DEFAULT_RULES when the file is absent", () => {
  const txt = loadRules({
    read: () => {
      throw new Error("ENOENT");
    },
  });
  assert.equal(txt, DEFAULT_RULES);
});

check("loadRules falls back when the file is empty/whitespace", () => {
  const txt = loadRules({ read: () => "   \n  " });
  assert.equal(txt, DEFAULT_RULES);
});

// --- DEFAULT_RULES carries the load-bearing canon markers ---
check("DEFAULT_RULES carries the operator's repeated corrections", () => {
  assert.match(DEFAULT_RULES, /MM\/DD\/YYYY/, "date format rule missing");
  assert.match(DEFAULT_RULES, /ZIP-level/, "not-ZIP-only rule missing");
  assert.match(DEFAULT_RULES, /plain text/i, "plain-text rule missing");
  assert.match(DEFAULT_RULES, /invent/i, "no-invention rule missing");
  assert.match(DEFAULT_RULES, /chart/i, "chart rule missing");
});

// --- buildAdditionalContext: rules + pointers, TODAY conditional, no inlining ---
check("context contains the rules text verbatim", () => {
  const ctx = buildAdditionalContext({
    rulesText: "FIRST RULE\nSECOND RULE",
    todayExists: false,
  });
  assert.match(ctx, /FIRST RULE/);
  assert.match(ctx, /SECOND RULE/);
});

check("context points at every area CLAUDE.md dir", () => {
  const ctx = buildAdditionalContext({ rulesText: "x", todayExists: false });
  for (const dir of AREA_DIRS) {
    assert.ok(ctx.includes(dir), `missing area pointer: ${dir}`);
  }
});

check("context points at TODAY.md only when it exists, and never inlines it", () => {
  const withToday = buildAdditionalContext({ rulesText: "x", todayExists: true });
  assert.match(withToday, /_ASSISTANT\/TODAY\.md/, "should point at TODAY.md when present");
  const withoutToday = buildAdditionalContext({ rulesText: "x", todayExists: false });
  assert.ok(!/_ASSISTANT\/TODAY\.md/.test(withoutToday), "should not mention TODAY.md when absent");
});

check("context stays small (pointer, not paste) — well under the 10k cap", () => {
  const ctx = buildAdditionalContext({ rulesText: DEFAULT_RULES, todayExists: true });
  assert.ok(ctx.length < 4000, `context too large (${ctx.length} chars) — must point, not inline`);
});

// --- buildHookOutput: the exact UserPromptSubmit JSON contract ---
check("hook output is the verified UserPromptSubmit additionalContext shape", () => {
  const out = buildHookOutput({ rulesText: "RULE", todayExists: true });
  assert.equal(out.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.equal(typeof out.hookSpecificOutput.additionalContext, "string");
  assert.match(out.hookSpecificOutput.additionalContext, /RULE/);
  // No top-level `decision` — we never block a prompt.
  assert.equal(out.decision, undefined, "must never block the prompt");
});

check("hook output serializes to valid JSON under the 10k cap", () => {
  const out = buildHookOutput({ rulesText: DEFAULT_RULES, todayExists: true });
  const json = JSON.stringify(out);
  assert.ok(json.length < 10000, `output exceeds 10k char cap (${json.length})`);
  assert.deepEqual(JSON.parse(json), out);
});

// --- the LIVE rules file, not the fallback constant, is what actually ships ---
// Every size assertion above measures DEFAULT_RULES (7 rules, frozen in the hook).
// The text that actually reaches every prompt is _ASSISTANT/RULES.md, which is
// larger and still growing. Nothing asserted on it, so this suite stayed green
// no matter how big the real payload got — a test that measures a different
// object than the one that ships is not evidence about the one that ships.
// Found 07/21/2026 by the second-order agent auditing its own shipment.
const LIVE_RULES_URL = new URL("../../_ASSISTANT/RULES.md", import.meta.url);

check("LIVE _ASSISTANT/RULES.md actually loads (not silently the fallback)", () => {
  const txt = loadRules({ read: () => readFileSync(LIVE_RULES_URL, "utf8") });
  assert.notEqual(
    txt,
    DEFAULT_RULES,
    "live rules file did not load — every LIVE assertion below is measuring the fallback",
  );
});

check("LIVE rules keep the real hook output under the 10k cap", () => {
  const rulesText = loadRules({ read: () => readFileSync(LIVE_RULES_URL, "utf8") });
  const json = JSON.stringify(buildHookOutput({ rulesText, todayExists: true }));
  assert.ok(
    json.length < 10000,
    `LIVE output exceeds the 10k char cap (${json.length}) — trim _ASSISTANT/RULES.md`,
  );
});

check("LIVE rules still carry the second-order rule and its scope limit", () => {
  const rulesText = loadRules({ read: () => readFileSync(LIVE_RULES_URL, "utf8") });
  assert.match(rulesText, /second-order/, "the and-then-what rule was dropped from RULES.md");
  assert.match(rulesText, /SCOPE/, "the second-order rule lost its blast-radius scope limit");
});

console.log(`\n${fail === 0 ? "ALL GREEN ✅" : "FAILURES ❌"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
