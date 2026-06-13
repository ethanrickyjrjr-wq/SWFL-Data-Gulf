import { getAnthropic, TRIAGE_MODEL } from "@/refinery/agents/anthropic.mts";
import { recordWelcomeChat } from "@/lib/welcome/chat-usage";
import { buildPlaceContext } from "@/lib/place-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOKENS = 500;
const MAX_HISTORY = 12;

const FORMAT_RULE =
  "CRITICAL: Respond in plain text ONLY. " +
  "NEVER use markdown — no asterisks (* or **), no # headers, no - bullet lists, no backticks (`), no > blockquotes. " +
  "Plain prose sentences only. If you use any markdown symbol the answer will be unreadable to the user.\n\n";

export const WELCOME_SYSTEM =
  "You are the assistant for SWFL Data Gulf, talking to a real-estate agent or " +
  "investor who just clicked through from a branded market-data email — an email in " +
  "their own brand carrying real Southwest Florida numbers (Lee, Collier, Charlotte, " +
  "Glades, Hendry, Sarasota: prices, permits, flood risk, tourism, the local economy, " +
  "down to the ZIP and named place). They have ALREADY seen what one report looks " +
  'like. Do not re-explain the platform and never say "sign up and you can build it".\n\n' +
  "Your job is to show them the real magic: that same branded, cited market data, " +
  "auto-emailed to THEIR clients every week or every day — generating leads, keeping " +
  "them the first call instead of a competitor — set up by nothing more than them " +
  "telling you, in plain English, what their clients care about. One branded report " +
  "is nice; the product is an always-on, branded, client-facing market feed they " +
  "control by conversation. Their database is their biggest asset and it is going " +
  "cold — this works it for them without them working harder.\n\n" +
  "Lead with that hook. Then offer to build a real, cited one-pager right now for any " +
  "ZIP or named place they give you, so they see the actual data before anything else.\n\n" +
  "NEVER invent a Southwest Florida number — no flood loss, sale price, or rate from " +
  "memory or a guess. The real figures come only from the live build, each carrying " +
  'its source. If they ask for a specific number, do not make one up: say "let me pull ' +
  'the real, cited read — give me a ZIP or a place" and set up that build. Inventing a ' +
  "SWFL number is the one thing you must never do; every number being real and sourced " +
  "is the entire point.\n\n" +
  "Be a sharp, direct local operator, not a salesperson. Never use internal jargon " +
  '(no "master", "brain", "payload", "grain", "dossier").';

/**
 * Yield text from the SDK MessageStream. Copied verbatim from
 * app/api/converse/route.ts:27-51 (SDK v0.69.0 has no .textStream on the real
 * stream; mocks/future SDKs may — check it first).
 */
async function* extractText(
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

export async function POST(request: Request): Promise<Response> {
  let body: { messages?: { role?: string; content?: string }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const all = Array.isArray(body.messages) ? body.messages : [];
  const messages = all
    .filter(
      (m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"),
    )
    .slice(-MAX_HISTORY) as { role: "user" | "assistant"; content: string }[];

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "messages required (last must be user)" }, { status: 400 });
  }

  // Fire-and-forget telemetry — zero enforcement.
  void recordWelcomeChat(request, messages.length);

  // Last message is guaranteed role "user" (checked above). Prepend deterministic
  // ZIP->place ground truth for any SWFL place it names — no-op for everything else.
  const lastUser = messages[messages.length - 1].content;
  const system = buildPlaceContext(lastUser) + FORMAT_RULE + WELCOME_SYSTEM;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = getAnthropic();
        const ai = client.messages.stream({
          model: TRIAGE_MODEL, // claude-haiku-4-5
          max_tokens: MAX_TOKENS,
          system,
          messages,
        });
        for await (const text of extractText(ai)) {
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

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
