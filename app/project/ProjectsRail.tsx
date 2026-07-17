// app/project/ProjectsRail.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { projectHome, projectEntry } from "@/lib/project/tool-tabs";
import type { Section } from "@/lib/project/group-projects";
import { SendCeilingMeter } from "@/components/email/SendCeilingMeter";
import { ConfirmDeleteProject } from "./_cockpit/ConfirmDeleteProject";
import { useSelectedProject } from "./SelectedProjectContext";

/**
 * The persistent left projects rail (Piece 1 §A), cockpit rework (spec
 * 2026-07-16): grouped section headers, titles shown up to the city, a
 * visible ⋯ delete per row (trash-mode toggle removed), 288px wide. Renders
 * on EVERY project page including the hub — the rail never disappears
 * between pages (operator, 07/16/2026). Hidden on mobile only.
 */
export function ProjectsRail({
  sections,
  contactsCount,
}: {
  sections: Section[];
  contactsCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sel = useSelectedProject();
  const onHub = pathname === "/project";
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Untitled project" }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (res.ok && data.id) router.push(projectHome(data.id));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <nav
        aria-label="Your projects"
        className="hidden w-72 shrink-0 flex-col gap-1 border-r border-white/10 px-3 pt-6 md:flex"
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Projects
          </span>
          <div className="flex items-center gap-2">
            <Link href="/project" className="text-xs text-gray-400 hover:text-gulf-teal">
              All
            </Link>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              aria-label="New project"
              title="New project"
              className="rounded-full bg-gulf-teal/15 px-2 py-0.5 text-xs font-semibold text-gulf-teal hover:bg-gulf-teal/30 disabled:opacity-40 transition-colors"
            >
              {creating ? "…" : "+ New"}
            </button>
          </div>
        </div>

        {sections.length === 0 ? (
          <p className="px-1 text-xs text-gray-500">No projects yet.</p>
        ) : (
          // scrollbar-gutter keeps the item counts clear of the scrollbar —
          // without it they sat half-hidden underneath (operator screenshot).
          <div className="flex flex-col gap-3 overflow-y-auto [scrollbar-gutter:stable]">
            {sections.map((section) => (
              <div key={section.key}>
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                  {section.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {section.subgroups.flatMap((g) =>
                    g.projects.map((p) => {
                      const href = projectEntry(p.id, p.lastDid);
                      const active =
                        onHub && sel
                          ? p.id === sel.selectedId
                          : pathname.startsWith(`/project/${p.id}`);
                      return (
                        <li key={p.id} className="flex min-w-0 items-center gap-0.5">
                          <Link
                            href={href}
                            prefetch
                            onClick={(e) => {
                              // Hub + desktop: first click selects (the dashboard's
                              // widgets retarget); clicking the already-selected row
                              // falls through to navigation. Mobile (no split view)
                              // always navigates — the old center-row contract.
                              if (
                                onHub &&
                                sel &&
                                p.id !== sel.selectedId &&
                                window.matchMedia("(min-width: 1024px)").matches
                              ) {
                                e.preventDefault();
                                sel.setSelectedId(p.id);
                              }
                            }}
                            aria-current={active ? "page" : undefined}
                            className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                              active
                                ? "bg-gulf-teal/15 text-white"
                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="truncate">{p.displayTitle}</span>
                            <span className="shrink-0 text-[10px] text-gray-500">
                              {p.itemCount}
                            </span>
                          </Link>
                          {/* Straight to the named confirm — the old in-between menu's
                              only non-duplicate item was Delete, and its popover got
                              clipped by this list's overflow container. */}
                          <button
                            type="button"
                            aria-label={`Delete ${p.displayTitle}`}
                            title="Delete project"
                            onClick={() => setConfirm({ id: p.id, name: p.displayTitle })}
                            className="rounded-full px-1.5 py-0.5 text-sm leading-none text-gray-500 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gulf-teal/70"
                          >
                            ⋯
                          </button>
                        </li>
                      );
                    }),
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Sticky rail footer (operator, 07/16/2026): Contacts lives HERE — its
            one home on every project page — pinned visible however long the
            list gets. bg matches the body (--gulf-midnight) so scrolled rows
            don't ghost through. */}
        <div className="sticky bottom-0 z-10 mt-auto -mx-3 bg-[#0a1419]">
          <div className="px-4">
            <SendCeilingMeter variant="rail" />
          </div>
          <Link
            href="/contacts"
            className="mt-2 flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <span>👥 Contacts</span>
            <span className="text-[10px] text-gray-500">
              {contactsCount} {contactsCount === 1 ? "person" : "people"}
            </span>
          </Link>
        </div>
      </nav>

      {confirm && (
        <ConfirmDeleteProject
          projectId={confirm.id}
          name={confirm.name}
          onClose={() => setConfirm(null)}
          onDeleted={() => {
            const wasViewing = pathname.includes(confirm.id);
            setConfirm(null);
            if (wasViewing) router.push("/project");
            else router.refresh();
          }}
        />
      )}
    </>
  );
}
