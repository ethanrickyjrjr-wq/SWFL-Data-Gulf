// Shared SSE plumbing for the one assistant engine. Both legacy routes
// (/api/converse and /api/welcome/chat) duplicated extractText + the SSE headers
// verbatim; this is the one copy. The report path builds its own ReadableStream
// (it interleaves a chart frame + gap-log), so it reuses extractText + headers
// rather than streamAnswer.
import { getAnthropic, TRIAGE_MODEL } from "@/refinery/agents/anthropic.mts";
import { scrubBrainSlugs } from "@/refinery/render/speaker.mts";
import type { WelcomeFrame } from "@/lib/welcome/frames";

export const SSE_STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store",
  Connection: "keep-alive",
} as const;

export const SSE_MESSAGE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

/** A minimal SSE Response: one text line + done, NO model call (over-cap / honest-gap
 *  paths). The whole point is zero token spend. */
export function sseMessage(text: string): Response {
  const body =
    `data: ${JSON.stringify({ text })}\n\n` + `data: ${JSON.stringify({ done: true })}\n\n`;
  return new Response(body, { status: 200, headers: SSE_MESSAGE_HEADERS });
}

/**
 * Yield text from the SDK MessageStream. SDK v0.69.0 returns a MessageStream with no
 * .textStream property; mocks and future SDK versions may expose it — check it first.
 * The real-SDK branch pulls content_block_delta text (verified against @anthropic-ai/sdk
 * v0.69.0: content_block_delta → delta.type "text_delta" → delta.text).
 */
export async function* extractText(
  ai: AsyncIterable<unknown> & { textStream?: AsyncIterable<string> },
): AsyncIterable<string> {
  if (ai.textStream) {
    yield* ai.textStream;
    return;
  }
  for await (const event of ai) {
    const e = event as { type?: string; delta?: { type?: string; text?: string } };
    if (
      e.type === "content_block_delta" &&
      e.delta?.type === "text_delta" &&
      typeof e.delta.text === "string"
    ) {
      yield e.delta.text;
    }
  }
}

/** The longest trailing token run we'll hold back waiting for the rest of a slug. A
 *  runaway hyphenated string past this can't be worth stalling the stream for. */
const TAIL_MAX = 64;

/**
 * LAYER 2 of the brain-slug scrub — the belt to layer 1's suspenders.
 *
 * Layer 1 (grounding.ts `renderBlock`) is the real fix: the model cannot speak a name
 * it never saw. This catches what layer 1 structurally cannot — a slug the model
 * hallucinates, or one that reaches the prompt through a grounding path added later.
 *
 * The whole reason this is a generator and not a `.replace()` on each chunk: the model
 * streams text in token-sized pieces, so `listing-momentum-swfl` routinely arrives as
 * `listing-momentum-` + `swfl` and a per-chunk regex sees neither. We hold back the
 * trailing run of token characters, which guarantees the emitted prefix never ends
 * mid-slug, and flush the remainder once the stream completes.
 */
export async function* scrubSlugStream(src: AsyncIterable<string>): AsyncIterable<string> {
  let held = "";
  for await (const chunk of src) {
    const buf = held + chunk;
    const tail = /[A-Za-z0-9-]+$/.exec(buf);
    const cut = tail && tail[0].length <= TAIL_MAX ? tail.index : buf.length;
    held = buf.slice(cut);
    const emit = buf.slice(0, cut);
    if (emit) yield scrubBrainSlugs(emit);
  }
  if (held) yield scrubBrainSlugs(held);
}

/**
 * Stream a Haiku answer for the given system prompt as SSE, optionally preceded by typed
 * prelude frames (place + grounded cards). The shared tail for the conversation path
 * (un-grounded explainer + grounded paths). Clients branch on frame `type` and ignore
 * unknown types, so the prelude is a backward-compatible extension of the SSE stream.
 */
export function streamAnswer(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number,
  prelude: WelcomeFrame[] = [],
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const frame of prelude) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        }
        const client = getAnthropic("assistant_stream");
        const ai = client.messages.stream({
          model: TRIAGE_MODEL, // claude-haiku-4-5
          max_tokens: maxTokens,
          system,
          messages,
        });
        for await (const text of scrubSlugStream(extractText(ai))) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (e) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: (e as Error).message })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: SSE_STREAM_HEADERS });
}
