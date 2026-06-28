// scripts/lib/supabase-creds.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSupabaseCreds } from "./supabase-creds.mjs";

test("prefers TOML over env", () => {
  const r = resolveSupabaseCreds({
    tomlText: 'SUPABASE_URL = "https://toml.example/"\nSUPABASE_SERVICE_KEY = "tomlkey"',
    env: { SUPABASE_URL: "https://env.example", SUPABASE_SERVICE_KEY: "envkey" },
  });
  assert.deepEqual(r, { url: "https://toml.example", key: "tomlkey" }); // trailing slash trimmed
});

test("falls back to env when TOML absent (CI)", () => {
  const r = resolveSupabaseCreds({
    tomlText: "",
    env: { SUPABASE_URL: "https://env.example", SUPABASE_SERVICE_KEY: "envkey" },
  });
  assert.deepEqual(r, { url: "https://env.example", key: "envkey" });
});

test("accepts BRAINS_-prefixed env names", () => {
  const r = resolveSupabaseCreds({
    tomlText: "",
    env: { BRAINS_SUPABASE_URL: "https://b.example", BRAINS_SUPABASE_SERVICE_KEY: "bkey" },
  });
  assert.deepEqual(r, { url: "https://b.example", key: "bkey" });
});

test("returns null when neither present", () => {
  assert.equal(resolveSupabaseCreds({ tomlText: "", env: {} }), null);
});
