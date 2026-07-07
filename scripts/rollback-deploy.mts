#!/usr/bin/env bun
/**
 * scripts/rollback-deploy.mts — the rollback actuator for the self-healing loop.
 *
 * Called by .github/workflows/rollback-on-red.yml AFTER a confirmed critical
 * smoke failure. Rolls production back to the previous good deployment via the
 * Vercel REST API (Instant Rollback).
 *
 * Guards (defence in depth):
 *   - SELFHEAL_ROLLBACK_ENABLED must be exactly "true" (kill switch; DARK by default).
 *   - Aborts if the live prod deploy's commit != FAILED_SHA (something else shipped
 *     in between — never blind-rollback).
 *   - Aborts if there is no eligible previous rollback candidate.
 *   - Never prints the token.
 *
 * Env:
 *   VERCEL_ROLLBACK_TOKEN      team-scoped token that can read + roll back deployments
 *   VERCEL_TEAM_ID             team_...  (default: our team)
 *   VERCEL_PROJECT_ID          prj_...   (default: brain-platform)
 *   FAILED_SHA                 the git sha that failed smoke (github.event.deployment.sha)
 *   SELFHEAL_ROLLBACK_ENABLED  "true" to actually roll back; anything else = dark
 *
 * Exit: 0 = rolled back OR intentionally dark/skipped; 1 = error/abort.
 */

const API = "https://api.vercel.com";
const TEAM = process.env.VERCEL_TEAM_ID || "team_TePIKAawK3I5cX7Sw6TeLcLY";
const PROJECT = process.env.VERCEL_PROJECT_ID || "prj_RpRXhBmez73yyb7ODrUCx3xkwSCy";
const TOKEN = process.env.VERCEL_ROLLBACK_TOKEN || "";
const FAILED_SHA = process.env.FAILED_SHA || "";
const ENABLED = process.env.SELFHEAL_ROLLBACK_ENABLED === "true";

function log(msg: string): void {
  console.log(`[rollback] ${msg}`);
}

type Deploy = {
  uid: string;
  state: string;
  isRollbackCandidate?: boolean;
  meta?: { githubCommitSha?: string };
};

async function vercel(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API}${path}${sep}teamId=${TEAM}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`Vercel ${res.status} on ${path}: ${JSON.stringify(body)}`);
  return (body ?? {}) as Record<string, unknown>;
}

async function main(): Promise<void> {
  if (!TOKEN) throw new Error("VERCEL_ROLLBACK_TOKEN not set");

  // Newest-first production deployments.
  const data = await vercel(`/v6/deployments?projectId=${PROJECT}&target=production&limit=10`);
  const all = (data.deployments as Deploy[] | undefined) ?? [];
  const ready = all.filter((d) => d.state === "READY");
  if (ready.length < 2) {
    log(`only ${ready.length} READY production deploy(s) — nothing to roll back to. Abort.`);
    process.exit(1);
  }

  const current = ready[0];
  const previous = ready.find((d, i) => i > 0 && d.isRollbackCandidate && d.uid !== current.uid);
  if (!previous) {
    log("no eligible previous rollback candidate. Abort.");
    process.exit(1);
  }

  const currentSha = current.meta?.githubCommitSha ?? "(unknown)";
  log(`current prod:    ${current.uid} @ ${currentSha}`);
  log(`rollback target: ${previous.uid} @ ${previous.meta?.githubCommitSha ?? "(unknown)"}`);

  // Safety: the live prod deploy must be the one that failed smoke. If a newer
  // deploy shipped in between, do NOT blind-rollback — that's a human call.
  if (FAILED_SHA && currentSha !== FAILED_SHA) {
    log(`ABORT: live prod (${currentSha}) != failed sha (${FAILED_SHA}) — newer deploy exists.`);
    process.exit(1);
  }

  if (!ENABLED) {
    log("SELFHEAL_ROLLBACK_ENABLED != 'true' — DARK MODE. Would roll back; taking no action.");
    log("(to arm: set repo variable SELFHEAL_ROLLBACK_ENABLED=true)");
    process.exit(0);
  }

  log(`rolling production back to ${previous.uid} ...`);
  await vercel(`/v1/projects/${PROJECT}/rollback/${previous.uid}`, { method: "POST" });
  log("rollback requested.");
  log("NOTE: Vercel disables auto-assignment of prod domains after a rollback — new pushes to");
  log("main will NOT auto-go-live until a good deploy is promoted forward:");
  log("  vercel promote <good-deployment-url>   (or Instant Rollback 'undo' in the dashboard)");
}

main().catch((e: Error) => {
  console.error(`[rollback] ERROR: ${e.message}`);
  process.exit(1);
});
