"use client";

import { useState } from "react";

const BRANDING_FIELDS: { key: string; label: string }[] = [
  { key: "agent_name", label: "Agent name" },
  { key: "photo_url", label: "Photo URL" },
  { key: "license", label: "License #" },
  { key: "brokerage", label: "Brokerage" },
];

// The three saved-color slots. The first two map onto the canonical theme
// fields (`primary_color` / `accent_color`) read by brand-theme.ts, so saving
// them actually themes deliverables; the third is a free extra swatch.
const COLOR_SLOTS: { key: string; label: string }[] = [
  { key: "primary_color", label: "Primary" },
  { key: "accent_color", label: "Accent" },
  { key: "saved_color_3", label: "Extra" },
];

// The color chart — a fixed palette you can pick from instead of typing a hex.
const COLOR_CHART: string[] = [
  "#00d4aa", "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899",
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#3b82f6",
  "#0f172a", "#334155", "#64748b", "#cbd5e1", "#ffffff",
];

/** Normalize loose hex input (`abc`, `#ABC`, `001122`) to `#rrggbb`, or null. */
function normalizeHex(raw: string): string | null {
  let v = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) v = v.split("").map((c) => c + c).join("");
  if (/^[0-9a-f]{6}$/.test(v)) return `#${v}`;
  return null;
}

/**
 * Branding panel — rendered inside the Brand pill popover.
 * Two save modes:
 *   "Save"               → writes to user's account default + current project
 *   "Save To This Project" → writes to current project only
 * Auto-closes on successful save; the × button closes without saving.
 */
export function BrandingBlock({
  branding,
  onChange,
  onSaveGlobal,
  onSaveProjectOnly,
  saving,
  savedMsg,
  onClose,
}: {
  branding: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onSaveGlobal: () => Promise<boolean>;
  onSaveProjectOnly: () => Promise<boolean>;
  saving: boolean;
  savedMsg: string | null;
  onClose: () => void;
}) {
  // The color currently held in the picker — typed as hex or picked from the
  // chart, then dropped into one of the three save slots.
  const [draft, setDraft] = useState("#00d4aa");
  const [hexText, setHexText] = useState("#00d4aa");

  function setColor(raw: string) {
    setHexText(raw);
    const hex = normalizeHex(raw);
    if (hex) setDraft(hex);
  }

  function saveToSlot(key: string) {
    onChange({ ...branding, [key]: draft });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-white">Branding</span>
          <span className="ml-2 text-xs text-gray-500">Appears on shared deliverables.</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full px-2 text-lg leading-none text-gray-500 hover:text-gray-300"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {BRANDING_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs text-gray-400">
            {f.label}
            <input
              value={branding[f.key] ?? ""}
              onChange={(e) => onChange({ ...branding, [f.key]: e.target.value })}
              className="rounded-lg border border-white/10 bg-[#04121b] px-2 py-1.5 text-sm text-white outline-none focus:border-[#00d4aa]/40"
            />
          </label>
        ))}
      </div>

      {/* Brand colors — type a hex or pick from the chart, then save to a slot. */}
      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-white">Brand colors</span>
          <span className="text-[10px] text-gray-500">Type a hex or pick from the chart.</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            aria-label="Selected color"
            className="h-8 w-8 shrink-0 rounded-lg border border-white/15"
            style={{ backgroundColor: draft }}
          />
          <input
            value={hexText}
            onChange={(e) => setColor(e.target.value)}
            onBlur={() => setHexText(draft)}
            placeholder="#00d4aa"
            aria-label="Hex color"
            spellCheck={false}
            className="w-28 rounded-lg border border-white/10 bg-[#04121b] px-2 py-1.5 font-mono text-sm text-white outline-none focus:border-[#00d4aa]/40"
          />
          <input
            type="color"
            value={draft}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Color picker"
            className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
          />
        </div>

        {/* The color chart */}
        <div className="mt-2 grid grid-cols-10 gap-1">
          {COLOR_CHART.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Pick ${c}`}
              title={c}
              className={`h-5 w-full rounded border ${
                draft.toLowerCase() === c.toLowerCase()
                  ? "border-white ring-1 ring-white"
                  : "border-white/15 hover:border-white/50"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Three save slots */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {COLOR_SLOTS.map((slot) => {
            const saved = branding[slot.key] ?? "";
            return (
              <div key={slot.key} className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400">{slot.label}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => saved && setColor(saved)}
                    aria-label={saved ? `Load ${slot.label} (${saved})` : `${slot.label} empty`}
                    title={saved || "empty"}
                    className="h-7 w-7 shrink-0 rounded-md border border-white/15"
                    style={
                      saved
                        ? { backgroundColor: saved }
                        : {
                            backgroundImage:
                              "repeating-linear-gradient(45deg,#0c2330 0 4px,#04121b 4px 8px)",
                          }
                    }
                  />
                  <button
                    type="button"
                    onClick={() => saveToSlot(slot.key)}
                    className="flex-1 rounded-md border border-white/15 px-1 py-1 text-[10px] text-gray-300 hover:border-[#00d4aa]/50 hover:text-white"
                  >
                    Save
                  </button>
                  {saved && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...branding, [slot.key]: "" })}
                      aria-label={`Clear ${slot.label}`}
                      className="rounded px-1 text-sm leading-none text-gray-500 hover:text-gray-300"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              const ok = await onSaveGlobal();
              if (ok) onClose();
            }}
            className="rounded-full bg-[#00d4aa] px-4 py-1.5 text-xs font-medium text-[#04121b] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              const ok = await onSaveProjectOnly();
              if (ok) onClose();
            }}
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-gray-300 hover:border-white/40 disabled:opacity-40"
          >
            Save To This Project
          </button>
          {savedMsg && <span className="text-xs text-gray-500">{savedMsg}</span>}
        </div>
        <p className="text-[10px] text-gray-600">
          &quot;Save&quot; also sets your default for new projects.
        </p>
      </div>
    </div>
  );
}
