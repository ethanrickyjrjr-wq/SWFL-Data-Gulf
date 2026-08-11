// lib/testing/mock-restore-ratchet.test.ts — the guard STRIKES.md owed for
// "green-locally-red-in-ci-mock-leak" (3 strikes; built 08/11/2026).
//
// bun's mock.module is PROCESS-GLOBAL and never auto-restored: a test file that
// wholesale-mocks an in-repo module poisons every file that runs AFTER it in the
// same `bun test` process. File order differs between Windows (local) and Linux
// (CI), so the poisoned victim differs too — which is exactly how CI stayed red
// on lib/email/sequence/__tests__/frozen-occurrence.test.ts for 11+ runs on
// 08/11/2026 while every local run was green (leaker: app/api/agent/build/
// route.test.ts mocking @/lib/email/doc/default-docs with no restore).
//
// THE RULE THIS ENFORCES: any test file that calls mock.module() on an in-repo
// specifier (@/… or a relative path) must hand the REAL module back in afterAll.
// The idiom (see lib/deliverable/recipes/agent-brand-intro.test.ts or
// app/api/agent/build/route.test.ts):
//
//   const realFoo = { ...(await import("@/lib/foo")) };   // BEFORE mocking
//   afterAll(() => { mock.module("@/lib/foo", () => realFoo); });
//   mock.module("@/lib/foo", () => ({ ...stub }));
//
// This is a RATCHET: the whitelist below is the 45 offenders that existed when
// the guard shipped. New offenders fail. A whitelisted file that gets fixed (or
// deleted) also fails, with instructions to remove its entry — the list only
// ever shrinks.

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");

// Detection heuristic (same one used for the shipping sweep): the file installs
// a mock for an in-repo module and never mentions afterAll. `afterAll` presence
// is a weak proxy for a real restore — good enough to ratchet on; the per-file
// fix is the snapshot idiom above, not a decorative afterAll.
const MOCKS_IN_REPO_MODULE = /mock\.module\(\s*["'](@\/|\.{1,2}\/)/;
const HAS_AFTER_ALL = /\bafterAll\b/;

const WHITELIST = new Set([
  "lib/agent-build/persist.test.ts",
  "lib/agent-feed/test-inject-source.test.ts",
  "lib/agent-feed/transitions-source.test.ts",
  "lib/api-tokens/scopes.test.ts",
  "lib/brand/bio-tokens.test.ts",
  "lib/claim/claim-store.test.ts",
  "lib/deliverable/factuality-grader.test.ts",
  "lib/email/build-usage.test.ts",
  "lib/email/zip-seed.test.ts",
  "lib/email/__tests__/usage.test.ts",
  "lib/highlighter/meter-userid.test.ts",
  "lib/highlighter/report-grounding.test.ts",
  "lib/identity/mcp-connected.test.ts",
  "lib/landing/load-home-map-data.test.ts",
  "app/api/agent-feed/test-inject/route.test.ts",
  "app/api/agent-feed/transitions/route.test.ts",
  "app/api/charts/save/route.test.ts",
  "app/api/claim/route.test.ts",
  "app/api/contacts/import/route.test.ts",
  "app/api/contacts/route.test.ts",
  "app/api/deliverables/[id]/edit/route.test.ts",
  "app/api/deliverables/[id]/pdf/route.test.ts",
  "app/api/deliverables/[id]/refresh/route.test.ts",
  "app/api/deliverables/[id]/restyle/route.test.ts",
  "app/api/deliverables/[id]/trash/route.test.ts",
  "app/api/lab/claim-and-send/route.test.ts",
  "app/api/listings/import/route.test.ts",
  "app/api/mcp/project-tools.test.ts",
  "app/api/me/route.test.ts",
  "app/api/mls/connect/route.test.ts",
  "app/api/mls/disconnect/route.test.ts",
  "app/api/mls/sync/route.test.ts",
  "app/api/projects/assemble/route.test.ts",
  "app/api/projects/import/route.test.ts",
  "app/api/projects/route.test.ts",
  "app/api/projects/[id]/route.test.ts",
  "app/api/prospect/open-project/route.test.ts",
  "app/api/social/connect/[platform]/callback/route.test.ts",
  "app/api/social/connect/[platform]/disconnect/route.test.ts",
  "app/api/social/post-now/route.test.ts",
  "app/api/user/brand/route.test.ts",
  "app/c/[id]/card/route.test.ts",
  "app/p/[id]/print/route.test.ts",
  "app/r/communities-swfl/n/[neighborhood]/page.test.tsx",
  "app/r/communities-swfl/[community]/page.test.tsx",
]);

async function scan(): Promise<{ offenders: string[]; cleaned: string[] }> {
  const glob = new Glob("{lib,app,components,refinery,scripts}/**/*.test.{ts,tsx,mts}");
  const offending = new Set<string>();
  for await (const rel of glob.scan({ cwd: ROOT })) {
    const posix = rel.replaceAll("\\", "/");
    const src = await Bun.file(join(ROOT, rel)).text();
    if (MOCKS_IN_REPO_MODULE.test(src) && !HAS_AFTER_ALL.test(src)) offending.add(posix);
  }
  return {
    offenders: [...offending].filter((f) => !WHITELIST.has(f)).sort(),
    cleaned: [...WHITELIST].filter((f) => !offending.has(f)).sort(),
  };
}

describe("mock.module restore ratchet", () => {
  test("no NEW test file wholesale-mocks an in-repo module without an afterAll restore", async () => {
    const { offenders } = await scan();
    expect(
      offenders,
      `These test files call mock.module() on an in-repo module with no afterAll restore. ` +
        `bun mocks are process-global — this WILL poison other files in CI's file order ` +
        `even when your local run is green. Snapshot the real module before mocking and ` +
        `restore it in afterAll (idiom at top of ${import.meta.path}).`,
    ).toEqual([]);
  });

  test("the whitelist only shrinks — fixed or deleted files come off the list", async () => {
    const { cleaned } = await scan();
    expect(
      cleaned,
      `These whitelisted files no longer offend (fixed or deleted). Remove them from ` +
        `WHITELIST in ${import.meta.path} so the ratchet can never regress.`,
    ).toEqual([]);
  });
});
