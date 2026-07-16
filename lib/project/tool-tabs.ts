// lib/project/tool-tabs.ts
import { openDoc, projectEmailLabBase } from "@/lib/lab-entry/destination";

export type ProjectTool = "overview" | "email" | "social" | "watch";

/**
 * Where "open this project" lands — the Email tool, ready to author (operator ruling
 * 07/03/2026: a project opens INTO an email, not onto the Overview). THE single root
 * for every open-project entry link (rail rows, list page, new-project buttons, pill
 * build CTA); the Overview stays reachable via its tab at `/project/[id]`.
 */
export function projectHome(id: string): string {
  return `/project/${id}/email-lab`;
}

/**
 * The entry URL for a project when the last-opened deliverable is known — reopens
 * that saved doc instead of a fresh canvas. ONE authority: the rail rows, the tool
 * switcher's Email tab, and the hub cockpit all build this link here.
 */
export function projectEntry(id: string, lastDid: string | null): string {
  return lastDid ? openDoc(id, lastDid) : projectEmailLabBase(id);
}

/** Which cockpit tool the current pathname is on (drives the switcher highlight).
 *  Null when the pathname isn't inside this project at all — the hub (`/project`)
 *  renders the same switcher with NO active pill, aimed at the selected project. */
export function activeTool(pathname: string, id: string): ProjectTool | null {
  const base = `/project/${id}`;
  if (!pathname.startsWith(base)) return null;
  if (pathname.startsWith(`${base}/email-lab`)) return "email";
  if (pathname.startsWith(`${base}/social`)) return "social";
  if (pathname.startsWith(`${base}/watch`)) return "watch";
  return "overview";
}
