import { ToolSwitcher } from "./ToolSwitcher";

/**
 * Cockpit D1 — per-project tool frame (Overview · Email · Social). Nested under
 * the persistent project-area layout (rail + search live THERE, not here), so
 * switching tools swaps only the child page: rail, AI, and this switcher never
 * remount. No data fetch here — the switcher needs only the id.
 */
export default async function ProjectToolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolSwitcher id={id} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
