"use client";

import { useState } from "react";

const MCP_URL = "https://www.swfldatagulf.com/api/mcp";

const SNIPPET = JSON.stringify({ mcpServers: { "swfl-data-gulf": { url: MCP_URL } } }, null, 2);

/**
 * The public, keyless connect snippet. No tabbed client picker (unlike
 * ConnectMcpBlock's key-scoped version) — this endpoint takes no header at
 * all for read access, so one JSON block covers every client except
 * Windsurf, which is called out inline instead.
 */
export function ConnectSnippet() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-[#0d1e2b]/50 p-4">
      <p className="text-xs text-gray-400">
        Claude Desktop: Settings → Developer → Edit Config. Cursor:{" "}
        <code className="text-gray-300">~/.cursor/mcp.json</code>. Cline: MCP Servers icon →
        Configure → Edit JSON.
      </p>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-[#04121b] p-3 text-[11px] leading-relaxed text-gray-200">
        {SNIPPET}
      </pre>
      <p className="mt-1 text-[11px] text-gray-500">
        Windsurf uses <code className="text-gray-400">serverUrl</code> instead of{" "}
        <code className="text-gray-400">url</code> — same value, different key name.
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-full bg-gulf-teal px-4 py-1.5 text-xs font-medium text-[#04121b]"
      >
        {copied ? "Copied" : "Copy config"}
      </button>
    </div>
  );
}
