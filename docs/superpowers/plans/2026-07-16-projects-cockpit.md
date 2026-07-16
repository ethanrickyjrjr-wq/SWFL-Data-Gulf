# Projects Hub Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 8 tasks, 15 files, keywords: refactor, architecture

**Goal:** Rebuild `/project` as a two-pane cockpit (grouped project list + selected-project panel) sharing chrome with the in-project tools, per `docs/superpowers/specs/2026-07-16-projects-cockpit-design.md`.

**Architecture:** Three pure helpers in `lib/project/` (title display, schedule chips, grouping) feed a server page that renders one of two client bodies: `ProjectsCockpit` (list + panel) or `EmptyLaunchpad` (zero projects). The rail is reworked to consume the same grouping and hides on the hub. The email lab, social cockpit, and all send plumbing are untouched.

**Tech Stack:** Next.js App Router (RSC + client components), Supabase cookie client (RLS), Tailwind, bun:test.

## Global Constraints

- Verify with `bunx next build` — NEVER `npx tsc` (operator rule).
- `react-hooks/set-state-in-effect` is a hard ESLint error — no setState inside effects; use state initializers.
- `h-full`/`dvh`, never `h-screen`.
- User-facing copy: no internal system nouns, no pack/brain jargon.
- Git: stage explicit paths only (`git add <paths>`), never `git add -A`, never `--no-verify`. Commit per task. Do NOT push — the operator pushes (or approves a push) after review; SESSION_LOG entry required in the same push.
- Existing behavior that must NOT change: opening a project lands on its Email tool (`projectHome`), a remembered `lastDid` reopens the same doc via `openDoc`, delete goes through `DELETE /api/projects/[id]`.
- The check `projects_cockpit_live_verify` is already open; it closes only after live verification post-deploy, not from this plan.

**Existing signatures used throughout (do not re-derive):**
- `projectHome(id: string): string` → `/project/${id}/email-lab` (`lib/project/tool-tabs.ts`)
- `openDoc(projectId: string, did: string, opts?: { schedule?: boolean }): string` and `projectEmailLabBase(projectId: string): string` (`lib/lab-entry/destination.ts`)
- `inferScopeFromItems(items: ProjectItem[]): { zip?: string; place?: string; topic?: string }` (`lib/project/derive-name.ts`)
- `cityForZip(zip: string): string | undefined` (`lib/swfl-zip-city.ts`)
- `describeCadence({ cadence, day_of_week, day_of_month, send_hour_et }): string` and `formatScheduleSendTime(iso: string): string` (`lib/email/schedule-cadence.ts`)
- `CampaignQuickStart({ surface, projectId?, onUseRecipe?, variant? })` (`components/campaigns/CampaignQuickStart.tsx`)
- Contacts count source: `public.contacts` (the `/contacts` page + `GET /api/contacts` read this table; `email_contacts` is the send pipeline — do not count that one).

---

### Task 1: Title display helper

**Files:**
- Create: `lib/project/display-title.ts`
- Test: `lib/project/display-title.test.ts`

**Interfaces:**
- Produces: `displayProjectTitle(title: string | null): string` — used by Tasks 3, 4, 6.

- [ ] **Step 1: Write the failing test**

```ts
// lib/project/display-title.test.ts
import { describe, expect, test } from "bun:test";
import { displayProjectTitle } from "./display-title";

describe("displayProjectTitle", () => {
  test("strips ', FL 33991' state+zip tail", () => {
    expect(displayProjectTitle("2006 SW 15th Ave, Cape Coral, FL 33991")).toBe(
      "2006 SW 15th Ave, Cape Coral",
    );
  });
  test("strips ', FL' state-only tail", () => {
    expect(displayProjectTitle("2006 SW 15th Ave, Cape Coral, FL")).toBe(
      "2006 SW 15th Ave, Cape Coral",
    );
  });
  test("strips spelled-out Florida", () => {
    expect(displayProjectTitle("123 Main St, Naples, Florida")).toBe("123 Main St, Naples");
  });
  test("strips zip+4", () => {
    expect(displayProjectTitle("123 Main St, Naples, FL 34102-1234")).toBe("123 Main St, Naples");
  });
  test("strips bare trailing ZIP (auto-named 'Place 33931' projects)", () => {
    expect(displayProjectTitle("Fort Myers Beach 33931")).toBe("Fort Myers Beach");
  });
  test("non-address titles pass through", () => {
    expect(displayProjectTitle("Del Prado Test")).toBe("Del Prado Test");
  });
  test("a lone ZIP is not stripped to empty", () => {
    expect(displayProjectTitle("33901")).toBe("33901");
  });
  test("null/empty → Untitled project", () => {
    expect(displayProjectTitle(null)).toBe("Untitled project");
    expect(displayProjectTitle("  ")).toBe("Untitled project");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/project/display-title.test.ts`
Expected: FAIL — cannot resolve `./display-title`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/project/display-title.ts
/**
 * Cockpit display rule (spec 2026-07-16 §4): list/rail rows show an address
 * title only up to the city — "2006 SW 15th Ave, Cape Coral", never
 * "…, FL 33991". The full title (with state/ZIP) stays on the panel header.
 * Non-address titles pass through untouched.
 */
const STATE_TAIL = /[,\s]+(FL|Fla\.?|Florida)\.?(\s+\d{5}(-\d{4})?)?\s*$/i;
const ZIP_TAIL = /[,\s]+\d{5}(-\d{4})?\s*$/;

export function displayProjectTitle(title: string | null): string {
  const t = (title ?? "").trim();
  if (!t) return "Untitled project";
  let out = t.replace(STATE_TAIL, "");
  if (out === t) out = t.replace(ZIP_TAIL, "");
  out = out.replace(/[,\s]+$/, "").trim();
  return out || t;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/project/display-title.test.ts`
Expected: 8 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/project/display-title.ts lib/project/display-title.test.ts
git commit -m "feat(cockpit): displayProjectTitle — address titles render up to city" -- lib/project/display-title.ts lib/project/display-title.test.ts
```

---

### Task 2: Schedule-chips helper (lift out of the hub page)

**Files:**
- Create: `lib/project/schedule-chips.ts`
- Test: `lib/project/schedule-chips.test.ts`
- 🔴 Modify: `app/project/page.tsx` (consume the helper; delete the inline copy)

**Interfaces:**
- Produces (used by Tasks 5, 6):

```ts
export interface ScheduleChip {
  key: string;
  kind: "email" | "social";
  status: string; // "active" | "paused"
  line: string;
  audience: string | null;
  nextAt: string | null;
  href: string;
}
export interface EmailScheduleRow { id: string | number; project_id: string | null; status: string; cadence: string; day_of_week: number | null; day_of_month: number | null; send_hour_et: number; audience_slug: string | null; next_run_at: string | null; deliverable_id: string | null; }
export interface SocialScheduleRow { id: string | number; project_id: string | null; status: string; cadence: string; day_of_week: number | null; day_of_month: number | null; send_hour_et: number; platform: string; next_run_at: string | null; }
export interface ScheduleChipSummary { chipsByProject: Map<string, ScheduleChip[]>; allChips: ScheduleChip[]; activeCount: number; upcoming: ScheduleChip[]; }
export function chipTime(nextAt: string | null): string | null;
export function buildScheduleChips(emailSch: EmailScheduleRow[], socialSch: SocialScheduleRow[], opts?: { upcomingLimit?: number }): ScheduleChipSummary;
```

- [ ] **Step 1: Write the failing test**

```ts
// lib/project/schedule-chips.test.ts
import { describe, expect, test } from "bun:test";
import { buildScheduleChips } from "./schedule-chips";

const email = (over = {}) => ({
  id: 1, project_id: "p1", status: "active", cadence: "weekly", day_of_week: 1,
  day_of_month: null, send_hour_et: 7, audience_slug: "farm",
  next_run_at: "2026-07-20T11:00:00Z", deliverable_id: "d1", ...over,
});
const social = (over = {}) => ({
  id: 9, project_id: "p1", status: "active", cadence: "weekly", day_of_week: 1,
  day_of_month: null, send_hour_et: 10, platform: "facebook",
  next_run_at: "2026-07-21T14:00:00Z", ...over,
});

describe("buildScheduleChips", () => {
  test("email chip: line, audience, tailor href with did+schedule", () => {
    const { chipsByProject } = buildScheduleChips([email()], []);
    const chip = chipsByProject.get("p1")![0];
    expect(chip.kind).toBe("email");
    expect(chip.line.startsWith("Emails ")).toBe(true);
    expect(chip.audience).toBe("farm");
    expect(chip.href).toBe("/project/p1/email-lab?did=d1&schedule=1");
  });
  test("email chip without deliverable falls back to projectHome", () => {
    const { chipsByProject } = buildScheduleChips([email({ deliverable_id: null })], []);
    expect(chipsByProject.get("p1")![0].href).toBe("/project/p1/email-lab");
  });
  test("social chip: platform line + social href", () => {
    const { chipsByProject } = buildScheduleChips([], [social()]);
    const chip = chipsByProject.get("p1")![0];
    expect(chip.kind).toBe("social");
    expect(chip.line.startsWith("Posts to facebook ")).toBe(true);
    expect(chip.href).toBe("/project/p1/social");
  });
  test("null project_id chips are excluded from the map but counted", () => {
    const s = buildScheduleChips([email({ project_id: null })], []);
    expect(s.chipsByProject.size).toBe(0);
    expect(s.activeCount).toBe(1);
  });
  test("upcoming: active-with-nextAt only, soonest first, limited", () => {
    const s = buildScheduleChips(
      [email(), email({ id: 2, status: "paused" })],
      [social()],
      { upcomingLimit: 1 },
    );
    expect(s.activeCount).toBe(2);
    expect(s.upcoming.length).toBe(1);
    expect(s.upcoming[0].key).toBe("e1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/project/schedule-chips.test.ts`
Expected: FAIL — cannot resolve `./schedule-chips`.

- [ ] **Step 3: Write the implementation** (lifted verbatim from today's `app/project/page.tsx` lines 34–156 fold, generalized)

```ts
// lib/project/schedule-chips.ts
/**
 * Fold raw email/social schedule rows into plain-English display chips —
 * lifted from app/project/page.tsx (control-center build, 07/03/2026) so the
 * cockpit hub, panel, and rail consume ONE shape. Pure; no Supabase.
 */
import {
  describeCadence,
  formatScheduleSendTime,
  type Cadence,
} from "@/lib/email/schedule-cadence";
import { projectHome } from "@/lib/project/tool-tabs";

export interface ScheduleChip {
  key: string;
  kind: "email" | "social";
  status: string;
  line: string;
  audience: string | null;
  nextAt: string | null;
  href: string;
}

export interface EmailScheduleRow {
  id: string | number;
  project_id: string | null;
  status: string;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  audience_slug: string | null;
  next_run_at: string | null;
  deliverable_id: string | null;
}

export interface SocialScheduleRow {
  id: string | number;
  project_id: string | null;
  status: string;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
  platform: string;
  next_run_at: string | null;
}

export interface ScheduleChipSummary {
  chipsByProject: Map<string, ScheduleChip[]>;
  allChips: ScheduleChip[];
  activeCount: number;
  upcoming: ScheduleChip[];
}

export function chipTime(nextAt: string | null): string | null {
  if (!nextAt) return null;
  const t = formatScheduleSendTime(nextAt);
  return t || null;
}

export function buildScheduleChips(
  emailSch: EmailScheduleRow[],
  socialSch: SocialScheduleRow[],
  opts: { upcomingLimit?: number } = {},
): ScheduleChipSummary {
  const upcomingLimit = opts.upcomingLimit ?? 3;
  const chipsByProject = new Map<string, ScheduleChip[]>();
  const allChips: ScheduleChip[] = [];

  function add(pid: string | null, chip: ScheduleChip) {
    allChips.push(chip);
    if (!pid) return;
    const list = chipsByProject.get(pid) ?? [];
    list.push(chip);
    chipsByProject.set(pid, list);
  }

  for (const s of emailSch) {
    add(s.project_id, {
      key: `e${s.id}`,
      kind: "email",
      status: s.status,
      line: `Emails ${describeCadence({
        cadence: s.cadence as Cadence,
        day_of_week: s.day_of_week,
        day_of_month: s.day_of_month,
        send_hour_et: s.send_hour_et,
      })}`,
      audience: s.audience_slug,
      nextAt: s.next_run_at,
      href:
        s.project_id && s.deliverable_id
          ? `/project/${s.project_id}/email-lab?did=${s.deliverable_id}&schedule=1`
          : s.project_id
            ? projectHome(s.project_id)
            : "/project",
    });
  }
  for (const s of socialSch) {
    add(s.project_id, {
      key: `s${s.id}`,
      kind: "social",
      status: s.status,
      line: `Posts to ${s.platform} ${describeCadence({
        cadence: s.cadence as Cadence,
        day_of_week: s.day_of_week,
        day_of_month: s.day_of_month,
        send_hour_et: s.send_hour_et,
      })}`,
      audience: null,
      nextAt: s.next_run_at,
      href: s.project_id ? `/project/${s.project_id}/social` : "/project",
    });
  }

  const upcoming = allChips
    .filter((c) => c.status === "active" && c.nextAt)
    .sort((a, b) => (a.nextAt! < b.nextAt! ? -1 : 1))
    .slice(0, upcomingLimit);
  const activeCount = allChips.filter((c) => c.status === "active").length;
  return { chipsByProject, allChips, activeCount, upcoming };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/project/schedule-chips.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Point `app/project/page.tsx` at the helper**

In `app/project/page.tsx`: delete the local `ScheduleChip` interface, `chipTime`, and the whole fold (the `chipsByProject`/`addChip`/two `for` loops/`upcoming`/`activeCount` block, roughly lines 34–156 of the current file). Replace with:

```ts
import { buildScheduleChips, chipTime } from "@/lib/project/schedule-chips";
// … inside the component, after the Promise.all:
const { chipsByProject, activeCount, upcoming } = buildScheduleChips(
  emailSch ?? [],
  socialSch ?? [],
);
```

The rest of the page renders unchanged (this task is a pure lift — zero visual change).

- [ ] **Step 6: Verify the page still compiles**

Run: `bunx next build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add lib/project/schedule-chips.ts lib/project/schedule-chips.test.ts app/project/page.tsx
git commit -m "refactor(cockpit): lift schedule-chip fold into lib/project/schedule-chips" -- lib/project/schedule-chips.ts lib/project/schedule-chips.test.ts app/project/page.tsx
```

---

### Task 3: Grouping helper (type → city)

**Files:**
- Create: `lib/project/group-projects.ts`
- Test: `lib/project/group-projects.test.ts`

**Interfaces:**
- Consumes: `displayProjectTitle` (Task 1), `ScheduleChip` (Task 2), `inferScopeFromItems`, `cityForZip`.
- Produces (used by Tasks 4, 5, 6):

```ts
export type ProjectKind = "listing" | "showing-prep" | "general";
export interface CockpitProject {
  id: string; title: string | null; displayTitle: string; kind: ProjectKind;
  itemCount: number; built: number; lastDid: string | null;
  city: string | null; zip: string | null;
  chips: ScheduleChip[]; hasSchedule: boolean; updatedAt: string;
}
export interface ProjectRowInput { id: string; title: string | null; kind: string | null; items: ProjectItem[] | null; updated_at: string; }
export function toCockpitProjects(rows: ProjectRowInput[], opts?: {
  chipsByProject?: Map<string, ScheduleChip[]>;
  scheduledIds?: Set<string>;
  builtByProject?: Map<string, number>;
  lastDidByProject?: Map<string, string>;
}): CockpitProject[];
export type SectionKey = "listings" | "open-houses" | "campaigns" | "other";
export interface CitySubgroup { city: string | null; projects: CockpitProject[] }
export interface Section { key: SectionKey; label: string; subgroups: CitySubgroup[]; count: number }
export function groupProjects(projects: CockpitProject[]): Section[];
export function kindChipLabel(p: CockpitProject): string; // "Listing" | "Open house" | "Campaign" | "Project"
```

- [ ] **Step 1: Write the failing test**

```ts
// lib/project/group-projects.test.ts
import { describe, expect, test } from "bun:test";
import { groupProjects, kindChipLabel, toCockpitProjects } from "./group-projects";
import type { ProjectItem } from "@/lib/project/items";

const addrItem = (address: string): ProjectItem =>
  ({ kind: "address", address, added_at: "2026-07-01T00:00:00Z" }) as ProjectItem;

const row = (over = {}) => ({
  id: "p1",
  title: "2006 SW 15th Ave, Cape Coral, FL 33991",
  kind: "listing",
  items: [addrItem("2006 SW 15th Ave, Cape Coral, FL 33991")],
  updated_at: "2026-07-15T00:00:00Z",
  ...over,
});

describe("toCockpitProjects", () => {
  test("derives displayTitle, city, zip from items", () => {
    const [p] = toCockpitProjects([row()]);
    expect(p.displayTitle).toBe("2006 SW 15th Ave, Cape Coral");
    expect(p.zip).toBe("33991");
    expect(p.city).toBe("Cape Coral");
  });
  test("unknown kind falls back to general; hasSchedule from scheduledIds", () => {
    const [p] = toCockpitProjects([row({ kind: "bogus" })], {
      scheduledIds: new Set(["p1"]),
    });
    expect(p.kind).toBe("general");
    expect(p.hasSchedule).toBe(true);
  });
});

describe("groupProjects", () => {
  test("sections: listing / showing-prep / general+schedule / general", () => {
    const projects = toCockpitProjects(
      [
        row({ id: "a", kind: "listing" }),
        row({ id: "b", kind: "showing-prep" }),
        row({ id: "c", kind: "general", title: "Newsletter", items: [] }),
        row({ id: "d", kind: "general", title: "Del Prado Test", items: [] }),
      ],
      { scheduledIds: new Set(["c"]) },
    );
    const keys = groupProjects(projects).map((s) => s.key);
    expect(keys).toEqual(["listings", "open-houses", "campaigns", "other"]);
  });
  test("empty sections are omitted", () => {
    const projects = toCockpitProjects([row({ id: "a", kind: "listing" })]);
    expect(groupProjects(projects).map((s) => s.key)).toEqual(["listings"]);
  });
  test("city subgroups alphabetical, null-city last, input order kept in-group", () => {
    const projects = toCockpitProjects([
      row({ id: "a", title: "9 Oak St, Fort Myers, FL 33901", items: [addrItem("9 Oak St, Fort Myers, FL 33901")] }),
      row({ id: "b" }), // Cape Coral
      row({ id: "c", title: "No scope", items: [] }),
      row({ id: "d" }), // Cape Coral, later row → after b within the subgroup
    ]);
    const [listings] = groupProjects(projects);
    expect(listings.subgroups.map((g) => g.city)).toEqual(["Cape Coral", "Fort Myers", null]);
    expect(listings.subgroups[0].projects.map((p) => p.id)).toEqual(["b", "d"]);
    expect(listings.count).toBe(4);
  });
});

describe("kindChipLabel", () => {
  test("labels", () => {
    const [l, s, c, g] = toCockpitProjects(
      [
        row({ id: "l", kind: "listing" }),
        row({ id: "s", kind: "showing-prep" }),
        row({ id: "c", kind: "general" }),
        row({ id: "g", kind: "general" }),
      ],
      { scheduledIds: new Set(["c"]) },
    );
    expect(kindChipLabel(l)).toBe("Listing");
    expect(kindChipLabel(s)).toBe("Open house");
    expect(kindChipLabel(c)).toBe("Campaign");
    expect(kindChipLabel(g)).toBe("Project");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/project/group-projects.test.ts`
Expected: FAIL — cannot resolve `./group-projects`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/project/group-projects.test.ts`
Expected: all pass. (If the Fort Myers fixture ZIP surprises you: 33901 and 33991 both resolve via the gazetteer/`cityForZip`; assertions only use resolved names.)

- [ ] **Step 5: Commit**

```bash
git add lib/project/group-projects.ts lib/project/group-projects.test.ts
git commit -m "feat(cockpit): groupProjects — type→city sections, one home per project" -- lib/project/group-projects.ts lib/project/group-projects.test.ts
```

---

### Task 4: Shared delete modal + kebab menu; rail rework

**Files:**
- Create: `app/project/_cockpit/ConfirmDeleteProject.tsx`
- Create: `app/project/_cockpit/RowMenu.tsx`
- Modify: `app/project/ProjectsRail.tsx` (full rework below)
- Modify: `app/project/layout.tsx` (feed kind + schedule flags; pass sections)

**Interfaces:**
- Consumes: `groupProjects`, `toCockpitProjects`, `CockpitProject`, `Section` (Task 3).
- Produces (used by Task 6):
  - `ConfirmDeleteProject({ projectId, name, onClose, onDeleted }: { projectId: string; name: string; onClose: () => void; onDeleted: () => void })` — renders the overlay+dialog, performs the DELETE itself, calls `onDeleted` on success.
  - `RowMenu({ items }: { items: { label: string; onSelect: () => void; tone?: "danger" }[] })` — visible ⋯ button + popover menu.

- [ ] **Step 1: Create `ConfirmDeleteProject.tsx`**

```tsx
// app/project/_cockpit/ConfirmDeleteProject.tsx
"use client";

import { useState } from "react";

/**
 * The ONE delete-confirm for projects (rail + hub cockpit). Names the project
 * and uses outcome-verb buttons — never Yes/No (spec 2026-07-16 §4).
 */
export function ConfirmDeleteProject({
  projectId,
  name,
  onClose,
  onDeleted,
}: {
  projectId: string;
  name: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) onDeleted();
      else setError("Delete failed — please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={() => {
          if (!deleting) onClose();
        }}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-[#0d1e2b] p-5 shadow-2xl">
        <p className="text-sm font-semibold text-white">Delete &ldquo;{name}&rdquo;?</p>
        <p className="mt-1 text-xs text-gray-400">
          All items and deliverables will be permanently removed.
        </p>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleDelete()}
            className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete project"}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-gray-300 disabled:opacity-50"
          >
            Keep project
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create `RowMenu.tsx`**

```tsx
// app/project/_cockpit/RowMenu.tsx
"use client";

import { useState } from "react";

/**
 * Visible ⋯ row-action menu (spec 2026-07-16 §4) — replaces the rail's
 * trash-mode toggle. Always-visible signifier; hover-only reveals are
 * accelerators, not the primary affordance.
 */
export function RowMenu({
  items,
  label,
}: {
  items: { label: string; onSelect: () => void; tone?: "danger" }[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-full px-1.5 py-0.5 text-sm leading-none text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
      >
        ⋯
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="absolute right-0 z-40 mt-1 w-36 rounded-lg border border-white/15 bg-[#0d1e2b] py-1 shadow-xl">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  it.onSelect();
                }}
                className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5 ${
                  it.tone === "danger" ? "text-red-400" : "text-gray-200"
                }`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Feed the rail from `app/project/layout.tsx`**

In the layout: add `kind` to the projects select, add two slim schedule reads, build sections. Replace the `projects: RailProject[]` mapping block with:

```ts
const [{ data: emailIds }, { data: socialIds }] = await Promise.all([
  supabase.from("email_schedules").select("project_id").in("status", ["active", "paused"]),
  supabase.from("social_schedules").select("project_id").in("status", ["active", "paused"]),
]);
const scheduledIds = new Set<string>(
  [...(emailIds ?? []), ...(socialIds ?? [])]
    .map((r) => r.project_id as string | null)
    .filter((x): x is string => !!x),
);
const cockpitProjects = toCockpitProjects(
  (data as ProjectRowInput[] | null) ?? [],
  { scheduledIds, lastDidByProject },
);
const sections = groupProjects(cockpitProjects);
```

with the projects select becoming `select("id, title, kind, items, updated_at")`, imports

```ts
import {
  groupProjects,
  toCockpitProjects,
  type ProjectRowInput,
} from "@/lib/project/group-projects";
```

and `<ProjectsRail projects={projects} />` becoming `<ProjectsRail sections={sections} />`. Delete the now-unused `RailProject` import and the old mapping. Everything else in the layout (search index, deliverables fold) stays.

- [ ] **Step 4: Rework `app/project/ProjectsRail.tsx`** — replace the whole file:

```tsx
// app/project/ProjectsRail.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { projectHome } from "@/lib/project/tool-tabs";
import { openDoc } from "@/lib/lab-entry/destination";
import type { Section } from "@/lib/project/group-projects";
import { SendCeilingMeter } from "@/components/email/SendCeilingMeter";
import { ConfirmDeleteProject } from "./_cockpit/ConfirmDeleteProject";
import { RowMenu } from "./_cockpit/RowMenu";

/**
 * The persistent left projects rail (Piece 1 §A), cockpit rework (spec
 * 2026-07-16): grouped section headers, titles shown up to the city, a
 * visible ⋯ menu per row (trash-mode toggle removed), 288px wide. Hidden on
 * the hub itself — `/project`'s body IS the expanded list — and on mobile.
 */
export function ProjectsRail({ sections }: { sections: Section[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);

  // The hub body is the expanded grouped list — a second copy here is noise.
  if (pathname === "/project") return null;

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Untitled project" }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (res.ok && data.id) router.push(projectHome(data.id));
    } finally {
      setCreating(false);
    }
  }

  const empty = sections.length === 0;

  return (
    <>
      <nav
        aria-label="Your projects"
        className="hidden w-72 shrink-0 flex-col gap-1 border-r border-white/10 px-3 py-6 md:flex"
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Projects
          </span>
          <div className="flex items-center gap-2">
            <Link href="/project" className="text-xs text-gray-400 hover:text-gulf-teal">
              All
            </Link>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              aria-label="New project"
              title="New project"
              className="rounded-full bg-gulf-teal/15 px-2 py-0.5 text-xs font-semibold text-gulf-teal hover:bg-gulf-teal/30 disabled:opacity-40 transition-colors"
            >
              {creating ? "…" : "+ New"}
            </button>
          </div>
        </div>

        {empty ? (
          <p className="px-1 text-xs text-gray-500">No projects yet.</p>
        ) : (
          <div className="flex flex-col gap-3 overflow-y-auto">
            {sections.map((section) => (
              <div key={section.key}>
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                  {section.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {section.subgroups.flatMap((g) =>
                    g.projects.map((p) => {
                      const href = p.lastDid ? openDoc(p.id, p.lastDid) : projectHome(p.id);
                      const active = pathname.startsWith(`/project/${p.id}`);
                      return (
                        <li key={p.id} className="flex min-w-0 items-center gap-0.5">
                          <Link
                            href={href}
                            prefetch
                            aria-current={active ? "page" : undefined}
                            className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                              active
                                ? "bg-gulf-teal/15 text-white"
                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="truncate">{p.displayTitle}</span>
                            <span className="shrink-0 text-[10px] text-gray-500">
                              {p.itemCount}
                            </span>
                          </Link>
                          <RowMenu
                            label={`Actions for ${p.displayTitle}`}
                            items={[
                              { label: "Open", onSelect: () => router.push(href) },
                              {
                                label: "Delete",
                                tone: "danger",
                                onSelect: () => setConfirm({ id: p.id, name: p.displayTitle }),
                              },
                            ]}
                          />
                        </li>
                      );
                    }),
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}

        <SendCeilingMeter variant="rail" />
      </nav>

      {confirm && (
        <ConfirmDeleteProject
          projectId={confirm.id}
          name={confirm.name}
          onClose={() => setConfirm(null)}
          onDeleted={() => {
            const wasViewing = pathname.includes(confirm.id);
            setConfirm(null);
            if (wasViewing) router.push("/project");
            else router.refresh();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Build**

Run: `bunx next build`
Expected: succeeds. (The old `RailProject` type is gone; the layout is the only consumer.)

- [ ] **Step 6: Commit**

```bash
git add app/project/_cockpit/ConfirmDeleteProject.tsx app/project/_cockpit/RowMenu.tsx app/project/ProjectsRail.tsx app/project/layout.tsx
git commit -m "feat(cockpit): rail rework — grouped headers, city-clipped titles, kebab delete, 288px, hidden on hub" -- app/project/_cockpit/ConfirmDeleteProject.tsx app/project/_cockpit/RowMenu.tsx app/project/ProjectsRail.tsx app/project/layout.tsx
```

---

### Task 5: Panel + empty-state components

**Files:**
- Create: `app/project/_cockpit/ProjectPanel.tsx`
- Create: `app/project/_cockpit/EmptyLaunchpad.tsx`

**Interfaces:**
- Consumes: `CockpitProject`, `kindChipLabel` (Task 3), `chipTime` (Task 2), `CampaignQuickStart`, `openDoc`/`projectEmailLabBase`, `projectHome`.
- Produces (used by Task 6):
  - `ProjectPanel({ project, contactsCount }: { project: CockpitProject; contactsCount: number })`
  - `emailHref(p: CockpitProject): string` (exported from ProjectPanel.tsx)
  - `EmptyLaunchpad({ contactsCount }: { contactsCount: number })`

- [ ] **Step 1: Create `ProjectPanel.tsx`**

```tsx
// app/project/_cockpit/ProjectPanel.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { openDoc, projectEmailLabBase } from "@/lib/lab-entry/destination";
import { chipTime } from "@/lib/project/schedule-chips";
import { kindChipLabel, type CockpitProject } from "@/lib/project/group-projects";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";

export function emailHref(p: CockpitProject): string {
  return p.lastDid ? openDoc(p.id, p.lastDid) : projectEmailLabBase(p.id);
}

/**
 * The hub's right pane for the SELECTED project (spec 2026-07-16 §5).
 * Project controls ONLY — no lab controls (chart types, recipes) leak here;
 * those stay in the email lab's own panel (operator, 07/16/2026).
 */
export function ProjectPanel({
  project: p,
  contactsCount,
}: {
  project: CockpitProject;
  contactsCount: number;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 text-base font-semibold text-white">
            {p.title || "Untitled project"}
          </h2>
          <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
            {kindChipLabel(p)}
          </span>
        </div>
        {(p.city || p.zip) && (
          <p className="mt-0.5 text-xs text-gray-500">
            {[p.city, p.zip].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {p.chips.length > 0 && (
        <ul className="flex flex-col gap-1">
          {p.chips.map((c) => (
            <li key={c.key}>
              <Link
                href={c.href}
                title="Click to tailor this schedule"
                className={`inline-flex flex-wrap items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  c.status === "active"
                    ? "border-gulf-teal/40 text-gray-200 hover:border-gulf-teal hover:text-white"
                    : "border-white/10 text-gray-500 hover:border-white/30"
                }`}
              >
                <span aria-hidden>{c.kind === "email" ? "✉" : "📣"}</span>
                <span>{c.line}</span>
                {c.audience && <span className="text-gray-500">→ {c.audience}</span>}
                {c.status === "paused" ? (
                  <span className="text-amber-300/70">paused</span>
                ) : chipTime(c.nextAt) ? (
                  <span className="text-gray-500">· next {chipTime(c.nextAt)}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Link
          href={emailHref(p)}
          className="rounded-lg bg-gulf-teal px-4 py-2 text-center text-sm font-semibold text-[#04121b] transition-opacity hover:opacity-90"
        >
          Open Email
          <span className="block text-[10px] font-normal opacity-80">
            charts, photos, PDF export
          </span>
        </Link>
        <Link
          href={`/project/${p.id}/social`}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/85 transition-colors hover:border-gulf-teal/50 hover:text-white"
        >
          Social
        </Link>
        <div className="relative">
          <button
            type="button"
            aria-label="More tools"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/70 transition-colors hover:border-gulf-teal/50 hover:text-white"
          >
            ⋯
          </button>
          {moreOpen && (
            <div className="absolute right-0 z-40 mt-1 w-32 rounded-lg border border-white/15 bg-[#0d1e2b] py-1 shadow-xl">
              <Link
                href={`/project/${p.id}/watch`}
                className="block px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5"
              >
                Watch
              </Link>
              <Link
                href={`/project/${p.id}`}
                className="block px-3 py-1.5 text-xs text-gray-200 hover:bg-white/5"
              >
                Overview
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/10">
        <CampaignQuickStart surface="all" projectId={p.id} variant="panel" />
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          👥 Contacts
        </p>
        <p className="mt-1 text-sm text-white">
          {contactsCount} {contactsCount === 1 ? "person" : "people"}
        </p>
        <div className="mt-2 flex gap-3 text-xs">
          <Link href={emailHref(p)} className="text-gulf-teal hover:underline">
            Send to contacts →
          </Link>
          <Link href="/contacts" className="text-gray-400 hover:text-gulf-teal">
            Manage →
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `EmptyLaunchpad.tsx`**

```tsx
// app/project/_cockpit/EmptyLaunchpad.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { projectHome } from "@/lib/project/tool-tabs";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";

/**
 * Zero-projects hub (spec 2026-07-16 §6): one centered launchpad — the
 * address input is the hero, campaign starters second, contacts + examples
 * as "while you're here". The split cockpit takes over from project #1.
 */
export function EmptyLaunchpad({ contactsCount }: { contactsCount: number }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createListing(e: React.FormEvent) {
    e.preventDefault();
    const subject = address.trim();
    if (!subject || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: subject, kind: "listing", subject_address: subject }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (res.ok && data.id) router.push(projectHome(data.id));
      else setError("Couldn't create the project — please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-8">
      <h2 className="text-center text-lg font-semibold text-white">
        Start your first project
      </h2>

      <form
        onSubmit={(e) => void createListing(e)}
        className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 p-4"
      >
        <p className="text-sm font-semibold text-white">New listing</p>
        <p className="mt-0.5 text-xs text-gray-400">
          Type the address — we set everything up around it.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="2006 SW 15th Ave, Cape Coral…"
            aria-label="Listing address"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 placeholder:text-white/35 focus:border-gulf-teal focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !address.trim()}
            className="shrink-0 rounded-lg bg-gulf-teal px-4 py-2 text-sm font-semibold text-[#04121b] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Go"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </form>

      <div>
        <p className="mb-2 text-center text-xs text-gray-500">or start with a campaign</p>
        <CampaignQuickStart surface="all" variant="bare" />
      </div>

      <div className="rounded-xl border border-white/10 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          While you&apos;re here
        </p>
        <div className="mt-2 flex flex-col gap-1.5 text-sm">
          <Link href="/contacts" className="text-gray-200 hover:text-gulf-teal">
            👥{" "}
            {contactsCount === 0
              ? "Bring your contacts in first — Import →"
              : `Contacts — ${contactsCount} people · Manage →`}
          </Link>
          <Link href="/showcase" className="text-gray-200 hover:text-gulf-teal">
            ▤ See finished examples →
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `bunx next build`
Expected: succeeds (components compile; not yet rendered anywhere).

- [ ] **Step 4: Commit**

```bash
git add app/project/_cockpit/ProjectPanel.tsx app/project/_cockpit/EmptyLaunchpad.tsx
git commit -m "feat(cockpit): ProjectPanel + EmptyLaunchpad components" -- app/project/_cockpit/ProjectPanel.tsx app/project/_cockpit/EmptyLaunchpad.tsx
```

---

### Task 6: Cockpit body + hub page rewrite

**Files:**
- Create: `app/project/_cockpit/ProjectsCockpit.tsx`
- 🔴 Modify: `app/project/page.tsx` (full rewrite below)

**Interfaces:**
- Consumes: everything above. `ProjectsCockpit` props:

```ts
{ sections: Section[]; defaultSelectedId: string | null; activeCount: number;
  upcoming: ScheduleChip[]; contactsCount: number }
```

- [ ] **Step 1: Create `ProjectsCockpit.tsx`**

```tsx
// app/project/_cockpit/ProjectsCockpit.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Section } from "@/lib/project/group-projects";
import type { CockpitProject } from "@/lib/project/group-projects";
import { chipTime, type ScheduleChip } from "@/lib/project/schedule-chips";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";
import { ProjectPanel, emailHref } from "./ProjectPanel";
import { ConfirmDeleteProject } from "./ConfirmDeleteProject";
import { RowMenu } from "./RowMenu";

/**
 * The hub cockpit body (spec 2026-07-16 §2): grouped list left, selected
 * project's panel right, tool pills on top acting on the selection. Single
 * click SELECTS (desktop); navigation happens via pills/panel buttons. On
 * mobile the panel is hidden and a row tap navigates into the project.
 */
export function ProjectsCockpit({
  sections,
  defaultSelectedId,
  activeCount,
  upcoming,
  contactsCount,
}: {
  sections: Section[];
  defaultSelectedId: string | null;
  activeCount: number;
  upcoming: ScheduleChip[];
  contactsCount: number;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  const all = sections.flatMap((s) => s.subgroups.flatMap((g) => g.projects));
  const selected = all.find((p) => p.id === selectedId) ?? null;

  const pills: { label: string; href: (p: CockpitProject) => string }[] = [
    { label: "Email", href: (p) => emailHref(p) },
    { label: "Social", href: (p) => `/project/${p.id}/social` },
    { label: "Watch", href: (p) => `/project/${p.id}/watch` },
    { label: "Overview", href: (p) => `/project/${p.id}` },
  ];

  function rowClick(e: React.MouseEvent, id: string) {
    // Desktop: select in place. Mobile (no panel): let the Link navigate.
    if (window.matchMedia("(min-width: 768px)").matches) {
      e.preventDefault();
      setSelectedId(id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tool pills — same segmented look as the in-project switcher. */}
      <nav aria-label="Open the selected project's tool" className="flex max-w-md gap-1.5">
        {pills.map((t) =>
          selected ? (
            <Link
              key={t.label}
              href={t.href(selected)}
              className="flex-1 rounded-full border border-white/15 px-4 py-2 text-center text-sm font-semibold text-white/75 transition-colors hover:border-gulf-teal/50 hover:bg-white/5 hover:text-white"
            >
              {t.label}
            </Link>
          ) : (
            <span
              key={t.label}
              aria-disabled
              className="flex-1 rounded-full border border-white/10 px-4 py-2 text-center text-sm font-semibold text-white/25"
            >
              {t.label}
            </span>
          ),
        )}
      </nav>

      {/* Running-now strip — the management heartbeat, always visible. */}
      <p className="text-xs text-gray-400">
        {activeCount === 0 ? (
          <>Nothing scheduled yet — open a project and schedule a send.</>
        ) : (
          <>
            <span className="text-white">
              {activeCount} active {activeCount === 1 ? "send" : "sends"}
            </span>
            {upcoming[0] && (
              <>
                {" "}
                · next {upcoming[0].kind === "email" ? "✉" : "📣"}{" "}
                <Link href={upcoming[0].href} className="hover:text-gulf-teal">
                  {upcoming[0].line}
                  {chipTime(upcoming[0].nextAt) ? ` · ${chipTime(upcoming[0].nextAt)}` : ""}
                </Link>
              </>
            )}
          </>
        )}
      </p>

      <div className="flex gap-6">
        {/* Left: grouped list. */}
        <div className="min-w-0 flex-1 md:max-w-sm">
          {sections.map((section) => (
            <div key={section.key} className="mb-4">
              <p className="border-b border-white/10 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {section.label} <span className="text-gray-600">({section.count})</span>
              </p>
              {section.subgroups.map((g) => (
                <div key={g.city ?? "~none"}>
                  {g.city && (
                    <p className="mt-2 px-1 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                      {g.city}
                    </p>
                  )}
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {g.projects.map((p) => {
                      const active = p.id === selectedId;
                      return (
                        <li key={p.id} className="flex min-w-0 items-center gap-0.5">
                          <Link
                            href={emailHref(p)}
                            onClick={(e) => rowClick(e, p.id)}
                            aria-current={active ? "true" : undefined}
                            className={`min-w-0 flex-1 rounded-lg px-3 py-2 transition-colors ${
                              active
                                ? "bg-gulf-teal/15 text-white"
                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="block text-sm font-medium">{p.displayTitle}</span>
                            <span className="mt-0.5 block text-[11px] text-gray-500">
                              {[
                                p.chips[0]
                                  ? `${p.chips[0].kind === "email" ? "✉" : "📣"} ${
                                      chipTime(p.chips[0].nextAt) ?? p.chips[0].status
                                    }`
                                  : null,
                                p.built > 0
                                  ? `${p.built} ${p.built === 1 ? "email" : "emails"} built`
                                  : `${p.itemCount} ${p.itemCount === 1 ? "item" : "items"}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </Link>
                          <RowMenu
                            label={`Actions for ${p.displayTitle}`}
                            items={[
                              { label: "Open", onSelect: () => router.push(emailHref(p)) },
                              {
                                label: "Delete",
                                tone: "danger",
                                onSelect: () => setConfirm({ id: p.id, name: p.displayTitle }),
                              },
                            ]}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Right: selected project's panel, or the global view. Desktop only. */}
        <div className="hidden min-w-0 flex-1 md:block">
          {selected ? (
            <ProjectPanel project={selected} contactsCount={contactsCount} />
          ) : (
            <div className="flex flex-col gap-4">
              {upcoming.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Running now
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {upcoming.map((c) => (
                      <li key={c.key}>
                        <Link
                          href={c.href}
                          className="text-xs text-gray-300 transition-colors hover:text-gulf-teal"
                        >
                          {c.kind === "email" ? "✉" : "📣"} {c.line}
                          {chipTime(c.nextAt) ? ` · next ${chipTime(c.nextAt)}` : ""}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-xl border border-white/10">
                <CampaignQuickStart surface="all" variant="panel" />
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  👥 Contacts
                </p>
                <p className="mt-1 text-sm text-white">
                  {contactsCount} {contactsCount === 1 ? "person" : "people"}
                </p>
                <Link href="/contacts" className="mt-2 block text-xs text-gulf-teal hover:underline">
                  Manage →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirm && (
        <ConfirmDeleteProject
          projectId={confirm.id}
          name={confirm.name}
          onClose={() => setConfirm(null)}
          onDeleted={() => {
            if (selectedId === confirm.id) setSelectedId(null);
            setConfirm(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `app/project/page.tsx`** — replace the whole file:

```tsx
import { cookies } from "next/headers";
import { PageShell } from "@/components/PageShell";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { buildScheduleChips } from "@/lib/project/schedule-chips";
import {
  groupProjects,
  toCockpitProjects,
  type ProjectRowInput,
} from "@/lib/project/group-projects";
import { ImportDraftOnLogin } from "./_import/ImportDraftOnLogin";
import { NewProjectButton } from "./NewProjectButton";
import { NewListingButton } from "./NewListingButton";
import { ShowingPrepButton } from "./ShowingPrepButton";
import { ProjectsCockpit } from "./_cockpit/ProjectsCockpit";
import { EmptyLaunchpad } from "./_cockpit/EmptyLaunchpad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your projects — SWFL Data Gulf" };

/**
 * The cockpit hub (spec 2026-07-16, supersedes the 07/03 control-center list):
 * grouped project list + selected-project panel in the shared cockpit chrome.
 * The quick-links row and page-topping campaign starters are gone — starters
 * live in the panel/empty state, Charts/Alerts/Search in the top nav, and
 * Contacts is a first-class panel block.
 */
export default async function ProjectListPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/project");

  const [{ data }, { data: emailSch }, { data: socialSch }, { data: delivRows }, contactsRes] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, title, kind, items, updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("email_schedules")
        .select(
          "id, project_id, status, cadence, day_of_week, day_of_month, send_hour_et, audience_slug, next_run_at, deliverable_id",
        )
        .in("status", ["active", "paused"]),
      supabase
        .from("social_schedules")
        .select(
          "id, project_id, status, cadence, day_of_week, day_of_month, send_hour_et, platform, next_run_at",
        )
        .in("status", ["active", "paused"]),
      // Newest-first so the fold keeps the most-recent block-canvas doc per
      // project (same tie-break the tool switcher uses).
      supabase
        .from("deliverables")
        .select("id, project_id, template")
        .order("data_as_of", { ascending: false }),
      supabase.from("contacts").select("id", { count: "exact", head: true }),
    ]);

  const rows = (data as ProjectRowInput[] | null) ?? [];
  const contactsCount = contactsRes.count ?? 0;

  const { chipsByProject, activeCount, upcoming } = buildScheduleChips(
    emailSch ?? [],
    socialSch ?? [],
  );
  const builtByProject = new Map<string, number>();
  const lastDidByProject = new Map<string, string>();
  for (const d of delivRows ?? []) {
    builtByProject.set(d.project_id, (builtByProject.get(d.project_id) ?? 0) + 1);
    if (d.template === "block-canvas" && !lastDidByProject.has(d.project_id)) {
      lastDidByProject.set(d.project_id, d.id);
    }
  }

  const projects = toCockpitProjects(rows, {
    chipsByProject,
    builtByProject,
    lastDidByProject,
  });
  const sections = groupProjects(projects);
  // Rows arrive updated_at desc, so rows[0] is the most recent project.
  const defaultSelectedId = rows[0]?.id ?? null;

  return (
    <PageShell width="wide">
      <ImportDraftOnLogin />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Your projects</h1>
        <div className="flex items-center gap-2">
          <NewListingButton />
          <ShowingPrepButton />
          <NewProjectButton />
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyLaunchpad contactsCount={contactsCount} />
      ) : (
        <ProjectsCockpit
          sections={sections}
          defaultSelectedId={defaultSelectedId}
          activeCount={activeCount}
          upcoming={upcoming}
          contactsCount={contactsCount}
        />
      )}
    </PageShell>
  );
}
```

Note what is GONE from the old page: the `CampaignQuickStart` at the top, the quick-links `<nav>` (Charts/Search/Alerts/Contacts), the Running-Now card, and the flat card list — all replaced by the cockpit/launchpad. `chipTime`'s import moved with the markup into the cockpit components.

- [ ] **Step 3: Build + test sweep**

Run: `bunx next build && bun test lib/project`
Expected: build succeeds, all lib/project tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/project/_cockpit/ProjectsCockpit.tsx app/project/page.tsx
git commit -m "feat(cockpit): hub page — grouped list + selected-project panel, empty-state launchpad" -- app/project/_cockpit/ProjectsCockpit.tsx app/project/page.tsx
```

---

### Task 7: Coming-soon chips stop pretending to be buttons

**Files:**
- Modify: `components/campaigns/CampaignQuickStart.tsx:150-162`

- [ ] **Step 1: Replace the COMING_TILES pill row**

In `CampaignQuickStart.tsx`, replace this block:

```tsx
      {COMING_TILES.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {COMING_TILES.map((t) => (
            <span
              key={t.label}
              title={`${t.blurb} (coming soon)`}
              className="cursor-default rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] text-white/30"
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
```

with:

```tsx
      {COMING_TILES.length > 0 && (
        <p className="mt-2.5 text-[11px] leading-snug text-white/30">
          Coming soon: {COMING_TILES.map((t) => t.label).join(", ")}
        </p>
      )}
```

(Deliberately affects every surface that renders the starters — the lab panel included — per spec Decision 6: a non-clickable thing must not be pill-shaped anywhere.)

- [ ] **Step 2: Build**

Run: `bunx next build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/campaigns/CampaignQuickStart.tsx
git commit -m "fix(campaigns): coming-soon entries render as a muted line, not dead pill buttons" -- components/campaigns/CampaignQuickStart.tsx
```

---

### Task 8: Full verification

- [ ] **Step 1: Full test + build**

Run: `bun test lib/project && bunx next build`
Expected: all pass; clean build.

- [ ] **Step 2: Live verification** — invoke the project's `/verify` skill (drives a real production build, serves on a clean port, screenshots). Verify, at minimum:
  1. `/project` signed-in: grouped sections render; addresses show up-to-city; pills act on the preselected project; panel shows schedules + starters + contacts count; no quick-links row; no top starters.
  2. Row ⋯ → Delete → dialog names the project, "Delete project"/"Keep project".
  3. Inside a project: rail is 288px, grouped, no horizontal scrollbar, ⋯ menus work; rail absent on `/project` itself.
  4. Coming-soon line (not pills) in the lab's campaign panel.
- [ ] **Step 3: SESSION_LOG entry** (what shipped, spec/plan paths, what's next: live-verify + close `projects_cockpit_live_verify` after deploy). Commit it.
- [ ] **Step 4: STOP — do not push.** Show the operator `git log --oneline` for the task commits and ask for push approval (`node scripts/safe-push.mjs` once approved; the answer-fix-proof and SESSION_LOG hooks run at push time).

---

## Self-review notes (done at plan-writing time)

- Spec coverage: §1 states → Tasks 4/6 (rail hide, cockpit, launchpad); §2 → Task 6; §3 → Task 3; §4 → Tasks 1/4/6; §5 → Task 5; §6 → Task 5; §7 kills → Tasks 6/7; data/seams → Tasks 2/3/6. Mobile collapse → `rowClick` matchMedia + `hidden md:block` panel. No gaps found.
- Type consistency: `displayProjectTitle`, `buildScheduleChips`/`ScheduleChip`/`chipTime`, `toCockpitProjects`/`groupProjects`/`Section`/`CockpitProject`/`kindChipLabel`, `emailHref` — names match at every use site above.
- Known deviation from today's behavior, intended: the rail no longer renders on `/project` (hub body replaces it) and `SendCeilingMeter` therefore doesn't show on the hub — it still shows on every in-project page.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 6 | `app/project/page.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
