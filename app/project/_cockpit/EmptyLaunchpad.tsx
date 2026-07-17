// app/project/_cockpit/EmptyLaunchpad.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { projectHome } from "@/lib/project/tool-tabs";
import { CampaignQuickStart } from "@/components/campaigns/CampaignQuickStart";
import { SHOWCASES } from "@/lib/showcase/registry";
import { recipeDestination, type ShowcaseRecipe } from "@/lib/lab-entry/destination";
import { ShowcaseCard } from "@/components/showcase/ShowcaseCard";
import { ShowcaseOverlay } from "@/components/showcase/ShowcaseOverlay";

/**
 * Zero-projects hub — the welcome (operator, 07/16/2026: show where things
 * live, how they work, and what finished looks like — quickly and simply).
 * Structure follows NN/g's empty-state guidelines (nngroup.com, "Designing
 * Empty States in Complex Applications"): say what will live here, teach in
 * context, give direct pathways to the key task, and offer safe exploration —
 * here a click-through of a real finished campaign (ShowcaseOverlay, the same
 * cards the AI panel and /showcase use). The split cockpit takes over from
 * project #1.
 */
export function EmptyLaunchpad({ contactsCount }: { contactsCount: number }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openShowcase, setOpenShowcase] = useState<string | null>(null);

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
      <div className="text-center">
        <h2 className="text-lg font-semibold text-white">Welcome — your projects live here</h2>
        <p className="mt-1 text-sm text-gray-400">
          Every listing or campaign you start gets a home: its emails, social posts, and schedules,
          all in one place.
        </p>
      </div>

      {/* Where things live — cues tied to the chrome that's already on screen. */}
      <ul className="flex flex-col gap-1.5 rounded-xl border border-white/10 px-4 py-3 text-xs text-gray-400">
        <li>
          <span className="font-semibold text-white/80">Left rail</span> — every project, one click
          away. It stays put on every page.
        </li>
        <li>
          <span className="font-semibold text-white/80">Pills on top</span> — Projects brings you
          back here; the rest are a project&apos;s tools: Email, Social, Watch, Overview.
        </li>
        <li>
          <span className="font-semibold text-white/80">Right panel</span> — the AI and your
          campaign starters, always top right.
        </li>
      </ul>

      <form
        onSubmit={(e) => void createListing(e)}
        className="rounded-xl border border-white/10 bg-[#0d1e2b]/80 p-4"
      >
        <p className="text-sm font-semibold text-white">Start with a listing</p>
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

      {/* Safe exploration — click through a real finished campaign before
          committing to anything (same cards the AI panel and /showcase use). */}
      <div>
        <p className="mb-2 text-center text-xs text-gray-500">
          see what a finished campaign looks like
        </p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SHOWCASES.slice(0, 2).map((s) => (
            <li key={s.id}>
              <ShowcaseCard showcase={s} onOpen={setOpenShowcase} />
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center text-xs">
        <Link href="/contacts" className="text-gray-300 hover:text-gulf-teal">
          👥{" "}
          {contactsCount === 0
            ? "Bring your contacts in first — Import →"
            : `Contacts — ${contactsCount} people · Manage →`}
        </Link>
      </p>

      {openShowcase && (
        <ShowcaseOverlay
          showcase={SHOWCASES.find((s) => s.id === openShowcase)!}
          onClose={() => setOpenShowcase(null)}
          onUseRecipe={(recipe: ShowcaseRecipe) => {
            setOpenShowcase(null);
            router.push(recipeDestination(recipe));
          }}
        />
      )}
    </div>
  );
}
