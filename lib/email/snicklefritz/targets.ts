// lib/email/snicklefritz/targets.ts
//
// Prospect "folders" — the per-target dossier the SNICKLEFRITZ pipeline pre-stages
// (discovery writes them; prep reads + enriches them). Each folder is a JSON file at
// data/prospects/<slug>/folder.json. PURE data layer + thin fs I/O; no network, no AI.
// Schema mirrors docs/superpowers/specs/2026-06-25-snicklefritz-email-system-design.md §4.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export interface ProspectMarket {
  zip: string;
  city: string;
  county: string;
}

/** Brand identity. `status:"pending"` until the prep brand-scrape fills it; then
 *  "scraped" (enrichBrand returned real colors) or "fallback" (scrape failed → house brand). */
export interface ProspectBrand {
  status: "pending" | "scraped" | "fallback";
  primary?: string | null;
  secondary?: string | null;
  logo_url?: string | null;
  company_name?: string | null;
  confidence?: number;
  source?: string;
}

export interface ProspectProvenance {
  field: string;
  value: string;
  source_url: string;
}

export interface ProspectFolder {
  slug: string;
  name: string;
  company: string;
  domain: string;
  role: "century21" | "independent";
  market: ProspectMarket;
  brand: ProspectBrand;
  contacts: Record<string, unknown>;
  provenance: ProspectProvenance[];
  discovered_at: string;
}

/** Repo-root-relative prospects dir. The CLIs run from the repo root (process.cwd()). */
export function prospectsDir(): string {
  return join(process.cwd(), "data", "prospects");
}

function folderPath(slug: string): string {
  return join(prospectsDir(), slug, "folder.json");
}

/** Load + JSON-parse one folder. Throws if missing/malformed (a real defect, not a no-op). */
export function loadFolder(slug: string): ProspectFolder {
  const p = folderPath(slug);
  if (!existsSync(p)) throw new Error(`prospect folder not found: ${p}`);
  return JSON.parse(readFileSync(p, "utf8")) as ProspectFolder;
}

/** Load every folder under data/prospects (each slug dir's folder.json), slug-sorted. */
export function loadAllFolders(): ProspectFolder[] {
  const dir = prospectsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((slug) => {
      const sub = join(dir, slug);
      return statSync(sub).isDirectory() && existsSync(join(sub, "folder.json"));
    })
    .sort()
    .map((slug) => loadFolder(slug));
}

/** Write a folder back (pretty-printed, trailing newline — diff-friendly). */
export function saveFolder(folder: ProspectFolder): void {
  writeFileSync(folderPath(folder.slug), JSON.stringify(folder, null, 2) + "\n", "utf8");
}
