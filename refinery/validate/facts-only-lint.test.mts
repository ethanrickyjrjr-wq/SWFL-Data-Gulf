import { test } from "bun:test";
import assert from "node:assert/strict";
import { lintFactsOnly, isQuotedSourceLine } from "./facts-only-lint.mts";

/** Wrap an OUTPUT JSON body in a minimal ```reference fence. */
function wrap(outputJson: string): string {
  return ["```reference", outputJson, "```"].join("\n");
}

test("a missing reference fence is not the linter's problem", () => {
  assert.deepEqual(lintFactsOnly("# no fence"), { ok: true, violations: [] });
});

test("flags second-person possessive in a synthesized claim", () => {
  const md = wrap(
    JSON.stringify({ conclusion: "This affects your portfolio directly." }),
  );
  const r = lintFactsOnly(md);
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].pattern, "second-person possessive");
});

test("flags second-person directives in a synthesized claim", () => {
  for (const claim of [
    "You should buy now before prices rise.",
    "You will need to act before the deadline.",
  ]) {
    const md = wrap(JSON.stringify({ conclusion: claim }));
    assert.equal(lintFactsOnly(md).ok, false, `should flag: ${claim}`);
  }
});

test("EXEMPTS verbatim citation fields (quoted source, not an instruction)", () => {
  // A scraped Zillow listing quoted verbatim says "your dream home" — that is
  // the source's marketing copy, not an instruction the brain injected. The
  // citation field is pass-through; the brain's own claim text is still policed.
  const md = wrap(
    JSON.stringify(
      {
        key_metrics: [
          {
            metric: "signal_business_1",
            value: "A gulf-access homesite is listed on Immokalee Rd.",
            citation:
              'Zillow: "build your Southwest Florida dream home — you will love the lifestyle"',
          },
        ],
      },
      null,
      2,
    ),
  );
  assert.deepEqual(lintFactsOnly(md), { ok: true, violations: [] });
});

test("still flags second-person that leaks into a NON-citation field", () => {
  // The exemption is scoped to citation/quoted fields only — second-person in a
  // synthesized value is still a violation.
  const md = wrap(
    JSON.stringify(
      {
        key_metrics: [
          {
            metric: "m1",
            value: "Build your dream home here.",
            citation: "ok",
          },
        ],
      },
      null,
      2,
    ),
  );
  assert.equal(lintFactsOnly(md).ok, false);
});

test("isQuotedSourceLine matches citation/cited_text/quoted_text/quote field lines", () => {
  assert.equal(isQuotedSourceLine('"citation": "x"'), true);
  assert.equal(isQuotedSourceLine('"cited_text": "x"'), true);
  assert.equal(isQuotedSourceLine('"quoted_text": "x"'), true);
  assert.equal(isQuotedSourceLine('"value": "x"'), false);
  assert.equal(isQuotedSourceLine('"conclusion": "x"'), false);
});
