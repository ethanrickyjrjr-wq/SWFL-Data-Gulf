"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { DRAFT_KEY } from "@/lib/highlighter/context";
import { projectItemsSchema } from "@/lib/project/items";

/**
 * Post-login migration: if the anonymous draft (`swfl_project_draft_v1`) holds
 * items when the user reaches the (auth-gated) /project area, POST it to
 * /api/projects/import, clear localStorage, and redirect to the new project.
 *
 * Side-effect-only effect: reads localStorage + fetches + navigates. It sets NO
 * React state (this repo treats react-hooks/set-state-in-effect as a hard error),
 * and a ref one-shots it so React 18 StrictMode double-invoke can't double-import.
 * On any failure the draft is left intact (no data loss) AND a
 * `draft_import_failed` meter beacon fires (reason tagged in `reach`) so dropped
 * drafts at login are VISIBLE in usage_events — never a silent swallow.
 */

/** Fire-and-forget failure beacon so a dropped draft is observable, not silent. */
function reportImportFailure(reason: string) {
  void fetch("/api/meter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "draft_import_failed", report_id: "", reach: [reason] }),
  }).catch(() => {});
}

export function ImportDraftOnLogin() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let items: ReturnType<typeof projectItemsSchema.safeParse>["data"];
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = projectItemsSchema.safeParse(JSON.parse(raw));
      if (!parsed.success || parsed.data.length === 0) return;
      items = parsed.data;
    } catch {
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/projects/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!res.ok) {
          reportImportFailure("server_rejected"); // draft intact; visible in usage_events
          return;
        }
        const { id } = (await res.json()) as { id?: string };
        localStorage.removeItem(DRAFT_KEY);
        if (id) router.replace(`/project/${id}`);
      } catch {
        reportImportFailure("network_error"); // draft stays, user can retry
      }
    })();
  }, [router]);

  return null;
}
