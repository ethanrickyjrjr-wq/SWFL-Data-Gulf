"use client";
// components/lab-entry/ProjectConfirmPopup.tsx
// Signed-in new-build arrival: "Build this in <project>?" over the blank canvas.
// No → flips to a single-field New Project form. Spec 2026-07-06 §B.
import { useState } from "react";

export interface ProjectConfirmPopupProps {
  projectTitle: string;
  onConfirm: () => void;
  onNewProject: (name: string) => Promise<void>;
  creating: boolean;
}

export function ProjectConfirmPopup({
  projectTitle,
  onConfirm,
  onNewProject,
  creating,
}: ProjectConfirmPopupProps) {
  const [mode, setMode] = useState<"confirm" | "new">("confirm");
  const [name, setName] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
        {mode === "confirm" ? (
          <>
            <h2 className="text-sm font-semibold text-white">Build this in {projectTitle}?</h2>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3]"
              >
                Yes, build in {projectTitle}
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className="rounded-lg border border-white/15 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                No — new project
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-white">New project</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none"
            />
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={!name.trim() || creating}
                onClick={() => void onNewProject(name.trim())}
                className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Save & build here"}
              </button>
              <button
                type="button"
                onClick={() => setMode("confirm")}
                className="py-1 text-xs text-white/40 hover:text-white/70"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
