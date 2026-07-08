"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectHome } from "@/lib/project/tool-tabs";

/**
 * Showing Prep entry. Creates a project with kind:"showing-prep" anchored to an
 * address, immediately builds the packet (comps + subject + market snapshot), and
 * routes to the project. The address is required here (unlike New Listing) — the
 * packet is address-driven — but a bad/out-of-footprint address still builds an
 * address-only skeleton, never an error.
 */
export function ShowingPrepButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const subject = address.trim();
    if (!subject) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: subject, kind: "showing-prep", subject_address: subject }),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id?: string };
      if (!id) return;
      // Build the packet, then land on the project.
      await fetch(`/api/projects/${id}/showing-prep`, { method: "POST" }).catch(() => null);
      router.push(projectHome(id));
    } catch {
      // leave the form open so the user can retry
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-gulf-teal px-4 py-2 text-sm font-medium text-gulf-teal transition-opacity hover:opacity-90"
      >
        Showing prep
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void create();
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Showing address"
        aria-label="Showing address"
        autoFocus
        className="rounded-full border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-gulf-teal focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-medium text-[#04121b] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Building…" : "Build packet"}
      </button>
    </form>
  );
}
