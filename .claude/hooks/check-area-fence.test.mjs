// check-area-fence.test.mjs — pure-helper proof for the area fence, plus the shared
// read-evidence root it and the playbook hook both stand on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AREAS, isExemptPath, areaFor, docReadRe } from "./check-area-fence.mjs";
import { linesShowRead, familyTranscriptFiles, familyShowsRead } from "./read-evidence.mjs";

test("the registry mirrors the FOCUS list — eight areas, each with its own doc", () => {
  assert.equal(AREAS.length, 8);
  for (const a of AREAS) assert.ok(a.doc.startsWith(a.prefix), `${a.doc} outside ${a.prefix}`);
});

test("areaFor: governed paths map to their area, lookalikes do not", () => {
  assert.equal(areaFor("lib/email/render.ts")?.doc, "lib/email/CLAUDE.md");
  assert.equal(areaFor("lib/email/social/platforms.ts")?.doc, "lib/email/CLAUDE.md");
  assert.equal(areaFor("app/api/assistant/route.ts")?.doc, "app/api/CLAUDE.md");
  assert.equal(areaFor("refinery/packs/master.mts")?.doc, "refinery/packs/CLAUDE.md");
  assert.equal(areaFor("lib/emailer/render.ts"), null); // prefix requires the slash
  assert.equal(areaFor("refinery/stages/1-x.mts"), null); // packs only, not all of refinery
  assert.equal(areaFor("components/Nav.tsx"), null);
});

test("areaFor tolerates absolute Windows paths", () => {
  const p = "C:\\Users\\e\\dev\\brain-platform\\scripts\\email\\render-open-house.mts";
  assert.equal(areaFor(p)?.doc, "scripts/CLAUDE.md");
});

test("isExemptPath: docs, config and tests pass free; code does not", () => {
  assert.ok(isExemptPath("lib/email/CLAUDE.md"));
  assert.ok(isExemptPath("ingest/cadence_registry.yaml"));
  assert.ok(isExemptPath("lib/deliverable/cell-policy.test.ts"));
  assert.ok(isExemptPath(""));
  assert.ok(!isExemptPath("lib/deliverable/cell-policy.ts"));
  assert.ok(!isExemptPath("ingest/pipelines/geo_ladder.py"));
});

test("docReadRe matches the doc path in raw JSONL — both separator shapes", () => {
  const re = docReadRe("lib/email/CLAUDE.md");
  // Windows transcript: JSON-escaped backslashes appear as two literal chars.
  assert.ok(
    re.test(
      '{"name":"Read","input":{"file_path":"C:\\\\x\\\\lib\\\\email\\\\CLAUDE.md"}}'.replace(
        /\\\\/g,
        "\\\\",
      ),
    ),
  );
  assert.ok(re.test('"file_path":"/home/x/lib/email/CLAUDE.md"'));
  assert.ok(!re.test('"file_path":"lib/social/CLAUDE.md"'));
});

test("linesShowRead: a Read call line counts; a tool_result mention does not", () => {
  const re = docReadRe("lib/email/CLAUDE.md");
  const readLine =
    '{"message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"lib/email/CLAUDE.md"}}]}}';
  const resultLine =
    '{"message":{"content":[{"type":"tool_result","content":"see lib/email/CLAUDE.md"}]}}';
  assert.ok(linesShowRead([readLine], re));
  assert.ok(!linesShowRead([resultLine], re));
  assert.ok(!linesShowRead([], re));
});

// SESSION-STRICT REWRITE (08/19/2026). The two tests below previously pinned the
// "any recent sibling counts" behavior — the accepted-on-record over-credit that
// MEASURED-FAILED the same week it shipped: two parallel peers' playbook reads
// satisfied the email gate for a session that had never opened it. The contract
// now (read-evidence.mjs header + read-evidence.test.mjs): evidence is vertical —
// own transcript, own subagents (./<stem>/*.jsonl), and for a subagent payload its
// controller — never a top-level peer, no matter how fresh.
test("familyTranscriptFiles: own subagents count (stale dropped); top-level peers NEVER do", () => {
  const dir = mkdtempSync(join(tmpdir(), "fence-"));
  const own = join(dir, "own.jsonl");
  const peer = join(dir, "sibling-fresh.jsonl");
  const sub = join(dir, "own"); // the payload session's OWN subagent folder
  mkdirSync(sub);
  const child = join(sub, "agent-1.jsonl");
  const staleChild = join(sub, "agent-stale.jsonl");
  for (const p of [own, peer, child, staleChild]) writeFileSync(p, "");
  const old = (Date.now() - 24 * 60 * 60 * 1000) / 1000;
  utimesSync(staleChild, old, old);

  const got = familyTranscriptFiles(own);
  assert.equal(got[0], own);
  assert.ok(got.includes(child), "own subagent transcript missing");
  assert.ok(!got.includes(peer), "peer session credited — the 08/19 measured failure");
  assert.ok(!got.includes(staleChild), "stale subagent should be dropped");
});

test("familyShowsRead: the subagent-blindness fix — the CONTROLLER's read satisfies its subagent", () => {
  const dir = mkdtempSync(join(tmpdir(), "fence-"));
  const sub = join(dir, "parent"); // subagent transcripts live in ./<controller-stem>/
  mkdirSync(sub);
  const own = join(sub, "subagent.jsonl");
  const controller = join(dir, "parent.jsonl");
  const peer = join(dir, "peer.jsonl");
  const readLine =
    '{"message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:\\\\r\\\\lib\\\\email\\\\CLAUDE.md"}}]}}\n';
  writeFileSync(own, '{"message":{"content":[{"type":"text","text":"editing now"}]}}\n');
  writeFileSync(controller, readLine);
  writeFileSync(peer, readLine.replace(/email/g, "ingest"));
  assert.ok(familyShowsRead(own, docReadRe("lib/email/CLAUDE.md")), "controller read must count");
  // The peer holds the ingest read — it must NOT leak into this subagent's evidence.
  assert.ok(!familyShowsRead(own, docReadRe("ingest/CLAUDE.md")), "peer read must not count");
});
