/**
 * lib/email/render-golden.test.ts — golden-baseline stability guard.
 *
 * PROVENANCE — read before regenerating:
 * - ORIGINAL capture: the pre-spine `reportToEmailHtml` (commit 91b6aec, parent of the
 *   convergence-spine refactor) — an independent, non-circular reference at the time.
 * - REGENERATED 07/18/2026 (site-audit fix pass) from post-fix output, because the pass
 *   intentionally changed the shared render path: as-of dates → MM/DD/YYYY, and a "$"
 *   prefix on currency delta values (housing.median_sale_price + env.flood_aal_usd).
 *
 * So these goldens now guard stability against that 07/18 baseline, NOT the original
 * 91b6aec bytes — the suite proves "output hasn't drifted since the last INTENDED
 * change", not pre-spine equivalence. A byte diff here means the spine's output moved:
 * regenerate ONLY with explicit intent, and record the intended change in this header
 * when you do (regen: render each GOLDEN_CASES entry via `reportToEmailHtml` and write
 * the result over `__fixtures__/golden/<case>.html`).
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reportToEmailHtml } from "./activation/render";
import { GOLDEN_CASES } from "./__fixtures__/golden/cases";

const GOLDEN_DIR = join(import.meta.dir, "__fixtures__", "golden");

describe("reportToEmailHtml — frozen golden baseline (see header for provenance)", () => {
  for (const c of GOLDEN_CASES) {
    it(`${c.name}: output is byte-identical to the golden baseline`, async () => {
      const golden = readFileSync(join(GOLDEN_DIR, `${c.name}.html`), "utf8");
      const actual = await reportToEmailHtml(c.report, c.opts);
      expect(actual).toBe(golden);
    });
  }
});
