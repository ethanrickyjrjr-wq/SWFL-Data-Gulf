"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import type { ProjectItem } from "@/lib/project/items";
import { useBriefcase } from "@/components/briefcase/BriefcaseProvider";
import { projectIdFromPath } from "@/lib/briefcase/pill-mount";
import { dispatchAddItem } from "@/lib/project/add-item-event";
import { getAiContext } from "@/lib/project/ai-context-store";

export type FileTarget = "project" | "tray";

/**
 * Three-mode routing for filing:
 * - "event"  → on the project page; dispatch to the mounted workspace (fast, in-memory)
 * - "api"    → off the project page (report/r/* etc.); POST to add-item route (persistent)
 * - "tray"   → no active project; file to anonymous briefcase tray
 */
export function chooseFilingMode(
  pathname: string,
  projectId: string | null,
): "event" | "api" | "tray" {
  if (!projectId) return "tray";
  if (projectIdFromPath(pathname) === projectId) return "event";
  return "api";
}

async function addItemViaApi(projectId: string, item: ProjectItem): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/add-item`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ item }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
}

export function routeFiledItem(
  item: ProjectItem,
  projectId: string | null,
  pathname: string,
  fileToTray: (item: ProjectItem) => void,
): FileTarget {
  const mode = chooseFilingMode(pathname, projectId);
  if (mode === "event") {
    dispatchAddItem({ projectId: projectId!, item });
    return "project";
  }
  if (mode === "api") {
    addItemViaApi(projectId!, item).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "network error";
      toast.error(`Couldn't save to project — ${msg}`);
    });
    return "project";
  }
  fileToTray(item);
  return "tray";
}

export function useFiler(): { file: (item: ProjectItem) => FileTarget; projectId: string | null } {
  const pathname = usePathname() ?? "/";
  const urlProjectId = projectIdFromPath(pathname);
  const projectId = urlProjectId ?? getAiContext()?.projectId ?? null;
  const briefcase = useBriefcase();
  const file = useCallback(
    (item: ProjectItem): FileTarget =>
      routeFiledItem(item, projectId, pathname, (i) => briefcase?.fileItem(i)),
    [projectId, pathname, briefcase],
  );
  return { file, projectId };
}
