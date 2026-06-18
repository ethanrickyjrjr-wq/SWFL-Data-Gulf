"use client";

const BRANDING_FIELDS: { key: string; label: string }[] = [
  { key: "agent_name", label: "Agent name" },
  { key: "photo_url", label: "Photo URL" },
  { key: "license", label: "License #" },
  { key: "brokerage", label: "Brokerage" },
];

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
