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

test("familyTranscriptFiles: payload transcript first, recent siblings follow, stale siblings dropped", () => {
  const dir = mkdtempSync(join(tmpdir(), "fence-"));
  const own = join(dir, "own.jsonl");
  const fresh = join(dir, "sibling-fresh.jsonl");
  const stale = join(dir, "sibling-stale.jsonl");
  const sub = join(dir, "subagents");
  mkdirSync(sub);
  const child = join(sub, "agent-1.jsonl");
  for (const p of [own, fresh, stale, child]) writeFileSync(p, "");
  const old = (Date.now() - 24 * 60 * 60 * 1000) / 1000;
  utimesSync(stale, old, old);

  const got = familyTranscriptFiles(own);
  assert.equal(got[0], own);
  assert.ok(got.includes(fresh), "fresh sibling missing");
  assert.ok(got.includes(child), "subagent transcript missing");
  assert.ok(!got.includes(stale), "stale sibling should be dropped");
});

test("familyShowsRead: the subagent-blindness fix — evidence in a SIBLING satisfies", () => {
  const dir = mkdtempSync(join(tmpdir(), "fence-"));
  const own = join(dir, "subagent.jsonl");
  const parent = join(dir, "parent.jsonl");
  writeFileSync(own, '{"message":{"content":[{"type":"text","text":"editing now"}]}}\n');
  writeFileSync(
    parent,
    '{"message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"C:\\\\r\\\\lib\\\\email\\\\CLAUDE.md"}}]}}\n',
  );
  assert.ok(familyShowsRead(own, docReadRe("lib/email/CLAUDE.md")));
  assert.ok(!familyShowsRead(own, docReadRe("ingest/CLAUDE.md")));
});
