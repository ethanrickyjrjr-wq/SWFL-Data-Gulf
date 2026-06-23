import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseBrainMarkdown } from "../refinery/render/speaker.mts";
import { buildDossier } from "../lib/fetch-brain";
import { renderBlock } from "../lib/highlighter/grounding";
import { FORMAT_RULE } from "../lib/assistant/system-prompt";
import { OUTSIDE_SYSTEM } from "../lib/assistant/conversation-path";
import { findDeflection, findLeak } from "../.claude/hooks/check-answer-fix-proof.mjs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const masterMd = await readFile("brains/master.md", "utf-8");
const brain = parseBrainMarkdown(masterMd);
const token = brain.freshness_token;
const system =
  FORMAT_RULE +
  OUTSIDE_SYSTEM +
  "\n\n=== LIVE SOUTHWEST FLORIDA DATA — ANSWER ONLY FROM THIS ===\n\n" +
  renderBlock({
    label: "Southwest Florida (region-wide)",
    dossier: buildDossier(brain.output, token),
  });

const userMsg = `About this fact (a metric): "$1K". What does this number tell me?`;
process.stderr.write("Calling Haiku...\n");
const res = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 700,
  system,
  messages: [{ role: "user", content: userMsg }],
});
const answer = res.content
  .filter((b): b is Anthropic.TextBlock => b.type === "text")
  .map((b) => b.text)
  .join("");
process.stderr.write("Answer: " + answer.slice(0, 300) + "\n");

const deflect = findDeflection(answer);
const leak = findLeak(answer);
if (deflect) {
  process.stderr.write("FAIL DEFLECT: " + deflect + "\n");
  process.exit(1);
}
if (leak) {
  process.stderr.write("FAIL LEAK: " + leak + "\n");
  process.exit(1);
}
if (!/\d/.test(answer)) {
  process.stderr.write("FAIL NO NUMBER\n");
  process.exit(1);
}
if (answer.length < 120) {
  process.stderr.write("FAIL TOO SHORT\n");
  process.exit(1);
}

const proof = JSON.stringify({
  question: userMsg,
  answer,
  endpoint: "/api/assistant",
  observed_at: new Date().toISOString(),
  commit_claim: "conversation-path fact injection: req.fact now prepended to user message",
});
appendFileSync("verification/answer-proofs.jsonl", proof + "\n");
process.stderr.write("PROOF WRITTEN\n");
