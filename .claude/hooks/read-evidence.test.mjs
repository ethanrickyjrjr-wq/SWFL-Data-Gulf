// read-evidence.test.mjs — SESSION-STRICT family evidence (08/19/2026).
// Run: node --test .claude/hooks/read-evidence.test.mjs
//
// Born from a measured gate failure, same day: this session edited
// lib/deliverable/recipes/price-reduced.ts WITHOUT ever reading the email build
// playbook, and check-playbook-read-before-email-edit stayed silent — because
// familyTranscriptFiles credited "recent .jsonl siblings" and TWO PARALLEL PEER
// sessions (measured: 08042478…, 21b37572…) had read the playbook within the
// 8-hour window. The 08/18 subagent fix had quietly widened "this session read
// it" into "anyone in the building read it today", which is a no-op in exactly
// the multi-session workflow the operator runs — and it swallowed his 08/05
// "use the god damn playbook" gate whole.
//
// The contract these tests pin:
//   • a MAIN session's evidence = its own transcript + its OWN subagents'
//     transcripts (the ./<session-id>/ subfolder) — NEVER a peer's top-level file;
//   • a SUBAGENT's evidence = its own transcript + its controller's
//     (../<subdir-name>.jsonl) + same-subdir siblings — NEVER the controller's peers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { familyTranscriptFiles, familyShowsRead } from "./read-evidence.mjs";

const READ_LINE = JSON.stringify({
  message: {
    content: [
      {
        type: "tool_use",
        name: "Read",
        input: { file_path: "docs/standards/email-build-playbook.md" },
      },
    ],
  },
});

function fixture() {
  // Mimics the project transcript dir: one .jsonl per session + per-session subdirs.
  const root = mkdtempSync(join(tmpdir(), "read-evidence-"));
  mkdirSync(join(root, "session-a"), { recursive: true });
  mkdirSync(join(root, "session-b"), { recursive: true });
  writeFileSync(join(root, "session-a.jsonl"), "{}\n"); // our session — no playbook read
  writeFileSync(join(root, "session-b.jsonl"), READ_LINE + "\n"); // PEER — read it
  writeFileSync(join(root, "session-a", "agent-1.jsonl"), "{}\n"); // our own subagent
  writeFileSync(join(root, "session-b", "agent-9.jsonl"), READ_LINE + "\n"); // peer's subagent
  return root;
}

test("a main session never inherits a peer session's transcript as evidence", () => {
  const root = fixture();
  const fam = familyTranscriptFiles(join(root, "session-a.jsonl")).map((p) =>
    p.replace(/\\/g, "/"),
  );
  assert.equal(
    fam.some((p) => p.endsWith("session-b.jsonl")),
    false,
    `peer top-level file credited: ${fam.join(", ")}`,
  );
  assert.equal(
    fam.some((p) => p.endsWith("session-b/agent-9.jsonl")),
    false,
    `peer subagent credited: ${fam.join(", ")}`,
  );
  // …but its OWN subagent transcripts DO count (the real 08/18 problem, kept fixed).
  assert.equal(
    fam.some((p) => p.endsWith("session-a/agent-1.jsonl")),
    true,
    `own subagent missing: ${fam.join(", ")}`,
  );
});

test("a subagent inherits its controller and subdir siblings — not the controller's peers", () => {
  const root = fixture();
  const fam = familyTranscriptFiles(join(root, "session-a", "agent-1.jsonl")).map((p) =>
    p.replace(/\\/g, "/"),
  );
  assert.equal(
    fam.some((p) => p.endsWith("session-a.jsonl")),
    true,
    `controller missing: ${fam.join(", ")}`,
  );
  assert.equal(
    fam.some((p) => p.endsWith("session-b.jsonl")),
    false,
    `controller's peer credited: ${fam.join(", ")}`,
  );
});

test("the measured 08/19 failure can no longer happen: a peer's read is not our read", () => {
  const root = fixture();
  assert.equal(familyShowsRead(join(root, "session-a.jsonl"), /email-build-playbook\.md/i), false);
  // The peer itself, asked about its own transcript, still passes.
  assert.equal(familyShowsRead(join(root, "session-b.jsonl"), /email-build-playbook\.md/i), true);
});
