import { test } from "node:test";
import assert from "node:assert/strict";
import { lintInferenceBait } from "./inference-bait-lint.mts";

/** Wrap a SAVED FACTS JSON array in a minimal ```reference fence. */
function wrap(factsJson: string): string {
  return [
    "```reference",
    "--- SAVED FACTS ---",
    factsJson,
    "",
    "--- RECENT NOTES ---",
    "- nothing",
    "```",
  ].join("\n");
}

test("flags the historical charge-off bait (% and 'N total' in one paren)", () => {
  const md = wrap(
    JSON.stringify([
      {
        id: "f003",
        topic: "chargeoff_summary",
        fact: "x",
        value:
          "Full list: Zoom Room (0% survival — 1 of 1 resolved charged off, 2 total).",
        src: "s01",
        date: "2026-05-14",
      },
    ]),
  );
  const r = lintInferenceBait(md);
  assert.equal(r.ok, false);
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].pattern, "ambiguous denominator");
  assert.match(r.violations[0].text, /f003/);
});

test("passes the fixed format (rate outside the paren, resolved-only inside)", () => {
  const md = wrap(
    JSON.stringify([
      {
        id: "f003",
        topic: "chargeoff_summary",
        fact: "x",
        value:
          "Zoom Room — 0% survival (1 of 1 resolved loans charged off); " +
          "The Grounds Guys — 0% survival (2 of 2 resolved loans charged off).",
        src: "s01",
        date: "2026-05-14",
      },
    ]),
  );
  assert.deepEqual(lintInferenceBait(md), { ok: true, violations: [] });
});

test("passes a per-brand sentence that mentions total and a rate (not crammed in a paren)", () => {
  const md = wrap(
    JSON.stringify([
      {
        id: "f006",
        topic: "franchise_loan_outcome",
        fact: "x",
        value:
          "Culver's (franchise code 11023) carries 6 total SBA loans, of which " +
          "4 are resolved (all paid in full, none charged off), yielding a 100% " +
          "survival rate on resolved loans.",
        src: "s01",
        date: "2026-05-14",
      },
    ]),
  );
  assert.deepEqual(lintInferenceBait(md), { ok: true, violations: [] });
});

test("passes strong-performers format ('N resolved, M total' paren has no percentage)", () => {
  const md = wrap(
    JSON.stringify([
      {
        id: "f005",
        topic: "strong_performers",
        fact: "x",
        value:
          "7 brands have a 100% survival rate: TROPICAL SMOOTHIE (4 resolved, 4 total); " +
          "GREAT CLIPS (4 resolved, 6 total).",
        src: "s01",
        date: "2026-05-14",
      },
    ]),
  );
  assert.deepEqual(lintInferenceBait(md), { ok: true, violations: [] });
});

test("returns ok on a missing or garbled facts block", () => {
  assert.deepEqual(lintInferenceBait("no reference fence here"), {
    ok: true,
    violations: [],
  });
  const garbled = wrap("[ this is not json ]");
  assert.deepEqual(lintInferenceBait(garbled), { ok: true, violations: [] });
});

test("flags every offending fact in a multi-fact array", () => {
  const md = wrap(
    JSON.stringify([
      {
        id: "f001",
        topic: "ok",
        fact: "x",
        value: "Clean fact, nothing here.",
        src: "s01",
        date: "2026-05-14",
      },
      {
        id: "f002",
        topic: "bait",
        fact: "x",
        value: "Brand A (50% survival — 1 of 2 resolved charged off, 4 total).",
        src: "s01",
        date: "2026-05-14",
      },
    ]),
  );
  const r = lintInferenceBait(md);
  assert.equal(r.ok, false);
  assert.equal(r.violations.length, 1);
  assert.match(r.violations[0].text, /f002/);
});

// --- causal-chain-across-brains rule (roadmap §6.1.3) ----------------------
//
// Master's OUTPUT.conclusion is allowed to attribute reads to specific
// upstream brains via explicit citation syntax ("per macro-us"), but it must
// NOT chain two brain IDs together with causal English ("X because Y",
// "X leading to Y", etc.). Hallucinated causation across brains is the
// failure mode this rule catches — the LLM weaving a story that the
// deterministic synthesizer never asserted.

const BRAINS = [
  "macro-us",
  "macro-florida",
  "sector-credit-swfl",
  "env-swfl",
  "cre-swfl",
  "tourism-tdt",
  "logistics-swfl",
  "franchise-outcomes",
];

/** Wrap a minimal master-shaped markdown with both SAVED FACTS and OUTPUT. */
function wrapFull(conclusion: string): string {
  return [
    "```reference",
    "--- SAVED FACTS ---",
    JSON.stringify([
      {
        id: "f001",
        topic: "x",
        fact: "x",
        value: "ok",
        src: "s01",
        date: "2026-05-17",
      },
    ]),
    "",
    "--- OUTPUT ---",
    JSON.stringify({ brain_id: "master", conclusion }, null, 2),
    "",
    "--- SUB-BRAIN POINTERS ---",
    "- nothing",
    "```",
  ].join("\n");
}

test("causal: flags 'X because Y' across two different brain IDs", () => {
  const md = wrapFull(
    "Rates rising in macro-us because sector-credit-swfl is reading bearish.",
  );
  const r = lintInferenceBait(md, BRAINS);
  assert.equal(r.ok, false);
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].pattern, "causal-chain-across-brains");
  assert.match(r.violations[0].text, /because/);
});

test("causal: flags 'X leading to Y' across two different brain IDs", () => {
  const md = wrapFull(
    "macro-us SOFR climbed leading to env-swfl flagging compounded pressure.",
  );
  const r = lintInferenceBait(md, BRAINS);
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].pattern, "causal-chain-across-brains");
  assert.match(r.violations[0].text, /leading to/);
});

test("causal: flags 'due to' across two different brain IDs", () => {
  const md = wrapFull(
    "cre-swfl reads bearish due to sector-credit-swfl distress signal.",
  );
  const r = lintInferenceBait(md, BRAINS);
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].pattern, "causal-chain-across-brains");
});

test("causal: flags 'which is why' across two different brain IDs", () => {
  const md = wrapFull(
    "macro-us is in tightening mode, which is why cre-swfl is compressing.",
  );
  const r = lintInferenceBait(md, BRAINS);
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].pattern, "causal-chain-across-brains");
});

test("causal: flags 'as a result' across two different brain IDs", () => {
  const md = wrapFull(
    "tourism-tdt is in trough; as a result cre-swfl reads anchor turnover.",
  );
  const r = lintInferenceBait(md, BRAINS);
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].pattern, "causal-chain-across-brains");
});

test("causal: passes when both refs use explicit 'per X' citation form", () => {
  const md = wrapFull(
    "Per macro-us, SOFR is rising; per sector-credit-swfl, NAICS distress is elevated.",
  );
  assert.deepEqual(lintInferenceBait(md, BRAINS), { ok: true, violations: [] });
});

test("causal: passes when only one brain ID appears near the trigger", () => {
  const md = wrapFull(
    "Rates are rising because broader macro conditions warrant it; macro-us confirms.",
  );
  assert.deepEqual(lintInferenceBait(md, BRAINS), { ok: true, violations: [] });
});

test("causal: passes when the same brain ID flanks the trigger (self-causation, not cross-brain)", () => {
  const md = wrapFull(
    "macro-us SOFR is rising because macro-us CPI has stayed elevated.",
  );
  assert.deepEqual(lintInferenceBait(md, BRAINS), { ok: true, violations: [] });
});

test("causal: passes when OUTPUT block is absent (legacy / non-master pack)", () => {
  const md = wrap(
    JSON.stringify([
      {
        id: "f001",
        topic: "x",
        fact: "x",
        value: "clean",
        src: "s01",
        date: "2026-05-17",
      },
    ]),
  );
  assert.deepEqual(lintInferenceBait(md, BRAINS), { ok: true, violations: [] });
});

test("causal: passes when OUTPUT block has no conclusion field", () => {
  const md = [
    "```reference",
    "--- SAVED FACTS ---",
    JSON.stringify([
      {
        id: "f001",
        topic: "x",
        fact: "x",
        value: "ok",
        src: "s01",
        date: "2026-05-17",
      },
    ]),
    "",
    "--- OUTPUT ---",
    JSON.stringify({ brain_id: "master", direction: "bearish" }, null, 2),
    "",
    "--- SUB-BRAIN POINTERS ---",
    "- nothing",
    "```",
  ].join("\n");
  assert.deepEqual(lintInferenceBait(md, BRAINS), { ok: true, violations: [] });
});

test("causal: rule is a no-op when brainIds is omitted (back-compat)", () => {
  const md = wrapFull(
    "Rates rising in macro-us because sector-credit-swfl is reading bearish.",
  );
  // No brainIds passed — only the denominator rule runs; causal rule stays silent.
  assert.deepEqual(lintInferenceBait(md), { ok: true, violations: [] });
});
