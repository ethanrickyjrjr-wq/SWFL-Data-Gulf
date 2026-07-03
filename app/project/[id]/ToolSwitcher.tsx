"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTool, type ProjectTool } from "@/lib/project/tool-tabs";

// Email first — opening a project lands on the Email tool (operator ruling 07/03/2026),
// so the tab order mirrors the landing order.
const TABS: { tool: ProjectTool; label: string; href: (id: string) => string }[] = [
  { tool: "email", label: "Email", href: (id) => `/project/${id}/email-lab` },
  { tool: "social", label: "Social", href: (id) => `/project/${id}/social` },
  { tool: "overview", label: "Overview", href: (id) => `/project/${id}` },
];

/** Cockpit D1 — the tool tabs. Client-only because layouts can't read the
 *  pathname; reads ONLY the id (no queries), so the layout stays static. */
export function ToolSwitcher({ id }: { id: string }) {
  const pathname = usePathname();
  const active = activeTool(pathname, id);
  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#070f14]/95 px-4 backdrop-blur">
      {/* Segmented control — sized to be unmissable (operator: the subtle pills read
          as page chrome and got scrolled past entirely). */}
      <div className="mx-auto flex max-w-2xl gap-1.5 rounded-full py-2.5">
        {TABS.map((t) => (
          <Link
            key={t.tool}
            href={t.href(id)}
            aria-current={active === t.tool ? "page" : undefined}
            className={`flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition-colors ${
              active === t.tool
                ? "bg-gulf-teal text-[#04121b] shadow-lg shadow-gulf-teal/25"
                : "border border-white/15 text-white/75 hover:border-gulf-teal/50 hover:bg-white/5 hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
