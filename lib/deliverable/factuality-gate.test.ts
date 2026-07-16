// LIVE factuality gate (spec 2026-07-16-factuality-ci-gate-design.md D5).
// Self-skips unless FACTUALITY_GATE=1 — plain `bun test` must stay $0.
// Each fixture = one real graded call through the spend seam (factuality_ci).
import { describe, expect, test } from "bun:test";
import { agentsAreMocked } from "../../refinery/agents/anthropic.mts";
import { FACTUALITY_FIXTURES } from "./factuality-fixtures";
import { seamFactualityGrader } from "./factuality-grader";

const LIVE = process.env.FACTUALITY_GATE === "1" && !agentsAreMocked();

describe("factuality gate (live, seam-routed)", () => {
  if (!LIVE) {
    // NOTE: bun test (NODE_ENV=test) does NOT load .env.local, so a local live
    // run must also export ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY
    // into the shell — without the key, agentsAreMocked() keeps this skipped.
    test("skipped — set FACTUALITY_GATE=1 (+ creds in shell) for a deliberate live run (real spend)", () => {
      expect(LIVE).toBe(false);
    });
    return;
  }

  for (const f of FACTUALITY_FIXTURES) {
    test(`${f.id} (class ${f.cls}, expect ${f.expectPass ? "pass" : "fail"})`, async () => {
      const { assertions } = await import("promptfoo");
      const result = await assertions.runAssertion({
        prompt: "Summarize the market facts for a reader.",
        assertion: {
          type: "factuality",
          value: f.reference,
          provider: seamFactualityGrader,
        },
        test: { vars: {}, assert: [] },
        providerResponse: { output: f.completion },
      });
      // Infra errors (SpendCapError, network) THROW out of runAssertion or land
      // in result.error — either way they must not masquerade as a verdict.
      expect(result.error ?? "").toBe("");
      expect(result.pass).toBe(f.expectPass);
    }, 120_000);
  }
});
