"use client";

import { useSyncExternalStore } from "react";
import { getAiContext, subscribeAiContext } from "@/lib/project/ai-context-store";
import type { ProjectDigest } from "@/lib/project/digest";

/**
 * Read the active project's AI context, re-rendering when it changes. Backs the
 * `aiContext` seam over the module-level context-bus store (`ai-context-store.ts`).
 *
 * SSR-safe: `getServerSnapshot` is always `null` — there is no project context during
 * server render (the module global is never read or written on the server), and the
 * per-project bridge seeds it on the client after hydration. A stable null server
 * snapshot keeps hydration from mismatching.
 */
export function useAiContext(): ProjectDigest | null {
  return useSyncExternalStore(subscribeAiContext, getAiContext, () => null);
}
