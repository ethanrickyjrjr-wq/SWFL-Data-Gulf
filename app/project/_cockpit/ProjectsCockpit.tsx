// app/project/_cockpit/ProjectsCockpit.tsx
"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { kindChipLabel, type CockpitProject } from "@/lib/project/group-projects";
import {
  chipTime,
  type ScheduleChip,
  type EmailScheduleRow,
  type SocialScheduleRow,
} from "@/lib/project/schedule-chips";
import { projectEntry } from "@/lib/project/tool-tabs";
import { promptsForPage } from "@/lib/briefcase/visits";
import type { CampaignStats } from "@/lib/email/campaign-stats";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";
import { BriefcasePanel } from "@/components/briefcase/BriefcasePanel";
import { BriefcaseChat } from "@/components/briefcase/BriefcaseChat";
import { ToolSwitcher } from "../[id]/ToolSwitcher";
import { useSelectedProject } from "../SelectedProjectContext";
import { EmptyLaunchpad } from "./EmptyLaunchpad";
import { CalendarCard } from "./CalendarCard";
import { CampaignsCard } from "./CampaignsCard";
import { SelectedProjectCard } from "./SelectedProjectCard";

/**
 * The hub center: MISSION CONTROL (spec 2026-07-16-hub-mission-control-design).
 * The rail is the ONE project list now — the center is a dashboard: compact
 * calendar (top-left, not the center of attention), the selected project's
 * frozen preview with See/Edit/Update (top-right), campaigns full-width below
 * carrying the visual weight. Same room as every in-project page — real
 * ToolSwitcher pills on top (aimed at the selected project) and the email-lab
 * aside chrome on the right; rail, pills, and aside never jump. One fact, one
 * home: next-send facts live in the calendar card (the aside's old "Running
 * now" section retired with this build); the center project list DIED here —
 * selection comes from the rail via SelectedProjectContext.
 */
export function ProjectsCockpit({
  projects,
  activeCount,
  chips,
  emailSch,
  socialSch,
  contactsCount,
  stats,
  initialPreview,
  actions,
}: {
  projects: CockpitProject[];
  activeCount: number;
  chips: ScheduleChip[];
  emailSch: EmailScheduleRow[];
  socialSch: SocialScheduleRow[];
  contactsCount: number;
  stats: CampaignStats;
  initialPreview: { did: string; html: string } | null;
  /** Top-strip actions (New listing / Showing prep / New project) — passed in
   *  from the server page so the buttons keep their one existing home. */
  actions?: ReactNode;
}) {
  const sel = useSelectedProject();
  const selected = projects.find((p) => p.id === sel?.selectedId) ?? projects[0] ?? null;
  const empty = projects.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The one pill chrome — identical bar to /project/[id]; on the hub it
          aims at the selected project (no active pill: you're not in a tool). */}
      <ToolSwitcher id={selected?.id ?? null} lastDid={selected?.lastDid ?? null} />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_380px]">
        {/* ══════════ CENTER: mission control — the only part that changes ══════════ */}
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/8 px-4 py-2.5">
            <h1 className="text-sm font-semibold text-white/80">Mission control</h1>
            <p className="text-[11px] text-white/45">
              {activeCount === 0 ? (
                <>Nothing scheduled yet.</>
              ) : (
                <span className="text-white/80">
                  {activeCount} active {activeCount === 1 ? "send" : "sends"}
                </span>
              )}
            </p>
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]">
            {empty ? (
              <EmptyLaunchpad contactsCount={contactsCount} />
            ) : (
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
                  <CalendarCard
                    emailSch={emailSch}
                    socialSch={socialSch}
                    chips={chips}
                    scheduleHref={
                      selected ? projectEntry(selected.id, selected.lastDid) : "/project"
                    }
                  />
                  {/* Keyed by selection: a change REMOUNTS the card so its
                      preview/update state resets without setState-in-effect. */}
                  <SelectedProjectCard
                    key={selected ? `${selected.id}:${selected.lastDid ?? ""}` : "none"}
                    project={
                      selected
                        ? {
                            id: selected.id,
                            title: selected.displayTitle,
                            lastDid: selected.lastDid,
                          }
                        : null
                    }
                    initialPreview={initialPreview}
                  />
                </div>
                <CampaignsCard stats={stats} />
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
          </div>
        </aside>
      </div>
    </div>
  );
}
