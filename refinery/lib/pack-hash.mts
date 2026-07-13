// refinery/lib/pack-hash.mts
//
// A BRAIN IS STALE WHEN ITS CODE CHANGES — not only when its data ages.
//
// The incident this exists to kill (07/13/2026, and it is a REPEAT):
//   · 07/10 — `isCoreScope` was applied to all 12 ZIP packs. Real fix, on main.
//   · The rebuild's freshness gate reads `refined_at` + `ttl_seconds` and nothing
//     else. housing-swfl was inside its TTL, so EVERY daily rebuild since said
//     "fresh — skip".
//   · Result: the brain artifact stayed frozen at its 06/29 build, still carrying
//     124 ZIPs including Bradenton, Sarasota and Port Charlotte — counties we do
//     not cover. Every downstream surface (the ZIP report, the emails, the
//     narrative bake) read that stale artifact for two weeks while the fix sat on
//     main doing nothing.
//
// A data-only TTL cannot see a code change, so a pack fix silently never ships.
// This hashes the pack's SOURCE and stamps it into the brain's frontmatter; the
// DAG's freshness check compares the stamp to the pack on disk and forces a
// rebuild when they diverge. Fix the code, the brain rebuilds. That's the contract.
//
// BACKWARD-COMPATIBLE BY DESIGN: a brain with NO stamp (every brain built before
// today) is left alone — it does NOT suddenly read as stale. Otherwise merging this
// would silently trigger a full 32-brain paid rebuild that nobody approved. Brains
// pick the stamp up as they rebuild, and self-invalidate from then on.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const PACKS_DIR = path.join(process.cwd(), "refinery", "packs");

/**
 * SHA-256 (first 12 chars) of a pack's source file. Null when the pack file can't
 * be read — an unreadable pack must never be treated as "changed" (that would
 * force an unbounded paid rebuild on an unrelated I/O blip). Fail-open, loudly
 * neutral.
 */
export function packSourceHash(brainId: string): string | null {
  try {
    const src = readFileSync(path.join(PACKS_DIR, `${brainId}.mts`), "utf-8");
    // Normalize line endings so a CRLF checkout doesn't read as a code change.
    const normalized = src.replace(/\r\n/g, "\n");
    return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

/**
 * Has the pack's code changed since this brain was built?
 *
 * `stamped` is the `pack_hash` from the brain's frontmatter (undefined for brains
 * built before this shipped). Returns false — "not changed" — whenever we cannot
 * prove otherwise, so this can only ever ADD a rebuild we can justify, never
 * trigger a surprise one.
 */
export function packCodeChanged(brainId: string, stamped: string | undefined | null): boolean {
  if (!stamped) return false; // pre-stamp brain — leave it to the TTL (see header)
  const current = packSourceHash(brainId);
  if (!current) return false; // can't read the pack — never force a rebuild on an I/O blip
  return current !== stamped;
}
