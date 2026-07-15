// .claude/hooks/push-touched-unit-coverage.test.mjs
// Run: node .claude/hooks/push-touched-unit-coverage.test.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  matchPipelineDir,
  formatPipelineScope,
  buildAdditionalContext,
  matchRecipeUnit,
  formatLedgerSummary,
  coldStartNudge,
  RECIPE_KEYS,
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

check("matchRecipeUnit extracts the recipe key from its source file", () => {
  assert.equal(matchRecipeUnit("lib/deliverable/recipes/price-reduced.ts"), "price-reduced");
});

check("matchRecipeUnit extracts the recipe key when its OWN ledger file is touched", () => {
  assert.equal(matchRecipeUnit("lib/deliverable/recipes/price-reduced.ledger.md"), "price-reduced");
});

check("matchRecipeUnit returns null for shared.ts (not a recipe key itself)", () => {
  assert.equal(matchRecipeUnit("lib/deliverable/recipes/shared.ts"), null);
});

check("matchRecipeUnit returns null for an unrelated file", () => {
  assert.equal(matchRecipeUnit("lib/foo.ts"), null);
});

check("formatLedgerSummary renders the Enforced summary + full Unenforced list", () => {
  const text = formatLedgerSummary("price-reduced", {
    enforced: [
      { claim: "cut is from the most recent price", testFile: "x.test.ts", testString: "y" },
    ],
    unenforced: ["something still running on hope"],
  });
  assert.match(text, /Enforced \(1\)/);
  assert.match(text, /cut is from the most recent price/);
  assert.match(text, /Unenforced/);
  assert.match(text, /something still running on hope/);
});

check("formatLedgerSummary says so when Unenforced is empty (fully protected)", () => {
  const text = formatLedgerSummary("coming-soon", {
    enforced: [{ claim: "x", testFile: "a", testString: "b" }],
    unenforced: [],
  });
  assert.match(text, /no unenforced claims/i);
});

check("coldStartNudge names the unit and the would-be ledger path", () => {
  const text = coldStartNudge("just-sold", "lib/deliverable/recipes/just-sold.ledger.md");
  assert.match(text, /No coverage ledger yet for `just-sold`/);
  assert.match(text, /lib\/deliverable\/recipes\/just-sold\.ledger\.md/);
});

check("buildAdditionalContext pushes the ledger summary when a ledger file exists", () => {
  const payload = { tool_input: { file_path: "lib/deliverable/recipes/price-reduced.ts" } };
  const ledgerMd = `## Enforced\n- Claim: cut is from the most recent price\n  Test: lib/deliverable/recipes/price-reduced.test.ts > "previous price = current + cut"\n\n## Unenforced\n`;
  const ctx = buildAdditionalContext(payload, {
    registryYaml: "",
    ledgerExists: true,
    readLedger: () => ledgerMd,
  });
  assert.match(ctx, /Enforced \(1\)/);
});

check("buildAdditionalContext pushes the cold-start nudge when no ledger exists yet", () => {
  const payload = { tool_input: { file_path: "lib/deliverable/recipes/just-sold.ts" } };
  const ctx = buildAdditionalContext(payload, {
    registryYaml: "",
    ledgerExists: false,
    readLedger: () => "",
  });
  assert.match(ctx, /No coverage ledger yet/);
});

// DRIFT GUARD (Gate-5 mirror pattern — catalog.test.mts mirrors PER_PACK_REGISTRY the same
// way): RECIPE_KEYS is hardcoded here because this hook runs under plain `node`, which cannot
// import a .ts module — but that makes it copy #2 of lib/deliverable/recipes.ts's RECIPE_KEYS,
// the exact shared-concept-drift shape this whole mechanism exists to catch. Read recipes.ts as
// TEXT (same non-parse convention as pipeline-scope.mjs) and assert equality every run.
check(
  "RECIPE_KEYS mirrors lib/deliverable/recipes.ts's RECIPE_KEYS, minus the 2 social keys",
  () => {
    const recipesSrc = readFileSync(
      path.resolve(process.cwd(), "lib/deliverable/recipes.ts"),
      "utf8",
    );
    const m = /export const RECIPE_KEYS = \[([\s\S]*?)\] as const;/.exec(recipesSrc);
    assert.ok(
      m,
      "RECIPE_KEYS array literal not found in recipes.ts — has it moved or been renamed?",
    );
    const allKeys = [...m[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1]);
    const nonSocial = allKeys.filter((k) => k !== "social-pack" && k !== "social-cut");
    assert.deepEqual([...RECIPE_KEYS].sort(), nonSocial.sort());
  },
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
