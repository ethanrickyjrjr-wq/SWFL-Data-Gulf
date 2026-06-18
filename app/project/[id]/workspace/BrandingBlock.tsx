"use client";

const BRANDING_FIELDS: { key: string; label: string }[] = [
  { key: "agent_name", label: "Agent name" },
  { key: "photo_url", label: "Photo URL" },
  { key: "license", label: "License #" },
  { key: "brokerage", label: "Brokerage" },
];

/**
 * Branding panel — rendered inside the Brand pill popover.
 * Auto-closes on successful save; the × button closes without saving.
 */
export function BrandingBlock({
  branding,
  onChange,
  onSave,
  saving,
  savedMsg,
  onClose,
}: {
  branding: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onSave: () => Promise<boolean>;
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
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            const ok = await onSave();
            if (ok) onClose();
          }}
          className="rounded-full bg-[#00d4aa] px-4 py-1.5 text-xs font-medium text-[#04121b] disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save branding"}
        </button>
        {savedMsg && <span className="text-xs text-gray-500">{savedMsg}</span>}
      </div>
    </div>
  );
}
