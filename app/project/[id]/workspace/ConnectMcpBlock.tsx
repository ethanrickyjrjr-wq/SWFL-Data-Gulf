"use client";

import { useState } from "react";

type McpClient = "desktop" | "cursor" | "cline" | "windsurf" | "other";

const MCP_PILLS: { id: McpClient; label: string }[] = [
  { id: "desktop", label: "Claude Desktop" },
  { id: "cursor", label: "Cursor" },
  { id: "cline", label: "Cline" },
  { id: "windsurf", label: "Windsurf" },
  { id: "other", label: "Other" },
];

function buildSnippet(client: McpClient, key: string): string {
  const url = "https://www.swfldatagulf.com/api/mcp";
  switch (client) {
    case "windsurf":
      return JSON.stringify(
        { mcpServers: { "swfl-project": { serverUrl: url, headers: { "X-Project-Key": key } } } },
        null,
        2,
      );
    case "cline":
      return JSON.stringify(
        {
          mcpServers: {
            "swfl-project": {
              url,
              headers: { "X-Project-Key": key },
              disabled: false,
              autoApprove: [],
            },
          },
        },
        null,
        2,
      );
    case "other":
      return `Endpoint:  ${url}\nTransport: Streamable HTTP\nHeader:    X-Project-Key: ${key}`;
    default:
      return JSON.stringify(
        { mcpServers: { "swfl-project": { url, headers: { "X-Project-Key": key } } } },
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
 * Connect your AI — mint / regenerate / revoke the per-project capability key.
 *
 * Two render modes:
 *   • Panel mode (`onClose` provided) — flat content inside the pill popover, always
 *     fully expanded, × to close. `onKeyChange` fires when the key is minted/revoked
 *     so the parent pill can stay in sync.
 *   • Legacy static section (no `onClose`) — the collapsible card with 3 display states
 *     (open / collapsed / connected). Kept for any non-pill callers.
 */
export function ConnectMcpBlock({
  projectId,
  initialKey,
  dismissedCount,
  onDismiss,
  onClose,
  onKeyChange,
}: {
  projectId: string;
  initialKey: string | null;
  dismissedCount: number;
  onDismiss: () => void;
  onClose?: () => void;
  onKeyChange?: (key: string | null) => void;
}) {
  const [key, setKey] = useState<string | null>(initialKey);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<McpClient>("desktop");
  const [view, setView] = useState<"open" | "collapsed">(() =>
    dismissedCount >= 2 ? "collapsed" : "open",
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mcp-key`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as { mcp_key?: string } | null;
      if (res.ok && json?.mcp_key) {
        setKey(json.mcp_key);
        setDetailsOpen(true);
        onKeyChange?.(json.mcp_key);
      } else setError("Could not generate a key. Try again.");
    } catch {
      setError("Could not generate a key. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/mcp-key`, { method: "DELETE" });
      if (res.ok) {
        setKey(null);
        setConfirming(false);
        setDetailsOpen(false);
        onKeyChange?.(null);
      } else setError("Could not revoke the key. Try again.");
    } catch {
      setError("Could not revoke the key. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const snippet = key ? buildSnippet(client, key) : "";
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

  function selectClient(next: McpClient) {
    setClient(next);
    setCopied(false);
  }

  const snippetUi = (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1">
        {MCP_PILLS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => selectClient(p.id)}
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
        Key travels as a header only — never appears in chats or tool-call logs.
      </p>
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
            Disconnect this AI?
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
    </div>
  );

  // ── PANEL MODE (inside pill popover) ────────────────────────────────────────
  if (onClose) {
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            {key ? "✓ Connected to your AI" : "Connect your AI"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 text-lg leading-none text-gray-500 hover:text-gray-300"
          >
            ×
          </button>
        </div>

        {key ? (
          <>
            <p className="text-xs text-gray-500">Scoped to this project only.</p>
            <button
              type="button"
              onClick={() => setDetailsOpen((o) => !o)}
              className="mt-1 text-xs text-gray-400 hover:text-gray-200"
            >
              {detailsOpen ? "Hide details" : "Connection details"}
            </button>
            {detailsOpen && snippetUi}
          </>
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-500">
              Give your AI a key scoped to <span className="text-gray-300">this project only</span>{" "}
              — it can add items and trigger builds, but cannot read your other projects. Regenerate
              any time to revoke.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={mint}
              className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-medium text-[#04121b] disabled:opacity-40"
            >
              {busy ? "Generating…" : "Generate key"}
            </button>
          </>
        )}

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  // ── LEGACY STATIC SECTION ───────────────────────────────────────────────────
  const wrap = "mt-8 rounded-xl border border-white/10 bg-[#0d1e2b]/50 p-4";

  if (key) {
    return (
      <section className={wrap}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">✓ Connected to your AI</h2>
            <p className="mt-0.5 text-xs text-gray-500">Scoped to this project only.</p>
          </div>
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className="shrink-0 text-xs text-gray-400 hover:text-gray-200"
          >
            {detailsOpen ? "Hide" : "Connection details"}
          </button>
        </div>
        {detailsOpen && snippetUi}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </section>
    );
  }

  if (view === "collapsed") {
    return (
      <section className={wrap}>
        <button
          type="button"
          onClick={() => setView("open")}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm font-semibold text-white">Connect your AI</span>
          <span className="text-xs text-gray-500">Set up</span>
        </button>
      </section>
    );
  }

  return (
    <section className={wrap}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Connect your AI</h2>
          <p className="mt-1 text-xs text-gray-500">
            Give your AI a key scoped to <span className="text-gray-300">this project only</span> —
            it can add items and trigger builds, but cannot read your other projects. Regenerate any
            time to revoke.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onDismiss();
            setView("collapsed");
          }}
          aria-label="Dismiss"
          className="shrink-0 rounded-full px-2 text-lg leading-none text-gray-500 hover:text-gray-300"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={mint}
        className="mt-3 rounded-full bg-gulf-teal px-4 py-2 text-sm font-medium text-[#04121b] disabled:opacity-40"
      >
        {busy ? "Generating…" : "Generate key"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </section>
  );
}
