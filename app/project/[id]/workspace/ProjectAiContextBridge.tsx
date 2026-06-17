"use client";

import { useState } from "react";
import { setAiContext } from "@/lib/project/ai-context-store";
import type { ProjectDigest } from "@/lib/project/digest";

/**
 * Seeds the module-level context-bus store with this project's digest so the persistent
 * pill (a sibling of the project layout) becomes project-aware on a direct load / deep
 * link. Renders nothing.
 *
 * The seed runs in a lazy `useState` initializer — NOT a `useEffect` (this repo treats
 * `react-hooks/set-state-in-effect` as a hard error; same pattern as
 * `BriefcaseProvider`'s draft load and `BriefcasePanel`'s visit bump). It is guarded to
 * the client so concurrent SSR renders never mutate the module global (which would leak
 * one request's project context into another). Mounted inside `ProjectWorkspace`, which
 * is keyed by project id and so remounts on project switch — re-seeding for the newly
 * opened project. (Client-side rail navigation seeds the store BEFORE this even mounts.)
 */
export function ProjectAiContextBridge({ digest }: { digest: ProjectDigest }) {
  useState(() => {
    if (typeof window !== "undefined") setAiContext(digest);
    return null;
  });
  return null;
}
