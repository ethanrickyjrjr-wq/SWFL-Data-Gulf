import type { ProjectDigest } from "./digest";

/**
 * The in-session half of the context bus (FINAL BOSS `00-MASTER-PLAN` → context bus):
 * a module-level store holding the CURRENTLY-active project's digest plus a small
 * prefetch cache keyed by project id, with subscribers for `useSyncExternalStore`.
 *
 * Why a module store and not React state: the persistent AI pill lives in the ROOT
 * layout (`app/layout.tsx`), a SIBLING of the project layout — project state cannot flow
 * up the React tree to reach it. The store lives OUTSIDE the tree, so the pill reads it
 * via `useAiContext()` while the rail (on hover/click) and the per-project bridge (on
 * load) write it — across route changes and component remounts, with NO effect and no
 * cross-component-render warning (these are not React `setState`).
 *
 * SSR safety: writes are client-only (the bridge guards on `typeof window`), and the
 * hook's `getServerSnapshot` is always `null`, so concurrent server renders never read
 * or mutate this global. This file is pure (imports only a type) → unit-testable.
 */

let active: ProjectDigest | null = null;
const cache = new Map<string, ProjectDigest>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

/** Two digests are "the same context" when project + content rev match. */
function sameDigest(a: ProjectDigest | null, b: ProjectDigest | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.projectId === b.projectId && a.rev === b.rev;
}

/** The active project's digest, or null when no project is active. Stable reference
 *  between changes (the `useSyncExternalStore` getSnapshot contract). */
export function getAiContext(): ProjectDigest | null {
  return active;
}

/** A previously-cached digest for a project (rail hover-prefetch read), or null. */
export function getCachedAiContext(projectId: string): ProjectDigest | null {
  return cache.get(projectId) ?? null;
}

/** Warm the cache WITHOUT changing which project is active (rail hover-prefetch). */
export function cacheAiContext(digest: ProjectDigest): void {
  cache.set(digest.projectId, digest);
}

/** Make this project's digest the active context (rail click / per-project bridge).
 *  No-ops the notify when the active digest is unchanged (same project + rev) so a
 *  re-seed during render can't loop `useSyncExternalStore`. */
export function setAiContext(digest: ProjectDigest): void {
  cache.set(digest.projectId, digest);
  if (sameDigest(active, digest)) return;
  active = digest;
  notify();
}

/** Clear the active context (e.g. leaving the project area). Cache is retained. */
export function clearAiContext(): void {
  if (active === null) return;
  active = null;
  notify();
}

export function subscribeAiContext(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: reset all module state between cases. */
export function __resetAiContextStoreForTest(): void {
  active = null;
  cache.clear();
  listeners.clear();
}
