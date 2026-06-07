# mcp-widget — PARKED (do not wire into `/api/mcp` yet)

This is the in-chat **MCP App "View"** for `swfl_fetch` — a branded card (logo +
Answer / Data / Speculation / web-links / freshness) meant to render in a
sandboxed iframe under the assistant message in claude.ai.

It is **intentionally not wired into the live MCP server.** `app/api/mcp/server.ts`
registers `swfl_fetch` as a **text-only** tool.

## Why parked (it's a host bug, not our code)

The wiring was verified spec-correct against `@modelcontextprotocol/ext-apps@1.7.2`
and the MCP Apps spec (2026-01-26):

- tool→resource binding `_meta.ui.resourceUri` ✓
- `RESOURCE_MIME_TYPE = "text/html;profile=mcp-app"` ✓
- data via `structuredContent` over `ui/notifications/tool-result` (event
  `"toolresult"`) ✓ — `outputSchema` is **not** required (SDK + spec)
- default sandbox CSP `script-src 'self' 'unsafe-inline'` → our inlined `<script>`
  is allowed; the `App` constructor sets zod `jitless` so no `unsafe-eval` needed ✓

Despite all of that, claude.ai (web **and** Desktop, **worst over remote HTTP** —
our transport on Vercel) renders it as a **blank, never-painted iframe**: the host
fetches the resource but leaves the container `visibility:hidden` and never sends
the `ui/initialize` handshake. This is an **open, unfixed host bug**, confirmed
host-side by the ext-apps maintainer across many spec-compliant servers, and it
works fine in Goose / MCP Inspector / native stdio:

- https://github.com/anthropics/claude-ai-mcp/issues/61
- https://github.com/anthropics/claude-ai-mcp/issues/165

Attaching the widget = one blank card on **every** call = "blank parts on the
screen for no reason." So we ship text-only; the branded charts live on the linked
`/r/{report_id}` report page (renders fine in a real browser).

## Re-enable (one commit) when #61/#165 close

1. `bun mcp-widget/build.mts` — rebuild `docs/fiverr-briefs/assets/Chat-Charts-Standalone.html`.
2. `next.config.ts` — restore the `outputFileTracingIncludes["/api/mcp"]` line that
   ships that bundle with the Vercel function.
3. `app/api/mcp/server.ts` — restore `registerAppTool` / `registerAppResource` /
   `RESOURCE_MIME_TYPE` + the `_meta.ui.resourceUri` on the tool + the
   `structuredContent: buildWidgetView(...)` on the result. (Git history at the
   commit that introduced this file has the exact wiring.)
4. Verify in MCP Inspector first, then deploy + reconnect and confirm it paints in
   claude.ai before calling it done.

## Files

- `src/widget.ts` — the View (reads `structuredContent`, renders the card).
- `build.mts` — `Bun.build` → IIFE, minified, inlined into one self-contained HTML.
