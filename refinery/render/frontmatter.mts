import type { PackOutput } from "../types/pack.mts";
import { freshnessToken } from "../lib/freshness.mts";

/**
 * Render the spec-v1.2 YAML frontmatter.
 * Field order matches the spec / test-alpha.md. There is NO `authority`
 * field and NO `identity` block — spec v1.1 forbids both. `freshness_token`
 * sits immediately after `refined_at` since it is derived from it.
 */
export function renderFrontmatter(out: PackOutput): string {
  const { pack, version, refined_at } = out;
  return [
    "---",
    `brain_id: ${pack.brain_id}`,
    `version: ${version}`,
    `refined_at: ${refined_at}`,
    `freshness_token: ${freshnessToken(version, refined_at)}`,
    `ttl_seconds: ${pack.ttl_seconds}`,
    "context_type: user_saved_reference",
    `scope: ${pack.scope}`,
    "---",
  ].join("\n");
}
