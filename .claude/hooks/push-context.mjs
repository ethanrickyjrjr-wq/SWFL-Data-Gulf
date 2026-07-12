// ONE authority for "which repo is this push for?" — shared by every push hook.
//
// Root cause it kills (check answer_proof_hook_worktree_misscope, 07/12/2026):
// each push hook ran its git commands via execSync with NO cwd, i.e. in the MAIN
// checkout, even when the push command targeted a RULE 1.5 worktree
// (`git -C ../bp-x push`, `cd ../bp-x && git push`). The gate then judged OTHER
// sessions' unpushed main commits — on 07/12 it blocked a clean 4-file tripwire
// push because foreign lib/assistant commits sat unpushed on main.
//
// Resolution order:
//   1. base = hook payload `cwd` (the session cwd Claude Code reports), else
//      process.cwd()
//   2. the LAST `cd <dir>` that appears BEFORE the push segment, resolved
//      against base (handles `cd ../bp-x && git push` and safe-push runs)
//   3. a `-C <dir>` on the pushing git invocation itself, resolved against (2)
// A dir that does not exist falls back to base — a garbled parse must degrade
// to today's behavior, never crash the hook (they are fail-open by design).
import path from "node:path";
import fs from "node:fs";

// Git-Bash absolute paths (`/c/Users/...`) reach a win32 node as-is; translate
// so path.resolve doesn't glue them onto the current drive.
function msysToWin(p) {
  const m = /^\/([A-Za-z])\/(.*)$/.exec(p);
  return m && process.platform === "win32" ? `${m[1].toUpperCase()}:/${m[2]}` : p;
}

function unquote(arg) {
  return String(arg ?? "").replace(/^["']|["']$/g, "");
}

export function resolvePushCwd(payload) {
  const base = path.resolve(String(payload?.cwd || process.cwd()));
  const cmd = String(payload?.tool_input?.command ?? "");
  let dir = base;

  // Where the push segment starts (git push / safe-push) — cd's after it are
  // irrelevant to what got pushed.
  const pushMatch =
    /(?:^|\s|&&|;|\|\|)\s*git\s+(?:-C\s+(?:"[^"]*"|'[^']*'|\S+)\s+)?push(?=\s|$)/.exec(cmd) ??
    /safe-push(?:\.mjs)?\b/.exec(cmd);
  const pushIdx = pushMatch ? pushMatch.index : cmd.length;

  // Last `cd <dir>` before the push segment.
  const cdRe = /(?:^|&&|;|\|\|)\s*cd\s+("[^"]*"|'[^']*'|[^\s;&|]+)/g;
  let m;
  let cdArg = null;
  while ((m = cdRe.exec(cmd)) !== null) {
    if (m.index >= pushIdx) break;
    cdArg = unquote(m[1]);
  }
  if (cdArg) dir = path.resolve(dir, msysToWin(cdArg));

  // `git -C <dir> … push` within one shell segment (no ;/&&/| between).
  const cMatch = /git\s+-C\s+("[^"]*"|'[^']*'|[^\s;&|]+)[^;&|]*?\bpush\b/.exec(cmd);
  if (cMatch) dir = path.resolve(dir, msysToWin(unquote(cMatch[1])));

  if (dir !== base && !fs.existsSync(dir)) return base;
  return dir;
}
