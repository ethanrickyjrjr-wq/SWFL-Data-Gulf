// app/project/_cockpit/ProjectsCockpit.tsx
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { kindChipLabel, type Section } from "@/lib/project/group-projects";
import { chipTime, type ScheduleChip } from "@/lib/project/schedule-chips";
import { projectEntry } from "@/lib/project/tool-tabs";
import { promptsForPage } from "@/lib/briefcase/visits";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";
import { BriefcasePanel } from "@/components/briefcase/BriefcasePanel";
import { BriefcaseChat } from "@/components/briefcase/BriefcaseChat";
import { ToolSwitcher } from "../[id]/ToolSwitcher";
import { ConfirmDeleteProject } from "./ConfirmDeleteProject";
import { EmptyLaunchpad } from "./EmptyLaunchpad";

/**
 * The hub cockpit (fix brief 2026-07-16): the SAME room as every in-project
 * page — real ToolSwitcher pills on top (aimed at the selected project),
 * grouped project list in the center, and the email-lab aside chrome on the
 * right. Only the center differs from a project page; rail, pills, and aside
 * never jump. One action = one home: Email/Social/Watch/Overview live ONLY
 * in the pills, campaign starters ONLY in the aside, delete ONLY on the row ⋯.
 *
 * Selection: clicking a center row SELECTS it on desktop (pills + aside
 * retarget); on mobile (no split view) the tap navigates into the project.
 */
export function ProjectsCockpit({
  sections,
  defaultSelectedId,
  activeCount,
  upcoming,
  contactsCount,
  actions,
}: {
  sections: Section[];
  defaultSelectedId: string | null;
  activeCount: number;
  upcoming: ScheduleChip[];
  contactsCount: number;
  /** Top-strip actions (New listing / Showing prep / New project) — passed in
   *  from the server page so the buttons keep their one existing home. */
  actions?: ReactNode;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  const all = sections.flatMap((s) => s.subgroups.flatMap((g) => g.projects));
  // After a delete the stale id falls back to the most recent project.
  const selected = all.find((p) => p.id === selectedId) ?? all[0] ?? null;
  const empty = all.length === 0;

  function rowClick(e: React.MouseEvent, id: string) {
    // Desktop split view: select in place. Below lg (aside stacked away): navigate.
    if (window.matchMedia("(min-width: 1024px)").matches) {
      e.preventDefault();
      setSelectedId(id);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The one pill chrome — identical bar to /project/[id]; on the hub it
          aims at the selected project (no active pill: you're not in a tool). */}
      <ToolSwitcher id={selected?.id ?? null} lastDid={selected?.lastDid ?? null} />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_380px]">
        {/* ══════════ CENTER: the project list — the only part that changes ══════════ */}
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/8 px-4 py-2.5">
            <h1 className="text-sm font-semibold text-white/80">Your projects</h1>
            <p className="text-[11px] text-white/45">
              {activeCount === 0 ? (
                <>Nothing scheduled yet.</>
              ) : (
                <>
                  <span className="text-white/80">
                    {activeCount} active {activeCount === 1 ? "send" : "sends"}
                  </span>
                  {upcoming[0] && (
                    <>
                      {" "}
                      · next {upcoming[0].kind === "email" ? "✉" : "📣"}{" "}
                      <Link href={upcoming[0].href} className="hover:text-gulf-teal">
                        {upcoming[0].line}
                        {chipTime(upcoming[0].nextAt) ? ` · ${chipTime(upcoming[0].nextAt)}` : ""}
                      </Link>
                    </>
                  )}
                </>
              )}
            </p>
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]">
            {empty ? (
              <EmptyLaunchpad contactsCount={contactsCount} />
            ) : (
              <div className="mx-auto w-full max-w-2xl">
                {sections.map((section) => (
                  <div key={section.key} className="mb-5">
                    <p className="border-b border-white/10 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {section.label} <span className="text-gray-600">({section.count})</span>
                    </p>
                    {section.subgroups.map((g) => (
                      <div key={g.city ?? "~none"}>
                        {g.city && (
                          <p className="mt-2 px-1 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                            {g.city}
                          </p>
                        )}
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {g.projects.map((p) => {
                            const active = p.id === selected?.id;
                            return (
                              <li key={p.id} className="flex min-w-0 items-center gap-0.5">
                                <Link
                                  href={projectEntry(p.id, p.lastDid)}
                                  onClick={(e) => rowClick(e, p.id)}
                                  aria-current={active ? "true" : undefined}
                                  className={`min-w-0 flex-1 rounded-lg px-3 py-2 transition-colors ${
                                    active
                                      ? "bg-gulf-teal/15 text-white"
                                      : "text-gray-300 hover:bg-white/5 hover:text-white"
                                  }`}
                                >
                                  <span className="block text-sm font-medium">
                                    {p.displayTitle}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] text-gray-500">
                                    {[
                                      p.chips[0]
                                        ? `${p.chips[0].kind === "email" ? "✉" : "📣"} ${
                                            chipTime(p.chips[0].nextAt) ?? p.chips[0].status
                                          }`
                                        : null,
                                      p.built > 0
                                        ? `${p.built} ${p.built === 1 ? "email" : "emails"} built`
                                        : `${p.itemCount} ${p.itemCount === 1 ? "item" : "items"}`,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </Link>
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
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* ══════════ RIGHT: the same aside chrome as the email lab / social ══════════ */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-l border-[#0a141a] bg-[#0f1d24]">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/8 px-4 py-3">
            <span className="text-gulf-teal">✦</span>
            <span className="text-sm font-semibold text-white/85">AI assistant</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* The docked Ask AI — the SAME assistant as the floating pill, which is
                suppressed on this page (pill-mount): one Ask AI per page, and here it
                lives at the top of the panel, aimed at the selected project. With no
                projects yet, the bare chat docks instead — the full panel's funnel
                furniture (pitch + example cards) would duplicate the welcome center. */}
            <div className="border-b border-white/8 p-4">
              {selected ? (
                <BriefcasePanel
                  key={selected.id}
                  page={{ kind: "project", projectId: selected.id }}
                />
              ) : (
                <BriefcaseChat starterPrompts={promptsForPage({ kind: "generic" }, 1)} />
              )}
            </div>

            {/* Selected project dossier — identity + its live schedules (click a
                chip to tailor that schedule). Info only; tool nav stays in the pills. */}
            {selected && (
              <div className="border-b border-white/8 px-4 pb-4 pt-4">
                {(selected.city || selected.zip) && (
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gulf-teal/80">
                    {[selected.city, selected.zip].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="mt-0.5 flex items-center gap-2">
                  <h2 className="min-w-0 text-sm font-semibold leading-snug text-white">
                    {selected.displayTitle}
                  </h2>
                  <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                    {kindChipLabel(selected)}
                  </span>
                </div>
                {selected.chips.length > 0 && (
                  <ul className="mt-2.5 flex flex-col gap-1">
                    {selected.chips.map((c) => (
                      <li key={c.key}>
                        <Link
                          href={c.href}
                          title="Click to tailor this schedule"
                          className={`inline-flex flex-wrap items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            c.status === "active"
                              ? "border-gulf-teal/40 text-gray-200 hover:border-gulf-teal hover:text-white"
                              : "border-white/10 text-gray-500 hover:border-white/30"
                          }`}
                        >
                          <span aria-hidden>{c.kind === "email" ? "✉" : "📣"}</span>
                          <span>{c.line}</span>
                          {c.audience && <span className="text-gray-500">→ {c.audience}</span>}
                          {c.status === "paused" ? (
                            <span className="text-amber-300/70">paused</span>
                          ) : chipTime(c.nextAt) ? (
                            <span className="text-gray-500">· next {chipTime(c.nextAt)}</span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Campaign starters — scoped to the selected project. When the hub is
                empty the launchpad in the center carries them instead (never two
                copies of the same buttons on one page). */}
            {!empty && (
              <CampaignQuickStart surface="all" projectId={selected?.id} variant="panel" />
            )}

            <div className="border-b border-white/8 px-4 pb-4 pt-4">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
                Contacts
              </p>
              <p className="text-sm text-white/85">
                {contactsCount} {contactsCount === 1 ? "person" : "people"}
              </p>
              <div className="mt-2 flex gap-3 text-xs">
                {selected && (
                  <Link
                    href={projectEntry(selected.id, selected.lastDid)}
                    className="text-gulf-teal hover:underline"
                  >
                    Send to contacts →
                  </Link>
                )}
                <Link href="/contacts" className="text-white/45 hover:text-gulf-teal">
                  Manage →
                </Link>
              </div>
            </div>

            {upcoming.length > 0 && (
              <div className="border-b border-white/8 px-4 pb-4 pt-4">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
                  Running now
                </p>
                <ul className="flex flex-col gap-1">
                  {upcoming.map((c) => (
                    <li key={c.key}>
                      <Link
                        href={c.href}
                        className="text-xs text-white/60 transition-colors hover:text-gulf-teal"
                      >
                        {c.kind === "email" ? "✉" : "📣"} {c.line}
                        {chipTime(c.nextAt) ? ` · next ${chipTime(c.nextAt)}` : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>

      {confirm && (
        <ConfirmDeleteProject
          projectId={confirm.id}
          name={confirm.name}
          onClose={() => setConfirm(null)}
          onDeleted={() => {
            if (selectedId === confirm.id) setSelectedId(null);
            setConfirm(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
