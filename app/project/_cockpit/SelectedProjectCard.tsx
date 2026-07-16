// app/project/_cockpit/SelectedProjectCard.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmailPreviewFrame } from "@/app/p/[id]/EmailPreviewFrame";
import { projectEntry } from "@/lib/project/tool-tabs";

interface Preview {
  did: string;
  html: string;
}

/**
 * The spec's three verbs, one card: SEE IT = the frozen /p page · EDIT = the
 * doc in the lab (projectEntry) · UPDATE = POST update-doc (a superseded fork
 * with today's figures) then re-preview with a "review before you send"
 * banner. Update NEVER sends/schedules — the trust boundary is the route's,
 * this card only calls it.
 *
 * The parent MUST key this card by `${project.id}:${project.lastDid}` — a
 * selection change remounts it, so all state resets without any
 * setState-in-effect (react-hooks/set-state-in-effect is a hard error here).
 */
export function SelectedProjectCard({
  project,
  initialPreview,
}: {
  project: { id: string; title: string; lastDid: string | null } | null;
  initialPreview: Preview | null;
}) {
  // Server-rendered preview only counts when it matches THIS selection.
  const [preview, setPreview] = useState<Preview | null>(
    project?.lastDid && initialPreview?.did === project.lastDid ? initialPreview : null,
  );
  const [fetchFailed, setFetchFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No matching preview yet → fetch it. setState happens only in async
  // callbacks (never synchronously in the effect body).
  useEffect(() => {
    if (!project?.lastDid || preview) return;
    let alive = true;
    fetch(`/api/deliverables/${project.lastDid}/preview-html`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { html: string }) => {
        if (alive) setPreview({ did: project.lastDid!, html: j.html });
      })
      .catch(() => {
        if (alive) setFetchFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [project?.lastDid, preview]);

  async function update() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deliverables/${preview.did}/update-doc`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const { id: newDid } = (await res.json()) as { id: string };
      const pv = await fetch(`/api/deliverables/${newDid}/preview-html`);
      if (!pv.ok) throw new Error(String(pv.status));
      const { html } = (await pv.json()) as { html: string };
      setPreview({ did: newDid, html });
      setUpdated(true);
    } catch {
      setError("Couldn't refresh the figures — the saved version is untouched.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/8 bg-[#0f1d24] p-4">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
        Selected project
      </p>

      {!project ? (
        <p className="py-3 text-xs text-white/45">Pick a project in the rail and it shows here.</p>
      ) : !preview ? (
        <p className="py-3 text-xs text-white/45">
          {project.lastDid ? (
            fetchFailed ? (
              <>{"The preview couldn't load — open it in the lab instead. "}</>
            ) : (
              <>Loading the latest email… </>
            )
          ) : (
            <>{project.title} has no built email yet — </>
          )}
          <Link
            href={projectEntry(project.id, project.lastDid)}
            className="text-gulf-teal hover:underline"
          >
            {project.lastDid ? "Open in the lab →" : "Build the first email →"}
          </Link>
        </p>
      ) : (
        <>
          <p className="mb-2 truncate text-sm font-semibold text-white">{project.title}</p>
          {updated && (
            <p className="mb-2 rounded-lg border border-gulf-teal/30 bg-gulf-teal/10 px-3 py-1.5 text-[11px] text-gulf-teal">
              {"Refreshed with today's data — review before you send. Nothing was sent."}
            </p>
          )}
          {error && <p className="mb-2 text-[11px] text-amber-300/80">{error}</p>}
          <EmailPreviewFrame srcDoc={preview.html} />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <a
              href={`/p/${preview.did}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-gulf-teal/40 px-3 py-1.5 font-medium text-gulf-teal transition-colors hover:bg-gulf-teal/10"
            >
              See it
            </a>
            <Link
              href={projectEntry(project.id, preview.did)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-white/75 transition-colors hover:border-white/40 hover:text-white"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={() => void update()}
              disabled={busy}
              className="rounded-full border border-white/15 px-3 py-1.5 text-white/75 transition-colors hover:border-white/40 hover:text-white disabled:opacity-40"
            >
              {busy ? "Updating…" : "Update"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
