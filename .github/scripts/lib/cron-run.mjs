// Shared helpers for the cron-failure logger + healer.
// Extracted verbatim from log-cron-incident.mjs (no behaviour change) so both
// .github/scripts/log-cron-incident.mjs and .github/scripts/heal-cron-failure.mjs
// derive the workflow slug and fetch the failed-run log tail the same way.

import { execSync } from "node:child_process";

// Canonical ledger key: kebab-case workflow filename (matches the existing
// hand-typed convention). e.g. run.path ".github/workflows/faf5-annual.yml" -> "faf5-annual".
// Human-readable run.name is kept for issue-comment / title display.
export function deriveWorkflowName(run) {
  const workflowPath = run.path || "";
  const workflowName = (workflowPath.split("/").pop() || run.name || "unknown").replace(
    /\.ya?ml$/,
    "",
  );
  return { workflowName, workflowDisplayName: run.name || workflowName };
}

// Last `lines` lines of the failed jobs' logs for the given run id.
// Default widened 30→200 (Phase-1 build 04): a traceback's root line is often
// above a 30-line window, so the classifier was bucketing real roots as UNKNOWN.
// Returns a short diagnostic string (never throws) if the logs can't be fetched.
export function fetchLogTail(id, lines = 200) {
  try {
    const out = execSync(`gh run view ${id} --log-failed`, {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.trim().split("\n").slice(-lines).join("\n");
  } catch (e) {
    const oneLine = (e.message || "unknown").replace(/\s+/g, " ").slice(0, 200);
    return `(could not fetch logs: ${oneLine})`;
  }
}

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// .github/scripts/lib/ -> .github/_watch-manifest.json. Module-relative, so it resolves
// identically whether the handler runs from the repo root (CI) or from .github/scripts
// (the dry-run subprocess test).
const MANIFEST = resolve(HERE, "../../_watch-manifest.json");

/** The generated watch manifest. [] if absent — a missing manifest must never crash a watcher. */
export function loadWatchManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    return [];
  }
}

/** The manifest entry for a workflow_run payload, keyed by workflow filename. */
export function manifestEntry(run) {
  const file = (run.path || "").split("/").pop();
  if (!file) return null;
  return loadWatchManifest().find((e) => e.file === file) ?? null;
}

/**
 * Did a NEWER run of this workflow start after the given one? Only meaningful for a
 * workflow that declares `cancel-in-progress` — the caller MUST gate on that, so this
 * gh call never fires in prod today (no scheduled workflow declares it). Returns false
 * on any error: an unproven "superseded" must never silence a real cancel.
 */
export function hasNewerRun(run) {
  const file = (run.path || "").split("/").pop();
  const started = Date.parse(run.run_started_at ?? run.created_at ?? "");
  if (!file || !Number.isFinite(started)) return false;
  try {
    const out = execSync(`gh run list --workflow=${file} --limit 10 --json databaseId,createdAt`, {
      encoding: "utf8",
      env: process.env,
    });
    return JSON.parse(out).some(
      (r) => r.databaseId !== run.id && Date.parse(r.createdAt) > started,
    );
  } catch {
    return false;
  }
}
