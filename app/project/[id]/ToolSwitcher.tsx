"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTool, projectEntry, type ProjectTool } from "@/lib/project/tool-tabs";

// Email first — opening a project lands on the Email tool (operator ruling 07/03/2026),
// so the tab order mirrors the landing order.
const TABS: {
  tool: ProjectTool;
  label: string;
  href: (id: string, lastDid: string | null) => string;
}[] = [
  // A remembered did reopens the SAME saved doc — without it, leaving Email and
  // coming back always landed on a fresh/blank one (the bug this fixes).
  { tool: "email", label: "Email", href: (id, lastDid) => projectEntry(id, lastDid) },
  { tool: "social", label: "Social", href: (id) => `/project/${id}/social` },
  { tool: "watch", label: "Watch", href: (id) => `/project/${id}/watch` },
  { tool: "overview", label: "Overview", href: (id) => `/project/${id}` },
];

/** Cockpit D1 — the tool tabs. `lastDid` (most-recently-opened/saved deliverable,
 *  seeded by the layout + kept live by ToolFrame) lets the Email tab reopen the
 *  right doc instead of a fresh one.
 *
 *  This is THE one pill chrome — the hub (`/project`) renders it too, aimed at
 *  the selected project, so the bar never jumps between the hub and a project.
 *  `id: null` (hub with zero projects) keeps the same geometry with inert pills.
 *  The leading Projects pill is the way BACK — inside a tool there was no route
 *  to the hub without the browser button (operator, 07/16/2026). */
export function ToolSwitcher({ id, lastDid }: { id: string | null; lastDid: string | null }) {
  const pathname = usePathname();
  const active = id ? activeTool(pathname, id) : null;
  const onHub = pathname === "/project";
  return (
    // top-14 = the app bar's height (the layout's own 3.5rem constant). BOTH bars
    // are sticky in the body scroll; at top-0 this one slid UNDERNEATH the opaque
    // z-40 app bar the moment the page scrolled — pills ghosted through the blur
    // and every tap landed on the header ("buttons don't work", mobile 07/16/2026).
    <nav className="sticky top-14 z-30 border-b border-white/10 bg-[#070f14]/95 px-4 backdrop-blur">
      {/* Segmented control — sized to be unmissable (operator: the subtle pills read
          as page chrome and got scrolled past entirely). */}
      <div className="mx-auto flex max-w-2xl gap-1.5 rounded-full py-2.5">
        <Link
          href="/project"
          aria-current={onHub ? "page" : undefined}
          className={`flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition-colors ${
            onHub
              ? "bg-gulf-teal text-[#04121b] shadow-lg shadow-gulf-teal/25"
              : "border border-white/15 text-white/75 hover:border-gulf-teal/50 hover:bg-white/5 hover:text-white"
          }`}
        >
          Projects
        </Link>
        {TABS.map((t) =>
          id ? (
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
          ) : (
            <span
              key={t.tool}
              aria-disabled
              className="flex-1 rounded-full border border-white/10 px-4 py-2 text-center text-sm font-semibold text-white/25"
            >
              {t.label}
            </span>
          ),
        )}
      </div>
    </nav>
  );
}
