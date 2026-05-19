# Roadmap-Sync Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans` (inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `npm run roadmap:sync` — a deterministic generator that walks the PACKS registry + `git log` and writes the descriptive "current state" sidecar `docs/roadmap-status.md`, so the formal `docs/ontology-and-roadmap.md` can stop carrying stale §5 content while humans hand-edit only the prescriptive §6–§9 sections.

**Architecture:** Mirror `refinery/tools/semantic-ledger.mts` exactly — synchronous Bun script, no tests, deterministic byte-for-byte output, regenerated into git so diffs are visible. The generator writes a _separate_ sidecar file (same pattern as `docs/semantic-ledger.md`), not an in-place patch of `ontology-and-roadmap.md` — that keeps the machine-written and human-written boundaries unambiguous. The `ontology-and-roadmap.md` §5 is patched once, by hand, to a one-paragraph pointer at the sidecar.

**Tech Stack:** Bun runtime, TypeScript `.mts`, Node built-ins (`fs`, `path`, `child_process`). No new deps. Reuses `PACKS` from `refinery/config/packs.mts`.

---

## File Structure

| File                              | Action | Responsibility                                                                                                        |
| --------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| `refinery/tools/roadmap-sync.mts` | Create | The generator. Mirrors `semantic-ledger.mts` shape — `buildHeader`, `buildLiveBrains`, etc. → joined `writeFileSync`. |
| `docs/roadmap-status.md`          | Create | The generated output. Committed to git so diffs are reviewable. Header says "do not edit by hand."                    |
| `package.json`                    | Modify | Add `"roadmap:sync": "bun refinery/tools/roadmap-sync.mts"` next to `"ledger"`.                                       |
| `docs/ontology-and-roadmap.md`    | Modify | Replace §5 body with a one-paragraph pointer to `docs/roadmap-status.md`. §3.1 entity status, §4, §6–§9 untouched.    |

---

## Sections of the generated `docs/roadmap-status.md`

In order:

1. **Header** — timestamp, git short SHA, regenerate command. Mirrors `buildHeader` in semantic-ledger.
2. **TL;DR** — N brains, M sources across X distinct trust tiers, Y distinct domains, last `ontology-and-roadmap.md` touch (`git log -1`), commits since that touch.
3. **Live brains** — table: `id | domain | source count | trust tiers present | input edges`. Sorted by id.
4. **Source connectors per brain** — for each pack: `source_id`, `trust_tier`. Shows what the brain actually reads.
5. **Brain DAG (edges)** — `upstream → downstream (edge_type)` rendered as a sorted list. Mirrors semantic-ledger's `buildDagAndEdges` shape but flips the perspective (edges, not per-brain rows).
6. **Domain coverage** — rollup by `BrainDomain`: count of brains, list of brain IDs. Surfaces which of the 7 domains in the `BrainDomain` union are empty.
7. **Commits since last roadmap doc touch** — `git log --since` filtered to commits after the last touch of `docs/ontology-and-roadmap.md`. Short SHA, date, subject.
8. **Trigger-shaped commits** — sub-list of (7): commits whose changed-files include any of `refinery/packs/`, `refinery/sources/`, `refinery/types/`, `refinery/constitution/`, `refinery/lib/confidence`, or `refinery/render/`. Per §10 of the roadmap doc, these are the changes that _should_ have triggered an update.
9. **Footer** — "Generated; do not edit by hand. Hand-edit `docs/ontology-and-roadmap.md` §6 (NOW), §7 (NEAR-TERM), §8 (LONG-TERM)." Mirrors semantic-ledger footer.

---

## Tasks

### Task 1: Scaffold the generator file with the section runners and main

**Files:**

- Create: `refinery/tools/roadmap-sync.mts`

- [ ] **Step 1: Write the file with header + helpers + main, all section builders stubbed**

Each `buildX(...)` returns a placeholder string `"## X\n\n_TODO_\n"` until Task 2+. The skeleton goes in first so the wiring + the typecheck pass before content lands.

```ts
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { PACKS } from "../config/packs.mts";
import type {
  PackDefinition,
  SourceConnector,
  TrustTier,
} from "../types/pack.mts";

const OUTPUT_PATH = path.join(process.cwd(), "docs", "roadmap-status.md");
const ROADMAP_DOC = "docs/ontology-and-roadmap.md";

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}
function gitShortSha(): string {
  return git("rev-parse --short HEAD") || "(no git)";
}
function lastRoadmapDocTouch(): { sha: string; iso: string; subject: string } {
  const line = git(`log -1 --format=%h%x09%aI%x09%s -- ${ROADMAP_DOC}`);
  const [sha, iso, subject] = line.split("\t");
  return {
    sha: sha ?? "(none)",
    iso: iso ?? "(none)",
    subject: subject ?? "(none)",
  };
}
function fmt(items: readonly string[]): string {
  return items.length === 0
    ? "_none_"
    : items.map((s) => `\`${s}\``).join(", ");
}
function escapeTable(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
```

Plus stubbed `buildHeader`, `buildTldr`, `buildLiveBrains`, `buildSources`, `buildDagEdges`, `buildDomainCoverage`, `buildCommitsSince`, `buildTriggerShapedCommits`, `buildFooter`, all initially returning `"## NAME\n\n_TODO_\n"`. `main()` joins them and `writeFileSync`s.

- [ ] **Step 2: Typecheck the skeleton**

```
npm run refinery:typecheck
```

Expected: PASS (the file imports only existing types and runtime values).

- [ ] **Step 3: Commit the skeleton**

```
git add refinery/tools/roadmap-sync.mts
git commit -m "feat(roadmap-sync): scaffold generator (stub sections)"
```

### Task 2: Implement `buildHeader` and `buildTldr`

**Files:**

- Modify: `refinery/tools/roadmap-sync.mts`

- [ ] **Step 1: Replace the two stubs with real implementations**

````ts
function buildHeader(): string {
  const last = lastRoadmapDocTouch();
  return [
    "# Roadmap Status — Current State (Auto-Generated)",
    "",
    "_The descriptive layer. Live brains, sources, edges, and commits since the last `ontology-and-roadmap.md` touch. Hand-edit `docs/ontology-and-roadmap.md` §6–§9 for forward strategy; this file is regenerated from code._",
    "",
    `**Generated:** ${new Date().toISOString()} (commit \`${gitShortSha()}\`)`,
    `**Last roadmap doc touch:** \`${last.sha}\` · ${last.iso} · ${last.subject}`,
    "",
    "## Regenerate",
    "",
    "```",
    "npm run roadmap:sync",
    "```",
    "",
  ].join("\n");
}

function buildTldr(): string {
  const packs = Object.values(PACKS);
  const sourceCount = packs.reduce((n, p) => n + p.sources.length, 0);
  const trustTiers = new Set<TrustTier>();
  for (const p of packs)
    for (const s of p.sources) trustTiers.add(s.trust_tier);
  const domains = new Set(packs.map((p) => p.domain));
  const commits = commitsSinceLastRoadmapTouch();
  return [
    "## TL;DR",
    "",
    `- **${packs.length}** brains in the runtime registry.`,
    `- **${sourceCount}** source connectors across **${trustTiers.size}** distinct trust tiers (${[
      ...trustTiers,
    ]
      .sort()
      .map((t) => `T${t}`)
      .join(", ")}).`,
    `- **${domains.size}** distinct domains: ${[...domains]
      .sort()
      .map((d) => `\`${d}\``)
      .join(", ")}.`,
    `- **${commits.length}** commits since the last roadmap-doc touch.`,
    "",
  ].join("\n");
}
````

Plus a helper:

```ts
function commitsSinceLastRoadmapTouch(): Array<{
  sha: string;
  iso: string;
  subject: string;
  files: string[];
}> {
  const last = lastRoadmapDocTouch();
  if (last.sha === "(none)") return [];
  const raw = git(`log ${last.sha}..HEAD --format=%h%x09%aI%x09%s --name-only`);
  if (!raw) return [];
  const out: Array<{
    sha: string;
    iso: string;
    subject: string;
    files: string[];
  }> = [];
  let cur: {
    sha: string;
    iso: string;
    subject: string;
    files: string[];
  } | null = null;
  for (const line of raw.split("\n")) {
    if (line.includes("\t")) {
      if (cur) out.push(cur);
      const [sha, iso, subject] = line.split("\t");
      cur = { sha, iso, subject, files: [] };
    } else if (line.trim() && cur) {
      cur.files.push(line.trim());
    }
  }
  if (cur) out.push(cur);
  return out;
}
```

- [ ] **Step 2: Typecheck**

Same command. Expected: PASS.

### Task 3: Implement `buildLiveBrains` + `buildSources` + `buildDagEdges` + `buildDomainCoverage`

**Files:**

- Modify: `refinery/tools/roadmap-sync.mts`

- [ ] **Step 1: Replace the four stubs**

```ts
function buildLiveBrains(): string {
  const packs = Object.values(PACKS)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const lines = [
    "## Live Brains",
    "",
    "| Brain | Domain | Sources | Trust tiers | Input edges |",
    "| --- | --- | ---: | --- | ---: |",
  ];
  for (const p of packs) {
    const tiers = [...new Set(p.sources.map((s) => `T${s.trust_tier}`))].sort();
    lines.push(
      `| \`${p.id}\` | \`${p.domain}\` | ${p.sources.length} | ${tiers.join(", ") || "—"} | ${(p.input_brains ?? []).length} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function buildSources(): string {
  const packs = Object.values(PACKS)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const out = ["## Source connectors per brain", ""];
  for (const p of packs) {
    out.push(`### \`${p.id}\``);
    out.push("");
    if (p.sources.length === 0) {
      out.push("_no sources_");
      out.push("");
      continue;
    }
    out.push("| source_id | trust_tier |");
    out.push("| --- | ---: |");
    for (const s of p.sources)
      out.push(`| \`${s.source_id}\` | T${s.trust_tier} |`);
    out.push("");
  }
  return out.join("\n");
}

function buildDagEdges(): string {
  const packs = Object.values(PACKS)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges: Array<{ from: string; to: string; type: string }> = [];
  for (const p of packs)
    for (const e of p.input_brains ?? [])
      edges.push({ from: e.id, to: p.id, type: e.edge_type });
  edges.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
  const out = [
    "## Brain DAG (edges)",
    "",
    "Every edge: `upstream → downstream (edge_type)`. Edge types: `input | constraint | veto | modifier` (`refinery/types/pack.mts` → `BrainEdgeType`).",
    "",
  ];
  if (edges.length === 0) {
    out.push("_no edges_");
    out.push("");
    return out.join("\n");
  }
  out.push("| Upstream | Downstream | Edge type |");
  out.push("| --- | --- | --- |");
  for (const e of edges)
    out.push(`| \`${e.from}\` | \`${e.to}\` | **${e.type}** |`);
  out.push("");
  return out.join("\n");
}

function buildDomainCoverage(): string {
  const byDomain = new Map<string, string[]>();
  for (const p of Object.values(PACKS)) {
    const arr = byDomain.get(p.domain) ?? [];
    arr.push(p.id);
    byDomain.set(p.domain, arr);
  }
  const out = [
    "## Domain coverage",
    "",
    "| Domain | Brain count | Brain IDs |",
    "| --- | ---: | --- |",
  ];
  for (const d of [...byDomain.keys()].sort()) {
    const ids = byDomain.get(d)!.slice().sort();
    out.push(`| \`${d}\` | ${ids.length} | ${fmt(ids)} |`);
  }
  out.push("");
  out.push(
    "_Empty domains in the `BrainDomain` union (`real-estate | finance | environmental | demographics | logistics | hospitality | macro`) indicate roadmap slots not yet filled._",
  );
  out.push("");
  return out.join("\n");
}
```

- [ ] **Step 2: Typecheck**

Expected: PASS.

### Task 4: Implement `buildCommitsSince` + `buildTriggerShapedCommits` + `buildFooter`

**Files:**

- Modify: `refinery/tools/roadmap-sync.mts`

- [ ] **Step 1: Replace the three stubs**

```ts
const TRIGGER_PREFIXES = [
  "refinery/packs/",
  "refinery/sources/",
  "refinery/types/",
  "refinery/constitution/",
  "refinery/lib/confidence",
  "refinery/render/",
];

function isTriggerShaped(files: readonly string[]): boolean {
  return files.some((f) => TRIGGER_PREFIXES.some((p) => f.startsWith(p)));
}

function buildCommitsSince(): string {
  const commits = commitsSinceLastRoadmapTouch();
  const out = ["## Commits since last roadmap doc touch", ""];
  if (commits.length === 0) {
    out.push("_None — doc is current with HEAD._");
    out.push("");
    return out.join("\n");
  }
  out.push("| SHA | Date | Subject |");
  out.push("| --- | --- | --- |");
  for (const c of commits)
    out.push(
      `| \`${c.sha}\` | ${c.iso.slice(0, 10)} | ${escapeTable(c.subject)} |`,
    );
  out.push("");
  return out.join("\n");
}

function buildTriggerShapedCommits(): string {
  const triggers = commitsSinceLastRoadmapTouch().filter((c) =>
    isTriggerShaped(c.files),
  );
  const out = [
    "## Trigger-shaped commits since last roadmap doc touch",
    "",
    "Per §10 of `ontology-and-roadmap.md`, commits that touch `refinery/packs/`, `refinery/sources/`, `refinery/types/`, `refinery/constitution/`, `refinery/lib/confidence`, or `refinery/render/` *should have* triggered a roadmap update. List below is what's currently un-reflected.",
    "",
  ];
  if (triggers.length === 0) {
    out.push(
      "_None — every trigger-shaped commit since the last touch has been reflected._",
    );
    out.push("");
    return out.join("\n");
  }
  out.push("| SHA | Date | Subject | Trigger files (sample) |");
  out.push("| --- | --- | --- | --- |");
  for (const c of triggers) {
    const trigFiles = c.files
      .filter((f) => TRIGGER_PREFIXES.some((p) => f.startsWith(p)))
      .slice(0, 3);
    out.push(
      `| \`${c.sha}\` | ${c.iso.slice(0, 10)} | ${escapeTable(c.subject)} | ${fmt(trigFiles)} |`,
    );
  }
  out.push("");
  return out.join("\n");
}

function buildFooter(): string {
  return [
    "---",
    "",
    "**Notes**",
    "",
    "- This file is generated; do not edit by hand.",
    "- Hand-edit `docs/ontology-and-roadmap.md` §6 (NOW), §7 (NEAR-TERM), §8 (LONG-TERM) for forward strategy.",
    "- Regenerate after any roadmap-shaped commit: `npm run roadmap:sync`.",
    "",
  ].join("\n");
}
```

- [ ] **Step 2: Typecheck**

Expected: PASS.

### Task 5: Wire `npm run roadmap:sync` and patch the roadmap doc

**Files:**

- Modify: `package.json`
- Modify: `docs/ontology-and-roadmap.md`

- [ ] **Step 1: Add the npm script**

In `package.json`, immediately after the `"ledger"` line:

```
"roadmap:sync": "bun refinery/tools/roadmap-sync.mts",
```

- [ ] **Step 2: Patch ontology-and-roadmap.md §5**

Replace the body of `## 5. Current State — Honest Snapshot (2026-05-15)` with:

```markdown
> **Current state moved to a generated sidecar.** §5.1 (live brains), §5.2 (DAG), and the source-connector inventory now live in `docs/roadmap-status.md`, regenerated via `npm run roadmap:sync` after any commit that touches `refinery/packs/`, `refinery/sources/`, `refinery/types/`, `refinery/constitution/`, `refinery/lib/confidence`, or `refinery/render/`. That file lists trigger-shaped commits since the last touch of this doc — read it to see what's currently un-reflected here. The qualitative §5.3–§5.6 sections below remain hand-edited.
```

Then keep the `### 5.3 What Works`, `### 5.4 Gaps Between What Exists and What We Want`, `### 5.5`, `### 5.6` sub-sections intact (they're qualitative — humans own them). Delete the §5.1 brain table and §5.2 ASCII DAG.

Also bump the `**Last updated**` line at the top from `2026-05-15` to today, and add a changelog entry at the bottom.

### Task 6: Run the generator and commit the output

- [ ] **Step 1: Run**

```
npm run roadmap:sync
```

Expected stdout: `[roadmap-sync] wrote .../docs/roadmap-status.md (N bytes)`

- [ ] **Step 2: Sanity-check the output**

`Read docs/roadmap-status.md`. Verify:

- TL;DR brain count matches `Object.keys(PACKS).length` (currently 11 — `Object.values(PACKS)` should be 11 distinct).
- Live Brains table is sorted by id and includes every pack in `refinery/config/packs.mts` + `refinery/packs/index.mts`.
- Trigger-shaped commits table is non-empty (we expect many — that's the whole point).

- [ ] **Step 3: Commit all four changes together**

```
git add refinery/tools/roadmap-sync.mts package.json docs/ontology-and-roadmap.md docs/roadmap-status.md
git commit -m "feat(roadmap-sync): generator + sidecar + ontology doc §5 pointer"
```

---

## Self-Review

- **Spec coverage:** All 9 sections of `docs/roadmap-status.md` (header through footer) have a task. The §5 patch in `ontology-and-roadmap.md` is covered. The package.json wiring is covered. ✅
- **Placeholders:** None — every code block is the final shape, not "TBD." ✅
- **Type consistency:** `PackDefinition`, `SourceConnector`, `TrustTier` all imported from `../types/pack.mts` (matches the existing `semantic-ledger.mts` import path). `PACKS` from `../config/packs.mts` (matches). ✅
- **One drift risk:** if `refinery/types/pack.mts` doesn't export `TrustTier` directly, swap to `number` in the local type narrowing — non-blocking, will surface at Step 2 typecheck.
- **No test file** — mirroring the ledger pattern (it has none either). Verification is "run it, read the output." User explicitly said _"perfectly mimic the npm run ledger pattern."_
