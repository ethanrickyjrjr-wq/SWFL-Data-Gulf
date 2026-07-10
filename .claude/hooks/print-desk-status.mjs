#!/usr/bin/env node
// .claude/hooks/print-desk-status.mjs — SessionStart. ONE line of desk status:
//   "Desk: last visited 07/09/2026 (1d ago) · 4 news item(s) since last triage — run the desk triage"
// Fail-OPEN and fast: any error or a slow network (>1500ms) degrades to the local
// line or silence — a broken desk hook must never wedge a session. News count via
// PostgREST HEAD count on data_lake.news_articles_swfl (Accept-Profile header —
// the table is NOT in public; probed 07/10/2026). Creds resolve exactly like
// scripts/check.mjs: .dlt/secrets.toml first, env fallback.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const month = new Date().toISOString().slice(0, 7);
const deskPath = join(process.cwd(), "_FABLE5", "desk", `${month}.md`);

let md = "";
try {
  md = readFileSync(deskPath, "utf8");
} catch {
  console.log(
    `Desk: no desk file for ${month} — create _FABLE5/desk/${month}.md (see _FABLE5/FABLE5.md)`,
  );
  process.exit(0);
}

const visited = md.match(/^last_visited:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
const seen = md.match(/^last_seen_published_at:\s*(\S+)/m)?.[1];
if (!visited) {
  console.log(
    `Desk: ${month} desk file malformed (no last_visited) — fix _FABLE5/desk/${month}.md`,
  );
  process.exit(0);
}

const days = Math.max(0, Math.floor((Date.now() - Date.parse(`${visited}T00:00:00Z`)) / 86400000));

let newsLine = "";
try {
  const { resolveSupabaseCreds } = await import(
    new URL("../../scripts/lib/supabase-creds.mjs", import.meta.url)
  );
  let tomlText = "";
  try {
    tomlText = readFileSync(join(process.cwd(), ".dlt", "secrets.toml"), "utf8");
  } catch {
    /* no local secrets (CI) — env fallback below */
  }
  const c = resolveSupabaseCreds({ tomlText, env: process.env });
  if (c && seen) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(
      `${c.url}/rest/v1/news_articles_swfl?select=id&published_date=gt.${encodeURIComponent(seen.slice(0, 10))}`,
      {
        method: "HEAD",
        headers: {
          apikey: c.key,
          Authorization: `Bearer ${c.key}`,
          "Accept-Profile": "data_lake",
          Prefer: "count=exact",
        },
        signal: ctrl.signal,
      },
    );
    clearTimeout(t);
    const n = res.headers.get("content-range")?.split("/")[1];
    if (n && n !== "*") newsLine = ` · ${n} news item(s) since last triage`;
  }
} catch {
  /* fail open — local line still prints */
}

const [y, m, d] = visited.split("-");
const stale = days >= 1 ? " — run the desk triage (_FABLE5/FABLE5.md)" : "";
console.log(`Desk: last visited ${m}/${d}/${y} (${days}d ago)${newsLine}${stale}`);
