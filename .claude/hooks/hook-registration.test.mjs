// hook-registration.test.mjs — a hook that is wired to nothing is not a guard.
//
// WHY THIS EXISTS. On 07/22/2026 the four-lane read gate shipped in ce163255, was
// "fixed" in 1ad4eb12 whose own subject reads "the four-lane gate never ran", was
// documented as a forcing function — and was registered in ZERO settings files the
// entire time. Neither commit touched .claude/settings.json. The unit tests passed
// because they import the pure helpers; the binary ran because it was executed by
// hand. Every narrow surface checked out. The system was wired to nothing.
//
// That failure is machine-detectable in one comparison: does each check-*.mjs
// basename appear in a hook command string in a settings file? This test runs in
// CI (.github/workflows/ci.yml runs `node --test .claude/hooks/*.test.mjs`), so
// the answer is checked at commit time instead of in an audit a week later.
//
// PARKED HOOKS ARE DECLARED, NOT SILENT. A hook can legitimately be unregistered —
// but it must say so here, with a reason. An undeclared unregistered hook fails.
// The exemption list is checked in the other direction too: an entry that IS
// registered, or names a file that no longer exists, fails as stale.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = join(HOOKS_DIR, "..", "..");
const SETTINGS = [".claude/settings.json", ".claude/settings.local.json"];

/**
 * Hooks deliberately not wired to any event. Key = basename, value = why.
 * Adding a line here is a decision on the record; leaving a hook out of both
 * this list and the settings files is the defect this test exists to catch.
 */
export const PARKED = {
  // Demands a .claude/build-context.md rewritten every 4h or it fails the turn.
  // That is a per-turn habit tax on every session (RULE 11) for an intake file
  // nothing else reads. Kept in-tree as a design worth revisiting; deliberately
  // never registered. If it is ever wired up, delete this line — this test will
  // then hold it to the same standard as every other gate.
  "check-build-context.mjs": "parked by design — 4h intake staleness gate, unused",
};

/** Every check-*.mjs in the hooks dir that is real runtime code (not a test). */
export function hookFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.startsWith("check-") && f.endsWith(".mjs") && !f.endsWith(".test.mjs"))
    .sort();
}

/** Every hook command string across a set of parsed settings objects. */
export function commandsFrom(settingsObjects) {
  const out = [];
  for (const s of settingsObjects) {
    for (const groups of Object.values(s?.hooks || {})) {
      for (const g of groups || []) {
        for (const h of g?.hooks || []) {
          if (typeof h?.command === "string") out.push(h.command);
        }
      }
    }
  }
  return out;
}

/**
 * THE CHECK. Pure, so it can be proven against fixtures rather than only against
 * a repo that currently happens to pass — the exact gap that let the four-lane
 * gate ship green.
 *
 * Returns { unregistered, staleExempt, missingFile }.
 */
export function auditRegistration(files, commands, parked = {}) {
  const isRegistered = (f) => commands.some((c) => c.includes(f));
  return {
    unregistered: files.filter((f) => !isRegistered(f) && !(f in parked)),
    staleExempt: Object.keys(parked).filter((f) => files.includes(f) && isRegistered(f)),
    missingFile: Object.keys(parked).filter((f) => !files.includes(f)),
  };
}

// ---- fixtures: prove the DETECTOR works, not just that today's repo passes ----

test("detects a hook that is registered nowhere — the ce163255 defect", () => {
  const r = auditRegistration(
    ["check-four-searches.mjs", "check-prepush-gate.mjs"],
    ["node .claude/hooks/check-prepush-gate.mjs"],
    {},
  );
  assert.deepEqual(r.unregistered, ["check-four-searches.mjs"]);
});

test("a declared parked hook is not reported", () => {
  const r = auditRegistration(["check-parked.mjs"], [], { "check-parked.mjs": "why" });
  assert.deepEqual(r.unregistered, []);
});

test("a parked hook that is actually registered is reported as stale", () => {
  const r = auditRegistration(["check-x.mjs"], ["node .claude/hooks/check-x.mjs"], {
    "check-x.mjs": "why",
  });
  assert.deepEqual(r.staleExempt, ["check-x.mjs"]);
});

test("a parked entry for a deleted file is reported", () => {
  const r = auditRegistration(["check-x.mjs"], [], { "check-gone.mjs": "why" });
  assert.deepEqual(r.missingFile, ["check-gone.mjs"]);
});

// ---- the live repo ----

test("every check-*.mjs in this repo is registered or declared parked", () => {
  const files = hookFiles(HOOKS_DIR);
  assert.ok(files.length > 5, "hook inventory looks empty — path wrong?");

  const objects = SETTINGS.map((p) => join(REPO, p))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, "utf8")));
  assert.ok(objects.length > 0, "no settings file found");

  const r = auditRegistration(files, commandsFrom(objects), PARKED);

  assert.deepEqual(
    r.unregistered,
    [],
    `Hook(s) wired to NOTHING: ${r.unregistered.join(", ")}\n` +
      `Register in .claude/settings.json, or declare in PARKED with a reason.`,
  );
  assert.deepEqual(r.staleExempt, [], `PARKED entry is actually registered: ${r.staleExempt}`);
  assert.deepEqual(r.missingFile, [], `PARKED entry names a missing file: ${r.missingFile}`);
});
