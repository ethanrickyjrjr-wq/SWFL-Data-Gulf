"use client";

// components/email-lab/DatasetChip.tsx — the provenance + freshness chip for a
// data-bound block, shown in the Now-Editing rail. Reads the block's binding
// (source line + as-of), offers Update when the source moved (Google-Docs
// linked-chart pattern), a shape switcher (turn-into), and a scope swap
// (rebind). Copy is product language — no system nouns.
import { useState } from "react";
import type { BlockBinding, BlockType } from "@/lib/email/doc/types";

const SHAPE_TARGETS: { type: BlockType; label: string }[] = [
  { type: "hero", label: "Headline figure" },
  { type: "stats", label: "Stat row" },
  { type: "metric-card", label: "Metric card" },
  { type: "list", label: "Ranked list" },
  { type: "image", label: "Chart" },
];

export function DatasetChip({
  binding,
  blockType,
  stale,
  unrefreshable,
  busy,
  onUpdate,
  onTurnInto,
  onRebind,
}: {
  binding: BlockBinding;
  blockType: BlockType;
  stale: boolean;
  unrefreshable: boolean;
  busy: boolean;
  onUpdate: () => void;
  onTurnInto: (t: BlockType) => void;
  onRebind: (params: Record<string, string>) => void;
}) {
  const paramEntries = Object.entries(binding.params ?? {});
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(paramEntries.map(([k, v]) => [k, String(v)])),
  );
  const [showScope, setShowScope] = useState(false);

  return (
    <div className="mt-2 rounded-md border border-gulf-teal/25 bg-gulf-teal/5 px-2.5 py-2">
      <p className="text-[10px] leading-snug text-white/55">
        {binding.sourceLine} · {binding.asOfLabel ?? "As of"} {binding.asOf}
      </p>
      {unrefreshable && (
        <p className="mt-1 text-[10px] text-white/35">
          Can&apos;t refresh — the values above are kept as saved.
        </p>
      )}
      {stale && !unrefreshable && (
        <button
          type="button"
          disabled={busy}
          onClick={onUpdate}
          className="mt-1.5 w-full rounded bg-[#f59e0b] px-2 py-1 text-[11px] font-semibold text-[#0a1419] disabled:opacity-40"
        >
          {busy ? "Updating…" : "Newer data available — Update"}
        </button>
      )}
      {!unrefreshable && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <select
            value={blockType}
            disabled={busy}
            onChange={(e) => onTurnInto(e.target.value as BlockType)}
            className="min-w-0 flex-1 rounded border border-white/10 bg-[#0a1822] px-1.5 py-1 text-[10px] text-white/60"
            aria-label="Show this data as"
          >
            {SHAPE_TARGETS.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
          {paramEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setShowScope((v) => !v)}
              className="rounded border border-white/10 px-1.5 py-1 text-[10px] text-white/50 hover:text-white/80"
            >
              Scope
            </button>
          )}
        </div>
      )}
      {showScope && (
        <div className="mt-1.5 flex flex-col gap-1">
          {paramEntries.map(([k]) => (
            <input
              key={k}
              value={draft[k] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              placeholder={k}
              className="rounded border border-white/10 bg-[#0a1822] px-1.5 py-1 text-[10px] text-white/60 placeholder:text-white/25"
            />
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setShowScope(false);
              onRebind(draft);
            }}
            className="rounded bg-gulf-teal/80 px-2 py-1 text-[10px] font-semibold text-[#0a1419] disabled:opacity-40"
          >
            Apply scope
          </button>
        </div>
      )}
    </div>
  );
}
