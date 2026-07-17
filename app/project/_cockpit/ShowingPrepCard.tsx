// app/project/_cockpit/ShowingPrepCard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectHome } from "@/lib/project/tool-tabs";
import { SHOWING_PREP_INTRO_SHORT } from "@/lib/email/showing-prep-copy";

/**
 * Showing Prep — its own aside section, chrome lifted verbatim from the
 * "Start a campaign" section one block up (operator, 07/16/2026: the hub's
 * top-strip button row died; this card is Showing Prep's ONE home). Address
 * in → creates a kind:"showing-prep" project, builds the packet (comps +
 * subject + market snapshot), lands on the project. A bad/out-of-footprint
 * address still builds an address-only skeleton, never an error.
 */
export function ShowingPrepCard() {
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

  return (
    <section className="border-b border-white/8 px-4 pb-4 pt-4">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
        Showing prep
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="group w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-50"
        style={{ borderLeft: "3px solid var(--gulf-teal)" }}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white/90">Showing prep</span>
          <span className="shrink-0 text-xs font-semibold text-gulf-teal opacity-70 transition-opacity group-hover:opacity-100">
            {busy ? "Building…" : open ? "Cancel" : "Start →"}
          </span>
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-white/45">
          {SHOWING_PREP_INTRO_SHORT}
        </span>
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void create();
          }}
          className="mt-1.5 flex items-center gap-2"
        >
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Showing address"
            aria-label="Showing address"
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 placeholder:text-white/35 focus:border-gulf-teal focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-lg bg-gulf-teal px-3 py-2 text-xs font-semibold text-[#04121b] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Building…" : "Build packet"}
          </button>
        </form>
      )}
    </section>
  );
}
