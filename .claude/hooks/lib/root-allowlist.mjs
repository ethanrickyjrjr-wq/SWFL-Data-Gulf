// root-allowlist.mjs — Gate 19's rule table: which TOP-LEVEL tracked entries are legal.
// Born 08/19/2026 (folder-structure wave): the root had accreted 'GET DONE', 'GO-LIVE',
// 'SOCIAL BUILD' (spaces, status-named), stray crawl outputs (response.html,
// crawl4ai-email-out.md — RULE 0.4 violations sitting at root), dead fixtures
// (__snapshots__) and a duplicate archive (_archive vs docs/_archive). A one-time
// cleanup rots in weeks without a mechanical guard ("a rule only in a doc is not a
// rule"); this is the mechanism. PROJECT_MAP.md is the human-readable twin — update
// both in the same commit when a root entry is deliberately added.
//
// Scope: only NEWLY-ADDED tracked paths whose first segment is not on the list block.
// Existing entries never block (no retroactive churn). Escape: ALLOW_NEW_ROOT_ENTRY=1.

export const ROOT_ALLOWLIST = new Set([
  // app code
  "app",
  "components",
  "lib",
  "refinery",
  "ingest",
  "brains",
  "emails",
  "templates",
  "utils",
  "tools",
  "types",
  "supabase",
  "migrations",
  "scripts",
  "public",
  "content",
  "fixtures",
  "assets",
  "mcp-widget",
  "cloud-secrets",
  // operator surfaces
  "SESSION_LOG.md",
  "_ASSISTANT",
  "_RESEARCH",
  "_AUDIT_AND_ROADMAP",
  "_FABLE5",
  "docs",
  "verification",
  "reports",
  "PROJECT_MAP.md",
  "CLAUDE.md",
  "AGENTS.md",
  "THE-CONTRACT.md",
  "DELIVERABLES.md",
  "DELIVERABLE-ENGINE-BLUEPRINT.md",
  "ENGINE-HANDOFF.md",
  "SOURCED.md",
  // framework/tool contracts
  "middleware.ts",
  "middleware.test.ts",
  "instrumentation.ts",
  "instrumentation-client.ts",
  "sentry.edge.config.ts",
  "sentry.server.config.ts",
  "next.config.ts",
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "vercel.json",
  "pyproject.toml",
  "uv.lock",
  "eslint.config.mjs",
  "postcss.config.mjs",
  "playwright.config.ts",
  "vitest.config.ts",
  "vitest.shims.d.ts",
  "knip.jsonc",
  "skills-lock.json",
  "database.types.ts",
  "database-generated.types.ts",
  ".mcp.json",
  ".claude",
  ".github",
  ".gitignore",
  ".gitattributes",
  ".graphifyignore",
  ".prettierrc",
  ".prettierignore",
  ".npmrc",
  ".python-version",
  ".qmd",
  ".storybook",
  ".vscode",
  ".agents",
  ".env.example",
  "LICENSE",
  "README.md",
  "CONTRIBUTING.md",
]);

/** First path segment of a repo-relative path ("docs/x/y.md" → "docs"). */
function rootSegment(p) {
  return String(p).replace(/\\/g, "/").replace(/^\.\//, "").split("/")[0];
}

/**
 * Which newly-ADDED paths introduce a top-level entry not on the allowlist?
 * Returns unique offending root segments, sorted. Pure — takes the added-path list.
 */
export function newRootViolations(addedPaths, allowlist = ROOT_ALLOWLIST) {
  const bad = new Set();
  for (const p of addedPaths || []) {
    const seg = rootSegment(p);
    if (seg && !allowlist.has(seg)) bad.add(seg);
  }
  return [...bad].sort();
}
