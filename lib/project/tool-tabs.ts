// lib/project/tool-tabs.ts
export type ProjectTool = "overview" | "email" | "social";

/** Which cockpit tool the current pathname is on (drives the switcher highlight). */
export function activeTool(pathname: string, id: string): ProjectTool {
  const base = `/project/${id}`;
  if (pathname.startsWith(`${base}/email-lab`)) return "email";
  if (pathname.startsWith(`${base}/social`)) return "social";
  return "overview";
}
