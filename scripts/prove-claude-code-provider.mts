// Live proof of the claude-code provider: the refinery's ONE model root, on the
// claude.ai subscription, in the exact forced-tool + stream shape synthesis-agent.mts
// uses. No API key, no DB (SKIP_USAGE_LOG=1 keeps the ledger out of it).
//
//   LLM_PROVIDER=claude-code SKIP_USAGE_LOG=1 bun scripts/prove-claude-code-provider.mts
//
// Passes when the tool_use input carries a `facts` array whose fragment ids are the two
// planted ones and whose numbers are the planted ones verbatim (no invention).
import { agentsAreMocked, getAnthropic, SYNTHESIS_MODEL } from "../refinery/agents/anthropic.mts";

if (process.env.LLM_PROVIDER !== "claude-code") {
  console.error("set LLM_PROVIDER=claude-code — this proof is for the subscription backend");
  process.exit(2);
}
console.log(`[proof] mocked=${agentsAreMocked()} provider=${process.env.LLM_PROVIDER} model=${SYNTHESIS_MODEL}`);

const client = getAnthropic("proof");
const t0 = Date.now();
const stream = client.messages.stream(
  {
    model: SYNTHESIS_MODEL,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: "You write one-line, citable reference facts from data fragments. Copy every number verbatim. Never invent a number.",
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: "record_facts",
        description: "Record the refined facts.",
        input_schema: {
          type: "object",
          properties: {
            facts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  topic: { type: "string" },
                  fact: { type: "string" },
                  value: { type: "string" },
                  source_fragment_id: { type: "string" },
                },
                required: ["topic", "fact", "value", "source_fragment_id"],
              },
            },
          },
          required: ["facts"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_facts" },
    messages: [
      {
        role: "user",
        content:
          "Synthesize reference facts from these 2 triaged fragments:\n\n" +
          JSON.stringify(
            [
              { fragment_id: "f1", topic: "tourism", data: { county: "Lee", tdt_collections_usd: 12345678, period: "2026-07" } },
              { fragment_id: "f2", topic: "airport", data: { airport: "RSW", passengers: 654321, period: "2026-07" } },
            ],
            null,
            2,
          ),
      },
    ],
  },
  { timeout: 5 * 60 * 1000 },
);
const msg = await stream.finalMessage();
const block = msg.content[0];
if (!block || block.type !== "tool_use") throw new Error("no tool_use block");
const facts = (block.input as { facts?: Array<Record<string, string>> }).facts ?? [];
const ids = new Set(facts.map((f) => f.source_fragment_id));
const text = JSON.stringify(facts);
const ok = ids.has("f1") && ids.has("f2") && text.includes("12345678") && text.includes("654321");
console.log(`[proof] elapsed_ms=${Date.now() - t0} model=${msg.model} usage=${JSON.stringify(msg.usage)}`);
console.log(JSON.stringify(facts, null, 2));
console.log(ok ? "[proof] PASS — both fragments cited, both numbers verbatim" : "[proof] FAIL");
process.exit(ok ? 0 : 1);
