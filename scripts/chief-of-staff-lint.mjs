#!/usr/bin/env node
// Deterministic brief validator. Exit 0 = safe to post; exit 1 = do NOT post.
// Usage: node scripts/chief-of-staff-lint.mjs --brief chief-of-staff-brief.md --evidence evidence.json
import { readFileSync, writeFileSync } from "node:fs";
import { lintBrief, expandBriefRefs } from "./chief-of-staff-lib.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : dflt;
}

const briefPath = arg("--brief", "chief-of-staff-brief.md");
const brief = readFileSync(briefPath, "utf8");
const pack = JSON.parse(readFileSync(arg("--evidence", "evidence.json"), "utf8"));

const { ok, errors } = lintBrief(brief, pack);
if (!ok) {
  console.error("lint: brief REJECTED — nothing will post");
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}
// Refs (c1, c2, ...) are what the model cited; expand to real SHAs before this
// ever reaches a human — the "Post brief" step reads this same file verbatim.
writeFileSync(briefPath, expandBriefRefs(brief, pack));
console.log("lint: brief OK — refs expanded to SHAs");
