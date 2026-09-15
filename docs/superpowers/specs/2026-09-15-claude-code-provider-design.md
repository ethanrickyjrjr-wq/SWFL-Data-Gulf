# Refinery model root on the claude.ai subscription (LLM_PROVIDER=claude-code)

**Date:** 2026-09-15

## Problem

The nightly chain's LLM legs 400 on "Your credit balance is too low to access the Anthropic API"
(run 34952735442) while the operator pays for a Max subscription. `refinery/agents/anthropic.mts`,
the one root every agent gets its client from, only knew the `@anthropic-ai/sdk` client, which
takes an API key and nothing else.

## Goal

Run every refinery agent call on the claude.ai subscription with zero API credit, selected by one
env var, without touching the agents or the spend/usage ledger.

## What we're building

`LLM_PROVIDER=claude-code` → `getAnthropic()` hands out a `messages` surface backed by
`refinery/agents/claude-code-provider.mts`, which runs `claude -p --output-format json
--json-schema <forced tool input_schema>` and returns the CLI's `structured_output` as the
`tool_use` block the agents already read. Failure modes and guards are in that file's header;
tests in `claude-code-provider.test.mts`; live proof `scripts/prove-claude-code-provider.mts`
(PASS 2026-09-15: Sonnet 4.6, 7.1 s, no API key). Check: `claude_code_provider_live_verify`.
