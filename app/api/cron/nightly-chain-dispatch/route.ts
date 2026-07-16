// GET /api/cron/nightly-chain-dispatch
//
// External clock for nightly-chain.yml. GitHub's own `schedule:` trigger on that
// workflow fires 2h07m-5h29m late (median +3h07m, measured over 16 fires — see
// docs/audit/2026-07-11-pipeline-problems/08d-nightly-chain-timing.md) because
// GitHub queues scheduled crons; `repository_dispatch` starts in ~4 seconds
// because it doesn't go through that queue. Vercel Cron fires this route at the
// same 04:23 UTC slot nightly-chain.yml's schedule already targets, and this
// route just relays a repository_dispatch to GitHub. `schedule:` stays wired on
// the workflow as a backstop — if this route or Vercel Cron itself fails, the
// chain still runs, just late, instead of not running at all.
//
// GitHub REST API contract verified live (docs.github.com/rest/repos, 07/16/2026):
// POST /repos/{owner}/{repo}/dispatches, fine-grained PAT needs only
// "Contents" repo permission (write) — REBUILD_PAT already has this (it pushes
// to this repo's protected main in daily-rebuild.yml / daily-email-digest.yml),
// so no new PAT, just the existing one added to Vercel's env vars.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REPO_OWNER = "ethanrickyjrjr-wq";
const REPO_NAME = "SWFL-Data-Gulf";
const EVENT_TYPE = "nightly-chain";

export async function GET(request: Request) {
  // Vercel Cron auth — fail-closed in production (a missing secret is a
  // misconfiguration, not an open door).
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.VERCEL_ENV === "production" && !cronSecret) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 503 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const pat = process.env.REBUILD_PAT;
  if (!pat) {
    console.error("[nightly-chain-dispatch] REBUILD_PAT not configured in this Vercel env");
    return NextResponse.json({ error: "Dispatch PAT not configured" }, { status: 503 });
  }

  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${pat}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ event_type: EVENT_TYPE }),
  });

  // Dispatch success is 204 No Content — no body to parse.
  if (res.status !== 204) {
    const body = await res.text().catch(() => "");
    console.error(`[nightly-chain-dispatch] GitHub dispatch failed: ${res.status} ${body}`);
    return NextResponse.json({ error: "Dispatch failed", status: res.status }, { status: 502 });
  }

  return NextResponse.json({ dispatched: EVENT_TYPE, at: new Date().toISOString() });
}
