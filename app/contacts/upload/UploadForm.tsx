"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Two-step upload: POST /api/email/contacts/upload (CSV → email_contacts, tagged
 * with the list name) then POST /api/email/contacts/sync (materialize the Resend
 * segment + email_audiences row) so the new list is immediately pickable in the
 * "Send weekly" handle. The list name is lowercased to match the audience-slug
 * contract (tags are normalized lowercase server-side).
 */

interface UploadResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors?: string[];
}

const SAMPLE = "email,name,tags\njane@example.com,Jane Buyer,\njohn@example.com,John Client,";

export function UploadForm({ backHref }: { backHref: string }) {
  const [csv, setCsv] = useState("");
  const [listName, setListName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [synced, setSynced] = useState(false);

  async function onFile(file: File) {
    setError(null);
    setCsv(await file.text());
  }

  async function submit() {
    setError(null);
    setResult(null);
    setSynced(false);
    const tag = listName.trim().toLowerCase();
    if (!csv.trim()) {
      setError("Paste or choose a CSV first (header row: email, name, tags).");
      return;
    }
    if (!tag) {
      setError("Give the list a name — it becomes the audience you send to.");
      return;
    }
    setBusy(true);
    try {
      const up = await fetch("/api/email/contacts/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, tags: [tag] }),
      });
      const upJson = (await up.json().catch(() => ({}))) as UploadResult & { error?: string };
      if (!up.ok) throw new Error(upJson.error || `upload failed (${up.status})`);
      setResult(upJson);

      // Materialize the audience (Resend segment + email_audiences row). Non-fatal:
      // the contacts are saved regardless; a sync failure just delays the audience
      // appearing (re-runnable), so we surface it without throwing away the upload.
      const sync = await fetch("/api/email/contacts/sync", { method: "POST" });
      setSynced(sync.ok);
      if (!sync.ok) {
        setError(
          "Contacts saved, but the audience list didn't finish building — try again shortly.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result && synced) {
    const total = result.inserted + result.updated;
    return (
      <div className="mt-6 rounded-xl border border-[#0a8078]/30 bg-[#0a8078]/10 p-4">
        <p className="text-sm text-[#0a8078]">
          ✓ Added {total} contact{total === 1 ? "" : "s"} to “{listName.trim().toLowerCase()}”
          {result.skipped > 0 ? ` (${result.skipped} skipped)` : ""}.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          It’s now a pickable audience on your reports’ Send weekly.
        </p>
        <Link
          href={backHref}
          className="mt-3 inline-block rounded-full bg-[#00d4aa] px-4 py-2 text-sm font-medium text-[#04121b]"
        >
          Back to your work
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        List name
        <input
          value={listName}
          onChange={(e) => setListName(e.target.value)}
          placeholder="e.g. buyers"
          className="rounded-lg border border-white/10 bg-[#0d1e2b] px-3 py-2 text-white outline-none focus:border-[#00d4aa]/40"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Contacts CSV
        <span className="text-xs text-gray-500">Header row required: email, name, tags</span>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={SAMPLE}
          rows={8}
          className="rounded-lg border border-white/10 bg-[#0d1e2b] px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#00d4aa]/40"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer text-xs text-[#00d4aa] underline underline-offset-2">
          Choose a .csv file
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {result && !synced && (
        <p className="text-xs text-gray-400">
          {result.inserted} added, {result.updated} updated, {result.skipped} skipped.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-full bg-[#00d4aa] px-5 py-2 text-sm font-semibold text-[#04121b] disabled:opacity-40"
        >
          {busy ? "Uploading…" : "Upload + create list"}
        </button>
        <Link
          href={backHref}
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-gray-300 hover:text-white"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
