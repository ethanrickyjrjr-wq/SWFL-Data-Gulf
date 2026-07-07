// lib/project/watch-digest.ts
//
// Pure composition core for the Property Watch daily digest (spec 2026-07-07-property-watch-design.md).
// Groups un-notified nearby_* project_events by project into one digest each. No DB, no send, no
// Date.now() — the adapter (scripts/project-feed/watch-digest.mts) supplies the rows and owns the
// send + notified_at stamp.
//
// Every line is the event's already-deterministic ai_summary (built by watch-delta.describeWatchEvent),
// so no commentary is added here either — the digest is a plain concatenation of held facts.

export interface WatchEventForDigest {
  id: string;
  project_id: string;
  ai_summary: string | null;
  event_date: string;
  event_type: string;
  created_at: string;
}

export interface ProjectDigest {
  project_id: string;
  /** The events this digest covers — the adapter stamps notified_at on exactly these after a send. */
  event_ids: string[];
  subject: string;
  /** One plain-text line per event, newest first. */
  lines: string[];
}

/**
 * One digest per project that has at least one un-notified event. Events with a null/blank ai_summary
 * are dropped (nothing honest to say). A project whose events are all blank yields no digest. Newest
 * event first (by created_at, then event_date), so the freshest movement leads.
 */
export function groupWatchDigests(
  events: WatchEventForDigest[],
  projectTitleById: Map<string, string | null>,
): ProjectDigest[] {
  const byProject = new Map<string, WatchEventForDigest[]>();
  for (const e of events) {
    if (!e.ai_summary || !e.ai_summary.trim()) continue;
    (byProject.get(e.project_id) ?? byProject.set(e.project_id, []).get(e.project_id)!).push(e);
  }

  const out: ProjectDigest[] = [];
  for (const [projectId, evs] of byProject) {
    if (evs.length === 0) continue;
    evs.sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
      return a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : 0;
    });
    const title = projectTitleById.get(projectId)?.trim() || "your watched area";
    const n = evs.length;
    out.push({
      project_id: projectId,
      event_ids: evs.map((e) => e.id),
      subject: `${title} — ${n} nearby update${n === 1 ? "" : "s"}`,
      lines: evs.map((e) => e.ai_summary!.trim()),
    });
  }
  // Stable order: most events first, then project id, so a re-run prints identically.
  out.sort((a, b) => b.lines.length - a.lines.length || (a.project_id < b.project_id ? -1 : 1));
  return out;
}
