// Proof for the playbook index (NORTH STAR #3 — per-task-type scoped injection).
// Run: node --test .claude/hooks/lib/playbooks.test.mjs
//
// Shape stolen from cursor/plugins pstack (evaluated 08/30/2026,
// _RESEARCH/agent-behavior/2026-08-30-cursor-pstack-evaluation.md): one file per task
// type; the matched playbook's steps are copied VERBATIM as the first todo items; a
// skipped step stays listed with `skip: <reason>`. The MODEL classifies the task — the
// hook emits the same static index on every prompt. NO keyword router (inject-focus.mjs
// header: a topic router misfires constantly).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { LANES } from "../check-four-searches.mjs";
import {
  parsePlaybook,
  buildPlaybookIndex,
  buildHookOutput,
  PLAYBOOK_DIR,
  CONTRACT,
} from "./playbooks.mjs";

const GOOD = `---
name: bug-fix
for: a reported defect — reproduce, scope every site of its shape, fix all, prove it
---
### Bug fix
1. do a thing
**Reply:** what broke.
`;

test("parsePlaybook reads name + for from frontmatter", () => {
  const p = parsePlaybook(GOOD, "bug-fix.md");
  assert.deepEqual(p, {
    name: "bug-fix",
    for: "a reported defect — reproduce, scope every site of its shape, fix all, prove it",
    file: "bug-fix.md",
  });
});

// FAILURE MODE: a playbook file with no `for:` line would render as a blank index entry
// the model cannot route on. It is dropped from the index and named in `defects`.
test("parsePlaybook returns null when name or for is missing", () => {
  assert.equal(parsePlaybook("---\nname: x\n---\n### X\n", "x.md"), null);
  assert.equal(parsePlaybook("### no frontmatter at all\n", "y.md"), null);
});

test("buildPlaybookIndex lists every parseable playbook in filename order, pointer not paste", () => {
  const files = { "feature.md": GOOD.replace("bug-fix", "feature"), "bug-fix.md": GOOD };
  const out = buildPlaybookIndex({
    list: () => Object.keys(files),
    read: (f) => files[f],
  });
  assert.ok(out.startsWith(CONTRACT), "index opens with the verbatim contract");
  const lines = out.split("\n").filter((l) => l.startsWith("  "));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^  bug-fix — .* → \.claude\/playbooks\/bug-fix\.md$/);
  assert.match(lines[1], /^  feature — .* → \.claude\/playbooks\/feature\.md$/);
  assert.ok(!out.includes("1. do a thing"), "steps are POINTED at, never inlined");
});

// FAILURE MODE (inject-focus 07/25/2026 lesson): a silent degradation. A missing or
// unreadable playbook dir must not wedge the prompt (fail-open) — but it must SAY so.
test("buildPlaybookIndex fails open and loudly when the dir cannot be listed", () => {
  const out = buildPlaybookIndex({
    list: () => {
      throw new Error("ENOENT");
    },
    read: () => "",
  });
  assert.match(out, /PLAYBOOKS DEGRADED/);
});

test("buildPlaybookIndex names files it had to drop", () => {
  const out = buildPlaybookIndex({
    list: () => ["ok.md", "broken.md", "README.md"],
    read: (f) => (f === "ok.md" ? GOOD.replace("bug-fix", "ok") : "no frontmatter"),
  });
  assert.match(out, /dropped \(no name\/for frontmatter\): broken\.md/);
  assert.ok(!out.includes("README.md"), "README is not a playbook and is not a defect");
});

test("buildHookOutput is UserPromptSubmit additionalContext, nothing else", () => {
  const o = buildHookOutput({ list: () => ["a.md"], read: () => GOOD.replace("bug-fix", "a") });
  assert.equal(o.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.equal(Object.keys(o).length, 1, "no `decision` — the prompt always proceeds");
  assert.match(o.hookSpecificOutput.additionalContext, /a — /);
});

// --- the REAL playbooks: a shape lint so a half-written playbook cannot ship ---
const REAL_DIR = resolve(process.cwd(), PLAYBOOK_DIR);
function realPlaybooks() {
  // FAILURE MODE (second-order, 08/30/2026): the dir is untracked separately from the two
  // hook files; a partial stage lands in CI as a raw ENOENT throw. Name the fix instead.
  assert.ok(
    existsSync(REAL_DIR),
    `${PLAYBOOK_DIR} is missing — it must travel with inject-playbooks.mjs + lib/playbooks.mjs (stage all three)`,
  );
  return readdirSync(REAL_DIR).filter((f) => f.endsWith(".md") && f !== "README.md");
}

test("every real playbook has frontmatter, a heading, numbered steps, Rules carried, and a Reply line", () => {
  const dir = REAL_DIR;
  const files = realPlaybooks();
  assert.ok(files.length >= 8, `expected ≥8 playbooks, found ${files.length}`);
  for (const f of files) {
    const text = readFileSync(resolve(dir, f), "utf8");
    const p = parsePlaybook(text, f);
    assert.ok(p, `${f}: missing name/for frontmatter`);
    assert.equal(p.name, f.replace(/\.md$/, ""), `${f}: name must equal filename`);
    assert.match(text, /^### /m, `${f}: needs a ### heading`);
    assert.match(text, /^1\. /m, `${f}: needs numbered steps starting at 1.`);
    assert.match(
      text,
      /^\*\*Rules carried:\*\*/m,
      `${f}: needs a Rules carried line (the deletion map)`,
    );
    assert.match(text, /^\*\*Reply:\*\*/m, `${f}: needs a Reply line`);
    assert.ok(
      text.length < 4500,
      `${f}: ${text.length} chars — a playbook is a checklist, not a doc`,
    );
  }
});

// FAILURE MODE (second-order finding 1): data-question.md restates the four lanes as prose
// while inject-focus DERIVES its banner from LANES. Guard the copy against the root: every
// lane key must appear, uppercased, as a step label. Add a fifth lane → this goes red.
test("data-question.md names every lane in check-four-searches LANES", () => {
  const text = readFileSync(resolve(REAL_DIR, "data-question.md"), "utf8");
  for (const key of Object.keys(LANES)) {
    assert.match(
      text,
      new RegExp(`^\\d+\\. ${key.toUpperCase()} lane`, "m"),
      `missing ${key} lane step`,
    );
  }
});

// FAILURE MODE (second-order finding 2): playbooks cite "FOCUS n" ordinals; RULES.md is
// operator-edited. An ordinal past the live count is a dangling citation.
test("every FOCUS ordinal cited by a playbook exists in _ASSISTANT/RULES.md", () => {
  const rules = readFileSync(resolve(process.cwd(), "_ASSISTANT/RULES.md"), "utf8");
  const max = rules.split(/\r?\n/).filter((l) => /^\d+\. /.test(l)).length;
  assert.ok(max >= 7, `RULES.md looks wrong — only ${max} numbered rules`);
  for (const f of realPlaybooks()) {
    const text = readFileSync(resolve(REAL_DIR, f), "utf8");
    for (const m of text.matchAll(/FOCUS ([\d/]+)/g)) {
      for (const n of m[1].split("/")) {
        assert.ok(
          Number(n) >= 1 && Number(n) <= max,
          `${f}: cites FOCUS ${n}; RULES.md has ${max}`,
        );
      }
    }
  }
});

// FAILURE MODE (second-order finding 9): every 10k-char assertion is per-hook; the two
// injectors share one UserPromptSubmit turn. Measure the SUM on an armed data prompt.
test("inject-focus + inject-playbooks combined stay under the 10k additionalContext ceiling", () => {
  const payload = JSON.stringify({ prompt: "do we already have condo sold prices by zip?" });
  let total = 0;
  for (const h of ["inject-focus", "inject-playbooks"]) {
    const out = execSync(`node .claude/hooks/${h}.mjs`, { input: payload, encoding: "utf8" });
    total += JSON.parse(out).hookSpecificOutput.additionalContext.length;
  }
  assert.ok(total < 10000, `combined additionalContext is ${total} chars`);
});
