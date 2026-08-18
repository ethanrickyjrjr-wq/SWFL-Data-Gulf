// POST — two modes on the social composer:
//   Fill (today):  { scope?, skeleton, platforms?, goalTone? } -> CanvasFillResult
//   Author (new):  { scope?, projectId?, prompt, format?, author:true, platforms?, goalTone?, branding? }
//                  -> { design, caption, hashtags, variants, webSources }
// No auth — builds are free, send is the paywall (mirrors /api/email-lab/social-calendar/route.ts).
// Writes nothing. Fill: skeleton must be non-empty. Author: prompt must be non-empty.
//
// LIVE STREAMING (spec 2026-08-18, Phase 2): `stream: true` on the body switches the
// response to NDJSON over the ONE wire protocol (lib/email/lab/stream-events.ts).
// WITHOUT that flag every byte of this route's behavior is unchanged — the deploy-skew
// guard, so a new client and an old server (or the reverse) still work.
//   Fill   → `status` … `slot` … `done`
//   Author → `status` … `done`   (see the note on the author fork below)
// A streamed build that FAILS is still HTTP 200: the `error` event is the failure
// signal, and a client already reading the body must not have the transport yanked.
// The two pre-fork 400s stay real JSON with real status codes — a request that never
// reaches a build has no stream to fail in, and the client branches on content-type.
import { NextResponse, type NextRequest } from "next/server";
import { buildSocialCanvasFill } from "@/lib/email/social-calendar/build-canvas-fill";
import { authorSocialPost } from "@/lib/social/design/author";
import { loadProjectUploadsText } from "@/lib/project/uploads-text";
import { loadUserDataText } from "@/lib/project/user-data-feed";
import { isSocialFormat } from "@/lib/social/formats";
import { createSocialBuildEmitter } from "@/lib/social/design/stream-emitter";
import { slotFieldFor } from "@/lib/social/design/serialize";
import type { BuildScope } from "@/lib/email/build-doc";
import type { Platform } from "@/lib/social/types";
import type { SocialElement } from "@/lib/social/design/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** What a build produced, transport-agnostic. Declaring the build ONCE and letting both
 *  branches call it is the only thing that keeps a streamed `done` from drifting away
 *  from a plain POST — there is no second copy of the arg list to fall out of sync. */
interface BuildOutcome {
  httpStatus?: number;
  payload: Record<string, unknown>;
}

function jsonFrom({ httpStatus, payload }: BuildOutcome): NextResponse {
  return httpStatus
    ? NextResponse.json(payload, { status: httpStatus })
    : NextResponse.json(payload);
}

function ndjson(run: (write: (s: string) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await run((s) => controller.enqueue(encoder.encode(s)));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const scope = body?.scope as BuildScope | undefined;
  const platforms = Array.isArray(body?.platforms) ? (body.platforms as Platform[]) : undefined;
  const goalTone = body?.goalTone;
  const wantsStream = body?.stream === true;

  // ── Author: compose a whole post (layout + cited copy) from one sentence ──
  if (body?.author === true) {
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "no prompt" }, { status: 400 });
    }
    const projectId = typeof body?.projectId === "string" ? body.projectId : undefined;
    const format = isSocialFormat(body?.format) ? body.format : undefined;
    const branding =
      body?.branding && typeof body.branding === "object"
        ? (body.branding as Record<string, string>)
        : undefined;

    const runBuild = async (onStatus?: (label: string) => void): Promise<BuildOutcome> => {
      // Equal-source: the project's uploaded files ride alongside the lake + web feed.
      // Typed lane (spec 2026-08-03): user listings + stated figures join the blob
      // lane's text, each block carrying its origin.
      const uploadsText = projectId ? await loadProjectUploadsText(projectId) : undefined;
      const userDataText = projectId ? await loadUserDataText(projectId) : undefined;
      const filesText = [uploadsText, userDataText].filter(Boolean).join("\n\n") || undefined;
      const result = await authorSocialPost(scope, prompt, {
        branding,
        format,
        filesText,
        platforms,
        goalTone,
        onStatus,
      });
      if (!result) return { httpStatus: 502, payload: { error: "author_failed" } };
      return { payload: result as unknown as Record<string, unknown> };
    };

    if (!wantsStream) return jsonFrom(await runBuild());

    return ndjson(async (write) => {
      // STATUS + DONE ONLY, and that is honest rather than lazy: the author reseats
      // the whole canvas with a TEMPLATE's element ids the client has never seen, and
      // the protocol carries no social-design event — a `slot` naming an id the canvas
      // does not hold would be an invented beat. The empty skeleton makes that
      // structural: this emitter refuses every slot.
      const emitter = createSocialBuildEmitter(write, {});
      try {
        const { httpStatus, payload } = await runBuild((label) => emitter.status(label));
        if (httpStatus && httpStatus >= 400) {
          emitter.error(String(payload.error ?? "build failed"));
        } else {
          emitter.done(payload);
        }
      } catch (err) {
        // The exception text stays in the LOG, never on the wire — an internal
        // message reaching the client is a leak whichever transport carries it.
        console.error("[social/generate] stream author build failed:", err);
        emitter.error("Something went wrong on the server — check logs.");
      }
    });
  }

  // ── Fill: write cited copy into a hand-built canvas (unchanged) ──
  const skeleton = (body?.skeleton ?? {}) as Record<string, Record<string, string>>;
  if (Object.keys(skeleton).length === 0) {
    return NextResponse.json({ error: "no elements to fill" }, { status: 400 });
  }

  const runFill = async (onStatus?: (label: string) => void): Promise<BuildOutcome> => {
    const result = await buildSocialCanvasFill(scope, skeleton, { platforms, goalTone, onStatus });
    if (!result) return { httpStatus: 502, payload: { error: "fill_failed" } };
    return { payload: result as unknown as Record<string, unknown> };
  };

  if (!wantsStream) return jsonFrom(await runFill());

  return ndjson(async (write) => {
    const emitter = createSocialBuildEmitter(write, skeleton);
    try {
      const { httpStatus, payload } = await runFill((label) => emitter.status(label));
      if (httpStatus && httpStatus >= 400) {
        emitter.error(String(payload.error ?? "build failed"));
        return;
      }
      // Per-slot beats off the patch the build actually produced — the same post-hoc
      // shape `authorDoc`'s `emitBuilt` uses on the email lane (one vendor call, beats
      // in the order the work happened). Multi-field elements (`stat`) are NOT
      // addressable by a one-string `slot`, so they are skipped HERE rather than
      // refused by the emitter: an `error` event is terminal to the client, and a
      // stat is not an error. Nothing is lost — `done` carries the whole patch.
      const patch = (payload.patch ?? {}) as Record<string, Record<string, unknown>>;
      for (const [id, fields] of Object.entries(patch)) {
        const field = slotFieldFor(skeleton[id]?.type as SocialElement["type"]);
        if (!field) continue;
        const text = fields?.[field];
        if (typeof text === "string" && text.trim()) emitter.slot(id, text);
      }
      emitter.done(payload);
    } catch (err) {
      console.error("[social/generate] stream fill build failed:", err);
      emitter.error("Something went wrong on the server — check logs.");
    }
  });
}
