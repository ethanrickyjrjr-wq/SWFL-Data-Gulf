// app/project/_cockpit/ProjectPanel.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { openDoc, projectEmailLabBase } from "@/lib/lab-entry/destination";
import { chipTime } from "@/lib/project/schedule-chips";
import { kindChipLabel, type CockpitProject } from "@/lib/project/group-projects";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";

export function emailHref(p: CockpitProject): string {
  return p.lastDid ? openDoc(p.id, p.lastDid) : projectEmailLabBase(p.id);
}

/**
 * The hub's right pane for the SELECTED project (spec 2026-07-16 §5) — the
 * dossier card: place eyebrow, address headline, then instruments. Project
 * controls ONLY — no lab controls (chart types, recipes) leak here; those
 * stay in the email lab's own panel (operator, 07/16/2026).
 */
export function ProjectPanel({
  project: p,
  contactsCount,
}: {
  project: CockpitProject;
  contactsCount: number;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/60 p-5">
      <div className="flex flex-col gap-4">
        <div>
          {(p.city || p.zip) && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gulf-teal/80">
              {[p.city, p.zip].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="min-w-0 text-lg font-semibold leading-snug text-white">
              {p.title || "Untitled project"}
            </h2>
            <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
              {kindChipLabel(p)}
            </span>
          </div>
        </div>

        {p.chips.length > 0 && (
          <ul className="flex flex-col gap-1">
            {p.chips.map((c) => (
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

        <div className="flex items-center gap-2">
          <Link
            href={emailHref(p)}
            className="rounded-lg bg-gulf-teal px-4 py-2 text-center text-sm font-semibold text-[#04121b] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gulf-teal"
          >
            Open Email
            <span className="block text-[10px] font-normal opacity-80">
              charts, photos, PDF export
            </span>
          </Link>
          <Link
            href={`/project/${p.id}/social`}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:border-gulf-teal/50 hover:text-white"
          >
            Social
          </Link>
          <div className="relative">
            <button
              type="button"
              aria-label="More tools"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              onClick={() => setMoreOpen((o) => !o)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/70 transition-colors hover:border-gulf-teal/50 hover:text-white"
            >
              ⋯
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 z-40 mt-1 w-32 rounded-lg border border-white/15 bg-[#0d1e2b] py-1 shadow-xl"
              >
                <Link
                  href={`/project/${p.id}/watch`}
                  role="menuitem"
                  className="block px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5"
                >
                  Watch
                </Link>
                <Link
                  href={`/project/${p.id}`}
                  role="menuitem"
                  className="block px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5"
                >
                  Overview
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10">
          <CampaignQuickStart surface="all" projectId={p.id} variant="panel" />
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            👥 Contacts
          </p>
          <p className="mt-1 text-sm text-white">
            {contactsCount} {contactsCount === 1 ? "person" : "people"}
          </p>
          <div className="mt-2 flex gap-3 text-xs">
            <Link href={emailHref(p)} className="text-gulf-teal hover:underline">
              Send to contacts →
            </Link>
            <Link href="/contacts" className="text-gray-400 hover:text-gulf-teal">
              Manage →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
