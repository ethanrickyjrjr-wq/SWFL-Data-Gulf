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
        One address in, five pieces out — teaser to close. The market case is already in our data:
        live inventory, comparable sales, the neighborhood&rsquo;s value trend. Every piece pulls
        those numbers fresh at build, so a Sold email built in October carries October&rsquo;s
        market — not launch week&rsquo;s.
      </p>
      <ul className="mt-3 max-w-2xl space-y-1.5 text-sm leading-relaxed text-white/60">
        <li className="flex gap-2.5">
          <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-gulf-teal/70" aria-hidden />
          <span>
            The campaign runs on the listing&rsquo;s real timeline. It goes live, it leaves the
            active market, the sale is recorded — each event prompts the next piece, and the comps
            email comes due two weeks after launch. You approve every send; nothing fires on its
            own.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-gulf-teal/70" aria-hidden />
          <span>
            The moment a contact clicks any piece, an alert lands in your inbox — you follow up on
            live interest, not a week-old report.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-gulf-teal/70" aria-hidden />
          <span>
            Nothing sends unseen. You review each piece exactly as it will land — send it now, or
            schedule it and that exact version delivers on time, every time.
          </span>
        </li>
      </ul>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
        A coming-soon isn&rsquo;t on the portals yet — and the one thing our data doesn&rsquo;t hold
        is the property&rsquo;s own story. Paste your description into the builder and it takes the
        campaign from there. Open house invite, private showing email — one prompt away.
      </p>

      {FILMSTRIP.length > 0 && (
        <div className="mt-5 flex items-start gap-3 overflow-x-auto pb-2">
          {FILMSTRIP.map((f, i) => (
            <figure key={f.title} className="min-w-[10.5rem] flex-1">
              <figcaption className="mb-1.5 text-center text-[11px] text-white/60">
                <span className="font-semibold text-gulf-teal/80">{i + 1}</span>
                <span className="mx-1 text-white/25">·</span>
                {f.title}
              </figcaption>
              {/* Full email, top to bottom — the committed capture at its natural aspect,
                  never cropped (operator, 07/16/2026: "full picture thumbnails"). */}
              {/* eslint-disable-next-line @next/next/no-img-element -- committed static capture */}
              <img
                src={f.image}
                alt={`${f.title} — the full email`}
                className="w-full rounded-lg border border-white/10"
                loading="lazy"
              />
            </figure>
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
