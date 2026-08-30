// Proof for the playbook read gate (PreToolUse Edit|Write).
// Run: node --test .claude/hooks/check-playbook-read-before-write.test.mjs
//
// The gate: code is not written in a session whose transcript family shows no real
// `Read` of a task playbook under .claude/playbooks/. Same evidence standard as
// check-playbook-read-before-email-edit.mjs and check-area-fence.mjs — a Read tool_use
// on the same transcript line as the path; Grep/Glob/narration never count.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  PLAYBOOK_READ_RE,
  isGovernedPath,
  decide,
  lineIsRealPlaybookRead,
  bashWriteTargets,
  governedTargets,
} from "./check-playbook-read-before-write.mjs";
import { PLAYBOOK_DIR } from "./lib/playbooks.mjs";
import { linesShowRead } from "./read-evidence.mjs";

const REAL_DIR = resolve(process.cwd(), PLAYBOOK_DIR);
const realExists = (name) => existsSync(resolve(REAL_DIR, `${name}.md`));

// --- what counts as a playbook read ---
test("PLAYBOOK_READ_RE matches a task playbook on either path shape", () => {
  assert.ok(
    PLAYBOOK_READ_RE.test("C:\\Users\\x\\dev\\brain-platform\\.claude\\playbooks\\bug-fix.md"),
  );
  assert.ok(PLAYBOOK_READ_RE.test("/home/x/brain-platform/.claude/playbooks/ship.md"));
  assert.ok(PLAYBOOK_READ_RE.test(".claude/playbooks/data-question.md"));
});

// FAILURE MODE: the README and the email playbook look like playbooks and are not.
test("PLAYBOOK_READ_RE rejects README.md and the email build playbook", () => {
  assert.ok(!PLAYBOOK_READ_RE.test(".claude/playbooks/README.md"));
  assert.ok(!PLAYBOOK_READ_RE.test("docs/standards/email-build-playbook.md"));
  assert.ok(!PLAYBOOK_READ_RE.test(".claude/playbooks/"));
});

// --- which writes are governed ---
test("code paths are governed; docs, config, tests, and the playbooks themselves are not", () => {
  assert.ok(isGovernedPath("lib/email/foo.ts"));
  assert.ok(isGovernedPath("C:\\x\\brain-platform\\.claude\\hooks\\new-hook.mjs"));
  assert.ok(isGovernedPath("ingest/pipelines/x/pipeline.py"));
  assert.ok(!isGovernedPath("CLAUDE.md"));
  assert.ok(!isGovernedPath(".claude/playbooks/feature.md"));
  assert.ok(!isGovernedPath(".claude/settings.json"));
  assert.ok(!isGovernedPath("lib/email/foo.test.ts"));
  assert.ok(!isGovernedPath("SESSION_LOG.md"));
  assert.ok(!isGovernedPath(""));
});

// --- transcript evidence, same line-scan rule as every other read gate ---
const READ_LINE =
  '{"message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:\\\\x\\\\.claude\\\\playbooks\\\\feature.md"}}]}}';
const GREP_LINE =
  '{"message":{"content":[{"type":"tool_use","name":"Grep","input":{"path":".claude/playbooks/feature.md","pattern":"Rules carried"}}]}}';
const NARRATION =
  '{"message":{"content":[{"type":"text","text":"I read .claude/playbooks/feature.md and copied the steps"}]}}';

test("a Read tool_use of a playbook is evidence", () => {
  assert.ok(linesShowRead([READ_LINE], PLAYBOOK_READ_RE));
});

// FAILURE MODE: skimming for a symbol, or SAYING you read it, is the failure shape.
test("Grep of a playbook and narration about reading it are NOT evidence", () => {
  assert.ok(!linesShowRead([GREP_LINE], PLAYBOOK_READ_RE));
  assert.ok(!linesShowRead([NARRATION], PLAYBOOK_READ_RE));
});

// --- the decision, pure ---
test("decide: ungoverned path passes without looking at evidence", () => {
  assert.equal(decide({ filePath: "docs/x.md", familyRead: () => false }), "pass");
});

test("decide: governed path with a playbook read in the family passes", () => {
  assert.equal(decide({ filePath: "lib/x.ts", familyRead: () => true }), "pass");
});

test("decide: governed path with no playbook read blocks", () => {
  assert.equal(decide({ filePath: "lib/x.ts", familyRead: () => false }), "block");
});

// FAILURE MODE: the evidence machinery throwing must never wedge a session.
test("decide: evidence error fails OPEN", () => {
  assert.equal(
    decide({
      filePath: "lib/x.ts",
      familyRead: () => {
        throw new Error("boom");
      },
    }),
    "pass",
  );
});

// --- second-order 08/30/2026, finding 1: a Read of a playbook that does NOT EXIST unlocked
// the session (the tool_use line is matched, never the tool result). Evidence must name a
// file on disk.
const readLine = (p) =>
  `{"message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":${JSON.stringify(p)}}}]}}`;

test("a Read of a REAL playbook is evidence; a typo'd or invented name is not", () => {
  assert.ok(lineIsRealPlaybookRead(readLine("C:\\x\\.claude\\playbooks\\ship.md"), realExists));
  assert.ok(lineIsRealPlaybookRead(readLine("/x/.claude/playbooks/bug-fix.md"), realExists));
  assert.ok(!lineIsRealPlaybookRead(readLine(".claude/playbooks/shp.md"), realExists));
  assert.ok(!lineIsRealPlaybookRead(readLine(".claude/playbooks/nonexistent-xyz.md"), realExists));
  assert.ok(!lineIsRealPlaybookRead(GREP_LINE, realExists));
  assert.ok(!lineIsRealPlaybookRead(NARRATION, realExists));
});

// finding 2: the suite never opened the directory. Every real playbook must be recognizable
// evidence — rename one and this goes red alongside the index lint.
test("every real playbook on disk is matched by PLAYBOOK_READ_RE and counts as evidence", () => {
  const files = readdirSync(REAL_DIR).filter((f) => f.endsWith(".md") && f !== "README.md");
  assert.ok(files.length >= 8, `found ${files.length}`);
  for (const f of files) {
    assert.ok(PLAYBOOK_READ_RE.test(`.claude/playbooks/${f}`), `${f} not matched`);
    assert.ok(lineIsRealPlaybookRead(readLine(`/repo/.claude/playbooks/${f}`), realExists), f);
  }
});

// finding 4: code written through Bash (heredoc, redirect, tee, sed -i) never reached the
// Edit|Write matcher. Name the write targets of a command.
test("bashWriteTargets finds redirect, append, tee, and sed -i targets", () => {
  assert.deepEqual(bashWriteTargets("cat > lib/x.ts <<'EOF'\nfoo\nEOF"), ["lib/x.ts"]);
  assert.deepEqual(bashWriteTargets("echo hi >> lib/y.mts"), ["lib/y.mts"]);
  assert.deepEqual(bashWriteTargets("printf x | tee lib/z.py"), ["lib/z.py"]);
  assert.deepEqual(bashWriteTargets("printf x | tee -a lib/z.py"), ["lib/z.py"]);
  assert.deepEqual(bashWriteTargets("sed -i 's/a/b/' lib/w.ts"), ["lib/w.ts"]);
  assert.deepEqual(bashWriteTargets('sed -i "s/a/b/" "lib/w w.ts"'), ["lib/w w.ts"]);
});

test("bashWriteTargets ignores reads, git, and non-write pipes", () => {
  assert.deepEqual(bashWriteTargets("node --test lib/x.test.mjs"), []);
  assert.deepEqual(bashWriteTargets("git mv a.ts b.ts"), []);
  assert.deepEqual(bashWriteTargets("cat lib/x.ts | head"), []);
  assert.deepEqual(bashWriteTargets(""), []);
  assert.deepEqual(bashWriteTargets("cmd 2>/dev/null"), [], "fd redirects are not file writes");
});

test("governedTargets: Edit/Write use file_path, Bash uses the command's code targets", () => {
  assert.deepEqual(governedTargets({ tool_name: "Write", tool_input: { file_path: "lib/a.ts" } }), [
    "lib/a.ts",
  ]);
  assert.deepEqual(
    governedTargets({ tool_name: "Edit", tool_input: { file_path: "docs/a.md" } }),
    [],
  );
  assert.deepEqual(
    governedTargets({
      tool_name: "Bash",
      tool_input: { command: "cat > lib/a.ts <<EOF\nx\nEOF; node --test lib/a.test.ts > out.txt" },
    }),
    ["lib/a.ts"],
  );
  assert.deepEqual(
    governedTargets({ tool_name: "Bash", tool_input: { command: "ls > /tmp/listing.txt" } }),
    [],
  );
});

// finding 5: FULL-SCOPE-FIRST's own artifact is a yaml write and yaml is exempt by the area
// fence's line. The registry is governed here regardless.
test("ingest/cadence_registry.yaml is governed despite the yaml exemption", () => {
  assert.ok(isGovernedPath("ingest/cadence_registry.yaml"));
  assert.ok(isGovernedPath("C:\\x\\brain-platform\\ingest\\cadence_registry.yaml"));
  assert.ok(!isGovernedPath("ingest/other.yaml"));
});
