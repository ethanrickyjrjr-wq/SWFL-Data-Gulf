"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/auth/use-session";

type BoardSlug = "swfl_mls" | "nabor";

interface BoardStatus {
  slug: BoardSlug;
  label: string;
  live: boolean;
  connection: {
    id: string;
    status: "pending" | "active" | "error";
    last_synced_at: string | null;
    error_message: string | null;
    member_mls_id: string;
  } | null;
}

type Screen = "connect" | "preview" | "status";

interface Preview {
  listing_count: number;
  zips: string[];
}

export function MlsSettingsClient() {
  const session = useSession();

  const [boards, setBoards] = useState<BoardStatus[]>([]);
  const [screen, setScreen] = useState<Screen>("connect");
  const [selectedSlug, setSlug] = useState<BoardSlug>("swfl_mls");
  const [mlsId, setMlsId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [activeConn, setConn] = useState<BoardStatus["connection"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBoards = useCallback(async (): Promise<BoardStatus[] | null> => {
    if (!session?.authed) return null;
    const res = await fetch("/api/mls/status");
    if (!res.ok) return null;
    const { boards: data } = (await res.json()) as { boards: BoardStatus[] };
    return data;
  }, [session?.authed]);

  const applyBoards = useCallback((data: BoardStatus[]) => {
    setBoards(data);
    const active = data
      .flatMap((b) => (b.connection ? [b] : []))
      .find((b) => b.connection?.status === "active");
    if (active?.connection) {
      setConn(active.connection);
      setSlug(active.slug);
      setScreen("status");
    }
  }, []);

  const loadStatus = useCallback(async () => {
    const data = await fetchBoards();
    if (data) applyBoards(data);
  }, [fetchBoards, applyBoards]);

  useEffect(() => {
    fetchBoards().then((data) => {
      if (data) applyBoards(data);
    });
  }, [fetchBoards, applyBoards]);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mls/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board_slug: selectedSlug, member_mls_id: mlsId.trim() }),
      });
      const body = (await res.json()) as {
        preview: Preview | null;
        queued?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Connection failed");
        return;
      }
      if (body.queued) {
        setError("This board isn't live yet — we'll notify you when it's ready.");
        return;
      }
      setPreview(body.preview);
      setScreen("preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    await loadStatus();
    setScreen("status");
  }

  async function handleRefresh() {
    if (!activeConn) return;
    setLoading(true);
    setError(null);
    try {
      await fetch("/api/mls/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: activeConn.id }),
      });
      await loadStatus();
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!activeConn) return;
    setLoading(true);
    try {
      await fetch("/api/mls/disconnect", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: activeConn.id }),
      });
      setConn(null);
      setPreview(null);
      setMlsId("");
      setScreen("connect");
    } finally {
      setLoading(false);
    }
  }

  if (screen === "connect")
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Connect your MLS</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Board</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={selectedSlug}
              onChange={(e) => setSlug(e.target.value as BoardSlug)}
            >
              {boards.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.label}
                  {!b.live ? " (coming soon)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Your MLS ID — this is on your license
            </label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g. 123456789"
              value={mlsId}
              onChange={(e) => setMlsId(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            className="w-full bg-black text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={loading || !mlsId.trim()}
            onClick={handleConnect}
          >
            {loading ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    );

  if (screen === "preview" && preview)
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Confirm your data</h1>
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <p>
            We found <strong>{preview.listing_count}</strong> listings in your history.
          </p>
          {preview.zips.length > 0 && <p>Covering ZIPs: {preview.zips.join(", ")}</p>}
        </div>
        <div className="flex gap-3">
          <button
            className="flex-1 bg-black text-white rounded-md px-4 py-2 text-sm font-medium"
            onClick={handleConfirm}
          >
            Confirm
          </button>
          <button
            className="flex-1 border rounded-md px-4 py-2 text-sm"
            onClick={() => setScreen("connect")}
          >
            Back
          </button>
        </div>
      </div>
    );

  if (screen === "status" && activeConn)
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">MLS Connected</h1>
        <div className="rounded-lg border p-4 space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-medium">Board:</span>{" "}
            {boards.find((b) => b.slug === selectedSlug)?.label}
          </p>
          <p>
            <span className="font-medium">MLS ID:</span> {activeConn.member_mls_id}
          </p>
          <p>
            <span className="font-medium">Status:</span>{" "}
            <span className={activeConn.status === "error" ? "text-red-600" : "text-green-700"}>
              {activeConn.status}
            </span>
          </p>
          {activeConn.last_synced_at && (
            <p>
              <span className="font-medium">Last synced:</span>{" "}
              {new Date(activeConn.last_synced_at).toLocaleString()}
            </p>
          )}
          {activeConn.error_message && <p className="text-red-600">{activeConn.error_message}</p>}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            className="flex-1 border rounded-md px-4 py-2 text-sm disabled:opacity-50"
            disabled={loading}
            onClick={handleRefresh}
          >
            {loading ? "Syncing…" : "Refresh now"}
          </button>
          <button
            className="flex-1 border border-red-300 text-red-600 rounded-md px-4 py-2 text-sm disabled:opacity-50"
            disabled={loading}
            onClick={handleDisconnect}
          >
            Disconnect
          </button>
        </div>
      </div>
    );

  return <div className="text-sm text-gray-500">Loading…</div>;
}
