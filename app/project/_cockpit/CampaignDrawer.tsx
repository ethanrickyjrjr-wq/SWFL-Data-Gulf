// app/project/_cockpit/CampaignDrawer.tsx
"use client";

import { useEffect } from "react";
import type { CampaignRow } from "@/lib/email/campaign-stats";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";
import { ChartBlockView } from "@/components/charts/ChartBlockView";

/**
 * Right slide-over (pencilandpaper drawer pattern — drill in without leaving
 * context), aside-tone chrome per spec. Charts render ONLY when the stored
 * event timestamps support the shape (hourBuckets/sendOverSend non-empty);
 * the KPI counts always render — a missing shape degrades to counts,
 * never an invented curve. Every block carries its as-of + citation.
 */
export function CampaignDrawer({ row, onClose }: { row: CampaignRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const asOf = row.asOf ?? new Date().toISOString().slice(0, 10);
  const src = { citation: "SWFL Data Gulf" };

  const opens24: ChartBlock | null = row.hourBuckets
    ? {
        title: "Unique opens after the last send",
        columns: ["Hours after send", "Opens"],
        rows: row.hourBuckets.map((b) => [b.label, b.opens]),
        chart_type: "bar",
        value_format: "count",
        asOf,
        source: src,
      }
    : null;
  const clicks24: ChartBlock | null =
    row.hourBuckets && row.hourBuckets.some((b) => b.clicks > 0)
      ? {
          title: "Unique clicks after the last send",
          columns: ["Hours after send", "Clicks"],
          rows: row.hourBuckets.map((b) => [b.label, b.clicks]),
          chart_type: "bar",
          value_format: "count",
          asOf,
          source: src,
        }
      : null;
  const trend: ChartBlock | null =
    row.sendOverSend.length >= 2
      ? {
          title: "Open rate, send over send",
          columns: ["Send", "Open rate"],
          rows: row.sendOverSend.map((s) => [s.label, s.openPct]),
          chart_type: "bar",
          value_format: "percent",
          asOf,
          source: src,
        }
      : null;

  const kpis: [string, number][] = [
    ["Delivered", row.delivered],
    ["Opened", row.opened],
    ["Clicked", row.clicked],
    ["Bounced", row.bounced],
    ["Unsubscribed", row.unsubscribed],
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close campaign details"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/40"
      />
      <aside
        role="dialog"
        aria-label={`Campaign: ${row.label}`}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[#0a141a] bg-[#0f1d24] p-4"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
              Campaign
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-white">{row.label}</h3>
            <p className="mt-0.5 text-[11px] text-white/45">
              {row.sendCount} {row.sendCount === 1 ? "send" : "sends"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-0.5 text-sm text-white/50 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {kpis.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/8 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
              <p className="text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>

        {opens24 && (
          <div className="mb-4">
            <ChartBlockView block={opens24} compact />
          </div>
        )}
        {clicks24 && (
          <div className="mb-4">
            <ChartBlockView block={clicks24} compact />
          </div>
        )}
        {trend && (
          <div className="mb-4">
            <ChartBlockView block={trend} compact />
          </div>
        )}
        {!opens24 && !trend && (
          <p className="text-[11px] text-white/40">
            Timing charts appear once opens with timestamps are recorded for this campaign.
          </p>
        )}
      </aside>
    </>
  );
}
