"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTool, type ProjectTool } from "@/lib/project/tool-tabs";
import { projectEmailLabBase, openDoc } from "@/lib/lab-entry/destination";

// Email first — opening a project lands on the Email tool (operator ruling 07/03/2026),
// so the tab order mirrors the landing order.
const TABS: {
  tool: ProjectTool;
  label: string;
  href: (id: string, lastDid: string | null) => string;
}[] = [
  // A remembered did reopens the SAME saved doc — without it, leaving Email and
  // coming back always landed on a fresh/blank one (the bug this fixes).
  {
    tool: "email",
    label: "Email",
    href: (id, lastDid) => (lastDid ? openDoc(id, lastDid) : projectEmailLabBase(id)),
  },
  { tool: "social", label: "Social", href: (id) => `/project/${id}/social` },
  { tool: "watch", label: "Watch", href: (id) => `/project/${id}/watch` },
  { tool: "overview", label: "Overview", href: (id) => `/project/${id}` },
];

/** Cockpit D1 — the tool tabs. `lastDid` (most-recently-opened/saved deliverable,
 *  seeded by the layout + kept live by ToolFrame) lets the Email tab reopen the
 *  right doc instead of a fresh one. */
export function ToolSwitcher({ id, lastDid }: { id: string; lastDid: string | null }) {
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
            href={t.href(id, lastDid)}
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
