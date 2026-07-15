// .claude/hooks/lib/ledger-parse.test.mjs
// Run: node .claude/hooks/lib/ledger-parse.test.mjs
import assert from "node:assert";
import { parseLedger, findOrphanedClaims } from "./ledger-parse.mjs";

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

const SAMPLE = `## Enforced
- Claim: reduced_amount is the SIZE OF THE CUT, not the old price
  Test: lib/deliverable/recipes/price-reduced.test.ts > "previous price = current + cut"
- Claim: the street address never leaks
  Test: lib/deliverable/recipes/coming-soon.test.ts > "the street address never ships"

## Unenforced (prose only — no test catches this yet)
- new-listing's "no chart" framing is guidance, not test-checked
`;

check("parseLedger reads every Enforced claim + its test file + test string", () => {
  const { enforced } = parseLedger(SAMPLE);
  assert.equal(enforced.length, 2);
  assert.equal(enforced[0].claim, "reduced_amount is the SIZE OF THE CUT, not the old price");
  assert.equal(enforced[0].testFile, "lib/deliverable/recipes/price-reduced.test.ts");
  assert.equal(enforced[0].testString, "previous price = current + cut");
});

check("parseLedger reads every Unenforced bullet as plain text", () => {
  const { unenforced } = parseLedger(SAMPLE);
  assert.equal(unenforced.length, 1);
  assert.match(unenforced[0], /no chart. framing is guidance/);
});

check("parseLedger on an empty/missing Unenforced section returns []", () => {
  const { unenforced } = parseLedger('## Enforced\n- Claim: x\n  Test: a.ts > "y"\n');
  assert.deepEqual(unenforced, []);
});

check("findOrphanedClaims flags a test file that no longer exists", () => {
  const enforced = [{ claim: "x", testFile: "gone.test.ts", testString: "y" }];
  const orphans = findOrphanedClaims(enforced, {
    readFile: () => {
      throw new Error("ENOENT");
    },
  });
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].reason, "missing-file");
});

check("findOrphanedClaims flags a test string no longer present in the file", () => {
  const enforced = [{ claim: "x", testFile: "a.test.ts", testString: "the old string" }];
  const orphans = findOrphanedClaims(enforced, {
    readFile: () => 'test("a different string", () => {});',
  });
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].reason, "missing-string");
});

check("findOrphanedClaims passes a claim whose string is present verbatim", () => {
  const enforced = [{ claim: "x", testFile: "a.test.ts", testString: "the real string" }];
  const orphans = findOrphanedClaims(enforced, {
    readFile: () => 'test("the real string", () => {});',
  });
  assert.equal(orphans.length, 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
