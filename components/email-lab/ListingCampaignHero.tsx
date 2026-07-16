"use client";
// The gallery's showcase-of-them-all section (spec 2026-07-15-gallery-listing-hero-design.md).
// Always renders, never address-gated: it's the door that CAPTURES a listing address, not a
// pill that waits for one to already exist. Once a project has a subject address, the same
// section collapses to the existing armArc() CTA. Once the arc is armed, ArcStrip fully
// replaces this surface (see ProjectEmailLabClient) — this component never renders after that.
import { useState } from "react";
import { AddressPopup } from "@/components/lab-entry/AddressPopup";
import { createListingProjectAndEnter } from "@/lib/lab-entry/create-listing-project";
import { SHOWCASES } from "@/lib/showcase/registry";

const FILMSTRIP = (SHOWCASES.find((s) => s.id === "listing-to-close")?.slides ?? []).map((s) => ({
  image: s.image,
  title: s.title,
}));

export function ListingCampaignHero({
  subjectAddress,
  arming = false,
  onArm,
}: {
  subjectAddress: string | null;
  arming?: boolean;
  onArm?: () => void;
}) {
  const [addressOpen, setAddressOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddressSubmit(value: string) {
    setSubmitting(true);
    const ok = await createListingProjectAndEnter(value);
    // On success the page navigates away; only reset on failure so the button un-sticks.
    if (!ok) setSubmitting(false);
  }

  return (
    <section className="mb-10 rounded-2xl border border-gulf-teal/25 bg-gulf-teal/[0.04] p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-gulf-teal">
        Listing campaigns
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-white">From Teaser to Sold.</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
        One address in, five pieces out. You fire each one when you&rsquo;re ready, and every number
        is sourced — never invented.
      </p>
      <ul className="mt-3 max-w-2xl space-y-1.5 text-sm leading-relaxed text-white/60">
        <li className="flex gap-2.5">
          <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-gulf-teal/70" aria-hidden />
          <span>
            Real status changes on the listing — a price cut, back on the market — nudge you when
            it&rsquo;s time to send the next piece.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-gulf-teal/70" aria-hidden />
          <span>
            A real click on any piece alerts you directly — the moment a contact shows interest.
          </span>
        </li>
      </ul>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
        Need an open house invite or a private showing email? Just ask in the builder — it&rsquo;s
        one prompt away.
      </p>

      {FILMSTRIP.length > 0 && (
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {FILMSTRIP.map((f, i) => (
            <div key={f.title} className="min-w-[92px] flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- committed static capture */}
              <img
                src={f.image}
                alt={f.title}
                className="h-20 w-full rounded-lg border border-white/10 object-cover object-top"
                loading="lazy"
              />
              <p className="mt-1.5 text-center text-[11px] text-white/60">
                <span className="font-semibold text-gulf-teal/80">{i + 1}</span>
                <span className="mx-1 text-white/25">·</span>
                {f.title}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        {subjectAddress ? (
          <button
            type="button"
            disabled={arming}
            onClick={onArm}
            className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            {arming ? "Starting…" : `Start the listing campaign for ${subjectAddress}`}
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => setAddressOpen(true)}
            className="rounded-full bg-gulf-teal px-4 py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            {submitting ? "Setting up…" : "Get started"}
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] text-white/35">
        Social scheduling is coming soon — until then, we can build the same campaign as
        ready-to-post social creative you can share today.
      </p>

      {addressOpen && (
        <AddressPopup
          inputKind="address"
          initialValue=""
          onBuild={(value) => void handleAddressSubmit(value)}
          onCancel={() => setAddressOpen(false)}
        />
      )}
    </section>
  );
}
