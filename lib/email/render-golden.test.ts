/**
 * lib/email/render-golden.test.ts — NON-CIRCULAR behavior-preservation guard.
 *
 * The golden `__fixtures__/golden/<case>.html` files were captured from the PRE-spine
 * `reportToEmailHtml` (commit 91b6aec, the parent of the convergence-spine refactor).
 * This asserts the POST-spine `reportToEmailHtml` reproduces those exact bytes — so it
 * compares against a frozen external reference, NOT against the new code path itself
 * (which would be tautological now that the wrapper delegates into renderGroundedReport).
 *
 * If a future change to the spine alters email output, these break with a byte diff.
 * Regenerate ONLY with explicit intent (the capture script is documented in git history).
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reportToEmailHtml } from "./activation/render";
import { GOLDEN_CASES } from "./__fixtures__/golden/cases";

const GOLDEN_DIR = join(import.meta.dir, "__fixtures__", "golden");

describe("reportToEmailHtml — frozen golden (pre-spine bytes, captured @91b6aec)", () => {
  for (const c of GOLDEN_CASES) {
    it(`${c.name}: post-spine output is byte-identical to the pre-spine golden`, async () => {
      const golden = readFileSync(join(GOLDEN_DIR, `${c.name}.html`), "utf8");
      const actual = await reportToEmailHtml(c.report, c.opts);
      expect(actual).toBe(golden);
    });
  }
});
