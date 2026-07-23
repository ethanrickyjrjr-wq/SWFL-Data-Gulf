import type { PackOutput } from "../types/pack.mts";
import { freshnessToken } from "../lib/freshness.mts";
import { packSourceHash } from "../lib/pack-hash.mts";

/**
 * Render the spec-v1.2 YAML frontmatter.
 * Field order matches the spec / test-alpha.md. There is NO `authority`
 * field and NO `identity` block — spec v1.1 forbids both. `freshness_token`
 * sits immediately after `refined_at` since it is derived from it.
 *
 * `pack_hash` stamps the SOURCE the brain was built from, so the DAG can tell a
 * code change from mere data age (refinery/lib/pack-hash.mts). Without it, a pack
 * fix inside the TTL window is skipped as "fresh" forever — which is exactly how
 * the 07/10 ZIP-scope fix sat unshipped for two weeks while every surface read a
 * 06/29 artifact full of Bradenton. Omitted when the pack file can't be read, so
 * this can never wedge a build.
 *
 * `contentHash` (caller-supplied `contentDigest` of the rendered OUTPUT body)
 * makes `freshness_token` unique to what was actually served, not just to
 * version+day — see `freshnessToken` in freshness.mts for why.
 */
export function renderFrontmatter(out: PackOutput, contentHash: string): string {
  const { pack, version, refined_at } = out;
  const hash = packSourceHash(pack.brain_id);
  return [
    "---",
    `brain_id: ${pack.brain_id}`,
    `version: ${version}`,
    `refined_at: ${refined_at}`,
    `freshness_token: ${freshnessToken(version, refined_at, contentHash)}`,
    `ttl_seconds: ${pack.ttl_seconds}`,
    ...(hash ? [`pack_hash: ${hash}`] : []),
    "context_type: user_saved_reference",
    `scope: ${pack.scope}`,
    "---",
  ].join("\n");
}
