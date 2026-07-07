// lib/project/tool-tabs.ts
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

/** Which cockpit tool the current pathname is on (drives the switcher highlight). */
export function activeTool(pathname: string, id: string): ProjectTool {
  const base = `/project/${id}`;
  if (pathname.startsWith(`${base}/email-lab`)) return "email";
  if (pathname.startsWith(`${base}/social`)) return "social";
  if (pathname.startsWith(`${base}/watch`)) return "watch";
  return "overview";
}
