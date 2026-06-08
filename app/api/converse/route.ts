import { fetchBrain, buildDossier, BrainNotFoundError } from "@/lib/fetch-brain";
import { RULES_OF_ENGAGEMENT } from "@/refinery/lib/rules-of-engagement.mts";
import { GEOGRAPHY_GAZETTEER } from "@/refinery/lib/geography-gazetteer.mts";
import { getAnthropic, TRIAGE_MODEL } from "@/refinery/agents/anthropic.mts";
import { buildGroundingContext, type GroundingBlock } from "@/lib/highlighter/grounding";
import { resolveReachTargets } from "@/lib/highlighter/reach";
import { fetchReachBlocks } from "@/lib/highlighter/fetch-reach";
import { recordUse } from "@/lib/highlighter/meter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOKENS = 700;

// GEOGRAPHY_GAZETTEER is an object; buildGroundingContext expects a string.
const GAZETTEER_STR = JSON.stringify(GEOGRAPHY_GAZETTEER, null, 2);

/**
 * Produce an async iterable of text strings from whatever the SDK stream
 * object exposes. SDK v0.69.0 returns a MessageStream from messages.stream()
 * that iterates MessageStreamEvent — no .textStream property. Mocks and
 * future SDK versions may expose .textStream directly; check for it first.
 */
async function* extractText(
  ai: AsyncIterable<unknown> & { textStream?: AsyncIterable<string> },
): AsyncIterable<string> {
  if (ai.textStream) {
    yield* ai.textStream;
    return;
  }
  // Real SDK path: iterate MessageStreamEvent, pull content_block_delta text.
  // The SDK's MessageStreamEvent union doesn't structurally narrow here, so we
  // assert the delta shape we care about (verified against @anthropic-ai/sdk
  // v0.69.0: content_block_delta → delta.type "text_delta" → delta.text).
  for await (const event of ai) {
    const e = event as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
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
  let body: { report_id?: string; fact?: string; question?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const { report_id, fact, question } = body;
  // Gate the PRIMARY report on "the brain exists" (fetchBrain → 404 below), NOT
  // on MCP-catalog membership: if a user can view /r/<slug>, they can ask about
  // it, even if that brain isn't in BRAIN_CATALOG (e.g. franchise-outcomes).
  // Reach targets (R1) stay catalog-bound inside resolveReachTargets.
  if (!report_id || typeof report_id !== "string") {
    return Response.json({ error: "report_id required" }, { status: 400 });
  }
  if (!question || typeof question !== "string") {
    return Response.json({ error: "question required" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  // R0: current report dossier (carries every-area detail_tables).
  let primary: GroundingBlock;
  try {
    const { output, freshness_token } = await fetchBrain(report_id, {
      tier: 2,
      origin,
    });
    primary = {
      label: report_id,
      dossier: buildDossier(output, freshness_token),
    };
  } catch (err) {
    const status = err instanceof BrainNotFoundError ? 404 : 500;
    return Response.json({ error: (err as Error).message }, { status });
  }

  // R1: reach to other reports the question implies.
  const reachSlugs = resolveReachTargets(question, report_id);
  const reachBlocks = await fetchReachBlocks(reachSlugs, { origin });

  const system =
    buildGroundingContext({
      rules: RULES_OF_ENGAGEMENT,
      gazetteer: GAZETTEER_STR,
      blocks: [primary, ...reachBlocks],
    }) +
    "\n\nFORMAT: Plain text only — no markdown, no **, no ##, no bullet dashes, no backticks. Clean prose sentences. Speak naturally and helpfully, like a smart friend who knows the SWFL market well. Use the data you have to give a real, useful answer. Never use internal terms like 'master', 'brain', 'grounded data', 'payload', or 'grain'.";

  const userMsg = fact ? `About this fact: "${fact}". ${question}` : question;
  const client = getAnthropic();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const ai = client.messages.stream({
          model: TRIAGE_MODEL, // claude-haiku-4-5
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: "user", content: userMsg }],
        });
        for await (const text of extractText(ai)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
        await recordUse(request, { report_id, reach: reachSlugs });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, reach: reachSlugs })}\n\n`),
        );
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
