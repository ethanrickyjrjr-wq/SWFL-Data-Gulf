// Proof the push hooks judge the repo the push actually targets.
// Root cause of check answer_proof_hook_worktree_misscope: every push hook ran
// git via execSync with NO cwd, so a worktree push (`git -C ../bp-x push`, RULE
// 1.5 finish) was judged against the MAIN checkout's unpushed foreign commits.
// Run: node .claude/hooks/push-context.test.mjs
import assert from "node:assert";
import path from "node:path";
import { resolvePushCwd } from "./push-context.mjs";

const ROOT = process.cwd(); // repo root when run from the checkout
const HOOKS = path.resolve(ROOT, ".claude", "hooks");

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

function payload(command, cwd = ROOT) {
  return { cwd, tool_input: { command } };
}

check("plain `git push` resolves to the payload cwd", () => {
  assert.equal(resolvePushCwd(payload("git push")), path.resolve(ROOT));
});

check("no payload cwd falls back to process.cwd()", () => {
  assert.equal(
    resolvePushCwd({ tool_input: { command: "git push" } }),
    path.resolve(process.cwd()),
  );
});

check("`cd <dir> && git push` resolves relative to the payload cwd", () => {
  assert.equal(resolvePushCwd(payload("cd .claude/hooks && git push")), HOOKS);
});

check("`git -C <dir> push` resolves the -C dir", () => {
  assert.equal(resolvePushCwd(payload("git -C .claude/hooks push origin HEAD:main")), HOOKS);
});

check("cd then relative -C composes", () => {
  assert.equal(resolvePushCwd(payload("cd .claude && git -C hooks push origin HEAD:main")), HOOKS);
});

check("a cd AFTER the push does not count", () => {
  assert.equal(resolvePushCwd(payload("git push && cd .claude/hooks")), path.resolve(ROOT));
});

check("-C on an earlier non-push git command does not count", () => {
  assert.equal(
    resolvePushCwd(payload("git -C .claude/hooks log --oneline && git push")),
    path.resolve(ROOT),
  );
});

check("safe-push via cd is scoped to the cd dir", () => {
  assert.equal(
    resolvePushCwd(payload("cd .claude/hooks && node ../../scripts/safe-push.mjs")),
    HOOKS,
  );
});

check("quoted cd path with spaces parses", () => {
  // Target exists (repo root via quoted absolute path).
  assert.equal(resolvePushCwd(payload(`cd "${ROOT}" && git push`, HOOKS)), path.resolve(ROOT));
});

check("msys-style absolute path translates on win32", () => {
  const msys = "/" + ROOT[0].toLowerCase() + "/" + ROOT.slice(3).replaceAll("\\", "/");
  if (process.platform !== "win32") return; // translation is a win32 concern
  assert.equal(resolvePushCwd(payload(`cd ${msys} && git push`, HOOKS)), path.resolve(ROOT));
});

check("a resolved dir that does not exist falls back to the base cwd", () => {
  assert.equal(
    resolvePushCwd(payload("cd ../definitely-not-a-worktree-dir && git push")),
    path.resolve(ROOT),
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
