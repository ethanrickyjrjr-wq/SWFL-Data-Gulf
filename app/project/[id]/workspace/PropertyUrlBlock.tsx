// app/project/[id]/workspace/PropertyUrlBlock.tsx
// The "Listing link" pill popover: one URL per project (same singular-anchor
// precedent as subject_address). Head of the artifact link chain — artifacts
// link here first, then the feed URL, else render unlinked. Saved via the
// project PATCH (owner-scoped by RLS); server re-validates shape.
"use client";
import { useState } from "react";

export function PropertyUrlBlock({
  projectId,
  initialUrl,
  onSaved,
  onClose,
}: {
  projectId: string;
  initialUrl: string | null;
  onSaved: (url: string | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const trimmed = value.trim();
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_url: trimmed || null }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Enter the full link, starting with https://");
      return;
    }
    onSaved(trimmed || null);
    onClose();
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">Property URL</p>
        <p className="mt-1 text-xs text-gray-400">
          Where readers land when they click this listing in your emails and posts — your own
          website&apos;s listing page. Leave blank to use the listing feed&apos;s page when
          available.
        </p>
      </div>
      <input
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://youragentsite.com/homes/123-main-st"
        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-gulf-teal focus:outline-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-1 text-xs font-semibold text-gray-300 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full bg-gulf-teal px-3 py-1 text-xs font-semibold text-[#04121b] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
