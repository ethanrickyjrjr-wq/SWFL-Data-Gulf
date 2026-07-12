// Drift guard for the 07/12/2026 cron cutover (check: nightly_chain_cron_cutover).
// Fails the moment someone re-adds a chain member's standalone cron — two clocks
// re-create the independent-drift bug the chain exists to kill (08d §6).
//
// Lives in .github/scripts (NOT .github/workflows/__tests__) because `bun test`
// ignores dot-directories; ci.yml runs `node --test .github/scripts/*.test.mjs`.
//
// Run: node --test .github/scripts/nightly-chain-sole-clock.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WF = resolve(dirname(fileURLToPath(import.meta.url)), "../workflows");

/** Every member the chain owns. Once chained, a member must NOT carry its own
 *  `schedule:` — two clocks re-create the independent-drift bug the chain exists
 *  to kill (each member paid +45m to +5h29m of its own drift; the effective
 *  execution order was random). graphify is EXCLUDED: its chain leg is gated off
 *  by vars.CHAIN_GRAPHIFY_ENABLED, so it legitimately still needs its own cron. */
const CHAINED = [
  "active-listings-daily.yml",
  "listing-lifecycle-daily.yml",
  "city-pulse-daily.yml",
  "live-search-daily.yml",
  "daily-rebuild.yml",
  "narrative-bake.yml",
  "gate-a-parity.yml",
];

/** An uncommented `- cron: "..."` line. */
const LIVE_CRON = /^\s*-\s*cron:\s*["']/m;

test("nightly-chain.yml is the SOLE clock for every chained member", () => {
  for (const f of CHAINED) {
    const src = fs.readFileSync(resolve(WF, f), "utf8");
    assert.equal(
      LIVE_CRON.test(src),
      false,
      `${f} still carries a live standalone cron. It is driven by nightly-chain.yml's ` +
        `needs: ordering — a second clock re-creates the independent-drift bug ` +
        `(08d §6). Comment the cron out; keep workflow_dispatch.`,
    );
  }
});

test("nightly-chain.yml itself DOES carry the backstop cron", () => {
  const src = fs.readFileSync(resolve(WF, "nightly-chain.yml"), "utf8");
  assert.ok(LIVE_CRON.test(src), "nightly-chain.yml lost its backstop cron.");
});

test("daily-email-digest keeps its own clock — it is NOT a chain member", () => {
  const src = fs.readFileSync(resolve(WF, "daily-email-digest.yml"), "utf8");
  assert.ok(
    LIVE_CRON.test(src),
    "daily-email-digest.yml lost its cron. The 10:23 AM EDT send is the INTENTIONAL " +
      "customer-facing send at the researched engagement peak — never chain it.",
  );
});
