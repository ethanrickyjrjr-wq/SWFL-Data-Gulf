// .claude/hooks/push-touched-unit-coverage.test.mjs
// Run: node .claude/hooks/push-touched-unit-coverage.test.mjs
import assert from "node:assert";
import {
  matchPipelineDir,
  formatPipelineScope,
  buildAdditionalContext,
} from "./push-touched-unit-coverage.mjs";

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
    pass++;
  } catch (e) {
    console.log("  FAIL  " + name + " — " + e.message);
    fail++;
  }
}

check("matchPipelineDir extracts the dir from a pipeline.py path", () => {
  assert.equal(matchPipelineDir("ingest/pipelines/fred_g17/pipeline.py"), "fred_g17");
});

check("matchPipelineDir extracts the dir from a nested resources.py path", () => {
  assert.equal(matchPipelineDir("ingest/pipelines/fred_g17/resources.py"), "fred_g17");
});

check("matchPipelineDir returns null for a file outside ingest/pipelines/", () => {
  assert.equal(matchPipelineDir("lib/deliverable/recipes/price-reduced.ts"), null);
});

check("formatPipelineScope renders PULLED + AVAILABLE when both are researched", () => {
  const text = formatPipelineScope("fred_g17", {
    confirmedTotal: { summary: "Daily G17 series", source: "our ingest" },
    sourceCeiling: {
      summary: "Also has the monthly release",
      asOf: "07/08/2026",
      sourceUrl: null,
      sourceLabel: "FRED G17",
    },
  });
  assert.match(text, /PULLED: Daily G17 series/);
  assert.match(text, /AVAILABLE: Also has the monthly release/);
  assert.match(text, /07\/08\/2026/);
});

check("formatPipelineScope says so explicitly when source_scope isn't researched yet", () => {
  const text = formatPipelineScope("some_pipeline", { confirmedTotal: null, sourceCeiling: null });
  assert.match(text, /not yet researched/i);
});

check("buildAdditionalContext is null for a non-pipeline file (stay silent)", () => {
  const payload = { tool_input: { file_path: "lib/foo.ts" } };
  assert.equal(buildAdditionalContext(payload, { registryYaml: "pipelines:\n" }), null);
});

check("buildAdditionalContext pushes scope text for a registered pipeline touch", () => {
  const registryYaml = `pipelines:
  - name: fred_g17
    source_scope:
      confirmed_total:
        summary: "Daily G17 series"
        source: "our ingest"
`;
  const payload = { tool_input: { file_path: "ingest/pipelines/fred_g17/pipeline.py" } };
  const ctx = buildAdditionalContext(payload, { registryYaml });
  assert.match(ctx, /fred_g17/);
  assert.match(ctx, /PULLED: Daily G17 series/);
});

check("buildAdditionalContext is null for a pipeline dir not in the registry at all", () => {
  const payload = { tool_input: { file_path: "ingest/pipelines/not_registered/pipeline.py" } };
  const ctx = buildAdditionalContext(payload, { registryYaml: "pipelines:\n  - name: fred_g17\n" });
  assert.equal(ctx, null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
