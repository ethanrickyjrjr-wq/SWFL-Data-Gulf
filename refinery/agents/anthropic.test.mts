import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.mts";
import { computeCostUsd, getAnthropic, logApiUsage } from "./anthropic.mts";

// `bun test` doesn't run `process.loadEnvFile()` (it's undefined in that
// runtime — a Bun gap, not project config), so `env.anthropicApiKey` is
// whatever was captured at module load, which is normally nothing under
// `bun test`. `env.anthropicApiKey` is a plain mutable snapshot property
// (unlike the `source` getter), so tests set it directly rather than
// `process.env.ANTHROPIC_API_KEY`, which `getRawClient()` never re-reads.
function withFakeApiKey<T>(fn: () => T): T {
  const prior = env.anthropicApiKey;
  env.anthropicApiKey = "test-key-not-real";
  try {
    return fn();
  } finally {
    env.anthropicApiKey = prior;
  }
}

describe("computeCostUsd()", () => {
  test("Sonnet 4.6, no cache — exact MTok math", () => {
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    assert.equal(cost, 3.0 + 15.0);
  });

  test("Opus 4.8 (EMAIL_MODEL_OPUS, reachable via email_build max/opus mode) — exact MTok math", () => {
    const cost = computeCostUsd("claude-opus-4-8", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    assert.equal(cost, 5.0 + 25.0);
  });

  test("Haiku 4.5, no cache — exact MTok math", () => {
    const cost = computeCostUsd("claude-haiku-4-5", {
      input_tokens: 500_000,
      output_tokens: 100_000,
    });
    assert.equal(cost, 0.5 + 0.5);
  });

  test("cache read = 10% of base input rate", () => {
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 0,
    });
    assert.equal(cost, 3.0 * 0.1);
  });

  test("cache write = 25% premium on input rate", () => {
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    });
    assert.equal(cost, 3.0 * 1.25);
  });

  test("unrecognized model — 0 cost, never invented", () => {
    const cost = computeCostUsd("claude-unknown-model", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    assert.equal(cost, 0);
  });

  test("null cache fields treated as zero", () => {
    const cost = computeCostUsd("claude-haiku-4-5", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    });
    assert.equal(cost, 0);
  });

  // Pre-4.6-generation models (Haiku 4.5, Sonnet 4.5, ...) are billed under a
  // bare alias (e.g. "claude-haiku-4-5") but the Claude API resolves that
  // alias to a dated snapshot for serving (verified live via crawl4ai
  // 07/01/2026 against platform.claude.com/docs/en/about-claude/models/
  // model-ids-and-versions: "these models also have shorter aliases ... that
  // point to the most recent dated snapshot"). The response `.model` field
  // reports the resolved snapshot, not the alias sent in the request — a
  // naive exact-string RATES lookup would silently price every Haiku call at
  // $0, since "claude-haiku-4-5-20251001" is not a RATES key. Sonnet 4.6+ is
  // unaffected: dateless IDs from the 4.6 generation on are pinned snapshots
  // in their own right, not aliases, so they echo back verbatim.
  test("dated snapshot of a pre-4.6 alias still prices correctly", () => {
    const cost = computeCostUsd("claude-haiku-4-5-20251001", {
      input_tokens: 500_000,
      output_tokens: 100_000,
    });
    assert.equal(cost, 0.5 + 0.5);
  });

  test("an unknown dated snapshot still returns 0, never invented", () => {
    const cost = computeCostUsd("claude-opus-4-9-20301231", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    assert.equal(cost, 0);
  });
});

describe("logApiUsage()", () => {
  test("missing supabase env — no-op, does not throw, does not return an error", async () => {
    await assert.doesNotReject(
      logApiUsage({
        model: "claude-haiku-4-5",
        callType: "other",
        usage: { input_tokens: 1, output_tokens: 1 },
        supabaseUrl: undefined,
        supabaseKey: undefined,
      }),
    );
  });

  test("SKIP_USAGE_LOG=1 — no-op even with valid env", async () => {
    process.env.SKIP_USAGE_LOG = "1";
    await assert.doesNotReject(
      logApiUsage({
        model: "claude-haiku-4-5",
        callType: "other",
        usage: { input_tokens: 1, output_tokens: 1 },
        supabaseUrl: "https://fake.supabase.co",
        supabaseKey: "fake-key",
      }),
    );
    delete process.env.SKIP_USAGE_LOG;
  });
});

describe("getAnthropic() — usage logging wrapper", () => {
  test(".create() response triggers a logApiUsage call with the right shape", () => {
    withFakeApiKey(() => {
      const client = getAnthropic("triage");
      assert.equal(typeof client.messages.create, "function");
      assert.equal(typeof client.messages.stream, "function");
      assert.notEqual(client.messages.create, Anthropic.prototype);
    });
  });

  test("same callType returns the same cached wrapped client", () => {
    withFakeApiKey(() => {
      const a = getAnthropic("synthesis");
      const b = getAnthropic("synthesis");
      assert.equal(a, b);
    });
  });

  test("different callTypes return different wrapped clients", () => {
    withFakeApiKey(() => {
      const a = getAnthropic("synthesis");
      const b = getAnthropic("triage");
      assert.notEqual(a, b);
    });
  });

  test("no-arg call defaults to callType 'other' — backward compatible", () => {
    withFakeApiKey(() => {
      const a = getAnthropic();
      const b = getAnthropic("other");
      assert.equal(a, b);
    });
  });
});
