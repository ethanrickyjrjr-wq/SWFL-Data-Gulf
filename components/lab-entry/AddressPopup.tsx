"use client";
// components/lab-entry/AddressPopup.tsx
// Replaces the off-screen in-textarea [[blank]] with a centered one-field popup.
// Labeled by what the recipe needs (listing address vs area/ZIP). Spec §C.
//
// ONE ROOT for "a recipe needs something before it can build" (operator ruling
// 07/13/2026). This popup was built for the ARRIVAL door only — a recipe carried in
// from the homepage/showcase. The in-lab door (clicking a campaign card or an example
// in the rail) never got it: it silently wrote the prompt into the Build textarea at
// the top of a scrolling rail while you were scrolled down looking at the cards, so
// the click read as doing nothing. Both doors now land here.
//
// It also collects the brand fields the artifact will PRINT (your name, your
// brokerage, the CAN-SPAM address). Those used to be nagged for after the fact, in an
// amber panel, via a button that expanded a form below the fold. One box, one Build.
import { useState } from "react";
import { NEED_LABELS, type BrandNeed } from "@/lib/showcase/recipe";

export interface SavedLayoutOffer {
  /** The listing they built this grid for ("326 Shore Dr"). Null → we still offer it
   *  ("the layout you built last time"), because the GRID is what they recognize. */
  subjectLabel: string | null;
}

export interface AddressPopupProps {
  /** null = the prompt has no [[blank]], so there's no place to ask for — the box
   *  then exists only to collect the brand fields the email will print. */
  inputKind: "address" | "area" | null;
  initialValue: string;
  /** Brand fields the recipe needs that the brand blob doesn't have yet. A headshot
   *  is an upload, not a text field — callers filter it out; the Brand panel owns it. */
  gaps?: readonly BrandNeed[];
  /** THE ASK (operator, 07/13/2026): *"ASK THEM — WOULD YOU LIKE TO USE THE LAYOUT
   *  YOU CREATED FOR 123 STREET, OR WOULD YOU LIKE TO START FRESH."* Present iff they
   *  have a saved grid for this recipe. Absent → the popup is exactly what it was. */
  savedLayout?: SavedLayoutOffer | null;
  /** brandPatch carries only the gap fields they actually typed ({} when none).
   *  `useSavedLayout` is their answer to the ask (false when there was nothing to ask). */
  onBuild: (value: string, brandPatch: Record<string, string>, useSavedLayout: boolean) => void;
  onCancel: () => void;
}

export function AddressPopup({
  inputKind,
  initialValue,
  gaps = [],
  savedLayout = null,
  onBuild,
  onCancel,
}: AddressPopupProps) {
  const [value, setValue] = useState(initialValue);
  const [brandPatch, setBrandPatch] = useState<Record<string, string>>({});
  // Their own grid is the DEFAULT when they have one. They built it on purpose; the
  // whole point is that they are not made to start over every build.
  const [useSaved, setUseSaved] = useState(true);
  const label = inputKind === "address" ? "Listing address" : "Area or ZIP";
  const placeholder =
    inputKind === "address" ? "123 Palm Ave, Fort Myers FL 33901" : "Cape Coral or 33904";

  // Brand-only: never block the build on it (RULE 0.7 — a build is never refused).
  // We ASK, because the alternative is what shipped before: an email signed
  // "Company / Tagline" that nobody was ever given the chance to sign.
  const ready = inputKind ? value.trim().length > 0 : true;
  // The arrival door with the address already filled and the brand already known: the
  // ONLY reason this box is on screen is to ask which grid they want.
  const layoutOnly = !inputKind && gaps.length === 0 && Boolean(savedLayout);

  function build() {
    if (!ready) return;
    const patch = Object.fromEntries(Object.entries(brandPatch).filter(([, v]) => v.trim()));
    onBuild(value.trim(), patch, Boolean(savedLayout) && useSaved);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
        <h2 className="text-sm font-semibold text-white">
          {inputKind ? label : layoutOnly ? "Build it your way?" : "Sign this email"}
        </h2>
        <p className="mt-1 text-xs text-white/50">
          {inputKind === "address"
            ? "Which listing is this for?"
            : inputKind === "area"
              ? "Which area should the numbers cover?"
              : layoutOnly
                ? "You've built this one before — we can use that same grid."
                : "It goes out under your name — not a placeholder."}
        </p>
        {inputKind && (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) build();
            }}
            placeholder={placeholder}
            className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none"
          />
        )}

        {/* THE ASK. Their grid, or a clean one. Naming the listing they built it for
            is the whole trick — "the layout you built for 326 Shore Dr" is something
            they remember making; "your saved template" is not. */}
        {savedLayout && (
          <div className="mt-3 rounded-lg border border-gulf-teal/25 bg-gulf-teal/[0.06] p-3">
            <p className="text-[11px] font-medium text-gulf-teal">
              {savedLayout.subjectLabel
                ? `You built a layout for ${savedLayout.subjectLabel}.`
                : "You built your own layout last time."}
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {[
                {
                  on: true,
                  title: "Use that layout",
                  sub: "Same grid, same order, same style — rebuilt for this listing.",
                },
                {
                  on: false,
                  title: "Start fresh",
                  sub: "The standard layout for this email.",
                },
              ].map((opt) => (
                <label
                  key={String(opt.on)}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${
                    useSaved === opt.on
                      ? "border-gulf-teal/60 bg-gulf-teal/10"
                      : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <input
                    type="radio"
                    name="saved-layout"
                    checked={useSaved === opt.on}
                    onChange={() => setUseSaved(opt.on)}
                    className="mt-0.5 accent-gulf-teal"
                  />
                  <span>
                    <span className="block text-xs font-medium text-white/85">{opt.title}</span>
                    <span className="block text-[11px] leading-snug text-white/45">{opt.sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {gaps.length > 0 && (
          <div className="mt-3 rounded-lg border border-[#f59e0b]/25 bg-[#f59e0b]/[0.07] p-3">
            <p className="text-[11px] leading-relaxed text-[#fbbf24]">
              {`This email signs ${gaps.map((g) => NEED_LABELS[g]).join(", ")}. Type ${
                gaps.length === 1 ? "it" : "them"
              } once — we’ll remember.`}
            </p>
            <div className="mt-2.5 flex flex-col gap-2">
              {gaps.map((need, i) => (
                <input
                  key={need}
                  autoFocus={!inputKind && i === 0}
                  value={brandPatch[need] ?? ""}
                  onChange={(e) => setBrandPatch((b) => ({ ...b, [need]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && ready) build();
                  }}
                  placeholder={NEED_LABELS[need]}
                  aria-label={NEED_LABELS[need]}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 placeholder:text-white/30 focus:border-[#f59e0b] focus:outline-none"
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={!ready}
            onClick={build}
            className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            Build
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="py-1 text-xs text-white/40 hover:text-white/70"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
