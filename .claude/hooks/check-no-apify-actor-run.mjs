#!/usr/bin/env node
// PreToolUse hook (matcher: mcp__plugin_apify_apify__*). Money guard at the MCP
// edge — born from the 08/12/2026 Apify incident: a session was asked for
// SteadyAPI Reddit calls, found no Reddit credentials, reached for Apify (the
// PRODUCT's paid property gap-fill lane) as a research scraper without asking,
// and ran 11 actor calls in a 9-minute window. Measured after the fact from
// /v2/actor-runs + /v2/users/me/usage/monthly: $4.07, six of the eleven runs
// ABORTED and still charged $0.499 each, and the account's $60 monthly hard cap
// went over ($60.78) — which hard-disables ACTORS, STORAGE, PROXY, SCHEDULER and
// WEBHOOKS account-wide until the cycle resets 08/28/2026, taking the property
// gap-fill lane down with it.
//
// THE GUARD GAP THIS CLOSES, precisely. `check-no-paid-dispatch.mjs` and
// `check-no-new-paid-surface.mjs` are both wired on the **Bash** matcher only.
// An Apify actor call issued through the MCP plugin never touches a shell, so
// neither guard could see it. The existing paid-before-free guard also only ever
// asked "is this a NEW paid surface?" — Apify was already authenticated and
// already approved, just for a different purpose. An already-approved surface
// used for an out-of-scope purpose was, until now, completely unguarded.
//
// SCOPE — read this before trusting it (RULE 0.8: no partial reported as whole):
//   COVERS: the agent-initiated MCP path. That is exactly the path that failed.
//   DOES NOT COVER: Apify called from our own code — the Python ingest lane or
//     any TS caller hitting api.apify.com directly. Those spend real money and
//     this hook never sees them. Do not read a green hook as "Apify is safe."
//
// BLOCKS (anything that can start a billable actor run):
//   • call-actor
//   • apify--rag-web-browser   (a paid actor wearing a tool name)
// ALLOWS (free reads, docs, and anything protective):
//   • search-actors, fetch-actor-details, fetch-apify-docs, search-apify-docs
//   • get-actor-run, get-dataset-items, get-key-value-store-record
//   • abort-actor-run          (stopping a run must never be blocked)
//
// OVERRIDE (operator only, same env var the paid-dispatch guard uses):
//   OPERATOR_APPROVED_PAID_RUN=1
//
// Standing instruction from the incident: no paid call of any kind without
// asking the operator first, INCLUDING on surfaces already authenticated.

const BANNER = "=".repeat(72);

const SPENDS = new Set(["call-actor", "apify--rag-web-browser"]);

function block(tool, detail) {
  const msg = `\n${BANNER}\nBLOCKED — agent-initiated Apify actor run (paid)\n${BANNER}\n${detail}\n${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  if (process.env.OPERATOR_APPROVED_PAID_RUN === "1") process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // never break the session on a parse failure
  }

  const toolName = String(payload.tool_name || "");
  if (!toolName.startsWith("mcp__plugin_apify_apify__")) process.exit(0);

  const bare = toolName.slice("mcp__plugin_apify_apify__".length);
  if (!SPENDS.has(bare)) process.exit(0);

  block(
    bare,
    [
      `Tool: ${toolName}`,
      "",
      "This starts a BILLABLE Apify actor run. RULE 0.7a: start with what we have,",
      "move to paid — and RULE 1 puts a paid run at unknown volume in the ASK-FIRST",
      "bucket, not the autonomous one.",
      "",
      "Apify is scoped to ONE job: property gap-fill for a field we do not already",
      "hold. It is not a research scraper, not a search engine, and not a fallback",
      "for a free lane that is missing a credential. If you are here because",
      "something free was unavailable, the correct next step is to ASK THE OPERATOR",
      "for the credential — not to spend his money on the nearest authenticated",
      "surface.",
      "",
      "Before proposing any paid run, state these three things to him first:",
      "  1. which free rung you checked and what it returned (RULE 0.7a lane 1),",
      "  2. the expected number of actor calls and the per-call price,",
      "  3. the account headroom, read free from /v2/users/me/limits.",
      "",
      "If he approves, re-run with the explicit opt-in:",
      "  OPERATOR_APPROVED_PAID_RUN=1",
      "",
      "Read-only Apify calls are NOT blocked — account/usage/run/dataset GETs and",
      "the docs tools all pass, and abort-actor-run always passes.",
    ].join("\n"),
  );
});
