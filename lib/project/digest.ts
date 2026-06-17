import type { InferredScope } from "./derive-name";

/**
 * The project digest — a small, deterministic "what's in here" summary of ONE project,
 * derived fresh each open from already-loaded data (no new tables; Piece 2 decision 6).
 * It is the AI's context for a project: the prompt engine ranks it into the 3+1 prompts,
 * the cross-project index matches on its `identityKeys`, and the answer-grounding path
 * names the project from its `scope`.
 *
 * The TYPE lives here from Step 1 because the context bus (`ai-context-store.ts`) carries
 * it; `buildProjectDigest` (Step 3) is implemented below the type. `rev` is a cheap content
 * hash so the store/hook can no-op an unchanged re-seed and the prompt engine can memoize.
 */
export interface ProjectDigest {
  projectId: string;
  title: string;
  /** Content hash over items + freshness — cache key for the store + prompt memo. */
  rev: string;
  /** Grounded scope; `address` reserved for the future address grain (unused in v1). */
  scope: InferredScope & { address?: string };
  itemCount: number;
  kindCounts: Record<string, number>;
  /** Cross-project identity keys (one per item) — see `cross-project-index.ts`. */
  identityKeys: string[];
  /** Newest item freshness token carried by the project (compared on the YYYYMMDD tail). */
  freshnessToken?: string;
  /** True when the newest token is newer than `ui_state.last_freshness_token_seen`. */
  freshnessChangedSinceSeen: boolean;
  /** max(items.added_at ∪ deliverables.created_at) — "where you left off". */
  latestActivityAt?: string;
  deliverables: { id: string; template: string; createdAt: string }[];
  schedules: { cadence: string; scope?: string; lastRunAt?: string }[];
  recentSends: { sentAt: string }[];
  /** Stale-metric verdicts from reconcile; `[]` when the TTL gate is off. */
  staleMetrics: { label: string; expiredAt?: string }[];
}
