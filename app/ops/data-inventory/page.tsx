"use client";

import { useState, useCallback } from "react";
import {
  CADENCE_ORDER,
  pipelinesByGroup,
  type Cadence,
  type Grain,
  type Pipeline,
  type PipelineStatus,
  type ZipStatus,
} from "./_data";

// ─── localStorage key helpers ─────────────────────────────────────────────────
const storageKey = (cadence: Cadence) => `ops-zip-grain-done:${cadence}`;
const notesKey = (cadence: Cadence) => `ops-zip-grain-notes:${cadence}`;

// ─── Style helpers ────────────────────────────────────────────────────────────
const GRAIN_STYLES: Record<Grain, string> = {
  zip: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  county: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  state: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  national: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  msa: "bg-violet-500/15 text-violet-300 border border-violet-500/30",
  submarket: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
  station: "bg-gray-500/15 text-gray-300 border border-gray-500/30",
  corridor: "bg-orange-500/15 text-orange-300 border border-orange-500/30",
  city: "bg-teal-500/15 text-teal-300 border border-teal-500/30",
  parcel: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  route: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30",
  track: "bg-pink-500/15 text-pink-300 border border-pink-500/30",
};

const STATUS_DOT: Record<PipelineStatus, { dot: string; label: string }> = {
  active: { dot: "bg-emerald-400", label: "Active" },
  "odd-window": { dot: "bg-amber-400", label: "ODD Window" },
  "not-yet-running": { dot: "bg-gray-500", label: "Not Running" },
  "dead-end": { dot: "bg-red-500", label: "Dead End" },
};

const ZIP_BADGE: Record<ZipStatus, { icon: string; cls: string; label: string }> = {
  full: { icon: "✓", cls: "text-emerald-400 font-bold", label: "Full ZIP grain" },
  partial: { icon: "≈", cls: "text-amber-400 font-bold", label: "Partial / pending" },
  none: { icon: "✗", cls: "text-red-400 font-bold", label: "No ZIP grain" },
};

const LEFT_BORDER: Record<ZipStatus, string> = {
  full: "border-l-2 border-l-emerald-500/50",
  partial: "border-l-2 border-l-amber-500/60",
  none: "border-l-2 border-l-red-500/50",
};

const CADENCE_COLORS: Record<Cadence, string> = {
  Daily: "from-sky-900/40",
  Weekly: "from-violet-900/30",
  Monthly: "from-teal-900/30",
  Quarterly: "from-amber-900/30",
  Annual: "from-rose-900/30",
};

const CADENCE_BADGE: Record<Cadence, string> = {
  Daily: "bg-sky-500/20 text-sky-300 border border-sky-500/30",
  Weekly: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
  Monthly: "bg-teal-500/20 text-teal-300 border border-teal-500/30",
  Quarterly: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  Annual: "bg-rose-500/20 text-rose-300 border border-rose-500/30",
};

// ─── Summary stats ────────────────────────────────────────────────────────────
function SummaryBar() {
  const groups = pipelinesByGroup();
  let total = 0, withZip = 0, partial = 0, noZip = 0, notRunning = 0;
  for (const [, { nonZip, hasZip }] of groups) {
    for (const p of [...nonZip, ...hasZip]) {
      total++;
      if (p.zipStatus === "full") withZip++;
      else if (p.zipStatus === "partial") partial++;
      else noZip++;
      if (p.pipelineStatus === "not-yet-running" || p.pipelineStatus === "dead-end") notRunning++;
    }
  }
  const stats = [
    { label: "Total Pipelines", value: total, cls: "text-white" },
    { label: "✓ Full ZIP Grain", value: withZip, cls: "text-emerald-400" },
    { label: "≈ Partial ZIP", value: partial, cls: "text-amber-400" },
    { label: "✗ No ZIP Grain", value: noZip, cls: "text-red-400" },
    { label: "◌ Not Running / Dead", value: notRunning, cls: "text-gray-400" },
  ];
  return (
    <div className="mb-8 grid grid-cols-5 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-center"
        >
          <div className={`text-2xl font-mono font-bold ${s.cls}`}>{s.value}</div>
          <div className="mt-1 text-xs text-gray-500">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend() {
  const grains: Grain[] = [
    "zip", "county", "state", "national", "msa", "submarket",
    "station", "corridor", "city", "parcel", "route", "track",
  ];
  return (
    <div className="mb-8 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Legend — Grain
      </div>
      <div className="flex flex-wrap gap-2">
        {grains.map((g) => (
          <span
            key={g}
            className={`rounded px-2 py-0.5 text-xs capitalize ${GRAIN_STYLES[g]}`}
          >
            {g}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
        <span><span className="font-bold text-emerald-400">✓</span> = Full ZIP grain now</span>
        <span><span className="font-bold text-amber-400">≈</span> = Partial / work needed</span>
        <span><span className="font-bold text-red-400">✗</span> = No ZIP grain (priority)</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Active</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />ODD Window</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gray-500" />Not Running</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Dead End</span>
      </div>
    </div>
  );
}

// ─── Table header ─────────────────────────────────────────────────────────────
function TableHead() {
  const cols = [
    { label: "Dataset", w: "w-52 min-w-[200px]" },
    { label: "Table / Source", w: "w-56 min-w-[200px]" },
    { label: "Lane", w: "w-28 min-w-[100px]" },
    { label: "Grain", w: "w-24 min-w-[90px]" },
    { label: "ZIP", w: "w-12 min-w-[44px] text-center" },
    { label: "Status", w: "w-28 min-w-[100px]" },
    { label: "Schedule / Cron", w: "w-56 min-w-[200px]" },
    { label: "Notes / Issues", w: "min-w-[260px] flex-1" },
  ];
  return (
    <thead>
      <tr className="border-b border-white/10 bg-[#0d1520]">
        {cols.map((c) => (
          <th
            key={c.label}
            className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 ${c.w}`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ─── Individual row ───────────────────────────────────────────────────────────
function PipelineRow({ p, even }: { p: Pipeline; even: boolean }) {
  const [showNote, setShowNote] = useState(false);
  const zipBadge = ZIP_BADGE[p.zipStatus];
  const statusMeta = STATUS_DOT[p.pipelineStatus];
  const bg = even ? "bg-[#0b1520]" : "bg-[#0e1a28]";

  return (
    <tr
      className={`group border-b border-white/5 ${bg} ${LEFT_BORDER[p.zipStatus]} transition-colors hover:bg-white/[0.04]`}
    >
      {/* Dataset name */}
      <td className="px-3 py-2 align-top">
        <span className="text-sm font-medium text-white">{p.label}</span>
        <div className="mt-0.5 font-mono text-[10px] text-gray-600">{p.id}</div>
      </td>

      {/* Table/source */}
      <td className="px-3 py-2 align-top">
        <code className="break-all text-[11px] text-gray-400">{p.table}</code>
      </td>

      {/* Lane */}
      <td className="px-3 py-2 align-top">
        <span className="text-xs text-gray-400">{p.lane}</span>
      </td>

      {/* Grain */}
      <td className="px-3 py-2 align-top">
        <span
          className={`rounded px-1.5 py-0.5 text-xs capitalize ${GRAIN_STYLES[p.grain]}`}
        >
          {p.grain}
        </span>
      </td>

      {/* ZIP status */}
      <td className="px-3 py-2 align-top text-center">
        <button
          title={
            p.zipNote
              ? `${zipBadge.label}\n${p.zipNote}`
              : zipBadge.label
          }
          onClick={() => setShowNote(!showNote)}
          className="cursor-default text-base leading-none"
        >
          <span className={zipBadge.cls}>{zipBadge.icon}</span>
        </button>
        {showNote && p.zipNote && (
          <div className="mt-1 rounded border border-amber-500/30 bg-amber-950/30 p-2 text-left text-[11px] text-amber-200">
            {p.zipNote}
          </div>
        )}
      </td>

      {/* Pipeline status */}
      <td className="px-3 py-2 align-top">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${statusMeta.dot}`}
          />
          <span className="text-xs text-gray-300">{statusMeta.label}</span>
        </span>
        {p.ghWorkflow && (
          <div className="mt-0.5 font-mono text-[10px] text-gray-600">
            {p.ghWorkflow}
          </div>
        )}
      </td>

      {/* Schedule */}
      <td className="px-3 py-2 align-top">
        <span className="text-[11px] text-gray-400">{p.cronNotes}</span>
      </td>

      {/* Notes */}
      <td className="px-3 py-2 align-top">
        <p className="text-[11px] leading-relaxed text-gray-400">{p.notes}</p>
      </td>
    </tr>
  );
}

// ─── Section separator between non-ZIP and ZIP sub-groups ─────────────────────
function SubGroupDivider({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={8}
        className="border-b border-t border-white/5 bg-[#0d1820] px-3 py-1"
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">
          {label}
        </span>
      </td>
    </tr>
  );
}

// ─── Per-section action panel ─────────────────────────────────────────────────
function SectionAction({ cadence }: { cadence: Cadence }) {
  const [done, setDone] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey(cadence)) === "1"; } catch { return false; }
  });
  const [notes, setNotes] = useState<string>(() => {
    try { return localStorage.getItem(notesKey(cadence)) ?? ""; } catch { return ""; }
  });
  const [expanded, setExpanded] = useState(false);

  const save = useCallback(
    (nextDone: boolean, nextNotes: string) => {
      try {
        localStorage.setItem(storageKey(cadence), nextDone ? "1" : "0");
        localStorage.setItem(notesKey(cadence), nextNotes);
      } catch {}
    },
    [cadence]
  );

  return (
    <div
      className={`mt-2 flex flex-col gap-2 rounded-lg border p-3 text-sm transition-colors ${
        done
          ? "border-emerald-500/30 bg-emerald-950/20"
          : "border-[#0a8078]/30 bg-[#0a8078]/5"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            const next = !done;
            setDone(next);
            save(next, notes);
          }}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
            done
              ? "bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/40"
              : "bg-[#0a8078]/30 text-[#0a8078] hover:bg-[#0a8078]/50"
          }`}
        >
          {done ? "✅ ZIP Grain Routing — Done" : "📋 Mark ZIP Grain Routing Complete"}
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-gray-500 hover:text-gray-300"
        >
          {expanded ? "▲ hide notes" : "▼ notes / issues"}
        </button>
        {notes && !expanded && (
          <span className="text-[11px] italic text-gray-500">
            {notes.slice(0, 60)}
            {notes.length > 60 ? "…" : ""}
          </span>
        )}
      </div>
      {expanded && (
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            save(done, e.target.value);
          }}
          placeholder={`Notes for ${cadence} ZIP grain routing — what's blocking, what's the plan, how to update the cron, keywords to watch…`}
          rows={4}
          className="w-full rounded border border-white/10 bg-[#0a1018] p-2 text-xs text-gray-300 placeholder-gray-600 focus:border-[#0a8078]/50 focus:outline-none"
        />
      )}
    </div>
  );
}

// ─── Cadence section ──────────────────────────────────────────────────────────
function CadenceSection({
  cadence,
  nonZip,
  hasZip,
}: {
  cadence: Cadence;
  nonZip: Pipeline[];
  hasZip: Pipeline[];
}) {
  const total = nonZip.length + hasZip.length;
  const withZip = hasZip.length;
  const noZip = nonZip.filter((p) => p.zipStatus === "none").length;
  const partial = nonZip.filter((p) => p.zipStatus === "partial").length;
  const showAction = cadence !== "Daily" && nonZip.length > 0;

  return (
    <section className="mb-10">
      {/* Section header */}
      <div
        className={`mb-3 flex items-center gap-3 rounded-lg bg-gradient-to-r ${CADENCE_COLORS[cadence]} to-transparent px-4 py-3`}
      >
        <span
          className={`rounded px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${CADENCE_BADGE[cadence]}`}
        >
          {cadence}
        </span>
        <span className="text-sm font-semibold text-white">{total} datasets</span>
        <div className="ml-2 flex gap-2 text-xs">
          {withZip > 0 && (
            <span className="text-emerald-400">✓ {withZip} ZIP</span>
          )}
          {partial > 0 && (
            <span className="text-amber-400">≈ {partial} partial</span>
          )}
          {noZip > 0 && (
            <span className="text-red-400">✗ {noZip} no ZIP</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full border-collapse text-left">
          <TableHead />
          <tbody>
            {/* Non-ZIP group (priority — shown first) */}
            {nonZip.length > 0 && (
              <>
                <SubGroupDivider
                  label={`⚠ Needs ZIP grain routing (${nonZip.length})`}
                />
                {nonZip.map((p, i) => (
                  <PipelineRow key={p.id} p={p} even={i % 2 === 0} />
                ))}
              </>
            )}

            {/* ZIP grain group */}
            {hasZip.length > 0 && (
              <>
                <SubGroupDivider
                  label={`✓ Already on ZIP grain (${hasZip.length})`}
                />
                {hasZip.map((p, i) => (
                  <PipelineRow key={p.id} p={p} even={i % 2 === 0} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Action panel — only for non-daily sections with non-ZIP items */}
      {showAction && (
        <div className="mt-2 px-1">
          <SectionAction cadence={cadence} />
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DataInventoryPage() {
  const groups = pipelinesByGroup();

  return (
    <div className="min-h-dvh bg-[#0a0e1a] font-sans text-white">
      <div className="mx-auto max-w-screen-2xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 border-b border-white/10 pb-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500">
            <span className="text-[#0a8078]">SWFL Data Gulf</span>
            <span>·</span>
            <span>Internal Ops</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
            Data Lake — ZIP Grain &amp; Cadence Inventory
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-400">
            All 48 pipelines organized by ingestion schedule. Within each section,{" "}
            <span className="text-red-400">datasets without ZIP grain</span> appear first —
            these are the ones that need to go through the ZIP grain machine. Use the action
            button at the bottom of each section to track progress and add notes.
          </p>
          <div className="mt-2 text-xs text-gray-600">
            Source: <code className="text-gray-500">ingest/cadence_registry.yaml</code> ·
            Last synced 2026-06-14
          </div>
        </div>

        <SummaryBar />
        <Legend />

        {/* Sections */}
        {CADENCE_ORDER.map((cadence) => {
          const group = groups.get(cadence)!;
          return (
            <CadenceSection
              key={cadence}
              cadence={cadence}
              nonZip={group.nonZip}
              hasZip={group.hasZip}
            />
          );
        })}

        {/* Footer */}
        <div className="mt-8 border-t border-white/10 pt-6 text-xs text-gray-600">
          <p>
            Action state (done / notes) is stored in browser localStorage. Refresh to reload.
            Update cron notes directly in{" "}
            <code className="text-gray-500">ingest/cadence_registry.yaml</code> and redeploy to
            keep this page in sync.
          </p>
        </div>
      </div>
    </div>
  );
}
