// .claude/hooks/lib/ledger-parse.mjs
// Pure parser for a unit's `.ledger.md` — two required sections only, per
// docs/superpowers/specs/2026-07-15-per-unit-coverage-ledgers-design.md §2.
// No fs/network here — every function takes text/callbacks so both the
// push hook (Task 4) and Gate 9 (Task 5) can unit-test their callers without
// a real filesystem or `git show`.

const ENFORCED_HDR = /^##\s*Enforced\s*$/m;
const UNENFORCED_HDR = /^##\s*Unenforced\b/m;
const CLAIM_RE = /^-\s*Claim:\s*(.+)$/;
const TEST_RE = /^\s*Test:\s*(.+?)\s*>\s*"(.+)"\s*$/;

/** Split `.ledger.md` markdown into its two sections. Never throws — a
 *  malformed file just yields empty arrays (fail open; Gate 9 treats an
 *  empty Enforced list as "nothing to check", not an error). */
export function parseLedger(markdown) {
  const text = String(markdown ?? "");
  const enforced = [];
  const unenforced = [];

  const enforcedStart = text.search(ENFORCED_HDR);
  const unenforcedStart = text.search(UNENFORCED_HDR);
  if (enforcedStart !== -1) {
    const end = unenforcedStart !== -1 ? unenforcedStart : text.length;
    const block = text.slice(enforcedStart, end).split("\n");
    let pendingClaim = null;
    for (const line of block) {
      const claimMatch = CLAIM_RE.exec(line);
      if (claimMatch) {
        pendingClaim = claimMatch[1].trim();
        continue;
      }
      const testMatch = TEST_RE.exec(line);
      if (testMatch && pendingClaim) {
        enforced.push({
          claim: pendingClaim,
          testFile: testMatch[1].trim(),
          testString: testMatch[2],
        });
        pendingClaim = null;
      }
    }
  }

  if (unenforcedStart !== -1) {
    const block = text.slice(unenforcedStart).split("\n");
    for (const line of block) {
      const m = /^-\s*(.+)$/.exec(line);
      if (m && !/^\[none/i.test(m[1].trim())) unenforced.push(m[1].trim());
    }
  }

  return { enforced, unenforced };
}

/** Given parsed Enforced entries, return every claim whose test file or test
 *  string can't be found. `readFile(path)` throws on a missing file — the
 *  caller decides HOW to read (working tree vs `git show HEAD:`). */
export function findOrphanedClaims(enforced, { readFile }) {
  const orphans = [];
  for (const entry of enforced) {
    let content;
    try {
      content = readFile(entry.testFile);
    } catch {
      orphans.push({ ...entry, reason: "missing-file" });
      continue;
    }
    if (!String(content).includes(entry.testString)) {
      orphans.push({ ...entry, reason: "missing-string" });
    }
  }
  return orphans;
}
