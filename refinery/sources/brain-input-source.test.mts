import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BrainOutput } from "../types/brain-output.mts";
import { makeBrainInputSource } from "./brain-input-source.mts";

// Regression for master_expires_vs_cadence_policy — 4-output.mts:348-354 calls
// `source.citationMeta(verifiedDate, pack.ttl_seconds)` for EVERY source on the
// CURRENTLY-BUILDING pack, including brain-input sources. Before this fix,
// brain-input-source.mts blindly applied the caller's (downstream pack's) own
// ttl_seconds to compute `expires`, instead of the upstream brain's OWN
// ttl_seconds — so a slow-cadence upstream (e.g. 30-day TTL) got marked
// "expired" on the FAST-cadence downstream's schedule (e.g. 7 days), a full
// 3+ weeks before the upstream is actually due to refresh. Live proof:
// brains/master.md:44 — properties-lee-value (own ttl_seconds 2592000/30d)
// shows `verified 2026-07-19 | expires 2026-07-26` — exactly verified+7d,
// master's own ttl_seconds (604800), not the upstream's.

/** Writes a synthetic brains/{brainId}.md with a given ttl_seconds baked into
 *  the OUTPUT JSON block (the field brain-input-source.mts must read), runs
 *  `body`, then restores/removes the file so the real working tree is untouched. */
async function withSyntheticUpstream(
  brainId: string,
  opts: { verified: string; ttlSeconds: number },
  body: () => Promise<void>,
): Promise<void> {
  const brainsDir = path.join(process.cwd(), "brains");
  await mkdir(brainsDir, { recursive: true });
  const p = path.join(brainsDir, `${brainId}.md`);

  const output: BrainOutput = {
    brain_id: brainId,
    version: 1,
    refined_at: `${opts.verified}T00:00:00Z`,
    ttl_seconds: opts.ttlSeconds,
    direction: "neutral",
    magnitude: 0.5,
    drivers: [],
    overrides: [],
    conclusion: "Synthetic upstream for citationMeta TTL regression test.",
    key_metrics: [],
    caveats: [],
    contradicts: [],
    confidence: 0.85,
    joint_integrity: 1,
    confidence_dispersion: 0,
    chain_depth: 0,
    trust_tier: 2,
    upstream_count: 0,
    relevance: {
      decay_curve: "months",
      half_life_hours: 8760,
      computed_at: `${opts.verified}T00:00:00Z`,
    },
    exogenous_signals: [],
  };
  const md = [
    `---`,
    `brain_id: ${brainId}`,
    `version: 1`,
    `refined_at: ${output.refined_at}`,
    `ttl_seconds: ${opts.ttlSeconds}`,
    `---`,
    ``,
    `# Synthetic upstream`,
    ``,
    "```reference",
    `--- OUTPUT ---`,
    JSON.stringify(output, null, 2),
    "```",
    ``,
  ].join("\n");

  let prior: string | null = null;
  try {
    prior = await readFile(p, "utf-8");
  } catch {
    prior = null;
  }
  await writeFile(p, md, "utf-8");
  try {
    await body();
  } finally {
    if (prior !== null) {
      await writeFile(p, prior, "utf-8");
    } else {
      await rm(p, { force: true });
    }
  }
}

test("citationMeta uses the UPSTREAM's own ttl_seconds, not the caller's (downstream pack's) ttl_seconds", async () => {
  const upstreamId = `ttl-regression-upstream-${randomUUID().slice(0, 8)}`;
  const verified = "2026-07-19";
  const upstreamTtlSeconds = 2_592_000; // 30 days — e.g. properties-lee-value's own cadence

  await withSyntheticUpstream(
    upstreamId,
    { verified, ttlSeconds: upstreamTtlSeconds },
    async () => {
      const source = makeBrainInputSource(upstreamId);
      await source.fetch();

      // Caller here stands in for Stage 4 passing the CURRENTLY-BUILDING pack's
      // own ttl_seconds (e.g. master's 604800 / 7 days) — this must NOT be what
      // determines the upstream's citation expiry.
      const callerTtlSeconds = 604_800; // 7 days — e.g. master's own cadence
      const meta = source.citationMeta(verified, callerTtlSeconds);

      assert.equal(
        meta.expires,
        "2026-08-18", // verified (2026-07-19) + upstream's OWN 30-day ttl
        `expected expiry derived from upstream's own ttl_seconds (30d), got ${meta.expires} ` +
          `(2026-07-26 would mean the caller's 7-day ttl leaked in — the bug)`,
      );
    },
  );
});
