// app/project/_cockpit/CampaignsCard.tsx
"use client";

import { useState } from "react";
import type { CampaignStats, CampaignRow } from "@/lib/email/campaign-stats";
import { CampaignDrawer } from "./CampaignDrawer";

const pctText = (v: number | null) => (v === null ? "—" : `${v}%`);
const dateText = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      })
    : "—";

/** One row per campaign, real stored numbers only; row click → drawer.
 *  Delta arrow compares against the user's OWN average — never external. */
export function CampaignsCard({ stats }: { stats: CampaignStats }) {
  const [open, setOpen] = useState<CampaignRow | null>(null);

  return (
    <section className="rounded-xl border border-white/8 bg-[#0f1d24] p-4">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
        Campaigns
      </p>

      {stats.campaigns.length === 0 ? (
        <p className="py-3 text-xs text-white/45">
          Send your first campaign and opens/clicks appear here — the campaign starters in the panel
          are the fastest door.
        </p>
      ) : (
        <>
          {stats.strongest && <p className="mb-2 text-xs text-white/70">{stats.strongest}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/8 text-[10px] uppercase tracking-wide text-white/40">
                  <th className="py-1.5 pr-3 font-medium">Campaign</th>
                  <th className="py-1.5 pr-3 font-medium">Last send</th>
                  <th className="py-1.5 pr-3 font-medium">Delivered</th>
                  <th className="py-1.5 pr-3 font-medium">Open</th>
                  <th className="py-1.5 pr-3 font-medium">Click</th>
                  <th className="py-1.5 font-medium">vs your avg</th>
                </tr>
              </thead>
              <tbody>
                {stats.campaigns.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => setOpen(row)}
                    className="cursor-pointer border-b border-white/5 text-white/75 transition-colors hover:bg-white/5"
                  >
                    <td className="max-w-[220px] truncate py-2 pr-3 text-white/90">{row.label}</td>
                    <td className="py-2 pr-3">{dateText(row.lastSentAt)}</td>
                    <td className="py-2 pr-3">{row.delivered}</td>
                    <td className="py-2 pr-3">{pctText(row.openPct)}</td>
                    <td className="py-2 pr-3">{pctText(row.clickPct)}</td>
                    <td className="py-2">
                      {row.deltaOpenVsAvg === null ? (
                        "—"
                      ) : row.deltaOpenVsAvg >= 0 ? (
                        <span className="text-gulf-teal">▲ {row.deltaOpenVsAvg}</span>
                      ) : (
                        <span className="text-amber-300/80">▼ {Math.abs(row.deltaOpenVsAvg)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && <CampaignDrawer row={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
