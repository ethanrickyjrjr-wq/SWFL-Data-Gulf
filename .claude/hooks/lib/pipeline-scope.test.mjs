// .claude/hooks/lib/pipeline-scope.test.mjs
// Run: node .claude/hooks/lib/pipeline-scope.test.mjs
import assert from "node:assert";
import { extractSourceScope } from "./pipeline-scope.mjs";

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

const REGISTRY = `pipelines:
  - name: live_search_daily_mortgage
    workflow: live-search-daily.yml
    source_scope:
      confirmed_total:
        summary: "Daily 30-yr fixed mortgage rate (national), FRED MORTGAGE30US"
        source: "our ingest"
      source_ceiling:
        summary: "Same FRED release also carries MORTGAGE15US — confirmed live, zero new integration cost."
        as_of: "07/08/2026"
        source_url: "https://fred.stlouisfed.org/release?rid=190"
        source_label: "FRED — Mortgage Rates release"

  - name: fred_g17
    workflow: fred-g17.yml
    note: "no source_scope block on this one yet"
`;

check("extracts confirmed_total + source_ceiling for a real pipeline", () => {
  const scope = extractSourceScope(REGISTRY, "live_search_daily_mortgage");
  assert.equal(
    scope.confirmedTotal.summary,
    "Daily 30-yr fixed mortgage rate (national), FRED MORTGAGE30US",
  );
  assert.equal(scope.confirmedTotal.source, "our ingest");
  assert.equal(scope.sourceCeiling.asOf, "07/08/2026");
  assert.match(scope.sourceCeiling.summary, /MORTGAGE15US/);
});

check("returns nulls (not a throw) for a registered pipeline with no source_scope block", () => {
  const scope = extractSourceScope(REGISTRY, "fred_g17");
  assert.deepEqual(scope, { confirmedTotal: null, sourceCeiling: null });
});

check("returns null (whole result) for a dir not in the registry at all", () => {
  assert.equal(extractSourceScope(REGISTRY, "not_a_real_pipeline"), null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
