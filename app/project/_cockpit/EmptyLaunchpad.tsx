// app/project/_cockpit/EmptyLaunchpad.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { projectHome } from "@/lib/project/tool-tabs";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";

/**
 * Zero-projects hub (spec 2026-07-16 §6): one centered launchpad — the
 * address input is the hero, campaign starters second, contacts + examples
 * as "while you're here". The split cockpit takes over from project #1.
 */
export function EmptyLaunchpad({ contactsCount }: { contactsCount: number }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createListing(e: React.FormEvent) {
    e.preventDefault();
    const subject = address.trim();
    if (!subject || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: subject, kind: "listing", subject_address: subject }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (res.ok && data.id) router.push(projectHome(data.id));
      else setError("Couldn't create the project — please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-8">
      <h2 className="text-center text-lg font-semibold text-white">Start your first project</h2>

      <form
        onSubmit={(e) => void createListing(e)}
        className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 p-4"
      >
        <p className="text-sm font-semibold text-white">New listing</p>
        <p className="mt-0.5 text-xs text-gray-400">
          Type the address — we set everything up around it.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="2006 SW 15th Ave, Cape Coral…"
            aria-label="Listing address"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 placeholder:text-white/35 focus:border-gulf-teal focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !address.trim()}
            className="shrink-0 rounded-lg bg-gulf-teal px-4 py-2 text-sm font-semibold text-[#04121b] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Go"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </form>

      <div>
        <p className="mb-2 text-center text-xs text-gray-500">or start with a campaign</p>
        <CampaignQuickStart surface="all" variant="bare" />
      </div>

      <div className="rounded-xl border border-white/10 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          While you&apos;re here
        </p>
        <div className="mt-2 flex flex-col gap-1.5 text-sm">
          <Link href="/contacts" className="text-gray-200 hover:text-gulf-teal">
            👥{" "}
            {contactsCount === 0
              ? "Bring your contacts in first — Import →"
              : `Contacts — ${contactsCount} people · Manage →`}
          </Link>
          <Link href="/showcase" className="text-gray-200 hover:text-gulf-teal">
            ▤ See finished examples →
          </Link>
        </div>
      </div>
    </div>
  );
}
