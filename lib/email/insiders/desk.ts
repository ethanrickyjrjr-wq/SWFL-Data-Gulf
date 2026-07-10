// lib/email/insiders/desk.ts
//
// The _FABLE5/ desk log parser — the ONLY reader of desk files. The dossier
// assembler (dossier.ts) and the desk SessionStart hook both consume this, so a
// malformed desk file fails HERE (shape check), never silently poisons issue day
// (spec: Error handling — "malformed desk file → fall back to raw scored events").

export interface DeskEntry {
  day: string; // MM/DD/YYYY (the ## heading it sits under)
  weight: 1 | 2 | 3 | 4 | 5;
  headline: string;
  url: string;
  areas: string[]; // free text tokens — ZIPs or place names
  seriesHint: string | null;
  why: string;
}

export interface DeskLog {
  month: string; // YYYY-MM
  lastVisited: string; // YYYY-MM-DD
  lastSeenPublishedAt: string | null; // ISO timestamp
  entries: DeskEntry[];
}

export type DeskParseResult = { ok: true; log: DeskLog } | { ok: false; errors: string[] };

const FRONT_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const DAY_RE = /^## (\d{2}\/\d{2}\/\d{4})\s*$/;
const ENTRY_RE = /^- \[(\d)\] (.+)$/;

function frontValue(front: string, key: string): string | null {
  const m = front.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

export function parseDeskLog(md: string): DeskParseResult {
  const errors: string[] = [];
  const fm = md.match(FRONT_RE);
  if (!fm) return { ok: false, errors: ["missing frontmatter (--- month/last_visited ---)"] };
  const month = frontValue(fm[1], "month");
  const lastVisited = frontValue(fm[1], "last_visited");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) errors.push("frontmatter: month must be YYYY-MM");
  if (!lastVisited || !/^\d{4}-\d{2}-\d{2}$/.test(lastVisited))
    errors.push("frontmatter: last_visited must be YYYY-MM-DD");

  const entries: DeskEntry[] = [];
  let day: string | null = null;
  for (const rawLine of md.slice(fm[0].length).split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const d = line.match(DAY_RE);
    if (d) {
      day = d[1];
      continue;
    }
    const e = line.match(ENTRY_RE);
    if (!e) continue;
    const weight = Number(e[1]);
    if (weight < 1 || weight > 5) {
      errors.push(`entry weight out of range 1-5: "${line.slice(0, 60)}"`);
      continue;
    }
    // " · " separates fields; first field is the headline, the rest are key: value.
    const parts = e[2].split(" · ").map((p) => p.trim());
    const headline = parts[0] ?? "";
    const kv = new Map<string, string>();
    for (const p of parts.slice(1)) {
      const i = p.indexOf(":");
      if (i > 0) kv.set(p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim());
    }
    const url = kv.get("url") ?? "";
    const why = kv.get("why") ?? "";
    if (!day) errors.push(`entry before any ## MM/DD/YYYY heading: "${headline}"`);
    if (!/^https?:\/\//.test(url)) errors.push(`entry missing url: "${headline}"`);
    if (!why) errors.push(`entry missing why: "${headline}"`);
    if (!day || !/^https?:\/\//.test(url) || !why) continue;
    entries.push({
      day,
      weight: weight as DeskEntry["weight"],
      headline,
      url,
      areas: (kv.get("areas") ?? "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      seriesHint: kv.get("series") ?? null,
      why,
    });
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    log: {
      month: month!,
      lastVisited: lastVisited!,
      lastSeenPublishedAt: frontValue(fm[1], "last_seen_published_at"),
      entries,
    },
  };
}
