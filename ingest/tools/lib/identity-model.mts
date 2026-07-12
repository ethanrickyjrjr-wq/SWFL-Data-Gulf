/**
 * check-registry-identity — shared model.
 *
 * Parsing facts VERIFIED against this repo (Bun 1.3.14), not assumed:
 *   • Bun.YAML.parse keeps `on:` as the STRING key "on" (YAML 1.2 core schema),
 *     so workflows parse without the YAML-1.1 `on -> true` boolean trap.
 *   • A commented-out `schedule:` block simply does not appear in the parse —
 *     that IS the comment-aware cron check (collier-permits, corridor-pulse).
 *   • `env:` in this repo lives at STEP level, not job level. The wired set is
 *     the union of workflow env ∪ job env ∪ step env.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export type Severity = "red" | "warn";

export interface Finding {
  rule: string;
  entry: string;
  severity: Severity;
  registrySide: string;
  otherSide: string;
  fix: string;
}

export interface KnownDrift {
  rule: string;
  check: string;
}
export interface CoverageExempt {
  table: string;
  reason: string;
}

export interface RegistryEntry {
  name: string;
  lane?: string;
  parked?: boolean;
  dispatch_only?: boolean;
  workflow?: string;
  consuming_pack?: string | string[];
  source_name?: string;
  source_tag?: string;
  dlt_schema_name?: string;
  schema_static?: string;
  count_table?: string;
  freshness_table?: string;
  expected_rows_min?: number;
  cadence_days?: number;
  tolerance_multiplier?: number;
  first_run_after?: string;
  known_drift?: KnownDrift[];
  [k: string]: unknown;
}

export interface Registry {
  pipelines: RegistryEntry[];
  not_yet_running?: RegistryEntry[];
  coverage_exempt?: CoverageExempt[];
}

export interface RepoView {
  exists(p: string): boolean;
  read(p: string): string | null;
  /** Recursive *.py paths under `dir` (empty if the dir is absent). */
  pyFiles(dir: string): string[];
}

export class MemRepo implements RepoView {
  constructor(private readonly files: Record<string, string>) {}
  exists(p: string): boolean {
    return (
      Object.hasOwn(this.files, p) || Object.keys(this.files).some((f) => f.startsWith(`${p}/`))
    );
  }
  read(p: string): string | null {
    return this.files[p] ?? null;
  }
  pyFiles(dir: string): string[] {
    return Object.keys(this.files).filter((f) => f.startsWith(`${dir}/`) && f.endsWith(".py"));
  }
}

export function fsRepo(root: string): RepoView {
  const abs = (p: string) => path.join(root, p);
  return {
    exists: (p) => existsSync(abs(p)),
    read: (p) => (existsSync(abs(p)) ? readFileSync(abs(p), "utf8") : null),
    pyFiles: (dir) => {
      const start = abs(dir);
      if (!existsSync(start) || !statSync(start).isDirectory()) return [];
      const out: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (e.name.endsWith(".py")) out.push(path.relative(root, full).replaceAll("\\", "/"));
        }
      };
      walk(start);
      return out;
    },
  };
}

export const REGISTRY_PATH = "ingest/cadence_registry.yaml";

export function loadRegistry(repo: RepoView): Registry {
  const raw = repo.read(REGISTRY_PATH);
  if (raw === null) throw new Error(`registry not found at ${REGISTRY_PATH}`);
  const doc = Bun.YAML.parse(raw) as Registry;
  return {
    pipelines: doc.pipelines ?? [],
    not_yet_running: doc.not_yet_running ?? [],
    coverage_exempt: doc.coverage_exempt ?? [],
  };
}

/** Every entry, with `parked` true for not_yet_running: OR an explicit parked: true. */
export function allEntries(reg: Registry): Array<{ entry: RegistryEntry; parked: boolean }> {
  return [
    ...reg.pipelines.map((entry) => ({ entry, parked: entry.parked === true })),
    ...(reg.not_yet_running ?? []).map((entry) => ({ entry, parked: true })),
  ];
}

export interface WorkflowJob {
  id: string;
  timeoutMinutes: number | null;
  usesRefs: string[];
  envKeys: string[];
  modules: string[];
  /** Set when the JOB itself `uses:` another workflow (reusable-workflow caller). */
  callsReusable: string | null;
}

export interface WorkflowFacts {
  file: string;
  name: string | null;
  crons: string[];
  jobs: WorkflowJob[];
}

export function workflowPath(file: string): string {
  return `.github/workflows/${file}`;
}

type YamlMap = Record<string, unknown>;

function asMap(v: unknown): YamlMap {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as YamlMap) : {};
}

export function parseWorkflow(repo: RepoView, file: string): WorkflowFacts | null {
  const raw = repo.read(workflowPath(file));
  if (raw === null) return null;
  let doc: YamlMap;
  try {
    doc = asMap(Bun.YAML.parse(raw));
  } catch {
    return null; // unparseable — caller degrades to skip+warn (fail-open)
  }
  const on = asMap(doc.on);
  const schedule = Array.isArray(on.schedule) ? on.schedule : [];
  const crons: string[] = schedule
    .map((s: unknown) => String(asMap(s).cron ?? "").trim())
    .filter(Boolean);
  const wfEnv = Object.keys(asMap(doc.env));
  const jobs: WorkflowJob[] = Object.entries(asMap(doc.jobs)).map(([id, jRaw]) => {
    const j = asMap(jRaw);
    const steps: YamlMap[] = Array.isArray(j.steps) ? j.steps.map(asMap) : [];
    const envKeys = new Set<string>([...wfEnv, ...Object.keys(asMap(j.env))]);
    for (const s of steps) for (const k of Object.keys(asMap(s.env))) envKeys.add(k);
    const runText = steps.map((s) => String(s.run ?? "")).join("\n");
    // Two shapes: `python -m <mod>` (ubuntu runners) and `& "$env:VENV_PY" -m ingest.<mod>`
    // (the Windows self-hosted runner, dbpr-sirs-monthly.yml) — the interpreter token is a
    // pwsh variable there, so the fallback keys on our package namespace instead.
    const modules = [
      ...[...runText.matchAll(/python\s+-m\s+([A-Za-z0-9_.]+)/g)].map((m) => m[1]),
      ...[...runText.matchAll(/\s-m\s+(ingest\.[A-Za-z0-9_.]+)/g)].map((m) => m[1]),
    ];
    // A job that `uses:` a workflow file is a reusable-workflow CALLER: GitHub
    // ignores timeout-minutes there and does not propagate caller env (08g A/B).
    const jobUses = typeof j.uses === "string" ? j.uses : null;
    return {
      id,
      timeoutMinutes: typeof j["timeout-minutes"] === "number" ? j["timeout-minutes"] : null,
      usesRefs: steps.map((s) => String(s.uses ?? "")).filter(Boolean),
      envKeys: [...envKeys],
      modules: [...new Set(modules)],
      callsReusable: jobUses && /\.ya?ml(@|$)/.test(jobUses) ? jobUses : null,
    };
  });
  return { file, name: typeof doc.name === "string" ? doc.name : null, crons, jobs };
}

/** ingest.pipelines.X.pipeline -> ingest/pipelines/X ; ingest.scripts.Y -> ingest/scripts */
export function moduleDir(mod: string): string {
  const parts = mod.split(".");
  if (parts.length >= 3 && (parts[1] === "pipelines" || parts[1] === "duckdb_pipelines")) {
    return parts.slice(0, 3).join("/");
  }
  return parts.slice(0, -1).join("/");
}

export function formatFindings(findings: Finding[]): string {
  const line = (f: Finding) =>
    [
      `${f.severity === "red" ? "RED " : "WARN"} ${f.entry} [${f.rule}]`,
      `    registry: ${f.registrySide}`,
      `    reality:  ${f.otherSide}`,
      `    fix:      ${f.fix}`,
    ].join("\n");
  return findings.map(line).join("\n\n");
}
