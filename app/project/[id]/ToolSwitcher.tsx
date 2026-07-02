"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTool, type ProjectTool } from "@/lib/project/tool-tabs";

const TABS: { tool: ProjectTool; label: string; href: (id: string) => string }[] = [
  { tool: "overview", label: "Overview", href: (id) => `/project/${id}` },
  { tool: "email", label: "Email", href: (id) => `/project/${id}/email-lab` },
  { tool: "social", label: "Social", href: (id) => `/project/${id}/social` },
];

/** Cockpit D1 — the tool tabs. Client-only because layouts can't read the
 *  pathname; reads ONLY the id (no queries), so the layout stays static. */
export function ToolSwitcher({ id }: { id: string }) {
  const pathname = usePathname();
  const active = activeTool(pathname, id);
  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#070f14]/95 px-4 backdrop-blur">
      {/* Segmented control — three short labels fit ~360px */}
      <div className="mx-auto flex max-w-2xl gap-1 py-2">
        {TABS.map((t) => (
          <Link
            key={t.tool}
            href={t.href(id)}
            className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs font-semibold transition-colors ${
              active === t.tool
                ? "bg-gulf-teal text-[#04121b]"
                : "text-white/50 hover:bg-white/5 hover:text-white/80"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
