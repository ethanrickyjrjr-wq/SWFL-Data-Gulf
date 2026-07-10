#!/usr/bin/env bun
// One-time spec-estate audit. Operator-run: bun scripts/audit-spec-estate.mts [--dry-run]
// Classifies every non-archived spec/plan via ONE Haiku Batches job (50% rates),
// metered through the wrapBatchesSurface seam (getAnthropic). Proposes git mv
// commands into the existing _archive/ dirs; MOVES NOTHING.
// Plan: docs/superpowers/plans/2026-07-10-chief-of-staff-nightly.md (Task 7)
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAnthropic } from "../refinery/agents/anthropic.mts";

const DIRS = ["docs/superpowers/specs", "docs/superpowers/plans"];
const MODEL = "claude-haiku-4-5";
const DRY = process.argv.includes("--dry-run");

type Doc = { dir: string; file: string; text: string };
const docs: Doc[] = DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((file) => ({ dir, file, text: readFileSync(join(dir, file), "utf8").slice(0, 24_000) })),
);
console.log(`audit: ${docs.length} docs`);
if (DRY) process.exit(0);

const client = getAnthropic("other");
const idMap = new Map<string, Doc>();
const requests = docs.map((d, i) => {
  const custom_id = `doc-${i}`; // ^[a-zA-Z0-9_-]{1,64}$ — paths need this map, not encoding
  idMap.set(custom_id, d);
  return {
    custom_id,
    params: {
      model: MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user" as const,
          content:
            `Classify this project doc as exactly one of LIVE | SHIPPED | SUPERSEDED-BY-<filename> | DEAD.\n` +
            `LIVE = describes work still in progress or not yet built. SHIPPED = the build it describes is done.\n` +
            `SUPERSEDED = a later doc replaced it (name the file if the text says so). DEAD = abandoned/irrelevant.\n` +
            `Reply as: <CLASS> — <one-line justification quoting the doc>\n\n` +
            `FILE: ${d.dir}/${d.file}\n\n${d.text}`,
        },
      ],
    },
  };
});

const batch = await client.messages.batches.create({ requests });
console.log(`audit: batch ${batch.id} submitted (${requests.length} requests)`);

let status = batch.processing_status;
while (status !== "ended") {
  await new Promise((r) => setTimeout(r, 60_000));
  status = (await client.messages.batches.retrieve(batch.id)).processing_status;
  console.log(`audit: ${status}`);
}

const rows: { path: string; klass: string; note: string }[] = [];
for await (const result of await client.messages.batches.results(batch.id)) {
  const d = idMap.get(result.custom_id);
  if (!d) continue;
  if (result.result.type !== "succeeded") {
    rows.push({ path: `${d.dir}/${d.file}`, klass: "ERROR", note: result.result.type });
    continue;
  }
  const text =
    result.result.message.content.find((b: { type: string }) => b.type === "text")?.text ?? "";
  const m = text.match(/^(LIVE|SHIPPED|SUPERSEDED-BY-\S+|DEAD)\s*—\s*(.*)$/m);
  rows.push({
    path: `${d.dir}/${d.file}`,
    klass: m?.[1] ?? "UNPARSED",
    note: (m?.[2] ?? text).slice(0, 200),
  });
}

mkdirSync("_ASSISTANT", { recursive: true });
writeFileSync("_ASSISTANT/spec-estate-audit.json", JSON.stringify(rows, null, 2));
const movable = rows.filter(
  (r) => r.klass === "SHIPPED" || r.klass === "DEAD" || r.klass.startsWith("SUPERSEDED"),
);
writeFileSync(
  "_ASSISTANT/spec-estate-audit.md",
  [
    `# Spec-estate audit — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `${rows.length} docs · ${movable.length} archive candidates. REVIEW BEFORE RUNNING ANY MOVE.`,
    ``,
    ...movable.map(
      (r) =>
        `- [ ] \`git mv ${r.path} ${r.path.replace(/\/([^/]+)$/, "/_archive/$1")}\` — ${r.klass}: ${r.note}`,
    ),
  ].join("\n"),
);
console.log(`audit: wrote _ASSISTANT/spec-estate-audit.{json,md} — ${movable.length} candidates`);
