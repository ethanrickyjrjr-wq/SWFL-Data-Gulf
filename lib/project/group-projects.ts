// lib/project/group-projects.ts
/**
 * Cockpit grouping (spec 2026-07-16 §3): sections by what a project IS
 * (kind), then city subgroups. A project lives in EXACTLY ONE section — other
 * facets ride as badges/chips on its row, never duplicate rows.
 */
import type { ProjectItem } from "@/lib/project/items";
import { inferScopeFromItems } from "@/lib/project/derive-name";
import { cityForZip } from "@/lib/swfl-zip-city";
import { displayProjectTitle } from "@/lib/project/display-title";
import type { ScheduleChip } from "@/lib/project/schedule-chips";

export type ProjectKind = "listing" | "showing-prep" | "general";

export interface CockpitProject {
  id: string;
  title: string | null;
  displayTitle: string;
  kind: ProjectKind;
  itemCount: number;
  built: number;
  lastDid: string | null;
  city: string | null;
  zip: string | null;
  chips: ScheduleChip[];
  hasSchedule: boolean;
  updatedAt: string;
}

export interface ProjectRowInput {
  id: string;
  title: string | null;
  kind: string | null;
  items: ProjectItem[] | null;
  updated_at: string;
}

export function toCockpitProjects(
  rows: ProjectRowInput[],
  opts: {
    chipsByProject?: Map<string, ScheduleChip[]>;
    scheduledIds?: Set<string>;
    builtByProject?: Map<string, number>;
    lastDidByProject?: Map<string, string>;
  } = {},
): CockpitProject[] {
  return rows.map((r) => {
    const kind: ProjectKind =
      r.kind === "listing" || r.kind === "showing-prep" ? r.kind : "general";
    const scope = inferScopeFromItems(r.items ?? []);
    const zip = scope.zip ?? null;
    const city = scope.place ?? (zip ? (cityForZip(zip) ?? null) : null);
    const chips = opts.chipsByProject?.get(r.id) ?? [];
    return {
      id: r.id,
      title: r.title,
      displayTitle: displayProjectTitle(r.title),
      kind,
      itemCount: r.items?.length ?? 0,
      built: opts.builtByProject?.get(r.id) ?? 0,
      lastDid: opts.lastDidByProject?.get(r.id) ?? null,
      city,
      zip,
      chips,
      hasSchedule: chips.length > 0 || (opts.scheduledIds?.has(r.id) ?? false),
      updatedAt: r.updated_at,
    };
  });
}

export type SectionKey = "listings" | "open-houses" | "campaigns" | "other";

export interface CitySubgroup {
  city: string | null;
  projects: CockpitProject[];
}

export interface Section {
  key: SectionKey;
  label: string;
  subgroups: CitySubgroup[];
  count: number;
}

const SECTION_ORDER: { key: SectionKey; label: string }[] = [
  { key: "listings", label: "Listings" },
  { key: "open-houses", label: "Open houses" },
  { key: "campaigns", label: "Campaigns" },
  { key: "other", label: "Other" },
];

function sectionKey(p: CockpitProject): SectionKey {
  if (p.kind === "listing") return "listings";
  if (p.kind === "showing-prep") return "open-houses";
  return p.hasSchedule ? "campaigns" : "other";
}

/** Input order (updated_at desc from the query) is preserved within a subgroup. */
export function groupProjects(projects: CockpitProject[]): Section[] {
  return SECTION_ORDER.flatMap(({ key, label }) => {
    const members = projects.filter((p) => sectionKey(p) === key);
    if (members.length === 0) return [];
    const byCity = new Map<string, CockpitProject[]>();
    const noCity: CockpitProject[] = [];
    for (const p of members) {
      if (!p.city) {
        noCity.push(p);
        continue;
      }
      const list = byCity.get(p.city) ?? [];
      list.push(p);
      byCity.set(p.city, list);
    }
    const subgroups: CitySubgroup[] = [...byCity.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((city) => ({ city, projects: byCity.get(city)! }));
    if (noCity.length > 0) subgroups.push({ city: null, projects: noCity });
    return [{ key, label, subgroups, count: members.length }];
  });
}

export function kindChipLabel(p: CockpitProject): string {
  if (p.kind === "listing") return "Listing";
  if (p.kind === "showing-prep") return "Open house";
  return p.hasSchedule ? "Campaign" : "Project";
}
