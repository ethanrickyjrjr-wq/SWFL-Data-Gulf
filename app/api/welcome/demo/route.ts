import { demoFrames } from "@/app/welcome/_fixtures/demo-answer";
import type { WelcomeFrame } from "@/lib/welcome/frames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Demo replay of the grounded-answer frame contract (place → answer → text → done),
 * behind its OWN route so it never touches the live `chat` grounding path. The
 * welcome client hits this when `?demo=1` is on the URL; production ZIP reads hit
 * /api/welcome/chat (real grounded prose today; the structured {answer} frame lights
 * the cards once the grounding fan-out emits it — see lib/welcome/frames.ts).
 */

/** Per-frame pacing so the pre-answer skeleton dwell and the typed synthesis are
 *  actually visible when smoke-testing the UI. */
function frameDelayMs(frame: WelcomeFrame): number {
  if (frame.type === "data") return 700; // skeleton dwell — simulated dossier fetch
  if (frame.type === "text") return 90; // visible token streaming
  return 40;
}

export async function POST(request: Request): Promise<Response> {
  let body: { messages?: { role?: string; content?: string }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages[messages.length - 1]?.content;
  const zip = typeof last === "string" ? last.match(/\b\d{5}\b/)?.[0] : undefined;
  if (!zip) {
    return Response.json({ error: "demo needs a 5-digit ZIP" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const frame of demoFrames(zip)) {
        await new Promise((resolve) => setTimeout(resolve, frameDelayMs(frame)));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
