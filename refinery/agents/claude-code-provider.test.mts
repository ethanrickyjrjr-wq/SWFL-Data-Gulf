import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import {
  CLAUDE_CODE_MODEL_PREFIX,
  buildArgs,
  childEnv,
  makeClaudeCodeMessageSurface,
  toMessage,
  toRequest,
} from "./claude-code-provider.mts";
import { computeCostUsd } from "./anthropic.mts";

const SCHEMA = {
  type: "object",
  properties: { facts: { type: "array", items: { type: "string" } } },
  required: ["facts"],
};

const SDK_PARAMS = {
  model: "claude-sonnet-4-6",
  max_tokens: 16000,
  system: [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }],
  tools: [{ name: "record_facts", description: "d", input_schema: SCHEMA }],
  tool_choice: { type: "tool", name: "record_facts" },
  messages: [{ role: "user", content: "Synthesize." }],
};

describe("toRequest() — the forced-tool shape every refinery agent sends", () => {
  test("narrows the synthesis/triage/corridor request shape", () => {
    const req = toRequest(SDK_PARAMS);
    assert.equal(req.model, "claude-sonnet-4-6");
    assert.equal(req.systemPrompt, "SYSTEM");
    assert.equal(req.userText, "Synthesize.");
    assert.equal(req.toolName, "record_facts");
    assert.deepEqual(req.inputSchema, SCHEMA);
  });

  test("failure mode 3: refuses a request without a forced tool instead of narrowing it", () => {
    assert.throws(() => toRequest({ ...SDK_PARAMS, tool_choice: { type: "auto" } }), /forced tool_choice/);
    assert.throws(
      () => toRequest({ ...SDK_PARAMS, messages: [...SDK_PARAMS.messages, { role: "user", content: "x" }] }),
      /exactly one user message/,
    );
    assert.throws(
      () => toRequest({ ...SDK_PARAMS, messages: [{ role: "user", content: [{ type: "image" }] }] }),
      /non-text block/,
    );
  });
});

describe("buildArgs() — failure mode 1: --bare would turn the machine login off", () => {
  test("never emits --bare, always structured output + no tools", () => {
    const args = buildArgs(toRequest(SDK_PARAMS));
    assert.ok(!args.includes("--bare"), "--bare kills the claude.ai login (CLI help text)");
    assert.ok(args.includes("-p"));
    assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet-4-6");
    assert.equal(args[args.indexOf("--output-format") + 1], "json");
    assert.deepEqual(JSON.parse(args[args.indexOf("--json-schema") + 1]), SCHEMA);
    assert.equal(args[args.indexOf("--tools") + 1], "");
    assert.equal(args[args.indexOf("--system-prompt") + 1], "SYSTEM");
  });
});

describe("childEnv() — failure mode 2: an exported API key turns a subscription seat into billing", () => {
  test("strips ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN, keeps the rest", () => {
    const e = childEnv({ ANTHROPIC_API_KEY: "sk-ant-x", ANTHROPIC_AUTH_TOKEN: "t", PATH: "/bin", HOME: "/h" });
    assert.equal(e.ANTHROPIC_API_KEY, undefined);
    assert.equal(e.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(e.PATH, "/bin");
    assert.equal(e.HOME, "/h");
  });
});

describe("toMessage() — the CLI's JSON result as an SDK-shaped Message", () => {
  const req = toRequest(SDK_PARAMS);
  // Shape captured live 2026-09-15 from `claude -p --output-format json --json-schema`.
  const LIVE = {
    is_error: false,
    result: '{"facts":["a","b"]}',
    structured_output: { facts: ["a", "b"] },
    terminal_reason: "completed",
    modelUsage: {
      "claude-haiku-4-5-20251001": { inputTokens: 902, outputTokens: 11, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, canonicalModel: "claude-haiku-4-5" },
      "claude-sonnet-5": { inputTokens: 2, outputTokens: 163, cacheReadInputTokens: 0, cacheCreationInputTokens: 5878, canonicalModel: "claude-sonnet-5" },
    },
  };

  test("structured_output becomes the forced tool's tool_use input", () => {
    const msg = toMessage(JSON.stringify(LIVE), req);
    const block = msg.content[0];
    assert.equal(block.type, "tool_use");
    if (block.type !== "tool_use") throw new Error("unreachable");
    assert.equal(block.name, "record_facts");
    assert.deepEqual(block.input, { facts: ["a", "b"] });
    assert.equal(msg.stop_reason, "tool_use");
  });

  test("usage sums every model the turn touched; the reported model is the one that wrote the answer", () => {
    const msg = toMessage(JSON.stringify(LIVE), req);
    assert.equal(msg.usage.input_tokens, 904);
    assert.equal(msg.usage.output_tokens, 174);
    assert.equal(msg.usage.cache_creation_input_tokens, 5878);
    assert.equal(msg.model, `${CLAUDE_CODE_MODEL_PREFIX}claude-sonnet-5`);
  });

  test("failure mode 5: the ledger prices a subscription row at $0, tokens preserved", () => {
    const msg = toMessage(JSON.stringify(LIVE), req);
    assert.equal(computeCostUsd(msg.model, msg.usage), 0);
  });

  test("failure mode 4: an error or a missing structured_output throws with the CLI's text", () => {
    assert.throws(
      () => toMessage(JSON.stringify({ is_error: true, result: "Authentication error" }), req),
      /Authentication error/,
    );
    assert.throws(
      () => toMessage(JSON.stringify({ is_error: false, result: "plain prose", terminal_reason: "completed" }), req),
      /no structured_output/,
    );
    assert.throws(() => toMessage("not json", req), /not JSON/);
  });
});

describe("makeClaudeCodeMessageSurface() — the surface the model root wraps", () => {
  test("exposes create and stream; stream().finalMessage() is the same promise", () => {
    const s = makeClaudeCodeMessageSurface();
    assert.equal(typeof s.create, "function");
    assert.equal(typeof s.stream, "function");
    const bad = { ...SDK_PARAMS, tool_choice: { type: "auto" } };
    // A malformed request rejects at the seam (never reaches the CLI).
    return assert.rejects(s.stream(bad).finalMessage(), /forced tool_choice/);
  });
});
