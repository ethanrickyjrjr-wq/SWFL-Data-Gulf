import { getAnthropic, TRIAGE_MODEL } from "@/refinery/agents/anthropic.mts";
import {
  recordWelcomeChat,
  welcomeCapEnabled,
  welcomeChatWeeklyCount,
} from "@/lib/welcome/chat-usage";
import { clientIdFromRequest } from "@/lib/highlighter/meter";
import { buildPlaceContext } from "@/lib/place-context";
import { resolveLocation } from "@/refinery/lib/location-resolver.mts";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { renderLocationDossierText } from "@/lib/zip-dossier";
import { assembleGuardedDossier } from "@/lib/welcome/dossier-cache";
import {
  detectWelcomeLocation,
  buildWelcomeGroundedSystem,
  OUT_OF_SCOPE_GAP,
  BUSY_GAP,
} from "@/lib/welcome/grounded";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOKENS = 500; // un-grounded explainer
const GROUNDED_MAX_TOKENS = 700; // grounded path — more real, cited data to relay
const MAX_HISTORY = 12;

// Cost guards — public, unauthenticated, paid-Haiku surface (per-IP burst lives in
// middleware RATE_LIMITED_PREFIXES). Only the last MAX_HISTORY messages reach the
// model, so the aggregate bound is over THAT sliced set.
const MAX_MSG_CHARS = 4000; // per-message content cap
const MAX_TOTAL_CHARS = 16000; // aggregate over the model-bound slice (last MAX_HISTORY)
const MAX_MESSAGES = 200; // raw-array sanity cap (parse-bomb insurance)
// Env-gated per-client weekly cap (rolling 7-day). Read live (tunable without
// redeploy). 0/unset → disabled.
function freeWeeklyCap(): number {
  return Number(process.env.WELCOME_CHAT_FREE_WEEKLY_CAP ?? "0");
}

/** Minimal SSE Response: one text line + done, NO model call (over-cap path). */
function sseMessage(text: string): Response {
  const body =
    `data: ${JSON.stringify({ text })}\n\n` + `data: ${JSON.stringify({ done: true })}\n\n`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" },
  });
}

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

/** Stream a Haiku answer for the given system prompt as SSE — the shared tail for
 * both the un-grounded explainer and the grounded paths. */
function streamAnswer(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = getAnthropic();
        const ai = client.messages.stream({
          model: TRIAGE_MODEL, // claude-haiku-4-5
          max_tokens: maxTokens,
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

  // Bound inbound size BEFORE any model spend. Only the sliced set (last
  // MAX_HISTORY) reaches the model, so the aggregate gate is over THAT: a flood of
  // short messages is dropped by the slice, and one giant message is caught
  // per-message. The raw-array cap is parse-bomb insurance.
  if (all.length > MAX_MESSAGES) {
    return Response.json({ error: "too many messages" }, { status: 400 });
  }
  if (messages.some((m) => m.content.length > MAX_MSG_CHARS)) {
    return Response.json({ error: "message too long" }, { status: 400 });
  }
  if (messages.reduce((n, m) => n + m.content.length, 0) > MAX_TOTAL_CHARS) {
    return Response.json({ error: "conversation too long" }, { status: 400 });
  }

  // Env-gated per-client weekly cap (rolling 7-day). Anon cids are covered by the
  // per-IP burst limiter in middleware. Fail-open (welcomeChatWeeklyCount → 0 on error).
  const cap = freeWeeklyCap();
  if (welcomeCapEnabled() && cap > 0) {
    const cid = clientIdFromRequest(request);
    if (cid !== "anon" && (await welcomeChatWeeklyCount(cid)) >= cap) {
      return sseMessage(
        "Thanks for the interest! You've hit this week's limit for the assistant — reach out and we'll keep going.",
      );
    }
  }

  // Fire-and-forget telemetry — zero enforcement.
  void recordWelcomeChat(request, messages.length);

  // Does the conversation name a SWFL location? If not, keep the un-grounded
  // explainer (steers "give me a ZIP or place"). If so, ground Haiku on the real
  // per-location dossier — the converse pattern, no invention.
  const detected = detectWelcomeLocation(messages);
  const lastUser = messages[messages.length - 1].content;

  if (!detected) {
    const system = buildPlaceContext(lastUser) + FORMAT_RULE + WELCOME_SYSTEM;
    return streamAnswer(system, messages, MAX_TOKENS);
  }

  // A typed ZIP outside the six-county footprint → honest gap, no fetch, no model.
  if (detected.explicitZip && !resolveLocationIsInScope(detected.token)) {
    return sseMessage(OUT_OF_SCOPE_GAP);
  }

  const origin = new URL(request.url).origin;
  const loc = await resolveLocation(detected.token);
  if (loc.kind === "out-of-scope" || loc.kind === "address-unsupported") {
    return sseMessage(OUT_OF_SCOPE_GAP);
  }

  // Cache + daily-ceiling guarded fan-out (the expensive op). Over the ceiling → busy.
  const guarded = await assembleGuardedDossier(loc, { origin });
  if (guarded.capped || !guarded.dossier) return sseMessage(BUSY_GAP);
  const dossier = guarded.dossier;

  // Out-of-scope or no covering reads → stream the honest dossier text verbatim
  // (it cannot invent — no model call).
  if (!dossier.in_scope || dossier.lines.length === 0) {
    return sseMessage(renderLocationDossierText(dossier, 2));
  }

  const system = buildWelcomeGroundedSystem({
    dossier,
    detectedText: detected.token,
    explicitZip: detected.explicitZip,
    tier: 2,
  });
  return streamAnswer(system, messages, GROUNDED_MAX_TOKENS);
}

/** Cheap in-memory scope check for a 5-digit ZIP (resolveZip via resolveLocation's gate). */
function resolveLocationIsInScope(zip: string): boolean {
  return /^\d{5}$/.test(zip) && resolveZip(zip).in_scope;
}
