import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.mts";
import {
  computeCostUsd,
  flushApiUsageLogs,
  getAnthropic,
  logApiUsage,
  wrapBatchesSurface,
  wrapMessageSurface,
} from "./anthropic.mts";

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

describe("computeCostUsd() batch flag", () => {
  test("batch: true halves the full-rate total (all token classes)", () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    };
    const full = computeCostUsd("claude-sonnet-4-6", usage);
    const batch = computeCostUsd("claude-sonnet-4-6", usage, { batch: true });
    // full = 3 + 15 + 3*0.1 + 3*1.25 = 22.05 ; batch = exactly half (Batches API
    // bills 50% of standard on ALL usage — vendor docs, verified 07/10/2026)
    assert.equal(full, 22.05);
    assert.equal(batch, 11.025);
  });

  test("omitting opts is unchanged behavior", () => {
    const usage = { input_tokens: 2_000_000, output_tokens: 0 };
    assert.equal(computeCostUsd("claude-sonnet-4-6", usage), 6.0);
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

describe("flushApiUsageLogs()", () => {
  test("resolves immediately when nothing is pending", async () => {
    await flushApiUsageLogs();
  });

  // Check factuality_gate_flush_last_spend_row: the create hook logs usage
  // fire-and-forget, so a process that exits right after its last API call
  // (bun test — the factuality gate) races the final insert and can drop the
  // row. flush must not resolve while that insert is still in flight.
  test("blocks until the create hook's in-flight usage insert settles", async () => {
    const prior = {
      key: env.anthropicApiKey,
      url: env.supabaseUrl,
      sbKey: env.supabaseKey,
      fetch: globalThis.fetch,
      capOff: process.env.ANTHROPIC_SPEND_CAP_OFF,
      skipLog: process.env.SKIP_USAGE_LOG,
    };
    env.anthropicApiKey = "test-key-not-real";
    env.supabaseUrl = "https://fake.supabase.co";
    env.supabaseKey = "fake-key";
    process.env.ANTHROPIC_SPEND_CAP_OFF = "1"; // keep the spend gate's own queries off the stub
    delete process.env.SKIP_USAGE_LOG;
    let releaseInsert!: () => void;
    const insertGate = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    let inserts = 0;
    globalThis.fetch = (async () => {
      inserts++;
      await insertGate;
      return new Response("[]", { status: 201 });
    }) as typeof fetch;
    try {
      const fake = {
        create: async () => ({
          model: "claude-haiku-4-5",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        stream: () => {
          throw new Error("unused");
        },
      };
      const wrapped = wrapMessageSurface(fake as never, "factuality_ci") as unknown as typeof fake;
      await wrapped.create();

      let flushed = false;
      const flushP = flushApiUsageLogs().then(() => {
        flushed = true;
      });
      await Bun.sleep(20);
      assert.equal(inserts, 1); // the hook's insert went out and is in flight
      assert.equal(flushed, false); // flush is genuinely waiting on it
      releaseInsert();
      await flushP;
      assert.equal(flushed, true);
    } finally {
      env.anthropicApiKey = prior.key;
      env.supabaseUrl = prior.url;
      env.supabaseKey = prior.sbKey;
      globalThis.fetch = prior.fetch;
      if (prior.capOff === undefined) delete process.env.ANTHROPIC_SPEND_CAP_OFF;
      else process.env.ANTHROPIC_SPEND_CAP_OFF = prior.capOff;
      if (prior.skipLog !== undefined) process.env.SKIP_USAGE_LOG = prior.skipLog;
    }
  });
});

describe("wrapBatchesSurface()", () => {
  test("create runs; results yields every row untouched; retrieve forwards", async () => {
    const seen: string[] = [];
    async function* fakeResults() {
      yield {
        custom_id: "req-0",
        result: {
          type: "succeeded",
          message: {
            model: "claude-sonnet-4-6",
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      };
      yield { custom_id: "req-1", result: { type: "errored", error: { type: "api_error" } } };
    }
    const fake = {
      create: async (body: unknown) => {
        seen.push("create");
        return { id: "msgbatch_test", processing_status: "in_progress", body };
      },
      results: async (_id: string) => fakeResults(),
      retrieve: async (_id: string) => ({ id: "msgbatch_test", processing_status: "ended" }),
    };
    const wrapped = wrapBatchesSurface(fake as never, "narrative_bake") as unknown as typeof fake;
    const batch = (await wrapped.create({ requests: [] })) as { id: string };
    assert.equal(batch.id, "msgbatch_test");
    assert.ok(seen.includes("create"));
    // results: iterating must yield BOTH rows untouched (logging is fire-and-forget)
    const out: string[] = [];
    for await (const r of await wrapped.results("msgbatch_test")) {
      out.push((r as { custom_id: string }).custom_id);
    }
    assert.deepEqual(out, ["req-0", "req-1"]);
    // any other prop forwards straight through to the real surface
    const st = (await wrapped.retrieve("msgbatch_test")) as { processing_status: string };
    assert.equal(st.processing_status, "ended");
  });
});

describe("messages proxy exposes metered batches", () => {
  test("wrapMessageSurface intercepts .batches and memoizes the wrapper", () => {
    const fakeMessages = {
      create: async () => ({}),
      stream: () => ({
        finalMessage: async () => ({
          model: "m",
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      }),
      batches: {
        create: async () => ({}),
        results: async () => (async function* () {})(),
      },
    };
    const wrapped = wrapMessageSurface(fakeMessages as never, "narrative_bake") as unknown as {
      batches: unknown;
    };
    assert.notEqual(wrapped.batches, fakeMessages.batches); // wrapped, not passthrough
    assert.equal(wrapped.batches, wrapped.batches); // memoized — one wrapper per surface
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
