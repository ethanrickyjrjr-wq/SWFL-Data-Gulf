"use client";

import { useCallback, useEffect, useState } from "react";

type McpClient = "desktop" | "cursor" | "cline" | "windsurf" | "other";

const MCP_PILLS: { id: McpClient; label: string }[] = [
  { id: "desktop", label: "Claude Desktop" },
  { id: "cursor", label: "Cursor" },
  { id: "cline", label: "Cline" },
  { id: "windsurf", label: "Windsurf" },
  { id: "other", label: "Other" },
];

const URL = "https://www.swfldatagulf.com/api/mcp";
const HEADER = "X-Account-Key";

function buildSnippet(client: McpClient, token: string): string {
  switch (client) {
    case "windsurf":
      return JSON.stringify(
        { mcpServers: { swfl: { serverUrl: URL, headers: { [HEADER]: token } } } },
        null,
        2,
      );
    case "cline":
      return JSON.stringify(
        {
          mcpServers: {
            swfl: { url: URL, headers: { [HEADER]: token }, disabled: false, autoApprove: [] },
          },
        },
        null,
        2,
      );
    case "other":
      return `Endpoint:  ${URL}\nTransport: Streamable HTTP\nHeader:    ${HEADER}: ${token}`;
    default:
      return JSON.stringify(
        { mcpServers: { swfl: { type: "http", url: URL, headers: { [HEADER]: token } } } },
        null,
        2,
      );
  }
}

const CLIENT_INSTRUCTIONS: Record<McpClient, { instruction: string; note?: string }> = {
  desktop: {
    instruction: "Settings → Developer → Edit Config",
    note: "Paste into the JSON file, restart Claude Desktop.",
  },
  cursor: {
    instruction: "Edit ~/.cursor/mcp.json (global) or .cursor/mcp.json (project)",
    note: "Or: Cursor Settings → MCP → Add new server.",
  },
  cline: {
    instruction: "MCP Servers icon → Configure tab → Edit JSON",
    note: "CLI users: ~/.cline/mcp.json",
  },
  windsurf: {
    instruction: "Edit ~/.codeium/windsurf/mcp_config.json",
    note: "Windsurf uses serverUrl — not url. This snippet has the right key.",
  },
  other: {
    instruction: "Paste the endpoint and header into your client's MCP settings.",
  },
};

/**
 * Connect your AI (account-level) — mint / regenerate / revoke ONE token that
 * reaches every project you own. Configure your client once; pick a project by
 * name in conversation. Coexists with per-project keys (Connect panel on a
 * project page) for anyone who wants a single-project scope.
 */
export function McpSettingsClient() {
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<McpClient>("desktop");
  const [confirming, setConfirming] = useState(false);

  // Pure fetch — returns a result, never setStates itself. State is applied in the
  // effect's `.then` (the codebase's fetch-on-mount pattern, e.g. mls-settings-client),
  // which keeps setState out of the synchronous effect body.
  const load = useCallback(async (): Promise<{ token: string | null } | "unauthorized" | null> => {
    try {
      const res = await fetch("/api/account/mcp-token");
      if (res.ok) return (await res.json()) as { token: string | null };
      if (res.status === 401) return "unauthorized";
      return null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    load().then((r) => {
      if (r === "unauthorized") setError("Sign in to connect your AI.");
      else if (r) setToken(r.token);
      setLoaded(true);
    });
  }, [load]);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mcp-token", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { token?: string } | null;
      if (res.ok && json?.token) {
        setToken(json.token);
      } else if (res.status === 401) {
        setError("Sign in to connect your AI.");
      } else {
        setError("Could not generate a token. Try again.");
      }
    } catch {
      setError("Could not generate a token. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mcp-token", { method: "DELETE" });
      if (res.ok) {
        setToken(null);
        setConfirming(false);
      } else {
        setError("Could not revoke the token. Try again.");
      }
    } catch {
      setError("Could not revoke the token. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const snippet = token ? buildSnippet(client, token) : "";
  const { instruction, note } = CLIENT_INSTRUCTIONS[client];

  async function copy() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Connect your AI</h1>
        <p className="mt-1 text-sm text-gray-400">
          One connection reaches <span className="text-gray-200">every project you own</span>. Set
          this up once — then just tell your AI which project to file into, by name. No per-project
          setup.
        </p>
      </div>

      {!loaded ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : token ? (
        <>
          <p className="text-xs text-gray-500">
            ✓ Connected. Paste this into your MCP client, then restart it.
          </p>

          <div className="mt-1">
            <div className="flex flex-wrap gap-1">
              {MCP_PILLS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setClient(p.id);
                    setCopied(false);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    client === p.id
                      ? "bg-gulf-teal text-[#04121b]"
                      : "border border-white/10 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">
              <span className="text-gray-300">{instruction}</span>
              {note && <span className="ml-1 text-gray-500">— {note}</span>}
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-[#04121b] p-3 text-[11px] leading-relaxed text-gray-200">
              {snippet}
            </pre>
            <p className="mt-1 text-[11px] text-gray-500">
              The token travels as a header only — it never appears in chats or tool-call logs. It
              reaches your projects only; ambiguity always asks before writing.
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="rounded-full bg-gulf-teal px-4 py-1.5 text-xs font-medium text-[#04121b]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={mint}
              className="rounded-full border border-gulf-teal/40 px-4 py-1.5 text-xs font-medium text-gulf-teal disabled:opacity-40"
            >
              Regenerate (revokes old)
            </button>
            {confirming ? (
              <span className="flex items-center gap-2 text-xs text-gray-300">
                Disconnect all clients?
                <button
                  type="button"
                  disabled={busy}
                  onClick={revoke}
                  className="rounded-full border border-red-400/40 px-3 py-1.5 font-medium text-red-400 disabled:opacity-40"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-gray-400"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-red-400 disabled:opacity-40"
              >
                Disconnect
              </button>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={mint}
          className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-medium text-[#04121b] disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate connection"}
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
