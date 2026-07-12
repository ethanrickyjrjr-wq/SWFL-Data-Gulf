// components/email-lab/dataset-browser-core.ts
//
// Pure logic behind the Datasets rail section (DatasetBrowser.tsx) — parsing
// the /api/concoctions index, param completeness, and placing loaded blocks
// onto an existing canvas. No React, no fetch — bun-testable (the lab's test
// convention: logic tests, not DOM renders).

export interface DatasetParamMeta {
  key: string;
  required: boolean;
  options?: string[];
}

export interface DatasetIndexEntry {
  id: string;
  label: string;
  description: string;
  category: string;
  tags: string[];
  params: DatasetParamMeta[];
}

/** Parse the GET /api/concoctions payload. Malformed entries are dropped, not thrown. */
export function parseIndex(json: unknown): DatasetIndexEntry[] {
  const raw = (json as { datasets?: unknown })?.datasets;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const d = e as Partial<DatasetIndexEntry> & { params?: unknown };
    if (typeof d.id !== "string" || typeof d.label !== "string") return [];
    return [
      {
        id: d.id,
        label: d.label,
        description: typeof d.description === "string" ? d.description : "",
        category: typeof d.category === "string" ? d.category : "Data",
        tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === "string") : [],
        params: Array.isArray(d.params)
          ? (d.params as DatasetParamMeta[]).filter((p) => typeof p?.key === "string")
          : [],
      },
    ];
  });
}

/** Every REQUIRED param has a non-empty value. */
export function paramsComplete(entry: DatasetIndexEntry, values: Record<string, string>): boolean {
  return entry.params.every((p) => !p.required || (values[p.key] ?? "").trim().length > 0);
}

/** Only non-empty values travel to the API (optional params stay unset). */
export function cleanParams(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => typeof v === "string" && v.trim().length > 0),
  );
}

/** The edit-armed auto-refresh rule (operator, 07/12/2026): fire exactly once
 *  per session, only when the per-doc dial is on AND something is actually
 *  stale — and only from an EDIT action, never an open. */
export function shouldAutoRefresh(s: {
  alwaysFresh: boolean;
  alreadyRan: boolean;
  anyStale: boolean;
}): boolean {
  return s.alwaysFresh && !s.alreadyRan && s.anyStale;
}

// Placement lives in lib (the server-side author seeder shares it); re-exported
// here so the lab components keep one import root.
export { placeLoadedBlocks } from "@/lib/concoctions/place-blocks";
