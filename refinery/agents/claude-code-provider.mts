/**
 * claude-code provider — the refinery's model calls on the claude.ai SUBSCRIPTION.
 *
 * 2026-09-15, operator: "Just run the rebuild through a sonnet. We have Max plan. Why
 * do we need API credits?" The answer was: because this factory's one model root
 * (`anthropic.mts`) only knew the `@anthropic-ai/sdk` client, which takes an API key
 * and nothing else. This file is the second backend behind that root: it shells out
 * to `claude -p` (Claude Code's documented non-interactive mode), which signs in with
 * the machine's claude.ai login and draws from the subscription's usage limits — zero
 * Console credit. Selected by `LLM_PROVIDER=claude-code` (refinery/config/env.mts).
 *
 * What it implements: the ONE request shape every refinery agent uses — a single
 * user message, a system prompt, one tool with an `input_schema`, and
 * `tool_choice: {type: "tool", name}`. `--json-schema` gives the CLI's structured
 * output, which comes back as `structured_output` on the JSON result and is handed to
 * the caller as a `tool_use` block, so synthesis-agent / triage-agent /
 * synthesize-corridor-character read it exactly as they read an SDK response.
 *
 * Failure modes, each with its guard (RULE 3.5):
 *  1. `--bare` kills the login ("a cloud session signs in with this machine's
 *     claude.ai login, which --bare turns off" — the CLI's own help text, and the
 *     first probe here failed with "Authentication error" for exactly that reason).
 *     → `buildArgs` never emits it; a test pins that.
 *  2. An exported ANTHROPIC_API_KEY makes `claude` bill the API instead of the
 *     subscription (idea-foundry-harness rule: "an exported key turns every
 *     subscription seat into billing"). → the child env strips it; a test pins that.
 *  3. A request shape this backend cannot serve (no forced tool, several messages,
 *     non-text content) must never be silently narrowed. → `toRequest` throws.
 *  4. The CLI answers but not with the schema (`is_error`, missing
 *     `structured_output`). → throws with the CLI's own `result` text, never an
 *     empty facts array.
 *  5. The ledger prices subscription tokens as API spend and trips the $25/day cap.
 *     → the returned message's `model` is `claude-code/<canonical>`, which
 *     `computeCostUsd` prices at 0 (unknown model → 0, tokens preserved).
 */
import { spawn } from "node:child_process";
import type Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_CODE_MODEL_PREFIX = "claude-code/";

/** The subset of MessageCreateParams this backend understands. */
export interface ForcedToolRequest {
  model: string;
  systemPrompt: string;
  userText: string;
  toolName: string;
  inputSchema: Record<string, unknown>;
}

interface SdkLikeParams {
  model?: unknown;
  system?: unknown;
  messages?: unknown;
  tools?: unknown;
  tool_choice?: unknown;
}

function textOf(content: unknown, what: string): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content.map((b) => {
      if (b && typeof b === "object" && (b as { type?: string }).type === "text") {
        return String((b as { text?: unknown }).text ?? "");
      }
      throw new Error(`claude-code provider: ${what} carries a non-text block; unsupported`);
    });
    return parts.join("\n\n");
  }
  throw new Error(`claude-code provider: ${what} is neither a string nor a block array`);
}

/** Narrow an SDK-shaped request to the forced-tool shape, or throw (guard 3). */
export function toRequest(params: unknown): ForcedToolRequest {
  const p = (params ?? {}) as SdkLikeParams;
  if (typeof p.model !== "string" || !p.model) {
    throw new Error("claude-code provider: request has no model");
  }
  const tc = p.tool_choice as { type?: string; name?: string } | undefined;
  if (!tc || tc.type !== "tool" || !tc.name) {
    throw new Error(
      "claude-code provider: only forced tool_choice {type:'tool', name} is supported",
    );
  }
  const tools = Array.isArray(p.tools) ? (p.tools as Array<{ name?: string; input_schema?: unknown }>) : [];
  const tool = tools.find((t) => t.name === tc.name);
  if (!tool || !tool.input_schema || typeof tool.input_schema !== "object") {
    throw new Error(`claude-code provider: forced tool '${tc.name}' has no input_schema`);
  }
  const messages = Array.isArray(p.messages) ? (p.messages as Array<{ role?: string; content?: unknown }>) : [];
  if (messages.length !== 1 || messages[0]?.role !== "user") {
    throw new Error("claude-code provider: exactly one user message is supported");
  }
  return {
    model: p.model,
    systemPrompt: p.system === undefined ? "" : textOf(p.system, "system prompt"),
    userText: textOf(messages[0].content, "user message"),
    toolName: tc.name,
    inputSchema: tool.input_schema as Record<string, unknown>,
  };
}

/** The exact argv handed to `claude`. Never `--bare` (guard 1). */
export function buildArgs(req: ForcedToolRequest): string[] {
  const args = [
    "-p",
    "--model",
    req.model,
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(req.inputSchema),
    "--tools",
    "",
    "--no-session-persistence",
  ];
  if (req.systemPrompt) args.push("--system-prompt", req.systemPrompt);
  return args;
}

/** Child env: the API key is removed so the subscription login is the only path (guard 2). */
export function childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...base };
  delete out.ANTHROPIC_API_KEY;
  delete out.ANTHROPIC_AUTH_TOKEN;
  return out;
}

interface CliModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  canonicalModel?: string;
}

interface CliResult {
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  modelUsage?: Record<string, CliModelUsage>;
  terminal_reason?: string;
}

/** Turn the CLI's JSON result into an SDK-shaped Message (guards 4 and 5). */
export function toMessage(raw: string, req: ForcedToolRequest): Anthropic.Message {
  let parsed: CliResult;
  try {
    parsed = JSON.parse(raw) as CliResult;
  } catch {
    throw new Error(`claude-code provider: CLI output is not JSON: ${raw.slice(0, 400)}`);
  }
  if (parsed.is_error) {
    throw new Error(`claude-code provider: CLI reported an error: ${String(parsed.result)}`);
  }
  if (parsed.structured_output === undefined || parsed.structured_output === null) {
    throw new Error(
      `claude-code provider: no structured_output (terminal_reason=${parsed.terminal_reason ?? "?"}): ${String(parsed.result).slice(0, 400)}`,
    );
  }
  // Usage: sum every model the turn touched (the CLI may route a small helper call
  // through Haiku); the reported model is the one that produced the most output.
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  let top: { model: string; out: number } = { model: req.model, out: -1 };
  for (const [id, u] of Object.entries(parsed.modelUsage ?? {})) {
    input += u.inputTokens ?? 0;
    output += u.outputTokens ?? 0;
    cacheRead += u.cacheReadInputTokens ?? 0;
    cacheWrite += u.cacheCreationInputTokens ?? 0;
    if ((u.outputTokens ?? 0) > top.out) top = { model: u.canonicalModel ?? id, out: u.outputTokens ?? 0 };
  }
  return {
    id: `claude-code-${Date.now()}`,
    type: "message",
    role: "assistant",
    model: `${CLAUDE_CODE_MODEL_PREFIX}${top.model}`,
    content: [
      {
        type: "tool_use",
        id: `toolu_claude_code_${Date.now()}`,
        name: req.toolName,
        input: parsed.structured_output,
      },
    ],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: {
      input_tokens: input,
      output_tokens: output,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: cacheWrite,
    },
  } as unknown as Anthropic.Message;
}

export interface RunOptions {
  timeoutMs?: number;
  bin?: string;
}

/** Run `claude -p` once. stdin carries the user text (argv has a length cap). */
export function runClaudeCode(req: ForcedToolRequest, opts: RunOptions = {}): Promise<Anthropic.Message> {
  const bin = opts.bin ?? process.env.CLAUDE_BIN ?? "claude";
  const args = buildArgs(req);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: childEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`claude-code provider: timed out after ${opts.timeoutMs} ms`));
        }, opts.timeoutMs)
      : null;
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`claude-code provider: could not start '${bin}': ${e.message}`));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        reject(new Error(`claude-code provider: '${bin}' exited ${code}: ${err.slice(0, 800)}`));
        return;
      }
      try {
        resolve(toMessage(out, req));
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(req.userText);
  });
}

/**
 * The `messages`-surface the model root wraps: `create` and `stream`, the two entry
 * points the refinery agents use. `stream()` returns the one thing its callers await,
 * `finalMessage()`; there is no token-level stream on this backend.
 */
export function makeClaudeCodeMessageSurface() {
  // async so a malformed request REJECTS (like the SDK's create) instead of throwing
  // synchronously out of stream() — callers await finalMessage(), not stream().
  const create = async (params: unknown, options?: { timeout?: number }) =>
    runClaudeCode(toRequest(params), { timeoutMs: options?.timeout });
  return {
    create,
    stream: (params: unknown, options?: { timeout?: number }) => {
      const pending = create(params, options);
      return { finalMessage: () => pending };
    },
  };
}
