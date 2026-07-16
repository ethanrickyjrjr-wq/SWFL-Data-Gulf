// app/project/_cockpit/ConfirmDeleteProject.tsx
"use client";

import { useState } from "react";

/**
 * The ONE delete-confirm for projects (rail + hub cockpit). Names the project
 * and uses outcome-verb buttons — never Yes/No (spec 2026-07-16 §4).
 */
export function ConfirmDeleteProject({
  projectId,
  name,
  onClose,
  onDeleted,
}: {
  projectId: string;
  name: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) onDeleted();
      else setError("Delete failed — please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={() => {
          if (!deleting) onClose();
        }}
      />
      <div
        role="alertdialog"
        aria-label={`Delete ${name}?`}
        className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-[#0d1e2b] p-5 shadow-2xl"
      >
        <p className="text-sm font-semibold text-white">Delete &ldquo;{name}&rdquo;?</p>
        <p className="mt-1 text-xs text-gray-400">
          All items and deliverables will be permanently removed.
        </p>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleDelete()}
            className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
          >
            {deleting ? "Deleting…" : "Delete project"}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-gray-300 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gulf-teal"
          >
            Keep project
          </button>
        </div>
      </div>
    </>
  );
}
