// components/email-lab/dataset-browser-core.ts
//
// Pure logic behind the Datasets rail section (DatasetBrowser.tsx) — parsing
// the /api/concoctions index, param completeness, and placing loaded blocks
// onto an existing canvas. No React, no fetch — bun-testable (the lab's test
// convention: logic tests, not DOM renders).
import type { EmailBlock } from "@/lib/email/doc/types";

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

function bottomY(blocks: EmailBlock[]): number {
  return blocks.reduce((max, b) => {
    const l = b.layout;
    return l ? Math.max(max, l.y + l.h) : max;
  }, 0);
}

/** Place freshly-loaded dataset blocks under the existing canvas content:
 *  relative layout preserved, everything shifted below the current bottom, and
 *  ids re-minted deterministically when they collide with blocks already on
 *  the canvas (loading the same dataset twice must not fork React keys). */
export function placeLoadedBlocks(existing: EmailBlock[], loaded: EmailBlock[]): EmailBlock[] {
  const base = bottomY(existing);
  const taken = new Set(existing.map((b) => b.id));
  return loaded.map((b) => {
    let id = b.id;
    let k = 2;
    while (taken.has(id)) id = `${b.id}-${k++}`;
    taken.add(id);
    const layout = b.layout
      ? { ...b.layout, y: b.layout.y + base }
      : { x: 0, y: base, w: 12, h: 4 };
    return { ...b, id, layout } as EmailBlock;
  });
}
