// app/project/_cockpit/ProjectsCockpit.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CockpitProject, Section } from "@/lib/project/group-projects";
import { chipTime, type ScheduleChip } from "@/lib/project/schedule-chips";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";
import { ProjectPanel, emailHref } from "./ProjectPanel";
import { ConfirmDeleteProject } from "./ConfirmDeleteProject";
import { RowMenu } from "./RowMenu";

/**
 * The hub cockpit body (spec 2026-07-16 §2): grouped list left (the flight
 * board), selected project's panel right (the dossier), tool pills on top
 * acting on the selection. Single click SELECTS (desktop); navigation happens
 * via pills/panel buttons. On mobile the panel is hidden and a row tap
 * navigates into the project.
 */
export function ProjectsCockpit({
  sections,
  defaultSelectedId,
  activeCount,
  upcoming,
  contactsCount,
}: {
  sections: Section[];
  defaultSelectedId: string | null;
  activeCount: number;
  upcoming: ScheduleChip[];
  contactsCount: number;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  const all = sections.flatMap((s) => s.subgroups.flatMap((g) => g.projects));
  const selected = all.find((p) => p.id === selectedId) ?? null;

  const pills: { label: string; href: (p: CockpitProject) => string }[] = [
    { label: "Email", href: (p) => emailHref(p) },
    { label: "Social", href: (p) => `/project/${p.id}/social` },
    { label: "Watch", href: (p) => `/project/${p.id}/watch` },
    { label: "Overview", href: (p) => `/project/${p.id}` },
  ];

  function rowClick(e: React.MouseEvent, id: string) {
    // Desktop: select in place. Mobile (no panel): let the Link navigate.
    if (window.matchMedia("(min-width: 768px)").matches) {
      e.preventDefault();
      setSelectedId(id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tool pills — same segmented look as the in-project switcher. */}
      <nav aria-label="Open the selected project's tool" className="flex max-w-md gap-1.5">
        {pills.map((t) =>
          selected ? (
            <Link
              key={t.label}
              href={t.href(selected)}
              className="flex-1 rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white/75 transition-colors hover:border-gulf-teal/50 hover:bg-white/5 hover:text-white"
            >
              {t.label}
            </Link>
          ) : (
            <span
              key={t.label}
              aria-disabled
              className="flex-1 rounded-full border border-white/10 px-4 py-2 text-center text-sm font-semibold text-white/25"
            >
              {t.label}
            </span>
          ),
        )}
      </nav>

      {/* Running-now strip — the management heartbeat, always visible. */}
      <p className="text-xs text-gray-400">
        {activeCount === 0 ? (
          <>Nothing scheduled yet — open a project and schedule a send.</>
        ) : (
          <>
            <span className="text-white">
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

      <div className="flex gap-6">
        {/* Left: the flight board. */}
        <div className="min-w-0 flex-1 md:max-w-sm">
          {sections.map((section) => (
            <div key={section.key} className="mb-4">
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
                      const active = p.id === selectedId;
                      return (
                        <li key={p.id} className="flex min-w-0 items-center gap-0.5">
                          <Link
                            href={emailHref(p)}
                            onClick={(e) => rowClick(e, p.id)}
                            aria-current={active ? "true" : undefined}
                            className={`min-w-0 flex-1 rounded-lg px-3 py-2 transition-colors ${
                              active
                                ? "bg-gulf-teal/15 text-white"
                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="block text-sm font-medium">{p.displayTitle}</span>
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
                          <RowMenu
                            label={`Actions for ${p.displayTitle}`}
                            items={[
                              { label: "Open", onSelect: () => router.push(emailHref(p)) },
                              {
                                label: "Delete",
                                tone: "danger",
                                onSelect: () => setConfirm({ id: p.id, name: p.displayTitle }),
                              },
                            ]}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Right: selected project's panel, or the global view. Desktop only. */}
        <div className="hidden min-w-0 flex-1 md:block">
          {selected ? (
            <ProjectPanel project={selected} contactsCount={contactsCount} />
          ) : (
            <div className="flex flex-col gap-4">
              {upcoming.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Running now
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {upcoming.map((c) => (
                      <li key={c.key}>
                        <Link
                          href={c.href}
                          className="text-xs text-gray-300 transition-colors hover:text-gulf-teal"
                        >
                          {c.kind === "email" ? "✉" : "📣"} {c.line}
                          {chipTime(c.nextAt) ? ` · next ${chipTime(c.nextAt)}` : ""}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-xl border border-white/10">
                <CampaignQuickStart surface="all" variant="panel" />
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  👥 Contacts
                </p>
                <p className="mt-1 text-sm text-white">
                  {contactsCount} {contactsCount === 1 ? "person" : "people"}
                </p>
                <Link
                  href="/contacts"
                  className="mt-2 block text-xs text-gulf-teal hover:underline"
                >
                  Manage →
                </Link>
              </div>
            </div>
          )}
        </div>
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
